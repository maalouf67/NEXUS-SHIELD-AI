import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import {
  createApiAnomalyGuard,
  type ApiAnomalyCounterStore
} from '../middleware/api-anomaly-guard.js';

class MemoryCounterStore implements ApiAnomalyCounterStore {
  private readonly counters = new Map<string, { hits: number; resetTime: Date }>();

  constructor(private readonly windowMs: number) {}

  async get(key: string) {
    const current = this.counters.get(key);
    if (!current || current.resetTime.getTime() <= Date.now()) return undefined;
    return { totalHits: current.hits, resetTime: current.resetTime };
  }

  async increment(key: string) {
    const current = this.counters.get(key);
    const isCurrent = current && current.resetTime.getTime() > Date.now();
    const next = {
      hits: isCurrent ? current.hits + 1 : 1,
      resetTime: isCurrent ? current.resetTime : new Date(Date.now() + this.windowMs)
    };
    this.counters.set(key, next);
    return { totalHits: next.hits, resetTime: next.resetTime };
  }
}

describe('API anomaly containment', () => {
  it('temporarily contains a source after repeated suspicious API responses', async () => {
    const store = new MemoryCounterStore(60_000);
    const onContainment = vi.fn();
    const app = express();

    app.use('/api', createApiAnomalyGuard({
      windowMs: 60_000,
      threshold: 2,
      store,
      onContainment
    }));
    app.get('/api/missing', (_request, response) => response.status(404).json({ error: 'NOT_FOUND' }));
    app.get('/api/denied', (_request, response) => response.status(403).json({ error: 'FORBIDDEN' }));
    app.get('/api/healthy', (_request, response) => response.status(200).json({ status: 'ok' }));

    const first = await request(app).get('/api/missing');
    const second = await request(app).get('/api/denied');
    const contained = await request(app).get('/api/healthy');

    expect(first.status).toBe(404);
    expect(second.status).toBe(403);
    expect(contained.status).toBe(429);
    expect(contained.body.error).toBe('SOURCE_TEMPORARILY_CONTAINED');
    expect(Number(contained.headers['retry-after'])).toBeGreaterThan(0);
    expect(onContainment).toHaveBeenCalledTimes(1);
  });

  it('does not count successful responses as suspicious activity', async () => {
    const store = new MemoryCounterStore(60_000);
    const app = express();

    app.use('/api', createApiAnomalyGuard({
      windowMs: 60_000,
      threshold: 2,
      store
    }));
    app.get('/api/healthy', (_request, response) => response.status(200).json({ status: 'ok' }));
    app.get('/api/unauthorized', (_request, response) => response.status(401).json({ error: 'UNAUTHORIZED' }));

    expect((await request(app).get('/api/healthy')).status).toBe(200);
    expect((await request(app).get('/api/unauthorized')).status).toBe(401);
    expect((await request(app).get('/api/healthy')).status).toBe(200);
  });

  it('fails closed when the shared protection counter cannot be read', async () => {
    const store = {
      get: vi.fn().mockRejectedValue(new Error('database unavailable')),
      increment: vi.fn()
    } as unknown as ApiAnomalyCounterStore;
    const route = vi.fn((_request, response) => response.status(200).json({ status: 'ok' }));
    const app = express();

    app.use('/api', createApiAnomalyGuard({ store }));
    app.get('/api/healthy', route);

    const result = await request(app).get('/api/healthy');

    expect(result.status).toBe(503);
    expect(result.body.error).toBe('PROTECTION_STORE_UNAVAILABLE');
    expect(route).not.toHaveBeenCalled();
  });
});
