export type PhoneReputationVerdict = "malicious" | "suspicious" | "safe" | "unknown";

export interface PhoneReputationResult {
  provider: "ipqualityscore";
  verdict: PhoneReputationVerdict;
  scanned_phone: string;
  fraud_score: number | null;
  number_valid: boolean | null;
  recent_abuse: boolean | null;
  risky: boolean | null;
  spammer: boolean | null;
  active: boolean | null;
  carrier: string | null;
  phone_type: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  provider_request_id: string | null;
  message: string;
}

export type PhoneProviderErrorCode = "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMITED" | "UPSTREAM_ERROR";

export class PhoneReputationProviderError extends Error {
  constructor(public readonly code: PhoneProviderErrorCode) {
    super(code);
    this.name = "PhoneReputationProviderError";
  }
}

export interface PhoneReputationProvider {
  lookup(phoneE164: string): Promise<PhoneReputationResult>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.toUpperCase() === "N/A") return null;
  return normalized;
}

function nullableScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : null;
}

function mapVerdict(data: JsonRecord): PhoneReputationVerdict {
  const spammer = nullableBoolean(data.spammer);
  const risky = nullableBoolean(data.risky);
  const recentAbuse = nullableBoolean(data.recent_abuse);
  const score = nullableScore(data.fraud_score);

  // "Malicious" is reserved for the provider's explicit spammer flag.
  // A high fraud score alone is a risk signal, not proof of malicious intent.
  if (spammer === true) return "malicious";
  if (score !== null && score >= 75) return "suspicious";
  if (recentAbuse === true || risky === true) return "suspicious";

  // Do not infer safety from absent/null provider fields.
  if (
    data.valid === true &&
    score !== null &&
    score < 75 &&
    recentAbuse === false &&
    risky === false &&
    spammer === false
  ) {
    return "safe";
  }
  return "unknown";
}

function mapResult(phoneE164: string, data: JsonRecord): PhoneReputationResult {
  const city = nullableString(data.city);
  const region = nullableString(data.region);
  const location = [city, region].filter(Boolean).join(", ") || null;

  return {
    provider: "ipqualityscore",
    verdict: mapVerdict(data),
    scanned_phone: nullableString(data.formatted) ?? phoneE164,
    fraud_score: nullableScore(data.fraud_score),
    number_valid: nullableBoolean(data.valid),
    recent_abuse: nullableBoolean(data.recent_abuse),
    risky: nullableBoolean(data.risky),
    spammer: nullableBoolean(data.spammer),
    active: nullableBoolean(data.active),
    carrier: nullableString(data.carrier),
    phone_type: nullableString(data.line_type),
    country: nullableString(data.country),
    region,
    location,
    provider_request_id: nullableString(data.request_id),
    message: "Assessment supplied by IPQualityScore. A reputation score is not proof of caller identity."
  };
}

export class IpQualityScorePhoneReputationProvider implements PhoneReputationProvider {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async lookup(phoneE164: string): Promise<PhoneReputationResult> {
    const apiKey = process.env.IPQS_API_KEY?.trim();
    if (!apiKey) throw new PhoneReputationProviderError("NOT_CONFIGURED");

    const digits = phoneE164.replace(/^\+/, "");
    const endpoint = new URL(
      "https://www.ipqualityscore.com/api/json/phone/" +
      encodeURIComponent(apiKey) + "/" + encodeURIComponent(digits)
    );

    // Explicitly pass Morocco for +212 numbers; never guess a country from the
    // server's IP address or the user's location.
    if (phoneE164.startsWith("+212")) endpoint.searchParams.append("country[]", "MA");

    const strictnessValue = Number(process.env.IPQS_PHONE_STRICTNESS ?? "0");
    const strictness = Number.isInteger(strictnessValue) && strictnessValue >= 0 && strictnessValue <= 2
      ? strictnessValue
      : 0;
    endpoint.searchParams.set("strictness", String(strictness));

    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new PhoneReputationProviderError("TIMEOUT");
      }
      throw new PhoneReputationProviderError("UPSTREAM_ERROR");
    }

    if (response.status === 429) throw new PhoneReputationProviderError("RATE_LIMITED");
    if (!response.ok) throw new PhoneReputationProviderError("UPSTREAM_ERROR");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PhoneReputationProviderError("UPSTREAM_ERROR");
    }
    if (!isRecord(payload)) throw new PhoneReputationProviderError("UPSTREAM_ERROR");

    if (payload.success !== true) {
      // IPQS can return a structured invalid/nonexistent number response.
      // It is an UNKNOWN reputation result, not a malicious verdict.
      if (payload.valid === false) return mapResult(phoneE164, payload);
      throw new PhoneReputationProviderError("UPSTREAM_ERROR");
    }

    return mapResult(phoneE164, payload);
  }
}

export const phoneReputationProvider = new IpQualityScorePhoneReputationProvider();