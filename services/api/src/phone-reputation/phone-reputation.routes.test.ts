import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPhoneReputationRouter } from "./phone-reputation.routes.js";
import { registerTestAuthSession } from "../auth/auth-session.repository.js";
import type { PhoneReputationResponse } from "./phone-reputation.orchestrator.js";

const SECRET = "nexus-phone-reputation-test-secret-at-least-32";
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const PHONE = "+212612345678";
const ORIGINAL_SECRET = process.env.JWT_SECRET;

const fixture: PhoneReputationResponse = {
  scanned_phone: PHONE,
  verdict: "unknown",
  coverage: "none",
  conflict: false,
  providers: [
    { provider: "ipqualityscore", status: "not_configured", verdict: null, request_id: null,
      signals: { fraud_score: null, network_score: null, number_valid: null, recent_abuse: null,
        risky: null, spammer: null, disposable: null, fraudulent_decline_hits: null,
        carrier: null, phone_type: null, country: null, flags_count: null },
      message: "Not configured" },
    { provider: "seon", status: "not_configured", verdict: null, request_id: null,
      signals: { fraud_score: null, network_score: null, number_valid: null, recent_abuse: null,
        risky: null, spammer: null, disposable: null, fraudulent_decline_hits: null,
        carrier: null, phone_type: null, country: null, flags_count: null },
      message: "Not configured" }
  ],
  disclaimer: "Test fixture only."
};

function token(role: "admin" | "analyst" | "viewer", subject = USER_ID) {
  const userId = subject;
  const email = role + "@example.test";
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: { id: userId, email, role }
  });
  return jwt.sign(
    { jti: sessionId },
    SECRET,
    {
      algorithm: 'HS256',
      subject: userId,
      issuer: authTokenConfig.issuer,
      audience: authTokenConfig.audience,
      expiresIn: '15m'
    }
  );
}
function appFor(assessor: (phone: string) => Promise<PhoneReputationResponse>) {
  const app = express();
  app.use(express.json());
  app.use("/api", createPhoneReputationRouter(assessor));
  return app;
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe("Phone reputation API boundary", () => {
  it("requires a valid access token", async () => {
    process.env.JWT_SECRET = SECRET;
    const assessor = vi.fn(async () => fixture);
    const response = await request(appFor(assessor)).post("/api/phone-reputation/check")
      .send({ phone: PHONE, consent: true });
    expect(response.status).toBe(401);
    expect(assessor).not.toHaveBeenCalled();
  });

  it("rejects viewers before calling either provider", async () => {
    process.env.JWT_SECRET = SECRET;
    const assessor = vi.fn(async () => fixture);
    const response = await request(appFor(assessor)).post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("viewer"))
      .send({ phone: PHONE, consent: true });
    expect(response.status).toBe(403);
    expect(assessor).not.toHaveBeenCalled();
  });

  it("requires explicit consent", async () => {
    process.env.JWT_SECRET = SECRET;
    const assessor = vi.fn(async () => fixture);
    const response = await request(appFor(assessor)).post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("analyst"))
      .send({ phone: PHONE, consent: false });
    expect(response.status).toBe(400);
    expect(assessor).not.toHaveBeenCalled();
  });

  it("rejects malformed numbers before contacting providers", async () => {
    process.env.JWT_SECRET = SECRET;
    const assessor = vi.fn(async () => fixture);
    const response = await request(appFor(assessor)).post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("admin"))
      .send({ phone: "0612345678", consent: true });
    expect(response.status).toBe(400);
    expect(assessor).not.toHaveBeenCalled();
  });

  it("returns both provider statuses without manufacturing a safe verdict", async () => {
    process.env.JWT_SECRET = SECRET;
    const assessor = vi.fn(async () => fixture);
    const response = await request(appFor(assessor)).post("/api/phone-reputation/check")
      .set("Authorization", "Bearer " + token("admin"))
      .send({ phone: PHONE, consent: true });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.verdict).toBe("unknown");
    expect(response.body.coverage).toBe("none");
    expect(assessor).toHaveBeenCalledWith(PHONE);
  });

  it("allows five lookups per account and blocks the sixth within 15 minutes", async () => {
    process.env.JWT_SECRET = SECRET;
    const subject = "550e8400-e29b-41d4-a716-446655440099";
    const assessor = vi.fn(async () => fixture);
    const app = appFor(assessor);
    const authorization = "Bearer " + token("analyst", subject);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post("/api/phone-reputation/check")
        .set("Authorization", authorization)
        .send({ phone: PHONE, consent: true });
      expect(response.status).toBe(200);
    }

    const blocked = await request(app).post("/api/phone-reputation/check")
      .set("Authorization", authorization)
      .send({ phone: PHONE, consent: true });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("PHONE_REPUTATION_ACCOUNT_RATE_LIMITED");
    expect(assessor).toHaveBeenCalledTimes(5);
  });
});
