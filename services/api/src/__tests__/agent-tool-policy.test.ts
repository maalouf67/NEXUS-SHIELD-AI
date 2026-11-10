import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolPolicyEngine } from '../tools/permissions/policy-engine.js';
import { ToolExecutionGateway, ToolExecutionDeniedError } from '../tools/gateway/tool-execution.gateway.js';
import type { NexusTool, ToolExecutionContext } from '../tools/contracts/tool.interface.js';

const context: ToolExecutionContext = {
  requestId: 'request-1',
  runId: 'run-1',
  agentId: 'cti-agent',
  workspaceId: 'workspace-a',
  actorUserId: 'user-a',
  permissions: ['cti:read'],
  idempotencyKey: 'idempotency-1',
  deadlineAt: new Date(Date.now() + 60_000).toISOString()
};

const readTool: NexusTool<{ indicator: string }, { verdict: string }> = {
  name: 'cti.lookup',
  version: '1.0.0',
  description: 'Read reputation for a supplied indicator.',
  risk: 'read',
  requiredPermissions: ['cti:read'],
  inputSchema: z.object({ indicator: z.string().min(1) }).strict(),
  async execute(input) {
    return {
      success: true,
      data: { verdict: input.indicator === 'bad.example' ? 'suspicious' : 'unknown' },
      evidenceRefs: [],
      executedAt: new Date().toISOString()
    };
  }
};

function gateway(approvalValid = false) {
  const verifier = {
    isValidApproval: vi.fn(async () => approvalValid)
  };
  return {
    instance: new ToolExecutionGateway(new ToolPolicyEngine(verifier)),
    verifier
  };
}

describe('NEXUS tool execution policy', () => {
  it('allows an authorized read-only tool in the matching workspace', async () => {
    const { instance } = gateway();
    const result = await instance.execute(readTool, { indicator: 'bad.example' }, context, 'workspace-a');
    expect(result.success).toBe(true);
    expect(result.data?.verdict).toBe('suspicious');
  });

  it('denies cross-workspace execution before invoking the tool', async () => {
    const tool = { ...readTool, execute: vi.fn(readTool.execute) };
    const { instance } = gateway();
    await expect(instance.execute(tool, { indicator: 'bad.example' }, context, 'workspace-b'))
      .rejects.toMatchObject({ reason: 'WORKSPACE_MISMATCH' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('denies missing permission before invoking the tool', async () => {
    const tool = { ...readTool, execute: vi.fn(readTool.execute) };
    const { instance } = gateway();
    const restricted = { ...context, permissions: [] };
    await expect(instance.execute(tool, { indicator: 'bad.example' }, restricted, 'workspace-a'))
      .rejects.toMatchObject({ reason: 'MISSING_PERMISSION' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('rejects invalid tool input', async () => {
    const { instance } = gateway();
    await expect(instance.execute(readTool, { indicator: '' }, context, 'workspace-a'))
      .rejects.toBeInstanceOf(ToolExecutionDeniedError);
  });

  it('requires a validated approval for defensive actions', async () => {
    const actionTool: NexusTool<{ target: string }, { accepted: boolean }> = {
      ...readTool,
      name: 'defense.block',
      risk: 'defensive_action',
      requiredPermissions: ['defense:block'],
      inputSchema: z.object({ target: z.string().min(1) }).strict(),
      async execute() {
        return { success: true, data: { accepted: true }, evidenceRefs: [], executedAt: new Date().toISOString() };
      }
    };
    const noApprovalGateway = gateway();
    const authorizedContext = { ...context, permissions: ['defense:block'] };
    await expect(noApprovalGateway.instance.execute(actionTool, { target: '198.51.100.7' }, authorizedContext, 'workspace-a'))
      .rejects.toMatchObject({ reason: 'APPROVAL_REQUIRED', approvalRequired: true });

    const validApprovalGateway = gateway(true);
    const approvedContext = { ...authorizedContext, approvedActionId: 'approval-1' };
    const result = await validApprovalGateway.instance.execute(actionTool, { target: '198.51.100.7' }, approvedContext, 'workspace-a');
    expect(result.success).toBe(true);
    expect(validApprovalGateway.verifier.isValidApproval).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      runId: 'run-1'
    });
  });
});
