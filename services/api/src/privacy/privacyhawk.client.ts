import { Buffer } from 'node:buffer';

export type PrivacyHawkEnvironment = 'sandbox' | 'production';
export type PrivacyHawkProfile = {
  name: { first: string; last: string; middle?: string; prefix?: string; suffix?: string };
  emailAddresses: string[];
  phoneNumbers?: string[];
  addresses?: Array<{
    address1?: string; address2?: string; city?: string; state?: string;
    postalCode?: string; country: string; current?: boolean;
  }>;
  birthYear?: number;
  birthMonth?: number;
};
export type PrivacyHawkScan = {
  id: string; customerId: string; status: string; brokerCount?: number;
  realtime?: boolean; createdAt?: string; modifiedAt?: string;
  startedAt?: string | null; stoppedAt?: string | null;
};
type ClientOptions = {
  enabled?: string; clientId?: string; clientSecret?: string;
  environment?: PrivacyHawkEnvironment; fetchImpl?: typeof fetch;
};
const API_ORIGINS: Record<PrivacyHawkEnvironment, string> = {
  sandbox: 'https://privacyapi-sandbox.privacyhawk.com',
  production: 'https://privacyapi.privacyhawk.com'
};
export class PrivacyHawkError extends Error {
  constructor(readonly code: string, readonly httpStatus?: number) {
    super(code);
    this.name = 'PrivacyHawkError';
  }
}

/** Server-only partner API client. Provider credentials and bearer tokens never reach the browser. */
export class PrivacyHawkClient {
  private readonly enabled: boolean;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly env: PrivacyHawkEnvironment;
  private readonly fetchImpl: typeof fetch;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: ClientOptions = {}) {
    this.enabled = (options.enabled ?? process.env.PRIVACYHAWK_ENABLED ?? 'false') === 'true';
    this.clientId = options.clientId ?? process.env.PRIVACYHAWK_CLIENT_ID ?? '';
    this.clientSecret = options.clientSecret ?? process.env.PRIVACYHAWK_CLIENT_SECRET ?? '';
    this.env = options.environment ?? (process.env.PRIVACYHAWK_ENVIRONMENT === 'production' ? 'production' : 'sandbox');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return this.enabled && this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  environment(): PrivacyHawkEnvironment {
    return this.env;
  }

  private origin(): string {
    return API_ORIGINS[this.env];
  }

  private async accessToken(forceRefresh = false): Promise<string> {
    if (!this.isConfigured()) throw new PrivacyHawkError('PRIVACYHAWK_NOT_CONFIGURED');
    if (!forceRefresh && this.cachedToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.cachedToken;
    }

    const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'all' });
    const basic = Buffer.from(this.clientId + ':' + this.clientSecret, 'utf8').toString('base64');
    let response: Response;
    try {
      response = await this.fetchImpl('https://privacyapi.privacyhawk.com/token', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + basic,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new PrivacyHawkError('PRIVACYHAWK_AUTH_UNAVAILABLE');
    }
    if (!response.ok) throw new PrivacyHawkError('PRIVACYHAWK_AUTH_FAILED', response.status);

    const payload = await response.json().catch(() => null) as
      | { access_token?: unknown; expires_in?: unknown }
      | null;
    if (!payload || typeof payload.access_token !== 'string' || !payload.access_token) {
      throw new PrivacyHawkError('PRIVACYHAWK_INVALID_TOKEN_RESPONSE');
    }
    const expiresIn = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? Math.max(60, Math.min(payload.expires_in, 86_400))
      : 300;
    this.cachedToken = payload.access_token;
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;
    return this.cachedToken;
  }

  private async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    if (!path.startsWith('/v1/')) throw new PrivacyHawkError('PRIVACYHAWK_INVALID_PATH');
    const token = await this.accessToken();
    const url = new URL(path, this.origin());
    if (url.origin !== this.origin()) throw new PrivacyHawkError('PRIVACYHAWK_INVALID_ORIGIN');

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new PrivacyHawkError('PRIVACYHAWK_PROVIDER_UNAVAILABLE');
    }
    if (response.status === 401 && !retried) {
      await this.accessToken(true);
      return this.request<T>(method, path, body, true);
    }
    if (!response.ok) throw new PrivacyHawkError('PRIVACYHAWK_REQUEST_FAILED', response.status);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new PrivacyHawkError('PRIVACYHAWK_INVALID_RESPONSE');
    }
  }

  createScan(customerId: string, profile: PrivacyHawkProfile, realtime = true): Promise<PrivacyHawkScan> {
    return this.request<PrivacyHawkScan>('POST', '/v1/scans', { customerId, profile, realtime });
  }

  getScan(scanId: string): Promise<PrivacyHawkScan> {
    return this.request<PrivacyHawkScan>('GET', '/v1/scans/' + encodeURIComponent(scanId));
  }

  async getScanRecords(scanId: string): Promise<unknown[]> {
    const result = await this.request<unknown>('GET', '/v1/scans/' + encodeURIComponent(scanId) + '/records');
    if (!Array.isArray(result)) throw new PrivacyHawkError('PRIVACYHAWK_INVALID_RECORDS_RESPONSE');
    return result;
  }

  async listBrokers(): Promise<unknown[]> {
    const result = await this.request<unknown>('GET', '/v1/brokers');
    if (!Array.isArray(result)) throw new PrivacyHawkError('PRIVACYHAWK_INVALID_BROKERS_RESPONSE');
    return result;
  }
}
