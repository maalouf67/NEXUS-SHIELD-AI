import { z } from 'zod';

/**
 * Software-engineering agents are intentionally separate from the security
 * analysis agents in ../ai/agents/control-plane.contracts.ts.
 */
export const ENGINEERING_AGENT_IDS = [
  'product-planner',
  'system-architect',
  'frontend-developer',
  'backend-developer',
  'code-reviewer',
  'qa-testing',
  'devsecops-security',
  'devops-cicd',
  'technical-writer',
  'release-maintenance'
] as const;

export const EngineeringAgentIdSchema = z.enum(ENGINEERING_AGENT_IDS);
export type EngineeringAgentId = z.infer<typeof EngineeringAgentIdSchema>;

export const TaskStatusSchema = z.enum([
  'queued',
  'triaged',
  'ready',
  'running',
  'blocked',
  'review',
  'verified',
  'completed',
  'failed',
  'cancelled'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const TaskRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

const actorIdSchema = z.string().trim().min(1).max(128);
export const TaskActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('human'), id: actorIdSchema }).strict(),
  z.object({ kind: z.literal('orchestrator'), id: z.literal('orchestrator') }).strict(),
  z.object({ kind: z.literal('agent'), id: EngineeringAgentIdSchema }).strict(),
  z.object({ kind: z.literal('github'), id: actorIdSchema }).strict()
]);
export type TaskActor = z.infer<typeof TaskActorSchema>;

const isoDateTimeSchema = z.string().datetime({ offset: true });
const backslash = String.fromCharCode(92);
const relativeRepositoryPathSchema = z.string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) =>
    !value.startsWith('/') &&
    !value.startsWith(backslash) &&
    !value.includes(backslash) &&
    !value.split('/').some((segment) => segment === '..' || segment === '.'),
  'Paths must be repository-relative and must not traverse parent directories.');

const featureBranchSchema = z.string()
  .trim()
  .min(3)
  .max(255)
  .regex(/^(feat|fix|docs|test|chore)\/[a-z0-9][a-z0-9._/-]*$/i)
  .refine((value) => !value.includes('..') && !value.endsWith('.lock'),
    'Tasks must use a dedicated non-protected feature branch.');

export const EngineeringTaskEnvelopeSchema = z.object({
  schemaVersion: z.literal('1'),
  taskId: z.string().uuid(),
  correlationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(16).max(128),
  repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: featureBranchSchema,
  issueNumber: z.number().int().positive(),
  requestedBy: z.string().trim().min(1).max(128),
  assignedAgent: EngineeringAgentIdSchema,
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(8000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  allowedPaths: z.array(relativeRepositoryPathSchema).min(1).max(40)
    .refine((paths) => new Set(paths).size === paths.length, 'Allowed paths must be unique.'),
  priority: TaskPrioritySchema,
  riskLevel: TaskRiskLevelSchema,
  requiresHumanApproval: z.boolean(),
  requestedAt: isoDateTimeSchema
}).strict();
export type EngineeringTaskEnvelope = z.infer<typeof EngineeringTaskEnvelopeSchema>;

export const TaskTestOutcomeSchema = z.enum(['passed', 'failed', 'skipped', 'not_run']);

export const EngineeringTaskResultSchema = z.object({
  taskId: z.string().uuid(),
  agentId: EngineeringAgentIdSchema,
  status: z.enum(['completed', 'blocked', 'failed']),
  summary: z.string().trim().min(1).max(4000),
  changedFiles: z.array(relativeRepositoryPathSchema).max(200),
  evidence: z.array(z.object({
    kind: z.enum(['commit', 'pull_request', 'check_run', 'test_result', 'file', 'issue']),
    reference: z.string().trim().min(1).max(2048),
    description: z.string().trim().min(1).max(1000)
  }).strict()).max(100),
  tests: z.array(z.object({
    name: z.string().trim().min(1).max(180),
    outcome: TaskTestOutcomeSchema,
    details: z.string().max(2000).optional()
  }).strict()).max(100),
  riskNotes: z.array(z.string().trim().min(1).max(1000)).max(50),
  followUpActions: z.array(z.string().trim().min(1).max(1000)).max(50),
  completedAt: isoDateTimeSchema
}).strict();
export type EngineeringTaskResult = z.infer<typeof EngineeringTaskResultSchema>;

export const TaskEventSchema = z.object({
  eventId: z.string().uuid(),
  taskId: z.string().uuid(),
  correlationId: z.string().uuid(),
  eventType: z.enum([
    'task.created',
    'task.status_changed',
    'task.agent_assigned',
    'task.approval_decided',
    'task.result_recorded',
    'task.retry_requested'
  ]),
  previousStatus: TaskStatusSchema.nullable(),
  nextStatus: TaskStatusSchema,
  actor: TaskActorSchema,
  reason: z.string().trim().max(2000).optional(),
  occurredAt: isoDateTimeSchema
}).strict();
export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const ApprovalScopeSchema = z.enum([
  'merge_main',
  'production_deploy',
  'repository_settings',
  'database_migration',
  'credential_change',
  'policy_exception',
  'release_publish'
]);

export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  taskId: z.string().uuid(),
  scope: ApprovalScopeSchema,
  decision: z.enum(['approved', 'rejected', 'revoked']),
  requestedBy: z.string().trim().min(1).max(128),
  decidedBy: z.string().trim().min(1).max(128),
  rationale: z.string().trim().min(1).max(2000),
  decidedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.optional()
}).strict();
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/** Audit records omit arbitrary payloads and secret-bearing metadata. */
export const TaskAuditRecordSchema = z.object({
  auditId: z.string().uuid(),
  taskId: z.string().uuid(),
  correlationId: z.string().uuid(),
  actor: TaskActorSchema,
  action: z.string().trim().min(2).max(128).regex(/^[a-z0-9:._-]+$/i),
  target: z.string().trim().min(1).max(512),
  outcome: z.enum(['succeeded', 'rejected', 'failed']),
  reasonCode: z.string().trim().min(1).max(128).optional(),
  occurredAt: isoDateTimeSchema
}).strict();
export type TaskAuditRecord = z.infer<typeof TaskAuditRecordSchema>;
