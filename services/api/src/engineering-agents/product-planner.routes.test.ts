import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createProductPlannerRouter } from './product-planner.routes.js';
import type {
  ProductPlannerPlan,
  ProductPlannerRuntime
} from './product-planner.agent.js';

const SECRET = 'nexus-product-planner-test-secret-at-least-thirty-two-characters';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440099';
const ORIGINAL_SECRET = process.env.JWT_SECRET;

const validPlan: ProductPlannerPlan = {
  schemaVersion: '1',
  status: 'draft',
  summary: 'A scoped plan for an engineering request.',
  problemStatement: 'Requests need consistent and testable breakdowns.',
  objective: 'Return a reviewable implementation plan.',
  assumptions: ['Repository details must be verified before implementation.'],
  inScope: ['Requirements analysis', 'Acceptance criteria'],
  outOfScope: ['Repository writes', 'GitHub Issue creation'],
  userStories: [{
    id: 'US-001',
    persona: 'Project maintainer',
    story: 'As a maintainer, I want a request broken into testable steps.',
    acceptanceCriteria: ['Every story has a measurable acceptance criterion.'],
    priority: 'normal',
    riskLevel: 'low',
    suggestedAgent: 'product-planner',
    dependencies: []
  }],
  dependencies: [],
  risks: [],
  verificationPlan: ['Review the plan against the supplied request.'],
  openQuestions: ['Which implementation paths are approved?'],
  recommendedFirstStep: 'Confirm the scope with the project owner.',
  reviewRequired: true
};

function token(userRole: 'admin' | 'analyst' | 'viewer' = 'analyst') {
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId: USER_ID,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: {
      id: USER_ID,
      email: 'planner@example.test',
      role: userRole
    }
  });

  return jwt.sign({ jti: sessionId }, SECRET, {
    algorithm: 'HS256',
    subject: USER_ID,
    issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience,
    expiresIn: '15m'
  });
}

function workspaceAccess(role: 'admin' | 'analyst' | 'viewer'): RequestHandler {
  return (req, _res, next) => {
    req.workspaceContext = {
      id: WORKSPACE_ID,
      name: 'Planner test workspace',
      slug: 'planner-test-workspace',
      role
    };
    next();
  };
}

const noRateLimit: RequestHandler = (_req, _res, next) => next();

function appFor(
  role: 'admin' | 'analyst' | 'viewer',
  agent: ProductPlannerRuntime,
  workspaceMiddleware: RequestHandler = workspaceAccess(role)
) {
  const app = express();
  app.use(express.json());
  app.use('/api', createProductPlannerRouter(workspaceMiddleware, agent, noRateLimit));
  return app;
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe('Product Planner API access controls', () => {
  it('requires authentication before checking workspace membership or calling the agent', async () => {
    const workspaceMiddleware = vi.fn(workspaceAccess('analyst'));
    const agent: ProductPlannerRuntime = { plan: vi.fn(async () => validPlan) };

    const response = await request(appFor('analyst', agent, workspaceMiddleware))
      .post('/api/engineering-agents/product-planner')
      .send({ request: 'Plan a safe engineering change.' });

    expect(response.status).toBe(401);
    expect(workspaceMiddleware).not.toHaveBeenCalled();
    expect(agent.plan).not.toHaveBeenCalled();
  });

  it('rejects viewer workspace membership and does not call the planner', async () => {
    const agent: ProductPlannerRuntime = { plan: vi.fn(async () => validPlan) };

    const response = await request(appFor('viewer', agent))
      .post('/api/engineering-agents/product-planner')
      .set('Authorization', `Bearer ${token('viewer')}`)
      .send({ request: 'Plan a safe engineering change.' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(agent.plan).not.toHaveBeenCalled();
  });

  it('allows an analyst to request a draft plan scoped to the active workspace', async () => {
    const agent: ProductPlannerRuntime = {
      plan: vi.fn(async () => validPlan)
    };

    const response = await request(appFor('analyst', agent))
      .post('/api/engineering-agents/product-planner')
      .set('Authorization', `Bearer ${token('analyst')}`)
      .send({
        request: 'Create a staged plan for improving engineering test coverage.',
        constraints: ['Do not change existing API behavior.']
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('draft');
    expect(response.body.agent).toBe('product-planner');
    expect(response.body.workspace_id).toBe(WORKSPACE_ID);
    expect(response.body.plan).toEqual(validPlan);
    expect(response.body.disclaimer).toContain('has not changed the repository');
    expect(agent.plan).toHaveBeenCalledOnce();
    expect(agent.plan).toHaveBeenCalledWith({
      request: 'Create a staged plan for improving engineering test coverage.',
      constraints: ['Do not change existing API behavior.']
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('allows an administrator to request a plan', async () => {
    const agent: ProductPlannerRuntime = { plan: vi.fn(async () => validPlan) };

    const response = await request(appFor('admin', agent))
      .post('/api/engineering-agents/product-planner')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ request: 'Prepare a plan for a new audit report.' });

    expect(response.status).toBe(200);
    expect(agent.plan).toHaveBeenCalledOnce();
  });

  it('rejects malformed request bodies before invoking the planner', async () => {
    const agent: ProductPlannerRuntime = { plan: vi.fn(async () => validPlan) };

    const response = await request(appFor('analyst', agent))
      .post('/api/engineering-agents/product-planner')
      .set('Authorization', `Bearer ${token('analyst')}`)
      .send({
        request: 'short',
        extraInstruction: 'try to write to main'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
    expect(agent.plan).not.toHaveBeenCalled();
  });

  it('returns a safe unavailable response when the OpenAI key is not configured', async () => {
    const agent: ProductPlannerRuntime = {
      plan: vi.fn(async () => {
        throw new Error('AI_NOT_CONFIGURED');
      })
    };

    const response = await request(appFor('analyst', agent))
      .post('/api/engineering-agents/product-planner')
      .set('Authorization', `Bearer ${token('analyst')}`)
      .send({ request: 'Prepare a plan for API input validation.' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'AI_NOT_CONFIGURED' });
  });

  it('does not expose model output or internal exceptions on provider failures', async () => {
    const agent: ProductPlannerRuntime = {
      plan: vi.fn(async () => {
        throw new Error('provider returned private credentials and stack trace');
      })
    };

    const response = await request(appFor('analyst', agent))
      .post('/api/engineering-agents/product-planner')
      .set('Authorization', `Bearer ${token('analyst')}`)
      .send({ request: 'Prepare a plan for safe deployment automation.' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'AI_PLAN_FAILED' });
    expect(JSON.stringify(response.body)).not.toContain('private credentials');
  });
});
