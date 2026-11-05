# NEXUS SHIELD AI — Implementation Roadmap and Verified Status

Last reviewed: 2026-11-05
Scope: repository code, exact GitHub Actions evidence and integration configuration. No production deployment or full-device protection is implied.

## Current verified architecture

- Next.js web console with same-origin server-side API routes and HttpOnly session cookie.
- Express/TypeScript API with JWT authentication, role checks, PostgreSQL repositories and AI orchestration.
- Python FastAPI file-scanning service with private per-user quarantine and ClamAV integration.
- PostgreSQL schema files 001–008, a checksum-aware migration runner, an API readiness query and disposable PostgreSQL CI coverage.
- Android companion with user-initiated file scanning and a limited DNS-only VPN path. It is not a full-device VPN or antivirus.
- No native iOS project exists in the repository.

## Recent implementation changes

- [x] Replaced the fixed sample threat-summary endpoint with authenticated PostgreSQL incident aggregates.
- [x] Removed the fabricated dashboard AI score. It remains null until a validated scoring model is implemented.
- [x] Added tests for authorization, database-derived counts, and safe database failure behavior.
- [x] Made PostgreSQL TLS roots provider-aware: custom CA when configured, Supabase CA only for Supabase hosts, Node's system trust roots for other providers.
- [x] Added PostgreSQL TLS configuration tests.
- [x] Added db:check and db:migrate root/API commands.
- [x] Added a migration runner with advisory locking, per-file SHA-256 checksums and transactional execution.
- [x] Changed CI to use the application migration runner and verify all eight migrations plus idempotent re-run behavior.
- [x] Extended Trivy to filesystem vulnerability/misconfiguration/secret scans and PostgreSQL, AI and ClamAV runtime image scans.
- [x] Added a PostgreSQL root-owned Docker-volume startup simulation to CI. This is a local compatibility preflight, not proof of Railway deployment behavior.
- [x] Documented actual integration state and security limitations.

## Workstreams and remaining requirements

### 1. Database connectivity and migrations — CODE IMPLEMENTED; EXTERNAL CONNECTION NOT VERIFIED
- [x] Shared PostgreSQL pool uses DATABASE_URL and verifies TLS by default.
- [x] API readiness checks a real SQL query.
- [x] Migrations 001–008 included in CI and applied through the application migration runner.
- [x] Migration checksums and an advisory lock prevent unnoticed historical edits and concurrent runs.
- [ ] Connect an authorized hosted PostgreSQL instance by configuring DATABASE_URL and its TLS CA in the server secret manager.
- [ ] Validate a backup and restore, production schema compatibility, least-privilege API role, pool sizing and failover.
- [ ] Validate Railway persistent-volume startup with the actual service settings and volume. CI only simulates the root-owned volume behavior locally.

### 2. Active Defense / IPS — APPLICATION-LAYER BASELINE IN DRAFT
- [x] PostgreSQL-shared login failure counters.
- [x] HTTP anomaly inspection and temporary source containment.
- [x] Privacy-preserving HMAC source fingerprints and deduplicated security events.
- [x] IPv6 normalization, liveness exemption and HTTP server limits.
- [x] Unit and PostgreSQL integration tests in the PR branch.
- [ ] Complete current Build/Test, image-scan, upstream gosu reachability and root-volume CI gates on the exact final commit.
- [ ] Validate TRUST_PROXY_HOPS against the actual hosting network.
- [ ] Validate database outage behavior, concurrency, false-positive rates, latency and event visibility under controlled load.
- [ ] Configure host firewall, origin lockdown, TLS and edge WAF/DDoS protection as separate infrastructure controls.
- Limitation: this PR is HTTP/application-layer containment, not TCP/UDP packet IPS, host firewall, edge WAF or volumetric DDoS mitigation.

### 3. AI threat analysis — ONE RUNTIME PROVIDER
- [x] Express threat-analysis route and typed orchestration.
- [x] OpenAI provider adapter uses server-side OPENAI_API_KEY.
- [ ] Configure an authorized OpenAI key in the API secret manager and run a controlled live request.
- [ ] Add real Anthropic/Gemini/DeepSeek adapters only after credential, contract, privacy and test work.
- [ ] Add tested retry/timeout/budget controls and persistence/audit records.
- [ ] Add validated, versioned risk scoring before exposing an AI score in the dashboard.
- Limitation: test doubles do not constitute live multi-provider failover; AI output is an assessment of submitted information, not proof of compromise.

### 4. Malware scanning — CI INTEGRATION; PRODUCTION OPERATIONS OPEN
- [x] FastAPI scanning boundary, private owner-scoped quarantine and ClamAV client.
- [x] Web upload gateway, scan history, benign fixture and harmless EICAR detection tests.
- [ ] Deploy scanner and quarantine to a trusted host with persistent storage, network isolation, resource limits and monitoring.
- [ ] Confirm signature-update freshness, scanner health alerting, retention cleanup and restore procedures in the deployment.
- [ ] Verify the exact production image digests with Trivy and record runtime inventory.

### 5. Reputation providers — CODE ADAPTERS EXIST; LIVE CREDENTIALS NOT VERIFIED
- [x] AbuseIPDB, IPQS and SEON server-side adapters, consent gates and provider tests.
- [ ] Add authorized provider credentials to the API secret manager.
- [ ] Test each enabled provider with a permitted low-risk request, verify regional endpoint and quotas, and review vendor data-processing requirements.
- [ ] Record live provider reachability separately from credential presence.

### 6. Security telemetry and operations — INGESTION CONTRACT, NOT A LIVE SIEM
- [x] Normalized security-event ingestion API with a dedicated token and database storage.
- [ ] Connect a trusted upstream SIEM/EDR/firewall source and validate signatures, delivery retry, timestamp integrity and source identity.
- [ ] Build monitored alert rules and a documented analyst response procedure.
- [ ] Add OpenTelemetry collector and export configuration before enabling trace export.
- Limitation: event ingestion stores submitted events; it does not confirm detections or automatically create incidents, alerts or response actions.

### 7. Mobile and threat map — PARTIAL / NOT IMPLEMENTED
- [x] Android debug app and unit tests.
- [x] On-demand selected-file scanning integration.
- [x] User-started DNS-only IPv4/UDP VPN forwarding to Quad9 DNS-over-TLS.
- [ ] Physical-device verification, VPN lifecycle/reconnect and battery/network interruption tests.
- [ ] Expand mobile network/security functionality only within OS permissions and user consent.
- [ ] Create native iOS app and separately review required Network Extension entitlements/signing.
- [ ] Build an interactive threat map only after a trusted event source, freshness metadata, location privacy and provenance controls exist.
- Limitation: the current Android DNS tunnel is not whole-device antivirus or inspection of arbitrary HTTPS/application data; iOS support is absent.

## CI / security evidence rules

- Build and Test, Trivy filesystem/image scans, Dependency Review, database migrations and mobile build statuses must be checked against the exact current PR head.
- A prior run passing does not validate a newer commit.
- A clean filesystem scan does not prove that images or production runtime are clean.
- CVE/VEX exceptions require evidence scoped to the exact component and vulnerability. Broad ignores are prohibited.
- MASVS/MASTG control groups remain NOT VERIFIED until evidence is recorded for a specific signed app artifact and supported device/OS.

## Release policy

- PR #26 remains Draft until all final CI gates and operational release requirements are satisfied.
- No production deployment, external service credential, database migration or server configuration is authorized by this roadmap.
- Do not market planned or code-only integrations as live services.
