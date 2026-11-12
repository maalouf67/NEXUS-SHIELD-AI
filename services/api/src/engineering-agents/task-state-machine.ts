import { z } from 'zod';

export const TaskStateSchema = z.enum(['queued', 'triaged', 'ready', 'running', 'blocked', 'review', 'verified', 'completed', 'failed', 'cancelled']);
export type TaskState = z.infer<typeof TaskStateSchema>;
