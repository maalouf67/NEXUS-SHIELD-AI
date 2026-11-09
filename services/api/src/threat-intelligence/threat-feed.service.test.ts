import { describe, expect, it, vi } from 'vitest';
import { ThreatFeedService } from './threat-feed.service.js';

function fakePool() {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO threat_feeds')) return { rows: [{ id: 'feed-id' }], rowCount: 1 };
      if (sql.includes('INSERT INTO threat_indicators')) return { rows: [{ id: 'indicator-id', inserted: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn()
  };
  return { connect: vi.fn().mockResolvedValue(client), client };
}

describe('ThreatFeedService', () => {
  it('rejects stale provider data before opening a database transaction', async () => {
    const pool = fakePool();
    const provider = { fetchBlacklist: vi.fn().mockResolvedValue({
      generatedAt: '2026-11-09T00:00:00Z',
      indicators: []
    }) };
    const service = new ThreatFeedService(pool as never, provider as never, () => new Date('2026-11-09T12:00:00Z'));
    await expect(service.syncAbuseIpDb('workspace-id')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('deduplicates duplicate feed indicators before database persistence', async () => {
    const pool = fakePool();
    const provider = { fetchBlacklist: vi.fn().mockResolvedValue({
      generatedAt: '2026-11-09T11:59:00Z',
      indicators: [
        { ipAddress: '8.8.8.8', confidence: 95, countryCode: 'US', lastReportedAt: '2026-11-09T11:58:00Z' },
        { ipAddress: '8.8.8.8', confidence: 90, countryCode: 'US', lastReportedAt: '2026-11-09T11:57:00Z' }
      ]
    }) };
    const service = new ThreatFeedService(pool as never, provider as never, () => new Date('2026-11-09T12:00:00Z'));
    const result = await service.syncAbuseIpDb('workspace-id');
    expect(result.fetched).toBe(2);
    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(pool.client.query).toHaveBeenCalledWith('COMMIT');
    expect(pool.client.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the database connection when persistence fails', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
        if (sql.includes('INSERT INTO threat_feeds')) return { rows: [{ id: 'feed-id' }], rowCount: 1 };
        if (sql.includes('INSERT INTO threat_feed_runs')) return { rows: [], rowCount: 1 };
        if (sql.includes('INSERT INTO threat_indicators')) throw new Error('database failure');
        if (sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const provider = { fetchBlacklist: vi.fn().mockResolvedValue({
      generatedAt: '2026-11-09T11:59:00Z',
      indicators: [{ ipAddress: '8.8.8.8', confidence: 95, countryCode: 'US', lastReportedAt: null }]
    }) };
    const service = new ThreatFeedService(pool as never, provider as never, () => new Date('2026-11-09T12:00:00Z'));
    await expect(service.syncAbuseIpDb('workspace-id')).rejects.toThrow('database failure');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
