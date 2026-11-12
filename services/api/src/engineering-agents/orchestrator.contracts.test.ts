import { describe, expect, it } from 'vitest';

import {
  ApprovalDecisionSchema,
  ENGINEERING_AGENT_IDS,
  EngineeringTaskEnvelopeSchema,
  TaskAuditRecordSchema
} from './orchestrator.contracts.js';
import {
  createInitialTaskState,
  transitionTask
} from './task-state-machine.js';

const taskId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-11-12T12:00:00.000Z';

const validEnvelope = {
  schemaVersion: '1',
  taskId,
  correlationId,
  idempotencyKey: 'nexus-task-key-000001',
  repositoryFullName: 'maalouf67/NEXUS-SHIELD-AI',
  branch: 'feat/orchestrator-bootstrap',
  issueNumber: 64,
  requestedBy: 'maalouf67',
  assignedAgent: 'system-architect',
  title: 'Define the task orchestration foundation',
  description: 'Add validated contracts and deterministic state transitions.',
  acceptanceCriteria: ['Invalid transitions are rejected.', 'Every accepted transition emits an event.'],
  allowedPaths: ['services/api/src/engineering-agents/**'],
  priority: 'high',
  riskLevel: 'medium',
  requiresHumanApproval: true,
  requestedAt: timestamp
};

function transitionCommand(overrides: Record<string, unknown> = {}) {
  return {
    eventId: '33333333-3333-4333-8333-333333333333',
    taskId,
    expectedStatus: 'queued',
    expectedRevision: 0,
    nextStatus: 'triaged',
    correlationId,
    actor: { kind: 'orchestrator', id: 'orchestrator' },
    occurredAt: timestamp,
    ...overrides
  };
}

describe('engineering agent task contracts', () => {
  it('defines exactly ten distinct software-engineering roles', () => {
    expect(ENGINEERING_AGENT_IDS).toHaveLength(10);
    expect(new Set(ENGINEERING_AGENT_IDS).size).toBe(10);
  });

  it('accepts a scoped task envelope on a dedicated feature branch', () => {
    expect(EngineeringTaskEnvelopeSchema.safeParse(validEnvelope).success).toBe(true);
  });

  it('rejects main as an agent work branch', () => {
    expect(EngineeringTaskEnvelopeSchema.safeParse({
      ...validEnvelope,
      branch: 'main'
    }).success).toBe(false);
  });

  it('rejects parent traversal and Windows-style paths in allowed scopes', () => {
    for (const path of ['../../.env', '/etc/passwd', 'services\\api\\.env']) {
      const parsed = EngineeringTaskEnvelopeSchema.safeParse({
        ...validEnvelope,
        allowedPaths: [path]
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects duplicate path scopes', () => {
    expect(EngineeringTaskEnvelopeSchema.safeParse({
      ...validEnvelope,
      allowedPaths: ['apps/web/**', 'apps/web/**']
    }).success).toBe(false);
  });

  it('requires a meaningful approval rationale', () => {
    expect(ApprovalDecisionSchema.safeParse({
      approvalId: '44444444-4444-4444-8444-444444444444',
      taskId,
      scope: 'merge_main',
      decision: 'approved',
      requestedBy: 'maalouf67',
      decidedBy: 'maalouf67',
      rationale: '   ',
      decidedAt: timestamp
    }).success).toBe(false);
  });

  it('rejects arbitrary audit payloads that could carry secret values', () => {
    expect(TaskAuditRecordSchema.safeParse({
      auditId: '55555555-5555-4555-8555-555555555555',
      taskId,
      correlationId,
      actor: { kind: 'human', id: 'maalouf67' },
      action: 'task.reviewed',
      target: 'pull/64',
      outcome: 'succeeded',
      occurredAt: timestamp,
      apiKey: 'must-not-be-recorded'
    }).success).toBe(false);
  });
});

describe('engineering task state machine', () => {
  it('creates new tasks in queued state at revision zero', () => {
    expect(createInitialTaskState(taskId, timestamp)).toEqual({
      taskId,
      status: 'queued',
      revision: 0,
      updatedAt: timestamp
    });
  });

  it('accepts the complete happy-path lifecycle and increments revisions', () => {
    let state = createInitialTaskState(taskId, timestamp);
    const nextStates = ['triaged', 'ready', 'running', 'review', 'verified', 'completed'] as const;

    nextStates.forEach((nextStatus, index) => {
      const result = transitionTask(state, transitionCommand({
        eventId: `66666666-6666-4666-8666-66666666666${index + 1}`,
        expectedStatus: state.status,
        expectedRevision: state.revision,
        nextStatus
      }));

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.state.revision).toBe(index + 1);
      expect(result.event.previousStatus).toBe(state.status);
      expect(result.event.nextStatus).toBe(nextStatus);
      state = result.state;
    });

    expect(state.status).toBe('completed');
  });

  it('rejects skipping required workflow stages', () => {
    const result = transitionTask(
      createInitialTaskState(taskId, timestamp),
      transitionCommand({ nextStatus: 'running' })
    );
    expect(result).toMatchObject({ ok: false, code: 'TRANSITION_NOT_ALLOWED' });
  });

  it('rejects stale commands to prevent lost updates', () => {
    const result = transitionTask(
      createInitialTaskState(taskId, timestamp),
      transitionCommand({ expectedRevision: 3 })
    );
    expect(result).toMatchObject({ ok: false, code: 'STALE_STATE' });
  });

  it('requires a reason before blocking, failing or cancelling a task', () => {
    const cases = [
      {
        state: { taskId, status: 'ready' as const, revision: 2, updatedAt: timestamp },
        nextStatus: 'blocked' as const
      },
      {
        state: { taskId, status: 'running' as const, revision: 3, updatedAt: timestamp },
        nextStatus: 'failed' as const
      },
      {
        state: createInitialTaskState(taskId, timestamp),
        nextStatus: 'cancelled' as const
      }
    ];

    for (const testCase of cases) {
      const result = transitionTask(testCase.state, transitionCommand({
        expectedStatus: testCase.state.status,
        expectedRevision: testCase.state.revision,
        nextStatus: testCase.nextStatus
      }));
      expect(result).toMatchObject({ ok: false, code: 'REASON_REQUIRED' });
    }
  });

  it('requires the command to target the same task', () => {
    const result = transitionTask(
      createInitialTaskState(taskId, timestamp),
      transitionCommand({ taskId: '77777777-7777-4777-8777-777777777777' })
    );
    expect(result).toMatchObject({ ok: false, code: 'TASK_ID_MISMATCH' });
  });

  it('does not allow terminal tasks to restart', () => {
    const completed = {
      taskId,
      status: 'completed',
      revision: 8,
      updatedAt: timestamp
    };
    const result = transitionTask(completed, transitionCommand({
      expectedStatus: 'completed',
      expectedRevision: 8,
      nextStatus: 'running'
    }));
    expect(result).toMatchObject({ ok: false, code: 'TRANSITION_NOT_ALLOWED' });
  });
});
