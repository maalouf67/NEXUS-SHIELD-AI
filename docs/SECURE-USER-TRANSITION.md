# Secure User Transition Foundation

**Status:** design and metadata schema foundation only. No source-system connection, user import, account creation, credential transfer, or production cutover is implemented.

## 1. Purpose and safety boundary

This workstream prepares NEXUS SHIELD AI to receive a limited, authorized user directory from an external identity system through a documented and approved integration. The source system remains authoritative until a separately approved cutover.

The initial use case is a controlled transition from an authorized government identity source. This repository must not be used to discover, enumerate, scrape, or access accounts on `interieur.gov.dz`. Integration must use only a source-provided API or export channel explicitly approved by the source owner and covered by the written authorization.

The project owner must verify the authorization scope, controller/processor roles, lawful basis, data categories, purpose, retention, recipients, hosting region, and any cross-border transfer safeguards before live data is processed. This document is technical design, not legal advice or proof of compliance.

## 2. Non-negotiable safety invariants

1. **No source-side mutation:** NEXUS must never disable, delete, lock, reset, or change roles on source accounts.
2. **No credential/session migration:** never import passwords, password hashes, MFA seeds, recovery codes, API keys, access tokens, refresh tokens, cookies, or session identifiers.
3. **No silent cutover:** source remains authoritative; all imports are preview-only until an operator explicitly approves a specific batch and the source owner approves the cutover procedure.
4. **No destructive reconciliation:** missing records in a later source snapshot must not delete or disable target accounts.
5. **No automatic privilege elevation:** imported source roles map only to a reviewed low-privilege target role. External administrator/superuser roles must never map to NEXUS `admin` automatically.
6. **No ambiguous identity merge:** duplicate email, conflicting external IDs, or an existing local account must enter manual review; never merge on email alone.
7. **No sensitive Git content:** real user data, exports, secrets, certificates, tokens, database dumps, and production logs must never be committed to GitHub or CI artifacts.
8. **No overclaiming activity:** account enabled/disabled state, last login, last seen, and a currently active session are separate facts. Report each only when the source provides an authorized, defined field.
9. **Fail closed:** invalid signatures, expired credentials, schema drift, unexpected source host, excessive records, rate-limit responses, or partial pages stop the batch without activating target accounts.
10. **Auditable and reversible:** every batch has a unique ID, operator, source identifier, schema version, preview totals, approval record, outcome, and rollback/containment record. Audit events are append-only and contain no raw personal data.

## 3. Target architecture

```text
Approved source API / approved export
              |
              v
Source connector (allowlisted endpoint; read-only)
              |
              v
Schema validation + field allowlist + normalization
              |
              v
Import staging (quarantined; inactive; not login-capable)
              |
              v
Dry-run preview + duplicate/conflict report
              |
       explicit batch approval
              |
              v
Transactional target-account provisioning
              |
              v
External identity link + audit events
              |
              v
NEXUS users / RBAC / sessions
```

The connector must be outbound-only to an explicitly configured HTTPS origin. It must not accept arbitrary URLs from requests or records. Enforce TLS certificate validation, bounded timeouts, pagination limits, response-size limits, request rate limits, and a circuit breaker. Use a dedicated read-only source credential with the minimum required scope. Prefer mutual TLS or the source's documented OAuth client-credentials flow where supported. Store credentials in the deployment secret manager, never in source files, browser code, GitHub Actions logs, or this repository.

## 4. Data minimization and field mapping

The source owner must approve a versioned field map before implementation. A proposed minimum contract is:

| Source field | NEXUS handling | Rule |
|---|---|---|
| Stable source subject ID | Namespaced external identity key | Required; opaque; never use email as the primary external key |
| Email or username | Optional account contact/login attribute | Only if approved and needed; normalize; never use for automatic identity merge |
| Display name | Optional profile field | Omit unless required for the stated purpose |
| Source role/group | Mapping input only | Map through an explicit allowlist; unknown values go to review |
| Account enabled state | Source account status metadata | Do not change the source; imported target account remains inactive pending approval |
| Last successful login | Timestamp metadata | Only if supplied and authorized; do not infer live activity |
| Current session state | Do not import | Session identifiers and live sessions are never transferred |
| Password / password hash / MFA | Reject | Never import or retain |

Never request or store national identification numbers, addresses, phone numbers, birth dates, or unrelated profile attributes unless the approved purpose and field-level authorization specifically require them. The import contract must reject unknown fields by default.

## 5. Identity and role mapping

External identity uniqueness is the pair `(source_system, source_subject_id)`. A source subject ID must be stable, opaque, and namespaced. Email is a mutable attribute and is not a safe cross-system identity key.

Initial role mapping must be explicit and least-privilege, for example:

- approved standard member -> NEXUS `viewer`
- approved operational analyst -> NEXUS `analyst`, only after role-owner review
- source administrator, privileged operator, unknown role -> quarantine/manual review; never map automatically to NEXUS `admin`

The source role name must be preserved only as restricted mapping metadata if retention is approved. Every mapping change requires an audit event and re-review of affected accounts.

## 6. Account state and activity semantics

Keep these fields distinct:

- `source_account_enabled`: whether the source account is enabled according to the source.
- `target_account_active`: whether the NEXUS account is allowed to authenticate.
- `source_last_login_at`: the source-reported last successful login time.
- `source_last_seen_at`: source-reported activity time, if explicitly defined.
- `target_active_session_count`: NEXUS sessions only, computed from NEXUS session records.

A source account being enabled does not prove that a person is currently online. A recent login does not prove a live session. Do not display a green "online" state unless an authorized source provides a reliable, current presence signal with a documented freshness window.

## 7. Batch lifecycle

Use the following state machine:

`created -> validating -> preview_ready -> awaiting_approval -> approved -> applying -> completed`

Terminal or exceptional states: `rejected`, `failed`, `blocked`, `cancelled`, `rollback_review`.

- **Preview:** validates and counts records, detects duplicates/conflicts, and produces a redacted report. It must not create or activate users.
- **Approval:** bound to the exact batch checksum, source, schema version, counts, field map version, and operator. Any change invalidates approval.
- **Apply:** idempotent and transactional per bounded chunk. Newly provisioned target accounts remain inactive until a separately approved activation step.
- **Retry:** safe only with the same idempotency key and verified source snapshot; never create duplicates.
- **Rollback:** disables the connector/batch mapping and prevents further updates. It does not delete user accounts, alter source accounts, revoke unrelated sessions, or erase audit history. Any target-account deactivation requires a separate reviewed action.

## 8. Privacy-safe observability

Audit records should include batch ID, event code, actor ID, timestamp, source system code, schema version, counts, and a non-reversible/pseudonymous record reference where needed. Do not log email addresses, names, raw payloads, access tokens, authorization headers, national identifiers, or source response bodies.

Operational metrics may include records received, accepted, rejected, conflicted, provisioned, skipped, and failed. Logs and metrics require access controls and a documented retention period. Exported reports must be aggregate by default.

## 9. Required tests before any live import

- schema validation rejects unknown and prohibited credential fields;
- source endpoint allowlist rejects arbitrary hosts and redirects;
- invalid TLS, invalid signature, expired credential, timeout, rate-limit, and partial pagination fail closed;
- duplicate external IDs and conflicting emails are quarantined;
- an existing local account is never merged automatically;
- unknown or privileged roles never become NEXUS admin;
- dry-run causes zero writes to users and auth_sessions;
- repeated apply with the same idempotency key does not duplicate accounts;
- source records missing from a later snapshot do not delete or disable target accounts;
- no passwords, hashes, MFA factors, tokens, or sessions are accepted;
- audit output is append-only and contains no raw personal data;
- rollback stops future synchronization without destructive deletion;
- test fixtures contain synthetic identities only.

## 10. Release gates

Live source integration is blocked until all of the following are verified:

- written authorization identifies the source system, data categories, purpose, permitted operations, recipients, and validity period;
- official API/export documentation and a non-secret schema sample are reviewed locally by the authorized engineering team;
- data-protection/legal review approves the processing and hosting/transfer arrangement;
- OVHcloud deployment security, region, encryption, backups, access controls, monitoring, and restore procedure are verified;
- dedicated read-only source credentials are provisioned directly into the server secret store;
- dry-run, failure-mode, idempotency, privacy, and rollback tests pass;
- source owner and NEXUS operator separately approve the exact batch and cutover plan.

Until these gates pass, only synthetic test data may be used. No live users are migrated by this foundation.

## 11. Implementation sequence

1. Inspect the existing NEXUS users, auth sessions, migration runner, RBAC middleware, and audit/event facilities.
2. Add an additive database migration for source-system identity links and import batch metadata; do not alter existing user/session rows.
3. Add a read-only connector interface and strict source payload schema with no provider URL or credentials hardcoded.
4. Add dry-run preview, conflict quarantine, approval binding, idempotent apply, and append-only audit events.
5. Add tests with synthetic data and verify no writes occur during preview.
6. Add a local-only configuration guide and deployment checklist. Live integration remains disabled by default.

## 12. Current implementation status

- [x] Repository and existing user/auth/session foundations inspected on `main`.
- [x] This design and safety boundary documented on a feature branch.
- [x] Additive metadata-only migration `011_secure_user_transition.sql` added on the feature branch; it has **not** been applied to any database.
- [ ] Connector interface and strict DTO validation.
- [ ] Dry-run preview and conflict quarantine.
- [ ] Approval-bound idempotent provisioning.
- [ ] Automated synthetic-data tests.
- [ ] OVHcloud hardening and deployment verification.
- [ ] Source-owner approval and live integration.
