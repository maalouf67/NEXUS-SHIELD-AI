# NEXUS SHIELD AI — Privacy Data Inventory (Phase 1)

**Status:** repository-source inventory, not a production data-flow certification.  
**Issue:** #32  
**Branch:** `feat/privacy-data-subject-rights`  
**Audited default-branch commit:** `a854a221d3ec6c77b32f68275c908ed6d91ebbfe`  
**Audit date:** 2026-11-07

## 1. Purpose and limits

This document records data flows that are evidenced by the current repository source. It distinguishes source-code behavior from deployment facts that cannot be established from GitHub alone.

It is not a legal opinion, a Record of Processing Activities (RoPA), a Data Protection Impact Assessment (DPIA), a processor agreement, or proof of GDPR / Moroccan Law 09-08 compliance. The deployment owner must determine controller/processor roles, territorial scope, legal bases, notices, transfer safeguards, and applicable CNDP obligations with qualified advice.

**Important correction:** the existing `services/api/src/privacy/*` and `services/api/src/routes/privacy.ts` implement a consent-gated, safe no-op privacy scan integration placeholder. They do not implement GDPR data-subject access, rectification, erasure, restriction, objection, portability, or request tracking.

## 2. Repository data inventory

| Data domain | Source / fields evidenced in code | Storage evidenced in source | Access / recipient evidenced in source | Retention evidenced in source | Deletion / request implications |
|---|---|---|---|---|---|
| Account identity | `users.id`, email, role, password hash, active flag, creation timestamp | PostgreSQL `users` | Login; admin-only user directory; authenticated API identity | No account-row expiry in migrations | Account erasure needs a controlled workflow. Password hashes are credentials and must never be exported as plaintext or disclosed. |
| Authentication sessions | Session UUID, user ID, created/expiry/revocation timestamps, reason, revoking admin | PostgreSQL `auth_sessions` | Auth middleware checks persisted session; logout/logout-all and admin revocation | Access session lifetime is 15 minutes in auth route; expired rows have no evidenced purge job | Revoke active sessions promptly as part of account closure; separately define expiry-row cleanup. |
| Asset inventory | Asset ID/type/name/description/tags; evidence ID/source/status/recorded time/note; relationship IDs/type/notes | PostgreSQL `assets`, `asset_evidence`, `asset_relationships`, `relationship_evidence` | Service-token-protected inventory API; currently global queries, no workspace/user owner column in migration | No expiry or retention cleanup evidenced | May include customer/system identifiers and sensitive operational context. Ownership is ambiguous; do not assign to a user/workspace by guess. PR #30 is design-only and open. |
| Incidents | Title, severity, status, source, created/updated actor IDs and timestamps | PostgreSQL `incidents` | Authenticated incident routes / SOC workflows | No general expiry evidenced | Preserve incident evidence only where justified; evaluate redaction/pseudonymization and legal hold before erasure. |
| Incident activity | Actor ID, action, state transitions, optional note, timestamp, incident/alert links | PostgreSQL `incident_activity` | Incident detail and audit workflow | No expiry evidenced | Notes may contain personal data. User deletion currently can set actor reference to NULL; incident deletion cascades activity. This is not a complete erasure policy. |
| Alerts | Incident link, type, risk score, status, timestamp | PostgreSQL `alerts` | Authenticated alert/SOC routes | No expiry evidenced | Linked to incidents; retention and actor context require policy. |
| Security events and reviews | Source, external event ID, type, severity, observed/received times, asset ID, summary, JSONB attributes, reviewer ID/note/time | PostgreSQL `security_events`, `security_event_reviews` | Event ingestion and analyst review routes; reviewer identity FK can become NULL | No expiry evidenced | JSONB and free-text fields can contain personal data. Global schema; no owner/workspace column. Preserve evidence only with documented purpose and retention. |
| Malware samples and scan history | Owner user ID, generated sample/hash identifier, SHA-256, byte size, verdict, scanner, error code, scan/create/expiry timestamps, storage deletion timestamp | Private AI quarantine plus PostgreSQL `malware_samples` and `malware_scan_runs` | Owner-scoped scan history; service-token internal authorization/deletion path | Source schedules sample files for 7 days and scan runs for 30 days | Cleanup deletes the remote object before marking storage deletion and fails closed on non-404 failure. User FK currently cascades sample metadata; that alone does not prove private file deletion. |
| API rate-limit counters | Scope, SHA-256 key hash, hit count, reset timestamp | PostgreSQL `api_rate_limit_counters` | API rate-limit stores | Reset timestamp exists; no purge job verified in inspected source | Key is hashed, but still operational data; expiry cleanup must be verified. |
| IP reputation lookup | Submitted public IP; AbuseIPDB result fields including score, reports, country, ISP/domain, timestamp | Route/provider source returns result; no persistence identified in inspected route/provider | Authenticated admin/analyst request; sends public IP to AbuseIPDB when configured and consent is true | No application persistence evidenced; provider retention is unknown | Treat IP as potentially personal data depending on context. Disclose recipient and provider retention/transfer; consent flag alone does not settle legal basis. |
| Phone reputation lookup | E.164 phone number; returned fraud/network signals, carrier, phone type, country, provider request IDs | Route/provider source returns assessment; no application persistence identified in inspected route/provider | Authenticated admin/analyst request; may send number to IPQualityScore and SEON when configured and consent is true | No application persistence evidenced; provider retention is unknown | High-risk identifier. Minimize, avoid logs, disclose each recipient and transfer; verify provider contracts and retention. |
| AI threat analysis | Target, source, signal type, free-text details/prompt | Request is sent to configured OpenAI provider; current route response says `persisted: false` | Authenticated admin/analyst via web BFF; API service sends prompt to OpenAI when configured | No application persistence evidenced for this route; provider retention/configuration unknown | Free text can contain personal data. Need input minimization, redaction, provider review, transfer review, and data-subject handling in downstream processors. |
| Privacy scan placeholder | Consent flags, purpose, data categories, optional summary/notes/region/request ID | Request evaluated in process; adapter is no-op in current build | `POST /api/privacy/scan`; current adapter explicitly says no external transfer | No persistence evidenced | Not a rights-request workflow and not a durable consent ledger. Do not describe as a GDPR compliance module. |
| Browser preferences | Language and optional product-update/analytics booleans | Browser `localStorage` keys `nexus.language`, `nexus.privacy.preferences` | Current browser only, per settings page text | Until browser storage is cleared | Not synchronized to account or server; clearing browser storage removes local settings, not server-side personal data. |
| HTTP telemetry | Generated trace/span IDs, method, status, safe route group, service/environment names and timing | Sent to configured OTLP endpoint only when `OTEL_ENABLED=true` and endpoint passes URL validation | External OTLP collector may receive these attributes | Collector retention unknown | Source intentionally excludes request path/query, IP, headers, phone, credentials and body. Verify collector identity, region, retention and access. |
| Operational logs / hosting / backups | Not fully established from repository source | Runtime stdout/stderr, host, reverse proxy, database backups/snapshots and provider logs need deployment inspection | Hosting/database/platform operators and any configured subprocessors | Unknown | Must be inventoried from actual Railway/OVH/other deployment settings and contracts; do not infer from source. |

## 3. Schema-level relationships and deletion hazards

The following behaviors are visible in migrations and require explicit handling:

- `auth_sessions.user_id` references `users(id) ON DELETE CASCADE`.
- `malware_samples.owner_user_id` references `users(id) ON DELETE CASCADE`; `malware_scan_runs` reference samples with cascade.
- `incidents.created_by_user_id` and `updated_by_user_id` use `ON DELETE SET NULL`.
- `incident_activity.actor_user_id`, `security_events.reviewed_by_user_id`, `security_event_reviews.actor_user_id`, and `malware_scan_runs.actor_user_id` use `ON DELETE SET NULL`.
- Incident activity and security-event review rows cascade when their parent incident/event is deleted.
- Assets, evidence and relationships are currently global and are not linked to a user/workspace owner in the migrations inspected.

**Do not issue a direct `DELETE FROM users` as the privacy feature.** Foreign-key cascades can remove metadata while leaving external quarantine objects, provider-side records, logs, or backups untouched. Conversely, indiscriminate deletion can destroy security evidence that may lawfully need to be preserved.

## 4. External recipients and transfers requiring deployment verification

Source code contains adapters for:
- OpenAI threat analysis;
- AbuseIPDB public-IP reputation;
- IPQualityScore phone reputation;
- SEON phone reputation;
- an optional OTLP telemetry collector;
- hosting, database, and private AI/quarantine services.

Repository source does not establish which credentials are present in a live environment, whether the providers are reachable, which provider regions/processors are used, contract/DPA terms, data retention, deletion propagation, or international transfer safeguards. These must be confirmed from the actual deployment and vendor agreements before a public privacy notice is finalized.

## 5. Retention facts vs. unknowns

**Source-level settings identified:**
- Quarantined malware sample files: scheduled expiry after 7 days.
- Malware scan-run metadata: scheduled expiry after 30 days.
- Auth access token/session expiry: 15 minutes in the login route.
- Rate-limit records have `reset_at`; a corresponding cleanup job was not established in this inventory.

**Not established:** retention for accounts, incidents, alerts, incident activity, security events/reviews, assets/evidence, rate-limit rows after reset, application logs, reverse-proxy logs, OTLP collector data, database backups/snapshots, provider-side copies, and support records.

These are source-code observations, not proof that scheduled cleanup runs reliably in production.

## 6. Phase 1 evidence still required from the deployment owner

Before designing destructive workflows, obtain and review:

1. A redacted environment/configuration inventory: enabled providers, service URLs, feature flags, OTLP endpoint identity, hosting and database regions. Never share secret values.
2. Actual database schema and migration ledger from a disposable/staging database, then a separately approved production schema read-only snapshot. Do not run migrations during this audit.
3. Storage inventory for AI quarantine, volumes, object stores, temporary directories, exports, and backup/snapshot schedules.
4. Runtime logging configuration for API, web, AI service, reverse proxy, host, container platform and monitoring.
5. Vendor/subprocessor list, DPAs, processing locations, retention/deletion controls and international transfer mechanisms.
6. Real request traces with synthetic data only, proving which fields leave the service and which systems persist them.
7. Workspace ownership and data lineage design from PR #30, plus a decision on legacy global assets/events/incidents. No guessed backfill is acceptable.
8. Operational proof that malware cleanup executes on schedule, retries failures, and verifies object deletion.

## 7. Recommended rights-request architecture (design only; no migration yet)

A future additive implementation should model:
- `privacy_requests`: opaque request ID, subject account reference where available, request type, authenticated verification state, received/due timestamps, status, assigned reviewer, decision code, response timestamp.
- `privacy_request_targets`: one row per system/data category/action, status, attempt count, last error code, confirmation timestamp, idempotency key.
- `privacy_request_events`: append-only minimal status/action history, actor, timestamp, reason code; avoid duplicating personal payloads.
- `privacy_legal_holds`: narrowly scoped hold reference, legal basis/reviewer, categories covered, created/review/expiry timestamps, access controls.

Use asynchronous, idempotent workers with per-target completion. A request is not complete until each in-scope target is confirmed, legally excepted with a recorded reason, or explicitly documented as unavailable/escalated. Deletion must be coordinated with external storage and processors; backup copies may require expiry-based handling rather than selective mutation, provided the applicable law and backup design permit it.

No schema or destructive operation is authorized by this design document. Each later migration and behavior change must be separately reviewed and tested.

## 8. Phase 1 exit criteria

- [x] Enumerate current numbered migrations (001–009).
- [x] Identify primary account/session, asset, SOC, security-event, malware, rate-limit and privacy-scan source paths.
- [x] Identify known source-level retention values and FK deletion behavior.
- [x] Identify external provider adapters and source-level consent gates.
- [ ] Verify actual deployment providers, regions, logs, backups and object storage.
- [ ] Complete end-to-end data-flow validation with synthetic test data.
- [ ] Reconcile workspace/tenant ownership before any subject-level data export or deletion.
- [ ] Obtain controller/legal review of purposes, lawful bases, rights handling and exceptions.

**Phase 1 is not complete for production purposes until all unchecked deployment evidence and ownership questions are resolved.**
