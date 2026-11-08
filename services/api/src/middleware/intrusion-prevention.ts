import { createHmac } from 'node:crypto';
import type { SecurityEventInput } from '../security-events/security-event.repository.js';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

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
  onLimit?: (request: Request) => void | Promise<void>;
  useSharedStore?: boolean;
}

export interface ProtectionEventOptions {
  eventType: string;
  summary: string;
  windowMs: number;
  limit: number;
  responseAction: string;
  severity?: SecurityEventSeverity;
  attributes?: Record<string, string>;
}

/** Build a privacy-preserving event with a stable per-source/type/window key. */
export function createProtectionEvent(request: Request, options: ProtectionEventOptions): SecurityEventInput {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('PROTECTION_EVENT_SECRET_NOT_CONFIGURED');
  const now = Date.now();
  const rawSourceIp = request.ip || 'unknown';
  const sourceIp = rawSourceIp === 'unknown' ? rawSourceIp : ipKeyGenerator(rawSourceIp);
  const fingerprint = createHmac('sha256', secret).update(sourceIp).digest('hex');
  // Use the exact trigger timestamp, not an epoch-aligned bucket: limiter
  // windows start on first activity and may cross fixed clock-window borders.
  const eventId = createHmac('sha256', secret).update(`${options.eventType}:${fingerprint}:${now}`).digest('hex');
  return {
    source: 'nexus-ips',
    externalEventId: `${options.eventType}:${eventId}`,
    eventType: options.eventType,
    severity: options.severity ?? 'high',
    observedAt: new Date(now).toISOString(),
    summary: options.summary,
    attributes: {
      source_ip_fingerprint: fingerprint.slice(0, 24),
      window_seconds: String(Math.floor(options.windowMs / 1000)),
      configured_limit: String(options.limit),
      response_action: options.responseAction,
      ...(options.attributes ?? {})
    }
  };
}

/** Persist the SOC event and propagate errors rather than silently dropping it. */
export async function recordProtectionEvent(request: Request, options: ProtectionEventOptions): Promise<void> {
  await securityEventRepository.ingestSystemBatch([createProtectionEvent(request, options)]);
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
    handler: async (request, response) => {
      try {
        if (options.onLimit) {
          await options.onLimit(request);
        } else {
          await recordProtectionEvent(request, {
            eventType: 'login-rate-limit-triggered',
            summary: 'Repeated failed login requests exceeded the configured source-network threshold.',
            windowMs,
            limit,
            responseAction: 'rate_limited',
            severity: 'high',
            attributes: { http_method: request.method }
          });
        }
      } catch {
        console.error('[nexus-ips] Failed to persist the login rate-limit SOC event.');
      }

      response.status(429).json({
        error: 'LOGIN_RATE_LIMITED',
        message: 'Repeated login failures triggered temporary source-network protection. Try again later.'
      });
    }

  });
}

export const loginAttemptLimiter = createLoginAttemptLimiter();
