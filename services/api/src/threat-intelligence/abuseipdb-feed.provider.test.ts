import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbuseIpDbBlacklistProvider, ThreatFeedProviderError } from './abuseipdb-feed.provider.js';

const originalKey = process.env.ABUSEIPDB_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ABUSEIPDB_API_KEY;
  else process.env.ABUSEIPDB_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe('AbuseIPDB blacklist provider', () => {
  it('requires a server-side API key and makes no request when absent', async () => {
    delete process.env.ABUSEIPDB_API_KEY;
    const fetcher = vi.fn();
    const provider = new AbuseIpDbBlacklistProvider(fetcher as unknown as typeof fetch);
    await expect(provider.fetchBlacklist()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts only public IPs, valid scores and a timestamped provider response', async () => {
    process.env.ABUSEIPDB_API_KEY = 'test-api-key';
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      meta: { generatedAt: '2026-11-09T12:00:00Z' },
      data: [
        { ipAddress: '8.8.8.8', abuseConfidenceScore: 95, countryCode: 'US', lastReportedAt: '2026-11-09T11:50:00Z' },
        { ipAddress: '127.0.0.1', abuseConfidenceScore: 100 },
        { ipAddress: '2001:db8::1', abuseConfidenceScore: 100 },
        { ipAddress: '1.1.1.1', abuseConfidenceScore: 10 }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = new AbuseIpDbBlacklistProvider(fetcher as unknown as typeof fetch);
    const result = await provider.fetchBlacklist(90, 100);
    expect(result.indicators).toEqual([{
      ipAddress: '8.8.8.8', confidence: 95, countryCode: 'US', lastReportedAt: '2026-11-09T11:50:00.000Z'
    }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.hostname).toBe('api.abuseipdb.com');
    expect(url.pathname).toBe('/api/v2/blacklist');
    expect((init.headers as Record<string, string>).Key).toBe('test-api-key');
  });

  it('rejects a response without trusted generatedAt freshness metadata', async () => {
    process.env.ABUSEIPDB_API_KEY = 'test-api-key';
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const provider = new AbuseIpDbBlacklistProvider(fetcher as unknown as typeof fetch);
    await expect(provider.fetchBlacklist()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('maps provider rate limits without accepting a partial feed', async () => {
    process.env.ABUSEIPDB_API_KEY = 'test-api-key';
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    const provider = new AbuseIpDbBlacklistProvider(fetcher as unknown as typeof fetch);
    await expect(provider.fetchBlacklist()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
