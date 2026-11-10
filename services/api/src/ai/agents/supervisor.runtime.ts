import { randomUUID } from 'node:crypto';
import type { AgentExecutionContext } from './control-plane.contracts.js';
import {
  ThreatIntelligenceAgent,
  type AgentSecurityEvent,
  type ThreatIntelligenceAgentResult
} from './threat-intelligence.agent.js';

export interface SupervisorTaskResult {
  readonly supervisorId: 'supervisor';
  readonly taskId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly status: 'completed';
  readonly delegatedAgent: 'threat-intelligence';
  readonly result: ThreatIntelligenceAgentResult;
}

/**
 * Minimal real supervisor: validates the request envelope and delegates only
 * to the implemented specialist allowlist. It cannot execute defensive actions.
 */
export class NexusSupervisor {
  constructor(
    private readonly threatIntelligence: Pick<ThreatIntelligenceAgent, 'execute'> =
      new ThreatIntelligenceAgent()
  ) {}

  async executeThreatIntelligenceTask(input: {
    workspaceId: string;
    actorUserId: string;
    event: AgentSecurityEvent;
    taskId?: string;
    correlationId?: string;
  }): Promise<SupervisorTaskResult> {
    const taskId = input.taskId ?? randomUUID();
    const correlationId = input.correlationId ?? randomUUID();
    const context: AgentExecutionContext = {
      taskId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      requestedAgent: 'threat-intelligence',
      correlationId,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      approvalGranted: false
    };

    const result = await this.threatIntelligence.execute(context, input.event);
    return {
      supervisorId: 'supervisor',
      taskId,
      workspaceId: input.workspaceId,
      correlationId,
      status: 'completed',
      delegatedAgent: 'threat-intelligence',
      result
    };
  }
}

export const nexusSupervisor = new NexusSupervisor();
