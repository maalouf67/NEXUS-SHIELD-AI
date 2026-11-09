export type PrivacyProviderConnectionState =
  | 'not_configured'
  | 'credentials_configured'
  | 'sandbox_verified'
  | 'production_verified'
  | 'degraded'
  | 'unavailable';

export type PrivacyProviderCapabilities = Readonly<{
  scanProfile: boolean;
  readScanStatus: boolean;
  readExposureRecords: boolean;
  listBrokers: boolean;
  submitOptOut: boolean;
  readRemovalStatus: boolean;
  recurringMonitoring: boolean;
  deleteProviderData: boolean;
}>;

export type PrivacyProviderDescriptor = Readonly<{
  code: string;
  displayName: string;
  connectionState: PrivacyProviderConnectionState;
  environment: 'sandbox' | 'production' | null;
  capabilities: PrivacyProviderCapabilities;
  supportedCountries: readonly string[];
  consentRequiredForProfileTransfer: boolean;
  profileTransferEnabled: boolean;
  reasonCode: string | null;
}>;

export type PrivacyProviderCatalog = Readonly<{
  service: 'nexus-digital-privacy-guard';
  providers: readonly PrivacyProviderDescriptor[];
}>;
