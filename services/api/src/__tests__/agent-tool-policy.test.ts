import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolPolicyEngine } from '../tools/permissions/policy-engine.js';
import { ToolExecutionGateway } from '../tools/gateway/tool-execution.gateway.js';
import {
  ToolAlreadyRegisteredError,
  ToolNotRegisteredError,
  ToolRegistry
} from '../tools/registry/tool-registry.js';
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
  requiredPermissions: ['cti:read', 'cti:read'],
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

function gateway(
  approvalValid = false,
  registeredTool: NexusTool<any, any> = readTool
) {
  const verifier = {
    consumeApproval: vi.fn(async () => approvalValid)
  };
  const registry = new ToolRegistry();
  registry.register(registeredTool);
  return {
    instance: new ToolExecutionGateway(registry, new ToolPolicyEngine(verifier)),
    registry,
    verifier
  };
}

describe('NEXUS trusted tool registry', () => {
  it('registers and resolves an exact tool version', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    expect(registry.has('cti.lookup', '1.0.0')).toBe(true);
    expect(registry.get('cti.lookup', '1.0.0').name).toBe('cti.lookup');
    expect(registry.list()[0]?.requiredPermissions).toEqual(['cti:read']);
  });

  it('rejects duplicate name and version registrations', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    expect(() => registry.register(readTool)).toThrow(ToolAlreadyRegisteredError);
  });

  it('does not silently resolve an unregistered tool version', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    expect(() => registry.get('cti.lookup', '2.0.0')).toThrow(ToolNotRegisteredError);
  });

  it('rejects invalid tool identifiers', () => {
    const registry = new ToolRegistry();
    expect(() => registry.register({ ...readTool, name: 'CTI LOOKUP' })).toThrow('INVALID_TOOL_NAME');
    expect(() => registry.register({ ...readTool, version: 'latest' })).toThrow('INVALID_TOOL_VERSION');
  });
});

describe('NEXUS tool execution policy', () => {
  it('allows an authorized read-only tool in the matching workspace', async () => {
    const { instance } = gateway();
    const result = await instance.execute(
      'cti.lookup', '1.0.0', { indicator: 'bad.example' }, context, 'workspace-a'
    );
    expect(result.success).toBe(true);
    expect(result.data?.verdict).toBe('suspicious');
  });

  it('denies cross-workspace execution before invoking the tool', async () => {
    const execute = vi.fn(readTool.execute);
    const { instance } = gateway(false, { ...readTool, execute });
    await expect(instance.execute(
      'cti.lookup', '1.0.0', { indicator: 'bad.example' }, context, 'workspace-b'
    )).rejects.toMatchObject({ reason: 'WORKSPACE_MISMATCH' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('denies missing permission before invoking the tool', async () => {
    const execute = vi.fn(readTool.execute);
    const { instance } = gateway(false, { ...readTool, execute });
    await expect(instance.execute(
      'cti.lookup', '1.0.0', { indicator: 'bad.example' }, { ...context, permissions: [] }, 'workspace-a'
    )).rejects.toMatchObject({ reason: 'MISSING_PERMISSION' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects invalid tool input before calling the approval verifier or tool', async () => {
    const execute = vi.fn(readTool.execute);
    const { instance, verifier } = gateway(false, { ...readTool, execute });
    await expect(instance.execute(
      'cti.lookup', '1.0.0', { indicator: '' }, context, 'workspace-a'
    )).rejects.toMatchObject({ reason: 'INVALID_TOOL_INPUT' });
    expect(verifier.consumeApproval).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires a validated, action-bound approval for defensive actions', async () => {
    const actionExecute = vi.fn(async () => ({
      success: true,
      data: { accepted: true },
      evidenceRefs: [],
      executedAt: new Date().toISOString()
    }));
    const actionTool: NexusTool<{ target: string }, { accepted: boolean }> = {
      name: 'defense.block',
      version: '1.0.0',
      description: 'A guarded defensive action test fixture.',
      risk: 'defensive_action',
      requiredPermissions: ['defense:block'],
      inputSchema: z.object({ target: z.string().min(1) }).strict(),
      execute: actionExecute
    };
    const denied = gateway(false, actionTool);
    const authorizedContext = { ...context, permissions: ['defense:block'] };
    await expect(denied.instance.execute(
      'defense.block', '1.0.0', { target: '198.51.100.7' }, authorizedContext, 'workspace-a'
    )).rejects.toMatchObject({ reason: 'APPROVAL_REQUIRED', approvalRequired: true });
    expect(denied.verifier.consumeApproval).not.toHaveBeenCalled();
    expect(actionExecute).not.toHaveBeenCalled();

    const approved = gateway(true, actionTool);
    const approvedContext = { ...authorizedContext, approvedActionId: 'approval-1' };
    const result = await approved.instance.execute(
      'defense.block', '1.0.0', { target: '198.51.100.7' }, approvedContext, 'workspace-a'
    );
    expect(result.success).toBe(true);
    expect(approved.verifier.consumeApproval).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: 'approval-1',
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      agentId: 'cti-agent',
      runId: 'run-1',
      toolName: 'defense.block',
      toolVersion: '1.0.0',
      idempotencyKey: 'idempotency-1',
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(actionExecute).toHaveBeenCalledTimes(1);
  });

  it('rejects expired or incomplete execution contexts before calling tools', async () => {
    const execute = vi.fn(readTool.execute);
    const { instance } = gateway(false, { ...readTool, execute });
    await expect(instance.execute(
      'cti.lookup',
      '1.0.0',
      { indicator: 'bad.example' },
      { ...context, deadlineAt: new Date(Date.now() - 1).toISOString() },
      'workspace-a'
    )).rejects.toMatchObject({ reason: 'EXECUTION_DEADLINE_EXPIRED' });

    await expect(instance.execute(
      'cti.lookup',
      '1.0.0',
      { indicator: 'bad.example' },
      { ...context, idempotencyKey: '' },
      'workspace-a'
    )).rejects.toMatchObject({ reason: 'INVALID_EXECUTION_CONTEXT' });
    expect(execute).not.toHaveBeenCalled();
  });
});
