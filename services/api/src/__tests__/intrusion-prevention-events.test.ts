import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { securityEventRepository } from '../security-events/security-event.repository.js';
import { recordProtectionEvent } from '../middleware/intrusion-prevention.js';

vi.mock('../security-events/security-event.repository.js', () => ({
  securityEventRepository: {
    ingestSystemBatch: vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 })
  }
}));

const ingestSystemBatch = vi.mocked(securityEventRepository.ingestSystemBatch);
const originalRateLimitSecret = process.env.RATE_LIMIT_HASH_SECRET;
const originalSessionSecret = process.env.SESSION_SECRET;

const eventOptions = {
  eventType: 'api-anomaly-containment-triggered',
  summary: 'Repeated suspicious requests triggered temporary API source containment.',
  windowMs: 10 * 60 * 1000,
  limit: 40,
  responseAction: 'temporary_api_quarantine',
  severity: 'medium' as const,
  attributes: { http_method: 'GET', response_status: '404', listener_scope: 'api' }
};

function requestFrom(ip: string): Request {
  return { ip } as Request;
}

describe('privacy-preserving protection events', () => {
  beforeEach(() => {
    ingestSystemBatch.mockClear();
    ingestSystemBatch.mockResolvedValue({ inserted: 1, duplicates: 0 });
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

  it('stores a keyed source fingerprint without storing the raw IP address', async () => {
    const sourceIp = '203.0.113.44';

    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    expect(ingestSystemBatch).toHaveBeenCalledTimes(1);
    const event = ingestSystemBatch.mock.calls[0]?.[0][0];

    expect(event).toMatchObject({
      source: 'nexus-ips',
      eventType: eventOptions.eventType,
      severity: 'medium'
    });
    expect(event?.attributes.source_ip_fingerprint).toMatch(/^[a-f0-9]{24}$/);
    expect(event?.attributes.response_status).toBe('404');
    expect(event?.attributes.http_method).toBe('GET');
    expect(JSON.stringify(event)).not.toContain(sourceIp);
    expect(JSON.stringify(event)).not.toContain('password');
    expect(JSON.stringify(event)).not.toContain('email');
  });

  it('generates a stable event identifier for the same source, type and trigger timestamp', async () => {
    const sourceIp = '198.51.100.27';

    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);
    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    const first = ingestSystemBatch.mock.calls[0]?.[0][0];
    const second = ingestSystemBatch.mock.calls[1]?.[0][0];

    expect(first?.externalEventId).toBeTruthy();
    expect(second?.externalEventId).toBe(first?.externalEventId);
  });

  it('does not collide for separate trigger timestamps inside the same nominal time window', async () => {
    const sourceIp = '198.51.100.27';

    vi.mocked(Date.now).mockReturnValue(1_800_000_000_001);
    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);
    vi.mocked(Date.now).mockReturnValue(1_800_000_000_002);
    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    const first = ingestSystemBatch.mock.calls[0]?.[0][0];
    const second = ingestSystemBatch.mock.calls[1]?.[0][0];

    expect(second?.externalEventId).not.toBe(first?.externalEventId);
  });

  it('generates a different event identifier for a later trigger timestamp', async () => {
    const sourceIp = '198.51.100.27';

    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);
    vi.mocked(Date.now).mockReturnValue(1_800_000_600_000);
    await recordProtectionEvent(requestFrom(sourceIp), eventOptions);

    const first = ingestSystemBatch.mock.calls[0]?.[0][0];
    const second = ingestSystemBatch.mock.calls[1]?.[0][0];

    expect(second?.externalEventId).not.toBe(first?.externalEventId);
  });

  it('fails explicitly when no strong HMAC secret is configured', async () => {
    delete process.env.RATE_LIMIT_HASH_SECRET;
    delete process.env.SESSION_SECRET;
    await expect(recordProtectionEvent(requestFrom('203.0.113.44'), eventOptions))
      .rejects.toThrow('PROTECTION_EVENT_SECRET_NOT_CONFIGURED');
    expect(ingestSystemBatch).not.toHaveBeenCalled();
  });

  it('propagates telemetry persistence failure instead of silently dropping it', async () => {
    ingestSystemBatch.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(recordProtectionEvent(requestFrom('203.0.113.44'), eventOptions))
      .rejects.toThrow('database unavailable');
  });
});
