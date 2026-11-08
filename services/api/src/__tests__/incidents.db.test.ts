import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresIncidentRepository } from '../incidents/incident.repository.js';
import { pool } from '../db/pool.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL incident management integration', () => {
  const repository = new PostgresIncidentRepository();
  const actorId = randomUUID();
  const workspaceId = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [actorId, `incident-ci-${actorId}@example.test`]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)',
      [workspaceId, 'Incident CI workspace', `incident-ci-${workspaceId.slice(0, 8)}`, actorId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM incident_activity WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM incidents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);
    await pool.end();
  });

  it('creates an incident, records status history, and retrieves its audit trail', async () => {
    const incident = await repository.create({
      workspaceId,
      id: randomUUID(),
      title: 'PostgreSQL integration incident',
      severity: 'high',
      source: 'ci-integration-test',
      actorUserId: actorId
    });

    expect(incident.status).toBe('open');
    expect(incident.createdByUserId).toBe(actorId);

    const update = await repository.updateStatus({
      workspaceId,
      incidentId: incident.id,
      status: 'investigating',
      note: 'Integration test status change.',
      actorUserId: actorId,
      actorRole: 'analyst'
    });

    expect(update.outcome).toBe('updated');
    if (update.outcome !== 'updated') {
      throw new Error('Expected incident status update to succeed.');
    }
    expect(update.incident.status).toBe('investigating');

    const detail = await repository.getById(incident.id, workspaceId);
    expect(detail?.status).toBe('investigating');
    expect(detail?.activity).toHaveLength(2);
    const statusActivity = detail?.activity.find((item) => item.action === 'incident.status_changed');
    expect(statusActivity?.fromStatus).toBe('open');
    expect(statusActivity?.toStatus).toBe('investigating');
    expect(statusActivity?.actorUserId).toBe(actorId);

    const list = await repository.list(workspaceId, {
      status: 'investigating',
      severity: 'high',
      limit: 10,
      offset: 0
    });
    expect(list.incidents.some((item) => item.id === incident.id)).toBe(true);
  });

  it('requires an admin to reopen a resolved incident', async () => {
    const incident = await repository.create({
      workspaceId,
      id: randomUUID(),
      title: 'Reopen authorization test',
      severity: 'medium',
      actorUserId: actorId
    });

    const investigating = await repository.updateStatus({
      workspaceId,
      incidentId: incident.id,
      status: 'investigating',
      actorUserId: actorId,
      actorRole: 'analyst'
    });
    expect(investigating.outcome).toBe('updated');

    const resolved = await repository.updateStatus({
      workspaceId,
      incidentId: incident.id,
      status: 'resolved',
      actorUserId: actorId,
      actorRole: 'analyst'
    });
    expect(resolved.outcome).toBe('updated');

    const analystReopen = await repository.updateStatus({
      workspaceId,
      incidentId: incident.id,
      status: 'open',
      actorUserId: actorId,
      actorRole: 'analyst'
    });
    expect(analystReopen.outcome).toBe('invalid_transition');

    const adminReopen = await repository.updateStatus({
      workspaceId,
      incidentId: incident.id,
      status: 'open',
      actorUserId: actorId,
      actorRole: 'admin'
    });
    expect(adminReopen.outcome).toBe('updated');
  });
});
