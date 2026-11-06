import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../index.js';
import { pool } from '../db/pool.js';
import { authTokenConfig } from '../auth/auth.middleware.js';

const JWT_SECRET = 'nexus-health-test-jwt-secret-at-least-32-characters';
const originalJwtSecret = process.env.JWT_SECRET;
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';
const token = jwt.sign(
  { email: 'analyst@example.com', role: 'analyst' }, JWT_SECRET,
  { algorithm: 'HS256', subject: ANALYST_ID, issuer: authTokenConfig.issuer, audience: authTokenConfig.audience, expiresIn: '15m' }
);

describe('NEXUS SHIELD API', () => {
  beforeEach(() => { process.env.JWT_SECRET = JWT_SECRET; });
  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    vi.restoreAllMocks();
  });
  it('returns health data', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('nexus-shield-api');
  });

  it('returns an authenticated database-backed threat summary', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{
        total_incidents: 0,
        open_workflow: 0,
        critical: 0,
        mitigated: 0,
        active_alerts: 0,
        new_security_events: 0,
        critical_security_events: 0,
        updated_at: null
      }],
      rowCount: 1
    } as never);

    const response = await request(app)
      .get('/api/threats/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.is_demo).toBe(false);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.summary.critical).toBe(0);
    expect(response.body.summary).not.toHaveProperty('ai_score');
  });
});
