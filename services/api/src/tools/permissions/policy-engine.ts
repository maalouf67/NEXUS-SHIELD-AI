import type { ToolExecutionContext, ToolRisk } from '../contracts/tool.interface.js';

export type PolicyDenialReason =
  | 'WORKSPACE_MISMATCH'
  | 'MISSING_PERMISSION'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_INVALID'
  | 'POLICY_DENIED';

export interface ToolPolicyRequest {
  context: ToolExecutionContext;
  targetWorkspaceId: string;
  toolName: string;
  toolVersion: string;
  inputHash: string;
  risk: ToolRisk;
  requiredPermissions: readonly string[];
}

export interface ToolPolicyDecision {
  allowed: boolean;
  reason: 'PERMITTED' | PolicyDenialReason;
  approvalRequired: boolean;
}

export interface ApprovalVerifier {
  /**
   * Atomically consumes a one-time approval bound to this exact action.
   * Implementations must verify approver authority and persist consumption.
   */
  consumeApproval(input: {
    approvalId: string;
    workspaceId: string;
    actorUserId: string;
    agentId: string;
    runId: string;
    toolName: string;
    toolVersion: string;
    inputHash: string;
    idempotencyKey: string;
    risk: ToolRisk;
  }): Promise<boolean>;
}

const approvalRequiredRisks = new Set<ToolRisk>([
  'write',
  'defensive_action',
  'destructive'
]);

export class ToolPolicyEngine {
  constructor(private readonly approvalVerifier: ApprovalVerifier) {}

  async authorize(request: ToolPolicyRequest): Promise<ToolPolicyDecision> {
    const {
      context,
      targetWorkspaceId,
      toolName,
      toolVersion,
      inputHash,
      risk,
      requiredPermissions
    } = request;

    if (!context.workspaceId || context.workspaceId !== targetWorkspaceId) {
      return { allowed: false, reason: 'WORKSPACE_MISMATCH', approvalRequired: false };
    }

    if (requiredPermissions.some((permission) => !context.permissions.includes(permission))) {
      return { allowed: false, reason: 'MISSING_PERMISSION', approvalRequired: false };
    }

    const approvalRequired = approvalRequiredRisks.has(risk);
    if (!approvalRequired) {
      return { allowed: true, reason: 'PERMITTED', approvalRequired: false };
    }

    if (!context.approvedActionId) {
      return { allowed: false, reason: 'APPROVAL_REQUIRED', approvalRequired: true };
    }

    const consumed = await this.approvalVerifier.consumeApproval({
      approvalId: context.approvedActionId,
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      agentId: context.agentId,
      runId: context.runId,
      toolName,
      toolVersion,
      inputHash,
      idempotencyKey: context.idempotencyKey,
      risk
    });

    if (!consumed) {
      return { allowed: false, reason: 'APPROVAL_INVALID', approvalRequired: true };
    }

    return { allowed: true, reason: 'PERMITTED', approvalRequired: true };
  }
}
