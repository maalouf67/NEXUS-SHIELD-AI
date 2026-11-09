# OpenTelemetry tracing

## Current implementation

The Express API has an opt-in OTLP/HTTP tracing middleware. It emits one server span per HTTP request and supports bounded manual child spans through the request's async context.

Manual spans currently cover:
- OCSF event normalization (event count and pinned schema version only).
- Workspace-scoped PostgreSQL security-event ingestion (database system, operation and event count only).
- AbuseIPDB blacklist fetches (fixed provider hostname and HTTP method only).

This is intentionally targeted instrumentation. It does not install the OpenTelemetry Node SDK and does not auto-instrument all Express handlers, PostgreSQL queries, or outbound HTTP calls.

Set these variables only on the Express API server:

- `OTEL_ENABLED=true`
- `OTEL_SERVICE_NAME=nexus-shield-api`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces` for the local development collector.

Tracing is disabled by default. The application refuses to send telemetry to an external non-HTTPS endpoint. Loopback HTTP is allowed for local development only.

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

Root and child spans include only generated trace/span IDs, fixed operation names, route groups, method/status metadata, fixed service/provider labels, schema version, and bounded numeric event counts. The instrumentation does not export:

- request path or query string;
- source or destination IP addresses;
- request/response bodies or event summaries;
- cookies, authorization headers, provider credentials, API keys or SQL parameters;
- phone numbers, email addresses, user IDs, workspace IDs or arbitrary provider attributes.

Child span attributes are supplied explicitly by repository/provider code and are length-bounded. Exception messages are never included; only a bounded error type may be attached to a failed span.

Exporter calls are asynchronous and best-effort with a short timeout; telemetry failure must not block or change the API response.

## Next stage

The current tracing is manual OTLP export with explicit spans at selected operations. Before production-wide observability, add SDK-based auto-instrumentation for Express, PostgreSQL and outbound provider calls, plus sampling, secured collector authentication, backend retention controls and integration tests. Do not claim those capabilities until configured and tested.
