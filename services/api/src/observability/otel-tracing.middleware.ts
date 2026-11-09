import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type OtlpAttributeValue = string | number | boolean;
type OtlpAttribute = {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
};

type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: OtlpAttribute[];
  status: { code: number };
};

interface TraceContext {
  endpoint: string;
  traceId: string;
  parentSpanId: string;
  spans: OtlpSpan[];
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

function attribute(key: string, value: OtlpAttributeValue): OtlpAttribute | null {
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(key)) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return { key, value: { intValue: String(Math.trunc(value)) } };
  }
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  if (value.length > 128) return null;
  return { key, value: { stringValue: value } };
}

function attributes(values: Record<string, OtlpAttributeValue> = {}): OtlpAttribute[] {
  return Object.entries(values)
    .map(([key, value]) => attribute(key, value))
    .filter((value): value is OtlpAttribute => value !== null);
}

function configuredEndpoint(): string | null {
  if (process.env.OTEL_ENABLED !== 'true') return null;
  const value = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const isLoopbackHttp = url.protocol === 'http:' &&
      ['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLoopbackHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeRouteGroup(req: Request): string {
  const first = req.path.split('/').filter(Boolean);
  if (first[0] !== 'api') return first[0] === 'health' ? 'health' : 'web';
  const group = first[1] ?? 'api';
  const allowed = new Set([
    'health', 'auth', 'users', 'incidents', 'alerts', 'threats',
    'security-events', 'malware-scans', 'phone-reputation',
    'ip-reputation', 'assets', 'privacy', 'attack-paths',
    'threat-intelligence', 'integrations'
  ]);
  return allowed.has(group) ? group : 'other';
}

function nowUnixNano(): string {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

async function exportTrace(endpoint: string, spans: OtlpSpan[]): Promise<void> {
  if (spans.length === 0) return;
  const payload = {
    resourceSpans: [{
      resource: {
        attributes: [
          attribute('service.name', process.env.OTEL_SERVICE_NAME || 'nexus-shield-api')!,
          attribute('deployment.environment.name', process.env.NODE_ENV || 'development')!
        ]
      },
      scopeSpans: [{
        scope: { name: 'nexus-shield-api.manual' },
        spans
      }]
    }]
  };

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000)
    });
  } catch {
    // Telemetry is best effort. Exporter failures never change API responses.
  }
}

/**
 * Records an internal span in the active HTTP trace. Only explicitly supplied,
 * bounded low-cardinality attributes are exported. No exception message is kept.
 */
export async function withOtelSpan<T>(
  name: string,
  spanAttributes: Record<string, OtlpAttributeValue>,
  operation: () => Promise<T> | T
): Promise<T> {
  const current = traceStorage.getStore();
  if (!current) return await operation();

  const spanId = randomBytes(8).toString('hex');
  const span: OtlpSpan = {
    traceId: current.traceId,
    spanId,
    parentSpanId: current.parentSpanId,
    name: name.slice(0, 128),
    kind: 1,
    startTimeUnixNano: nowUnixNano(),
    attributes: attributes(spanAttributes),
    status: { code: 0 }
  };
  current.spans.push(span);

  return await traceStorage.run(
    { ...current, parentSpanId: spanId },
    async () => {
      try {
        const result = await operation();
        span.status.code = 1;
        return result;
      } catch (error) {
        span.status.code = 2;
        const errorType = error instanceof Error ? error.name : 'UnknownError';
        const safeErrorType = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(errorType)
          ? errorType
          : 'Error';
        span.attributes.push(attribute('error.type', safeErrorType)!);
        throw error;
      } finally {
        span.endTimeUnixNano = nowUnixNano();
      }
    }
  );
}

export function otelTracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const endpoint = configuredEndpoint();
  if (!endpoint) return next();

  const traceId = randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  const startedAt = nowUnixNano();
  const routeGroup = safeRouteGroup(req);
  const rootSpan: OtlpSpan = {
    traceId,
    spanId,
    name: 'HTTP ' + req.method + ' ' + routeGroup,
    kind: 2,
    startTimeUnixNano: startedAt,
    attributes: [
      attribute('http.request.method', req.method)!,
      attribute('http.route', routeGroup)!
    ],
    status: { code: 0 }
  };
  const context: TraceContext = {
    endpoint,
    traceId,
    parentSpanId: spanId,
    spans: [rootSpan]
  };

  res.once('finish', () => {
    rootSpan.endTimeUnixNano = nowUnixNano();
    rootSpan.attributes.push(attribute('http.response.status_code', res.statusCode)!);
    rootSpan.status.code = res.statusCode >= 500 ? 2 : 1;
    void exportTrace(endpoint, context.spans);
  });

  traceStorage.run(context, next);
}
