import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { assessPhoneReputation } from "./phone-reputation.orchestrator.js";

const RequestSchema = z.object({
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use international E.164 format."),
  consent: z.literal(true)
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

export const phoneReputationRouter = Router();

phoneReputationRouter.post(
  "/phone-reputation/check",
  requireAuth,
  requireRole("admin", "analyst"),
  phoneLookupRateLimit,
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
      const result = await assessPhoneReputation(parsed.data.phone);
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
