import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { withOtelSpan } from '../observability/otel-tracing.middleware.js';
import { normalizeSecurityEventToOcsf, OCSF_SCHEMA_VERSION, type OcsfBaseEventV19 } from './ocsf-normalizer.js';

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
  ocsfEvent: OcsfBaseEventV19 | null;
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
  ingestSystemBatch(events: SecurityEventInput[]): Promise<IngestSecurityEventsResult>;
  ingestBatch(workspaceId: string, events: SecurityEventInput[]): Promise<IngestSecurityEventsResult>;
  list(workspaceId: string, filters: SecurityEventListFilters): Promise<{ events: SecurityEvent[]; total: number }>;
  review(workspaceId: string, eventId: string, actorUserId: string, note?: string): Promise<ReviewSecurityEventResult>;
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
    reviewedByUserId: row.reviewed_by_user_id ?? null,
    ocsfEvent: row.ocsf_event ?? null
  };
}

const EVENT_SELECT = `SELECT event.id, event.source, event.external_event_id, event.event_type, event.severity,
  event.observed_at, event.received_at, event.asset_id, event.summary, event.attributes,
  event.review_status, event.reviewed_at, event.reviewed_by_user_id,
  projection.normalized_event AS ocsf_event
  FROM security_events AS event
  LEFT JOIN security_event_ocsf_records AS projection
    ON projection.workspace_id = event.workspace_id
   AND projection.security_event_id = event.id
   AND projection.schema_version = '1.9.0'`;

export class PostgresSecurityEventRepository implements SecurityEventRepository {
  async ingestSystemBatch(events: SecurityEventInput[]): Promise<IngestSecurityEventsResult> {
    const client = await pool.connect();
    let inserted = 0;

    try {
      await client.query('BEGIN');

      for (const event of events) {
        const result = await client.query(
          `INSERT INTO security_events
            (workspace_id, id, source, external_event_id, event_type, severity, observed_at,
             asset_id, summary, attributes)
           VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB)
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

        if (result.rowCount && result.rowCount > 0) inserted += 1;
      }

      await client.query('COMMIT');
      return { inserted, duplicates: events.length - inserted };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async ingestBatch(workspaceId: string, events: SecurityEventInput[]): Promise<IngestSecurityEventsResult> {
    const normalizedEvents = await withOtelSpan(
      'nexus.ocsf.normalize',
      {
        'nexus.events.count': events.length,
        'ocsf.schema.version': OCSF_SCHEMA_VERSION
      },
      () => events.map(normalizeSecurityEventToOcsf)
    );

    return withOtelSpan(
      'db.security_events.ingest_batch',
      {
        'db.system': 'postgresql',
        'db.operation': 'insert',
        'nexus.events.count': events.length
      },
      async () => {
        const client = await pool.connect();
        let inserted = 0;

        try {
          await client.query('BEGIN');

          for (let index = 0; index < events.length; index += 1) {
            const event = events[index]!;
            const normalizedEvent = normalizedEvents[index]!;
            const result = await client.query<{ id: string }>(
              `INSERT INTO security_events
                (workspace_id, id, source, external_event_id, event_type, severity, observed_at,
                 asset_id, summary, attributes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB)
               ON CONFLICT (workspace_id, source, external_event_id) WHERE workspace_id IS NOT NULL DO NOTHING
               RETURNING id`,
              [
                workspaceId,
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

            const securityEventId = result.rows[0]?.id;
            if (securityEventId) {
              const normalizedJson = JSON.stringify(normalizedEvent);
              const normalizedHash = createHash('sha256')
                .update(normalizedJson, 'utf8')
                .digest('hex');

              await client.query(
                `INSERT INTO security_event_ocsf_records
                  (workspace_id, security_event_id, schema_version, normalized_event, normalized_sha256)
                 VALUES ($1, $2, $3, $4::JSONB, $5)
                 ON CONFLICT (workspace_id, security_event_id, schema_version) DO NOTHING`,
                [
                  workspaceId,
                  securityEventId,
                  OCSF_SCHEMA_VERSION,
                  normalizedJson,
                  normalizedHash
                ]
              );
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
    );
  }

  async list(
    workspaceId: string,
    filters: SecurityEventListFilters
  ): Promise<{ events: SecurityEvent[]; total: number }> {
    const where: string[] = ['event.workspace_id = $1'];
    const values: unknown[] = [workspaceId];

    if (filters.severity) {
      values.push(filters.severity);
      where.push(`event.severity = $${values.length}`);
    }

    if (filters.source) {
      values.push(filters.source);
      where.push(`event.source = $${values.length}`);
    }

    if (filters.reviewStatus) {
      values.push(filters.reviewStatus);
      where.push(`event.review_status = $${values.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM security_events AS event ${whereClause}`,
      values
    );

    const listValues = [...values, filters.limit, filters.offset];
    const result = await pool.query(
      `${EVENT_SELECT}
       ${whereClause}
       ORDER BY event.received_at DESC, event.id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );

    return {
      events: result.rows.map(mapSecurityEvent),
      total: countResult.rows[0]?.total ?? 0
    };
  }

  async review(
    workspaceId: string,
    eventId: string,
    actorUserId: string,
    note?: string
  ): Promise<ReviewSecurityEventResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT id, review_status FROM security_events WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
        [eventId, workspaceId]
      );
      const current = currentResult.rows[0];

      if (!current) {
        await client.query('COMMIT');
        return { outcome: 'not_found' };
      }

      if (current.review_status === 'reviewed') {
        const existing = await client.query(
          `${EVENT_SELECT} WHERE event.id = $1 AND event.workspace_id = $2`,
          [eventId, workspaceId]
        );
        await client.query('COMMIT');
        return { outcome: 'already_reviewed', event: mapSecurityEvent(existing.rows[0]) };
      }

      await client.query(
        `UPDATE security_events
         SET review_status = 'reviewed',
             reviewed_at = NOW(),
             reviewed_by_user_id = $2
         WHERE id = $1 AND workspace_id = $3`,
        [eventId, actorUserId, workspaceId]
      );

      await client.query(
        `INSERT INTO security_event_reviews
          (workspace_id, id, security_event_id, actor_user_id, action, note)
         VALUES ($1, $2, $3, $4, 'event.reviewed', $5)`,
        [workspaceId, randomUUID(), eventId, actorUserId, note ?? null]
      );

      const updated = await client.query(
        `${EVENT_SELECT} WHERE event.id = $1 AND event.workspace_id = $2`,
        [eventId, workspaceId]
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
