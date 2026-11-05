import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, type ClientRateLimitInfo, type IncrementResponse } from 'express-rate-limit';

import { PostgresRateLimitStore } from './postgres-rate-limit-store.js';
import { recordProtectionEvent } from './intrusion-prevention.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUSPICIOUS_RESPONSES = 40;
const SUSPICIOUS_RESPONSE_STATUSES = new Set([401, 403, 404, 405]);

export interface ApiAnomalyCounterStore {
  get(key: string): Promise<ClientRateLimitInfo | undefined>;
  increment(key: string): Promise<IncrementResponse>;
}

export interface ApiAnomalyGuardOptions {
  windowMs?: number;
  threshold?: number;
  store?: ApiAnomalyCounterStore;
  onContainment?: (request: Request, hits: number) => void;
}

/**
 * Application-layer containment for repeated unauthorized, forbidden,
 * not-found and unsupported-method responses. The shared counter stores only
 * a keyed HMAC of the source IP in PostgreSQL.
 *
 * This does not block TCP/UDP packets or replace an edge firewall/WAF.
 */
export function createApiAnomalyGuard(
  options: ApiAnomalyGuardOptions = {}
): RequestHandler {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const threshold = options.threshold ?? MAX_SUSPICIOUS_RESPONSES;

  if (!Number.isInteger(windowMs) || windowMs < 1_000) {
    throw new Error('Invalid API anomaly window.');
  }
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error('Invalid API anomaly threshold.');
  }

  const store: ApiAnomalyCounterStore = options.store
    ?? new PostgresRateLimitStore('api-anomaly-ip', windowMs);

  const onContainment = options.onContainment ?? ((request: Request) => {
    recordProtectionEvent(request, {
      eventType: 'api-anomaly-containment-triggered',
      summary: 'Repeated unauthorized, forbidden, missing-route or unsupported-method responses triggered temporary API source containment.',
      windowMs,
      limit: threshold,
      responseAction: 'temporary_api_quarantine',
      severity: 'medium'
    });
  });

  return (request, response, next) => {
    const sourceKey = request.ip ? ipKeyGenerator(request.ip) : 'unknown';

    void store.get(sourceKey).then((counter) => {
      if (counter && counter.totalHits >= threshold) {
        const resetAt = counter.resetTime?.getTime() ?? (Date.now() + windowMs);
        const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

        response.setHeader('Retry-After', String(retryAfterSeconds));
        response.setHeader('Cache-Control', 'no-store');
        return response.status(429).json({
          error: 'SOURCE_TEMPORARILY_CONTAINED',
          message: 'Repeated suspicious API responses triggered temporary source protection. Retry after the supplied interval.'
        });
      }

      response.once('finish', () => {
        if (!SUSPICIOUS_RESPONSE_STATUSES.has(response.statusCode)) return;

        void store.increment(sourceKey).then((result) => {
          if (result.totalHits === threshold) {
            onContainment(request, result.totalHits);
          }
        }).catch(() => {
          // The next request fails closed if the shared protection store is unavailable.
        });
      });

      return next();
    }).catch(() => {
      response.setHeader('Retry-After', '5');
      response.setHeader('Cache-Control', 'no-store');
      return response.status(503).json({
        error: 'PROTECTION_STORE_UNAVAILABLE',
        message: 'The API protection service is temporarily unavailable.'
      });
    });
  };
}

export const apiAnomalyGuard = createApiAnomalyGuard();
