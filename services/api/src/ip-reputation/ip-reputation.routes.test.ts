import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { ipReputationRouter } from "./ip-reputation.routes.js";
import { authTokenConfig } from "../auth/auth.middleware.js";
import { registerTestAuthSession } from "../auth/auth-session.repository.js";

const SECRET = "nexus-ip-reputation-test-secret-at-least-32";
const USER = "550e8400-e29b-41d4-a716-446655440000";
const ORIGINAL = {
  jwt: process.env.JWT_SECRET,
  key: process.env.ABUSEIPDB_API_KEY
};

function token(role: "admin" | "analyst" | "viewer") {
  const userId = USER;
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

function appFor() {
  const app = express();
  app.use(express.json());
  app.use("/api", ipReputationRouter);
  return app;
}

afterEach(() => {
  if (ORIGINAL.jwt === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL.jwt;
  if (ORIGINAL.key === undefined) delete process.env.ABUSEIPDB_API_KEY;
  else process.env.ABUSEIPDB_API_KEY = ORIGINAL.key;
});

describe("IP reputation API boundary", () => {
  it("requires a valid session", async () => {
    process.env.JWT_SECRET = SECRET;
    const response = await request(appFor()).post("/api/ip-reputation/check")
      .send({ ip: "8.8.8.8", consent: true });
    expect(response.status).toBe(401);
  });

  it("rejects Viewer role before contacting the provider", async () => {
    process.env.JWT_SECRET = SECRET;
    process.env.ABUSEIPDB_API_KEY = "fixture-only";
    const response = await request(appFor()).post("/api/ip-reputation/check")
      .set("Authorization", "Bearer " + token("viewer"))
      .send({ ip: "8.8.8.8", consent: true });
    expect(response.status).toBe(403);
  });

  it("requires explicit consent", async () => {
    process.env.JWT_SECRET = SECRET;
    process.env.ABUSEIPDB_API_KEY = "fixture-only";
    const response = await request(appFor()).post("/api/ip-reputation/check")
      .set("Authorization", "Bearer " + token("analyst"))
      .send({ ip: "8.8.8.8", consent: false });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_IP_REPUTATION_REQUEST");
  });

  it("rejects private addresses before provider access", async () => {
    process.env.JWT_SECRET = SECRET;
    process.env.ABUSEIPDB_API_KEY = "fixture-only";
    const response = await request(appFor()).post("/api/ip-reputation/check")
      .set("Authorization", "Bearer " + token("admin"))
      .send({ ip: "192.168.1.10", consent: true });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("PUBLIC_IP_REQUIRED");
  });

  it("fails closed when the provider key is absent", async () => {
    process.env.JWT_SECRET = SECRET;
    delete process.env.ABUSEIPDB_API_KEY;
    const response = await request(appFor()).post("/api/ip-reputation/check")
      .set("Authorization", "Bearer " + token("analyst"))
      .send({ ip: "8.8.8.8", consent: true });
    expect(response.status).toBe(503);
    expect(response.body.provider_status).toBe("not_configured");
  });
});
