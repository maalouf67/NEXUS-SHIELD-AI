import type { SecurityEventInput, SecurityEventSeverity } from './security-event.repository.js';

export const OCSF_SCHEMA_VERSION = '1.9.0' as const;

type OcsfSeverityId = 1 | 2 | 3 | 4 | 5;
type OcsfSeverityName = 'Informational' | 'Low' | 'Medium' | 'High' | 'Critical';

export interface OcsfBaseEventV19 {
  activity_id: 0;
  category_uid: 0;
  class_uid: 0;
  severity: OcsfSeverityName;
  severity_id: OcsfSeverityId;
  time: number;
  type_uid: 0;
  message: string;
  metadata: {
    product: {
      name: 'NEXUS SHIELD AI';
      vendor_name: 'NEXUS SHIELD AI';
    };
    source: string;
    original_event_uid: string;
    version: typeof OCSF_SCHEMA_VERSION;
  };
  unmapped: {
    nexus_event_type: string;
    nexus_asset_id?: string;
  };
}

export type OcsfNormalizationErrorCode =
  | 'INVALID_SOURCE'
  | 'INVALID_EXTERNAL_EVENT_ID'
  | 'INVALID_EVENT_TYPE'
  | 'INVALID_OBSERVED_AT'
  | 'INVALID_ASSET_ID'
  | 'EMPTY_MESSAGE';

export class OcsfNormalizationError extends Error {
  constructor(readonly code: OcsfNormalizationErrorCode) {
    super('Cannot normalize security event: ' + code);
    this.name = 'OcsfNormalizationError';
  }
}

const SEVERITY_MAP: Record<SecurityEventSeverity, {
  id: OcsfSeverityId;
  name: OcsfSeverityName;
}> = {
  informational: { id: 1, name: 'Informational' },
  low: { id: 2, name: 'Low' },
  medium: { id: 3, name: 'Medium' },
  high: { id: 4, name: 'High' },
  critical: { id: 5, name: 'Critical' }
};

const SAFE_SOURCE_PATTERN = /^[a-zA-Z0-9._-]{2,64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Produces an OCSF Base Event until a verified source adapter can prove a
 * more specific event class. A free-form eventType is never treated as proof.
 */
export function normalizeSecurityEventToOcsf(
  event: SecurityEventInput
): OcsfBaseEventV19 {
  const source = event.source.trim();
  if (!SAFE_SOURCE_PATTERN.test(source)) {
    throw new OcsfNormalizationError('INVALID_SOURCE');
  }

  const externalEventId = event.externalEventId.trim();
  if (
    externalEventId.length === 0 ||
    externalEventId.length > 128 ||
    CONTROL_CHARACTERS.test(externalEventId)
  ) {
    throw new OcsfNormalizationError('INVALID_EXTERNAL_EVENT_ID');
  }

  const eventType = event.eventType.trim();
  if (
    eventType.length === 0 ||
    eventType.length > 128 ||
    CONTROL_CHARACTERS.test(eventType)
  ) {
    throw new OcsfNormalizationError('INVALID_EVENT_TYPE');
  }

  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(event.observedAt)) {
    throw new OcsfNormalizationError('INVALID_OBSERVED_AT');
  }
  const observedAt = Date.parse(event.observedAt);
  if (!Number.isSafeInteger(observedAt)) {
    throw new OcsfNormalizationError('INVALID_OBSERVED_AT');
  }

  const message = event.summary
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
  if (!message) {
    throw new OcsfNormalizationError('EMPTY_MESSAGE');
  }

  let assetId: string | undefined;
  if (event.assetId !== undefined) {
    assetId = event.assetId.trim();
    if (
      assetId.length === 0 ||
      assetId.length > 128 ||
      CONTROL_CHARACTERS.test(assetId)
    ) {
      throw new OcsfNormalizationError('INVALID_ASSET_ID');
    }
  }

  const severity = SEVERITY_MAP[event.severity];
  const unmapped: OcsfBaseEventV19['unmapped'] = {
    nexus_event_type: eventType
  };
  if (assetId) unmapped.nexus_asset_id = assetId;

  return {
    activity_id: 0,
    category_uid: 0,
    class_uid: 0,
    severity: severity.name,
    severity_id: severity.id,
    time: observedAt,
    type_uid: 0,
    message,
    metadata: {
      product: {
        name: 'NEXUS SHIELD AI',
        vendor_name: 'NEXUS SHIELD AI'
      },
      source,
      original_event_uid: externalEventId,
      version: OCSF_SCHEMA_VERSION
    },
    unmapped
  };
}
