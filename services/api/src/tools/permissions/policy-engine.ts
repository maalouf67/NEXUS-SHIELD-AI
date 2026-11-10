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
  risk: ToolRisk;
  requiredPermissions: readonly string[];
}

export interface ToolPolicyDecision {
  allowed: boolean;
  reason: 'PERMITTED' | PolicyDenialReason;
  approvalRequired: boolean;
}

export interface ApprovalVerifier {
  isValidApproval(input: {
    approvalId: string;
    workspaceId: string;
    actorUserId: string;
    runId: string;
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
    const { context, targetWorkspaceId, risk, requiredPermissions } = request;

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

    const valid = await this.approvalVerifier.isValidApproval({
      approvalId: context.approvedActionId,
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      runId: context.runId
    });

    if (!valid) {
      return { allowed: false, reason: 'APPROVAL_INVALID', approvalRequired: true };
    }

    return { allowed: true, reason: 'PERMITTED', approvalRequired: true };
  }
}
