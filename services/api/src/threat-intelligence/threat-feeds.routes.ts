import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../auth/auth.middleware.js';
import { PostgresRateLimitStore } from '../middleware/postgres-rate-limit-store.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';
import { ThreatFeedProviderError } from './abuseipdb-feed.provider.js';
import { threatFeedService } from './threat-feed.service.js';

const sharedProviderBudget = process.env.NODE_ENV === 'test'
  ? {}
  : { store: new PostgresRateLimitStore('abuseipdb-provider-daily') };

const providerDailyLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number.isInteger(Number(process.env.ABUSEIPDB_DAILY_LIMIT ?? '850'))
    ? Math.min(50000, Math.max(1, Number(process.env.ABUSEIPDB_DAILY_LIMIT ?? '850'))) : 850,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  passOnStoreError: false,
  ...sharedProviderBudget,
  keyGenerator: () => 'abuseipdb-global-provider-key',
  message: { error: 'ABUSEIPDB_DAILY_BUDGET_EXHAUSTED' }
});

export function createThreatFeedsRouter() {
  const router = Router();
  const requireWorkspace = createRequireWorkspace();

  router.get(
    '/threat-intelligence/feeds',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst', 'viewer'),
    async (req, res) => {
      try {
        const { pool } = await import('../db/pool.js');
        const result = await pool.query(
          `SELECT f.id, f.provider, f.enabled, f.confidence_minimum, f.freshness_window_hours,
                  f.last_generated_at, f.last_success_at, f.last_error_code,
                  (SELECT COUNT(*)::int FROM threat_feed_runs r
                    WHERE r.workspace_id = f.workspace_id AND r.feed_id = f.id) AS total_runs
             FROM threat_feeds f
            WHERE f.workspace_id = $1
            ORDER BY f.provider`,
          [req.workspaceContext!.id]
        );
        return res.status(200).json({ status: 'ok', feeds: result.rows });
      } catch {
        return res.status(503).json({ error: 'THREAT_FEEDS_UNAVAILABLE' });
      }
    }
  );

  router.post(
    '/threat-intelligence/feeds/abuseipdb/sync',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst'),
    providerDailyLimit,
    async (req, res) => {
      try {
        const result = await threatFeedService.syncAbuseIpDb(req.workspaceContext!.id);
        return res.status(200).json({ status: 'ok', sync: result });
      } catch (error) {
        const code = error instanceof ThreatFeedProviderError ? error.code : 'PERSISTENCE_ERROR';
        const status = code === 'NOT_CONFIGURED' ? 503 :
          code === 'TIMEOUT' ? 504 :
          code === 'RATE_LIMITED' ? 429 :
          code === 'INVALID_RESPONSE' ? 502 : 503;
        return res.status(status).json({
          error: 'THREAT_FEED_SYNC_FAILED',
          provider: 'abuseipdb',
          reason: code,
          message: code === 'NOT_CONFIGURED'
            ? 'AbuseIPDB is not configured on the API server. No feed request was sent.'
            : 'The threat feed could not be verified and persisted. No indicators or alerts were accepted.'
        });
      }
    }
  );
  return router;
}

export const threatFeedsRouter = createThreatFeedsRouter();
