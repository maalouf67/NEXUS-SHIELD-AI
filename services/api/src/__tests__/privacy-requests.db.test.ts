import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';
import { pool } from '../db/pool.js';
import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';
const secret = process.env.JWT_SECRET ?? 'privacy-request-integration-secret-at-least-32-bytes';
process.env.JWT_SECRET = secret;

describe.skipIf(!enabled)('Privacy request API PostgreSQL ownership integration', () => {
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const adminId = randomUUID();
  const ownerSessionId = randomUUID();
  const otherSessionId = randomUUID();
  const adminSessionId = randomUUID();

  function bearer(userId: string, sessionId: string) {
    registerTestAuthSession({
      sessionId,
      userId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      testIdentity: {
        id: userId,
        email: `${userId}@privacy-ci.example.test`,
        role: userId === adminId ? 'admin' : 'analyst'
      }
    });
    return jwt.sign({ jti: sessionId }, secret, {
      algorithm: 'HS256',
      subject: userId,
      issuer: authTokenConfig.issuer,
      audience: authTokenConfig.audience,
      expiresIn: '5m'
    });
  }

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, otherId, adminId]]);
  });

  it('isolates personal request history and restricts the review queue to admins', async () => {
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE),
              ($3, $4, 'analyst', NULL, TRUE),
              ($5, $6, 'admin', NULL, TRUE)`,
      [
        ownerId, `privacy-owner-${ownerId}@example.test`,
        otherId, `privacy-other-${otherId}@example.test`,
        adminId, `privacy-admin-${adminId}@example.test`
      ]
    );

    const ownerToken = bearer(ownerId, ownerSessionId);
    const otherToken = bearer(otherId, otherSessionId);
    const adminToken = bearer(adminId, adminSessionId);

    const submitted = await request(app)
      .post('/api/privacy/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ request_type: 'access', scope_categories: ['account'] });

    expect(submitted.status).toBe(201);
    expect(submitted.body.request.status).toBe('received');

    const ownerHistory = await request(app)
      .get('/api/privacy/requests')
      .set('Authorization', `Bearer ${ownerToken}`);
    const otherHistory = await request(app)
      .get('/api/privacy/requests')
      .set('Authorization', `Bearer ${otherToken}`);
    const ownerDetail = await request(app)
      .get(`/api/privacy/requests/${submitted.body.request.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const otherDetail = await request(app)
      .get(`/api/privacy/requests/${submitted.body.request.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    const otherWithdraw = await request(app)
      .post(`/api/privacy/requests/${submitted.body.request.id}/withdraw`)
      .set('Authorization', `Bearer ${otherToken}`);
    const ownerWithdraw = await request(app)
      .post(`/api/privacy/requests/${submitted.body.request.id}/withdraw`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const forbiddenQueue = await request(app)
      .get('/api/admin/privacy/requests')
      .set('Authorization', `Bearer ${otherToken}`);
    const adminQueue = await request(app)
      .get('/api/admin/privacy/requests')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(ownerHistory.status).toBe(200);
    expect(ownerHistory.body.requests.map((item: { id: string }) => item.id)).toContain(submitted.body.request.id);
    expect(otherHistory.status).toBe(200);
    expect(otherHistory.body.requests).toHaveLength(0);
    expect(ownerDetail.status).toBe(200);
    expect(ownerDetail.body.events.map((event: { event_code: string }) => event.event_code)).toContain('request_submitted');
    expect(otherDetail.status).toBe(404);
    expect(otherWithdraw.status).toBe(404);
    expect(ownerWithdraw.status).toBe(200);
    expect(ownerWithdraw.body.request.status).toBe('withdrawn');
    await expect(pool.query(
      "UPDATE privacy_request_events SET reason_code = 'tamper_attempt' WHERE request_id = $1",
      [submitted.body.request.id]
    )).rejects.toThrow('append-only');
    await expect(pool.query(
      "DELETE FROM privacy_request_events WHERE request_id = $1",
      [submitted.body.request.id]
    )).rejects.toThrow('append-only');
    expect(forbiddenQueue.status).toBe(403);
    expect(adminQueue.status).toBe(200);
    expect(adminQueue.body.requests.some((item: { id: string }) => item.id === submitted.body.request.id)).toBe(true);
  });
});
