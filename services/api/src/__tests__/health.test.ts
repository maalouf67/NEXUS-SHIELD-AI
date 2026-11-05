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

  it('reports the PostgreSQL-backed threat summary as unavailable when the database is not configured for the test', async () => {
    const response = await request(app).get('/api/threats/summary');

    // The route must not fabricate a successful threat summary when PostgreSQL
    // is unreachable. Database-backed success is covered by integration tests.
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('THREAT_SUMMARY_UNAVAILABLE');
  });
});
