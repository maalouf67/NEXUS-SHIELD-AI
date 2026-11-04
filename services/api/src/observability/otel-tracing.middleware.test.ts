import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { otelTracingMiddleware } from "./otel-tracing.middleware.js";

const ORIGINAL = {
  enabled: process.env.OTEL_ENABLED,
  endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  service: process.env.OTEL_SERVICE_NAME
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of [
    ["OTEL_ENABLED", ORIGINAL.enabled],
    ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", ORIGINAL.endpoint],
    ["OTEL_SERVICE_NAME", ORIGINAL.service]
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("OTLP HTTP tracing middleware", () => {
  it("exports a span with a route group and no URL/query or sensitive values", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://127.0.0.1:4318/v1/traces";
    process.env.OTEL_SERVICE_NAME = "nexus-test";
    let exported: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      exported = JSON.parse(String(init.body));
      return new Response(null, { status: 200 });
    }));

    const app = express();
    app.use(otelTracingMiddleware);
    app.get("/api/phone-reputation/check", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/api/phone-reputation/check?phone=%2B212612345678&token=do-not-export");

    expect(exported).toBeDefined();
    const spans = (exported as any).resourceSpans[0].scopeSpans[0].spans;
    expect(spans[0].name).toBe("HTTP GET phone-reputation");
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("+212612345678");
    expect(serialized).not.toContain("do-not-export");
    expect(serialized).not.toContain("/check?");
  });

  it("does not export when disabled", async () => {
    process.env.OTEL_ENABLED = "false";
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://127.0.0.1:4318/v1/traces";
    const exporter = vi.fn();
    vi.stubGlobal("fetch", exporter);
    const app = express();
    app.use(otelTracingMiddleware);
    app.get("/health", (_req, res) => res.send("ok"));
    await request(app).get("/health");
    expect(exporter).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS external collectors", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://collector.example.com:4318/v1/traces";
    const exporter = vi.fn();
    vi.stubGlobal("fetch", exporter);
    const app = express();
    app.use(otelTracingMiddleware);
    app.get("/health", (_req, res) => res.send("ok"));
    await request(app).get("/health");
    expect(exporter).not.toHaveBeenCalled();
  });
});
