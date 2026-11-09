import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createAuthRouter } from '../auth/auth.routes.js';
import { createLoginAttemptLimiter } from '../middleware/intrusion-prevention.js';

describe('active defense login protection', () => {
  it('temporarily rate-limits repeated failed login requests and records the threshold signal', async () => {
    const onLimit = vi.fn();
    const app = express();
    app.use(express.json());
    app.use('/api', createAuthRouter(
      undefined,
      createLoginAttemptLimiter({ windowMs: 60_000, limit: 2, onLimit, useSharedStore: false })
    ));

    const payload = { email: 'not-an-email', password: 'invalid' };

    const first = await request(app).post('/api/auth/login').send(payload);
    const second = await request(app).post('/api/auth/login').send(payload);
    const third = await request(app).post('/api/auth/login').send(payload);

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('LOGIN_RATE_LIMITED');
    expect(onLimit).toHaveBeenCalledTimes(1);
  });

  it('does not expose submitted credentials in the rate-limit response', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', createAuthRouter(
      undefined,
      createLoginAttemptLimiter({ windowMs: 60_000, limit: 1, useSharedStore: false, onLimit: vi.fn() })
    ));

    await request(app).post('/api/auth/login')
      .send({ email: 'private@example.com', password: 'do-not-reflect-this-secret' });
    const blocked = await request(app).post('/api/auth/login')
      .send({ email: 'private@example.com', password: 'do-not-reflect-this-secret' });

    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).not.toContain('private@example.com');
    expect(JSON.stringify(blocked.body)).not.toContain('do-not-reflect-this-secret');
  });
});
