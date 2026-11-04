import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import {
  PhoneReputationProviderError,
  phoneReputationProvider,
  type PhoneReputationProvider
} from "./phone-reputation.provider.js";

const PhoneReputationRequestSchema = z.object({
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +2126XXXXXXXX.")
}).strict();

const phoneLookupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.authUser?.id ?? "unauthenticated",
  message: {
    error: "PHONE_REPUTATION_RATE_LIMITED",
    message: "Five phone reputation lookups are allowed per account every 15 minutes."
  }
});

export function createPhoneReputationRouter(
  provider: PhoneReputationProvider = phoneReputationProvider
) {
  const router = Router();

  router.post(
    "/phone-reputation/check",
    requireAuth,
    requireRole("admin", "analyst"),
    phoneLookupRateLimit,
    async (req, res) => {
      const parsed = PhoneReputationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "INVALID_PHONE_FORMAT",
          message: "Enter a valid international phone number in E.164 format."
        });
      }

      try {
        const result = await provider.lookup(parsed.data.phone);
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof PhoneReputationProviderError) {
          if (error.code === "NOT_CONFIGURED") {
            return res.status(503).json({
              error: "PHONE_REPUTATION_PROVIDER_NOT_CONFIGURED",
              message: "Set IPQS_API_KEY on the API server to enable live reputation checks."
            });
          }
          if (error.code === "TIMEOUT") {
            return res.status(504).json({
              error: "PHONE_REPUTATION_PROVIDER_TIMEOUT",
              message: "The phone reputation provider did not respond before the request timed out."
            });
          }
          if (error.code === "RATE_LIMITED") {
            res.setHeader("Retry-After", "60");
            return res.status(503).json({
              error: "PHONE_REPUTATION_PROVIDER_RATE_LIMITED",
              message: "The provider is temporarily rate-limiting requests. Try again later."
            });
          }
        }

        return res.status(502).json({
          error: "PHONE_REPUTATION_PROVIDER_ERROR",
          message: "The phone reputation provider returned an unavailable or invalid response."
        });
      }
    }
  );

  return router;
}

export const phoneReputationRouter = createPhoneReputationRouter();