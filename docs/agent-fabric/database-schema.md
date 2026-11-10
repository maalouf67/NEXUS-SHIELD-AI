# Agent Fabric database foundation

Migration: `013_agent_fabric_foundation.sql`

## Tables
- `agent_runs`: durable workspace-scoped execution records with workspace-level idempotency.
- `agent_tool_approvals`: one-time approvals bound to a specific run, requester, agent, tool/version, risk, canonical input hash, and idempotency key.
- `agent_tool_audit_logs`: append-only lifecycle evidence for tool execution; stores hashes and metadata only, never raw tool input or secrets.

## Isolation and transaction contract
All three tables enforce PostgreSQL RLS and FORCE ROW LEVEL SECURITY. API access must go through `withWorkspaceTransaction(workspaceId, callback)`, which validates the workspace UUID and applies `app.workspace_id` with transaction-local `set_config(..., TRUE)`.

The API runtime database role must be a dedicated non-superuser role with `NOSUPERUSER` and `NOBYPASSRLS`. A superuser or a role with BYPASSRLS can bypass PostgreSQL row-level security even when FORCE ROW LEVEL SECURITY is enabled. Use a separate privileged migration identity; do not run the API under the migration owner or database superuser. CI creates and exercises a dedicated `nexus_agent_rls_test` role with RLS bypass disabled.

## Approval consumption
`PostgresAgentApprovalVerifier` atomically changes an approved record to consumed only when every action-binding field matches, the approval has not expired, the workspace is active, the requester remains an active member, and the approver remains an active workspace administrator. A replay or mismatch returns false. The verifier accepts an injectable workspace transaction runner for testing under a non-bypass role.

## Audit immutability
Audit rows are append-only. The database trigger rejects UPDATE, DELETE, and TRUNCATE. The application repository writes only event metadata and a SHA-256 input digest; it does not persist raw tool arguments or provider secrets.

## Operational note
The audit log currently has no automated retention/purge workflow. Do not promise indefinite retention as a compliance guarantee; retention and workspace-erasure policy must be designed and approved before production.
