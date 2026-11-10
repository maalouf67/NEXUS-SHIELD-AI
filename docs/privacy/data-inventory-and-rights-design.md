# GDPR Data Inventory and Data-Subject Request Lifecycle — Phase 1 Design

**Status:** design-only; not an operational rights workflow and not a legal-compliance assertion.  
**Base:** `main` at `94fa25ca51f1e1628987babed03896cd1304948b`.  
**Scope:** additive documentation only. No schema migration, destructive handler, provider setting, or production database operation is included.

## 1. Data inventory (source-grounded, deployment verification required)

| Category | Current source / storage indicated by repository | Purpose | Access boundary | Retention / deletion evidence |
|---|---|---|---|---|
| Account identifiers and credentials | PostgreSQL `users`; email, role, active state, password hash | Login, account management and authorization | Authenticated account; workspace memberships gate workspace features | User/account deletion procedure and backup retention are not yet verified. Password hashes are not exportable as credentials. |
| Authentication sessions | PostgreSQL `auth_sessions`; JWT `jti`, user reference, expiry, revocation metadata | Session validation and revocation | Session is checked against its user; protected API requires active session | Expiry pruning is bounded on login; account deletion/cascade behavior and backup lifecycle require verification. |
| Workspace, membership and integration credentials | PostgreSQL workspace tables; integration token stored as hash; workspace IDs and membership roles | Tenant separation, access control and service integration | Membership must be active for workspace; integration permission and workspace binding required | Revocation exists for integration token; retention and erasure mapping require verification. Never export raw integration token. |
| Incidents, alerts and activity/audit records | PostgreSQL incident/alert/activity schemas; actor identifiers may be nullable | Security operations, investigation and accountability | Workspace-scoped query and authorization expected on current main | Retention schedule, evidence holds, backup handling and deletion behavior need an owner decision and tests. |
| Security events and reviews | PostgreSQL normalized event/review records, source, timestamps, summary, attributes, actor | SOC event intake and analyst review | Workspace context or workspace-bound integration | Event-specific retention and deletion/anonymization rules are not yet verified. Attribute values may contain personal data; minimize at ingestion. |
| Asset inventory, relationships and evidence references | PostgreSQL assets/relationships/evidence | Asset risk and attack-path analysis | Workspace-bound integration permissions on current main | Ownership/backfill of historical global records must not be guessed; deletion/retention needs mapping. |
| Malware uploads/quarantine samples | Private quarantine/storage plus PostgreSQL sample metadata and scan runs | User-requested malware inspection | Owner-scoped access; scanning service boundary | Source indicates sample expiry after 7 days and scan-run metadata after 30 days; verify storage deletion confirmation, scheduled cleanup, backups and deployed configuration. |
| AI analysis input/output | Submitted fields routed through API orchestrator to configured AI provider; local response | Analyst-assist triage/recommendations | Authenticated, explicit user action; provider secrets server-side | Provider-specific logging/retention and data-transfer region are deployment-dependent and not verified. Minimize/redact personal data. |
| IP/phone reputation lookup data | Submitted IP/phone fields may be sent to configured IPQS, SEON or AbuseIPDB adapters | Reputation verdicts | Authorized API caller; third-party provider | Provider-side retention, contractual terms, location and actual credential configuration need verification. |
| PrivacyHawk profile and scan metadata (PR #38 draft) | Profile fields are sent to provider for scan; draft migration stores consent version, user/provider scan IDs, status and audit events—not the submitted profile itself | Data-broker scan at user's explicit request | Authenticated user-scoped scan access | No live credentials verified; no complete provider-side erasure/withdrawal lifecycle. Draft append-only triggers and `ON DELETE RESTRICT` currently impede erasure and require reconciliation. |
| Browser session and preferences | HttpOnly session cookie; browser storage for language/preferences | Web authentication and UX | Same-origin browser session; origin checks | Cookie clearing exists; local preference expiry/deletion and browser retention are user-agent dependent. |

**Unknowns to resolve with deployment evidence:** exact hosting regions and processors, log/telemetry fields, backup retention and restore behavior, operational privacy contact, production configuration, external provider contracts, and whether scheduled cleanup is actually running.

## 2. Rights/request workflow design

A request must be authenticated/identity-verified before exposing or changing personal data. Do not assume that every request is an absolute erasure: determine scope, applicable right, lawful restrictions, security-evidence necessity, and any legal hold with qualified counsel.

Suggested state machine:

`received → identity_verification → scoped → awaiting_review (if required) → processing → partially_completed / completed / rejected_with_reason`

Additional terminal/exception states: `withdrawn`, `on_hold_legal`, `failed_retryable`. Every transition is timestamped, actor-attributed, and auditable. A request must not be marked completed while any in-scope target lacks verified completion or an approved exception.

### Proposed additive records (future implementation; not added in this design PR)

- `privacy_requests`: opaque request UUID, subject/user reference where appropriate, request type, status, received/verified/due timestamps, requester channel, minimal verification status, policy version, assigned reviewer, and minimal response metadata.
- `privacy_request_targets`: request UUID, system/target category, action (export/correct/delete/restrict/object), opaque target reference, status, attempt count, last attempt/error code (sanitized), completion confirmation timestamp, and approved exception code.
- `privacy_request_history`: append-only status transition and reviewer decision history with actor ID, timestamp, and minimal reason code.
- Avoid storing full profile data, identity documents, secrets, raw provider responses, or free-text sensitive payloads in request/audit tables. If verification evidence is required, store only a reference in a controlled vault and set a short reviewed retention period.

Schema design must use additive migration files and align with current migration ordering; do not reuse an existing migration number.

## 3. Execution controls per right

- **Access/export:** produce a subject-scoped, documented export of in-scope records; exclude passwords, raw session tokens, integration secrets, unrelated third-party data, and information restricted by law. Validate completeness against inventory and access checks.
- **Rectification:** update source-of-truth records, propagate to processors only where supported, record per-target confirmation; avoid silently rewriting immutable security evidence—use correction/annotation with provenance.
- **Erasure:** inventory every system and processor target; delete only after identity, scope, authorization, and legal-hold checks. Record confirmed deletion, or an exception with reason and reviewer. Coordinate database rows, quarantine object, provider-side data, logs, and backups; do not infer success from issuing a DELETE statement.
- **Restriction/object:** disable relevant processing where technically possible, mark restricted scope, and ensure downstream jobs/providers respect the flag; record exceptions.
- **Consent withdrawal:** separate withdrawal from account erasure. Stop future optional provider processing; reconcile already-submitted provider scans and remote records according to verified provider capabilities and lawful retention.
- **Backups:** define expiry and restore-time reapplication (deletion tombstones/request ledger) so erased records do not reappear after recovery. Backup destruction is not instant and must be disclosed accurately.

## 4. Security and test acceptance gates

1. Every request endpoint requires authentication, subject ownership, and least-privilege staff review; cross-user and cross-workspace attempts are denied.
2. Identity verification is proportional, avoids collecting excessive identity data, and does not reveal account existence before verification.
3. Duplicate requests are idempotent; handlers are retryable; partial failure remains visible and never becomes false completion.
4. Per-target completion requires a verifiable downstream response, object deletion confirmation, or reviewed lawful exception.
5. Legal holds prevent destructive actions and are scoped, reviewed, time-bound where applicable, and auditable.
6. Test duplicate submission, invalid identity, user A vs user B, workspace A vs B, export completeness, failed processor call, timeout/unknown result, retry, partial deletion, legal hold, consent withdrawal, backup restore/tombstone replay, and audit tamper resistance.
7. Provider-specific deletion and retention are tested using sandbox/synthetic subjects before enabling production.
8. Update the privacy notice only to state behavior proven in source and deployment. Require qualified legal review; this design is not legal advice or a claim of GDPR/CNDP compliance.

## 5. Phase plan

- **Phase 1 (this document):** inventory, unknowns, request state machine, and acceptance gates.
- **Phase 2:** reviewed additive schema and migration tests.
- **Phase 3:** authenticated request API and per-target orchestration with dry-run/read-back verification.
- **Phase 4:** UI, support contact configuration, subject export, erasure/restriction, and processor integrations.
- **Phase 5:** production evidence, retention/backup verification, legal review, and release approval.

No destructive data handling, live provider transfer, migration, or deployment is authorized by this design document.
