import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createAlertsRouter } from '../alerts/alerts.routes.js';
import type {
  Alert,
  AlertListFilters,
  AlertRepository,
  UpdateAlertStatusInput
} from '../alerts/alert.repository.js';

const SECRET = 'nexus-alert-test-secret-at-least-32-characters';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';
const VIEWER_ID = '550e8400-e29b-41d4-a716-446655440002';
const INCIDENT_ID = '550e8400-e29b-41d4-a716-446655440010';
const ALERT_ID = '550e8400-e29b-41d4-a716-446655440020';
const originalSecret = process.env.JWT_SECRET;

const sampleAlert: Alert = {
  id: ALERT_ID,
  incidentId: INCIDENT_ID,
  incidentTitle: 'Unusual authentication sequence',
  incidentSeverity: 'high',
  incidentStatus: 'open',
  type: 'identity-anomaly',
  riskScore: 78,
  status: 'active',
  createdAt: '2026-01-01T00:10:00.000Z'
};

function createRepository(
  overrides: Partial<AlertRepository> = {}
): AlertRepository {
  return {
    async list(filters: AlertListFilters) {
      return { alerts: [sampleAlert], total: 1 };
    },
    async create(input) {
      return { ...sampleAlert, id: input.id, type: input.type, riskScore: input.riskScore };
    },
    async updateStatus(input: UpdateAlertStatusInput) {
      if (input.alertId !== ALERT_ID) {
        return { outcome: 'not_found' };
      }
      return {
        outcome: 'updated',
        alert: { ...sampleAlert, status: input.status }
      };
    },
    ...overrides
  };
}

function token(userId: string, role: 'admin' | 'analyst' | 'viewer') {
  const email = `${role}@example.com`;
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: { id: userId, email, role }
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

function createTestApp(repository: AlertRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAlertsRouter(repository));
  return app;
}

describe('Alert review API', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('allows viewers to list alerts', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/alerts?minimumRiskScore=70&limit=10')
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`);

    expect(response.status).toBe(200);
    expect(response.body.alerts[0].riskScore).toBe(78);
    expect(response.body.pagination.total).toBe(1);
  });

  it('requires authentication to list alerts', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/alerts');

    expect(response.status).toBe(401);
  });

  it('does not allow viewers to record alerts', async () => {
    const response = await request(createTestApp(createRepository()))
      .post(`/api/incidents/${INCIDENT_ID}/alerts`)
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`)
      .send({ type: 'identity-anomaly', riskScore: 78 });

    expect(response.status).toBe(403);
  });

  it('allows analysts to record an alert from submitted information', async () => {
    const response = await request(createTestApp(createRepository()))
      .post(`/api/incidents/${INCIDENT_ID}/alerts`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({
        type: 'identity-anomaly',
        riskScore: 78,
        note: 'Analyst submitted an identity signal.'
      });

    expect(response.status).toBe(201);
    expect(response.body.alert.type).toBe('identity-anomaly');
    expect(response.body.audit_recorded).toBe(true);
    expect(response.body.external_detection_performed).toBe(false);
  });

  it('rejects risk scores outside the documented bounds', async () => {
    const response = await request(createTestApp(createRepository()))
      .post(`/api/incidents/${INCIDENT_ID}/alerts`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ type: 'invalid-risk', riskScore: 101 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('allows analysts to acknowledge an active alert', async () => {
    const response = await request(createTestApp(createRepository()))
      .patch(`/api/alerts/${ALERT_ID}/status`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ status: 'acknowledged', note: 'Analyst reviewed the alert.' });

    expect(response.status).toBe(200);
    expect(response.body.alert.status).toBe('acknowledged');
    expect(response.body.audit_recorded).toBe(true);
  });

  it('returns conflict for a forbidden alert transition', async () => {
    const repository = createRepository({
      async updateStatus() {
        return { outcome: 'invalid_transition', currentStatus: 'resolved' };
      }
    });

    const response = await request(createTestApp(repository))
      .patch(`/api/alerts/${ALERT_ID}/status`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ status: 'active' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_ALERT_STATUS_TRANSITION');
  });
});
