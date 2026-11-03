import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';

const serviceToken = 'nexus-threat-test-service-token'.padEnd(48, 'x');
const originalKey = process.env.OPENAI_API_KEY;
const originalServiceToken = process.env.NEXUS_SERVICE_API_TOKEN;

describe('Threat analysis API', () => {
  beforeEach(() => {
    process.env.NEXUS_SERVICE_API_TOKEN = serviceToken;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }

    if (originalServiceToken === undefined) {
      delete process.env.NEXUS_SERVICE_API_TOKEN;
    } else {
      process.env.NEXUS_SERVICE_API_TOKEN = originalServiceToken;
    }
  });

  it('requires a service token before accepting AI requests', async () => {
    delete process.env.NEXUS_SERVICE_API_TOKEN;

    const response = await request(app)
      .post('/api/threats/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('SERVICE_AUTH_NOT_CONFIGURED');
  });

  it('rejects requests without a valid bearer token', async () => {
    const response = await request(app)
      .post('/api/threats/analyze')
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('rejects invalid input', async () => {
    const response = await request(app)
      .post('/api/threats/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ target: '', source: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 503 when OpenAI is not configured', async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await request(app)
      .post('/api/threats/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('AI_NOT_CONFIGURED');
  });
});
