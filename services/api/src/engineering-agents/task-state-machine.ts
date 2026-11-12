import { z } from 'zod';
import {
  TaskActorSchema,
  TaskEventSchema,
  TaskStatusSchema,
  type TaskEvent,
  type TaskStatus
} from './orchestrator.contracts.js';

export const TaskStateSnapshotSchema = z.object({
  taskId: z.string().uuid(),
  status: TaskStatusSchema,
  revision: z.number().int().min(0),
  updatedAt: z.string().datetime({ offset: true })
}).strict();
export type TaskStateSnapshot = z.infer<typeof TaskStateSnapshotSchema>;

export const TaskTransitionCommandSchema = z.object({
  eventId: z.string().uuid(),
  taskId: z.string().uuid(),
  expectedStatus: TaskStatusSchema,
  expectedRevision: z.number().int().min(0),
  nextStatus: TaskStatusSchema,
  correlationId: z.string().uuid(),
  actor: TaskActorSchema,
  reason: z.string().trim().max(2000).optional(),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

const ALLOWED_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ['triaged', 'cancelled'],
  triaged: ['ready', 'blocked', 'cancelled'],
  ready: ['running', 'blocked', 'cancelled'],
  running: ['review', 'blocked', 'failed', 'cancelled'],
  blocked: ['ready', 'running', 'failed', 'cancelled'],
  review: ['running', 'verified', 'blocked', 'failed'],
  verified: ['completed', 'running', 'blocked'],
  completed: [],
  failed: [],
  cancelled: []
};

const REASON_REQUIRED = new Set<TaskStatus>(['blocked', 'failed', 'cancelled']);

export type TaskTransitionFailureCode =
  | 'INVALID_STATE'
  | 'INVALID_COMMAND'
  | 'TASK_ID_MISMATCH'
  | 'STALE_STATE'
  | 'TRANSITION_NOT_ALLOWED'
  | 'REASON_REQUIRED';

export type TaskTransitionResult =
  | { ok: true; state: TaskStateSnapshot; event: TaskEvent }
  | { ok: false; code: TaskTransitionFailureCode; message: string };

export function createInitialTaskState(taskId: string, createdAt: string): TaskStateSnapshot {
  return TaskStateSnapshotSchema.parse({
    taskId,
    status: 'queued',
    revision: 0,
    updatedAt: createdAt
  });
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Pure state transition. The caller supplies eventId and occurredAt so retries
 * are reproducible. Persistence, event de-duplication and actor authentication
 * are enforced by later orchestration layers, not by this function.
 */
export function transitionTask(current: unknown, command: unknown): TaskTransitionResult {
  const stateResult = TaskStateSnapshotSchema.safeParse(current);
  if (!stateResult.success) {
    return { ok: false, code: 'INVALID_STATE', message: 'Invalid task state snapshot.' };
  }

  const commandResult = TaskTransitionCommandSchema.safeParse(command);
  if (!commandResult.success) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'Invalid task transition command.' };
  }

  const state = stateResult.data;
  const request = commandResult.data;

  if (request.taskId !== state.taskId) {
    return { ok: false, code: 'TASK_ID_MISMATCH', message: 'Command targets another task.' };
  }

  if (request.expectedStatus !== state.status || request.expectedRevision !== state.revision) {
    return { ok: false, code: 'STALE_STATE', message: 'Reload task state before retrying.' };
  }

  if (!canTransitionTask(state.status, request.nextStatus)) {
    return { ok: false, code: 'TRANSITION_NOT_ALLOWED', message: 'The requested state transition is not allowed.' };
  }

  if (REASON_REQUIRED.has(request.nextStatus) && !request.reason?.trim()) {
    return { ok: false, code: 'REASON_REQUIRED', message: 'A reason is required for blocked, failed or cancelled tasks.' };
  }

  const nextState = TaskStateSnapshotSchema.parse({
    taskId: state.taskId,
    status: request.nextStatus,
    revision: state.revision + 1,
    updatedAt: request.occurredAt
  });

  const event = TaskEventSchema.parse({
    eventId: request.eventId,
    taskId: state.taskId,
    correlationId: request.correlationId,
    eventType: 'task.status_changed',
    previousStatus: state.status,
    nextStatus: request.nextStatus,
    actor: request.actor,
    reason: request.reason,
    occurredAt: request.occurredAt
  });

  return { ok: true, state: nextState, event };
}
