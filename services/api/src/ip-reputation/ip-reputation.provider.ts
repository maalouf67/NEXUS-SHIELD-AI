import ipaddr from "ipaddr.js";

export type IpReputationVerdict = "malicious" | "suspicious" | "safe" | "unknown";

export interface IpReputationAssessment {
  provider: "abuseipdb";
  status: "ok" | "not_configured" | "timeout" | "rate_limited" | "error";
  verdict: IpReputationVerdict | null;
  scanned_ip: string;
  abuse_confidence_score: number | null;
  total_reports: number | null;
  last_reported_at: string | null;
  country_code: string | null;
  usage_type: string | null;
  isp: string | null;
  domain: string | null;
  is_whitelisted: boolean | null;
  message: string;
}

export class IpReputationProviderError extends Error {
  constructor(public readonly code: "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMITED" | "UPSTREAM_ERROR") {
    super(code);
    this.name = "IpReputationProviderError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function nullableCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function nullableScore(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : null;
}

export function normalizePublicIp(value: string): string | null {
  const input = value.trim();
  if (!input || input.length > 45) return null;
  try {
    const parsed = ipaddr.parse(input);
    // Only globally routable unicast addresses are sent to the external provider.
    // Private, loopback, link-local, multicast, reserved, mapped and transition ranges fail closed.
    if (parsed.range() !== "unicast") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function mapVerdict(score: number | null, reports: number | null): IpReputationVerdict {
  if (score === null || reports === null) return "unknown";
  if (score >= 90 && reports >= 5) return "malicious";
  if (score >= 25 || reports >= 3) return "suspicious";
  if (score === 0 && reports === 0) return "safe";
  return "unknown";
}

export class AbuseIpDbProvider {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async lookup(ipAddress: string): Promise<IpReputationAssessment> {
    const apiKey = process.env.ABUSEIPDB_API_KEY?.trim();
    if (!apiKey) throw new IpReputationProviderError("NOT_CONFIGURED");

    const maxAgeValue = Number(process.env.ABUSEIPDB_MAX_AGE_DAYS ?? "90");
    const maxAgeInDays = Number.isInteger(maxAgeValue) && maxAgeValue >= 1 && maxAgeValue <= 365
      ? maxAgeValue
      : 90;
    const endpoint = new URL("https://api.abuseipdb.com/api/v2/check");
    endpoint.searchParams.set("ipAddress", ipAddress);
    endpoint.searchParams.set("maxAgeInDays", String(maxAgeInDays));

    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Key: apiKey
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(9000)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new IpReputationProviderError("TIMEOUT");
      }
      throw new IpReputationProviderError("UPSTREAM_ERROR");
    }

    if (response.status === 429) throw new IpReputationProviderError("RATE_LIMITED");
    if (!response.ok) throw new IpReputationProviderError("UPSTREAM_ERROR");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new IpReputationProviderError("UPSTREAM_ERROR");
    }
    if (!isRecord(payload) || !isRecord(payload.data)) {
      throw new IpReputationProviderError("UPSTREAM_ERROR");
    }

    const data = payload.data;
    const score = nullableScore(data.abuseConfidenceScore);
    const reports = nullableCount(data.totalReports);

    return {
      provider: "abuseipdb",
      status: "ok",
      verdict: mapVerdict(score, reports),
      scanned_ip: ipAddress,
      abuse_confidence_score: score,
      total_reports: reports,
      last_reported_at: nullableString(data.lastReportedAt),
      country_code: nullableString(data.countryCode),
      usage_type: nullableString(data.usageType),
      isp: nullableString(data.isp),
      domain: nullableString(data.domain),
      is_whitelisted: typeof data.isWhitelisted === "boolean" ? data.isWhitelisted : null,
      message: "AbuseIPDB community-reported IP reputation. Scores are indicators, not proof that a specific device or person is malicious."
    };
  }
}

export const abuseIpDbProvider = new AbuseIpDbProvider();
