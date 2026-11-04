import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { app } from '../index.js';
import { pool } from '../db/pool.js';
import { authTokenConfig } from '../auth/auth.middleware.js';

const serviceToken = 'nexus-threat-test-service-token'.padEnd(48, 'x');
const originalKey = process.env.OPENAI_API_KEY;
const originalServiceToken = process.env.NEXUS_SERVICE_API_TOKEN;
const JWT_SECRET = 'nexus-threat-summary-test-jwt-secret-at-least-32';
const originalJwtSecret = process.env.JWT_SECRET;
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';

function userToken() {
  return jwt.sign(
    { email: 'analyst@example.com', role: 'analyst' }, JWT_SECRET,
    { algorithm: 'HS256', subject: ANALYST_ID, issuer: authTokenConfig.issuer, audience: authTokenConfig.audience, expiresIn: '15m' }
  );
}

describe('Threat analysis API', () => {
  beforeEach(() => {
    process.env.NEXUS_SERVICE_API_TOKEN = serviceToken;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }

    if (originalServiceToken === undefined) {
      delete process.env.NEXUS_SERVICE_API_TOKEN;
    } else {
      process.env.NEXUS_SERVICE_API_TOKEN = originalServiceToken;
    }
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    vi.restoreAllMocks();
  });

  it('requires a service token before accepting AI requests', async () => {
    delete process.env.NEXUS_SERVICE_API_TOKEN;

    const response = await request(app)
      .post('/api/threats/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('SERVICE_AUTH_NOT_CONFIGURED');
  });

  it('rejects requests without a valid bearer token', async () => {
    const response = await request(app)
      .post('/api/threats/analyze')
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('rejects invalid input', async () => {
    const response = await request(app)
      .post('/api/threats/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ target: '', source: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 503 when OpenAI is not configured', async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await request(app)
      .post('/api/threats/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('AI_NOT_CONFIGURED');
  });
  it('returns database-backed threat counts without a synthetic AI score', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{
        total_incidents: 9,
        open_workflow: 4,
        critical: 2,
        mitigated: 3,
        active_alerts: 5,
        new_security_events: 7,
        critical_security_events: 1,
        updated_at: new Date('2026-11-03T04:00:00.000Z')
      }],
      rowCount: 1
    } as never);

    const response = await request(app)
      .get('/api/threats/summary')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.is_demo).toBe(false);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.summary).toMatchObject({
      total_incidents: 9,
      open_workflow: 4,
      critical: 2,
      mitigated: 3,
      active_alerts: 5,
      new_security_events: 7,
      critical_security_events: 1
    });
    expect(response.body.summary).not.toHaveProperty('ai_score');
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('MAX(created_at) FROM incidents');
    expect(sql).not.toContain('MAX(updated_at) FROM incidents');
  });

  it('requires an authenticated user for the live threat summary', async () => {
    const response = await request(app).get('/api/threats/summary');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });

});
