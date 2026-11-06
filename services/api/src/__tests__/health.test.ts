import jwt from 'jsonwebtoken';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

const TEST_SECRET = 'nexus-health-test-secret-value-at-least-32';
const originalSecret = process.env.JWT_SECRET;

function token() {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const sessionId = '550e8400-e29b-41d4-a716-446655440001';
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: {
      id: userId,
      email: 'analyst@example.test',
      role: 'analyst'
    }
  });
  return jwt.sign(
    { jti: sessionId },
    TEST_SECRET,
    {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'nexus-shield-ai',
      audience: 'nexus-shield-ai-api',
      expiresIn: '15m'
    }
  );
}

describe('NEXUS SHIELD API', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('returns health data', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('nexus-shield-api');
  });

  it.skipIf(!process.env.DATABASE_URL)('returns the PostgreSQL-backed threat summary', async () => {
    const response = await request(app).get('/api/threats/summary')
      .set('Authorization', 'Bearer ' + token());

    expect(response.status).toBe(200);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.summary.critical).toBeGreaterThanOrEqual(0);
  });
});
