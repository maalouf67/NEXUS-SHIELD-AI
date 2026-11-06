import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createSecurityEventsRouter } from '../security-events/security-events.routes.js';
import type {
  IngestSecurityEventsResult,
  ReviewSecurityEventResult,
  SecurityEvent,
  SecurityEventInput,
  SecurityEventListFilters,
  SecurityEventRepository
} from '../security-events/security-event.repository.js';

const INGESTION_TOKEN = 'nexus-event-ingestion-test-token'.padEnd(48, 'x');
const JWT_SECRET = 'nexus-security-event-test-jwt-secret-at-least-32';
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';
const VIEWER_ID = '550e8400-e29b-41d4-a716-446655440002';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440010';
const originalIngestionToken = process.env.NEXUS_EVENT_INGESTION_TOKEN;
const originalJwtSecret = process.env.JWT_SECRET;

const sampleInput: SecurityEventInput = {
  source: 'test-edr',
  externalEventId: 'evt-1001',
  eventType: 'suspicious-authentication',
  severity: 'high',
  observedAt: '2026-11-03T04:00:00.000Z',
  assetId: 'endpoint-01',
  summary: 'Repeated failed authentication was reported by a test fixture.',
  attributes: { environment: 'test', signal: 'authentication' }
};

const sampleEvent: SecurityEvent = {
  id: EVENT_ID,
  ...sampleInput,
  receivedAt: '2026-11-03T04:01:00.000Z',
  reviewStatus: 'new',
  reviewedAt: null,
  reviewedByUserId: null
};

function createRepository(
  overrides: Partial<SecurityEventRepository> = {}
): SecurityEventRepository {
  return {
    async ingestBatch(events) {
      return { inserted: events.length, duplicates: 0 };
    },
    async list(filters: SecurityEventListFilters) {
      return { events: [sampleEvent], total: 1 };
    },
    async review() {
      return {
        outcome: 'reviewed',
        event: {
          ...sampleEvent,
          reviewStatus: 'reviewed',
          reviewedAt: '2026-11-03T04:02:00.000Z',
          reviewedByUserId: ANALYST_ID
        }
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
    JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: userId,
      issuer: authTokenConfig.issuer,
      audience: authTokenConfig.audience,
      expiresIn: '15m'
    }
  );
}

function createTestApp(repository: SecurityEventRepository) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createSecurityEventsRouter(repository));
  return app;
}

describe('Normalized security event API', () => {
  beforeEach(() => {
    process.env.NEXUS_EVENT_INGESTION_TOKEN = INGESTION_TOKEN;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    if (originalIngestionToken === undefined) {
      delete process.env.NEXUS_EVENT_INGESTION_TOKEN;
    } else {
      process.env.NEXUS_EVENT_INGESTION_TOKEN = originalIngestionToken;
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('fails closed when the dedicated ingestion token is not configured', async () => {
    delete process.env.NEXUS_EVENT_INGESTION_TOKEN;

    const response = await request(createTestApp(createRepository()))
      .post('/api/integrations/security-events')
      .set('X-NEXUS-INGESTION-TOKEN', INGESTION_TOKEN)
      .send({ events: [sampleInput] });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('EVENT_INGESTION_NOT_CONFIGURED');
  });

  it('rejects an invalid integration token', async () => {
    const response = await request(createTestApp(createRepository()))
      .post('/api/integrations/security-events')
      .set('X-NEXUS-INGESTION-TOKEN', 'wrong-token')
      .send({ events: [sampleInput] });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('accepts normalized events and reports an idempotent batch result', async () => {
    const response = await request(createTestApp(createRepository({
      async ingestBatch(events): Promise<IngestSecurityEventsResult> {
        return { inserted: events.length, duplicates: 0 };
      }
    })))
      .post('/api/integrations/security-events')
      .set('X-NEXUS-INGESTION-TOKEN', INGESTION_TOKEN)
      .send({ events: [sampleInput] });

    expect(response.status).toBe(202);
    expect(response.body.inserted).toBe(1);
    expect(response.body.duplicates).toBe(0);
    expect(response.body.incidents_created).toBe(0);
    expect(response.body.automated_response_performed).toBe(false);
  });

  it('rejects duplicate source and event identifiers in the same request batch', async () => {
    let storeCalled = false;
    const repository = createRepository({
      async ingestBatch() {
        storeCalled = true;
        return { inserted: 1, duplicates: 1 };
      }
    });

    const response = await request(createTestApp(repository))
      .post('/api/integrations/security-events')
      .set('X-NEXUS-INGESTION-TOKEN', INGESTION_TOKEN)
      .send({ events: [sampleInput, sampleInput] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
    expect(storeCalled).toBe(false);
  });

  it('rejects excessive attribute counts and invalid severities', async () => {
    const attributes = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`field-${index}`, 'value'])
    );

    const response = await request(createTestApp(createRepository()))
      .post('/api/integrations/security-events')
      .set('X-NEXUS-INGESTION-TOKEN', INGESTION_TOKEN)
      .send({
        events: [{
          ...sampleInput,
          severity: 'extreme',
          attributes
        }]
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('allows authenticated viewers to read security events', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/security-events?severity=high&reviewStatus=new&limit=10')
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`);

    expect(response.status).toBe(200);
    expect(response.body.events[0].source).toBe('test-edr');
    expect(response.body.pagination.total).toBe(1);
  });

  it('requires authentication to read security events', async () => {
    const response = await request(createTestApp(createRepository()))
      .get('/api/security-events');

    expect(response.status).toBe(401);
  });

  it('does not allow viewers to mark events reviewed', async () => {
    const response = await request(createTestApp(createRepository()))
      .post(`/api/security-events/${EVENT_ID}/review`)
      .set('Authorization', `Bearer ${token(VIEWER_ID, 'viewer')}`)
      .send({ note: 'Viewer cannot perform this action.' });

    expect(response.status).toBe(403);
  });

  it('allows analysts to review an event without triggering a response action', async () => {
    const response = await request(createTestApp(createRepository()))
      .post(`/api/security-events/${EVENT_ID}/review`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ note: 'Reviewed against the analyst-provided context.' });

    expect(response.status).toBe(200);
    expect(response.body.event.reviewStatus).toBe('reviewed');
    expect(response.body.audit_recorded).toBe(true);
    expect(response.body.automated_response_performed).toBe(false);
  });

  it('does not create duplicate review records when an event is already reviewed', async () => {
    const repository = createRepository({
      async review(): Promise<ReviewSecurityEventResult> {
        return { outcome: 'already_reviewed', event: {
          ...sampleEvent,
          reviewStatus: 'reviewed',
          reviewedAt: '2026-11-03T04:02:00.000Z',
          reviewedByUserId: ANALYST_ID
        }};
      }
    });

    const response = await request(createTestApp(repository))
      .post(`/api/security-events/${EVENT_ID}/review`)
      .set('Authorization', `Bearer ${token(ANALYST_ID, 'analyst')}`)
      .send({ note: 'Repeat review attempt.' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('already_reviewed');
    expect(response.body.audit_recorded).toBe(false);
  });
});
