import type {
  PrivacyProviderCapabilities,
  PrivacyProviderCatalog,
  PrivacyProviderDescriptor
} from './privacy-provider.types.js';

const NO_CAPABILITIES: PrivacyProviderCapabilities = Object.freeze({
  scanProfile: false,
  readScanStatus: false,
  readExposureRecords: false,
  listBrokers: false,
  submitOptOut: false,
  readRemovalStatus: false,
  recurringMonitoring: false,
  deleteProviderData: false
});

/**
 * AJAXX is informational-only in this build. The connected ChatGPT actions
 * do not provide an application API contract or authorized profile-transfer
 * endpoint, so the NEXUS backend must not send personal data to it.
 */
export const AJAXX_INFORMATIONAL_PROVIDER: PrivacyProviderDescriptor = Object.freeze({
  code: 'ajaxx-data-scrubber',
  displayName: 'AJAXX Data Scrubber',
  connectionState: 'unavailable',
  environment: null,
  capabilities: NO_CAPABILITIES,
  supportedCountries: Object.freeze([]),
  consentRequiredForProfileTransfer: true,
  profileTransferEnabled: false,
  reasonCode: 'NO_VERIFIED_PARTNER_API'
});

function copyDescriptor(provider: PrivacyProviderDescriptor): PrivacyProviderDescriptor {
  return {
    ...provider,
    capabilities: { ...provider.capabilities },
    supportedCountries: [...provider.supportedCountries]
  };
}

export class PrivacyProviderRegistry {
  private readonly providers: readonly PrivacyProviderDescriptor[];

  constructor(providers: readonly PrivacyProviderDescriptor[] = [AJAXX_INFORMATIONAL_PROVIDER]) {
    const codes = new Set<string>();

    for (const provider of providers) {
      if (!provider.code.trim()) throw new Error('PRIVACY_PROVIDER_CODE_REQUIRED');
      if (codes.has(provider.code)) throw new Error('DUPLICATE_PRIVACY_PROVIDER_CODE');
      codes.add(provider.code);

      const hasVerifiedEnvironment =
        provider.connectionState === 'sandbox_verified' ||
        provider.connectionState === 'production_verified';

      if (provider.profileTransferEnabled &&
          (!provider.capabilities.scanProfile || !hasVerifiedEnvironment ||
           !provider.consentRequiredForProfileTransfer)) {
        throw new Error('UNSAFE_PRIVACY_PROVIDER_CONFIGURATION');
      }
    }

    this.providers = Object.freeze(providers.map((provider) => Object.freeze(copyDescriptor(provider))));
  }

  list(): PrivacyProviderCatalog {
    return {
      service: 'nexus-digital-privacy-guard',
      providers: this.providers.map(copyDescriptor)
    };
  }
}

export const privacyProviderRegistry = new PrivacyProviderRegistry();
