import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export type SecurityEventSeverity =
  | 'informational'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type SecurityEventReviewStatus = 'new' | 'reviewed';

export interface SecurityEventInput {
  source: string;
  externalEventId: string;
  eventType: string;
  severity: SecurityEventSeverity;
  observedAt: string;
  assetId?: string;
  summary: string;
  attributes: Record<string, string>;
}

export interface SecurityEvent {
  id: string;
  source: string;
  externalEventId: string;
  eventType: string;
  severity: SecurityEventSeverity;
  observedAt: string;
  receivedAt: string;
  assetId: string | null;
  summary: string;
  attributes: Record<string, string>;
  reviewStatus: SecurityEventReviewStatus;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
}

export interface SecurityEventListFilters {
  severity?: SecurityEventSeverity;
  source?: string;
  reviewStatus?: SecurityEventReviewStatus;
  limit: number;
  offset: number;
}

export type IngestSecurityEventsResult = {
  inserted: number;
  duplicates: number;
};

export type ReviewSecurityEventResult =
  | { outcome: 'not_found' }
  | { outcome: 'already_reviewed'; event: SecurityEvent }
  | { outcome: 'reviewed'; event: SecurityEvent };

export interface SecurityEventRepository {
  ingestBatch(events: SecurityEventInput[]): Promise<IngestSecurityEventsResult>;
  list(filters: SecurityEventListFilters): Promise<{ events: SecurityEvent[]; total: number }>;
  review(eventId: string, actorUserId: string, note?: string): Promise<ReviewSecurityEventResult>;
}

function toIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSecurityEvent(row: any): SecurityEvent {
  return {
    id: row.id,
    source: row.source,
    externalEventId: row.external_event_id,
    eventType: row.event_type,
    severity: row.severity as SecurityEventSeverity,
    observedAt: toIsoString(row.observed_at)!,
    receivedAt: toIsoString(row.received_at)!,
    assetId: row.asset_id ?? null,
    summary: row.summary,
    attributes: row.attributes ?? {},
    reviewStatus: row.review_status as SecurityEventReviewStatus,
    reviewedAt: toIsoString(row.reviewed_at),
    reviewedByUserId: row.reviewed_by_user_id ?? null
  };
}

const EVENT_SELECT = `SELECT id, source, external_event_id, event_type, severity,
  observed_at, received_at, asset_id, summary, attributes,
  review_status, reviewed_at, reviewed_by_user_id
  FROM security_events`;

export class PostgresSecurityEventRepository implements SecurityEventRepository {
  async ingestBatch(events: SecurityEventInput[]): Promise<IngestSecurityEventsResult> {
    const client = await pool.connect();
    let inserted = 0;

    try {
      await client.query('BEGIN');

      for (const event of events) {
        const result = await client.query(
          `INSERT INTO security_events
            (id, source, external_event_id, event_type, severity, observed_at,
             asset_id, summary, attributes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB)
           ON CONFLICT (source, external_event_id) WHERE workspace_id IS NULL DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            event.source,
            event.externalEventId,
            event.eventType,
            event.severity,
            event.observedAt,
            event.assetId ?? null,
            event.summary,
            JSON.stringify(event.attributes ?? {})
          ]
        );

        if (result.rowCount && result.rowCount > 0) {
          inserted += 1;
        }
      }

      await client.query('COMMIT');
      return {
        inserted,
        duplicates: events.length - inserted
      };
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

  async list(
    filters: SecurityEventListFilters
  ): Promise<{ events: SecurityEvent[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];

    if (filters.severity) {
      values.push(filters.severity);
      where.push(`severity = $${values.length}`);
    }

    if (filters.source) {
      values.push(filters.source);
      where.push(`source = $${values.length}`);
    }

    if (filters.reviewStatus) {
      values.push(filters.reviewStatus);
      where.push(`review_status = $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM security_events ${whereClause}`,
      values
    );

    const listValues = [...values, filters.limit, filters.offset];
    const result = await pool.query(
      `${EVENT_SELECT}
       ${whereClause}
       ORDER BY received_at DESC, id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );

    return {
      events: result.rows.map(mapSecurityEvent),
      total: countResult.rows[0]?.total ?? 0
    };
  }

  async review(
    eventId: string,
    actorUserId: string,
    note?: string
  ): Promise<ReviewSecurityEventResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT id, review_status FROM security_events WHERE id = $1 FOR UPDATE',
        [eventId]
      );
      const current = currentResult.rows[0];

      if (!current) {
        await client.query('COMMIT');
        return { outcome: 'not_found' };
      }

      if (current.review_status === 'reviewed') {
        const existing = await client.query(
          `${EVENT_SELECT} WHERE id = $1`,
          [eventId]
        );
        await client.query('COMMIT');
        return { outcome: 'already_reviewed', event: mapSecurityEvent(existing.rows[0]) };
      }

      await client.query(
        `UPDATE security_events
         SET review_status = 'reviewed',
             reviewed_at = NOW(),
             reviewed_by_user_id = $2
         WHERE id = $1`,
        [eventId, actorUserId]
      );

      await client.query(
        `INSERT INTO security_event_reviews
          (id, security_event_id, actor_user_id, action, note)
         VALUES ($1, $2, $3, 'event.reviewed', $4)`,
        [randomUUID(), eventId, actorUserId, note ?? null]
      );

      const updated = await client.query(
        `${EVENT_SELECT} WHERE id = $1`,
        [eventId]
      );

      await client.query('COMMIT');
      return { outcome: 'reviewed', event: mapSecurityEvent(updated.rows[0]) };
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

export const securityEventRepository = new PostgresSecurityEventRepository();
