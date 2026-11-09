import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { PostgresWorkspaceRepository, hashWorkspaceIntegrationToken } from '../workspaces/workspace.repository.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true' && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('PostgreSQL workspace isolation foundation', () => {
  const repository = new PostgresWorkspaceRepository();
  const userA = randomUUID();
  const userB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const assetA = 'ws-a-' + randomUUID();
  const assetB = 'ws-b-' + randomUUID();
  const externalEventId = 'external-' + randomUUID();
  const emailA = 'workspace-a-' + userA + '@example.test';
  const emailB = 'workspace-b-' + userB + '@example.test';

  afterAll(async () => {
    await pool.query('DELETE FROM workspace_integrations WHERE workspace_id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
    await pool.query(
      'DELETE FROM security_events WHERE workspace_id = ANY($1::uuid[]) OR (workspace_id IS NULL AND source = \'ci-legacy\' AND external_event_id = $2)',
      [[workspaceA, workspaceB], externalEventId]
    );
    await pool.query('DELETE FROM assets WHERE id = ANY($1::varchar[])', [[assetA, assetB]]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
    await pool.end();
  });

  it('isolates memberships and enforces same-workspace asset relationships at the database layer', async () => {
    await pool.query(
      'INSERT INTO users (id, email, role, password_hash, is_active) VALUES ($1, $2, \'admin\', NULL, TRUE), ($3, $4, \'admin\', NULL, TRUE)',
      [userA, emailA, userB, emailB]
    );

    await repository.createWorkspace({ id: workspaceA, name: 'CI Workspace A', slug: 'ci-a-' + workspaceA.slice(0, 8), ownerUserId: userA });
    await repository.createWorkspace({ id: workspaceB, name: 'CI Workspace B', slug: 'ci-b-' + workspaceB.slice(0, 8), ownerUserId: userB });

    expect(await repository.findActiveMembership(userA, workspaceA)).toMatchObject({ id: workspaceA, role: 'admin' });
    expect(await repository.findActiveMembership(userA, workspaceB)).toBeNull();
    expect(await repository.findActiveMembership(userB, workspaceA)).toBeNull();

    const invitedMember = await repository.addMemberByEmail(workspaceA, emailB, 'viewer', userA);
    expect(invitedMember).toMatchObject({ id: userB, role: 'viewer', status: 'active' });
    const memberAudit = await pool.query(
      "SELECT action, actor_user_id, target_id FROM workspace_audit_logs WHERE workspace_id = $1 AND action = 'workspace.member.added' AND target_id = $2",
      [workspaceA, userB]
    );
    expect(memberAudit.rows).toMatchObject([{ action: 'workspace.member.added', actor_user_id: userA, target_id: userB }]);

    await pool.query(
      'INSERT INTO assets (id, workspace_id, asset_type, name) VALUES ($1, $2, \'server\', \'workspace A asset\'), ($3, $4, \'server\', \'workspace B asset\')',
      [assetA, workspaceA, assetB, workspaceB]
    );

    await expect(pool.query(
      'INSERT INTO asset_relationships (id, workspace_id, from_asset_id, to_asset_id, relationship_type) VALUES ($1, $2, $3, $4, \'references\')',
      ['cross-' + randomUUID(), workspaceA, assetA, assetB]
    )).rejects.toMatchObject({ code: '23503' });
  });

  it('permits duplicate external event identifiers in separate workspaces and stores only integration-token hashes', async () => {
    await pool.query(
      'INSERT INTO security_events (id, workspace_id, source, external_event_id, event_type, severity, observed_at, summary) VALUES ($1, $2, \'ci-workspace\', $3, \'test-event\', \'low\', NOW(), \'Workspace A test\'), ($4, $5, \'ci-workspace\', $3, \'test-event\', \'low\', NOW(), \'Workspace B test\')',
      [randomUUID(), workspaceA, externalEventId, randomUUID(), workspaceB]
    );
    const eventCount = await pool.query(
      'SELECT COUNT(*)::int AS total FROM security_events WHERE workspace_id = ANY($1::uuid[]) AND source = \'ci-workspace\' AND external_event_id = $2',
      [[workspaceA, workspaceB], externalEventId]
    );
    expect(eventCount.rows[0].total).toBe(2);

    // The legacy/unassigned namespace must retain its original source+ID uniqueness.
    await pool.query(
      'INSERT INTO security_events (id, workspace_id, source, external_event_id, event_type, severity, observed_at, summary) VALUES ($1, NULL, \'ci-legacy\', $2, \'test-event\', \'low\', NOW(), \'Legacy event\')',
      [randomUUID(), externalEventId]
    );
    await expect(pool.query(
      'INSERT INTO security_events (id, workspace_id, source, external_event_id, event_type, severity, observed_at, summary) VALUES ($1, NULL, \'ci-legacy\', $2, \'test-event\', \'low\', NOW(), \'Duplicate legacy event\')',
      [randomUUID(), externalEventId]
    )).rejects.toMatchObject({ code: '23505' });

    await expect(repository.createIntegration({
      workspaceId: workspaceA,
      name: 'unauthorized integration',
      permissions: ['events:write'],
      actorUserId: userB
    })).rejects.toMatchObject({ name: 'WorkspaceAuthorizationError' });

    const created = await repository.createIntegration({
      workspaceId: workspaceA,
      name: 'CI event integration',
      permissions: ['events:write'],
      actorUserId: userA
    });
    const tokenHash = hashWorkspaceIntegrationToken(created.token);
    expect(tokenHash).not.toBe(created.token);
    const rawTokenLookup = await pool.query(
      'SELECT id FROM workspace_integrations WHERE id = $1 AND token_hash = $2',
      [created.id, created.token]
    );
    expect(rawTokenLookup.rowCount).toBe(0);

    expect(await repository.findActiveIntegrationByHash(tokenHash)).toMatchObject({
      id: created.id, workspaceId: workspaceA, permissions: ['events:write']
    });

    const createdAudit = await pool.query(
      "SELECT action, actor_user_id, target_id, metadata FROM workspace_audit_logs WHERE workspace_id = $1 AND target_id = $2",
      [workspaceA, created.id]
    );
    expect(createdAudit.rows).toMatchObject([{
      action: 'workspace.integration.created',
      actor_user_id: userA,
      target_id: created.id
    }]);
    expect(createdAudit.rows[0].metadata).toMatchObject({
      name: 'CI event integration',
      permissions: 'events:write'
    });
    expect(JSON.stringify(createdAudit.rows[0].metadata)).not.toContain(created.token);
    await expect(pool.query(
      "UPDATE workspace_audit_logs SET metadata = '{}'::jsonb WHERE workspace_id = $1 AND target_id = $2",
      [workspaceA, created.id]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(pool.query(
      'DELETE FROM workspace_audit_logs WHERE workspace_id = $1 AND target_id = $2',
      [workspaceA, created.id]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(repository.revokeIntegration(workspaceA, created.id, userB))
      .rejects.toMatchObject({ name: 'WorkspaceAuthorizationError' });
    expect(await repository.revokeIntegration(workspaceA, created.id, userA)).toBe(true);
    expect(await repository.findActiveIntegrationByHash(tokenHash)).toBeNull();

    const revokedAudit = await pool.query(
      "SELECT COUNT(*)::int AS total FROM workspace_audit_logs WHERE workspace_id = $1 AND target_id = $2 AND action = 'workspace.integration.revoked'",
      [workspaceA, created.id]
    );
    expect(revokedAudit.rows[0].total).toBe(1);
  });
});