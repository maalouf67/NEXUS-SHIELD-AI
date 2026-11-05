# Security integration status

Audit snapshot: 2026-11-05. This document separates repository implementation, CI evidence, and live deployment verification. A configured adapter is not proof that a provider account is connected.

| Capability | Implementation in repository | Verified evidence | Live/deployment status |
|---|---|---|---|
| PostgreSQL | Express API uses a shared `pg.Pool` configured by `DATABASE_URL`, with TLS verification enabled unless explicitly disabled. Eight ordered SQL initialization/migration files are present. | GitHub Actions starts a disposable PostgreSQL 16 service, applies migrations 001–008, checks the rate-limit table, and runs API/database integration tests. | Production connection, provider CA, credentials, backups, failover and restore are not verified from this repository. The authenticated `GET /health/ready` endpoint checks a SQL query; it does not identify a production database. |
| OpenAI AI analysis | Server-side API AI orchestrator and analyst-submitted threat-analysis route exist. The provider key is read server-side. | Repository CI validates API build/tests; fixture tests do not prove that an external OpenAI account is connected. | Requires an authorized `OPENAI_API_KEY` in the API secret manager and a controlled live request. The result analyzes submitted context; it is not a security scan or proof of compromise. |
| ClamAV | FastAPI scanner, private owner-scoped quarantine, Express/Next.js upload gateway and PostgreSQL scan history exist. | CI starts PostgreSQL, ClamAV and the AI container, sends a benign file and the harmless EICAR test string through the web gateway, and checks per-user history isolation. | Production scanner deployment, signature freshness/monitoring, persistent-volume behavior and retention operation are not verified. |
| AbuseIPDB | Server-side public-IP adapter, consent-required API route, account/source/provider quotas and analyst page exist. | Automated provider tests use fixtures. | Requires an authorized `ABUSEIPDB_API_KEY` and an approved live test against a public IP. No provider call is assumed from an empty environment variable. |
| IPQualityScore / SEON | Phone reputation adapters and an orchestrator combine provider signals with partial-coverage handling; the route requires user consent and applies quotas. | Automated provider and route tests use fixtures. | Requires `IPQS_API_KEY` and/or `SEON_API_KEY` in the API secret manager and live tests approved under each provider's terms. The submitted phone number is sent to configured providers; this must be disclosed to the user. |
| Quad9 DNS-over-TLS | Android has a user-started DNS-only VPN path forwarding supported IPv4/UDP DNS queries to Quad9 over TLS. | Packet-codec unit tests run in CI. | Requires user VPN consent and physical-device/network validation. It does not cover all device traffic, arbitrary HTTPS, IPv6 DNS, DNS-over-HTTPS, custom DNS or DNS-over-TCP. |
| Security event ingestion | A normalized event endpoint is protected by a dedicated ingestion token and stores events for analyst review. | API tests validate request handling and persistence contracts. | No SIEM/EDR/vendor connector or upstream source is configured by default. It records submitted events; it does not verify detections or perform automatic response. |
| OpenTelemetry | Opt-in HTTP tracing middleware and local observability profile exist. | Build and API tests. | Disabled by default; requires a running collector and server-side OTLP endpoint. PostgreSQL/provider auto-instrumentation is not installed. |
| Mobile platform coverage | Native Android module exists; web console is separate. | Android debug build and unit tests run in CI. | No native iOS project or iOS binary exists in the repository. The Android debug APK is not a Play Store release and has not been certified on physical devices by CI. |
| Trivy | Repository filesystem scan and runtime image scan workflow are defined in `.github/workflows/security.yml`. | Security workflow result must be checked for the exact latest commit; reports are uploaded as workflow artifacts when produced. | The workflow scans built images, not a live deployed registry/runtime. It does not replace dynamic testing, penetration testing, provider account verification or cloud control-plane review. |

## Database connection and migration operations

- Local Docker Compose initializes PostgreSQL from `database/init/` only when the data directory is first initialized.
- For an existing database, do not assume the initialization scripts will rerun. Back up first, inspect the current schema, then apply only migrations that are actually missing.
- The CI PostgreSQL instance is disposable and contains test-only credentials. It is not a production connection.
- The authenticated `GET /health/ready` endpoint performs a `SELECT NOW()` connectivity check. Provider fields in that response indicate credential presence only, not external provider reachability.
- Never commit populated `.env` files, database URLs, provider keys, JWT secrets or service tokens.

## Release and trust boundaries

- The threat-summary endpoint now returns incident counts aggregated from PostgreSQL. It does not fabricate an AI score; the score remains null until a documented, validated scoring model is implemented. Database aggregation does not create live threat telemetry or detect incidents.
- AI-generated assessments are based only on information supplied by an authorized analyst; they are not evidence of an actual incident.
- Attack Path Intelligence is bounded, read-only graph analysis; it does not scan assets or prove exploitability.
- Active Defense / IPS in PR #26 is HTTP/application-layer rate limiting and temporary request-source containment. It is not a host firewall, TCP/UDP IPS, edge WAF or volumetric DDoS mitigation.
- Automated containment, SIEM/EDR source connectors, continuous whole-device protection and iOS support are not verified as implemented production capabilities.
- MASVS/MASTG control groups remain NOT VERIFIED until evidence is recorded for a specific signed app artifact and supported device/OS.
