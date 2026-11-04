import {
  phoneReputationProviders,
  PhoneReputationProviderError,
  type PhoneProviderAssessment,
  type PhoneProviderName,
  type PhoneReputationVerdict
} from "./phone-reputation.provider.js";

export interface PhoneReputationResponse {
  scanned_phone: string;
  verdict: PhoneReputationVerdict;
  coverage: "complete" | "partial" | "none";
  conflict: boolean;
  providers: PhoneProviderAssessment[];
  disclaimer: string;
}

function failedAssessment(provider: PhoneProviderName, error: unknown): PhoneProviderAssessment {
  const code = error instanceof PhoneReputationProviderError ? error.code : "UPSTREAM_ERROR";
  const status: PhoneProviderAssessment["status"] =
    code === "NOT_CONFIGURED" ? "not_configured" :
    code === "TIMEOUT" ? "timeout" :
    code === "RATE_LIMITED" ? "rate_limited" : "error";
  return {
    provider, status, verdict: null, request_id: null,
    signals: {
      fraud_score: null, network_score: null, number_valid: null,
      recent_abuse: null, risky: null, spammer: null, disposable: null,
      fraudulent_decline_hits: null, carrier: null, phone_type: null,
      country: null, flags_count: null
    },
    message: status === "not_configured"
      ? "This provider is not configured on the API server."
      : status === "timeout"
        ? "This provider did not respond before the server timeout."
        : status === "rate_limited"
          ? "This provider is rate-limiting requests. Retry later."
          : "This provider is temporarily unavailable or returned an invalid response."
  };
}

export async function assessPhoneReputation(phoneE164: string): Promise<PhoneReputationResponse> {
  const results = await Promise.all(phoneReputationProviders.map(async (provider) => {
    try { return await provider.lookup(phoneE164); }
    catch (error) { return failedAssessment(provider.provider, error); }
  }));

  const successful = results.filter((result) => result.status === "ok");
  const verdicts = successful.map((result) => result.verdict).filter(
    (verdict): verdict is PhoneReputationVerdict => verdict !== null
  );
  const conflict = verdicts.includes("safe") &&
    (verdicts.includes("suspicious") || verdicts.includes("malicious"));

  let verdict: PhoneReputationVerdict = "unknown";
  if (verdicts.includes("malicious")) verdict = "malicious";
  else if (verdicts.includes("suspicious")) verdict = "suspicious";
  else if (successful.length === 2 && verdicts.length === 2 && verdicts.every((value) => value === "safe")) {
    verdict = "safe";
  }

  return {
    scanned_phone: phoneE164,
    verdict,
    coverage: successful.length === 2 ? "complete" : successful.length === 1 ? "partial" : "none",
    conflict,
    providers: results,
    disclaimer: "A reputation assessment is probabilistic. It does not identify the caller or guarantee that a number is safe. Provider outages and missing signals are never treated as safe."
  };
}
