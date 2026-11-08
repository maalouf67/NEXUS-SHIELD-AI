import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';

describe('production API surface', () => {
  it('does not expose the legacy global user directory or account-creation endpoint', async () => {
    const list = await request(app).get('/api/users');
    expect(list.status).toBe(404);

    const create = await request(app)
      .post('/api/users')
      .send({
        email: 'new-member@example.test',
        password: 'Never-Create-Global-Users-123!',
        role: 'analyst'
      });
    expect(create.status).toBe(404);
  });

  it('requires authentication before listing workspace memberships', async () => {
    // The auth middleware returns 503 if JWT verification is not configured.
    // Configure a test-only secret so this test specifically exercises the
    // missing bearer-token path and asserts the intended 401 response.
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters';
    const response = await request(app).get('/api/workspaces/members');
    expect(response.status).toBe(401);
  });
});
