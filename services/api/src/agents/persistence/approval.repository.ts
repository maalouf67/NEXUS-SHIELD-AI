import type { ApprovalVerifier } from '../../tools/permissions/policy-engine.js';
import { withWorkspaceTransaction } from '../../db/workspace-transaction.js';

type WorkspaceTransactionRunner = typeof withWorkspaceTransaction;

export class PostgresAgentApprovalVerifier implements ApprovalVerifier {
  constructor(
    private readonly transaction: WorkspaceTransactionRunner = withWorkspaceTransaction
  ) {}

  async consumeApproval(input: Parameters<ApprovalVerifier['consumeApproval']>[0]): Promise<boolean> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE agent_tool_approvals AS approval
            SET status = 'consumed', consumed_at = NOW()
          WHERE approval.id = $1
            AND approval.workspace_id = $2
            AND approval.requester_user_id = $3
            AND approval.agent_id = $4
            AND approval.run_id = $5
            AND approval.tool_name = $6
            AND approval.tool_version = $7
            AND approval.input_hash = $8
            AND approval.idempotency_key = $9
            AND approval.risk = $10
            AND approval.status = 'approved'
            AND approval.expires_at > NOW()
            AND EXISTS (
              SELECT 1 FROM workspace_memberships approver_membership
              JOIN users approver ON approver.id = approver_membership.user_id
              WHERE approver_membership.workspace_id = approval.workspace_id
                AND approver_membership.user_id = approval.approved_by_user_id
                AND approver_membership.status = 'active'
                AND approver_membership.role = 'admin'
                AND approver.is_active = TRUE
            )
            AND EXISTS (
              SELECT 1 FROM workspace_memberships requester_membership
              JOIN users requester ON requester.id = requester_membership.user_id
              WHERE requester_membership.workspace_id = approval.workspace_id
                AND requester_membership.user_id = approval.requester_user_id
                AND requester_membership.status = 'active'
                AND requester.is_active = TRUE
            )
            AND EXISTS (
              SELECT 1 FROM workspaces
              WHERE id = approval.workspace_id AND status = 'active'
            )
          RETURNING approval.id`,
        [
          input.approvalId, input.workspaceId, input.actorUserId, input.agentId,
          input.runId, input.toolName, input.toolVersion, input.inputHash,
          input.idempotencyKey, input.risk
        ]
      );
      return result.rowCount === 1;
    });
  }
}
