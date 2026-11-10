import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { withWorkspaceTransaction } from '../db/workspace-transaction.js';
import { PostgresAgentApprovalVerifier } from '../agents/persistence/approval.repository.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true' && Boolean(process.env.DATABASE_URL);

async function withRlsWorkspaceTransaction<T>(
  workspaceId: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withWorkspaceTransaction(workspaceId, async (client) => {
    await client.query('SET LOCAL ROLE nexus_agent_rls_test');
    return operation(client);
  });
}

describe.skipIf(!enabled)('NEXUS Intelligence Fabric PostgreSQL foundation', () => {
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const runId = randomUUID();
  const approvalId = randomUUID();
  const inputHash = 'a'.repeat(64);
  const idempotencyKey = 'agent-tool-' + randomUUID();
  const repository = new PostgresAgentApprovalVerifier(withRlsWorkspaceTransaction);
  let fixturesCreated = false;

  beforeAll(async () => {
    await pool.query(`DO $role$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_agent_rls_test') THEN
          CREATE ROLE nexus_agent_rls_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
      END
    $role$`);
    await pool.query('GRANT USAGE ON SCHEMA public TO nexus_agent_rls_test');
    await pool.query('GRANT SELECT ON users, workspaces, workspace_memberships TO nexus_agent_rls_test');
    await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs, agent_tool_approvals, agent_tool_audit_logs TO nexus_agent_rls_test');

    const role = await pool.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = \'nexus_agent_rls_test\''
    );
    expect(role.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });

    await pool.query(
      'INSERT INTO users (id, email, role, password_hash, is_active) VALUES ($1, $2, \'admin\', NULL, TRUE), ($3, $4, \'admin\', NULL, TRUE)',
      [userA, `agent-a-${userA}@example.test`, userB, `agent-b-${userB}@example.test`]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, status, created_by_user_id) VALUES ($1, \'Agent Fabric A\', $2, \'active\', $3), ($4, \'Agent Fabric B\', $5, \'active\', $6)',
      [workspaceA, 'agent-a-' + workspaceA.slice(0, 8), userA, workspaceB, 'agent-b-' + workspaceB.slice(0, 8), userB]
    );
    await pool.query(
      'INSERT INTO workspace_memberships (workspace_id, user_id, role, status, created_by_user_id) VALUES ($1, $2, \'admin\', \'active\', $2), ($1, $3, \'admin\', \'active\', $2), ($4, $3, \'admin\', \'active\', $3)',
      [workspaceA, userA, userB, workspaceB]
    );

    await withRlsWorkspaceTransaction(workspaceA, async (client) => {
      await client.query(
        `INSERT INTO agent_runs (
           id, workspace_id, agent_id, requested_by_user_id, status,
           task_type, input_hash, idempotency_key
         ) VALUES ($1, $2, 'cti-agent', $3, 'running', 'cti.lookup', $4, $5)`,
        [runId, workspaceA, userA, inputHash, 'agent-run-' + runId]
      );
      await client.query(
        `INSERT INTO agent_tool_approvals (
           id, workspace_id, run_id, requester_user_id, approved_by_user_id,
           agent_id, tool_name, tool_version, risk, input_hash, idempotency_key,
           status, decided_at
         ) VALUES ($1, $2, $3, $4, $5, 'cti-agent', 'defense.block', '1.0.0',
                   'defensive_action', $6, $7, 'approved', NOW())`,
        [approvalId, workspaceA, runId, userA, userB, inputHash, idempotencyKey]
      );
    });
    fixturesCreated = true;
  });

  afterAll(async () => {
    if (!fixturesCreated) return;
    await withWorkspaceTransaction(workspaceA, async (client) => {
      await client.query('DELETE FROM agent_tool_approvals WHERE workspace_id = $1', [workspaceA]);
      await client.query('DELETE FROM agent_runs WHERE workspace_id = $1', [workspaceA]);
    });
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
  });

  it('enforces RLS for a non-superuser role when context is missing or belongs to another tenant', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nexus_agent_rls_test');
      const unscoped = await client.query('SELECT id FROM agent_runs WHERE id = $1', [runId]);
      expect(unscoped.rowCount).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const crossTenant = await withRlsWorkspaceTransaction(workspaceB, async (client) =>
      client.query('SELECT id FROM agent_runs WHERE id = $1', [runId])
    );
    expect(crossTenant.rowCount).toBe(0);

    const scoped = await withRlsWorkspaceTransaction(workspaceA, async (client) =>
      client.query('SELECT id FROM agent_runs WHERE id = $1', [runId])
    );
    expect(scoped.rowCount).toBe(1);
  });

  it('consumes an approval only for the exact action and only once', async () => {
    const base = {
      approvalId,
      workspaceId: workspaceA,
      actorUserId: userA,
      agentId: 'cti-agent',
      runId,
      toolName: 'defense.block',
      toolVersion: '1.0.0',
      inputHash,
      idempotencyKey,
      risk: 'defensive_action' as const
    };

    expect(await repository.consumeApproval({ ...base, inputHash: 'b'.repeat(64) })).toBe(false);
    expect(await repository.consumeApproval(base)).toBe(true);
    expect(await repository.consumeApproval(base)).toBe(false);
  });

  it('keeps audit events append-only for an authorized workspace', async () => {
    const auditId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.workspace_id', $1, TRUE)", [workspaceA]);
      await client.query('SET LOCAL ROLE nexus_agent_rls_test');
      await client.query(
        `INSERT INTO agent_tool_audit_logs (
           id, workspace_id, run_id, request_id, agent_id, actor_user_id,
           tool_name, tool_version, risk, event_type, input_hash, idempotency_key
         ) VALUES ($1, $2, $3, 'request-audit-update', 'cti-agent', $4,
                   'cti.lookup', '1.0.0', 'read', 'started', $5, 'audit-update-key')`,
        [auditId, workspaceA, runId, userA, inputHash]
      );
      await expect(client.query(
        "UPDATE agent_tool_audit_logs SET event_type = 'failed' WHERE id = $1",
        [auditId]
      )).rejects.toMatchObject({ code: '55000' });
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query("SELECT set_config('app.workspace_id', $1, TRUE)", [workspaceA]);
      await client.query('SET LOCAL ROLE nexus_agent_rls_test');
      await client.query(
        `INSERT INTO agent_tool_audit_logs (
           id, workspace_id, run_id, request_id, agent_id, actor_user_id,
           tool_name, tool_version, risk, event_type, input_hash, idempotency_key
         ) VALUES ($1, $2, $3, 'request-audit-delete', 'cti-agent', $4,
                   'cti.lookup', '1.0.0', 'read', 'started', $5, 'audit-delete-key')`,
        [auditId, workspaceA, runId, userA, inputHash]
      );
      await expect(client.query(
        'DELETE FROM agent_tool_audit_logs WHERE id = $1',
        [auditId]
      )).rejects.toMatchObject({ code: '55000' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
