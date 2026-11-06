import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/pool.js', () => ({
  pool: { query: vi.fn() }
}));

import { pool } from '../db/pool.js';
import { threatsRouter } from './threats.js';
import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';

const SECRET = 'nexus-threats-test-secret-at-least-thirty-two-characters';
const ORIGINAL = process.env.JWT_SECRET;

function token(role: 'admin' | 'analyst' | 'viewer' = 'analyst') {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: { id: userId, email: 'analyst@example.test', role }
  });
  return jwt.sign(
    { jti: sessionId },
    SECRET,
    {
      algorithm: 'HS256',
      subject: userId,
      issuer: authTokenConfig.issuer,
      audience: authTokenConfig.audience,
      expiresIn: '15m'
    }
  );
}

function appForThreats() {
  const app = express();
  app.use('/api', threatsRouter);
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

describe('PostgreSQL-backed threat summary', () => {
  it('requires a valid authenticated user before reading aggregate incident data', async () => {
    const response = await request(appForThreats()).get('/api/threats/summary');
    expect(response.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns only database-derived counts and does not invent an AI score', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{
        total_incidents: 8,
        critical: 2,
        mitigated: 3,
        updated_at: new Date('2026-11-05T00:00:00.000Z')
      }],
      rowCount: 1
    } as never);

    const response = await request(appForThreats())
      .get('/api/threats/summary')
      .set('Authorization', `Bearer ${token('viewer')}`);

    expect(response.status).toBe(200);
    expect(response.body.is_demo).toBe(false);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.summary).toEqual({
      total_incidents: 8,
      critical: 2,
      mitigated: 3,
      ai_score: null,
      updated_at: '2026-11-05T00:00:00.000Z'
    });
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain('FROM incidents');
  });

  it('returns 503 without leaking SQL errors when PostgreSQL is unavailable', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('database password or SQL detail'));

    const response = await request(appForThreats())
      .get('/api/threats/summary')
      .set('Authorization', `Bearer ${token()}`);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('THREAT_SUMMARY_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('database password');
  });
});
