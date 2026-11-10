import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

import { PostgresRateLimitStore } from '../middleware/postgres-rate-limit-store.js';

export interface AgentPlatformRateLimiterOptions {
  windowMs?: number;
  limit?: number;
  useSharedStore?: boolean;
}

export function createAgentPlatformRateLimiter(
  options: AgentPlatformRateLimiterOptions = {}
): RequestHandler {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const limit = options.limit ?? 10;
  const useSharedStore = options.useSharedStore ?? process.env.NODE_ENV !== 'test';
  const storeOptions = useSharedStore
    ? { store: new PostgresRateLimitStore('agent-triage') }
    : {};

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    ...storeOptions,
    // The limiter runs after authentication and workspace membership checks.
    // Do not key by caller-controlled identity headers.
    keyGenerator: (req) => {
      const userId = req.authUser?.id;
      const workspaceId = req.workspaceContext?.id;
      if (userId && workspaceId) {
        return `workspace:${workspaceId}:user:${userId}`;
      }
      return `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
    },
    message: {
      error: 'AGENT_TRIAGE_RATE_LIMITED',
      message: 'The workspace security triage request limit has been reached. Try again later.'
    }
  });
}

export const agentPlatformRateLimiter = createAgentPlatformRateLimiter();
