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

    // Resolve only a trusted, bootstrapped tool. Callers cannot inject executable code.
    const tool = this.registry.get<TInput, TOutput>(toolName, toolVersion);

    const decision = await this.policyEngine.authorize({
      context,
      targetWorkspaceId,
      risk: tool.risk,
      requiredPermissions: tool.requiredPermissions
    });

    if (!decision.allowed) {
      throw new ToolExecutionDeniedError(decision.reason, decision.approvalRequired);
    }

    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new ToolExecutionDeniedError('INVALID_TOOL_INPUT', false);
    }

    return tool.execute(parsedInput.data, context);
  }
}
