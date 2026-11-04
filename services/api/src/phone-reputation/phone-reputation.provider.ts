export type PhoneReputationVerdict = "malicious" | "suspicious" | "safe" | "unknown";
export type PhoneProviderName = "ipqualityscore" | "seon";
export type PhoneProviderErrorCode = "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMITED" | "UPSTREAM_ERROR";

export class PhoneReputationProviderError extends Error {
  constructor(
    public readonly provider: PhoneProviderName,
    public readonly code: PhoneProviderErrorCode
  ) {
    super(code);
    this.name = "PhoneReputationProviderError";
  }
}

export interface PhoneProviderAssessment {
  provider: PhoneProviderName;
  status: "ok" | "not_configured" | "timeout" | "rate_limited" | "error";
  verdict: PhoneReputationVerdict | null;
  request_id: string | null;
  signals: {
    fraud_score: number | null;
    network_score: number | null;
    number_valid: boolean | null;
    recent_abuse: boolean | null;
    risky: boolean | null;
    spammer: boolean | null;
    disposable: boolean | null;
    fraudulent_decline_hits: number | null;
    carrier: string | null;
    phone_type: string | null;
    country: string | null;
    flags_count: number | null;
  };
  message: string;
}

export interface PhoneReputationProvider {
  readonly provider: PhoneProviderName;
  lookup(phoneE164: string): Promise<PhoneProviderAssessment>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nested(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}
function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.toUpperCase() !== "N/A" ? normalized : null;
}
function nullableScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value * 100) / 100
    : null;
}
function nullableCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
function emptySignals(): PhoneProviderAssessment["signals"] {
  return {
    fraud_score: null, network_score: null, number_valid: null,
    recent_abuse: null, risky: null, spammer: null, disposable: null,
    fraudulent_decline_hits: null, carrier: null, phone_type: null,
    country: null, flags_count: null
  };
}
function mapProviderError(provider: PhoneProviderName, error: unknown): PhoneReputationProviderError {
  if (error instanceof PhoneReputationProviderError) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new PhoneReputationProviderError(provider, "TIMEOUT");
  }
  return new PhoneReputationProviderError(provider, "UPSTREAM_ERROR");
}

function ipqsVerdict(data: JsonRecord): PhoneReputationVerdict {
  const spammer = nullableBoolean(data.spammer);
  const risky = nullableBoolean(data.risky);
  const recentAbuse = nullableBoolean(data.recent_abuse);
  const score = nullableScore(data.fraud_score);
  if (spammer === true) return "malicious";
  if ((score !== null && score >= 75) || risky === true || recentAbuse === true) return "suspicious";
  if (
    data.valid === true && score !== null && score < 75 &&
    spammer === false && risky === false && recentAbuse === false
  ) return "safe";
  return "unknown";
}

export class IpQualityScorePhoneReputationProvider implements PhoneReputationProvider {
  readonly provider = "ipqualityscore" as const;
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async lookup(phoneE164: string): Promise<PhoneProviderAssessment> {
    const apiKey = process.env.IPQS_API_KEY?.trim();
    if (!apiKey) throw new PhoneReputationProviderError(this.provider, "NOT_CONFIGURED");
    const digits = phoneE164.replace(/^\+/, "");
    const endpoint = new URL(
      "https://www.ipqualityscore.com/api/json/phone/" +
      encodeURIComponent(apiKey) + "/" + encodeURIComponent(digits)
    );
    if (phoneE164.startsWith("+212")) endpoint.searchParams.set("country[]", "MA");
    const strictnessValue = Number(process.env.IPQS_PHONE_STRICTNESS ?? "0");
    const strictness = Number.isInteger(strictnessValue) && strictnessValue >= 0 && strictnessValue <= 2
      ? strictnessValue : 0;
    endpoint.searchParams.set("strictness", String(strictness));

    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "GET", headers: { Accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(9000)
      });
    } catch (error) {
      throw mapProviderError(this.provider, error);
    }
    if (response.status === 429) throw new PhoneReputationProviderError(this.provider, "RATE_LIMITED");
    if (!response.ok) throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR");

    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR"); }
    if (!isRecord(payload)) throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR");
    if (payload.success !== true && payload.valid !== false) {
      throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR");
    }

    const signals = emptySignals();
    signals.fraud_score = nullableScore(payload.fraud_score);
    signals.number_valid = nullableBoolean(payload.valid);
    signals.recent_abuse = nullableBoolean(payload.recent_abuse);
    signals.risky = nullableBoolean(payload.risky);
    signals.spammer = nullableBoolean(payload.spammer);
    signals.carrier = nullableString(payload.carrier);
    signals.phone_type = nullableString(payload.line_type);
    signals.country = nullableString(payload.country);

    return {
      provider: this.provider, status: "ok", verdict: ipqsVerdict(payload),
      request_id: nullableString(payload.request_id), signals,
      message: "IPQualityScore reputation signals. These signals do not prove caller identity."
    };
  }
}

function seonVerdict(data: JsonRecord): PhoneReputationVerdict {
  const riskScores = nested(data.risk_scores);
  const fraudHistory = nested(data.seon_fraud_history);
  const carrierDetails = nested(data.provider_carrier_details);
  const score = nullableScore(riskScores.global_network_score);
  const valid = nullableBoolean(carrierDetails.phone_is_valid);
  const disposable = nullableBoolean(carrierDetails.disposable);
  const declineHits = nullableCount(fraudHistory.fraudulent_decline_hits);
  const flags = Array.isArray(fraudHistory.flags) ? fraudHistory.flags : null;
  const flagsCount = flags ? flags.length : null;

  if (valid === false || disposable === true || (score !== null && score > 80) ||
      (declineHits !== null && declineHits > 0) || (flagsCount !== null && flagsCount > 0)) {
    return "suspicious";
  }
  if (valid === true && disposable === false && score !== null && score <= 80 &&
      declineHits === 0 && flagsCount === 0) return "safe";
  return "unknown";
}

const SEON_ALLOWED_HOSTS = new Set([
  "api.seon.io",
  "api.me-central-1-main.seon.io",
  "api.us-east-1-main.seon.io",
  "api.ap-southeast-1-main.seon.io"
]);
const SEON_PATH = "/SeonRestService/phone-api/v2";

function getSeonEndpoint(): URL {
  const configured = process.env.SEON_PHONE_API_URL?.trim() ||
    "https://api.seon.io/SeonRestService/phone-api/v2";
  let url: URL;
  try { url = new URL(configured); }
  catch { throw new PhoneReputationProviderError("seon", "UPSTREAM_ERROR"); }
  if (url.protocol !== "https:" || !SEON_ALLOWED_HOSTS.has(url.hostname) ||
      url.pathname !== SEON_PATH || url.port || url.search || url.hash || url.username || url.password) {
    throw new PhoneReputationProviderError("seon", "UPSTREAM_ERROR");
  }
  return url;
}

export class SeonPhoneReputationProvider implements PhoneReputationProvider {
  readonly provider = "seon" as const;
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async lookup(phoneE164: string): Promise<PhoneProviderAssessment> {
    const apiKey = process.env.SEON_API_KEY?.trim();
    if (!apiKey) throw new PhoneReputationProviderError(this.provider, "NOT_CONFIGURED");
    const endpoint = getSeonEndpoint();
    const digits = phoneE164.replace(/^\+/, "");
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-KEY": apiKey
        },
        body: JSON.stringify({ phone: digits }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      throw mapProviderError(this.provider, error);
    }
    if (response.status === 429) throw new PhoneReputationProviderError(this.provider, "RATE_LIMITED");
    if (!response.ok) throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR");

    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR"); }
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
      throw new PhoneReputationProviderError(this.provider, "UPSTREAM_ERROR");
    }

    const data = payload.data;
    const riskScores = nested(data.risk_scores);
    const fraudHistory = nested(data.seon_fraud_history);
    const carrierDetails = nested(data.provider_carrier_details);
    const flagsCount = Array.isArray(fraudHistory.flags) ? fraudHistory.flags.length : null;
    const signals = emptySignals();
    signals.network_score = nullableScore(riskScores.global_network_score);
    signals.number_valid = nullableBoolean(carrierDetails.phone_is_valid);
    signals.disposable = nullableBoolean(carrierDetails.disposable);
    signals.fraudulent_decline_hits = nullableCount(fraudHistory.fraudulent_decline_hits);
    signals.flags_count = flagsCount;
    signals.carrier = nullableString(carrierDetails.carrier);
    signals.phone_type = nullableString(carrierDetails.type);
    signals.country = nullableString(carrierDetails.country);

    return {
      provider: this.provider, status: "ok", verdict: seonVerdict(data),
      request_id: nullableString(data.id), signals,
      message: "SEON digital-footprint and network-risk signals. This is not caller identification."
    };
  }
}

export const phoneReputationProviders: PhoneReputationProvider[] = [
  new IpQualityScorePhoneReputationProvider(),
  new SeonPhoneReputationProvider()
];
