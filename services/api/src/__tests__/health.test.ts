import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

const TEST_SECRET = 'nexus-health-test-secret-value-at-least-32';
const TEST_USER_ID = randomUUID();
const TEST_WORKSPACE_ID = randomUUID();
const originalSecret = process.env.JWT_SECRET;

function token() {
  const userId = TEST_USER_ID;
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
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [TEST_USER_ID, `health-ci-${TEST_USER_ID}@example.test`]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)',
      [TEST_WORKSPACE_ID, 'Health CI workspace', `health-ci-${TEST_WORKSPACE_ID.slice(0, 8)}`, TEST_USER_ID]
    );
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role, status, created_by_user_id)
       VALUES ($1, $2, 'analyst', 'active', $2)`,
      [TEST_WORKSPACE_ID, TEST_USER_ID]
    );
  });

  afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    await pool.query('DELETE FROM workspaces WHERE id = $1', [TEST_WORKSPACE_ID]);
    await pool.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
    await pool.end();
  });

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
      .set('Authorization', 'Bearer ' + token())
      .set('X-NEXUS-WORKSPACE-ID', TEST_WORKSPACE_ID);

    expect(response.status).toBe(200);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.summary.critical).toBeGreaterThanOrEqual(0);
  });
});
