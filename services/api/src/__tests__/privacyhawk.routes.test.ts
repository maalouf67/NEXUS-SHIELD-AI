import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createPrivacyHawkRouter, type PrivacyHawkProvider } from '../privacy/privacyhawk.routes.js';

const USER_ID = '00000000-0000-4000-8000-000000000011';
const SECRET = 'nexus-privacyhawk-route-test-secret-at-least-32-bytes';

function makeToken() {
  const sessionId = '00000000-0000-4000-8000-000000000012';
  process.env.JWT_SECRET = SECRET;
  registerTestAuthSession({
    sessionId, userId: USER_ID, expiresAt: new Date(Date.now() + 600_000),
    testIdentity: { id: USER_ID, email: 'subject@example.test', role: 'analyst' }
  });
  return jwt.sign({ jti: sessionId }, SECRET, {
    algorithm: 'HS256', subject: USER_ID, issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience, expiresIn: '5m'
  });
}

function setup() {
  const dbClient = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })), release: vi.fn() };
  const database = {
    connect: vi.fn(async () => dbClient),
    query: vi.fn(async () => ({ rows: [], rowCount: 1 }))
  };
  const provider: PrivacyHawkProvider = {
    isConfigured: () => true,
    environment: () => 'sandbox',
    createScan: vi.fn(async (customerId, _profile, realtime) => ({
      id: 'provider-scan-1', customerId, status: 'created', brokerCount: 2, realtime
    })),
    getScan: vi.fn(async (scanId) => ({ id: scanId, customerId: USER_ID, status: 'completed' })),
    getScanRecords: vi.fn(async () => [{ id: 'record-1', fullName: 'Subject', relatives: ['unrelated-person'] }]),
    listBrokers: vi.fn(async () => [{ id: '1', name: 'Example Broker', icon: 'private-icon' }])
  };
  const app = express();
  app.use(express.json());
  app.use('/api', createPrivacyHawkRouter({ database: database as never, provider }));
  return { app, database, dbClient, provider };
}

describe('PrivacyHawk authenticated API boundary', () => {
  it('requires authentication', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/privacy/providers/privacyhawk/status')).status).toBe(401);
  });

  it('rejects profile transfer without explicit consent', async () => {
    const { app, provider } = setup();
    const response = await request(app).post('/api/privacy/providers/privacyhawk/scans')
      .set('Authorization', 'Bearer ' + makeToken())
      .send({ profile: { name: { first: 'Test', last: 'User' }, emailAddresses: ['subject@example.test'] } });
    expect(response.status).toBe(400);
    expect(provider.createScan).not.toHaveBeenCalled();
  });

  it('records consent metadata but never persists the submitted profile', async () => {
    const { app, dbClient, provider } = setup();
    const profile = { name: { first: 'Test', last: 'User' }, emailAddresses: ['subject@example.test'] };
    const response = await request(app).post('/api/privacy/providers/privacyhawk/scans')
      .set('Authorization', 'Bearer ' + makeToken())
      .send({ consent: { granted: true, explicit: true, version: '2026-11-08' }, profile, realtime: true });
    expect(response.status).toBe(202);
    expect(response.body.scan.provider_scan_id).toBe('provider-scan-1');
    expect(provider.createScan).toHaveBeenCalledWith(USER_ID, profile, true);
    const persistedValues = JSON.stringify(dbClient.query.mock.calls);
    expect(persistedValues).not.toContain('subject@example.test');
    expect(persistedValues).not.toContain('Test');
    expect(dbClient.release).toHaveBeenCalledOnce();
  });

  it('does not fetch records for a scan owned by another user', async () => {
    const { app, database, provider } = setup();
    database.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(app)
      .get('/api/privacy/providers/privacyhawk/scans/00000000-0000-4000-8000-000000000099/records')
      .set('Authorization', 'Bearer ' + makeToken());
    expect(response.status).toBe(404);
    expect(provider.getScanRecords).not.toHaveBeenCalled();
  });
});
