import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createAgentPlatformRateLimiter } from './agent-platform.rate-limit.js';
import { createAgentPlatformRouter } from './agent-platform.routes.js';
import type {
  AgentPlatformResult,
  AgentTriageSubmission
} from './agent-platform.client.js';
import type {
  WorkspaceMembership,
  WorkspaceRepository
} from '../workspaces/workspace.repository.js';

const SECRET = 'nexus-agent-platform-test-secret-at-least-32-bytes';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const WORKSPACE_A = '650e8400-e29b-41d4-a716-446655440000';
const WORKSPACE_B = '650e8400-e29b-41d4-a716-446655440001';
const originalSecret = process.env.JWT_SECRET;

function membership(
  workspaceId = WORKSPACE_A,
  role: WorkspaceMembership['role'] = 'analyst'
): WorkspaceMembership {
  return {
    id: workspaceId,
    name: 'Security Workspace',
    slug: 'security-workspace-test',
    role
  };
}

function makeRepository(
  activeMembership: WorkspaceMembership | null = membership()
): WorkspaceRepository {
  return {
    async createWorkspace(input) {
      return { id: input.id, name: input.name, slug: input.slug, role: 'admin' };
    },
    async listForUser() {
      return activeMembership ? [activeMembership] : [];
    },
    async findActiveMembership(_userId, workspaceId) {
      return activeMembership?.id === workspaceId ? activeMembership : null;
    },
    async listMembers() { return []; },
    async addMemberByEmail() { return null; },
    async createIntegration(input) {
      return {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        name: input.name,
        permissions: input.permissions,
        token: 'unused-test-integration-token-value-123456'
      };
    },
    async findActiveIntegrationByHash() { return null; },
    async revokeIntegration() { return false; }
  };
}

function accessToken() {
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId: USER_ID,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: {
      id: USER_ID,
      email: 'analyst@example.test',
      role: 'analyst'
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

function appWith(
  repository: WorkspaceRepository,
  submit: (input: AgentTriageSubmission) => Promise<AgentPlatformResult>,
  limiter?: RequestHandler
) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAgentPlatformRouter(repository, submit, limiter));
  return app;
}

function resultFor(input: AgentTriageSubmission): AgentPlatformResult {
  return {
    tenant_id: input.tenant_id,
    task_id: input.task_id,
    agent_id: 'nexus.security-triage.v1',
    classification: 'critical',
    risk_score: 95,
    evidence: ['Matched supplied indicator: data exfiltration'],
    recommendations: ['Escalate to the SOC incident lead.'],
    read_only: true
  };
}

describe('authenticated agent platform gateway', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('rejects requests without an authenticated session', async () => {
    const submit = async (input: AgentTriageSubmission) => resultFor(input);
    const response = await request(appWith(makeRepository(), submit))
      .post('/api/agents/security-triage')
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send({
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(401);
  });

  it('requires an explicit active workspace', async () => {
    const token = accessToken();
    const submit = async (input: AgentTriageSubmission) => resultFor(input);
    const response = await request(appWith(makeRepository(), submit))
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(428);
    expect(response.body.error).toBe('WORKSPACE_REQUIRED');
  });

  it('rejects users without membership in the selected workspace', async () => {
    const token = accessToken();
    let called = false;
    const submit = async (input: AgentTriageSubmission) => {
      called = true;
      return resultFor(input);
    };
    const response = await request(appWith(makeRepository(null), submit))
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send({
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  it('denies viewer membership even when the account has an analyst role', async () => {
    const token = accessToken();
    let called = false;
    const submit = async (input: AgentTriageSubmission) => {
      called = true;
      return resultFor(input);
    };
    const response = await request(appWith(makeRepository(membership(WORKSPACE_A, 'viewer')), submit))
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send({
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  it('does not accept a client-supplied tenant_id or task_id', async () => {
    const token = accessToken();
    const submit = async (input: AgentTriageSubmission) => resultFor(input);
    const response = await request(appWith(makeRepository(), submit))
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send({
        tenant_id: WORKSPACE_B,
        task_id: 'attacker-selected-task',
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('derives the tenant from validated workspace membership before submitting the workflow', async () => {
    const token = accessToken();
    const captured: AgentTriageSubmission[] = [];
    const submit = async (input: AgentTriageSubmission) => {
      captured.push(input);
      return resultFor(input);
    };
    const response = await request(appWith(makeRepository(), submit))
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send({
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(200);
    expect(response.body.result.tenant_id).toBe(WORKSPACE_A);
    expect(response.body.result.classification).toBe('critical');
    expect(captured).toHaveLength(1);
    expect(captured[0].tenant_id).toBe(WORKSPACE_A);
    expect(captured[0].task_id).toMatch(/^triage:[0-9a-f-]{36}$/);
    expect(captured[0].observed_at).toBeTruthy();
  });

  it('fails closed when the gateway returns a different tenant or task', async () => {
    const token = accessToken();
    const submit = async (input: AgentTriageSubmission) => ({
      ...resultFor(input),
      tenant_id: WORKSPACE_B
    });
    const response = await request(appWith(makeRepository(), submit))
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send({
        event_type: 'security.alert',
        source: 'sensor-a',
        target: 'asset-a',
        details: 'Possible data exfiltration detected'
      });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('AGENT_PLATFORM_INVALID_RESPONSE');
  });

  it('rate limits authenticated requests by workspace and user', async () => {
    const token = accessToken();
    const captured: AgentTriageSubmission[] = [];
    const submit = async (input: AgentTriageSubmission) => {
      captured.push(input);
      return resultFor(input);
    };
    const limiter = createAgentPlatformRateLimiter({
      windowMs: 60_000,
      limit: 1,
      useSharedStore: false
    });
    const app = appWith(makeRepository(), submit, limiter);
    const body = {
      event_type: 'security.alert',
      source: 'sensor-a',
      target: 'asset-a',
      details: 'Possible data exfiltration detected'
    };

    const first = await request(app)
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send(body);
    const second = await request(app)
      .post('/api/agents/security-triage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_A)
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error).toBe('AGENT_TRIAGE_RATE_LIMITED');
    expect(captured).toHaveLength(1);
  });
});
