# NEXUS SHIELD AI — Threat Intelligence & Predictive Analytics

## Implementation status

This branch introduces the first additive data and offline-analysis foundation. It is not yet a live threat-intelligence integration and must not be described as production-ready.

## Existing integration points verified on `main`

- Express API already exposes authenticated, workspace-scoped threat summaries and a protected AI triage route in `services/api/src/routes/threats.ts`.
- PostgreSQL already stores `security_events`, review history, assets and workspace ownership.
- Migration runner discovers immutable, numbered SQL files in `database/init`; applied migration files must never be edited.
- Python FastAPI currently provides health and file scanning/quarantine endpoints. No threat analytics API was verified in that service.
- Workspace identity is enforced through the existing `x-nexus-workspace-id` middleware for user-facing API routes.

## This foundation

- Workspace-scoped threat indicator fingerprints with source, confidence, severity, timestamps and provenance.
- Event-linked risk assessments with bounded scores, confidence, model version and evidence.
- Event-linked anomaly findings with method, threshold and evidence.
- Attack-pattern correlation groups and workspace-safe event membership.
- Early-warning records with explicit analyst lifecycle states.
- R statistical primitives for repeatable baseline scoring and anomaly exploration.

## Safety and data integrity

- All derived records are scoped to a workspace and use composite foreign keys for event/correlation references.
- No legacy events are automatically assigned to a workspace.
- Evidence is required to be represented as JSON arrays; model outputs are assessments, not confirmed incident facts.
- This branch does not activate external feeds, autonomous blocking, or production jobs.
- R code is an offline analysis/validation layer only. It is not called by the production API until runtime packaging, input contracts, performance and security have been reviewed.

## Validation still required

1. Run migration idempotency and rollback-safe tests against a disposable PostgreSQL instance with the repository's full prior migrations.
2. Add API-level authorization tests proving workspace A cannot read or mutate workspace B records.
3. Add R tests using `Rscript services/analytics-r/tests/test_threat_analytics.R` where R is installed.
4. Add evidence-backed feed adapters only after provider endpoints, licensing, quotas and data retention are verified.
5. Integrate read-only analytics into the existing threat API and SOC dashboard after contract and CI validation.

No production deployment or merge to `main` is included in this branch.

## API integration added

The Express API mounts the protected `/api/threat-intelligence` routes:

- `GET /overview`: workspace-scoped PostgreSQL counters.
- `POST /events/:id/assess`: analyst/admin-only deterministic baseline assessment, persisted with evidence; returns 404 for events outside the active workspace.
- `GET /assessments`: workspace-scoped assessment history.

The current assessment is intentionally a transparent heuristic using event severity and same-type event volume in a rolling 24-hour window. It is not a trained model. Anomaly findings are recorded only when the same event type reaches the explicit five-event threshold in that window. The endpoint does not perform containment or external lookups.

## API verification

Automated route tests cover authentication, workspace-scoped event lookup, viewer write denial, persisted assessment/anomaly writes, and database failure handling. These tests still need to pass in GitHub Actions before merge.
