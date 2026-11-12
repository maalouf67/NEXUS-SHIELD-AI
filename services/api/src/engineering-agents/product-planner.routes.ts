import { Router, type RequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth } from '../auth/auth.middleware.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';
import {
  ProductPlannerInputSchema,
  productPlannerAgent,
  type ProductPlannerRuntime
} from './product-planner.agent.js';

const productPlannerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.authUser?.id
    ? `user:${req.authUser.id}`
    : ipKeyGenerator(req.ip ?? '127.0.0.1'),
  message: {
    error: 'AI_RATE_LIMIT',
    message: 'The Product Planner request limit has been reached. Try again later.'
  }
});

export function createProductPlannerRouter(
  requireWorkspace: RequestHandler = createRequireWorkspace(),
  agent: ProductPlannerRuntime = productPlannerAgent,
  limiter: RequestHandler = productPlannerRateLimiter
) {
  const router = Router();

  router.post(
    '/engineering-agents/product-planner',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst'),
    limiter,
    async (req, res) => {
      const parsed = ProductPlannerInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          details: parsed.error.flatten()
        });
      }

      try {
        const plan = await agent.plan(parsed.data);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          status: 'draft',
          agent: 'product-planner',
          workspace_id: req.workspaceContext!.id,
          plan,
          disclaimer: 'AI-generated draft based only on the supplied request and repository context. It has not changed the repository, created GitHub resources, or verified implementation.'
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') {
          return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
        }
        if (error instanceof Error && error.message === 'AI_RATE_LIMIT') {
          return res.status(503).json({ error: 'AI_RATE_LIMIT' });
        }
        if (error instanceof Error && error.message === 'AI_EMPTY_RESPONSE') {
          return res.status(502).json({ error: 'AI_EMPTY_RESPONSE' });
        }
        if (error instanceof z.ZodError) {
          return res.status(502).json({ error: 'AI_INVALID_STRUCTURED_OUTPUT' });
        }
        return res.status(502).json({ error: 'AI_PLAN_FAILED' });
      }
    }
  );

  return router;
}

export const productPlannerRouter = createProductPlannerRouter();
