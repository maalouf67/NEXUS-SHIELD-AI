import { createHmac } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { PostgresRateLimitStore } from './postgres-rate-limit-store.js';
import {
  securityEventRepository,
  type SecurityEventSeverity
} from '../security-events/security-event.repository.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

export interface LoginAttemptLimiterOptions {
  windowMs?: number;
  limit?: number;
  onLimit?: (request: Request) => void;
  useSharedStore?: boolean;
}

export interface ProtectionEventOptions {
  eventType: string;
  summary: string;
  windowMs: number;
  limit: number;
  responseAction: string;
  severity?: SecurityEventSeverity;
}

/**
 * Persist a privacy-preserving security event.
 * Only a keyed HMAC fingerprint is stored; raw source IP and credentials are not.
 */
export function recordProtectionEvent(
  request: Request,
  options: ProtectionEventOptions
): void {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) return;

  const sourceIp = request.ip || 'unknown';
  const bucket = Math.floor(Date.now() / options.windowMs);
  const fingerprint = createHmac('sha256', secret)
    .update(sourceIp)
    .digest('hex');
  const eventId = createHmac('sha256', secret)
    .update(`${options.eventType}:${fingerprint}:${bucket}`)
    .digest('hex');

  void securityEventRepository.ingestBatch([{
    source: 'nexus-ips',
    externalEventId: `${options.eventType}:${eventId}`,
    eventType: options.eventType,
    severity: options.severity ?? 'high',
    observedAt: new Date().toISOString(),
    summary: options.summary,
    attributes: {
      source_ip_fingerprint: fingerprint.slice(0, 24),
      window_seconds: String(Math.floor(options.windowMs / 1000)),
      configured_limit: String(options.limit),
      response_action: options.responseAction
    }
  }]).catch(() => {
    // Protection remains active if event telemetry storage is unavailable.
  });
}

export function createLoginAttemptLimiter(
  options: LoginAttemptLimiterOptions = {}
): RequestHandler {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const limit = options.limit ?? MAX_FAILED_ATTEMPTS;
  const useSharedStore = options.useSharedStore ?? process.env.NODE_ENV !== 'test';
  const storeOptions = useSharedStore
    ? { store: new PostgresRateLimitStore('auth-login-ip') }
    : {};

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    skipSuccessfulRequests: true,
    ...storeOptions,
    handler: (request, response) => {
      (options.onLimit ?? (() => recordProtectionEvent(request, {
        eventType: 'login-rate-limit-triggered',
        summary: 'Repeated failed login requests exceeded the configured source-network threshold.',
        windowMs,
        limit,
        responseAction: 'rate_limited',
        severity: 'high'
      })))(request);
      response.status(429).json({
        error: 'LOGIN_RATE_LIMITED',
        message: 'Repeated login failures triggered temporary source-network protection. Try again later.'
      });
    }
  });
}

export const loginAttemptLimiter = createLoginAttemptLimiter();
