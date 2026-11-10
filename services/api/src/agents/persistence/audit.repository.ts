import { randomUUID } from 'node:crypto';
import type { ToolRisk } from '../../tools/contracts/tool.interface.js';
import { withWorkspaceTransaction } from '../../db/workspace-transaction.js';

export type AgentToolAuditEventType = 'requested' | 'denied' | 'started' | 'succeeded' | 'failed';

export interface AgentToolAuditEvent {
  workspaceId: string;
  runId: string;
  requestId: string;
  agentId: string;
  actorUserId: string;
  toolName: string;
  toolVersion: string;
  risk: ToolRisk;
  eventType: AgentToolAuditEventType;
  inputHash: string;
  idempotencyKey: string;
  reasonCode?: string;
}

/** Append-only audit writer. Raw inputs, tokens, and tool outputs are never stored. */
export class PostgresAgentToolAuditRepository {
  async append(event: AgentToolAuditEvent): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(event.inputHash)) throw new Error('INVALID_AUDIT_INPUT_HASH');
    if (!event.requestId || !event.runId || !event.actorUserId || !event.idempotencyKey) {
      throw new Error('INVALID_AUDIT_CONTEXT');
    }

    const id = randomUUID();
    await withWorkspaceTransaction(event.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO agent_tool_audit_logs (
          id, workspace_id, run_id, request_id, agent_id, actor_user_id,
          tool_name, tool_version, risk, event_type, reason_code, input_hash, idempotency_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id, event.workspaceId, event.runId, event.requestId, event.agentId,
          event.actorUserId, event.toolName, event.toolVersion, event.risk,
          event.eventType, event.reasonCode ?? null, event.inputHash, event.idempotencyKey
        ]
      );
    });
    return id;
  }
}
