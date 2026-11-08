import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
export type IncidentActorRole = 'admin' | 'analyst' | 'viewer';

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentAlert {
  id: string;
  incidentId: string | null;
  type: string;
  riskScore: number;
  status: string;
  createdAt: string;
}

export interface IncidentActivity {
  id: string;
  incidentId: string;
  alertId: string | null;
  actorUserId: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

export interface IncidentDetail extends Incident {
  alerts: IncidentAlert[];
  activity: IncidentActivity[];
}

export interface IncidentListFilters {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  limit: number;
  offset: number;
}

export interface CreateIncidentInput {
  workspaceId: string;
  id: string;
  title: string;
  severity: IncidentSeverity;
  source?: string;
  actorUserId: string;
}

export interface UpdateIncidentStatusInput {
  workspaceId: string;
  incidentId: string;
  status: IncidentStatus;
  note?: string;
  actorUserId: string;
  actorRole: IncidentActorRole;
}

export type UpdateIncidentStatusResult =
  | { outcome: 'not_found' }
  | { outcome: 'invalid_transition'; currentStatus: IncidentStatus }
  | { outcome: 'updated'; incident: Incident };

export interface IncidentRepository {
  list(workspaceId: string, filters: IncidentListFilters): Promise<{ incidents: Incident[]; total: number }>;
  getById(id: string, workspaceId: string): Promise<IncidentDetail | null>;
  create(input: CreateIncidentInput): Promise<Incident>;
  updateStatus(input: UpdateIncidentStatusInput): Promise<UpdateIncidentStatusResult>;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapIncident(row: any): Incident {
  return {
    id: row.id,
    title: row.title,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    source: row.source ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at ?? row.created_at)
  };
}

function mapAlert(row: any): IncidentAlert {
  return {
    id: row.id,
    incidentId: row.incident_id ?? null,
    type: row.type,
    riskScore: row.risk_score,
    status: row.status,
    createdAt: toIsoString(row.created_at)
  };
}

function mapActivity(row: any): IncidentActivity {
  return {
    id: row.id,
    incidentId: row.incident_id,
    alertId: row.alert_id ?? null,
    actorUserId: row.actor_user_id ?? null,
    action: row.action,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status ?? null,
    note: row.note ?? null,
    createdAt: toIsoString(row.created_at)
  };
}

const allowedTransitions: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['investigating', 'contained', 'closed'],
  investigating: ['open', 'contained', 'resolved', 'closed'],
  contained: ['investigating', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: ['open']
};

export class PostgresIncidentRepository implements IncidentRepository {
  async list(workspaceId: string, filters: IncidentListFilters): Promise<{ incidents: Incident[]; total: number }> {
    const where: string[] = ['workspace_id = $1'];
    const values: unknown[] = [workspaceId];

    if (filters.status) {
      values.push(filters.status);
      where.push(`status = $${values.length}`);
    }

    if (filters.severity) {
      values.push(filters.severity);
      where.push(`severity = $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM incidents ${whereClause}`,
      values
    );

    const listValues = [...values, filters.limit, filters.offset];
    const listResult = await pool.query(
      `SELECT id, title, severity, status, source, created_by_user_id,
              updated_by_user_id, created_at, updated_at
       FROM incidents
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );

    return {
      incidents: listResult.rows.map(mapIncident),
      total: countResult.rows[0]?.total ?? 0
    };
  }

  async getById(id: string, workspaceId: string): Promise<IncidentDetail | null> {
    const incidentResult = await pool.query(
      `SELECT id, title, severity, status, source, created_by_user_id,
              updated_by_user_id, created_at, updated_at
       FROM incidents
       WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    const row = incidentResult.rows[0];
    if (!row) {
      return null;
    }

    const [alertsResult, activityResult] = await Promise.all([
      pool.query(
        `SELECT id, incident_id, type, risk_score, status, created_at
         FROM alerts
         WHERE incident_id = $2 AND workspace_id = $1
         ORDER BY created_at DESC, id DESC`,
        [workspaceId, id]
      ),
      pool.query(
        `SELECT id, incident_id, alert_id, actor_user_id, action, from_status,
                to_status, note, created_at
         FROM incident_activity
         WHERE incident_id = $2 AND workspace_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
        [workspaceId, id]
      )
    ]);

    return {
      ...mapIncident(row),
      alerts: alertsResult.rows.map(mapAlert),
      activity: activityResult.rows.map(mapActivity)
    };
  }

  async create(input: CreateIncidentInput): Promise<Incident> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const incidentResult = await client.query(
        `INSERT INTO incidents
          (workspace_id, id, title, severity, status, source, created_by_user_id,
           updated_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'open', $5, $6, $6, NOW(), NOW())
         RETURNING id, title, severity, status, source, created_by_user_id,
                   updated_by_user_id, created_at, updated_at`,
        [input.workspaceId, input.id, input.title, input.severity, input.source ?? null, input.actorUserId]
      );

      await client.query(
        `INSERT INTO incident_activity
          (workspace_id, id, incident_id, actor_user_id, action, from_status, to_status, note)
         VALUES ($1, $2, $3, $4, 'incident.created', NULL, 'open', NULL)`,
        [input.workspaceId, randomUUID(), input.id, input.actorUserId]
      );

      await client.query('COMMIT');
      return mapIncident(incidentResult.rows[0]);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(input: UpdateIncidentStatusInput): Promise<UpdateIncidentStatusResult> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT id, status FROM incidents WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
        [input.incidentId, input.workspaceId]
      );
      const current = currentResult.rows[0];

      if (!current) {
        await client.query('COMMIT');
        return { outcome: 'not_found' };
      }

      const currentStatus = current.status as IncidentStatus;
      const allowed = allowedTransitions[currentStatus] ?? [];
      if (!allowed.includes(input.status)) {
        await client.query('ROLLBACK');
        return { outcome: 'invalid_transition', currentStatus };
      }

      if (
        input.status === 'open' &&
        (currentStatus === 'resolved' || currentStatus === 'closed') &&
        input.actorRole !== 'admin'
      ) {
        await client.query('ROLLBACK');
        return { outcome: 'invalid_transition', currentStatus };
      }

      const updatedResult = await client.query(
        `UPDATE incidents
         SET status = $2, updated_by_user_id = $3, updated_at = NOW()
         WHERE id = $1 AND workspace_id = $4
         RETURNING id, title, severity, status, source, created_by_user_id,
                   updated_by_user_id, created_at, updated_at`,
        [input.incidentId, input.status, input.actorUserId, input.workspaceId]
      );

      await client.query(
        `INSERT INTO incident_activity
          (workspace_id, id, incident_id, actor_user_id, action, from_status, to_status, note)
         VALUES ($1, $2, $3, $4, 'incident.status_changed', $5, $6, $7)`,
        [
          input.workspaceId,
          randomUUID(),
          input.incidentId,
          input.actorUserId,
          currentStatus,
          input.status,
          input.note ?? null
        ]
      );

      await client.query('COMMIT');
      return { outcome: 'updated', incident: mapIncident(updatedResult.rows[0]) };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const incidentRepository = new PostgresIncidentRepository();
