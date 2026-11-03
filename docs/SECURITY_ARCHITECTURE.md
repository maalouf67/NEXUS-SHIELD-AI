# NEXUS SHIELD AI — Security Architecture Blueprint

**Status: architecture blueprint / staged implementation.** This document does not claim that endpoint antivirus, live telemetry, automated containment, or external threat feeds are deployed.

## Goals
- Protect the web application, API, credentials, and stored data.
- Reduce attack surface with deny-by-default access, least privilege, validation, rate limiting, and audit trails.
- Support safe, evidence-based detection and analyst triage.
- Design file inspection without executing submitted files on the API host.
- Minimize personal data and make consent and retention explicit.

## Languages and components

| Layer | Technology | Purpose |
|---|---|---|
| Web console and BFF | TypeScript / Next.js | UI, server-side session checks, controlled API proxy |
| Core API | TypeScript / Express / Zod | Auth, RBAC, validation, events/incidents APIs |
| AI-assisted triage | Python / FastAPI / Pydantic | Analyst-submitted evidence assessment |
| High-performance scan adapter (future) | Rust | Bounded parsing, streaming hashes, scanner orchestration |
| Persistence | PostgreSQL / SQL migrations | Accounts, assets, incidents, scan metadata, audit trail |
| Signature scanner (future) | ClamAV daemon protocol | Signature-based malware detection when configured |
| Threat intel connectors (future) | TypeScript/Python adapters | Provider feeds with provenance and license checks |

Rust is planned, not currently compiled or deployed as a scanner. Begin with a maintained scanner such as ClamAV behind a narrow adapter; do not claim a home-grown engine detects all malware.

## Defense layers
1. Edge/transport: TLS at deployment edge, strict host/origin policy, security headers, request-size caps, abuse protection.
2. Identity: short-lived access tokens, protected sessions, password hashing, session revocation; MFA for privileged accounts is a planned enhancement.
3. Authorization: server-side RBAC on every sensitive route; admin, analyst, viewer; never trust client role fields.
4. Application: schema validation, parameterized SQL, CSRF/origin checks for cookie mutations, rate limits, safe errors, dependency review.
5. Secrets: server-only secret manager/environment; never NEXT_PUBLIC, git, logs, or screenshots.
6. Data: encryption in transit; at-rest encryption configured at infrastructure/provider layer; tenant isolation, minimal collection, retention and access audit.
7. Detection: normalized event ingestion, deduplication, evidence provenance, severity mapping, human review; demo metrics stay labeled.
8. AI: treat model output as untrusted advisory; no autonomous execution, deletion, blocking, quarantine, or incident confirmation solely by AI.
9. Malware inspection (planned): isolated upload gateway, strict file caps/type policy, generated IDs, SHA-256 streaming, scanner adapter, private quarantine, timeout/resource caps, archive expansion limits, analyst release, audit. Never execute uploads.
10. Operations: dependency/secret scanning, SAST, SBOM, signed releases, backup/restore tests, incident runbooks.

## Malware inspection lifecycle (planned)
RECEIVED → VALIDATED → HASHED → QUARANTINED → SCANNING → CLEAN / DETECTED / ERROR / TIMEOUT → REVIEWED → EXPIRED/DELETED

- Samples must not be served from a public web directory. Use private isolated storage with no execution permission.
- Do not trust filenames or MIME type. Apply streaming size caps, timeout, memory/CPU caps and archive depth/expansion limits.
- Reject password-protected archives unless a controlled workflow is added.
- Keep scanner signature freshness monitored. A clean verdict is not a guarantee of harmlessness.
- Do not submit files to external multi-scanner services without separate explicit consent and disclosure.
- Dynamic sandboxing and auto-remediation are future stages isolated from production.

## Privacy and data classification
- Secrets: API keys/session secrets/service tokens; never log or persist in app tables.
- Restricted: samples, raw events, user identifiers; strict access and short justified retention.
- Internal: incident notes/config; RBAC and audit.
- Public: approved help, license and policy text.
Redact credentials and personal data from AI prompts, events and support requests. Export/deletion and retention promises must only be published after implementation and validation. Privacy/legal pages in the app are drafts.

## Release gates
Require TypeScript build, unit/API integration tests on disposable DB, Python tests, dependency audit, secret scan, SAST, SBOM and migration-order validation. Test role boundaries, file limits, malformed archives, scanner unavailable/timeouts and path traversal. Do not use live malware in ordinary CI. No production release without explicit owner approval.

## Capability truth
Implemented foundations: web console, TypeScript API, PostgreSQL-backed inventory/incidents/alerts/events, role checks, event intake and analyst review, attack-path graph analysis, analyst-submitted AI analysis plumbing.

Not active/verified: endpoint agent, device/network discovery, deployed ClamAV engine/signature updates, user-facing upload and quarantine staging pipeline, scan queue/dashboard integration, dynamic sandbox, threat-feed connectors, MFA, retention enforcement, autonomous response, production deployment. A Python ClamAV adapter and authenticated scan-file endpoint now exist in code, but they are not deployed or connected to an upload flow.

## Phases
- P0 Security baseline and threat model.
- P1 App trust center: settings, language, privacy preference, help, contact, license and policy drafts.
- P2 Malware scan foundation: upload contract, metadata, quarantine and scanner adapter interface; no execution.
- P3 Isolated ClamAV service, auth adapter, queue, signature freshness and tests.
- P4 Threat-intel connectors, provenance, rate limits, cache and licensing.
- P5 Endpoint agent only after platform permissions, update signing, tamper controls and privacy review.
- P6 Independent penetration test, legal review, retention, response, backups and explicitly approved release.

## References
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- NIST SSDF: https://csrc.nist.gov/Projects/ssdf
- ClamAV docs: https://docs.clamav.net/
