import { describe, expect, it } from 'vitest';

import type { SecurityEventInput } from './security-event.repository.js';
import {
  normalizeSecurityEventToOcsf,
  OCSF_SCHEMA_VERSION,
  OcsfNormalizationError
} from './ocsf-normalizer.js';

const event: SecurityEventInput = {
  source: 'nexus-api',
  externalEventId: 'event-123',
  eventType: 'auth.login.failed',
  severity: 'high',
  observedAt: '2026-11-09T12:30:00.000Z',
  assetId: 'asset-456',
  summary: 'Repeated authentication failure',
  attributes: {
    token: 'must-not-be-exported',
    phone: '+212600000000'
  }
};

describe('OCSF 1.9.0 security event normalizer', () => {
  it('uses the generic Base Event when source semantics are not class-mapped', () => {
    const normalized = normalizeSecurityEventToOcsf(event);

    expect(normalized).toMatchObject({
      activity_id: 0,
      category_uid: 0,
      class_uid: 0,
      type_uid: 0,
      severity: 'High',
      severity_id: 4,
      message: 'Repeated authentication failure',
      metadata: {
        source: 'nexus-api',
        original_event_uid: 'event-123',
        version: OCSF_SCHEMA_VERSION
      },
      unmapped: {
        nexus_event_type: 'auth.login.failed',
        nexus_asset_id: 'asset-456'
      }
    });
    expect(normalized.time).toBe(Date.parse(event.observedAt));
    expect(normalized.metadata.product).toEqual({
      name: 'NEXUS SHIELD AI',
      vendor_name: 'NEXUS SHIELD AI'
    });
  });

  it.each([
    ['informational', 1, 'Informational'],
    ['low', 2, 'Low'],
    ['medium', 3, 'Medium'],
    ['high', 4, 'High'],
    ['critical', 5, 'Critical']
  ] as const)('maps %s severity to OCSF severity_id %i', (severity, severityId, name) => {
    const normalized = normalizeSecurityEventToOcsf({
      ...event,
      severity
    });

    expect(normalized.severity_id).toBe(severityId);
    expect(normalized.severity).toBe(name);
  });

  it('does not copy arbitrary provider attributes into the normalized event', () => {
    const normalized = normalizeSecurityEventToOcsf(event);
    const serialized = JSON.stringify(normalized);

    expect(serialized).not.toContain('must-not-be-exported');
    expect(serialized).not.toContain('+212600000000');
    expect(serialized).not.toContain('"attributes"');
  });

  it('does not infer a class from an event type that looks like authentication', () => {
    const normalized = normalizeSecurityEventToOcsf(event);
    expect(normalized.class_uid).toBe(0);
    expect(normalized.unmapped.nexus_event_type).toBe('auth.login.failed');
  });

  it('rejects timestamps without an explicit timezone', () => {
    expect(() => normalizeSecurityEventToOcsf({
      ...event,
      observedAt: '2026-11-09T12:30:00'
    })).toThrowError(OcsfNormalizationError);
  });

  it('rejects invalid timestamps', () => {
    expect(() => normalizeSecurityEventToOcsf({
      ...event,
      observedAt: 'not-a-timestampZ'
    })).toThrowError(OcsfNormalizationError);
  });

  it('rejects unsafe source identifiers', () => {
    expect(() => normalizeSecurityEventToOcsf({
      ...event,
      source: 'bad source'
    })).toThrowError(OcsfNormalizationError);
  });

  it('normalizes control characters and repeated whitespace in the message', () => {
    const normalized = normalizeSecurityEventToOcsf({
      ...event,
      summary: '  authentication\n\tfailure  '
    });
    expect(normalized.message).toBe('authentication failure');
  });

  it('omits an absent asset identifier', () => {
    const normalized = normalizeSecurityEventToOcsf({
      ...event,
      assetId: undefined
    });
    expect(normalized.unmapped).toEqual({
      nexus_event_type: 'auth.login.failed'
    });
  });
});
