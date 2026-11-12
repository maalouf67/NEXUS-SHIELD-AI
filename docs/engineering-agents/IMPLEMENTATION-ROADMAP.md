# NEXUS Engineering Agents — Implementation Roadmap

**Status:** Proposed implementation plan  
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

## Stage 1 — Orchestrator foundation

**Goal:** create a deterministic control plane with no autonomous source-code writes.

Deliverables:
- typed task, result, event, approval, and audit contracts;
- task state machine;
- idempotent webhook receiver;
- GitHub App authentication using least-privilege installation tokens;
- task/agent registry and capability checks;
- PostgreSQL execution history;
- human-readable status reporting.

Acceptance:
- webhook signatures are verified;
- duplicate events do not create duplicate work;
- invalid scopes and permissions are rejected;
- every execution is traceable by task and correlation ID;
- service restarts do not lose workflow state;
- no agent can write to repository contents.

## Stage 2 — Product Planner in read-only / Issue-limited mode

**Goal:** convert a human request into an Issue proposal.

Deliverables:
- requirement extraction and clarification flags;
- user-story and acceptance-criteria generation;
- duplicate Issue detection;
- priority and proposed label mapping;
- Issue creation through an approved GitHub App permission.

Acceptance:
- a human can review the proposed Issue before or immediately after creation according to configured approval policy;
- generated Issues include measurable acceptance criteria;
- the Planner cannot create branches, commit source code, merge, or release;
- repeated webhook delivery is idempotent.

## Stage 3 — System Architect

**Goal:** produce design artifacts and implementation dependencies.

Deliverables:
- repository-aware impact analysis;
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
