import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/pool.js', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../db/pool.js';
import { createThreatIntelligenceRouter } from './threat-intelligence.js';
import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';

const SECRET = 'nexus-threat-intelligence-test-secret-at-least-thirty-two';
const ORIGINAL = process.env.JWT_SECRET;
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440099';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440088';

function token(role: 'admin' | 'analyst' | 'viewer' = 'analyst') {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: { id: userId, email: 'analyst@example.test', role }
  });
  return jwt.sign({ jti: sessionId }, SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience,
    expiresIn: '15m'
  });
}

const workspaceAccess: RequestHandler = (req, _res, next) => {
  req.workspaceContext = {
    id: WORKSPACE_ID,
    name: 'Test workspace',
    slug: 'test-workspace',
    role: req.authUser?.role ?? 'viewer'
  };
  next();
};

function appForRouter() {
  const app = express();
  app.use(express.json());
  app.use('/api', createThreatIntelligenceRouter(workspaceAccess));
  return app;
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  vi.mocked(pool.query).mockReset();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL;
});

describe('workspace-scoped threat intelligence API', () => {
  it('requires authentication before reading analytics', async () => {
    const response = await request(appForRouter()).get('/api/threat-intelligence/overview');
    expect(response.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns PostgreSQL-backed overview metrics scoped to the selected workspace', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ active_indicators: 4, assessments_24h: 3, anomalies_24h: 1, open_warnings: 2, events_24h: 12 }],
      rowCount: 1
    } as never);
    const response = await request(appForRouter())
      .get('/api/threat-intelligence/overview')
      .set('Authorization', `Bearer ${token('viewer')}`);

    expect(response.status).toBe(200);
    expect(response.body.metrics).toEqual({
      active_indicators: 4, assessments_24h: 3, anomalies_24h: 1, open_warnings: 2, events_24h: 12
    });
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([WORKSPACE_ID]);
    expect(response.body.trained_model_active).toBe(false);
  });

  it('prevents viewers from creating risk assessments', async () => {
    const response = await request(appForRouter())
      .post(`/api/threat-intelligence/events/${EVENT_ID}/assess`)
      .set('Authorization', `Bearer ${token('viewer')}`);

    expect(response.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the event does not belong to the selected workspace', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const response = await request(appForRouter())
      .post(`/api/threat-intelligence/events/${EVENT_ID}/assess`)
      .set('Authorization', `Bearer ${token('analyst')}`);

    expect(response.status).toBe(404);
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([WORKSPACE_ID, EVENT_ID]);
  });

  it('persists an evidence-backed baseline assessment and records a velocity anomaly', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ id: EVENT_ID, event_type: 'login_failure', severity: 'high', observed_at: new Date('2026-11-09T10:00:00Z') }],
        rowCount: 1
      } as never)
      .mockResolvedValueOnce({ rows: [{ event_count: 6 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const response = await request(appForRouter())
      .post(`/api/threat-intelligence/events/${EVENT_ID}/assess`)
      .set('Authorization', `Bearer ${token('analyst')}`);

    expect(response.status).toBe(201);
    expect(response.body.assessment.risk_score).toBe(55);
    expect(response.body.anomaly_recorded).toBe(true);
    expect(response.body.trained_model_used).toBe(false);
    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(vi.mocked(pool.query).mock.calls[2][1][1]).toBe(WORKSPACE_ID);
    expect(vi.mocked(pool.query).mock.calls[3][1][1]).toBe(WORKSPACE_ID);
  });

  it('does not expose SQL errors when the database is unavailable', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('sensitive SQL or connection details'));
    const response = await request(appForRouter())
      .get('/api/threat-intelligence/overview')
      .set('Authorization', `Bearer ${token()}`);

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('sensitive SQL');
  });
});
