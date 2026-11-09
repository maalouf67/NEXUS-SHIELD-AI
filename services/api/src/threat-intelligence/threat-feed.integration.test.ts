import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { ThreatFeedService } from './threat-feed.service.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION_TESTS === 'true';
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const eventA = randomUUID();
const eventB = randomUUID();
const userIdA = randomUUID();
const userIdB = randomUUID();
const generatedAt = new Date(Date.now() - 60_000).toISOString();

const provider = {
  fetchBlacklist: async () => ({
    generatedAt,
    indicators: [{
      ipAddress: '8.8.8.8',
      confidence: 95,
      countryCode: 'US',
      lastReportedAt: generatedAt
    }]
  })
};

const suite = describe.skipIf(!enabled)('PostgreSQL threat feed correlation integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO workspaces (id, name, slug)
       VALUES ($1, 'Threat feed workspace A', $2), ($3, 'Threat feed workspace B', $4)`,
      [workspaceA, `feed-a-${workspaceA}`, workspaceB, `feed-b-${workspaceB}`]
    );
    await pool.query(
      `INSERT INTO security_events
        (id, workspace_id, source, external_event_id, event_type, severity, observed_at, summary, attributes)
       VALUES
        ($1, $2, 'feed-engine-ci', $3, 'suspicious_connection', 'high', NOW(), 'Workspace A fixture', $4::jsonb),
        ($5, $6, 'feed-engine-ci', $7, 'suspicious_connection', 'high', NOW(), 'Workspace B fixture', $8::jsonb)`,
      [eventA, workspaceA, eventA, JSON.stringify({ source_ip: '8.8.8.8' }),
       eventB, workspaceB, eventB, JSON.stringify({ source_ip: '8.8.8.8' })]
    );
  });

  afterAll(async () => {
    const workspaces = [workspaceA, workspaceB];
    try {
      await pool.query('DELETE FROM threat_early_warnings WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM threat_attack_correlation_events WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM threat_attack_correlations WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM threat_indicator_matches WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM threat_feed_runs WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM threat_feeds WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM threat_indicators WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM security_events WHERE workspace_id = ANY($1::uuid[])', [workspaces]);
      await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [workspaces]);
    } finally {
      await pool.end();
    }
  });

  it('persists one indicator match and evidence-backed warning only in the active workspace', async () => {
    const service = new ThreatFeedService(pool, provider as never, () => new Date());
    const first = await service.syncAbuseIpDb(workspaceA);
    expect(first.status).toBe('succeeded');
    expect(first.accepted).toBe(1);
    expect(first.matched_events).toBe(1);
    expect(first.warnings_created).toBe(1);

    const [matches, warnings, foreignMatches] = await Promise.all([
      pool.query('SELECT security_event_id, match_field FROM threat_indicator_matches WHERE workspace_id = $1', [workspaceA]),
      pool.query('SELECT warning_type, severity, evidence FROM threat_early_warnings WHERE workspace_id = $1', [workspaceA]),
      pool.query('SELECT COUNT(*)::int AS count FROM threat_indicator_matches WHERE workspace_id = $1 AND security_event_id = $2', [workspaceB, eventB])
    ]);
    expect(matches.rows).toHaveLength(1);
    expect(matches.rows[0]).toMatchObject({ security_event_id: eventA, match_field: 'source_ip' });
    expect(warnings.rows).toHaveLength(1);
    expect(warnings.rows[0].warning_type).toBe('threat_feed_indicator_match');
    expect(warnings.rows[0].severity).toBe('high');
    expect(warnings.rows[0].evidence).toMatchObject({ provider: 'abuseipdb', security_event_id: eventA });
    expect(foreignMatches.rows[0].count).toBe(0);
  });

  it('is idempotent on repeated syncs and does not duplicate matches or warnings', async () => {
    const service = new ThreatFeedService(pool, provider as never, () => new Date());
    const second = await service.syncAbuseIpDb(workspaceA);
    expect(second.accepted).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(second.matched_events).toBe(0);
    expect(second.warnings_created).toBe(0);
    const counts = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM threat_indicator_matches WHERE workspace_id = $1) AS matches,
        (SELECT COUNT(*)::int FROM threat_early_warnings WHERE workspace_id = $1) AS warnings`,
      [workspaceA]
    );
    expect(counts.rows[0]).toEqual({ matches: 1, warnings: 1 });
  });
});

void suite;
