import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { securityEventRepository } from '../security-events/security-event.repository.js';
import { recordProtectionEvent } from '../middleware/intrusion-prevention.js';

vi.mock('../security-events/security-event.repository.js', () => ({
  securityEventRepository: {
    ingestBatch: vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 })
  }
}));

const ingestBatch = vi.mocked(securityEventRepository.ingestBatch);
const originalRateLimitSecret = process.env.RATE_LIMIT_HASH_SECRET;
const originalSessionSecret = process.env.SESSION_SECRET;

const eventOptions = {
  eventType: 'api-anomaly-containment-triggered',
  summary: 'Repeated suspicious requests triggered temporary API source containment.',
  windowMs: 10 * 60 * 1000,
  limit: 40,
  responseAction: 'temporary_api_quarantine',
  severity: 'medium' as const
};

function requestFrom(ip: string): Request {
  return { ip } as Request;
}

describe('privacy-preserving protection events', () => {
  beforeEach(() => {
    ingestBatch.mockClear();
    ingestBatch.mockResolvedValue({ inserted: 1, duplicates: 0 });
    process.env.RATE_LIMIT_HASH_SECRET = 'r'.repeat(48);
    delete process.env.SESSION_SECRET;
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalRateLimitSecret === undefined) {
      delete process.env.RATE_LIMIT_HASH_SECRET;
    } else {
      process.env.RATE_LIMIT_HASH_SECRET = originalRateLimitSecret;
    }

    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it('stores a keyed source fingerprint without storing the raw IP address', () => {
    const sourceIp = '203.0.113.44';

    recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    expect(ingestBatch).toHaveBeenCalledTimes(1);
    const event = ingestBatch.mock.calls[0]?.[0][0];

    expect(event).toMatchObject({
      source: 'nexus-ips',
      eventType: eventOptions.eventType,
      severity: 'medium'
    });
    expect(event?.attributes.source_ip_fingerprint).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(event)).not.toContain(sourceIp);
    expect(JSON.stringify(event)).not.toContain('password');
    expect(JSON.stringify(event)).not.toContain('email');
  });

  it('generates a stable event identifier for the same source, type and time bucket', () => {
    const sourceIp = '198.51.100.27';

    recordProtectionEvent(requestFrom(sourceIp), eventOptions);
    recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    const first = ingestBatch.mock.calls[0]?.[0][0];
    const second = ingestBatch.mock.calls[1]?.[0][0];

    expect(first?.externalEventId).toBeTruthy();
    expect(second?.externalEventId).toBe(first?.externalEventId);
  });

  it('generates a different event identifier in a later time bucket', () => {
    const sourceIp = '198.51.100.27';

    recordProtectionEvent(requestFrom(sourceIp), eventOptions);
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_600_000);
    recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    const first = ingestBatch.mock.calls[0]?.[0][0];
    const second = ingestBatch.mock.calls[1]?.[0][0];

    expect(second?.externalEventId).not.toBe(first?.externalEventId);
  });

  it('does not emit a fingerprinted event when no strong HMAC secret is configured', () => {
    delete process.env.RATE_LIMIT_HASH_SECRET;
    delete process.env.SESSION_SECRET;

    recordProtectionEvent(requestFrom('203.0.113.44'), eventOptions);

    expect(ingestBatch).not.toHaveBeenCalled();
  });

  it('does not let telemetry persistence failure interrupt the caller', () => {
    ingestBatch.mockRejectedValueOnce(new Error('database unavailable'));

    expect(() => recordProtectionEvent(requestFrom('203.0.113.44'), eventOptions))
      .not.toThrow();
  });
});
