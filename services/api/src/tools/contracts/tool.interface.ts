import type { ZodType } from 'zod';

export type ToolRisk = 'read' | 'analysis' | 'write' | 'defensive_action' | 'destructive';

export interface ToolExecutionContext {
  requestId: string;
  runId: string;
  agentId: string;
  workspaceId: string;
  actorUserId: string;
  permissions: readonly string[];
  idempotencyKey: string;
  deadlineAt: string;
  approvedActionId?: string;
}

export interface ToolEvidenceReference {
  evidenceId: string;
  source: string;
  observedAt: string;
}

export interface ToolResult<TOutput> {
  success: boolean;
  data?: TOutput;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  evidenceRefs: ToolEvidenceReference[];
  executedAt: string;
}

export interface NexusTool<TInput, TOutput> {
  name: string;
  version: string;
  description: string;
  risk: ToolRisk;
  requiredPermissions: readonly string[];
  inputSchema: ZodType<TInput>;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;
}
