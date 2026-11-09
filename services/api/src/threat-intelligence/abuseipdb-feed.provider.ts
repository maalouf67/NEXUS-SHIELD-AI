import { normalizePublicIp } from '../ip-reputation/ip-reputation.provider.js';

export interface AbuseIpDbFeedIndicator {
  ipAddress: string;
  confidence: number;
  countryCode: string | null;
  lastReportedAt: string | null;
}

export interface AbuseIpDbFeedSnapshot {
  generatedAt: string;
  indicators: AbuseIpDbFeedIndicator[];
}

export class ThreatFeedProviderError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'TIMEOUT' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INVALID_RESPONSE') {
    super(code);
    this.name = 'ThreatFeedProviderError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export class AbuseIpDbBlacklistProvider {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async fetchBlacklist(confidenceMinimum = 90, limit = 10000): Promise<AbuseIpDbFeedSnapshot> {
    const apiKey = process.env.ABUSEIPDB_API_KEY?.trim();
    if (!apiKey) throw new ThreatFeedProviderError('NOT_CONFIGURED');
    if (!Number.isInteger(confidenceMinimum) || confidenceMinimum < 25 || confidenceMinimum > 100) {
      throw new ThreatFeedProviderError('INVALID_RESPONSE');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      throw new ThreatFeedProviderError('INVALID_RESPONSE');
    }

    const endpoint = new URL('https://api.abuseipdb.com/api/v2/blacklist');
    endpoint.searchParams.set('confidenceMinimum', String(confidenceMinimum));
    endpoint.searchParams.set('limit', String(limit));

    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', Key: apiKey },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new ThreatFeedProviderError('TIMEOUT');
      }
      throw new ThreatFeedProviderError('UPSTREAM_ERROR');
    }

    if (response.status === 429) throw new ThreatFeedProviderError('RATE_LIMITED');
    if (!response.ok) throw new ThreatFeedProviderError('UPSTREAM_ERROR');

    let payload: unknown;
    try { payload = await response.json(); } catch {
      throw new ThreatFeedProviderError('INVALID_RESPONSE');
    }
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new ThreatFeedProviderError('INVALID_RESPONSE');
    }

    const meta = isRecord(payload.meta) ? payload.meta : {};
    const generatedAt = parseTimestamp(meta.generatedAt) ??
      parseTimestamp(response.headers.get('x-generated-at'));
    if (!generatedAt) throw new ThreatFeedProviderError('INVALID_RESPONSE');

    const indicators: AbuseIpDbFeedIndicator[] = [];
    for (const raw of payload.data) {
      if (!isRecord(raw)) continue;
      const ipAddress = typeof raw.ipAddress === 'string' ? normalizePublicIp(raw.ipAddress) : null;
      const confidence = raw.abuseConfidenceScore;
      if (!ipAddress || typeof confidence !== 'number' || !Number.isInteger(confidence) ||
          confidence < confidenceMinimum || confidence > 100) continue;
      indicators.push({
        ipAddress,
        confidence,
        countryCode: typeof raw.countryCode === 'string' && /^[A-Z]{2}$/.test(raw.countryCode)
          ? raw.countryCode : null,
        lastReportedAt: parseTimestamp(raw.lastReportedAt)
      });
    }

    return { generatedAt, indicators };
  }
}

export const abuseIpDbBlacklistProvider = new AbuseIpDbBlacklistProvider();
