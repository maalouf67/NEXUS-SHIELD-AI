import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AbuseIpDbProvider,
  normalizePublicIp
} from "./ip-reputation.provider.js";

const ORIGINAL_KEY = process.env.ABUSEIPDB_API_KEY;
const ORIGINAL_AGE = process.env.ABUSEIPDB_MAX_AGE_DAYS;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ABUSEIPDB_API_KEY;
  else process.env.ABUSEIPDB_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_AGE === undefined) delete process.env.ABUSEIPDB_MAX_AGE_DAYS;
  else process.env.ABUSEIPDB_MAX_AGE_DAYS = ORIGINAL_AGE;
});

function fakeResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("public IP validation", () => {
  it.each([
    "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1",
    "169.254.1.1", "224.0.0.1", "::1", "fe80::1", "fc00::1",
    "ff02::1", "not-an-ip"
  ])("rejects non-public or invalid address %s", (ip) => {
    expect(normalizePublicIp(ip)).toBeNull();
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts globally routable address %s",
    (ip) => expect(normalizePublicIp(ip)).not.toBeNull()
  );
});

describe("AbuseIPDB adapter", () => {
  it("uses HTTPS, the Key header and bounded report age", async () => {
    process.env.ABUSEIPDB_API_KEY = "fixture-secret";
    process.env.ABUSEIPDB_MAX_AGE_DAYS = "90";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(fakeResponse({
      ipAddress: "8.8.8.8",
      abuseConfidenceScore: 0,
      totalReports: 0,
      countryCode: "US",
      isWhitelisted: true
    }));
    const provider = new AbuseIpDbProvider(fetcher);
    const result = await provider.lookup("8.8.8.8");
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://api.abuseipdb.com/api/v2/check");
    expect(new URL(String(url)).searchParams.get("maxAgeInDays")).toBe("90");
    expect(new Headers(init?.headers).get("Key")).toBe("fixture-secret");
    expect(result.verdict).toBe("safe");
    expect(result.total_reports).toBe(0);
    expect(result.message).not.toContain("fixture-secret");
  });

  it("requires corroboration before returning malicious", async () => {
    process.env.ABUSEIPDB_API_KEY = "fixture-secret";
    const suspicious = new AbuseIpDbProvider(vi.fn<typeof fetch>().mockResolvedValue(
      fakeResponse({ abuseConfidenceScore: 95, totalReports: 2 })
    ));
    const malicious = new AbuseIpDbProvider(vi.fn<typeof fetch>().mockResolvedValue(
      fakeResponse({ abuseConfidenceScore: 95, totalReports: 8 })
    ));
    expect((await suspicious.lookup("8.8.8.8")).verdict).toBe("suspicious");
    expect((await malicious.lookup("8.8.8.8")).verdict).toBe("malicious");
  });

  it("returns unknown for incomplete provider signals", async () => {
    process.env.ABUSEIPDB_API_KEY = "fixture-secret";
    const provider = new AbuseIpDbProvider(vi.fn<typeof fetch>().mockResolvedValue(
      fakeResponse({ abuseConfidenceScore: 0 })
    ));
    expect((await provider.lookup("8.8.8.8")).verdict).toBe("unknown");
  });

  it("fails closed on missing key and provider throttling", async () => {
    delete process.env.ABUSEIPDB_API_KEY;
    const noKey = new AbuseIpDbProvider(vi.fn<typeof fetch>());
    await expect(noKey.lookup("8.8.8.8")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });

    process.env.ABUSEIPDB_API_KEY = "fixture-secret";
    const limited = new AbuseIpDbProvider(vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", { status: 429 })
    ));
    await expect(limited.lookup("8.8.8.8")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
