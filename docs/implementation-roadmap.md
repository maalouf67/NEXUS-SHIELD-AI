# NEXUS SHIELD AI — Implementation Roadmap and Verified Status

Last reviewed: 2026-11-06
Scope: repository code, exact GitHub Actions evidence and integration configuration. No production deployment or full-device protection is implied.

## Current verified architecture

- Next.js web console with same-origin server-side API routes and HttpOnly session cookie.
- Express/TypeScript API with JWT authentication, role checks, PostgreSQL repositories and AI orchestration.
- Python FastAPI file-scanning service with private per-user quarantine and ClamAV integration.
- PostgreSQL schema files 001–008, a checksum-aware migration runner, an API readiness query and disposable PostgreSQL CI coverage.
- Android companion with user-initiated file scanning and a limited DNS-only VPN path. It is not a full-device VPN or antivirus.
- No native iOS application is merged or release-verified on this branch. Draft PR #14 contains a separate React Native/Swift proposal and must remain separate until reviewed and validated.

## Verification snapshot — 2026-11-06

**Code commit tested:** `80fd6792d8bbc5f3197749bd40c33441fe509f76` on `feat/active-defense-ips-baseline`. PR #26 remains Draft and unmerged.

- Build and Test run #387: success — Node/API build and tests, eight PostgreSQL migrations and idempotent re-run, Python 3.11 and 3.13, Android debug build/unit tests, MASVS/MASTG register completeness, and real Docker/ClamAV/web-upload integration.
- Security Checks run #338: success — Dependency Review, Trivy filesystem scan, Trivy PostgreSQL/AI/ClamAV image scans, upstream gosu source parity/reachability check, and root-owned-volume PostgreSQL startup validation.
- CodeQL run: all five configured analyses (JavaScript/TypeScript, Python, Java/Kotlin, Go and GitHub Actions) completed successfully.
- Trivy v0.76.1 reports were downloaded and inspected. The filesystem report recorded 20 successful and 0 failed Dockerfile misconfiguration checks for each of the two scanned Dockerfiles. The filesystem and three runtime-image reports contained no findings in the configured HIGH/CRITICAL result scope. This is not proof that all lower-severity, runtime, cloud or application-level risks are absent.
- The PostgreSQL CI test simulated a root-owned Docker volume and verified PostgreSQL PID 1 runs under the non-root `postgres` UID after initialization. It does not replace a test on the real Railway volume.
- An Android debug APK artifact was produced by CI. It is not a Play Store release and has not been validated on a physical device by this workflow.

The documentation update that follows this snapshot must itself pass the workflows before its commit is treated as validated.

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
- [x] On code commit `80fd6792d8bbc5f3197749bd40c33441fe509f76`, Build and Test run #387, Security Checks run #338, Dependency Review, Trivy filesystem/runtime scans, PostgreSQL gosu/root-volume validation and all five CodeQL language/workflow analyses completed successfully on 2026-11-06.
- [ ] Re-run and retain the same evidence against any later code change; the CI result is commit-specific.
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
- [ ] Review and integrate the separate Draft PR #14 React Native/Swift proposal only after branch reconciliation, API contract review, entitlement/signing checks and real-device tests; no iOS release artifact is verified.
- [ ] Build an interactive threat map only after a trusted event source, freshness metadata, location privacy and provenance controls exist.
- Limitation: the current Android DNS tunnel is not whole-device antivirus or inspection of arbitrary HTTPS/application data. The iOS work remains in a separate draft and is not a verified production capability.

### 8. Workspace isolation and session lifecycle — RELEASE BLOCKERS

- [ ] Issue #24: define workspaces, memberships, active-workspace selection and tenant-scoped integration identities before adding tenant predicates.
- [ ] Scope asset inventory, evidence, relationships, incidents, alerts, security events, reviews, aggregates and audit records to validated server-side workspace membership.
- [ ] Add two-workspace integration tests, row-level access checks and pooled-connection isolation tests; plan an explicit, reversible legacy-data backfill.
- [ ] Issue #25: add random session identifiers and server-side session records/revocation, single-session logout, revoke-all, role-change/user-disable invalidation and fail-closed behavior.
- [ ] Update web and native clients so sign-out attempts server revocation and always clears local credentials without falsely claiming remote revocation.
- Release rule: PR #19's workspace-global inventory/SOC data must not be released as a multi-tenant product until issue #24 is accepted. Local token deletion is not server-side revocation.

### 9. Reverse-engineering lab — TOOLING DOCUMENTED; OPERATIONAL USE NOT VERIFIED

- [x] An optional, isolated MobSF Compose overlay is documented in `docker-compose.reverse-engineering.yml`; it binds to host loopback at `127.0.0.1:8002`, uses a dedicated bridge network, a persistent analysis volume and a Docker secret for its API key.
- [x] `docs/reverse-engineering-lab.md` defines authorized static/dynamic analysis, artifact SHA-256 tracking, disposable test devices/emulators and report requirements.
- [x] The toolchain is pinned in the repository: MobSF v4.6.4, with JADX identified in the MobSF release notes; Apktool, Frida and Ghidra are analyst-workstation tools, not embedded in the NEXUS API or mobile app.
- [ ] Provision and harden a dedicated analysis host with sufficient memory/storage; run MobSF health checks and verify authentication/API-key handling.
- [ ] Test only signed NEXUS artifacts or samples with written authorization; retain reports with hashes, tool versions, dates, reviewers and remediation links.
- [ ] Record actual MASVS/MASTG test evidence against a specific signed APK and supported OS/device.
- Limitation: the current MobSF Compose file is an optional lab, not a production NEXUS service or automatic scan pipeline. The CI MASVS/MASTG job checks register completeness only; it does not run MobSF or certify the app.

### 10. Product roadmap capabilities not yet verified as operational

- [ ] Six specialist AI agents plus one orchestrator: the current runtime has a typed threat-analysis orchestration path with one configured OpenAI provider; a production multi-agent supervisor, independent agent tools, evidence contracts and approval workflow are not verified.
- [ ] Digital Security Twin: persistent asset inventory and bounded read-only attack-path analysis provide foundational data, but a continuously reconciled twin, versioned snapshots and drift/evidence lifecycle are not verified.
- [ ] Global threat map: requires trusted, licensed event/feed sources, freshness/provenance/confidence metadata and privacy-safe geolocation before implementation.
- [ ] Link/scam intelligence: provider adapters exist for IP/phone reputation in scoped flows, but a complete URL/domain reputation pipeline and live provider verdicts are not verified. PR #14 describes IPQualityScore work, not a Malwarebytes integration.
- [ ] Social-account protection and Premium/subscription billing: no end-to-end implementation or live provider verification is evidenced in this roadmap.
- [ ] AI analyst assistant: current AI analysis is explicit and analyst-submitted; it is not an autonomous SOC agent or verified 6+1 system.

### 11. Source-language inventory

- TypeScript: Next.js web console, Express API, shared contracts and the API-side AI orchestration.
- JavaScript: Node.js tooling and configuration/runtime support.
- Python: FastAPI malware-scanning service and ClamAV protocol client.
- Java: native Android companion application.
- SQL: PostgreSQL schema, migrations, repositories and operational queries.
- Go: small vendored/build-time `gosu` utility for the custom PostgreSQL image; not the main application backend.
- Swift and React Native/TypeScript appear in the separate Draft PR #14 proposal; they are not a merged, release-verified iOS application.
- YAML, JSON, CSS and shell scripts are used for CI, package/configuration, web styling and automation.

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
