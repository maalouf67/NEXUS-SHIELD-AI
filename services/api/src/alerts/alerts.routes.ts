import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/auth.middleware.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';
import type { RequestHandler } from 'express';
import {
  alertRepository,
  type AlertRepository,
  type AlertStatus
} from './alert.repository.js';

const AlertStatusSchema = z.enum(['active', 'acknowledged', 'resolved']);

const ListAlertsQuerySchema = z.object({
  status: AlertStatusSchema.optional(),
  minimumRiskScore: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();

const CreateAlertRequestSchema = z.object({
  type: z.string().trim().min(1).max(128),
  riskScore: z.number().int().min(0).max(100),
  note: z.string().trim().max(1000).optional()
}).strict();

const UpdateAlertStatusRequestSchema = z.object({
  status: AlertStatusSchema,
  note: z.string().trim().max(1000).optional()
}).strict();

const IdSchema = z.string().uuid();

export function createAlertsRouter(
  repository: AlertRepository = alertRepository,
  requireWorkspace: RequestHandler = createRequireWorkspace()
) {
  const router = Router();

  router.get('/alerts', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst', 'viewer'), async (req, res) => {
    const parsed = ListAlertsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_QUERY',
        details: parsed.error.flatten()
      });
    }

    try {
      const result = await repository.list(req.workspaceContext!.id, parsed.data);
      return res.status(200).json({
        status: 'ok',
        alerts: result.alerts,
        pagination: {
          limit: parsed.data.limit,
          offset: parsed.data.offset,
          total: result.total,
          has_more: parsed.data.offset + result.alerts.length < result.total
        }
      });
    } catch {
      return res.status(503).json({
        error: 'ALERT_STORE_UNAVAILABLE',
        message: 'Alerts could not be loaded from the database.'
      });
    }
  });

  router.post('/incidents/:id/alerts', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst'), async (req, res) => {
    const parsedId = IdSchema.safeParse(req.params.id);
    const parsedBody = CreateAlertRequestSchema.safeParse(req.body);

    if (!parsedId.success) {
      return res.status(400).json({ error: 'INVALID_INCIDENT_ID' });
    }
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsedBody.error.flatten()
      });
    }

    try {
      const alert = await repository.create({
        workspaceId: req.workspaceContext!.id,
        id: randomUUID(),
        incidentId: parsedId.data,
        type: parsedBody.data.type,
        riskScore: parsedBody.data.riskScore,
        actorUserId: req.authUser!.id,
        note: parsedBody.data.note
      });

      if (!alert) {
        return res.status(404).json({ error: 'INCIDENT_NOT_FOUND' });
      }

      return res.status(201).json({
        status: 'created',
        alert,
        audit_recorded: true,
        external_detection_performed: false,
        message: 'Alert recorded from submitted information. No external detection or response action was performed.'
      });
    } catch {
      return res.status(503).json({
        error: 'ALERT_STORE_UNAVAILABLE',
        message: 'The alert could not be recorded.'
      });
    }
  });

  router.patch('/alerts/:id/status', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst'), async (req, res) => {
    const parsedId = IdSchema.safeParse(req.params.id);
    const parsedBody = UpdateAlertStatusRequestSchema.safeParse(req.body);

    if (!parsedId.success) {
      return res.status(400).json({ error: 'INVALID_ALERT_ID' });
    }
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsedBody.error.flatten()
      });
    }

    try {
      const result = await repository.updateStatus({
        workspaceId: req.workspaceContext!.id,
        alertId: parsedId.data,
        status: parsedBody.data.status as AlertStatus,
        actorUserId: req.authUser!.id,
        actorRole: req.workspaceContext!.role,
        note: parsedBody.data.note
      });

      if (result.outcome === 'not_found') {
        return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
      }
      if (result.outcome === 'invalid_transition') {
        return res.status(409).json({
          error: 'INVALID_ALERT_STATUS_TRANSITION',
          current_status: result.currentStatus,
          requested_status: parsedBody.data.status
        });
      }

      return res.status(200).json({
        status: 'updated',
        alert: result.alert,
        audit_recorded: true,
        automated_response_performed: false
      });
    } catch {
      return res.status(503).json({
        error: 'ALERT_STORE_UNAVAILABLE',
        message: 'The alert status could not be updated.'
      });
    }
  });

  return router;
}

export const alertsRouter = createAlertsRouter();
