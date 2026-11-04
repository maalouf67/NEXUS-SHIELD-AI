# OpenTelemetry tracing

## Current implementation

The Express API has an opt-in OTLP/HTTP trace middleware. It emits one server span per HTTP request to the configured OTLP traces endpoint. The middleware is deliberately dependency-light and manual; it does not currently install the OpenTelemetry Node SDK or auto-instrument database/provider libraries.

Set these variables only on the Express API server:

- `OTEL_ENABLED=true`
- `OTEL_SERVICE_NAME=nexus-shield-api`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces` for the local development collector.

Tracing is disabled by default. The application refuses to start with tracing enabled but no endpoint configured.

## Local development collector

The optional collector listens on loopback only and uses a debug exporter. It is intended for development verification, not durable production storage:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up -d otel-collector
```

Then enable tracing in the local API environment and restart the API. View received spans with:

```bash
docker logs -f nexus-shield-otel-collector
```

Stop the collector with:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability down
```

For production, use a managed or hardened OTLP collector over HTTPS, with network allow-listing and authentication at the collector/gateway. Do not expose OTLP ports publicly without access controls.

## Data minimization

Spans include a generated trace ID, HTTP method, response status, a fixed route group, service name and environment. The middleware deliberately omits:

- request path and query string;
- source/destination IP addresses;
- request/response body;
- cookies, authorization headers and provider credentials;
- phone numbers, email addresses and user IDs.

Exporter calls are asynchronous and best-effort with a short timeout; telemetry failure must not block or change the API response.

## Next stage

The current middleware provides minimal OTLP-compatible HTTP server spans. Before production-wide observability, add SDK-based auto-instrumentation for Express, PostgreSQL and outbound provider calls, sampling, secured collector authentication, and a real trace backend with retention controls. Do not claim those capabilities until configured and tested.
