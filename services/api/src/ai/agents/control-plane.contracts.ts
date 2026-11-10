/**
 * NEXUS SHIELD AI — multi-agent control-plane contracts.
 *
 * Contract-only foundation: these definitions do not imply that specialist
 * agent runtimes, autonomous tools, or workflow orchestration are deployed.
 * Agent execution must remain workspace-scoped and evidence-backed.
 */

export type AgentId =
  | 'supervisor'
  | 'threat-intelligence'
  | 'attack-path-analysis'
  | 'vulnerability-assessment'
  | 'incident-investigation'
  | 'network-security'
  | 'defense-recommendations';

export type AgentCapability =
  | 'threat-intelligence:correlate'
  | 'attack-paths:analyze'
  | 'vulnerabilities:assess'
  | 'incidents:investigate'
  | 'network:analyze'
  | 'defense:recommend'
  | 'agents:coordinate';

export type AgentPermission =
  | 'security-events:read'
  | 'threat-indicators:read'
  | 'assets:read'
  | 'attack-paths:read'
  | 'vulnerability-findings:read'
  | 'incidents:read'
  | 'recommendations:write'
  | 'agents:delegate';

export type AgentExecutionMode = 'read-only-analysis' | 'recommendation-only';
export type ApprovalPolicy = 'not-required-for-analysis' | 'human-required-before-action';

export interface AgentDefinition {
  readonly id: AgentId;
  readonly displayName: string;
  readonly description: string;
  readonly capabilities: readonly AgentCapability[];
  readonly permissions: readonly AgentPermission[];
  readonly executionMode: AgentExecutionMode;
  readonly approvalPolicy: ApprovalPolicy;
  readonly maturity: 'contract-only';
}

export interface AgentEvidenceReference {
  readonly kind: 'security-event' | 'indicator' | 'asset' | 'attack-path' | 'vulnerability' | 'incident';
  readonly referenceId: string;
  readonly observedAt: string;
  readonly source: string;
}

export interface AgentFinding {
  readonly code: string;
  readonly title: string;
  readonly severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  /** Assessment is not a confirmed incident fact. */
  readonly confidence: number;
  readonly summary: string;
  readonly evidence: readonly AgentEvidenceReference[];
}

export interface AgentExecutionContext {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly requestedAgent: AgentId;
  readonly correlationId: string;
  readonly deadlineAt: string;
  readonly approvalGranted: boolean;
}

export interface AgentExecutionResult {
  readonly agentId: AgentId;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly status: 'completed' | 'blocked' | 'failed';
  readonly findings: readonly AgentFinding[];
  readonly recommendations: readonly string[];
  readonly requiresHumanApproval: boolean;
  readonly modelVersion?: string;
}

const READ_ANALYSIS: readonly AgentPermission[] = [
  'security-events:read',
  'threat-indicators:read',
  'assets:read',
  'attack-paths:read',
  'vulnerability-findings:read',
  'incidents:read'
];

export const AGENT_REGISTRY: readonly AgentDefinition[] = [
  {
    id: 'supervisor',
    displayName: 'NEXUS AI Supervisor',
    description: 'Coordinates scoped specialist analysis and consolidates evidence-backed results.',
    capabilities: ['agents:coordinate'],
    permissions: ['agents:delegate'],
    executionMode: 'read-only-analysis',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  },
  {
    id: 'threat-intelligence',
    displayName: 'Threat Intelligence Agent',
    description: 'Correlates workspace-scoped indicators and provenance-bearing security events.',
    capabilities: ['threat-intelligence:correlate'],
    permissions: READ_ANALYSIS,
    executionMode: 'read-only-analysis',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  },
  {
    id: 'attack-path-analysis',
    displayName: 'Attack Path Analysis Agent',
    description: 'Analyzes approved asset and attack-path evidence without executing attacks.',
    capabilities: ['attack-paths:analyze'],
    permissions: READ_ANALYSIS,
    executionMode: 'read-only-analysis',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  },
  {
    id: 'vulnerability-assessment',
    displayName: 'Vulnerability Assessment Agent',
    description: 'Reviews existing vulnerability findings and evidence within the active workspace.',
    capabilities: ['vulnerabilities:assess'],
    permissions: READ_ANALYSIS,
    executionMode: 'read-only-analysis',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  },
  {
    id: 'incident-investigation',
    displayName: 'Incident Investigation Agent',
    description: 'Builds evidence-backed incident timelines from authorized records.',
    capabilities: ['incidents:investigate'],
    permissions: READ_ANALYSIS,
    executionMode: 'read-only-analysis',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  },
  {
    id: 'network-security',
    displayName: 'Network Security Agent',
    description: 'Analyzes submitted or collected authorized network telemetry; performs no probing.',
    capabilities: ['network:analyze'],
    permissions: READ_ANALYSIS,
    executionMode: 'read-only-analysis',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  },
  {
    id: 'defense-recommendations',
    displayName: 'Defense Recommendations Agent',
    description: 'Produces defensive recommendations; changes require a separate human-approved workflow.',
    capabilities: ['defense:recommend'],
    permissions: [...READ_ANALYSIS, 'recommendations:write'],
    executionMode: 'recommendation-only',
    approvalPolicy: 'human-required-before-action',
    maturity: 'contract-only'
  }
];

export function getAgentDefinition(agentId: AgentId): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((agent) => agent.id === agentId);
}

export function isWorkspaceContextValid(context: AgentExecutionContext): boolean {
  return Boolean(
    context.taskId.trim() &&
    context.workspaceId.trim() &&
    context.actorUserId.trim() &&
    context.correlationId.trim()
  );
}

/** Confidence must be a finite probability in [0, 1]. */
export function isValidAgentFinding(finding: AgentFinding): boolean {
  return Number.isFinite(finding.confidence) &&
    finding.confidence >= 0 &&
    finding.confidence <= 1 &&
    finding.evidence.length > 0 &&
    finding.evidence.every((evidence) =>
      Boolean(evidence.referenceId.trim() && evidence.source.trim()) &&
      Number.isFinite(Date.parse(evidence.observedAt))
    );
}
