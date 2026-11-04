import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IpQualityScorePhoneReputationProvider,
  PhoneReputationProviderError
} from "./phone-reputation.provider.js";

const ORIGINAL_KEY = process.env.IPQS_API_KEY;
const ORIGINAL_STRICTNESS = process.env.IPQS_PHONE_STRICTNESS;
const PHONE = "+212612345678";

function mockFetcher(payload: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.IPQS_API_KEY;
  else process.env.IPQS_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_STRICTNESS === undefined) delete process.env.IPQS_PHONE_STRICTNESS;
  else process.env.IPQS_PHONE_STRICTNESS = ORIGINAL_STRICTNESS;
});

describe("IPQualityScore phone reputation adapter", () => {
  it("maps an explicit spammer flag to malicious", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true,
      formatted: PHONE,
      valid: true,
      fraud_score: 93,
      spammer: true,
      risky: true,
      recent_abuse: true,
      carrier: "Test carrier",
      country: "MA",
      request_id: "request-test-1"
    }));

    const result = await provider.lookup(PHONE);
    expect(result.verdict).toBe("malicious");
    expect(result.provider).toBe("ipqualityscore");
    expect(result.carrier).toBe("Test carrier");
    expect(result.provider_request_id).toBe("request-test-1");
  });

  it("maps elevated scores and abuse indicators to suspicious, not malicious", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true,
      valid: true,
      fraud_score: 85,
      spammer: false,
      risky: false,
      recent_abuse: false
    }));

    expect((await provider.lookup(PHONE)).verdict).toBe("suspicious");
  });

  it("returns safe only when the provider supplies complete low-risk signals", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true,
      formatted: PHONE,
      valid: true,
      fraud_score: 18,
      spammer: false,
      risky: false,
      recent_abuse: false,
      active: true,
      country: "MA"
    }));

    const result = await provider.lookup(PHONE);
    expect(result.verdict).toBe("safe");
    expect(result.number_valid).toBe(true);
  });

  it("keeps missing reputation fields as unknown instead of guessing safe", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: true,
      valid: true,
      fraud_score: 12,
      spammer: false
    }));

    expect((await provider.lookup(PHONE)).verdict).toBe("unknown");
  });

  it("keeps a provider-declared invalid number as unknown", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({
      success: false,
      valid: false,
      fraud_score: 0,
      message: "Invalid/nonexistent phone number"
    }));

    expect((await provider.lookup(PHONE)).verdict).toBe("unknown");
  });

  it("requests international digits and explicitly supplies Morocco for +212", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const fetcher = mockFetcher({
      success: true,
      valid: true,
      fraud_score: 18,
      spammer: false,
      risky: false,
      recent_abuse: false
    });
    const provider = new IpQualityScorePhoneReputationProvider(fetcher);

    await provider.lookup(PHONE);

    const requestedUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toContain("/0612345678".replace("/0", "/212"));
    expect(requestedUrl.searchParams.get("country[]")).toBe("MA");
    expect(requestedUrl.searchParams.get("strictness")).toBe("0");
  });

  it("fails closed when no API key is configured", async () => {
    delete process.env.IPQS_API_KEY;
    const provider = new IpQualityScorePhoneReputationProvider(mockFetcher({ success: true }));

    await expect(provider.lookup(PHONE)).rejects.toMatchObject({
      code: "NOT_CONFIGURED"
    });
  });

  it("maps provider rate limiting and timeouts to typed errors", async () => {
    process.env.IPQS_API_KEY = "test-ipqs-key";
    const limited = new IpQualityScorePhoneReputationProvider(mockFetcher({}, 429));
    await expect(limited.lookup(PHONE)).rejects.toBeInstanceOf(PhoneReputationProviderError);

    const timeoutFetcher = vi.fn<typeof fetch>().mockRejectedValue(
      Object.assign(new Error("timed out"), { name: "TimeoutError" })
    );
    const timedOut = new IpQualityScorePhoneReputationProvider(timeoutFetcher);
    await expect(timedOut.lookup(PHONE)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});