import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({
  checkDatabaseConnection: vi.fn()
}));

import { checkDatabaseConnection } from "../db/pool.js";
import { healthRouter } from "./health.js";

const SECRET = "nexus-health-test-secret-at-least-thirty-two-characters";
const ORIGINAL = {
  jwt: process.env.JWT_SECRET,
  ipqs: process.env.IPQS_API_KEY,
  seon: process.env.SEON_API_KEY
};

function token() {
  return jwt.sign({ email: "analyst@example.test", role: "analyst" }, SECRET, {
    algorithm: "HS256",
    subject: "550e8400-e29b-41d4-a716-446655440000",
    issuer: "nexus-shield-ai",
    audience: "nexus-shield-ai-api",
    expiresIn: "15m"
  });
}
function appForHealth() {
  const app = express();
  app.use("/health", healthRouter);
  return app;
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  delete process.env.IPQS_API_KEY;
  delete process.env.SEON_API_KEY;
  vi.mocked(checkDatabaseConnection).mockReset();
});
afterEach(() => {
  if (ORIGINAL.jwt === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL.jwt;
  if (ORIGINAL.ipqs === undefined) delete process.env.IPQS_API_KEY;
  else process.env.IPQS_API_KEY = ORIGINAL.ipqs;
  if (ORIGINAL.seon === undefined) delete process.env.SEON_API_KEY;
  else process.env.SEON_API_KEY = ORIGINAL.seon;
});

describe("API readiness", () => {
  it("requires authentication before revealing dependency readiness", async () => {
    const response = await request(appForHealth()).get("/health/ready");
    expect(response.status).toBe(401);
    expect(checkDatabaseConnection).not.toHaveBeenCalled();
  });

  it("checks PostgreSQL and reports provider key presence without exposing secrets", async () => {
    process.env.IPQS_API_KEY = "configured-ipqs-secret";
    process.env.SEON_API_KEY = "configured-seon-secret";
    vi.mocked(checkDatabaseConnection).mockResolvedValue({ connected_at: new Date() } as never);

    const response = await request(appForHealth()).get("/health/ready")
      .set("Authorization", "Bearer " + token());

    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.dependencies.database).toBe("ok");
    expect(response.body.dependencies.phone_provider_credentials).toEqual({
      ipqualityscore: true,
      seon: true
    });
    expect(JSON.stringify(response.body)).not.toContain("configured-ipqs-secret");
    expect(JSON.stringify(response.body)).not.toContain("configured-seon-secret");
  });

  it("returns 503 when PostgreSQL cannot be reached", async () => {
    vi.mocked(checkDatabaseConnection).mockRejectedValue(new Error("database unavailable"));

    const response = await request(appForHealth()).get("/health/ready")
      .set("Authorization", "Bearer " + token());

    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
    expect(response.body.dependencies.database).toBe("unavailable");
  });
});
