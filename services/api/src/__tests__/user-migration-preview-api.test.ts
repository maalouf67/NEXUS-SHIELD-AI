import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';

describe('secure user migration preview API', () => {
  it('requires an authenticated user before accepting preview data', async () => {
    const response = await request(app)
      .post('/api/admin/user-migration/preview')
      .send({
        sourceSystemCode: 'synthetic-test',
        schemaVersion: '1',
        records: [{
          sourceSubjectId: 'synthetic-user-001',
          sourceRole: 'member'
        }]
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });
});
