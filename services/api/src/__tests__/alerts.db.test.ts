import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAlertRepository } from '../alerts/alert.repository.js';
import { PostgresIncidentRepository } from '../incidents/incident.repository.js';
import { pool } from '../db/pool.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL alert audit integration', () => {
  const alerts = new PostgresAlertRepository();
  const incidents = new PostgresIncidentRepository();
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [actorId, `alert-ci-${actorId}@example.test`]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)',
      [workspaceId, 'Alert CI workspace', `alert-ci-${workspaceId.slice(0, 8)}`, actorId]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)',
      [otherWorkspaceId, 'Other Alert CI workspace', `alert-other-${otherWorkspaceId.slice(0, 8)}`, actorId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM incident_activity WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM alerts WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM incidents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);
    await pool.end();
  });

  it('does not list or update an alert from another workspace', async () => {
    const incident = await incidents.create({
      workspaceId,
      id: randomUUID(),
      title: 'Tenant isolation alert test',
      severity: 'high',
      actorUserId: actorId
    });
    const alert = await alerts.create({
      workspaceId,
      id: randomUUID(),
      incidentId: incident.id,
      type: 'tenant-isolation-test',
      riskScore: 80,
      actorUserId: actorId
    });
    if (!alert) throw new Error('Expected test alert to be created.');

    const otherList = await alerts.list(otherWorkspaceId, { limit: 100, offset: 0 });
    expect(otherList.alerts.some((item) => item.id === alert.id)).toBe(false);

    const attemptedUpdate = await alerts.updateStatus({
      workspaceId: otherWorkspaceId,
      alertId: alert.id,
      status: 'acknowledged',
      actorUserId: actorId,
      actorRole: 'admin'
    });
    expect(attemptedUpdate.outcome).toBe('not_found');

    const original = await alerts.list(workspaceId, { limit: 100, offset: 0 });
    expect(original.alerts.find((item) => item.id === alert.id)?.status).toBe('active');
  });

  it('records an alert and every status change in the incident audit history', async () => {
    const incident = await incidents.create({
      workspaceId,
      id: randomUUID(),
      title: 'Alert integration test',
      severity: 'high',
      source: 'ci-integration-test',
      actorUserId: actorId
    });

    const alert = await alerts.create({
      workspaceId,
      id: randomUUID(),
      incidentId: incident.id,
      type: 'ci-identity-anomaly',
      riskScore: 72,
      actorUserId: actorId,
      note: 'Synthetic CI fixture only.'
    });

    expect(alert?.status).toBe('active');
    expect(alert?.riskScore).toBe(72);

    const acknowledged = await alerts.updateStatus({
      workspaceId,
      alertId: alert!.id,
      status: 'acknowledged',
      actorUserId: actorId,
      actorRole: 'analyst',
      note: 'Acknowledged in integration test.'
    });

    expect(acknowledged.outcome).toBe('updated');

    const detail = await incidents.getById(incident.id, workspaceId);
    expect(detail?.alerts).toHaveLength(1);
    expect(detail?.alerts[0]?.status).toBe('acknowledged');
    expect(detail?.activity.some((item) => item.action === 'alert.created' && item.alertId === alert!.id)).toBe(true);
    expect(detail?.activity.some((item) => item.action === 'alert.status_changed' && item.alertId === alert!.id)).toBe(true);

    const list = await alerts.list(workspaceId, {
      status: 'acknowledged',
      minimumRiskScore: 70,
      limit: 10,
      offset: 0
    });
    expect(list.alerts.some((item) => item.id === alert!.id)).toBe(true);
  });
});
