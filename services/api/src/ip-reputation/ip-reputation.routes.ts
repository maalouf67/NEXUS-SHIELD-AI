import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { PostgresRateLimitStore } from "../middleware/postgres-rate-limit-store.js";
import { abuseIpDbProvider, IpReputationProviderError, normalizePublicIp } from "./ip-reputation.provider.js";

const RequestSchema = z.object({
  ip: z.string().trim().min(2).max(45),
  consent: z.literal(true)
}).strict();

const sharedStoreOptions = (scope: string) => process.env.NODE_ENV === "test"
  ? {}
  : { store: new PostgresRateLimitStore(scope) };

const accountLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  passOnStoreError: false,
  ...sharedStoreOptions("ip-intel-account"),
  keyGenerator: (req) => req.authUser?.id ?? "unauthenticated",
  message: {
    error: "IP_REPUTATION_ACCOUNT_RATE_LIMITED",
    message: "Ten IP reputation lookups are allowed per account every 15 minutes."
  }
});

const sourceIpLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  passOnStoreError: false,
  ...sharedStoreOptions("ip-intel-source-ip"),
  message: {
    error: "IP_REPUTATION_SOURCE_RATE_LIMITED",
    message: "Too many IP reputation requests from this network. Try again later."
  }
});

// The default Standard AbuseIPDB plan allows 1,000 check requests/day.
// Reserve headroom for operational diagnostics and configure this below the account quota.
const dailyLimit = Number(process.env.ABUSEIPDB_DAILY_LIMIT ?? "850");
const providerDailyLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number.isInteger(dailyLimit) && dailyLimit > 0 && dailyLimit <= 50000 ? dailyLimit : 850,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  passOnStoreError: false,
  ...sharedStoreOptions("abuseipdb-provider-daily"),
  keyGenerator: () => "abuseipdb-global-provider-key",
  message: {
    error: "ABUSEIPDB_DAILY_BUDGET_EXHAUSTED",
    message: "The configured daily AbuseIPDB request budget has been reached."
  }
});

export const ipReputationRouter = Router();

ipReputationRouter.post(
  "/ip-reputation/check",
  requireAuth,
  requireRole("admin", "analyst"),
  accountLimit,
  sourceIpLimit,
  providerDailyLimit,
  async (req, res) => {
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_IP_REPUTATION_REQUEST",
        message: "Enter a public IPv4 or IPv6 address and confirm consent to send it to AbuseIPDB."
      });
    }

    const publicIp = normalizePublicIp(parsed.data.ip);
    if (!publicIp) {
      return res.status(400).json({
        error: "PUBLIC_IP_REQUIRED",
        message: "Only globally routable public IPv4 or IPv6 addresses can be checked."
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    try {
      const assessment = await abuseIpDbProvider.lookup(publicIp);
      return res.status(200).json({
        ...assessment,
        disclaimer: "Community reports and confidence scores can be incomplete, stale or affected by shared hosting, VPNs and address reassignment. This result does not identify a person or prove that a particular device is compromised."
      });
    } catch (error) {
      if (error instanceof IpReputationProviderError) {
        const status = error.code === "NOT_CONFIGURED" ? 503 :
          error.code === "TIMEOUT" ? 504 :
          error.code === "RATE_LIMITED" ? 503 : 502;
        return res.status(status).json({
          error: "IP_REPUTATION_PROVIDER_UNAVAILABLE",
          provider_status: error.code.toLowerCase(),
          message: "AbuseIPDB could not complete this reputation check. No verdict was created."
        });
      }
      return res.status(502).json({
        error: "IP_REPUTATION_PROVIDER_UNAVAILABLE",
        message: "AbuseIPDB could not complete this reputation check. No verdict was created."
      });
    }
  }
);
