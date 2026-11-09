import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { otelTracingMiddleware, withOtelSpan } from './otel-tracing.middleware.js';

const ORIGINAL = {
  enabled: process.env.OTEL_ENABLED,
  endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  service: process.env.OTEL_SERVICE_NAME
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of [
    ['OTEL_ENABLED', ORIGINAL.enabled],
    ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', ORIGINAL.endpoint],
    ['OTEL_SERVICE_NAME', ORIGINAL.service]
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('OTLP HTTP tracing middleware', () => {
  it('exports a route-group span without URL, query or sensitive values', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:4318/v1/traces';
    process.env.OTEL_SERVICE_NAME = 'nexus-test';
    let exported: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      exported = JSON.parse(String(init.body));
      return new Response(null, { status: 200 });
    }));

    const app = express();
    app.use(otelTracingMiddleware);
    app.get('/api/phone-reputation/check', (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get('/api/phone-reputation/check?phone=%2B212612345678&token=do-not-export');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exported).toBeDefined();
    const spans = (exported as any).resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('HTTP GET phone-reputation');
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain('+212612345678');
    expect(serialized).not.toContain('do-not-export');
    expect(serialized).not.toContain('/check?');
  });

  it('exports child spans linked to the request span', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:4318/v1/traces';
    let exported: any;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      exported = JSON.parse(String(init.body));
      return new Response(null, { status: 200 });
    }));

    const app = express();
    app.use(otelTracingMiddleware);
    app.post('/api/integrations/security-events', async (_req, res) => {
      await withOtelSpan(
        'nexus.ocsf.normalize',
        { 'nexus.events.count': 2, 'ocsf.schema.version': '1.9.0' },
        async () => 'normalized'
      );
      await withOtelSpan(
        'db.security_events.ingest_batch',
        { 'db.system': 'postgresql', 'nexus.events.count': 2 },
        async () => 'stored'
      );
      res.status(202).send('accepted');
    });

    await request(app).post('/api/integrations/security-events');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const spans = exported.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(3);
    expect(spans[1].parentSpanId).toBe(spans[0].spanId);
    expect(spans[2].parentSpanId).toBe(spans[0].spanId);
    expect(spans[1].name).toBe('nexus.ocsf.normalize');
    expect(spans[2].name).toBe('db.security_events.ingest_batch');
    expect(JSON.stringify(exported)).not.toContain('api-key');
  });

  it('does not export when disabled', async () => {
    process.env.OTEL_ENABLED = 'false';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:4318/v1/traces';
    const exporter = vi.fn();
    vi.stubGlobal('fetch', exporter);
    const app = express();
    app.use(otelTracingMiddleware);
    app.get('/health', (_req, res) => res.send('ok'));
    await request(app).get('/health');
    expect(exporter).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS external collectors', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://collector.example.com:4318/v1/traces';
    const exporter = vi.fn();
    vi.stubGlobal('fetch', exporter);
    const app = express();
    app.use(otelTracingMiddleware);
    app.get('/health', (_req, res) => res.send('ok'));
    await request(app).get('/health');
    expect(exporter).not.toHaveBeenCalled();
  });
});
