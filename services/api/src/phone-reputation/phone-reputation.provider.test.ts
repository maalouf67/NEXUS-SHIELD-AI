import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IpQualityScorePhoneReputationProvider,
  SeonPhoneReputationProvider,
  PhoneReputationProviderError
} from "./phone-reputation.provider.js";

const PHONE = "+212612345678";
const ORIGINAL = {
  ipqs: process.env.IPQS_API_KEY,
  strictness: process.env.IPQS_PHONE_STRICTNESS,
  seon: process.env.SEON_API_KEY,
  seonUrl: process.env.SEON_PHONE_API_URL
};

function mockFetcher(payload: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" }
  }));
}
function seonPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      id: "seon-test-id",
      risk_scores: { global_network_score: 20 },
      seon_fraud_history: { fraudulent_decline_hits: 0, flags: [] },
      provider_carrier_details: {
        phone_is_valid: true, disposable: false, carrier: "Test Carrier",
        country: "MA", type: "MOBILE"
      },
      ...overrides
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL.ipqs === undefined) delete process.env.IPQS_API_KEY;
  else process.env.IPQS_API_KEY = ORIGINAL.ipqs;
  if (ORIGINAL.strictness === undefined) delete process.env.IPQS_PHONE_STRICTNESS;
  else process.env.IPQS_PHONE_STRICTNESS = ORIGINAL.strictness;
  if (ORIGINAL.seon === undefined) delete process.env.SEON_API_KEY;
  else process.env.SEON_API_KEY = ORIGINAL.seon;
  if (ORIGINAL.seonUrl === undefined) delete process.env.SEON_PHONE_API_URL;
  else process.env.SEON_PHONE_API_URL = ORIGINAL.seonUrl;
});

describe("IPQualityScore phone adapter", () => {
  it("maps explicit spammer signal to malicious", async () => {
    process.env.IPQS_API_KEY = "fixture-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true, valid: true, fraud_score: 92,
      spammer: true, risky: true, recent_abuse: true, country: "MA"
    }));
    expect((await provider.lookup(PHONE)).verdict).toBe("malicious");
  });

  it("maps elevated score to suspicious", async () => {
    process.env.IPQS_API_KEY = "fixture-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true, valid: true, fraud_score: 76,
      spammer: false, risky: false, recent_abuse: false
    }));
    expect((await provider.lookup(PHONE)).verdict).toBe("suspicious");
  });

  it("returns safe only when all required low-risk fields are explicit", async () => {
    process.env.IPQS_API_KEY = "fixture-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true, valid: true, fraud_score: 10,
      spammer: false, risky: false, recent_abuse: false
    }));
    expect((await provider.lookup(PHONE)).verdict).toBe("safe");
  });

  it("keeps incomplete fields unknown and sends MA for +212", async () => {
    process.env.IPQS_API_KEY = "fixture-key";
    const fetcher = mockFetcher({ success: true, valid: true, fraud_score: 10, spammer: false });
    const provider = new IpQualityScorePhoneReputationProvider(fetcher);
    expect((await provider.lookup(PHONE)).verdict).toBe("unknown");
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("country[]")).toBe("MA");
    expect(url.searchParams.get("strictness")).toBe("0");
  });

  it("fails closed when the API key is absent", async () => {
    delete process.env.IPQS_API_KEY;
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({ success: true }));
    await expect(provider.lookup(PHONE)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

describe("SEON Phone API adapter", () => {
  it("sends POST with the server-side X-API-KEY header and international digits", async () => {
    process.env.SEON_API_KEY = "fixture-seon-key";
    const fetcher = mockFetcher(seonPayload());
    const provider = new SeonPhoneReputationProvider(fetcher);
    const result = await provider.lookup(PHONE);
    expect(result.verdict).toBe("safe");
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.seon.io/SeonRestService/phone-api/v2");
    expect(new Headers(init?.headers).get("X-API-KEY")).toBe("fixture-seon-key");
    expect(JSON.parse(String(init?.body))).toEqual({ phone: "212612345678" });
  });

  it("maps network scores above 80 to suspicious", async () => {
    process.env.SEON_API_KEY = "fixture-seon-key";
    const provider = new SeonPhoneReputationProvider(mockFetcher(seonPayload({
      risk_scores: { global_network_score: 86 }
    })));
    expect((await provider.lookup(PHONE)).verdict).toBe("suspicious");
  });

  it("maps fraud-history hits and disposable numbers to suspicious", async () => {
    process.env.SEON_API_KEY = "fixture-seon-key";
    const withHits = new SeonPhoneReputationProvider(mockFetcher(seonPayload({
      seon_fraud_history: { fraudulent_decline_hits: 1, flags: [] }
    })));
    const disposable = new SeonPhoneReputationProvider(mockFetcher(seonPayload({
      provider_carrier_details: { phone_is_valid: true, disposable: true }
    })));
    expect((await withHits.lookup(PHONE)).verdict).toBe("suspicious");
    expect((await disposable.lookup(PHONE)).verdict).toBe("suspicious");
  });

  it("keeps missing signals unknown", async () => {
    process.env.SEON_API_KEY = "fixture-seon-key";
    const provider = new SeonPhoneReputationProvider(mockFetcher({
      success: true, data: { risk_scores: { global_network_score: 10 } }
    }));
    expect((await provider.lookup(PHONE)).verdict).toBe("unknown");
  });

  it("fails closed if SEON key is missing or endpoint is not allow-listed", async () => {
    delete process.env.SEON_API_KEY;
    const missing = new SeonPhoneReputationProvider(mockFetcher(seonPayload()));
    await expect(missing.lookup(PHONE)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });

    process.env.SEON_API_KEY = "fixture-seon-key";
    process.env.SEON_PHONE_API_URL = "https://example.com/collect";
    const unsafe = new SeonPhoneReputationProvider(mockFetcher(seonPayload()));
    await expect(unsafe.lookup(PHONE)).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("maps provider rate limits and timeouts", async () => {
    process.env.SEON_API_KEY = "fixture-seon-key";
    const limited = new SeonPhoneReputationProvider(mockFetcher({}, 429));
    await expect(limited.lookup(PHONE)).rejects.toBeInstanceOf(PhoneReputationProviderError);
    const timeout = vi.fn<typeof fetch>().mockRejectedValue(
      Object.assign(new Error("timeout"), { name: "TimeoutError" })
    );
    const provider = new SeonPhoneReputationProvider(timeout);
    await expect(provider.lookup(PHONE)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
