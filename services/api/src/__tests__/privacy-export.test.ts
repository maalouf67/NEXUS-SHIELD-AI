import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { mockPoolConnect } = vi.hoisted(() => ({ mockPoolConnect: vi.fn() }));
vi.mock('../db/pool.js', () => ({ pool: { connect: mockPoolConnect } }));

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createPrivacyRequestsRouter } from '../privacy/privacy-requests.routes.js';

const SECRET = 'nexus-privacy-export-test-secret-at-least-32-characters';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440101';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440102';
const originalSecret = process.env.JWT_SECRET;

function authToken() {
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId: SUBJECT_ID,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: { id: SUBJECT_ID, email: 'subject@example.test', role: 'viewer' }
  });
  return jwt.sign({ jti: sessionId }, SECRET, {
    algorithm: 'HS256',
    subject: SUBJECT_ID,
    issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience,
    expiresIn: '15m'
  });
}

function createApp() {
  const app = express();
  app.use('/api', createPrivacyRequestsRouter());
  return app;
}

describe('Privacy subject export', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    mockPoolConnect.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('exports only verified, subject-owned allowlisted data and marks global records as excluded', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, request_type, status')) {
        return { rowCount: 1, rows: [{
          id: REQUEST_ID,
          request_type: 'access',
          status: 'processing',
          scope_categories: ['account', 'authentication', 'malware_scans', 'assets'],
          verified_at: new Date()
        }] };
      }
      if (sql.includes('SELECT id, email, role, is_active, created_at')) {
        return { rowCount: 1, rows: [{ id: SUBJECT_ID, email: 'subject@example.test', role: 'viewer', is_active: true, created_at: new Date() }] };
      }
      if (sql.includes('SELECT created_at, expires_at, revoked_at')) {
        return { rowCount: 1, rows: [{ created_at: new Date(), expires_at: new Date(), revoked_at: null, revocation_reason: null }] };
      }
      if (sql.includes('SELECT s.sha256, s.size_bytes')) {
        return { rowCount: 1, rows: [{ sha256: 'a'.repeat(64), size_bytes: 128, verdict: 'clean' }] };
      }
      return { rowCount: 1, rows: [] };
    });
    const client = { query, release: vi.fn() };
    mockPoolConnect.mockResolvedValue(client);

    const response = await request(createApp())
      .get(`/api/privacy/requests/${REQUEST_ID}/export`)
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.export_status).toBe('partial');
    expect(response.body.data.account.email).toBe('subject@example.test');
    expect(response.body.data.authentication.sessions).toHaveLength(1);
    expect(response.body.data.malware_scans.records).toHaveLength(1);
    expect(response.body.excluded_categories).toContainEqual({
      category: 'assets',
      reason: 'ownership_not_verified_for_subject_export'
    });
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
    expect(JSON.stringify(response.body)).not.toContain('access_token');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(query.mock.calls.some(([sql]) => sql.includes('password_hash'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('access_token'))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not disclose whether another user owns a request', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, request_type, status')) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const client = { query, release: vi.fn() };
    mockPoolConnect.mockResolvedValue(client);

    const response = await request(createApp())
      .get(`/api/privacy/requests/${REQUEST_ID}/export`)
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('REQUEST_NOT_FOUND');
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM users'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM malware_samples'))).toBe(false);
  });

  it('requires a verified request in processing state before generating an export', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, request_type, status')) {
        return { rowCount: 1, rows: [{
          id: REQUEST_ID,
          request_type: 'portability',
          status: 'verified',
          scope_categories: ['account'],
          verified_at: new Date()
        }] };
      }
      return { rowCount: 1, rows: [] };
    });
    const client = { query, release: vi.fn() };
    mockPoolConnect.mockResolvedValue(client);

    const response = await request(createApp())
      .get(`/api/privacy/requests/${REQUEST_ID}/export`)
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('REQUEST_NOT_APPROVED_FOR_EXPORT');
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM users'))).toBe(false);
  });
});
