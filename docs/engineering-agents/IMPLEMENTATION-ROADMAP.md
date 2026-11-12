# NEXUS Engineering Agents — Implementation Roadmap

**Status:** Active staged implementation plan  
**Policy baseline:** 0.1.0  
**Rollout rule:** no broad autonomous write access until the preceding stage is accepted and tested.

## Stage 0 — Policy and governance baseline

**Goal:** agree the rules before adding execution capability.

Deliverables:
- Development Policy;
- ten role specifications;
- permissions and security model;
- GitHub Issue/PR workflow;
- branch protection and CODEOWNERS configuration plan;
- acceptance criteria and risk register.

Acceptance:
- project owner reviews and adopts the policy;
- existing repository rules are preserved;
- target controls are clearly distinguished from active controls;
- no application code or production settings are changed by this stage.

**Status:** adopted in `main` through PR #63.

## Stage 1 — First operational agent: Product Planner

**Goal:** prove one engineering agent can perform a useful, bounded task before building multi-agent coordination.

Deliverables:
- Product Planner runtime using the existing server-side AI provider integration;
- versioned input and structured-output schemas;
- requirement analysis, user stories and measurable acceptance criteria;
- risk, dependency, scope and verification planning;
- workspace-authenticated API route;
- secret-input rejection and bounded per-user request rate;
- runtime and route regression tests.

Acceptance:
- only authenticated active workspace members with an allowed role can call the planner;
- viewer and cross-workspace access are rejected;
- input and output schemas fail closed;
- likely credentials are rejected before a provider call;
- every result is marked draft and requires human review;
- the agent has no repository-write, GitHub mutation, merge, release or deployment tools;
- CI proves the behavior with an injected test executor;
- a real provider call is verified separately only after a valid server-side `OPENAI_API_KEY` is configured.

**Status:** implementation merged through PR #66. The runtime and API tests are green. External inference still depends on API server provider configuration and a separate live smoke test.

## Stage 2 — Durable Engineering Orchestrator (no autonomous source writes)

**Goal:** coordinate task lifecycle and agent handoffs using tenant-isolated, persistent, auditable state.

Deliverables:
- workspace-scoped task, result, event, approval and audit contracts;
- deterministic task state machine with workspace and revision checks;
- PostgreSQL task persistence and append-only event/audit history;
- idempotency constraints for task creation and event intake;
- authenticated task intake and status APIs;
- HMAC-verified, idempotent GitHub webhook intake after raw-body handling is proven;
- agent registry, capability allow-list and task-to-agent routing;
- bounded retry, timeout, cancellation and manual recovery behavior;
- human-readable status and audit reporting.

Acceptance:
- every task and related event is bound to one workspace, and cross-workspace reads or writes are rejected;
- repeated task submissions and webhook deliveries do not create duplicate work;
- invalid signatures and invalid task scopes are rejected before processing;
- state changes use optimistic revision checks and legal state transitions only;
- each state change is persisted with actor, task, workspace, correlation ID and timestamp;
- audit records contain no secret values or arbitrary request payloads;
- a service restart does not lose accepted task state;
- the initial GitHub App permission set is read-only;
- no engineering agent can write repository contents, merge, publish or deploy;
- database migration tests run only against disposable CI PostgreSQL, never production.

Implementation order inside this stage:
1. finish tenant-scoped contracts and negative tests;
2. add the migration and PostgreSQL repository;
3. test idempotent create/read/transition behavior and append-only audit events;
4. add API intake/status routes with workspace authorization;
5. add signed GitHub webhook intake and duplicate-delivery tests;
6. add deterministic agent registry and routing with Product Planner as the first registered runtime.

Temporal and NATS JetStream remain deferred. Add neither until the persisted task lifecycle, failure model, retry behavior and idempotency guarantees are proven with the simpler implementation.

## Stage 3 — System Architect

**Goal:** produce design artifacts and implementation dependencies from approved requests.

Deliverables:
- repository-aware impact analysis using explicitly supplied or read-authorized repository context;
- ADR templates and generated proposals;
- API/data contract recommendations;
- dependency graph and path ownership plan.

Acceptance:
- architecture output references inspected repository files;
- breaking API and database changes are highlighted;
- no source code is changed without a separately authorized implementation task;
- owner approval is recorded for material architecture decisions.

## Stage 4 — Developer agents in sandboxed branch mode

**Goal:** enable Frontend and Backend agents to prepare changes on isolated branches.

Deliverables:
- isolated execution workspace;
- branch manager and file-path policy enforcement;
- patch/diff inspection;
- bounded commit and PR creation;
- dependency and conflict checks.

Acceptance:
- agents cannot write outside their assigned paths;
- agents cannot write to `main` or protected branches;
- secrets are excluded from prompts, logs, and artifacts;
- concurrent writes to the same file are serialized;
- every PR links to an authorized Issue;
- a human can inspect the complete diff before merge.

## Stage 5 — Independent review, QA, and security gates

**Goal:** verify implementation quality before merge.

Deliverables:
- independent Code Reviewer;
- QA test generation and execution reporting;
- security review routing;
- CI status aggregation and remediation Issues.

Acceptance:
- the author cannot provide the only approval of its own PR;
- required checks are selected by changed paths and risk;
- failed checks block the workflow;
- findings include evidence and retest status;
- no agent can bypass review or CI.

## Stage 6 — DevOps, technical writing, and release preparation

**Goal:** complete the engineering lifecycle without removing human control.

Deliverables:
- DevOps workflow improvements;
- documentation updates linked to merged changes;
- release readiness report and Release Draft;
- maintenance and stale Issue triage.

Acceptance:
- workflow changes are reviewed and tested;
- docs reflect verified behavior;
- release notes contain only merged changes;
- Release Agent cannot publish, merge, deploy, or promote.

## Stage 7 — Controlled expansion

**Goal:** improve throughput and resilience after measured results.

Potential additions:
- Temporal for durable long-running workflows;
- NATS JetStream for asynchronous event distribution;
- per-agent model/provider selection with budget and privacy policies;
- OpenTelemetry traces and operational metrics;
- retry budgets, dead-letter handling, and manual recovery controls;
- additional repositories only after per-repository policy review.

Acceptance:
- recovery from worker, database, broker, and GitHub API outages is tested;
- message ordering and idempotency assumptions are documented;
- costs and rate limits are measurable;
- audit history remains complete;
- a human can pause, resume, cancel, and inspect each workflow.

Temporal and NATS JetStream are target technologies, not implementation dependencies that should be added before the workflow contracts and failure model are established.

## Rollback and containment

At every stage:
- disable the relevant worker or GitHub App installation if unexpected mutations occur;
- revoke short-lived credentials through the authorized operator process;
- preserve audit logs and relevant workflow runs;
- leave `main` unchanged;
- revert only through a reviewed PR unless an authorized human directs an emergency recovery action.

## Overall completion definition

The ten-agent system is operational only when all ten roles have tested runtimes, enforced permissions, verified task routing, auditable GitHub interactions, independent quality/security gates, and successful end-to-end workflow evidence.

A list of ten role names, prompt files, or contract interfaces alone does not satisfy this definition.
