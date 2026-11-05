import { createHmac, randomUUID } from "node:crypto";
import type { SecurityEventInput } from "../security-events/security-event.repository.js";

import type { ClientRateLimitInfo, IncrementResponse, Options, Store } from "express-rate-limit";

import { pool } from "../db/pool.js";

type CounterRow = {
  hits: number;
  reset_at: Date;
};

/**
 * Shared rate-limit counters for all API instances.
 *
 * Identifiers are keyed-HMAC-SHA-256 hashed before they are written to PostgreSQL.
 * Each limiter uses a separate scope so API, phone-account and phone-IP
 * quotas cannot collide.
 */
export class PostgresRateLimitStore implements Store {
  readonly prefix: string;
  private windowMs: number;
  private schemaReady: Promise<void> | undefined;
  private cleanupCounter = 0;

  constructor(scope: string, windowMs = 15 * 60 * 1000) {
    if (!/^[a-z0-9:_-]{1,80}$/i.test(scope)) {
      throw new Error("Invalid rate-limit scope.");
    }
    if (!Number.isInteger(windowMs) || windowMs < 1_000) {
      throw new Error("Invalid rate-limit window.");
    }
    this.prefix = scope;
    this.windowMs = windowMs;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private hashKey(key: string): string {
    const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new Error("A 32-character rate-limit HMAC secret or SESSION_SECRET is required.");
    }
    return createHmac("sha256", secret).update(key).digest("hex");
  }

  private ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = pool.query(`
        CREATE TABLE IF NOT EXISTS api_rate_limit_counters (
          scope VARCHAR(80) NOT NULL,
          key_hash CHAR(64) NOT NULL,
          hits INTEGER NOT NULL CHECK (hits >= 0),
          reset_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (scope, key_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_api_rate_limit_counters_reset_at
          ON api_rate_limit_counters (reset_at);
      `).then(() => undefined).catch((error: unknown) => {
        this.schemaReady = undefined;
        throw error;
      });
    }
    return this.schemaReady;
  }

  async increment(key: string): Promise<IncrementResponse> {
    await this.ensureSchema();
    const result = await pool.query<CounterRow>(`
      INSERT INTO api_rate_limit_counters (scope, key_hash, hits, reset_at)
      VALUES ($1, $2, 1, NOW() + ($3::double precision * INTERVAL '1 millisecond'))
      ON CONFLICT (scope, key_hash) DO UPDATE
      SET
        hits = CASE
          WHEN api_rate_limit_counters.reset_at <= NOW() THEN 1
          ELSE api_rate_limit_counters.hits + 1
        END,
        reset_at = CASE
          WHEN api_rate_limit_counters.reset_at <= NOW() THEN EXCLUDED.reset_at
          ELSE api_rate_limit_counters.reset_at
        END
      RETURNING hits, reset_at
    `, [this.prefix, this.hashKey(key), this.windowMs]);

    const row = result.rows[0];
    if (!row) throw new Error("Rate-limit counter was not returned.");

    this.scheduleExpiredCounterCleanup();

    return {
      totalHits: Number(row.hits),
      resetTime: new Date(row.reset_at)
    };
  }

  /** Atomically commit the suspicious counter and its threshold SOC event. */
  async incrementAndRecordEvent(key: string, threshold: number, event: SecurityEventInput): Promise<IncrementResponse> {
    if (!Number.isInteger(threshold) || threshold < 1) throw new Error("Invalid anomaly containment threshold.");
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<CounterRow>(`
        INSERT INTO api_rate_limit_counters (scope, key_hash, hits, reset_at)
        VALUES ($1, $2, 1, NOW() + ($3::double precision * INTERVAL '1 millisecond'))
        ON CONFLICT (scope, key_hash) DO UPDATE
        SET
          hits = CASE WHEN api_rate_limit_counters.reset_at <= NOW() THEN 1 ELSE api_rate_limit_counters.hits + 1 END,
          reset_at = CASE WHEN api_rate_limit_counters.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE api_rate_limit_counters.reset_at END
        RETURNING hits, reset_at
      `, [this.prefix, this.hashKey(key), this.windowMs]);
      const row = result.rows[0];
      if (!row) throw new Error("Rate-limit counter was not returned.");

      if (Number(row.hits) === threshold) {
        await client.query(`
          INSERT INTO security_events
            (id, source, external_event_id, event_type, severity, observed_at, asset_id, summary, attributes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB)
          ON CONFLICT (source, external_event_id) DO NOTHING
        `, [
          randomUUID(), event.source, event.externalEventId, event.eventType,
          event.severity, event.observedAt, event.assetId ?? null,
          event.summary, JSON.stringify(event.attributes ?? {})
        ]);
      }

      await client.query("COMMIT");
      this.scheduleExpiredCounterCleanup();
      return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original error. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    await this.ensureSchema();
    const result = await pool.query<CounterRow>(`
      SELECT hits, reset_at
      FROM api_rate_limit_counters
      WHERE scope = $1 AND key_hash = $2 AND reset_at > NOW()
    `, [this.prefix, this.hashKey(key)]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      totalHits: Number(row.hits),
      resetTime: new Date(row.reset_at)
    };
  }

  async decrement(key: string): Promise<void> {
    await this.ensureSchema();
    await pool.query(`
      UPDATE api_rate_limit_counters
      SET hits = GREATEST(hits - 1, 0)
      WHERE scope = $1 AND key_hash = $2 AND reset_at > NOW()
    `, [this.prefix, this.hashKey(key)]);
  }

  async resetKey(key: string): Promise<void> {
    await this.ensureSchema();
    await pool.query(
      "DELETE FROM api_rate_limit_counters WHERE scope = $1 AND key_hash = $2",
      [this.prefix, this.hashKey(key)]
    );
  }

  async resetAll(): Promise<void> {
    await this.ensureSchema();
    await pool.query("DELETE FROM api_rate_limit_counters WHERE scope = $1", [this.prefix]);
  }

  private scheduleExpiredCounterCleanup(): void {
    this.cleanupCounter += 1;
    if (this.cleanupCounter < 1000) return;
    this.cleanupCounter = 0;
    void pool.query("DELETE FROM api_rate_limit_counters WHERE reset_at <= NOW()").catch(() => undefined);
  }
}
