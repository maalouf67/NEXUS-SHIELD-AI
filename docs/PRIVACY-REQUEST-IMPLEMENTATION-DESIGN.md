# NEXUS SHIELD AI — Data Subject Rights Implementation Design

**Status:** technical design only; no schema or runtime behavior is changed by this document.  
**Issue:** #32  
**Target branch:** `feat/privacy-data-subject-rights`  
**Depends on:** completion of Phase 1 deployment evidence and workspace ownership decisions.

## 1. Goals and non-goals

Build an auditable, authenticated workflow for receiving, verifying, reviewing, fulfilling and closing data-subject requests. The system must support access, rectification, erasure, restriction, objection and portability where applicable, while allowing a documented legal exception or a verified technical limitation to be reviewed rather than silently treated as completion.

This design does not claim that every right applies to every record or that NEXUS is GDPR / Moroccan Law 09-08 compliant. The controller must determine applicable law, identity-verification requirements, legal bases, response deadlines, exceptions, processor obligations and cross-border transfer safeguards with qualified counsel and the relevant supervisory authority.

The existing Privacy Guard scan endpoint is unrelated to this lifecycle. It is a consent-gated no-op placeholder and must not be repurposed as a rights-request API.

## 2. Security and correctness invariants

1. **No unauthenticated account lookup.** An account holder may create a request only from a valid authenticated session. Requests made by an authorized representative require a separately verified process.
2. **No identity enumeration.** Public-facing responses must not reveal whether an email/account exists. The authenticated account route may return its own request IDs only.
3. **No direct account-row deletion.** Never implement erasure as `DELETE FROM users`. Existing foreign keys, SOC evidence and external quarantine objects require coordinated handling.
4. **No guessed ownership.** Assets, incidents, security events and related evidence currently include global records without a reliable user/workspace owner. They must not be exported or erased for an individual until workspace/tenant ownership and provenance are implemented and reconciled.
5. **No silent success.** Every in-scope target must end in a confirmed completion, a reviewed legal exception, or an explicit blocked/escalated state. Provider timeout or unavailable storage is not deletion success.
6. **Idempotent execution.** Each target action has a stable idempotency key; retries must not duplicate exports, erase unrelated records or create conflicting audit events.
7. **Least-privilege access.** Subject sees only their own request status; privacy operators see only assigned requests and minimum metadata; legal-hold decisions require a distinct authorized reviewer.
8. **Data minimization.** Do not copy raw personal payloads, credentials, bearer tokens, password hashes, phone numbers or uploaded content into request events or logs.
9. **Append-only audit trail.** State transitions and decisions are recorded with actor, timestamp and reason code. Corrections are new events, not mutation of old history.
10. **Fail closed.** Missing provider configuration, ambiguous ownership, incomplete inventory, failed storage deletion or unverified identity blocks completion.

## 3. Proposed additive data model

The following is a logical schema proposal, not executable migration SQL.

### `privacy_requests`

- `id` UUID primary key, generated server-side.
- `subject_user_id` UUID nullable FK to users with `ON DELETE SET NULL`; preserve request accountability without retaining an unnecessary live account link after closure.
- `request_type` enum: `access`, `rectification`, `erasure`, `restriction`, `objection`, `portability`.
- `status` enum: `received`, `identity_verification_required`, `verified`, `in_review`, `processing`, `blocked`, `completed`, `rejected`, `withdrawn`.
- `received_at`, `verified_at`, `due_at`, `closed_at` timestamptz.
- `assigned_reviewer_user_id` UUID nullable FK to users with `ON DELETE SET NULL`.
- `decision_code` constrained enum; avoid storing free-form sensitive details.
- `response_artifact_id` nullable opaque reference to a protected export artifact.
- `created_at`, `updated_at` timestamptz.

### `privacy_request_targets`

One row per system/data-category/action target:
- `id` UUID primary key; `request_id` FK with cascade.
- `system_code` controlled allow-list: `primary_db`, `quarantine_storage`, `provider_openai`, `provider_abuseipdb`, `provider_ipqs`, `provider_seon`, `otel_collector`, `application_logs`, `backups`, `support_system`.
- `data_category` controlled allow-list; `action_code` constrained by request type.
- `status`: `pending`, `in_progress`, `completed`, `exception_review`, `blocked`, `not_applicable`.
- `attempt_count`, `last_attempt_at`, `completed_at`, `next_retry_at`.
- `idempotency_key` unique; `last_error_code` safe enum only.
- Unique constraint on (`request_id`, `system_code`, `data_category`, `action_code`).

### `privacy_request_events`

Append-only minimal history:
- `id` UUID; `request_id` FK with cascade.
- `actor_user_id` nullable FK with `ON DELETE SET NULL`.
- `event_code` controlled enum; `from_status`, `to_status` nullable; `reason_code` nullable.
- `created_at` timestamptz.
- No request body, credentials, raw identity documents or copied personal data.

### `privacy_legal_holds`

- `id` UUID; optional subject reference; `system_code` and `data_category` scope.
- `basis_code`, `decision_reference`, `approved_by_user_id`, `created_at`, `review_at`, `expires_at`.
- A hold must be scoped, time-bounded and reviewed; no blanket indefinite hold.

### `privacy_export_artifacts` (only if portability/access exports are approved)

- Opaque artifact ID, request ID, storage key, SHA-256, byte size, media type, created/expiry timestamps, download count/last download.
- Private encrypted storage; short-lived signed download URL; no public bucket; no email attachment.
- Expiry cleanup and artifact deletion must be independently observable.

## 4. API contract proposal

All endpoints require current server-side session authentication. Administrative routes require a dedicated privacy-operator permission, not merely a broad admin role, once RBAC supports it.

- `POST /api/privacy/requests`: create request for authenticated subject. Accept only request type and minimal structured scope; server assigns subject ID and timestamps.
- `GET /api/privacy/requests`: list only the authenticated subject's own request IDs, types, statuses and timestamps.
- `GET /api/privacy/requests/:requestId`: subject-scoped status view; never expose target system internals or reviewer notes.
- `POST /api/privacy/requests/:requestId/withdraw`: allow withdrawal before irreversible work begins; record an event.
- `GET /api/admin/privacy/requests`: privacy-operator queue with filters and minimum metadata.
- `POST /api/admin/privacy/requests/:requestId/verify`: record verification outcome and method code; do not store identity-document images by default.
- `POST /api/admin/privacy/requests/:requestId/decision`: approve, reject or mark exception with structured reason and reviewer.
- `POST /api/admin/privacy/requests/:requestId/retry`: retry only failed, idempotent targets after operator authorization.
- `GET /api/privacy/requests/:requestId/export`: issue a short-lived, single-purpose download authorization only after verified access request completion.

All schemas must be strict Zod schemas with bounded lengths, allow-listed enums, no arbitrary SQL/table/column selectors, rate limits, CSRF/origin protections for cookie-authenticated browser clients, and no-store cache headers on sensitive responses.

## 5. Fulfilment workflow

1. Create request under the authenticated subject identity; return opaque ID.
2. Verify identity proportionately. Existing valid account session may be sufficient for low-risk requests; high-risk changes or representative requests need additional verification.
3. Freeze request scope and compute target checklist from a versioned data inventory.
4. Resolve ownership for each target. Global or ambiguous SOC data is excluded from automated subject-level actions and escalated for review.
5. Run a legal-hold/retention review before erasure. Record only a coded, scoped exception with reviewer and review date.
6. Generate a minimized access/portability export or schedule target-specific erasure/restriction/rectification tasks.
7. Execute tasks asynchronously with bounded retries and per-target idempotency.
8. Verify each result from the target system (including private object storage and configured processors); do not rely only on a successful API response.
9. Close only when all targets are complete, not applicable, or have an approved and disclosed exception. Any unresolved target leaves the request blocked/escalated.
10. Expire temporary exports and retain only the minimum request/audit metadata for a separately approved period.

## 6. Source-specific handling rules

- **Users and sessions:** never export password hashes, JWTs, service tokens or reset secrets. Revoke active sessions as part of an approved account-closure process. Define whether account deactivation, pseudonymization or deletion is appropriate after legal review.
- **SOC incidents/events/reviews:** current records may be global and may contain personal data in summaries, notes or JSON attributes. No subject-specific export/deletion until reliable ownership and lawful retention are established. Preserve security evidence only under a documented, scoped purpose/hold.
- **Malware quarantine:** confirm the object key is owned by the subject, delete remote object first, verify deletion, then update metadata. A database cascade is insufficient. Preserve failure state for retry.
- **External reputation/AI providers:** send processor-specific deletion/access requests only when a provider account, request mechanism, data location and legal obligation are verified. No claim that a provider deleted data without a receipt or other verifiable confirmation.
- **Telemetry, logs and backups:** identify the actual collector/host/provider and retention controls before promising selective deletion. Where backup copies cannot be selectively edited, define an approved expiry-based process and restore-time suppression/replay controls.
- **Browser localStorage:** explain that clearing local preferences affects only that browser and does not delete server-side account data.

## 7. Required test matrix before release

- Subject A cannot read or alter Subject B's request or export (including guessed UUIDs).
- Anonymous, disabled-user, expired-session and revoked-session requests fail closed.
- Strict schema rejects unknown fields, oversized strings, arbitrary target names and unsupported request types.
- Duplicate submission and worker retry remain idempotent.
- Concurrent workers cannot corrupt target state or mark failed storage deletion complete.
- Legal hold blocks only the covered target/category and does not silently block unrelated data.
- Global/unowned SOC records are never included in a subject export or deletion.
- Quarantine deletion failure leaves metadata pending; 404 is treated as already absent only when the storage API contract confirms that meaning.
- Export artifact is encrypted/private, short-lived, scoped to the subject and deleted after expiry.
- Logs and events contain no raw personal payloads, passwords, tokens or uploaded content.
- Migration tests cover fresh install, upgrade from current schema, rollback/restore rehearsal and checksum immutability.
- End-to-end tests use synthetic identities and data only.

## 8. Release gates

Do not merge or deploy the runtime implementation until:
- Phase 1 deployment inventory and data-flow evidence are complete.
- Workspace/tenant ownership and legacy global-record handling are resolved.
- Retention periods, legal bases, exception policy, identity verification and controller/processor roles are approved.
- Provider contracts, regions, retention and deletion channels are verified.
- Migration, worker, API, UI, security and recovery tests pass in disposable CI/staging.
- Privacy notice and support/contact channel are reviewed and reflect actual production behavior.
- Production backup/restore, rollback and operator runbooks are approved.

**Decision:** implement the lifecycle additively after these gates. This design intentionally does not authorize a production migration, data deletion, account deletion or deployment.
