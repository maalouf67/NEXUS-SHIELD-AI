import { createHmac } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { PostgresRateLimitStore } from './postgres-rate-limit-store.js';
import { securityEventRepository } from '../security-events/security-event.repository.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

export interface LoginAttemptLimiterOptions {
  windowMs?: number;
  limit?: number;
  onLimit?: (request: Request) => void;
}

function recordProtectionEvent(request: Request, windowMs: number, limit: number): void {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) return;

  const sourceIp = request.ip || 'unknown';
  const bucket = Math.floor(Date.now() / windowMs);
  const fingerprint = createHmac('sha256', secret)
    .update(sourceIp)
    .digest('hex');
  const eventId = createHmac('sha256', secret)
    .update(`login-rate-limit:${fingerprint}:${bucket}`)
    .digest('hex');

  // Persist a privacy-preserving signal for analyst review. The raw source IP
  // and submitted credentials are deliberately never stored in this event.
  void securityEventRepository.ingestBatch([{
    source: 'nexus-ips',
    externalEventId: `login-limit:${eventId}`,
    eventType: 'login-rate-limit-triggered',
    severity: 'high',
    observedAt: new Date().toISOString(),
    summary: 'Repeated failed login requests exceeded the configured source-network threshold.',
    attributes: {
      source_ip_fingerprint: fingerprint.slice(0, 24),
      window_seconds: String(Math.floor(windowMs / 1000)),
      configured_limit: String(limit),
      response_action: 'rate_limited'
    }
  }]).catch(() => {
    // Prevention remains active if telemetry storage is unavailable.
  });
}

export function createLoginAttemptLimiter(
  options: LoginAttemptLimiterOptions = {}
): RequestHandler {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const limit = options.limit ?? MAX_FAILED_ATTEMPTS;
  const storeOptions = process.env.NODE_ENV === 'test'
    ? {}
    : { store: new PostgresRateLimitStore('auth-login-ip') };

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    skipSuccessfulRequests: true,
    ...storeOptions,
    handler: (request, response) => {
      (options.onLimit ?? (() => recordProtectionEvent(request, windowMs, limit)))(request);
      response.status(429).json({
        error: 'LOGIN_RATE_LIMITED',
        message: 'Repeated login failures triggered temporary source-network protection. Try again later.'
      });
    }
  });
}

export const loginAttemptLimiter = createLoginAttemptLimiter();
