import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('NEXUS SHIELD API', () => {
  it('returns health data', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('nexus-shield-api');
  });

  it('returns threat summary', async () => {
    const response = await request(app).get('/api/threats/summary');

    expect(response.status).toBe(200);
    expect(response.body.summary.critical).toBeGreaterThanOrEqual(0);
  });
});
