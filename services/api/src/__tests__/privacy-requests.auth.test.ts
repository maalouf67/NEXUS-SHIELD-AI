import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('Privacy request authorization boundary', () => {
  it('requires an authenticated session to create a privacy request', async () => {
    const response = await request(app).post('/api/privacy/requests').send({
      request_type: 'access',
      scope_categories: ['account']
    });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });

  it('requires an authenticated session to list personal requests', async () => {
    const response = await request(app).get('/api/privacy/requests');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });

  it('requires an authenticated session before exposing the admin queue', async () => {
    const response = await request(app).get('/api/admin/privacy/requests');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });
});
