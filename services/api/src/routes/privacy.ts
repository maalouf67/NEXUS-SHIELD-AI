import { Router } from 'express';

import { requirePrivacyConsent } from '../middleware/consent.js';
import { PrivacyScanRequestSchema } from '../privacy/privacy.dto.js';
import { PrivacyGuardService } from '../privacy/privacy.service.js';

export const privacyRouter = Router();
const privacyGuardService = new PrivacyGuardService();

privacyRouter.get('/privacy/status', (_req, res) => {
  res.json({
    service: 'nexus-privacy-guard',
    status: 'ready',
    external_scan: {
      provider: 'ajaxx-data-scrubber',
      status: 'not_available',
      is_available: false,
      message:
        'AJAXX Data Scrubber integration is not available in this build. No data was sent externally.'
    },
    no_external_data_transfer: true
  });
});

privacyRouter.post('/privacy/scan', requirePrivacyConsent, async (req, res) => {
  const parsed = PrivacyScanRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await privacyGuardService.evaluate(parsed.data);
    return res.status(200).json({
      status: 'ok',
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PRIVACY_GUARD_FAILED';

    if (message === 'CONSENT_REQUIRED') {
      return res.status(403).json({
        error: 'CONSENT_REQUIRED',
        message: 'Explicit consent is required before processing privacy-related data.'
      });
    }

    return res.status(500).json({
      error: 'PRIVACY_GUARD_FAILED',
      message: 'Privacy safeguard could not complete the request.'
    });
  }
});
