import { describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../index.js';

describe('Vercel Express entrypoint', () => {
  it('exports the Express application and serves the liveness endpoint', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      service: 'nexus-shield-api',
      ok: true
    });
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
