import { createHash } from 'node:crypto';
import type { ToolExecutionContext, ToolResult } from '../contracts/tool.interface.js';
import { ToolPolicyEngine } from '../permissions/policy-engine.js';
import { ToolRegistry } from '../registry/tool-registry.js';

export class ToolExecutionDeniedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly approvalRequired: boolean
  ) {
    super(reason);
    this.name = 'ToolExecutionDeniedError';
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort()
    .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
    .join(',') + '}';
}

function hashToolAction(toolName: string, toolVersion: string, input: unknown): string {
  const canonicalAction = canonicalJson({
    toolName,
    toolVersion,
    input
  });
  return createHash('sha256').update(canonicalAction, 'utf8').digest('hex');
}

export class ToolExecutionGateway {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly policyEngine: ToolPolicyEngine
  ) {}

  async execute<TInput, TOutput>(
    toolName: string,
    toolVersion: string,
    rawInput: unknown,
    context: ToolExecutionContext,
    targetWorkspaceId: string
  ): Promise<ToolResult<TOutput>> {
    if (!Number.isFinite(Date.parse(context.deadlineAt)) ||
        Date.parse(context.deadlineAt) <= Date.now()) {
      throw new ToolExecutionDeniedError('EXECUTION_DEADLINE_EXPIRED', false);
    }
    if (!context.requestId || !context.runId || !context.agentId ||
        !context.actorUserId || !context.idempotencyKey) {
      throw new ToolExecutionDeniedError('INVALID_EXECUTION_CONTEXT', false);
    }

    // Resolve only a trusted, bootstrapped tool. Callers cannot inject executable code.
    const tool = this.registry.get<TInput, TOutput>(toolName, toolVersion);

    // Validate and normalize input before binding approval to its canonical digest.
    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new ToolExecutionDeniedError('INVALID_TOOL_INPUT', false);
    }

    const inputHash = hashToolAction(toolName, toolVersion, parsedInput.data);
    const decision = await this.policyEngine.authorize({
      context,
      targetWorkspaceId,
      toolName,
      toolVersion,
      inputHash,
      risk: tool.risk,
      requiredPermissions: tool.requiredPermissions
    });

    if (!decision.allowed) {
      throw new ToolExecutionDeniedError(decision.reason, decision.approvalRequired);
    }

    return tool.execute(parsedInput.data, context);
  }
}
