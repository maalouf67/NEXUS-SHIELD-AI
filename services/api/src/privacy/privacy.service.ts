import { NoopAjaxxDataScrubberAdapter } from './noop-ajaxx-adapter.js';
import type { AjaxxDataScrubberAdapter } from './ajaxx-adapter.js';
import type { PrivacyScanRequest } from './privacy.dto.js';

export class PrivacyGuardService {
  constructor(
    private readonly adapter: AjaxxDataScrubberAdapter = new NoopAjaxxDataScrubberAdapter()
  ) {}

  async evaluate(request: PrivacyScanRequest) {
    if (!request.consent.granted || !request.consent.explicit) {
      throw new Error('CONSENT_REQUIRED');
    }

    const result = await this.adapter.scan({
      request_id: request.request_id,
      data_classes: request.payload.data_classes.map((item) => item),
      summary: request.payload.summary
    });

    return {
      request_id: request.request_id ?? `privacy_${Date.now()}`,
      status: 'ok',
      mode: 'safe-no-op',
      no_external_data_transfer: true,
      consent: {
        granted: request.consent.granted,
        explicit: request.consent.explicit,
        purpose: request.consent.purpose,
        source: request.consent.source
      },
      external_scan: {
        provider: 'ajaxx-data-scrubber',
        status: result.status,
        is_available: result.is_available,
        reason: result.reason,
        message: result.message,
        no_external_data_transfer: result.no_external_data_transfer
      }
    };
  }
}
