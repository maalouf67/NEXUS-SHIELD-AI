import type { Request, Response, NextFunction } from 'express';

import { PrivacyConsentSchema } from '../privacy/privacy.dto.js';

export function requirePrivacyConsent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const consent = req.body?.consent;

  if (!consent) {
    return res.status(403).json({
      error: 'CONSENT_REQUIRED',
      message: 'Explicit consent is required before any privacy review can be processed.'
    });
  }

  const parsed = PrivacyConsentSchema.safeParse(consent);

  if (!parsed.success || !parsed.data.granted || !parsed.data.explicit) {
    return res.status(403).json({
      error: 'CONSENT_REQUIRED',
      message: 'Explicit user consent must be granted before submitting privacy data for review.',
      details: parsed.success ? undefined : parsed.error.flatten()
    });
  }

  req.body = {
    ...req.body,
    consent: parsed.data
  };

  return next();
}
