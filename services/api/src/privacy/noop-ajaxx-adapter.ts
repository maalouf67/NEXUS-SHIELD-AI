import type { AjaxxDataScrubberAdapter, AjaxxScanInput, AjaxxScanResult } from './ajaxx-adapter.js';

export class NoopAjaxxDataScrubberAdapter implements AjaxxDataScrubberAdapter {
  async scan(_input: AjaxxScanInput): Promise<AjaxxScanResult> {
    return {
      status: 'not_available',
      service: 'ajaxx-data-scrubber',
      is_available: false,
      reason: 'SERVICE_NOT_CONFIGURED',
      message:
        'AJAXX Data Scrubber integration is not available in this build. No data was sent externally.',
      no_external_data_transfer: true
    };
  }
}

export type { AjaxxDataScrubberAdapter, AjaxxScanInput, AjaxxScanResult } from './ajaxx-adapter.js';
