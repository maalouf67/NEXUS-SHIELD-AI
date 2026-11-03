import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requireEventIngestionToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expectedToken = process.env.NEXUS_EVENT_INGESTION_TOKEN;

  if (!expectedToken || expectedToken.length < 32) {
    return res.status(503).json({
      error: 'EVENT_INGESTION_NOT_CONFIGURED',
      message: 'Inbound event ingestion is disabled until a dedicated integration token is configured.'
    });
  }

  const providedToken = req.header('x-nexus-ingestion-token')?.trim();
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
