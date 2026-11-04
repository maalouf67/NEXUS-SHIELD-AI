import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type OtlpAttribute = {
  key: string;
  value: { stringValue?: string; intValue?: string };
};

function attribute(key: string, value: string | number): OtlpAttribute {
  return typeof value === "number"
    ? { key, value: { intValue: String(value) } }
    : { key, value: { stringValue: value } };
}

function safeRouteGroup(req: Request): string {
  const first = req.path.split("/").filter(Boolean);
  if (first[0] !== "api") return first[0] === "health" ? "health" : "web";
  const group = first[1] ?? "api";
  const allowed = new Set([
    "health", "auth", "users", "incidents", "alerts", "threats",
    "security-events", "malware-scans", "phone-reputation",
    "ip-reputation", "assets", "privacy", "attack-paths"
  ]);
  return allowed.has(group) ? group : "other";
}

function configuredEndpoint(): string | null {
  if (process.env.OTEL_ENABLED !== "true") return null;
  const value = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["127.0.0.1", "::1", "localhost"].includes(url.hostname))) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function otelTracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const endpoint = configuredEndpoint();
  if (!endpoint) return next();

  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const startedAt = BigInt(Date.now()) * 1_000_000n;
  const routeGroup = safeRouteGroup(req);

  res.once("finish", () => {
    const endedAt = BigInt(Date.now()) * 1_000_000n;
    const span = {
      traceId,
      spanId,
      name: `HTTP ${req.method} ${routeGroup}`,
      kind: 2,
      startTimeUnixNano: startedAt.toString(),
      endTimeUnixNano: endedAt.toString(),
      attributes: [
        attribute("http.request.method", req.method),
        attribute("http.response.status_code", res.statusCode),
        attribute("http.route", routeGroup)
      ],
      status: {
        code: res.statusCode >= 500 ? 2 : 1
      }
    };
    const payload = {
      resourceSpans: [{
        resource: {
          attributes: [
            attribute("service.name", process.env.OTEL_SERVICE_NAME || "nexus-shield-api"),
            attribute("deployment.environment.name", process.env.NODE_ENV || "development")
          ]
        },
        scopeSpans: [{
          scope: { name: "nexus-shield-api.manual-http" },
          spans: [span]
        }]
      }]
    };

    // Export asynchronously. No request path, query string, IP address, headers,
    // phone number, credentials or request/response body is included in telemetry.
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000)
    }).catch(() => undefined);
  });

  return next();
}
