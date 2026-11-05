import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { pool } from '../db/pool.js';
import { PostgresRateLimitStore } from '../middleware/postgres-rate-limit-store.js';

const databaseIntegrationEnabled =
  process.env.NEXUS_RUN_DB_INTEGRATION === 'true' &&
  Boolean(process.env.DATABASE_URL);

describe('PostgreSQL shared rate-limit store integration', () => {
  (databaseIntegrationEnabled ? it : it.skip)(
    'shares and atomically increments one source counter across separate API instances',
    async () => {
      const previousSecret = process.env.RATE_LIMIT_HASH_SECRET;
      process.env.RATE_LIMIT_HASH_SECRET = randomBytes(48).toString('base64url');

      const scope = 'test-api-ips';
      const sourceKey = `integration-${randomUUID()}`;
      const firstInstance = new PostgresRateLimitStore(scope, 60_000);
      const secondInstance = new PostgresRateLimitStore(scope, 60_000);

      try {
        await firstInstance.resetKey(sourceKey);

        const first = await firstInstance.increment(sourceKey);
        expect(first.totalHits).toBe(1);

        const observedBySecond = await secondInstance.get(sourceKey);
        expect(observedBySecond?.totalHits).toBe(1);

        const concurrentIncrements = await Promise.all(
          Array.from({ length: 8 }, (_value, index) =>
            (index % 2 === 0 ? firstInstance : secondInstance).increment(sourceKey)
          )
        );

        expect(concurrentIncrements.map((item) => item.totalHits).sort((a, b) => a - b))
          .toEqual([2, 3, 4, 5, 6, 7, 8, 9]);

        const finalRead = await firstInstance.get(sourceKey);
        expect(finalRead?.totalHits).toBe(9);
      } finally {
        await firstInstance.resetKey(sourceKey);
        if (previousSecret === undefined) {
          delete process.env.RATE_LIMIT_HASH_SECRET;
        } else {
          process.env.RATE_LIMIT_HASH_SECRET = previousSecret;
        }
        // Keep the shared pool alive for the rest of the API integration suite.
        await pool.query('SELECT 1');
      }
    }
  );

  (databaseIntegrationEnabled ? it : it.skip)(
    'commits the IPS threshold counter and SOC event atomically across API instances',
    async () => {
      const previousSecret = process.env.RATE_LIMIT_HASH_SECRET;
      process.env.RATE_LIMIT_HASH_SECRET = randomBytes(48).toString('base64url');
      const scope = 'test-api-ips-event';
      const sourceKey = `integration-ips-${randomUUID()}`;
      const externalEventId = `ci-ips-${randomUUID()}`;
      const firstInstance = new PostgresRateLimitStore(scope, 60_000);
      const secondInstance = new PostgresRateLimitStore(scope, 60_000);
      const event = {
        source: 'nexus-ips',
        externalEventId,
        eventType: 'api-anomaly-containment-triggered',
        severity: 'medium' as const,
        observedAt: new Date().toISOString(),
        summary: 'Synthetic CI-only API containment event.',
        attributes: {
          source_ip_fingerprint: 'a'.repeat(24),
          window_seconds: '600',
          configured_limit: '3',
          response_action: 'temporary_api_quarantine',
          http_method: 'GET',
          response_status: '404',
          listener_scope: 'api'
        }
      };

      try {
        await firstInstance.resetKey(sourceKey);
        expect((await firstInstance.increment(sourceKey)).totalHits).toBe(1);
        const increments = await Promise.all(
          Array.from({ length: 8 }, (_value, index) =>
            (index % 2 === 0 ? firstInstance : secondInstance).incrementAndRecordEvent(sourceKey, 3, event)
          )
        );
        expect(increments.map((item) => item.totalHits).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);

        const persisted = await pool.query(
          `SELECT event_type, severity, attributes FROM security_events
           WHERE source = 'nexus-ips' AND external_event_id = $1`,
          [externalEventId]
        );
        expect(persisted.rowCount).toBe(1);
        expect(persisted.rows[0].event_type).toBe('api-anomaly-containment-triggered');
        expect(persisted.rows[0].severity).toBe('medium');
        expect(persisted.rows[0].attributes.response_status).toBe('404');
      } finally {
        await pool.query('DELETE FROM security_events WHERE source = $1 AND external_event_id = $2', ['nexus-ips', externalEventId]);
        await firstInstance.resetKey(sourceKey);
        if (previousSecret === undefined) delete process.env.RATE_LIMIT_HASH_SECRET;
        else process.env.RATE_LIMIT_HASH_SECRET = previousSecret;
        await pool.query('SELECT 1');
      }
    }
  );
});
