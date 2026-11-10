# NEXUS Intelligence Fabric — Correct Implementation Order

Branch: `feat/nexus-intelligence-fabric-core`

## Dependency order

1. Tool contracts and trusted Tool Registry.
2. Policy engine and execution gateway that resolve tools only through the registry.
3. Durable audit and approval persistence.
4. Agent runtime with bounded steps, deadlines, cancellation, and explicit tool allowlists.
5. First read-only Threat Intelligence agent and a real, source-attributed CTI adapter.
6. PostgreSQL-backed run/evidence state and workspace isolation tests.
7. Temporal workflows for durable orchestration.
8. NATS JetStream event publication via a transactional outbox and idempotent consumers.
9. Observability, evaluation, resilience, and security gates.
10. Gradual integration with SOC, Digital Twin, and defensive response.

## Release gates

- No LLM-provided executable code or dynamic tool registration.
- Tool selection is pinned to a registered name and version.
- Cross-workspace execution is denied by default.
- Read-only tools require explicit permissions; write, defensive, and destructive tools require a verified approval.
- Each tool call has a deadline and idempotency key.
- Audit logging covers denied and successful execution attempts without recording secrets.
- Agents cannot call tools outside their per-agent allowlist.
- The first CTI agent is read-only; no firewall mutation adapter is included in the initial core.
- CI must pass before opening integration PRs or connecting the core to other application modules.

## Repository constraints

- Existing Express API, PostgreSQL pool, workspace middleware, and Zod 4 are reused.
- Temporal and NATS are not added until package/runtime support and deployment topology are reviewed.
- Migrations are numbered only after checking the current branch's migration runner and migration inventory.
- No changes are made to the default branch or deployment configuration in this phase.
