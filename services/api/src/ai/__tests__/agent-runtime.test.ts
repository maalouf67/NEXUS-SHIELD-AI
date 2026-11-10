import { describe, expect, it, vi } from 'vitest';
import type { AIRequest } from '../types.js';
import type { OrchestratorResult } from '../orchestrator.js';
import {
  ThreatIntelligenceAgent,
  type AgentSecurityEvent
} from '../agents/threat-intelligence.agent.js';
import { NexusSupervisor } from '../agents/supervisor.runtime.js';
import type { AgentExecutionContext } from '../agents/control-plane.contracts.js';
import type { ThreatIntelligenceAgentResult } from '../agents/threat-intelligence.agent.js';

const event: AgentSecurityEvent = {
  id: '8f14e45f-ea4e-4f3b-9a2b-1b2c3d4e5f60',
  source: 'edr',
  eventType: 'suspicious_process',
  severity: 'high',
  observedAt: '2026-11-10T12:00:00.000Z',
  assetId: 'endpoint-17',
  summary: 'An unsigned executable attempted persistence.',
  attributes: { process_name: 'unknown.exe' }
};

function context(overrides: Partial<{
  taskId: string;
  workspaceId: string;
  actorUserId: string;
  requestedAgent: 'threat-intelligence';
  correlationId: string;
  deadlineAt: string;
  approvalGranted: boolean;
}> = {}) {
  return {
    taskId: 'task-1',
    workspaceId: 'workspace-a',
    actorUserId: 'user-a',
    requestedAgent: 'threat-intelligence' as const,
    correlationId: 'correlation-1',
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    approvalGranted: false,
    ...overrides
  };
}

const orchestratorResult: OrchestratorResult = {
  status: 'success',
  taskType: 'triage',
  provider: 'openai',
  modelId: 'gpt-4o-mini',
  analysis: {
    classification: 'high',
    risk_score: 76,
    findings: ['Unsigned executable attempted persistence.'],
    recommendations: ['Isolate the endpoint only after analyst review.'],
    explanation: 'The supplied event indicates a potentially risky persistence attempt.'
  },
  latencyMs: 20,
  routing: {
    preferredProvider: 'openai',
    selectedProvider: 'openai',
    reason: 'test',
    fallbackProviders: []
  }
};

describe('Threat Intelligence Agent runtime', () => {
  it('executes a real provider-orchestrator contract and preserves event evidence', async () => {
    const run = vi.fn(async (_request: AIRequest) => orchestratorResult);
    const agent = new ThreatIntelligenceAgent(run);
    const result = await agent.execute(context(), event);

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toMatchObject({
      taskType: 'triage',
      tenantId: 'workspace-a',
      userId: 'user-a',
      context: { target: 'endpoint-17', source: 'edr', signal_type: 'suspicious_process' }
    });
    expect(result).toMatchObject({
      agentId: 'threat-intelligence',
      workspaceId: 'workspace-a',
      analysis: { risk_score: 76 },
      evidence: [{ kind: 'security-event', referenceId: event.id, source: 'edr' }]
    });
  });

  it('rejects an expired deadline before invoking the model', async () => {
    const run = vi.fn(async (_request: AIRequest) => orchestratorResult);
    const agent = new ThreatIntelligenceAgent(run);
    await expect(agent.execute(
      context({ deadlineAt: new Date(Date.now() - 1000).toISOString() }),
      event
    )).rejects.toThrow('AGENT_DEADLINE_EXPIRED');
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects a mismatched agent identity before invoking the model', async () => {
    const run = vi.fn(async (_request: AIRequest) => orchestratorResult);
    const agent = new ThreatIntelligenceAgent(run);
    await expect(agent.execute(
      { ...context(), requestedAgent: 'supervisor' },
      event
    )).rejects.toThrow('AGENT_ROUTE_MISMATCH');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('NEXUS Supervisor runtime', () => {
  it('delegates a scoped event task to the Threat Intelligence Agent', async () => {
    const execute = vi.fn(async (ctx: AgentExecutionContext, suppliedEvent: AgentSecurityEvent): Promise<ThreatIntelligenceAgentResult> => ({
      agentId: 'threat-intelligence' as const,
      taskId: ctx.taskId,
      workspaceId: ctx.workspaceId,
      status: 'completed' as const,
      analysis: orchestratorResult.analysis as ThreatIntelligenceAgentResult['analysis'],
      evidence: [{
        kind: 'security-event' as const,
        referenceId: suppliedEvent.id,
        observedAt: suppliedEvent.observedAt,
        source: suppliedEvent.source
      }],
      model: { provider: 'openai', modelId: 'gpt-4o-mini' }
    }));
    const supervisor = new NexusSupervisor({ execute });
    const result = await supervisor.executeThreatIntelligenceTask({
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      event,
      taskId: 'task-supervised',
      correlationId: 'corr-supervised'
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      requestedAgent: 'threat-intelligence',
      correlationId: 'corr-supervised'
    });
    expect(result).toMatchObject({
      supervisorId: 'supervisor',
      delegatedAgent: 'threat-intelligence',
      workspaceId: 'workspace-a',
      taskId: 'task-supervised',
      status: 'completed'
    });
  });
});
