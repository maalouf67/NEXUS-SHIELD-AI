# NEXUS SHIELD AI — Integration Strategy & Feature Delivery Plan (2026)

**Review date:** 2026-11-05  
**Repository baseline:** `main` at `8ffd06d48f7e4519225ae4d6ccea9290eb906c6c`  
**Status:** Research and implementation plan. This document does not claim that any new external service has been installed, configured, tested, or deployed.

## 1. Operating rules

1. Preserve the existing monorepo and reuse its current services before adding dependencies or services.
2. Work on feature branches and submit pull requests. Do not push feature work directly to `main`.
3. Do not delete, rename, or move existing files as part of this plan.
4. Treat external provider output and all AI output as untrusted data. Validate it against schemas and preserve provenance.
5. Default all AI agents to read-only analysis. Human approval is required before blocking, quarantining, deleting, disabling an account, revoking a session, or changing production configuration.
6. Never send a user's uploaded file, private event payload, social-account data, or personal identifier to an external intelligence provider without a separate, informed consent flow.
7. A source file, successful unit test, or successful CI run is not proof of production operation. Every capability must have an explicit evidence level.

## 2. Current repository baseline observed

The repository already contains useful foundations; avoid duplicating them:

| Area | Existing evidence in repository | Gap to resolve |
|---|---|---|
| Web and API | Next.js web application, Express API, typed API helpers and route tests | Verify browser → web proxy → API → database flows and failure handling |
| AI | `services/api/src/ai`, AI SDK 7, OpenAI provider adapter, threat-analysis agent and orchestrator | Only OpenAI is registered at runtime; six specialist agents and production failover are not complete |
| Identity | JWT, bcrypt, Admin/Analyst/Viewer roles and user routes | Session revocation, tenant boundaries, MFA and authorization coverage need verification |
| SOC | Incidents, alerts, security events, asset inventory and attack-path engine | Event correlation, real-time updates and tenant scoping need proof |
| File inspection | ClamAV adapter, malware-scan routes and isolated upload/quarantine design | Verify live scanner readiness, signature freshness, retention and failure paths |
| Network | Android DNS-over-TLS / Quad9 code | DNS-only scope; device consent, lifecycle, telemetry and real-device testing remain necessary |
| Reputation | AbuseIPDB IP reputation and phone-reputation components | Check live credentials, provider terms, quotas and production connectivity |
| Observability | Opt-in OpenTelemetry HTTP tracing | Add safe metrics/logs and database/provider spans without recording secrets or sensitive payloads |
| Security CI | Trivy and GitHub Actions workflows | Fix current Trivy result; add/verify SAST, secret scanning, SBOM and release provenance |
| Billing/social | No verified complete subscription or social-account integration | Do not advertise or charge for these capabilities yet |

### Open repository blockers

- `main` is currently reported by GitHub as unprotected. It has no required status checks configured.
- PR #18 proposes a non-root PostgreSQL image. It remains open and targets `main`. Its description warns that the existing Railway volume may require `RAILWAY_RUN_UID=0` before deployment; do not deploy until runtime compatibility is verified.
- PR #19 adds database-backed threat counts, read-only inventory/attack-path endpoints and status-only Android DNS telemetry. It currently targets `fix/trivy-postgres-nonroot`, not `main`. Its description states that inventory is workspace-global and does not yet provide tenant isolation. Rebase/retarget only after PR #18 is reviewed and its base is stable.
- The Security Checks run on `main` failed in the Trivy filesystem/configuration scan. The Dependabot `minimatch` job also failed; its cause still needs log-level diagnosis.

## 3. Recommended external tools and intelligence sources

These are candidates, not installed integrations. Validate commercial-use rights, data handling, quotas, latency and availability before enabling any feed.

| Capability | Candidate | Why it fits | Integration decision |
|---|---|---|---|
| Endpoint / SOC telemetry | [Wazuh](https://documentation.wazuh.com/current/getting-started/components/index.html) | Open-source SIEM/XDR foundations: endpoint agents, log analysis, malware/intrusion detection, file-integrity monitoring and vulnerability detection | Integrate selected alerts/events through an adapter if NEXUS needs external endpoint telemetry; do not self-host the full stack until operational capacity is assessed |
| Threat-intelligence management | [OpenCTI](https://docs.opencti.io/latest/usage/import/getting-started/) | Connectors, enrichment, streams and TAXII/STIX 2.1 import/export support | Future central intelligence layer if feed volume and graph correlation justify operating it |
| Threat-intelligence sharing | [MISP](https://www.misp-project.org/features/) | REST/OpenAPI, PyMISP, workflows, enrichment modules, STIX formats and ZMQ/Kafka streaming | Alternative to OpenCTI for sharing and analyst workflows; choose one first rather than deploying both immediately |
| Malware-distribution URLs | [URLhaus](https://urlhaus.abuse.ch/api/) | API and downloadable malware-URL datasets; can complement file and DNS signals | Good first feed candidate. Requires an Auth-Key; commercial/for-profit use may require the enhanced commercial service |
| Phishing URLs | [OpenPhish](https://openphish.com/phishing_feeds.html) | Community feed is available with limited fields and a 12-hour refresh; premium feeds advertise five-minute updates and richer metadata | Start with community feed only after reviewing its terms; do not promise five-minute freshness on the free feed |
| Phishing lookups | [PhishTank](https://www.phishtank.org/developer_info.php) | API and downloadable databases for URL lookups; database downloads are updated hourly | Secondary signal; follow the required User-Agent, application-key and rate-limit rules |
| Multi-engine enrichment | [VirusTotal API](https://docs.virustotal.com/docs/api-overview) | Useful for licensed enrichment and investigation context | Do not use the free Public API in a commercial NEXUS product: VirusTotal states it is non-commercial only and limited to 4 requests/minute and 500/day. Evaluate a paid/private agreement only if justified. Do not upload private samples without explicit consent |
| IP reputation | [AbuseIPDB](https://www.abuseipdb.com/api) | IP abuse confidence and reports | Reuse the existing adapter; verify key, quotas and live response before labeling it production-connected |
| DNS threat blocking | [Quad9](https://docs.quad9.net/services/) | DNS-over-TLS/HTTPS threat-blocking resolver | Reuse the existing Android path; describe it as DNS protection, not full traffic inspection or antivirus |
| File malware inspection | [ClamAV](https://docs.clamav.net/) | Signature-based file scanning with daemon protocol | Reuse the existing isolated scanner. ClamAV explicitly is not a complete endpoint-security suite; monitor signature age, daemon health and scan timeouts |
| Supply-chain / IaC | [Trivy](https://github.com/aquasecurity/trivy) | Scans containers, filesystems, Git repos, dependencies, IaC, secrets and SBOM-related targets | Keep the existing CI scanner and fix its current blocker first |
| Code security | [GitHub CodeQL](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning) and [Semgrep](https://semgrep.dev/products/semgrep-appsec-platform/) | Static code analysis for supported languages; Semgrep also offers secret and supply-chain capabilities | Select one primary SAST path initially; avoid duplicated alerts and unreviewed workflow replacement |
| Observability | [OpenTelemetry](https://opentelemetry.io/docs/) | Vendor-neutral traces, metrics and logs across TypeScript/Python services | Extend the existing opt-in setup with redaction, correlation IDs and provider/DB spans; never log tokens, raw URLs with secrets or file contents |
| Mobile integrity | [Google Play Integrity](https://developer.android.com/google/play/integrity/overview) and [Apple App Attest](https://developer.apple.com/documentation/DeviceCheck/establishing-your-app-s-integrity) | Server-verifiable signals for genuine app instances and sensitive requests | Later hardening for account/premium actions; use tiered risk decisions, nonce/request-hash checks and graceful compatibility handling |
| Application security baseline | [OWASP ASVS 5.0](https://asvs.owasp.org/), [OWASP API Security Top 10](https://api-security.owasp.org/), [OWASP LLM Top 10](https://genai.owasp.org/llm-top-10/) | Testable requirements for application, API and AI-specific security risks | Convert relevant controls into test cases and release gates; do not claim certification |
| Mobile security baseline | [OWASP MASVS](https://mas.owasp.org/MASVS/) and [MASTG](https://mas.owasp.org/MASTG/) | Mobile app security control and testing guidance | Continue using the repository's mobile control register and attach evidence to each tested build |
| Payments | [Stripe availability](https://stripe.com/global) / [Paddle supported countries](https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle) | Recurring billing, webhook-driven entitlement changes and merchant compliance | Stripe's current supported-country list does not include Morocco. Paddle is a candidate to evaluate, but seller onboarding, KYC, payout method and legal suitability must be verified before choosing it. No payment provider is approved or configured by this plan |

## 4. Proposed NEXUS 6+1 agent design

Keep the current TypeScript API and AI SDK integration as the starting point. Do not introduce a second agent runtime or a broad rewrite before measuring the current orchestrator.

**Six bounded specialist agents:**

1. **URL & Phishing Agent** — normalizes URLs, checks URLhaus/OpenPhish/PhishTank and existing reputation signals, explains evidence and freshness.
2. **File & Malware Agent** — orchestrates the existing ClamAV scan path, records hash/signature metadata and reports scanner errors distinctly from clean results.
3. **Network & IP Agent** — analyzes IP reputation, DNS protection status and network indicators using approved sources.
4. **Identity & Account Agent** — reviews account/session security signals and consented social-account integration status; never requests or stores social passwords.
5. **Application & Cloud Agent** — triages authorized web/API/cloud security findings and maps them to relevant controls.
6. **SOC & Incident Agent** — deduplicates and correlates normalized events, summarizes incidents and proposes response steps without executing them.

**+1 NEXUS Orchestrator** — validates the task, chooses only agents with implemented capabilities, enforces budgets/timeouts, merges evidence, records provenance and returns a typed result. It must not invent telemetry or silently treat missing providers as a clean result.

Each agent should expose a versioned input/output schema containing:
- `status`: `completed`, `partial`, `unavailable`, `error` or `not_checked`
- `evidence[]`: source, indicator type/value (redacted where needed), observed time, fetched time and source reference
- `verdict`: finding and severity, explicitly separated from hypotheses
- `confidence`: calibrated/qualified confidence, never presented as certainty
- `recommendations[]`: advisory actions and required permission/approval
- `limitations[]`: unavailable feeds, quota limits, stale data and unverified runtime dependencies

**Agent safety boundary:** no unrestricted shell, SQL, browser navigation, arbitrary URL fetching or production write access. Tool access is allowlisted and scoped server-side. Require a human confirmation for containment, blocking, quarantine, account/session changes and destructive operations. Treat web pages, threat feeds, files and model outputs as untrusted content to defend against prompt injection and unsafe output handling.

## 5. Feature-specific integration design

### Global Threat Map
- Build from verified threat indicators and their source timestamps, not synthetic dashboard counts.
- Normalize indicators to an internal schema and preserve source, confidence, first-seen, last-seen and expiry.
- Geolocate threat infrastructure only at an appropriately coarse level. Do not expose a customer's precise IP/location or imply that an IP's geolocation identifies a person.
- Show source coverage, feed freshness and unknown location explicitly.

### SOC Center
- Normalize event envelopes across API, scanner, DNS and intelligence feeds.
- Add stable event IDs, deduplication keys, event time vs ingestion time, tenant/workspace scope and audit references.
- Add correlation rules before using AI summaries. AI can prioritize and explain; only evidence-backed rules may confirm a detection.
- Introduce streaming only after persisted event ordering, reconnection and backpressure have tests.

### URL and fraud scanner
- Start with feed lookups and safe normalization; do not fetch arbitrary user-supplied URLs from the API process.
- If content retrieval is later needed, use a separate isolated fetcher with strict egress policy. Block loopback, private, link-local and cloud-metadata ranges; re-check DNS and every redirect to mitigate SSRF and DNS rebinding.
- Separate `malicious`, `suspicious`, `not_listed` and `unknown`. A URL absent from a feed is not proven safe.
- Never silently submit checked URLs or files to third parties; disclose the destination and purpose first.

### Digital Security Twin
- Reuse current asset inventory and attack-path engine.
- Model assets, identities, services, exposures and relationships with source and observation time.
- Render a read-only graph first; distinguish observed edges from inferred paths.
- Do not label a graph simulation as a live attack or claim automatic remediation.

### Social-account protection
- Use official OAuth/API integrations and the minimum read-only scopes that solve a documented user problem.
- Store revocable tokens server-side with encryption and access audit; never collect platform passwords or scrape private content.
- Show exactly which provider, scopes, permissions, checks and last-sync time are active.

### Accounts and Premium
- Complete tenant/workspace isolation before offering organization-wide SOC data.
- Enforce entitlements server-side on every premium API route; the UI is not an authorization control.
- Process signed payment webhooks idempotently; derive entitlement state from verified provider events, not browser redirects.
- Add renewal, grace period, cancellation, refund, chargeback and failed-payment tests before charging users.

## 6. Delivery sequence and acceptance gates

### P0 — Repository and release safety
- Review PR #18 including Dockerfile diff, Railway volume compatibility and complete CI results.
- Fix the Trivy failure and diagnose the Dependabot `minimatch` failure from job logs.
- Review PR #19's diff and tests; resolve the tenant-isolation gap before exposing multi-user inventory.
- Add a GitHub ruleset for `main`: pull-request-only changes, required passing checks, no force-push or deletion. Configure the exact check names only after verifying stable CI job names; avoid a review-count rule that would make a solo-maintained repository impossible to merge.
- Do not change Railway service variables, volumes or deployments as part of this stage.

### P1 — Reliability and connectivity
- Add explicit readiness checks for API, PostgreSQL, AI provider and ClamAV; distinguish readiness from liveness.
- Test request IDs, timeouts, retry caps, circuit breaking, database pool exhaustion, provider rate limits and safe failure behavior.
- Extend OpenTelemetry with redaction and low-cardinality metrics.
- Add end-to-end contract tests across web proxy → API → database/AI service.

### P2 — Threat-intelligence foundation
- Define one normalized indicator schema and provider adapter contract.
- Add URLhaus and one phishing source as opt-in adapters after confirming terms/keys.
- Add caching, expiry, rate limits, provenance, feed freshness and provider-unavailable behavior.
- Test with fixtures first; live tests must be explicit and separately gated.

### P3 — Agent foundation
- Implement one specialist at a time using the existing AI SDK and Zod schemas.
- Add evaluation cases for prompt injection, untrusted tool output, data leakage, invalid structured output, timeout, budget exhaustion and false positives.
- Implement human approval gates and audit events before adding any write-capable tool.
- Add the remaining agents only when their underlying data source and tests exist.

### P4 — SOC, map and Twin
- Complete normalized event persistence, correlation and tenant checks.
- Replace all fabricated counts with database-backed or feed-backed results.
- Add map layers and Twin graph only when their source metadata and freshness are visible.

### P5 — Identity, mobile and billing
- Complete tenant-aware auth/session lifecycle and MFA plan.
- Validate Android DNS behavior on real devices; keep its scope explicit.
- Assess Play Integrity and App Attest after app signing/distribution prerequisites are satisfied.
- Integrate social OAuth and Premium payment only after provider eligibility, privacy notices and server-side tests.

### P6 — Production verification
A feature can be labeled production-ready only after successful CI, integration tests, deployment verification, real-provider health checks, observability, privacy review and an explicit release approval. Keep all unverified capabilities marked as such.

## 7. Minimum release evidence

- TypeScript build/lint/unit tests and Python validation pass.
- API contract and disposable-PostgreSQL integration tests pass.
- Trivy, SAST, dependency and secret scans pass without unexplained high/critical findings.
- SBOM generated and retained; release artifact provenance/signing reviewed.
- Role, tenant-isolation, session-revocation and rate-limit tests pass.
- Scanner-unavailable, provider-timeout, stale-feed, duplicate-event and invalid-webhook cases pass.
- Mobile tests run on identified devices/OS versions and artifacts; CI debug build alone is not device validation.
- Production environment and external integrations are verified separately from local/CI evidence.

## 8. Official reference links

- Wazuh components: https://documentation.wazuh.com/current/getting-started/components/index.html
- OpenCTI connectors and STIX 2.1: https://docs.opencti.io/7.260522.0/deployment/connectors/
- MISP features: https://misp-project.org/features/
- URLhaus API: https://urlhaus.abuse.ch/api/
- OpenPhish feeds and terms: https://openphish.com/phishing_feeds.html
- PhishTank developer information: https://www.phishtank.org/developer_info.php
- VirusTotal Public vs Private API: https://docs.virustotal.com/docs/difference-public-private
- Quad9 services: https://docs.quad9.net/services/
- ClamAV documentation: https://docs.clamav.net/
- Trivy: https://trivy.dev/
- OpenTelemetry: https://opentelemetry.io/docs/
- OWASP ASVS 5.0: https://asvs.org/
- OWASP API Security Top 10: https://api-security.owasp.org/
- OWASP LLM Top 10: https://genai.owasp.org/llm-top-10/
- Android Play Integrity: https://developer.android.com/google/play/integrity/overview
- Apple App Attest: https://developer.apple.com/documentation/DeviceCheck/establishing-your-app-s-integrity
- GitHub rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- Stripe availability: https://stripe.com/global
- Paddle seller availability: https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle

---
**Change policy:** This document adds a plan only. It does not install dependencies, create provider accounts, add credentials, change repository protections, alter production services, modify database schemas, or deploy the product.
