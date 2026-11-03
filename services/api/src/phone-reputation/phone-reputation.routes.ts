import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const PhoneReputationRequestSchema = z.object({
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use E.164 format, e.g. +2126XXXXXXXX.')
}).strict();

export function createPhoneReputationRouter() {
  const router = Router();

  // The provider adapter is intentionally not simulated. Until an authorized
  // reputation API endpoint and server-side credentials are configured, fail closed.
  router.post(
    '/phone-reputation/check',
    requireAuth,
    requireRole('admin', 'analyst'),
    (req, res) => {
      const parsed = PhoneReputationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_PHONE_FORMAT',
          message: 'Enter a valid international phone number in E.164 format.'
        });
      }

      if (!process.env.NEXUS_PHONE_REPUTATION_PROVIDER) {
        return res.status(503).json({
          error: 'PHONE_REPUTATION_PROVIDER_NOT_CONFIGURED',
          message: 'Phone reputation checks are not active yet. Configure an authorized provider integration before scanning.'
        });
      }

      // Provider-specific request/response mapping must be implemented against
      // the provider's documented API contract. Never return a fabricated verdict.
      return res.status(503).json({
        error: 'PHONE_REPUTATION_PROVIDER_ADAPTER_PENDING',
        message: 'The provider is configured, but its verified API adapter is not implemented.'
      });
    }
  );

  return router;
}

export const phoneReputationRouter = createPhoneReputationRouter();
