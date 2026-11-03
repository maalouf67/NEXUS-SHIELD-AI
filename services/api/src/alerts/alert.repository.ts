import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  incidentId: string;
  incidentTitle: string;
  incidentSeverity: string;
  incidentStatus: string;
  type: string;
  riskScore: number;
  status: AlertStatus;
  createdAt: string;
}

export interface AlertListFilters {
  status?: AlertStatus;
  minimumRiskScore?: number;
  limit: number;
  offset: number;
}

export interface CreateAlertInput {
  id: string;
  incidentId: string;
  type: string;
  riskScore: number;
  actorUserId: string;
  note?: string;
}

export interface UpdateAlertStatusInput {
  alertId: string;
  status: AlertStatus;
  actorUserId: string;
  actorRole: 'admin' | 'analyst' | 'viewer';
  note?: string;
}

export type UpdateAlertStatusResult =
  | { outcome: 'not_found' }
  | { outcome: 'invalid_transition'; currentStatus: AlertStatus }
  | { outcome: 'updated'; alert: Alert };

export interface AlertRepository {
  list(filters: AlertListFilters): Promise<{ alerts: Alert[]; total: number }>;
  create(input: CreateAlertInput): Promise<Alert | null>;
  updateStatus(input: UpdateAlertStatusInput): Promise<UpdateAlertStatusResult>;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapAlert(row: any): Alert {
  return {
    id: row.id,
    incidentId: row.incident_id,
    incidentTitle: row.incident_title,
    incidentSeverity: row.incident_severity,
    incidentStatus: row.incident_status,
    type: row.type,
    riskScore: row.risk_score,
    status: row.status as AlertStatus,
    createdAt: toIsoString(row.created_at)
  };
}

const allowedTransitions: Record<AlertStatus, AlertStatus[]> = {
  active: ['acknowledged', 'resolved'],
  acknowledged: ['active', 'resolved'],
  resolved: ['active']
};

export class PostgresAlertRepository implements AlertRepository {
  async list(filters: AlertListFilters): Promise<{ alerts: Alert[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];

    if (filters.status) {
      values.push(filters.status);
      where.push(`a.status = $${values.length}`);
    }
    if (filters.minimumRiskScore !== undefined) {
      values.push(filters.minimumRiskScore);
      where.push(`a.risk_score >= $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM alerts a
       ${whereClause}`,
      values
    );

    const listValues = [...values, filters.limit, filters.offset];
    const result = await pool.query(
      `SELECT a.id, a.incident_id, i.title AS incident_title,
              i.severity AS incident_severity, i.status AS incident_status,
              a.type, a.risk_score, a.status, a.created_at
       FROM alerts a
       LEFT JOIN incidents i ON i.id = a.incident_id
       ${whereClause}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );

    return {
      alerts: result.rows.map(mapAlert),
      total: countResult.rows[0]?.total ?? 0
    };
  }

  async create(input: CreateAlertInput): Promise<Alert | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const incidentResult = await client.query(
        'SELECT id FROM incidents WHERE id = $1 FOR UPDATE',
        [input.incidentId]
      );

      if (!incidentResult.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const alertId = input.id;
      await client.query(
        `INSERT INTO alerts (id, incident_id, type, risk_score, status, created_at)
         VALUES ($1, $2, $3, $4, 'active', NOW())`,
        [alertId, input.incidentId, input.type, input.riskScore]
      );

      const auditNote = [
        `type=${input.type}`,
        `risk_score=${input.riskScore}`,
        input.note?.trim()
      ].filter(Boolean).join('; ');

      await client.query(
        `INSERT INTO incident_activity
          (id, incident_id, alert_id, actor_user_id, action,
           from_status, to_status, note)
         VALUES ($1, $2, $3, $4, 'alert.created', NULL, 'active', $5)`,
        [randomUUID(), input.incidentId, alertId, input.actorUserId, auditNote]
      );

      const result = await client.query(
        `SELECT a.id, a.incident_id, i.title AS incident_title,
                i.severity AS incident_severity, i.status AS incident_status,
                a.type, a.risk_score, a.status, a.created_at
         FROM alerts a
         JOIN incidents i ON i.id = a.incident_id
         WHERE a.id = $1`,
        [alertId]
      );

      await client.query('COMMIT');
      return mapAlert(result.rows[0]);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(input: UpdateAlertStatusInput): Promise<UpdateAlertStatusResult> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT id, incident_id, status FROM alerts WHERE id = $1 FOR UPDATE',
        [input.alertId]
      );
      const current = currentResult.rows[0];

      if (!current) {
        await client.query('COMMIT');
        return { outcome: 'not_found' };
      }

      const currentStatus = current.status as AlertStatus;
      const allowed = allowedTransitions[currentStatus] ?? [];
      if (!allowed.includes(input.status)) {
        await client.query('ROLLBACK');
        return { outcome: 'invalid_transition', currentStatus };
      }

      if (
        input.status === 'active' &&
        currentStatus === 'resolved' &&
        input.actorRole !== 'admin'
      ) {
        await client.query('ROLLBACK');
        return { outcome: 'invalid_transition', currentStatus };
      }

      await client.query(
        'UPDATE alerts SET status = $2 WHERE id = $1',
        [input.alertId, input.status]
      );

      await client.query(
        `INSERT INTO incident_activity
          (id, incident_id, alert_id, actor_user_id, action,
           from_status, to_status, note)
         VALUES ($1, $2, $3, $4, 'alert.status_changed', $5, $6, $7)`,
        [
          randomUUID(),
          current.incident_id,
          input.alertId,
          input.actorUserId,
          currentStatus,
          input.status,
          input.note ?? null
        ]
      );

      const result = await client.query(
        `SELECT a.id, a.incident_id, i.title AS incident_title,
                i.severity AS incident_severity, i.status AS incident_status,
                a.type, a.risk_score, a.status, a.created_at
         FROM alerts a
         JOIN incidents i ON i.id = a.incident_id
         WHERE a.id = $1`,
        [input.alertId]
      );

      await client.query('COMMIT');
      return { outcome: 'updated', alert: mapAlert(result.rows[0]) };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const alertRepository = new PostgresAlertRepository();
