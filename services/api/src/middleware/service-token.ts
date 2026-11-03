import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requireServiceToken(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.NEXUS_SERVICE_API_TOKEN;

  if (!expectedToken || expectedToken.length < 32) {
    return res.status(503).json({
      error: 'SERVICE_AUTH_NOT_CONFIGURED',
      message: 'This internal endpoint is disabled until a strong service token is configured.'
    });
  }

  const authorization = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const providedToken = match?.[1]?.trim();

  if (!providedToken) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const expectedDigest = createHash('sha256').update(expectedToken, 'utf8').digest();
  const providedDigest = createHash('sha256').update(providedToken, 'utf8').digest();

  if (!timingSafeEqual(expectedDigest, providedDigest)) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  return next();
}
