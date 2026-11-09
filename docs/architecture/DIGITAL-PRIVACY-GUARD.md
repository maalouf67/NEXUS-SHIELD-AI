# NEXUS SHIELD AI — Digital Privacy Guard Architecture

**Document status:** Architecture proposal; documentation-only change.  
**Baseline:** `main` at `94fa25ca51f1e1628987babed03896cd1304948b` (2026-11-08).  
**Branch:** `docs/digital-privacy-guard-architecture`  
**Scope:** Integrate external data-broker exposure discovery with NEXUS privacy requests, consent, SOC and Digital Security Twin without duplicating existing functionality.

> This document does not implement a provider connection, send personal data, change a database, delete records, deploy services, or claim legal compliance.

## 1. Executive decision

Build **Digital Privacy Guard** as a capability inside the existing Privacy & Data Protection Center. Do not create a second privacy-request workflow.

The implementation must remain provider-neutral. AJAXX may be evaluated as a future provider, but the current AJAXX connection available in ChatGPT exposes read-only service information (FAQs, broker directory, plans and products); it does not expose a user's scan results, account actions or removal operations. No official AJAXX partner API contract, authentication specification or SDK was verified during this repository review. Therefore, no NEXUS server-side AJAXX client may be enabled until the vendor supplies an authorized integration contract and credentials.

PR #38 contains a separate PrivacyHawk partner integration. Its code supports scan creation, scan status, scan records and broker catalog retrieval, but explicitly does **not** enroll recurring removals or submit broker opt-outs. PR #38 remains Draft and open. It must be reviewed independently before merge or provider activation.

## 2. Verified repository baseline

### Existing implementation on `main`

| Area | Existing source | Verified behavior |
|---|---|---|
| Privacy Guard endpoint | `services/api/src/routes/privacy.ts` | `GET /privacy/status` reports the AJAXX provider as unavailable; `POST /privacy/scan` is consent-gated. |
| AJAXX adapter contract | `services/api/src/privacy/ajaxx-adapter.ts` | Small adapter interface for a scan result. |
| AJAXX no-op adapter | `services/api/src/privacy/noop-ajaxx-adapter.ts` | Returns `not_available`; states that no external transfer occurred. |
| Privacy Guard service | `services/api/src/privacy/privacy.service.ts` | Uses the no-op adapter by default; returns `safe-no-op`. |
| Privacy request APIs | `services/api/src/privacy/privacy-requests.routes.ts` | Authenticated request creation, subject-scoped listing/details, scoped export, withdrawal and admin review actions. |
| Privacy request schema | `database/init/010_privacy_request_lifecycle.sql` | `privacy_requests`, append-only `privacy_request_events`, and `privacy_request_targets`. |
| Privacy Center UI | `apps/web/app/privacy-center/page.tsx` | Submit and track requests; explains that destructive/processor-side fulfillment is not automated. |
| Data inventory | `docs/PRIVACY-DATA-INVENTORY.md` | Documents source-level data flows, retention gaps and ownership uncertainties. |
| Rights workflow design | `docs/PRIVACY-REQUEST-IMPLEMENTATION-DESIGN.md` | Defines security invariants and staged fulfillment design. |

### Important implementation limits

1. The AJAXX adapter on `main` is a no-op. The status endpoint must not be represented as a live external scan.
2. The current export route includes only directly attributable account, authentication-session and malware-scan data. Other categories are explicitly excluded where ownership is not proven or data is browser-local.
3. Approval of an admin privacy request changes its workflow state; it does not itself erase, rectify, restrict or export data.
4. `privacy_request_targets` exists in the migration, but no target executor/worker was found in the current runtime search.
5. The current admin review endpoints use the broad `admin` role. The architecture design already calls for a narrower privacy-operator permission.
6. Some SOC, asset and evidence records have historical/global ownership limitations. Never infer a person's ownership from a workspace, email match or record proximity.

### Related pull requests

- PR #34 — Privacy Center request lifecycle foundation: merged.
- PR #35 — verified subject-scoped export: merged; export remains intentionally partial where ownership is unverified.
- PR #38 — PrivacyHawk provider integration: open Draft, not mergeable at the time of review, with no PR reviews recorded. Its latest inspected GitHub Actions Build/Test and Security Checks runs completed successfully. A successful CI run does not make a Draft PR production-ready.
- PR #40 — documentation-only privacy rights design: open Draft. Reconcile its document with the existing privacy inventory/design before adding further overlapping documents.

## 3. Product scope and boundaries

Digital Privacy Guard should deliver four related capabilities:

### A. Internal data transparency

Reuse the source inventory and show a user what NEXUS stores about their own account, with:
- data category and purpose;
- storage system;
- known recipients/processors;
- source-backed retention status;
- ownership confidence;
- export/deletion limitations.

Do not imply that the repository inventory proves deployed configuration, hosting region, provider retention or backup deletion. Those require environment and vendor evidence.

### B. External exposure discovery

Allow a user to request a one-time scan from a supported provider. Show:
- provider identity and verified connection state;
- supported countries and capabilities;
- exact profile fields to be sent;
- purpose and consent version;
- scan status and matched broker count;
- results accessible only to the data subject or a separately authorized representative.

Do not send the user's NEXUS profile to a provider automatically at signup, login or dashboard load.

### C. Removal case management

Connect broker opt-out/removal actions to the existing `privacy_requests` and `privacy_request_targets` lifecycle. Each broker action must be independently tracked as pending, in progress, confirmed complete, blocked, manual action required or an approved exception.

A scan result is not a removal request. A provider acknowledgment is not proof of completed removal. A timeout must be recorded as unknown/needs reconciliation, not as success or as a reason to blindly submit a duplicate request.

### D. SOC and Digital Security Twin signals

Expose minimal, privacy-safe indicators such as:
- exposure severity band;
- affected data-category codes;
- provider and observation timestamp;
- remediation state.

Do not put raw names, email addresses, phone numbers, home addresses, scan profiles or broker result payloads into global SOC events, agent prompts, analytics or tenant-wide dashboards. The individual exposure record remains subject-scoped.

## 4. Provider strategy

### AJAXX

Current decision: **disabled / informational only**.

The connected ChatGPT AJAXX actions are read-only discovery tools. They are useful for reviewing public broker information and explaining removal workflows, but they are not a backend API for NEXUS.

Before implementing an AJAXX adapter, obtain written vendor confirmation and:
1. partner API/OpenAPI specification and permitted use;
2. OAuth/client authentication and least-privilege scopes;
3. sandbox credentials and synthetic-data test procedure;
4. scan, results, opt-out, status, webhook and deletion endpoints;
5. country coverage, including Morocco if relevant;
6. data locations, subprocessors, retention, deletion propagation and incident terms;
7. DPA/processor terms and permitted cross-border transfers;
8. rate limits, retry semantics, idempotency and support escalation.

Until then, keep the no-op adapter truthful. Do not scrape AJAXX accounts, automate its UI, reuse ChatGPT connector credentials, or present the ChatGPT connector as an API integration.

### PrivacyHawk

PR #38 is a potential first server-side provider adapter, subject to review and explicit operator configuration.

What its inspected code currently provides:
- server-side client-credentials token acquisition;
- sandbox as the default environment;
- per-scan explicit consent;
- authenticated scan creation and user-scoped scan history;
- retrieval of scan status, broker records and broker catalog;
- no persistence of submitted profile fields in the provider scan tables;
- allow-listed result fields before returning records to the browser.

What it does not provide:
- no recurring removal enrollment;
- no broker opt-out/removal submission;
- no claim of support for every country or broker;
- no verified live connection until partner credentials and a sandbox request succeed.

Keep all credentials in the API secret manager. Do not merge or enable PR #38 merely because its Actions checks pass: it is Draft, not mergeable, and has a broad changed-file set. Review/rebase and isolate the provider-specific changes from unrelated workspace changes first.

### Provider capability contract

Use one provider-neutral interface, not a separate domain workflow for every vendor. Capabilities must be explicit and must default to false:

- `scanProfile`
- `readScanStatus`
- `readExposureRecords`
- `listBrokers`
- `submitOptOut`
- `readRemovalStatus`
- `recurringMonitoring`
- `deleteProviderData`
- `supportedCountries`

The API must distinguish:
- `not_configured`;
- `credentials_configured`;
- `sandbox_verified`;
- `production_verified`;
- `degraded` / `unavailable`.

“Credentials configured” is not “connected” and is not “scan tested”. A provider that only supports scans must never be shown as supporting removal.

## 5. Target architecture

```text
NEXUS SHIELD AI
└── Privacy & Data Protection Center
    ├── Internal Data Transparency
    │   └── existing PRIVACY-DATA-INVENTORY
    ├── External Exposure
    │   ├── Consent & Profile Preview
    │   ├── Provider Registry / Capability Gate
    │   ├── Provider Adapters (AJAXX only after API approval; PrivacyHawk after PR review)
    │   └── Subject-scoped Exposure Results
    ├── Removal Case Management
    │   └── existing privacy_requests / privacy_request_targets / privacy_request_events
    ├── Consent & Audit
    └── Privacy-safe SOC / Digital Security Twin signals
```

### Recommended bounded components

- **Provider registry:** server-side allow-list of provider codes, configuration state, supported countries and capabilities.
- **Consent service:** records an explicit, purpose-specific, provider-specific and versioned approval before any profile transfer.
- **Scan orchestrator:** validates eligibility, creates a durable scan run, uses bounded timeouts/retries and reconciles uncertain outcomes.
- **Exposure result service:** retrieves results only for the authenticated subject; minimizes or encrypts any retained personal fields.
- **Removal orchestrator:** creates one idempotent target per broker/action and records provider receipts or manual instructions.
- **Privacy operator queue:** dedicated permission, assignment and reason-coded decisions; no broad admin visibility by default.
- **Retention worker:** expires temporary export/result artifacts and records verifiable cleanup outcomes.

## 6. Data model direction

Do not create another privacy request table.

Reuse:
- `privacy_requests` for the subject's legal/privacy request;
- `privacy_request_events` for append-only status history;
- `privacy_request_targets` for system/provider/broker tasks and idempotency.

Before a provider integration is merged, prefer a provider-neutral schema over permanently hard-coding a vendor name into every table. Proposed additive entities (names are logical design names, not migration SQL):

- `privacy_provider_consents`: subject, provider code, consent version, purpose, data categories, grant/revoke timestamps and safe audit metadata. Never store raw profile payloads here.
- `privacy_scan_runs`: subject, provider code, external scan reference, country, status, timestamps, counts and safe error code.
- `privacy_provider_events`: append-only provider lifecycle events with no raw personal payloads.
- `privacy_exposure_records` only if persistence is necessary: opaque provider record ID, broker code, category, match status/confidence and timestamps. Raw values should be fetched on demand or stored encrypted with narrow access and a short retention period.

Keep user identity scans owned by the individual subject. Workspace membership or workspace-admin status must not grant coworkers access to a person's private exposure results. If an organization-sponsored workflow is later required, model a separate, explicit delegated-authority/employee-consent relationship.

The current `privacy_request_targets` migration lacks a runtime executor and does not yet distinguish provider, broker and manual-removal details. Extend it additively only after the provider contract and target lifecycle are settled. Do not replace or rename existing tables.

## 7. Security and privacy controls

1. **Explicit consent:** show recipient, country, exact fields, purpose, one-time/recurring behavior and retention before transfer. No prechecked consent.
2. **Data minimization:** send only provider-required fields. Never send password hashes, tokens, uploaded documents or unrelated account data.
3. **Server-side credentials:** keep provider secrets and bearer tokens out of browser bundles, localStorage, logs and database rows.
4. **Egress restrictions:** HTTPS only, fixed provider origins, redirects disabled, bounded request/response sizes and timeouts.
5. **Subject isolation:** every read/write query is bound to the authenticated subject ID. Guessed UUIDs, another user's scan ID or cross-workspace membership must not expose results.
6. **Least privilege:** introduce a dedicated `privacy:review` / privacy-operator permission rather than relying on global admin access alone.
7. **CSRF/origin and rate limits:** preserve current authentication controls and add provider-scan abuse limits.
8. **Safe audit:** record consent version, provider, purpose, categories and event codes; never log raw names, phones, addresses, full responses or credentials.
9. **Idempotency:** one scan submission and one removal attempt per stable idempotency key. Unknown provider outcomes require a status lookup/reconciliation step before retry.
10. **Honest completion:** mark removal complete only after a verifiable provider/broker confirmation. Manual, unsupported, legally excepted and unknown outcomes remain visibly distinct.
11. **Retention:** document and test local, provider, logs, backups and export-artifact retention. Do not promise complete erasure where downstream backups or provider copies are not verifiably covered.
12. **Legal review:** no GDPR, Moroccan Law 09-08, CNDP or other compliance claim until the controller, lawful basis, rights handling, vendor roles and international transfers are reviewed by qualified counsel.

## 8. Required tests

### API/provider tests
- Provider disabled/missing credentials fails closed and performs no outbound request.
- Consent missing, false, stale or wrong-purpose is rejected before network transfer.
- Only allow-listed profile fields are sent; provider secrets never appear in responses or logs.
- Redirects, unexpected origins, malformed responses, oversized payloads and timeouts are rejected safely.
- Provider timeout after possible acceptance becomes `unknown`; retry does not create duplicate scans/removals.
- Unsupported country/capability blocks submission before profile transfer.

### Authorization and tenant tests
- Anonymous, expired and revoked sessions cannot scan or read results.
- Subject A cannot read Subject B's scan, record, consent or removal targets.
- A workspace admin cannot inspect another user's personal exposure results merely by role.
- Privacy operators can access only the minimum assigned metadata required for review.
- Broker catalog access does not expose another subject's data.

### Lifecycle and retention tests
- Every broker target is idempotent and has an append-only audit history.
- Scan completion never implies removal completion.
- Failed provider deletion or object cleanup remains blocked/unknown.
- Temporary export and cached result expiry is observable and retried safely.
- No raw personal payload enters SOC events, traces, analytics or agent logs.
- Migration tests prove fresh install and upgrade idempotency without modifying or deleting existing records.

All tests must use synthetic identities and provider sandbox data.

## 9. Delivery sequence and gates

| Phase | Deliverable | Gate |
|---|---|---|
| 0. Reconcile | Review PR #38 changed files, base/head drift, workspace changes, partner docs and CI; reconcile PR #40 docs | No code or provider activation |
| 1. Contract | Provider-neutral adapter types, capability registry and truthful status states; keep AJAXX no-op | Unit tests; no external personal-data transfer |
| 2. First provider | Isolate/review PrivacyHawk integration and prove sandbox flow with synthetic identities | Vendor approval, sandbox receipt, country/capability verification, auth/tenant tests |
| 3. Results UX | Integrate scan history/results in existing Privacy Center | Subject-only access, field minimization, retention evidence |
| 4. Removal workflow | Extend existing privacy targets and worker for supported broker opt-outs; manual fallback where needed | Idempotency, signed/verified receipts, explicit user authorization |
| 5. SOC/Twin | Emit privacy-safe exposure risk summaries | No raw PII in SOC/AI telemetry; tenant and subject privacy tests |
| 6. Production readiness | DPA/legal review, region/retention evidence, backup deletion controls, runbooks and rollback | Owner approval and staging validation; separate deployment approval |

## 10. Immediate next engineering actions

1. Keep `main` unchanged while this design is reviewed.
2. Review PR #38 as a separate provider proposal; do not merge while Draft/non-mergeable.
3. Decide whether the first production provider will be PrivacyHawk (after sandbox proof) or whether to wait for an official AJAXX API/partner contract.
4. Generalize the unmerged provider-specific schema only after that decision; avoid a second provider-specific scan/removal database.
5. Implement the provider-neutral boundary and automated tests before enabling any live profile transfer.

**Release statement:** Until the gates above pass, Digital Privacy Guard is a planned capability built on the existing Privacy Center foundation. It is not yet a live data-broker scanning or removal service on `main`.
