# Architecture Overview

## Project goal

NEXUS SHIELD AI is a cyber-defense platform foundation with a web console, API, AI-assisted analysis, persistent PostgreSQL workflows and a deliberately scoped Android companion. Repository code, CI validation and live deployment state are tracked separately.

## Monorepo layout

```text
apps/web        -> Next.js web/admin console and same-origin API proxy
apps/android    -> Android companion: on-demand file scanning and limited DNS-only VPN
services/api    -> Express/TypeScript API, authentication, RBAC, PostgreSQL access and AI orchestration
services/ai     -> FastAPI malware-scanning service, private quarantine and ClamAV client
packages/shared -> shared TypeScript contracts
database/init   -> ordered PostgreSQL initialization/migration SQL
```

## AI and scanning boundaries

- Threat-analysis requests are handled by the TypeScript AI layer inside `services/api`. The typed orchestrator selects the configured provider and calls the OpenAI provider using the API server's `OPENAI_API_KEY`.
- The Python FastAPI service is the malware upload/quarantine/scanning boundary. It communicates with ClamAV and does not provide the OpenAI threat-analysis endpoint.
- The web console submits analyst-provided context through the same-origin server-side proxy. The dashboard does not automatically trigger paid AI analysis.
- AI output is an assessment of submitted information, not proof of an incident, compromise or exploitability.
- ClamAV scans user-selected files in an isolated owner-scoped quarantine. It does not inspect every device file or continuously monitor endpoints.

## Data and database access

- The Express API uses a shared PostgreSQL connection pool configured by `DATABASE_URL`.
- TLS certificate verification is enabled by default; set `DATABASE_SSL=false` only for isolated local development. For a remote provider, configure the correct trusted CA when required.
- SQL initialization/migration files are ordered under `database/init/`. Docker applies these automatically only when PostgreSQL initializes a new data directory. Existing databases must be backed up and migrated deliberately; Docker init scripts do not automatically replay on an already initialized volume.
- CI provisions a disposable PostgreSQL database, applies migrations 001–008, verifies the rate-limit counter table, and runs database-backed tests. This is not a test of the production database connection.
- The authenticated `GET /api/health/ready` endpoint tests whether the API can execute a PostgreSQL query. Provider key indicators in this response mean only that credentials are present, not that an external provider is reachable.

## Design principles

- separation of concerns and least privilege
- server-side secret handling only
- validated, typed API boundaries
- transactional persistence and owner-scoped access
- fail-closed behavior when required authentication or security storage is unavailable
- incremental changes, CI evidence and explicit release gates

## Deployment and integration guidance

1. Provision PostgreSQL and apply all pending migrations after a backup.
2. Configure `DATABASE_URL`, TLS and the appropriate CA in the API secret manager.
3. Configure strong JWT, session and service-to-service secrets in the appropriate trusted services.
4. Configure OpenAI, IPQS, SEON and AbuseIPDB credentials only when the corresponding provider is authorized and intended for use.
5. Deploy the ClamAV scanner and private quarantine with persistent storage, network isolation and health monitoring.
6. Deploy the API and web console with trusted origins, proxy-hop settings, TLS, firewall and edge protection verified.
7. Validate integrations using authenticated readiness checks and controlled provider tests; do not equate a successful build with live connectivity.

## Scope limitations

- The Android DNS feature is limited to user-started IPv4/UDP DNS forwarding to Quad9 DNS-over-TLS. It is not a full-device VPN or endpoint antivirus.
- There is no native iOS application in the repository yet.
- Threat-summary dashboard values are demo data until a trusted event source is connected.
- The normalized security-event endpoint is an ingestion contract; no vendor-specific SIEM/EDR source is connected by default.
- Active Defense in PR #26 is HTTP/application-layer rate limiting and temporary source containment, not a host firewall, TCP/UDP IPS, edge WAF or volumetric DDoS mitigation.
- Production database/provider connectivity, cloud volume compatibility and device-level mobile security require environment-specific validation separate from CI.
