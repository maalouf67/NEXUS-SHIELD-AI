import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createAgentTasksRouter } from '../agent-tasks.routes.js';
import type { AgentSecurityEvent } from '../threat-intelligence.agent.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';

const event: AgentSecurityEvent = {
  id: eventId,
  source: 'edr',
  eventType: 'suspicious_process',
  severity: 'high',
  observedAt: '2026-11-10T12:00:00.000Z',
  assetId: 'endpoint-17',
  summary: 'Suspicious process observed.',
  attributes: {}
};

function createTestApp(options: {
  role?: 'admin' | 'analyst' | 'viewer';
  findEvent?: (workspace: string, id: string) => Promise<AgentSecurityEvent | null>;
  supervisor?: { executeThreatIntelligenceTask: (input: {
    workspaceId: string;
    actorUserId: string;
    event: AgentSecurityEvent;
    taskId?: string;
    correlationId?: string;
  }) => Promise<unknown> };
} = {}) {
  const authenticate: RequestHandler = (req, _res, next) => {
    req.authUser = { id: actorUserId, email: 'analyst@example.test', role: 'analyst' };
    next();
  };
  const workspace: RequestHandler = (req, _res, next) => {
    req.workspaceContext = {
      id: workspaceId,
      name: 'Test workspace',
      slug: 'test-workspace',
      role: options.role ?? 'analyst'
    };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(createAgentTasksRouter({
    requireAuthentication: authenticate,
    requireWorkspace: workspace,
    findEvent: options.findEvent ?? (async () => event),
    supervisor: options.supervisor ?? {
      executeThreatIntelligenceTask: async (input) => ({
        supervisorId: 'supervisor',
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        delegatedAgent: 'threat-intelligence',
        status: 'completed'
      })
    } as never
  }));
  return app;
}

describe('workspace-scoped agent task route', () => {
  it('loads the requested event using the authenticated workspace ID', async () => {
    const findEvent = vi.fn(async (workspace: string, id: string) => {
      expect(workspace).toBe(workspaceId);
      expect(id).toBe(eventId);
      return event;
    });
    const executeThreatIntelligenceTask = vi.fn(async () => ({ status: 'completed' }));
    const app = createTestApp({
      findEvent,
      supervisor: { executeThreatIntelligenceTask }
    });

    const response = await request(app)
      .post('/agents/tasks')
      .send({ agentId: 'threat-intelligence', securityEventId: eventId });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(findEvent).toHaveBeenCalledOnce();
    expect(executeThreatIntelligenceTask).toHaveBeenCalledOnce();
  });

  it('does not delegate when the event is outside the active workspace', async () => {
    const executeThreatIntelligenceTask = vi.fn();
    const app = createTestApp({
      findEvent: async () => null,
      supervisor: { executeThreatIntelligenceTask }
    });

    const response = await request(app)
      .post('/agents/tasks')
      .send({ agentId: 'threat-intelligence', securityEventId: eventId });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('SECURITY_EVENT_NOT_FOUND');
    expect(executeThreatIntelligenceTask).not.toHaveBeenCalled();
  });

  it('restricts agent task execution to workspace analysts and admins', async () => {
    const executeThreatIntelligenceTask = vi.fn();
    const app = createTestApp({
      role: 'viewer',
      supervisor: { executeThreatIntelligenceTask }
    });

    const response = await request(app)
      .post('/agents/tasks')
      .send({ agentId: 'threat-intelligence', securityEventId: eventId });

    expect(response.status).toBe(403);
    expect(executeThreatIntelligenceTask).not.toHaveBeenCalled();
  });

  it('rejects unknown agent IDs and extra request fields', async () => {
    const executeThreatIntelligenceTask = vi.fn();
    const app = createTestApp({ supervisor: { executeThreatIntelligenceTask } });

    const response = await request(app)
      .post('/agents/tasks')
      .send({ agentId: 'network-security', securityEventId: eventId, prompt: 'override' });

    expect(response.status).toBe(400);
    expect(executeThreatIntelligenceTask).not.toHaveBeenCalled();
  });
});
