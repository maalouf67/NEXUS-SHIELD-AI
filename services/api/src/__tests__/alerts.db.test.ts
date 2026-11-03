import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import { PostgresAlertRepository } from '../alerts/alert.repository.js';
import { PostgresIncidentRepository } from '../incidents/incident.repository.js';
import { pool } from '../db/pool.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL alert audit integration', () => {
  const alerts = new PostgresAlertRepository();
  const incidents = new PostgresIncidentRepository();
  const actorId = randomUUID();
  const incidentIds: string[] = [];

  afterAll(async () => {
    if (incidentIds.length > 0) {
      await pool.query(
        'DELETE FROM incidents WHERE id = ANY($1::uuid[])',
        [incidentIds]
      );
    }
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);
    await pool.end();
  });

  it('records an alert and every status change in the incident audit history', async () => {
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [actorId, `alert-ci-${actorId}@example.test`]
    );

    const incident = await incidents.create({
      id: randomUUID(),
      title: 'Alert integration test',
      severity: 'high',
      source: 'ci-integration-test',
      actorUserId: actorId
    });
    incidentIds.push(incident.id);

    const alert = await alerts.create({
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
      alertId: alert!.id,
      status: 'acknowledged',
      actorUserId: actorId,
      actorRole: 'analyst',
      note: 'Acknowledged in integration test.'
    });

    expect(acknowledged.outcome).toBe('updated');

    const detail = await incidents.getById(incident.id);
    expect(detail?.alerts).toHaveLength(1);
    expect(detail?.alerts[0]?.status).toBe('acknowledged');
    expect(detail?.activity.some((item) => item.action === 'alert.created' && item.alertId === alert!.id)).toBe(true);
    expect(detail?.activity.some((item) => item.action === 'alert.status_changed' && item.alertId === alert!.id)).toBe(true);

    const list = await alerts.list({
      status: 'acknowledged',
      minimumRiskScore: 70,
      limit: 10,
      offset: 0
    });
    expect(list.alerts.some((item) => item.id === alert!.id)).toBe(true);
  });
});
