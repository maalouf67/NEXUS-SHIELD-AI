import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/auth.middleware.js';
import { privacyProviderRegistry, type PrivacyProviderRegistry } from './privacy-provider.registry.js';

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};

export function createPrivacyProvidersRouter(
  registry: PrivacyProviderRegistry = privacyProviderRegistry
) {
  const router = Router();
  router.use(noStore);

  // This endpoint describes configured capabilities only. It never starts a
  // scan, accepts a profile, or sends personal data to an external provider.
  router.get('/privacy/providers', requireAuth, (_req, res) => {
    return res.status(200).json(registry.list());
  });

  return router;
}

export const privacyProvidersRouter = createPrivacyProvidersRouter();
