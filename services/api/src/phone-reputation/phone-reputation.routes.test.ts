import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createPhoneReputationRouter } from "./phone-reputation.routes.js";
import type { PhoneReputationProvider, PhoneReputationResult } from "./phone-reputation.provider.js";

const SECRET = "nexus-phone-reputation-test-secret-at-least-32";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const PHONE = "+212612345678";
const ORIGINAL_SECRET = process.env.JWT_SECRET;

const result: PhoneReputationResult = {
  provider: "ipqualityscore",
  verdict: "suspicious",
  scanned_phone: PHONE,
  fraud_score: 81,
  number_valid: true,
  recent_abuse: false,
  risky: true,
  spammer: false,
  active: null,
  carrier: null,
  phone_type: "Mobile",
  country: "MA",
  region: null,
  location: null,
  provider_request_id: "test-request",
  message: "Provider assessment for tests only."
};

function token(role: "admin" | "analyst" | "viewer") {
  return jwt.sign(
    { email: role + "@example.test", role },
    SECRET,
    {
      algorithm: "HS256",
      subject: USER_ID,
      issuer: "nexus-shield-ai",
      audience: "nexus-shield-ai-api",
      expiresIn: "15m"
    }
  );
}

function appFor(provider: PhoneReputationProvider) {
  const app = express();
  app.use(express.json());
  app.use("/api", createPhoneReputationRouter(provider));
  return app;
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe("Phone reputation API boundary", () => {
  it("requires authentication", async () => {
    process.env.JWT_SECRET = SECRET;
    const provider = { lookup: async () => result };
    const response = await request(appFor(provider)).post("/api/phone-reputation/check").send({ phone: PHONE });
    expect(response.status).toBe(401);
  });

  it("blocks read-only viewer accounts", async () => {
    process.env.JWT_SECRET = SECRET;
    const provider = { lookup: async () => result };
    const response = await request(appFor(provider))
      .post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("viewer"))
      .send({ phone: PHONE });
    expect(response.status).toBe(403);
  });

  it("accepts admin and analyst lookups and returns the provider result", async () => {
    process.env.JWT_SECRET = SECRET;
    const provider: PhoneReputationProvider = { lookup: async () => result };
    const response = await request(appFor(provider))
      .post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("analyst"))
      .send({ phone: PHONE });

    expect(response.status).toBe(200);
    expect(response.body.verdict).toBe("suspicious");
    expect(response.body.provider).toBe("ipqualityscore");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects non-E.164 numbers before contacting the provider", async () => {
    process.env.JWT_SECRET = SECRET;
    let calls = 0;
    const provider = { lookup: async () => { calls += 1; return result; } };
    const response = await request(appFor(provider))
      .post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("admin"))
      .send({ phone: "0612345678" });

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("reports provider failure without creating a false verdict", async () => {
    process.env.JWT_SECRET = SECRET;
    const provider: PhoneReputationProvider = {
      lookup: async () => { throw new Error("provider unavailable"); }
    };
    const response = await request(appFor(provider))
      .post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("admin"))
      .send({ phone: PHONE });

    expect(response.status).toBe(502);
    expect(response.body.verdict).toBeUndefined();
  });
});