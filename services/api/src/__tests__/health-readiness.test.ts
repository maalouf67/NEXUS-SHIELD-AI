import express from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { healthRouter } from '../routes/health.js';
import { pool } from '../db/pool.js';

const JWT_SECRET = 'nexus-health-readiness-test-secret-at-least-32-characters';
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';

const ENV_KEYS = [
  'JWT_SECRET',
  'IPQS_API_KEY',
  'SEON_API_KEY',
  'ABUSEIPDB_API_KEY'
] as const;

type TrackedEnvKey = (typeof ENV_KEYS)[number];
const originalEnv = new Map<TrackedEnvKey, string | undefined>();

function createTestApp() {
  const app = express();
  app.use('/health', healthRouter);
  return app;
}

function analystToken() {
  const sessionId = '550e8400-e29b-41d4-a716-446655440002';
  registerTestAuthSession({
    sessionId,
    userId: ANALYST_ID,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: {
      id: ANALYST_ID,
      email: 'analyst@example.com',
      role: 'analyst'
    }
  });
  return jwt.sign(
    { jti: sessionId },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: ANALYST_ID,
      issuer: authTokenConfig.issuer,
      audience: authTokenConfig.audience,
      expiresIn: '15m'
    }
  );
}

describe('Health and readiness endpoints', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
    process.env.JWT_SECRET = JWT_SECRET;
    delete process.env.IPQS_API_KEY;
    delete process.env.SEON_API_KEY;
    delete process.env.ABUSEIPDB_API_KEY;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
    vi.restoreAllMocks();
  });

  it('keeps liveness public and does not expose dependency configuration', async () => {
    const response = await request(createTestApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('nexus-shield-api');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).not.toHaveProperty('dependencies');
  });

  it('requires a valid access token before checking readiness dependencies', async () => {
    const querySpy = vi.spyOn(pool, 'query');

    const response = await request(createTestApp()).get('/health/ready');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('reports database readiness and credential presence without disclosing secrets', async () => {
    process.env.IPQS_API_KEY = 'ipqs-test-secret-value';
    process.env.ABUSEIPDB_API_KEY = 'abuseipdb-test-secret-value';

    vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ connected_at: '2026-11-05T00:00:00.000Z' }],
      rowCount: 1
    } as never);

    const response = await request(createTestApp())
      .get('/health/ready')
      .set('Authorization', `Bearer ${analystToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.dependencies.database).toBe('ok');
    expect(response.body.dependencies.phone_provider_credentials).toEqual({
      ipqualityscore: true,
      seon: false
    });
    expect(response.body.dependencies.ip_reputation_provider_credentials).toEqual({
      abuseipdb: true
    });
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.text).not.toContain('ipqs-test-secret-value');
    expect(response.text).not.toContain('abuseipdb-test-secret-value');
  });

  it('fails readiness closed when PostgreSQL is unavailable without leaking the error', async () => {
    vi.spyOn(pool, 'query').mockRejectedValueOnce(
      new Error('private database host and connection details')
    );

    const response = await request(createTestApp())
      .get('/health/ready')
      .set('Authorization', `Bearer ${analystToken()}`);

    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
    expect(response.body.dependencies.database).toBe('unavailable');
    expect(response.text).not.toContain('private database host');
    expect(response.body).not.toHaveProperty('stack');
  });
});
