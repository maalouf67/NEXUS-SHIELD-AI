import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { createRequireWorkspace, createRequireWorkspaceIntegration, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';
import {
  securityEventRepository,
  type SecurityEventRepository,
  type SecurityEventSeverity,
  type SecurityEventReviewStatus
} from './security-event.repository.js';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

const SecurityEventInputSchema = z.object({
  source: z.string().trim().min(2).max(64).regex(
    /^[a-zA-Z0-9._-]+$/,
    'source may contain only letters, digits, dots, underscores, and hyphens'
  ),
  externalEventId: boundedText(128),
  eventType: boundedText(128),
  severity: z.enum(['informational', 'low', 'medium', 'high', 'critical']),
  observedAt: z.string().datetime({ offset: true }),
  assetId: z.string().trim().min(1).max(128).optional(),
  summary: boundedText(1000),
  attributes: z.record(z.string(), z.string().trim().max(500)).default({})
    .refine((value) => Object.keys(value).length <= 20, 'attributes may contain at most 20 string fields')
}).strict();

const IngestSecurityEventsRequestSchema = z.object({
  events: z.array(SecurityEventInputSchema).min(1).max(100)
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();

  input.events.forEach((event, index) => {
    const key = `${event.source}:${event.externalEventId}`;
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        path: ['events', index, 'externalEventId'],
        message: 'The batch contains a duplicate source and external event ID.'
      });
    }
    seen.add(key);
  });
});

const ListSecurityEventsQuerySchema = z.object({
  severity: z.enum(['informational', 'low', 'medium', 'high', 'critical']).optional(),
  source: z.string().trim().min(2).max(64).optional(),
  reviewStatus: z.enum(['new', 'reviewed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();

const ReviewSecurityEventRequestSchema = z.object({
  note: z.string().trim().max(1000).optional()
}).strict();

const EventIdSchema = z.string().uuid();

export function createSecurityEventsRouter(
  repository: SecurityEventRepository = securityEventRepository,
  requireWorkspace: RequestHandler = createRequireWorkspace(),
  requireEventsWrite: RequestHandler = createRequireWorkspaceIntegration('events:write')
) {
  const router = Router();

  router.post(
    '/integrations/security-events',
    requireEventsWrite,
    async (req, res) => {
      const parsed = IngestSecurityEventsRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          details: parsed.error.flatten()
        });
      }

      try {
        const result = await repository.ingestBatch(req.workspaceIntegration!.workspaceId, parsed.data.events);
        return res.status(202).json({
          status: 'accepted',
          ...result,
          batch_size: parsed.data.events.length,
          idempotent_key: 'source + externalEventId',
          incidents_created: 0,
          alerts_created: 0,
          automated_response_performed: false,
          note: 'Events were stored for analyst review. Ingestion does not independently verify detections or perform containment.'
        });
      } catch {
        return res.status(503).json({
          error: 'SECURITY_EVENT_STORE_UNAVAILABLE',
          message: 'The event batch could not be committed. No partial batch was retained.'
        });
      }
    }
  );

  router.get(
    '/security-events',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst', 'viewer'),
    async (req, res) => {
      const parsed = ListSecurityEventsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_QUERY',
          details: parsed.error.flatten()
        });
      }

      try {
        const result = await repository.list(req.workspaceContext!.id, {
          ...parsed.data,
          severity: parsed.data.severity as SecurityEventSeverity | undefined,
          reviewStatus: parsed.data.reviewStatus as SecurityEventReviewStatus | undefined
        });
        return res.status(200).json({
          status: 'ok',
          events: result.events,
          pagination: {
            limit: parsed.data.limit,
            offset: parsed.data.offset,
            total: result.total,
            has_more: parsed.data.offset + result.events.length < result.total
          }
        });
      } catch {
        return res.status(503).json({
          error: 'SECURITY_EVENT_STORE_UNAVAILABLE',
          message: 'Security events could not be loaded from the database.'
        });
      }
    }
  );

  router.post(
    '/security-events/:id/review',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst'),
    async (req, res) => {
      const parsedId = EventIdSchema.safeParse(req.params.id);
      const parsedBody = ReviewSecurityEventRequestSchema.safeParse(req.body ?? {});

      if (!parsedId.success) {
        return res.status(400).json({ error: 'INVALID_SECURITY_EVENT_ID' });
      }
      if (!parsedBody.success) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          details: parsedBody.error.flatten()
        });
      }

      try {
        const result = await repository.review(
          req.workspaceContext!.id,
          parsedId.data,
          req.authUser!.id,
          parsedBody.data.note
        );

        if (result.outcome === 'not_found') {
          return res.status(404).json({ error: 'SECURITY_EVENT_NOT_FOUND' });
        }

        if (result.outcome === 'already_reviewed') {
          return res.status(200).json({
            status: 'already_reviewed',
            event: result.event,
            audit_recorded: false
          });
        }

        return res.status(200).json({
          status: 'reviewed',
          event: result.event,
          audit_recorded: true,
          automated_response_performed: false
        });
      } catch {
        return res.status(503).json({
          error: 'SECURITY_EVENT_STORE_UNAVAILABLE',
          message: 'The security event could not be reviewed.'
        });
      }
    }
  );

  return router;
}

export const securityEventsRouter = createSecurityEventsRouter();
