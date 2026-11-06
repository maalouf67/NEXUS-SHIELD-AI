import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, type ClientRateLimitInfo, type IncrementResponse } from 'express-rate-limit';

import { PostgresRateLimitStore } from './postgres-rate-limit-store.js';
import { createProtectionEvent, recordProtectionEvent, type ProtectionEventOptions } from './intrusion-prevention.js';
import type { SecurityEventInput } from '../security-events/security-event.repository.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUSPICIOUS_RESPONSES = 40;
const SUSPICIOUS_RESPONSE_STATUSES = new Set([400, 401, 403, 404, 405, 413]);
const EXEMPT_LIVENESS_PATHS = new Set(['/health', '/api/health']);

export interface ApiAnomalyCounterStore {
  get(key: string): Promise<ClientRateLimitInfo | undefined>;
  increment(key: string): Promise<IncrementResponse>;
  incrementAndRecordEvent?(key: string, threshold: number, event: SecurityEventInput): Promise<IncrementResponse>;
}

export interface ApiAnomalyGuardOptions {
  windowMs?: number;
  threshold?: number;
  store?: ApiAnomalyCounterStore;
  onContainment?: (request: Request, hits: number, responseStatus: number) => void | Promise<void>;
}

/**
 * HTTP-listener containment for repeated malformed, unauthorized, forbidden,
 * not-found, unsupported-method and oversized-request responses. The shared counter stores only
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

  const eventOptions = (request: Request, responseStatus: number): ProtectionEventOptions => ({
    eventType: 'api-anomaly-containment-triggered',
    summary: 'Repeated malformed, oversized, unauthorized, forbidden, missing-route or unsupported-method requests triggered temporary API source containment.',
    windowMs,
    limit: threshold,
    responseAction: 'temporary_api_quarantine',
    severity: 'medium',
    attributes: {
      http_method: request.method.toUpperCase(),
      response_status: String(responseStatus),
      listener_scope: request.path === '/api' || request.path.startsWith('/api/') ? 'api' : 'non-api'
    }
  });

  const onContainment = options.onContainment ?? (
    (request: Request, hits: number, responseStatus: number) =>
      recordProtectionEvent(request, {
        ...eventOptions(request, responseStatus),
        attributes: { ...eventOptions(request, responseStatus).attributes, trigger_hits: String(hits) }
      })
  );

  return (request, response, next) => {
    // Keep the lightweight liveness probe reachable during source containment.
    // Readiness still checks its dependencies and reports their actual status.
    if (EXEMPT_LIVENESS_PATHS.has(request.path)) return next();

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
        const responseStatus = response.statusCode;

        // Production PostgreSQL commits the threshold counter and SOC event together.
        if (store.incrementAndRecordEvent) {
          try {
            const event = createProtectionEvent(request, eventOptions(request, responseStatus));
            void store.incrementAndRecordEvent(sourceKey, threshold, event).catch(() => {
              console.error('[nexus-ips] Failed to atomically persist the anomaly counter and SOC event.');
            });
            return;
          } catch {
            console.error('[nexus-ips] Could not prepare the anomaly SOC event; using the counter fallback.');
          }
        }

        void store.increment(sourceKey).then(async (result) => {
          if (result.totalHits === threshold) await onContainment(request, result.totalHits, responseStatus);
        }).catch(() => {
          console.error('[nexus-ips] Failed to persist a suspicious-response counter.');
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
