import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { pool as defaultPool } from '../db/pool.js';
import { abuseIpDbBlacklistProvider, ThreatFeedProviderError, type AbuseIpDbBlacklistProvider } from './abuseipdb-feed.provider.js';

const MATCH_FIELDS = ['ip', 'source_ip', 'sourceIp', 'src_ip', 'srcIp', 'remote_ip', 'remoteIp', 'client_ip', 'clientIp'] as const;
const DEFAULT_FRESHNESS_HOURS = 6;
const DEFAULT_INDICATOR_TTL_HOURS = 24;

function sha256(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim(), 'utf8').digest('hex');
}

function severityForConfidence(confidence: number): 'medium' | 'high' | 'critical' {
  if (confidence >= 100) return 'critical';
  if (confidence >= 90) return 'high';
  return 'medium';
}

export interface ThreatFeedSyncResult {
  feed_id: string;
  run_id: string;
  provider: 'abuseipdb';
  status: 'succeeded';
  generated_at: string;
  fetched: number;
  accepted: number;
  duplicates: number;
  matched_events: number;
  warnings_created: number;
  freshness: 'fresh';
}

export class ThreatFeedService {
  constructor(
    private readonly database: Pool = defaultPool,
    private readonly provider: AbuseIpDbBlacklistProvider = abuseIpDbBlacklistProvider,
    private readonly now: () => Date = () => new Date()
  ) {}

  async syncAbuseIpDb(workspaceId: string): Promise<ThreatFeedSyncResult> {
    const confidenceMinimum = this.readBoundedInteger(process.env.ABUSEIPDB_FEED_CONFIDENCE_MINIMUM, 90, 25, 100);
    const limit = this.readBoundedInteger(process.env.ABUSEIPDB_FEED_MAX_ITEMS, 10000, 1, 10000);
    const freshnessHours = this.readBoundedInteger(process.env.ABUSEIPDB_FEED_MAX_AGE_HOURS, DEFAULT_FRESHNESS_HOURS, 1, 168);
    const snapshot = await this.provider.fetchBlacklist(confidenceMinimum, limit);
    const generatedAt = new Date(snapshot.generatedAt);
    const now = this.now();
    const ageMs = now.getTime() - generatedAt.getTime();
    if (!Number.isFinite(ageMs) || ageMs < -5 * 60_000 || ageMs > freshnessHours * 60 * 60_000) {
      throw new ThreatFeedProviderError('INVALID_RESPONSE');
    }

    const indicators = snapshot.indicators;
    const byIp = new Map<string, typeof indicators[number]>();
    for (const indicator of indicators) {
      const existing = byIp.get(indicator.ipAddress);
      if (!existing || indicator.confidence > existing.confidence) byIp.set(indicator.ipAddress, indicator);
    }
    const uniqueIndicators = [...byIp.values()];

    const client = await this.database.connect();
    const runId = randomUUID();
    let committed = false;
    try {
      await client.query('BEGIN');
      const feedResult = await client.query(
        `INSERT INTO threat_feeds
          (id, workspace_id, provider, enabled, confidence_minimum, freshness_window_hours, last_generated_at, updated_at)
         VALUES ($1, $2, 'abuseipdb', TRUE, $3, $4, $5, NOW())
         ON CONFLICT (workspace_id, provider) DO UPDATE
           SET enabled = TRUE, confidence_minimum = EXCLUDED.confidence_minimum,
               freshness_window_hours = EXCLUDED.freshness_window_hours,
               last_generated_at = EXCLUDED.last_generated_at, updated_at = NOW()
         RETURNING id`,
        [randomUUID(), workspaceId, confidenceMinimum, freshnessHours, generatedAt]
      );
      const feedId = feedResult.rows[0].id as string;
      await client.query(
        `INSERT INTO threat_feed_runs (id, workspace_id, feed_id, status, generated_at, evidence)
         VALUES ($1, $2, $3, 'running', $4, $5::jsonb)`,
        [runId, workspaceId, feedId, generatedAt, JSON.stringify({ provider: 'abuseipdb', confidence_minimum: confidenceMinimum, fetched_count: indicators.length })]
      );

      const indicatorIds = new Map<string, string>();
      let accepted = 0;
      for (const item of uniqueIndicators) {
        const valueHash = sha256(item.ipAddress);
        const indicatorId = randomUUID();
        const lastSeen = item.lastReportedAt ? new Date(item.lastReportedAt) : generatedAt;
        const firstSeen = lastSeen;
        const upsert = await client.query(
          `INSERT INTO threat_indicators
            (id, workspace_id, indicator_type, indicator_value_hash, source, confidence, severity,
             first_seen_at, last_seen_at, expires_at, provenance, updated_at)
           VALUES ($1, $2, 'ip', $3, 'abuseipdb', $4, $5, $6, $7, $8, $9::jsonb, NOW())
           ON CONFLICT (workspace_id, indicator_type, indicator_value_hash, source)
           DO UPDATE SET confidence = GREATEST(threat_indicators.confidence, EXCLUDED.confidence),
                         severity = CASE WHEN EXCLUDED.confidence >= 100 THEN 'critical'
                                         WHEN EXCLUDED.confidence >= 90 THEN 'high' ELSE 'medium' END,
                         first_seen_at = LEAST(threat_indicators.first_seen_at, EXCLUDED.first_seen_at),
                         last_seen_at = GREATEST(threat_indicators.last_seen_at, EXCLUDED.last_seen_at),
                         expires_at = EXCLUDED.expires_at,
                         provenance = EXCLUDED.provenance,
                         updated_at = NOW()
           RETURNING id, (xmax = 0) AS inserted`,
          [
            indicatorId, workspaceId, valueHash, item.confidence, severityForConfidence(item.confidence),
            firstSeen, lastSeen, new Date(generatedAt.getTime() + DEFAULT_INDICATOR_TTL_HOURS * 60 * 60_000),
            JSON.stringify({ provider: 'abuseipdb', generated_at: generatedAt.toISOString(), last_reported_at: item.lastReportedAt, country_code: item.countryCode, confidence: item.confidence })
          ]
        );
        indicatorIds.set(item.ipAddress, upsert.rows[0].id as string);
        if (upsert.rows[0].inserted) accepted += 1;
      }

      const rawIps = [...indicatorIds.keys()];
      let matchedEvents = 0;
      let warningsCreated = 0;
      if (rawIps.length > 0) {
        const eventResult = await client.query(
          `SELECT id, observed_at, attributes
             FROM security_events
            WHERE workspace_id = $1
              AND observed_at >= NOW() - INTERVAL '7 days'
              AND EXISTS (
                SELECT 1 FROM jsonb_each_text(COALESCE(attributes, '{}'::jsonb)) AS attribute(key, value)
                 WHERE attribute.key = ANY($3::text[]) AND attribute.value = ANY($2::text[])
              )
            ORDER BY observed_at DESC
            LIMIT 5000`,
          [workspaceId, rawIps, [...MATCH_FIELDS]]
        );
        const ipsByHash = new Map(rawIps.map(ip => [sha256(ip), ip]));
        for (const event of eventResult.rows) {
          const attributes = event.attributes && typeof event.attributes === 'object' ? event.attributes as Record<string, unknown> : {};
          const matchedField = MATCH_FIELDS.find(field => typeof attributes[field] === 'string' && ipsByHash.has(sha256(String(attributes[field]))));
          if (!matchedField) continue;
          const ip = String(attributes[matchedField]);
          const indicatorId = indicatorIds.get(ip);
          const indicator = byIp.get(ip);
          if (!indicatorId || !indicator) continue;
          const valueHash = sha256(ip);
          const match = await client.query(
            `INSERT INTO threat_indicator_matches
              (workspace_id, indicator_id, security_event_id, match_field, matched_value_hash, evidence)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT (workspace_id, indicator_id, security_event_id) DO NOTHING
             RETURNING indicator_id`,
            [workspaceId, indicatorId, event.id, matchedField, valueHash, JSON.stringify({ provider: 'abuseipdb', confidence: indicator.confidence, feed_generated_at: generatedAt.toISOString(), observed_at: event.observed_at })]
          );
          if (match.rowCount === 0) continue;
          matchedEvents += 1;

          const correlationKey = sha256(`abuseipdb:${workspaceId}:${indicatorId}:${event.id}`);
          const correlation = await client.query(
            `INSERT INTO threat_attack_correlations
              (id, workspace_id, correlation_key, pattern_type, confidence, evidence, first_observed_at, last_observed_at)
             VALUES ($1, $2, $3, 'feed_indicator_event_match', $4, $5::jsonb, $6, $6)
             ON CONFLICT (workspace_id, correlation_key)
             DO UPDATE SET confidence = GREATEST(threat_attack_correlations.confidence, EXCLUDED.confidence),
                           evidence = EXCLUDED.evidence,
                           last_observed_at = GREATEST(threat_attack_correlations.last_observed_at, EXCLUDED.last_observed_at)
             RETURNING id`,
            [randomUUID(), workspaceId, correlationKey, indicator.confidence / 100,
              JSON.stringify({ provider: 'abuseipdb', indicator_type: 'ip', indicator_hash: valueHash, confidence: indicator.confidence, matched_field: matchedField, security_event_id: event.id }),
              event.observed_at]
          );
          const correlationId = correlation.rows[0].id as string;
          await client.query(
            `INSERT INTO threat_attack_correlation_events (workspace_id, correlation_id, security_event_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [workspaceId, correlationId, event.id]
          );
          const dedupeKey = sha256(`feed-warning:${workspaceId}:${indicatorId}:${event.id}`);
          const warning = await client.query(
            `INSERT INTO threat_early_warnings
              (id, workspace_id, correlation_id, warning_type, severity, status, explanation, evidence, dedupe_key)
             VALUES ($1, $2, $3, 'threat_feed_indicator_match', $4, 'open', $5, $6::jsonb, $7)
             ON CONFLICT (workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
             RETURNING id`,
            [randomUUID(), workspaceId, correlationId, severityForConfidence(indicator.confidence),
              'A recent security event contains an IP indicator listed by AbuseIPDB. Analyst review is required; this match is not proof of compromise.',
              JSON.stringify({ provider: 'abuseipdb', indicator_type: 'ip', indicator_hash: valueHash, confidence: indicator.confidence, matched_field: matchedField, security_event_id: event.id, feed_generated_at: generatedAt.toISOString(), event_observed_at: new Date(event.observed_at).toISOString() }),
              dedupeKey]
          );
          if (warning.rowCount && warning.rowCount > 0) warningsCreated += 1;
        }
      }

      const duplicates = indicators.length - accepted;
      await client.query(
        `UPDATE threat_feed_runs
            SET status = 'succeeded', completed_at = NOW(), fetched_count = $3,
                accepted_count = $4, duplicate_count = $5, matched_events_count = $6,
                warning_count = $7
          WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, runId, indicators.length, accepted, duplicates, matchedEvents, warningsCreated]
      );
      await client.query(
        `UPDATE threat_feeds SET last_success_at = NOW(), last_error_code = NULL, updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, feedId]
      );
      await client.query('COMMIT');
      committed = true;
      return {
        feed_id: feedId, run_id: runId, provider: 'abuseipdb', status: 'succeeded',
        generated_at: generatedAt.toISOString(), fetched: indicators.length, accepted,
        duplicates, matched_events: matchedEvents, warnings_created: warningsCreated, freshness: 'fresh'
      };
    } catch (error) {
      if (!committed) {
        try { await client.query('ROLLBACK'); } catch { /* Preserve the original error. */ }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private readBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  }
}

export const threatFeedService = new ThreatFeedService();
