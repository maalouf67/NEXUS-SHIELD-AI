export type PrivacyScanStatus = 'not_available' | 'success' | 'blocked';

export type AjaxxScanInput = {
  request_id?: string;
  data_classes: string[];
  summary?: string;
};

export type AjaxxScanResult = {
  status: PrivacyScanStatus;
  service: 'ajaxx-data-scrubber';
  is_available: boolean;
  reason: 'SERVICE_NOT_CONFIGURED' | 'CONSENT_REQUIRED' | 'INVALID_REQUEST';
  message: string;
  no_external_data_transfer: true;
};

export interface AjaxxDataScrubberAdapter {
  scan(input: AjaxxScanInput): Promise<AjaxxScanResult>;
}
