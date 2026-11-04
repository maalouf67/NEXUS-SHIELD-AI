import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { PostgresRateLimitStore } from "../middleware/postgres-rate-limit-store.js";
import { assessPhoneReputation, type PhoneReputationResponse } from "./phone-reputation.orchestrator.js";

const RequestSchema = z.object({
  phone: z.string().trim().regex(/^\\+[1-9]\\d{7,14}$/, "Use international E.164 format."),
  consent: z.literal(true)
}).strict();

type Assessor = (phoneE164: string) => Promise<PhoneReputationResponse>;

const sharedStoreOptions = (prefix: string) => process.env.NODE_ENV === "test"
  ? {}
  : { store: new PostgresRateLimitStore(prefix) };

const phoneAccountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  passOnStoreError: false,
  ...sharedStoreOptions("phone-account"),
  keyGenerator: (req) => req.authUser?.id ?? "unauthenticated",
  message: {
    error: "PHONE_REPUTATION_ACCOUNT_RATE_LIMITED",
    message: "Five phone reputation lookups are allowed per account every 15 minutes."
  }
});

const phoneIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  passOnStoreError: false,
  ...sharedStoreOptions("phone-ip"),
  message: {
    error: "PHONE_REPUTATION_IP_RATE_LIMITED",
    message: "Too many phone reputation requests from this network. Try again later."
  }
});

export function createPhoneReputationRouter(assessor: Assessor = assessPhoneReputation) {
  const router = Router();

  router.post(
    "/phone-reputation/check",
    requireAuth,
    requireRole("admin", "analyst"),
    phoneAccountRateLimit,
    phoneIpRateLimit,
    async (req, res) => {
      const parsed = RequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "INVALID_PHONE_REPUTATION_REQUEST",
          message: "Enter an international number in E.164 format and confirm consent to send it to the configured providers."
        });
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      try {
        const result = await assessor(parsed.data.phone);
        return res.status(200).json(result);
      } catch {
        // Never log the submitted phone number or upstream response.
        return res.status(503).json({
          error: "PHONE_REPUTATION_UNAVAILABLE",
          message: "The phone reputation assessment could not be completed."
        });
      }
    }
  );

  return router;
}

export const phoneReputationRouter = createPhoneReputationRouter();
