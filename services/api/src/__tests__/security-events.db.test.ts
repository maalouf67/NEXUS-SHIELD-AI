import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pool } from '../db/pool.js';
import { PostgresSecurityEventRepository } from '../security-events/security-event.repository.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL security event ingestion integration', () => {
  const repository = new PostgresSecurityEventRepository();
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const source = `ci-event-${actorId}`;

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [actorId, `security-event-ci-${actorId}@example.test`]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)',
      [workspaceId, 'Event CI workspace', `event-ci-${workspaceId.slice(0, 8)}`, actorId]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)',
      [otherWorkspaceId, 'Other Event CI workspace', `event-other-${otherWorkspaceId.slice(0, 8)}`, actorId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM security_event_reviews WHERE workspace_id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM security_events WHERE workspace_id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);
    await pool.end();
  });

  it('isolates identical upstream event identifiers across workspaces', async () => {
    const event = {
      source,
      externalEventId: `shared-${randomUUID()}`,
      eventType: 'tenant-isolation-test',
      severity: 'medium' as const,
      observedAt: new Date().toISOString(),
      summary: 'Synthetic cross-workspace event test.',
      attributes: { environment: 'ci' }
    };

    expect(await repository.ingestBatch(workspaceId, [event])).toMatchObject({ inserted: 1, duplicates: 0 });
    expect(await repository.ingestBatch(otherWorkspaceId, [event])).toMatchObject({ inserted: 1, duplicates: 0 });

    const primary = await repository.list(workspaceId, { source, limit: 100, offset: 0 });
    const secondary = await repository.list(otherWorkspaceId, { source, limit: 100, offset: 0 });
    const primaryEvent = primary.events.find((item) => item.externalEventId === event.externalEventId);
    const secondaryEvent = secondary.events.find((item) => item.externalEventId === event.externalEventId);
    expect(primaryEvent?.ocsfEvent).toMatchObject({ class_uid: 0, metadata: { source, version: '1.9.0' } });
    expect(secondaryEvent?.ocsfEvent).toMatchObject({ class_uid: 0, metadata: { source, version: '1.9.0' } });
    expect(primaryEvent?.ocsfEvent?.unmapped.nexus_event_type).toBe(event.eventType);
    expect(secondaryEvent?.ocsfEvent?.unmapped.nexus_event_type).toBe(event.eventType);
    expect(primary.events.find((item) => item.externalEventId === event.externalEventId)?.id)
      .not.toBe(secondary.events.find((item) => item.externalEventId === event.externalEventId)?.id);
  });

  it('deduplicates source events and records analyst review history', async () => {
    const event = {
      source,
      externalEventId: `external-${randomUUID()}`,
      eventType: 'suspicious-authentication',
      severity: 'high' as const,
      observedAt: '2026-11-03T04:00:00.000Z',
      assetId: 'ci-endpoint-01',
      summary: 'Synthetic CI event only.',
      attributes: { environment: 'ci', signal: 'authentication' }
    };

    const result = await repository.ingestBatch(workspaceId, [event, event]);
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(1);

    const fresh = await repository.list(workspaceId, {
      source,
      severity: 'high',
      reviewStatus: 'new',
      limit: 10,
      offset: 0
    });
    expect(fresh.total).toBe(1);
    expect(fresh.events[0]?.attributes.signal).toBe('authentication');
    expect(fresh.events[0]?.ocsfEvent?.class_uid).toBe(0);
    const projectionCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM security_event_ocsf_records WHERE workspace_id = $1 AND security_event_id = $2',
      [workspaceId, fresh.events[0]?.id]
    );
    expect(projectionCount.rows[0]?.count).toBe(1);

    const review = await repository.review(workspaceId, fresh.events[0].id, actorId, 'CI analyst review.');
    expect(review.outcome).toBe('reviewed');
    if (review.outcome !== 'reviewed') {
      throw new Error('Expected the event review to be recorded.');
    }
    expect(review.event.reviewStatus).toBe('reviewed');
    expect(review.event.reviewedByUserId).toBe(actorId);

    const reviewed = await repository.list(workspaceId, {
      source,
      reviewStatus: 'reviewed',
      limit: 10,
      offset: 0
    });
    expect(reviewed.total).toBe(1);

    const audit = await pool.query(
      `SELECT action, note, actor_user_id
       FROM security_event_reviews
       WHERE workspace_id = $1 AND security_event_id = $2`,
      [workspaceId, review.event.id]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe('event.reviewed');
    expect(audit.rows[0].actor_user_id).toBe(actorId);
  });
});
