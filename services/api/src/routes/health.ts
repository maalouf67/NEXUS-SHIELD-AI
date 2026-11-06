import { Router } from "express";
import rateLimit from "express-rate-limit";
import { checkDatabaseConnection } from "../db/pool.js";
import { requireAuth } from "../auth/auth.middleware.js";

export const healthRouter = Router();

const readyRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// Liveness only: confirms that the Express process can answer HTTP.
healthRouter.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    service: "nexus-shield-api",
    ok: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

// Readiness: verifies the API can reach PostgreSQL. Provider flags report
// credential configuration only; they are not live provider connectivity tests.
healthRouter.get("/ready", readyRouteLimiter, requireAuth, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  let database: "ok" | "unavailable" = "unavailable";
  try {
    await checkDatabaseConnection();
    database = "ok";
  } catch {
    database = "unavailable";
  }

  const dependencies = {
    database,
    phone_provider_credentials: {
      ipqualityscore: Boolean(process.env.IPQS_API_KEY?.trim()),
      seon: Boolean(process.env.SEON_API_KEY?.trim())
    },
    ip_reputation_provider_credentials: {
      abuseipdb: Boolean(process.env.ABUSEIPDB_API_KEY?.trim())
    },
    event_ingestion: {
      configured: Boolean(process.env.NEXUS_EVENT_INGESTION_TOKEN?.trim())
    }
  };
  const ready = database === "ok";
  return res.status(ready ? 200 : 503).json({
    service: "nexus-shield-api",
    ready,
    timestamp: new Date().toISOString(),
    dependencies
  });
});
