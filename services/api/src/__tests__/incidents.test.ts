import express from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { createIncidentsRouter } from '../incidents/incidents.routes.js';
import type {
  Incident,
  IncidentDetail,
  IncidentListFilters,
  IncidentRepository,
  UpdateIncidentStatusInput
} from '../incidents/incident.repository.js';

const SECRET = 'nexus-incident-test-secret-at-least-32-characters';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';
const VIEWER_ID = '550e8400-e29b-41d4-a716-446655440002';
const INCIDENT_ID = '550e8400-e29b-41d4-a716-446655440010';
const originalSecret = process.env.JWT_SECRET;

const sampleIncident: Incident = {
  id: INCIDENT_ID,
  title: 'Unusual authentication sequence',
  severity: 'high',
  status: 'open',
  source: 'manual-report',
  createdByUserId: ANALYST_ID,
  updatedByUserId: ANALYST_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const sampleDetail: IncidentDetail = {
  ...sampleIncident,
  alerts: [{
    id: '550e8400-e29b-41d4-a716-446655440020',
    incidentId: INCIDENT_ID,
    type: 'identity-anomaly',
    riskScore: 78,
    status: 'active',
    createdAt: '2026-01-01T00:10:00.000Z'
  }],
  activity: [{
    id: '550e8400-e29b-41d4-a716-446655440030',
    incidentId: INCIDENT_ID,
    actorUserId: ANALYST_ID,
    action: 'incident.created',
    fromStatus: null,
    toStatus: 'open',
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  }]
};

function createRepository(
  overrides: Partial<IncidentRepository> = {}
): IncidentRepository {
  return {
    async list(filters: IncidentListFilters) {
      return { incidents: [sampleIncident], total: 1 };
    },
    async getById() {
      return sampleDetail;
    },
    async create(input) {
      return {
        ...sampleIncident,
        id: input.id,
        title: input.title,
        severity: input.severity,
        source: input.source ?? null,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId
      };
    },
    async updateStatus(input: UpdateIncidentStatusInput) {
      if (input.incidentId !== INCIDENT_ID) {
        return { outcome: 'not_found' };
      }
      return {
        outcome: 'updated',
        incident: {
          ...sampleIncident,
          status: input.status,
          updatedByUserId: input.actorUserId
        }
      };
    },
    ...overrides
  };
}

function token(userId: string, role: 'admin' | 'analyst' | 'viewer') {
  return jwt.sign(
    { email: `${role}@example.com`, role },
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

function createTestApp(repository: IncidentRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api', createIncidentsRouter(repository));
  return app;
}

describe('Incident management API', () => {
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

  it('requires authentication to list incidents', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/incidents');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });

  it('allows viewers to read incidents with bounded pagination', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/incidents?severity=high&limit=10&offset=0')
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`);

    expect(response.status).toBe(200);
    expect(response.body.incidents).toHaveLength(1);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.pagination.has_more).toBe(false);
  });

  it('rejects excessive pagination limits', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/incidents?limit=1000')
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_QUERY');
  });

  it('returns audit activity and related alerts for an incident', async () => {
    const response = await request(createTestApp(createRepository()))
      .get(`/api/incidents/${INCIDENT_ID}`)
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`);

    expect(response.status).toBe(200);
    expect(response.body.incident.activity[0].action).toBe('incident.created');
    expect(response.body.incident.alerts[0].type).toBe('identity-anomaly');
  });

  it('does not allow viewers to create incidents', async () => {
    const response = await request(createTestApp(createRepository()))
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`)
      .send({
        title: 'Analyst supplied incident',
        severity: 'high',
        source: 'manual-report'
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('allows analysts to create an incident with validated fields', async () => {
    const response = await request(createTestApp(createRepository()))
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({
        title: '  Suspicious identity activity  ',
        severity: 'critical',
        source: 'analyst-review'
      });

    expect(response.status).toBe(201);
    expect(response.body.incident.title).toBe('Suspicious identity activity');
    expect(response.body.incident.status).toBe('open');
    expect(response.body.message).toContain('No automated response');
  });

  it('rejects invalid incident severity and unknown input fields', async () => {
    const response = await request(createTestApp(createRepository()))
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({
        title: 'Invalid severity',
        severity: 'extreme',
        autoContain: true
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('allows analysts to move an incident through a valid transition', async () => {
    const response = await request(createTestApp(createRepository()))
      .patch(`/api/incidents/${INCIDENT_ID}/status`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ status: 'investigating', note: 'Analyst started review.' });

    expect(response.status).toBe(200);
    expect(response.body.incident.status).toBe('investigating');
    expect(response.body.audit_recorded).toBe(true);
    expect(response.body.automated_response_performed).toBe(false);
  });

  it('returns conflict for an invalid status transition', async () => {
    const repository = createRepository({
      async updateStatus() {
        return { outcome: 'invalid_transition', currentStatus: 'closed' };
      }
    });

    const response = await request(createTestApp(repository))
      .patch(`/api/incidents/${INCIDENT_ID}/status`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ status: 'open' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');
  });

  it('returns not found for unknown incidents', async () => {
    const repository = createRepository({
      async getById() {
        return null;
      }
    });

    const response = await request(createTestApp(repository))
      .get('/api/incidents/550e8400-e29b-41d4-a716-446655440099')
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('INCIDENT_NOT_FOUND');
  });
});
