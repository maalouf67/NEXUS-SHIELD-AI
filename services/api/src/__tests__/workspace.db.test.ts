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
  const workspaceC = randomUUID();
  const assetA = 'ws-a-' + randomUUID();
  const assetB = 'ws-b-' + randomUUID();
  const externalEventId = 'external-' + randomUUID();
  const emailA = 'workspace-a-' + userA + '@example.test';
  const emailB = 'workspace-b-' + userB + '@example.test';

  afterAll(async () => {
    await pool.query('DELETE FROM workspace_integrations WHERE workspace_id = ANY($1::uuid[])', [[workspaceA, workspaceB, workspaceC]]);
    await pool.query(
      'DELETE FROM security_events WHERE workspace_id = ANY($1::uuid[]) OR (workspace_id IS NULL AND source = \'ci-legacy\' AND external_event_id = $2)',
      [[workspaceA, workspaceB, workspaceC], externalEventId]
    );
    await pool.query('DELETE FROM assets WHERE id = ANY($1::varchar[])', [[assetA, assetB]]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceA, workspaceB, workspaceC]]);
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
    expect(await repository.revokeMember(workspaceB, userA, userB)).toMatchObject({ outcome: 'not_found' });

    await pool.query(
      'INSERT INTO assets (id, workspace_id, asset_type, name) VALUES ($1, $2, \'server\', \'workspace A asset\'), ($3, $4, \'server\', \'workspace B asset\')',
      [assetA, workspaceA, assetB, workspaceB]
    );

    await expect(pool.query(
      'INSERT INTO asset_relationships (id, workspace_id, from_asset_id, to_asset_id, relationship_type) VALUES ($1, $2, $3, $4, \'references\')',
      ['cross-' + randomUUID(), workspaceA, assetA, assetB]
    )).rejects.toMatchObject({ code: '23503' });
  });


  it('changes and revokes members transactionally, preserves the last admin, and records workspace audit events', async () => {
    const added = await repository.addMemberByEmail(workspaceA, emailB, 'analyst', userA);
    expect(added).toMatchObject({ id: userB, role: 'analyst', status: 'active' });

    const promoted = await repository.updateMemberRole(workspaceA, userB, 'admin', userA);
    expect(promoted.outcome).toBe('updated');
    if (promoted.outcome !== 'updated') throw new Error('Expected user B promotion.');
    expect(promoted.member).toMatchObject({ id: userB, role: 'admin', status: 'active' });

    const demoted = await repository.updateMemberRole(workspaceA, userA, 'analyst', userB);
    expect(demoted.outcome).toBe('updated');
    if (demoted.outcome !== 'updated') throw new Error('Expected user A demotion.');
    expect(demoted.member).toMatchObject({ id: userA, role: 'analyst', status: 'active' });

    const revoked = await repository.revokeMember(workspaceA, userA, userB);
    expect(revoked.outcome).toBe('revoked');
    if (revoked.outcome !== 'revoked') throw new Error('Expected user A revocation.');
    expect(revoked.member).toMatchObject({ id: userA, role: 'analyst', status: 'revoked' });
    expect(await repository.findActiveMembership(userA, workspaceA)).toBeNull();

    expect(await repository.revokeMember(workspaceA, userB, userB)).toMatchObject({
      outcome: 'last_admin'
    });
    expect(await repository.updateMemberRole(workspaceA, userB, 'viewer', userA)).toMatchObject({
      outcome: 'actor_not_admin'
    });

    const audit = await pool.query(
      `SELECT event_type, attributes
       FROM security_events
       WHERE workspace_id = $1 AND source = 'nexus.workspace.access'
       ORDER BY received_at ASC, id ASC`,
      [workspaceA]
    );
    expect(audit.rows).toHaveLength(3);
    expect(audit.rows.map((row) => row.event_type).sort()).toEqual([
      'workspace.member_revoked',
      'workspace.member_role_changed',
      'workspace.member_role_changed'
    ].sort());
    expect(audit.rows[0].attributes).toMatchObject({
      actor_user_id: userA,
      target_user_id: userB,
      previous_role: 'analyst',
      new_role: 'admin'
    });
  });

  it('serializes concurrent administrator revocations so at least one admin remains', async () => {
    await repository.createWorkspace({
      id: workspaceC,
      name: 'CI Workspace C',
      slug: 'ci-c-' + workspaceC.slice(0, 8),
      ownerUserId: userA
    });
    const secondAdmin = await repository.addMemberByEmail(workspaceC, emailB, 'admin', userA);
    expect(secondAdmin).toMatchObject({ id: userB, role: 'admin', status: 'active' });

    const [revokeA, revokeB] = await Promise.all([
      repository.revokeMember(workspaceC, userA, userB),
      repository.revokeMember(workspaceC, userB, userA)
    ]);
    expect([revokeA.outcome, revokeB.outcome].sort()).toEqual(['actor_not_admin', 'revoked']);

    const activeA = await repository.findActiveMembership(userA, workspaceC);
    const activeB = await repository.findActiveMembership(userB, workspaceC);
    expect(Number(Boolean(activeA)) + Number(Boolean(activeB))).toBe(1);
    const remainingAdminId = activeA ? userA : userB;
    expect(await repository.revokeMember(workspaceC, remainingAdminId, remainingAdminId)).toMatchObject({
      outcome: 'last_admin'
    });

    const audit = await pool.query(
      "SELECT event_type, attributes FROM security_events WHERE workspace_id = $1 AND source = 'nexus.workspace.access'",
      [workspaceC]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].event_type).toBe('workspace.member_revoked');
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
    expect(await repository.revokeIntegration(workspaceA, created.id)).toBe(true);
    expect(await repository.findActiveIntegrationByHash(tokenHash)).toBeNull();
  });
});