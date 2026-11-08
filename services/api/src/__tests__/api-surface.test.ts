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
    const response = await request(app).get('/api/workspaces/members');
    expect(response.status).toBe(401);
  });
});
