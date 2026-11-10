import { describe, expect, it } from 'vitest';
import {
  AGENT_REGISTRY,
  getAgentDefinition,
  isValidAgentFinding,
  isWorkspaceContextValid
} from '../agents/control-plane.contracts.js';
import type { AgentExecutionContext, AgentFinding } from '../agents/control-plane.contracts.js';

const context: AgentExecutionContext = {
  taskId: 'task-1',
  workspaceId: 'workspace-a',
  actorUserId: 'user-a',
  requestedAgent: 'supervisor',
  correlationId: 'correlation-1',
  deadlineAt: '2026-11-10T19:00:00.000Z',
  approvalGranted: false
};

const finding: AgentFinding = {
  code: 'TI-001',
  title: 'Correlated indicator',
  severity: 'medium',
  confidence: 0.82,
  summary: 'Two workspace events reference the same indicator.',
  evidence: [{
    kind: 'security-event',
    referenceId: 'event-1',
    observedAt: '2026-11-10T18:00:00.000Z',
    source: 'workspace-security-events'
  }]
};

describe('multi-agent control-plane contracts', () => {
  it('registers exactly six specialist contracts and one supervisor', () => {
    expect(AGENT_REGISTRY).toHaveLength(7);
    expect(AGENT_REGISTRY.filter((agent) => agent.id !== 'supervisor')).toHaveLength(6);
    expect(new Set(AGENT_REGISTRY.map((agent) => agent.id)).size).toBe(7);
    expect(getAgentDefinition('supervisor')?.capabilities).toContain('agents:coordinate');
  });

  it('marks the definitions as contract-only, not live agent runtimes', () => {
    expect(AGENT_REGISTRY.every((agent) => agent.maturity === 'contract-only')).toBe(true);
  });

  it('keeps specialist execution read-only or recommendation-only', () => {
    expect(AGENT_REGISTRY.every((agent) =>
      agent.executionMode === 'read-only-analysis' ||
      agent.executionMode === 'recommendation-only'
    )).toBe(true);
    expect(AGENT_REGISTRY.every((agent) =>
      agent.approvalPolicy === 'human-required-before-action'
    )).toBe(true);
  });

  it('requires non-empty tenant and actor context', () => {
    expect(isWorkspaceContextValid(context)).toBe(true);
    expect(isWorkspaceContextValid({ ...context, workspaceId: '   ' })).toBe(false);
    expect(isWorkspaceContextValid({ ...context, actorUserId: '' })).toBe(false);
  });

  it('accepts only findings with bounded confidence and source evidence', () => {
    expect(isValidAgentFinding(finding)).toBe(true);
    expect(isValidAgentFinding({ ...finding, confidence: 1.1 })).toBe(false);
    expect(isValidAgentFinding({ ...finding, confidence: Number.NaN })).toBe(false);
    expect(isValidAgentFinding({ ...finding, evidence: [] })).toBe(false);
    expect(isValidAgentFinding({
      ...finding,
      evidence: [{ ...finding.evidence[0], observedAt: 'not-a-date' }]
    })).toBe(false);
  });
});
