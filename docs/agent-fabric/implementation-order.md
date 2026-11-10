# NEXUS Intelligence Fabric — Correct Implementation Order

Branch: `feat/nexus-intelligence-fabric-core`

## Dependency order

1. Tool contracts and trusted Tool Registry.
2. Policy engine and execution gateway that resolve tools only through the registry.
3. Durable, one-time approval consumption bound to workspace, actor, agent, run, tool name/version, canonical input hash, and idempotency key.
4. Durable audit for allowed, denied, and failed executions without recording secrets.
5. Agent runtime with bounded steps, deadlines, cancellation, and explicit per-agent tool allowlists.
6. First read-only Threat Intelligence agent and a real, source-attributed CTI adapter.
7. PostgreSQL-backed run/evidence state and workspace isolation tests.
8. Temporal workflows for durable orchestration.
9. NATS JetStream publication via transactional outbox and idempotent consumers.
10. Observability, evaluation, resilience, and security gates.
11. Gradual integration with SOC, Digital Twin, and defensive response.

## Release gates

- No LLM-provided executable code or dynamic tool registration.
- Tool selection is pinned to a registered name and version.
- Cross-workspace execution is denied by default.
- Read-only tools require explicit permissions; write, defensive, and destructive tools require a verified, one-time approval bound to the exact normalized action.
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
