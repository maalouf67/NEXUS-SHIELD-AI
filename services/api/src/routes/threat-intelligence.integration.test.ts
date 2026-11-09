import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pool } from '../db/pool.js';
import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createThreatIntelligenceRouter } from './threat-intelligence.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION_TESTS === 'true';
const secret = 'nexus-threat-intel-db-integration-secret-32chars';
const originalSecret = process.env.JWT_SECRET;
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const userId = randomUUID();
const eventIds = Array.from({ length: 7 }, () => randomUUID());

function token() {
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: { id: userId, email: 'integration@example.test', role: 'analyst' }
  });
  return jwt.sign({ jti: sessionId }, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience,
    expiresIn: '15m'
  });
}

function appForWorkspace(workspaceId: string) {
  const requireWorkspace: RequestHandler = (req, _res, next) => {
    req.workspaceContext = {
      id: workspaceId,
      name: 'Integration workspace',
      slug: 'integration-workspace',
      role: 'analyst'
    };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api', createThreatIntelligenceRouter(requireWorkspace));
  return app;
}

const integrationSuite = describe.skipIf(!enabled)('PostgreSQL threat intelligence integration', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    await pool.query(
      `INSERT INTO workspaces (id, name, slug)
       VALUES ($1, 'Threat Intel CI A', $2), ($3, 'Threat Intel CI B', $4)`,
      [workspaceA, `threat-intel-ci-${workspaceA}`, workspaceB, `threat-intel-ci-${workspaceB}`]
    );

    const observedAt = new Date();
    for (let index = 0; index < 6; index += 1) {
      await pool.query(
        `INSERT INTO security_events
           (id, source, external_event_id, event_type, severity, observed_at, summary, workspace_id)
         VALUES ($1, 'ci-threat-intel', $2, 'login_failure', 'high', $3, 'CI test event', $4)`,
        [eventIds[index], `a-${eventIds[index]}`, new Date(observedAt.getTime() - index * 60_000), workspaceA]
      );
    }
    await pool.query(
      `INSERT INTO security_events
         (id, source, external_event_id, event_type, severity, observed_at, summary, workspace_id)
       VALUES ($1, 'ci-threat-intel', $2, 'login_failure', 'critical', $3, 'Other workspace event', $4)`,
      [eventIds[6], `b-${eventIds[6]}`, observedAt, workspaceB]
    );
  });

  afterAll(async () => {
    const workspaceIds = [workspaceA, workspaceB];
    try {
      await pool.query('DELETE FROM threat_early_warnings WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM threat_attack_correlation_events WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM threat_attack_correlations WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM threat_anomaly_findings WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM threat_risk_assessments WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM threat_indicators WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM security_events WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [workspaceIds]);
    } finally {
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
    }
  });

  it('persists an assessment and anomaly to PostgreSQL using the active workspace only', async () => {
    const response = await request(appForWorkspace(workspaceA))
      .post(`/api/threat-intelligence/events/${eventIds[0]}/assess`)
      .set('Authorization', `Bearer ${token()}`);

    expect(response.status).toBe(201);
    expect(response.body.assessment.risk_score).toBe(55);
    expect(response.body.anomaly_recorded).toBe(true);

    const persisted = await pool.query(
      `SELECT a.risk_score, a.workspace_id,
              (SELECT COUNT(*)::int FROM threat_anomaly_findings f
                WHERE f.workspace_id = a.workspace_id AND f.security_event_id = a.security_event_id) AS anomaly_count
         FROM threat_risk_assessments a
        WHERE a.id = $1 AND a.workspace_id = $2`,
      [response.body.assessment.id, workspaceA]
    );
    expect(persisted.rows).toHaveLength(1);
    expect(Number(persisted.rows[0].risk_score)).toBe(55);
    expect(persisted.rows[0].workspace_id).toBe(workspaceA);
    expect(persisted.rows[0].anomaly_count).toBe(1);
  });

  it('does not reveal or assess an event owned by another workspace', async () => {
    const response = await request(appForWorkspace(workspaceA))
      .post(`/api/threat-intelligence/events/${eventIds[6]}/assess`)
      .set('Authorization', `Bearer ${token()}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('SECURITY_EVENT_NOT_FOUND');
  });
});

void integrationSuite;
