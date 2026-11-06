# NEXUS SHIELD AI — Workspace / tenant isolation design

**Tracked security blocker:** Issue #24  
**Base:** Draft PR #19, `feature/security-live-dashboard`  
**Status:** architecture baseline only; data-plane enforcement is not complete.  
**Release rule:** Do not present the current SOC, incident, alert, security-event or asset inventory data as tenant-isolated.

## 1. Verified current risk

The current PR #19 data layer is workspace-global:

- `assets`, `asset_evidence`, `asset_relationships` and `relationship_evidence` have no `workspace_id`.
- The asset inventory store reads and upserts the complete tables without a tenant predicate.
- Incident and alert list/count/detail/update queries are global; linked activity records do not carry a workspace key.
- Security-event ingestion/list/review and uniqueness are global (the external-event uniqueness key is `source + external_event_id`).
- The inventory import route is authenticated by one global `NEXUS_SERVICE_API_TOKEN`, not by a workspace-scoped integration identity.
- User roles (`admin`, `analyst`, `viewer`) do not establish which customer workspace owns a record.

These are direct findings from the current PR #19 branch source, not an assumption based on UI behavior.

## 2. Domain model

### Workspaces

`workspaces`
- `id UUID PRIMARY KEY`
- `name`, `slug` (unique), `status` (`active`, `suspended`, `closed`)
- `created_at`, `updated_at`

### Memberships

`workspace_memberships`
- `workspace_id` → `workspaces.id`
- `user_id` → `users.id`
- `role` restricted to `admin | analyst | viewer`
- `status` (`invited`, `active`, `revoked`)
- `created_at`, `revoked_at`
- Unique active membership per workspace/user; membership revocation must invalidate the user's workspace access immediately.

A user may belong to more than one workspace. A global user role is not used as a substitute for a workspace role.

### Workspace integrations

`workspace_integrations`
- `id UUID PRIMARY KEY`, `workspace_id`, `name`, `status`
- `token_hash` only (SHA-256 digest of a high-entropy opaque token); never store or log the raw integration token.
- Scoped permissions, `created_at`, `last_used_at`, `revoked_at`, optional expiry.
- Rotate/revoke independently per workspace and per integration.

The current global service token must not remain a fallback for tenant data ingestion after the scoped integration route is enabled.

## 3. Workspace resolution and authorization

1. Authenticate the user and obtain the subject from the verified server-side session.
2. Resolve the requested active workspace from the server session when the session store supports it. Until that is integrated, accept a workspace selector only as an untrusted request hint (for example, `X-NEXUS-Workspace-ID`).
3. Query PostgreSQL for an active membership joining the authenticated user to that workspace. Never trust the workspace ID alone, the user's global role, a URL parameter, or a browser-supplied owner field.
4. Attach the validated workspace ID and workspace role to the server request context.
5. Pass that validated scope explicitly to every repository call. Missing scope must fail closed; no repository method may silently fall back to a global query.
6. On active-workspace switch, membership revocation, or role change, revalidate before the next protected operation. The session-revocation work in Issue #25 is a dependency for binding active workspace state to a server-side session.

Admin means workspace administrator, not automatic access to every customer workspace. Cross-workspace support access, if ever required, must be a separately permissioned, time-bound, audited break-glass workflow.

## 4. Data ownership and relational integrity

The following tables need a `workspace_id NOT NULL` in the final release schema:

| Domain | Tables to scope |
|---|---|
| Asset inventory | `assets`, `asset_evidence`, `asset_relationships`, `relationship_evidence` |
| SOC incidents | `incidents`, `alerts`, `incident_activity` |
| Threat/event ingestion | `security_events`, `security_event_reviews` |
| Future audit trail | Workspace-scoped audit records and export jobs |
| Integration identities | `workspace_integrations` |

Constraints must prevent cross-workspace links, not merely hide them in SELECT queries:
- Add unique keys on `(workspace_id, id)` for scoped parent tables.
- Use composite foreign keys such as `(workspace_id, incident_id)` → `incidents(workspace_id, id)`.
- Apply equivalent composite keys to asset relationships, evidence, alerts, reviews and activity.
- Change idempotency constraints to include workspace scope, such as `(workspace_id, source, external_event_id)`, so two workspaces can ingest the same vendor event ID without colliding.
- Create indexes whose leading columns include `workspace_id` for tenant list, count, detail and join paths.

## 5. Repository and API enforcement

Every operation must scope both the main row and all joins/counts:
- asset inventory read/upsert and attack-path inventory analysis;
- incident list, detail, create, status update and activity;
- alert list, create, status update and incident joins;
- security-event ingest, list, review, deduplication and review history;
- threat dashboard summary and all aggregate subqueries;
- background cleanup, exports and future analytics.

For transactional mutations, verify workspace membership and use the same PostgreSQL client/transaction for the membership check, data write and audit write. Avoid a check-then-write race.

Add a `withWorkspaceTransaction` helper that uses `BEGIN`, `SET LOCAL app.workspace_id = ...`, executes scoped work, then commits/rolls back and releases the client. PostgreSQL Row-Level Security can then be enabled as defense-in-depth on every tenant-owned table with policies based on `current_setting('app.workspace_id', true)`.

RLS must not be enabled until all affected code paths use a transaction-local workspace context. Never use session-level `SET` on a pooled connection: scope leakage between requests is a critical isolation failure.

## 6. Legacy data migration policy

Do not assign existing global records to a guessed workspace or to whichever user happens to sign in first.

Migration phases:
1. Add workspace/membership/integration tables and nullable ownership columns. Record pre-migration row counts and current uniqueness/foreign-key definitions.
2. Create a restricted legacy-ownership review report listing unscoped rows by table and their relationship graph, without exposing sensitive details in public logs.
3. An authorized owner explicitly selects the workspace for each legacy dataset. Provide a dry-run plan with counts, parent/child consistency and collision checks.
4. Backfill parent rows and child rows in dependency order inside controlled batches; record a reversible mapping/audit ledger.
5. Verify every relationship/evidence/alert/activity/review row points to a parent in the same workspace.
6. Only after all rows are assigned and validated, make `workspace_id` NOT NULL and enable RLS.
7. Keep a tested rollback/restore procedure. No production migration is authorized by this design document.

Until a legacy dataset is explicitly assigned, it must be inaccessible through customer-facing workspace APIs. Do not silently treat NULL as a shared/default workspace.

## 7. Acceptance test matrix

Use at least two workspaces, two distinct owners, users with different workspace roles, and separate integration identities.

Required tests:
- Workspace A users cannot list, count, read, update, review, export or analyze Workspace B records.
- A guessed B record ID returns the same not-found policy as a nonexistent record.
- A user with no membership, an invited membership or a revoked membership is denied.
- Switching workspace context changes only the data visible to the validated membership; no context leaks through pooled connections.
- Cross-workspace asset relationships, alert/incident links, evidence links and event reviews fail at the database constraint layer.
- Two workspaces may ingest the same external event ID without overwriting or colliding.
- An integration token for Workspace A cannot import or read Workspace B data, even when a caller supplies B's workspace ID.
- Counts and dashboard aggregates are tenant-scoped, including nested subqueries.
- Concurrent requests using different workspaces on the same pool never see each other's rows.
- Legacy NULL/unassigned rows remain hidden until an authorized migration maps them.

## 8. Security verification baseline

- Web/API authorization: map implementation and tests to OWASP ASVS 5.0.0, especially architecture/access-control, authentication, session, data-protection and logging requirements.
- Mobile clients: continue the OWASP MASVS/MASTG control register; its current CI job checks register completeness and is not a device certification.
- Database: least-privilege service roles, tenant-scoped constraints, optional RLS defense-in-depth, TLS verification, backup/restore evidence and migration review.
- Supply chain: retain Trivy filesystem/image scanning, Dependency Review, CodeQL, lockfile auditing and signed artifact provenance as separate CI controls.
- Governance: map incident response, access review, recovery, change management and supplier controls to the organization's adopted ISO/IEC 27001:2022 ISMS. A code repository alone cannot claim ISO certification.

## 9. Implementation order and release gate

1. Approve this data model and workspace-admin semantics.
2. Add additive workspace/membership/integration schema and repository/service tests.
3. Implement workspace resolution and membership middleware.
4. Convert assets and evidence/relationships first, including atomic scoped import and read-only attack-path analysis.
5. Convert incidents, alerts and activity.
6. Convert security events, review/audit trails, deduplication and dashboard aggregates.
7. Add scoped integrations and remove the global service-token fallback for tenant data.
8. Add transaction-local RLS and two-workspace concurrency tests.
9. Complete explicit legacy backfill and restore testing.
10. Only then remove the multi-tenant release blocker.

PR #19's workspace-global data remains blocked from multi-tenant production release until Issue #24 acceptance criteria and the production data migration review are complete.

## 10. Explicit non-goals

This design does not create demo tenants, invent customer ownership, backfill or modify production records, activate a cloud workspace, or claim tenant isolation is implemented. It is the reviewed implementation baseline for the next code phase.
