import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providers: [] as Array<{ provider: "ipqualityscore" | "seon"; lookup: (phone: string) => Promise<any> }>
}));
vi.mock("./phone-reputation.provider.js", () => ({
  phoneReputationProviders: mocks.providers,
  PhoneReputationProviderError: class PhoneReputationProviderError extends Error {
    constructor(public provider: string, public code: string) { super(code); }
  }
}));
import { assessPhoneReputation } from "./phone-reputation.orchestrator.js";

function assessment(provider: "ipqualityscore" | "seon", verdict: "malicious" | "suspicious" | "safe" | "unknown") {
  return {
    provider, status: "ok", verdict, request_id: null,
    signals: {
      fraud_score: null, network_score: null, number_valid: true,
      recent_abuse: false, risky: false, spammer: false, disposable: false,
      fraudulent_decline_hits: 0, carrier: null, phone_type: null,
      country: "MA", flags_count: 0
    },
    message: "fixture"
  };
}

afterEach(() => { mocks.providers.length = 0; });

describe("dual-provider verdict policy", () => {
  it("returns safe only when both configured providers explicitly return safe", async () => {
    mocks.providers.push(
      { provider: "ipqualityscore", lookup: async () => assessment("ipqualityscore", "safe") },
      { provider: "seon", lookup: async () => assessment("seon", "safe") }
    );
    const result = await assessPhoneReputation("+212612345678");
    expect(result.verdict).toBe("safe");
    expect(result.coverage).toBe("complete");
  });

  it("returns suspicious when one provider reports suspicious and the other safe", async () => {
    mocks.providers.push(
      { provider: "ipqualityscore", lookup: async () => assessment("ipqualityscore", "suspicious") },
      { provider: "seon", lookup: async () => assessment("seon", "safe") }
    );
    const result = await assessPhoneReputation("+212612345678");
    expect(result.verdict).toBe("suspicious");
    expect(result.conflict).toBe(true);
  });

  it("does not return safe when one provider is unavailable", async () => {
    mocks.providers.push(
      { provider: "ipqualityscore", lookup: async () => assessment("ipqualityscore", "safe") },
      { provider: "seon", lookup: async () => { throw new Error("offline"); } }
    );
    const result = await assessPhoneReputation("+212612345678");
    expect(result.verdict).toBe("unknown");
    expect(result.coverage).toBe("partial");
  });

  it("preserves an explicit malicious provider signal", async () => {
    mocks.providers.push(
      { provider: "ipqualityscore", lookup: async () => assessment("ipqualityscore", "malicious") },
      { provider: "seon", lookup: async () => { throw new Error("offline"); } }
    );
    const result = await assessPhoneReputation("+212612345678");
    expect(result.verdict).toBe("malicious");
  });

  it("returns unknown if all providers are unavailable", async () => {
    mocks.providers.push(
      { provider: "ipqualityscore", lookup: async () => { throw new Error("offline"); } },
      { provider: "seon", lookup: async () => { throw new Error("offline"); } }
    );
    const result = await assessPhoneReputation("+212612345678");
    expect(result.verdict).toBe("unknown");
    expect(result.coverage).toBe("none");
  });
});
