import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('Threat analysis API', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it('rejects invalid input', async () => {
    const response = await request(app)
      .post('/api/threats/analyze')
      .send({ target: '', source: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 503 when OpenAI is not configured', async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await request(app)
      .post('/api/threats/analyze')
      .send({ target: 'test-server', source: 'manual-report' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('AI_NOT_CONFIGURED');
  });
});



