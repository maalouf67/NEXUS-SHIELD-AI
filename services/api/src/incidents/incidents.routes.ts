import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/auth.middleware.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';
import type { RequestHandler } from 'express';
import {
  incidentRepository,
  type IncidentRepository,
  type IncidentStatus
} from './incident.repository.js';

const IncidentStatusSchema = z.enum([
  'open',
  'investigating',
  'contained',
  'resolved',
  'closed'
]);

const IncidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const ListIncidentsQuerySchema = z.object({
  status: IncidentStatusSchema.optional(),
  severity: IncidentSeveritySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();

const CreateIncidentRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  severity: IncidentSeveritySchema,
  source: z.string().trim().max(255).optional()
}).strict();

const UpdateIncidentStatusRequestSchema = z.object({
  status: IncidentStatusSchema,
  note: z.string().trim().max(1000).optional()
}).strict();

const IncidentIdSchema = z.string().uuid();

export function createIncidentsRouter(
  repository: IncidentRepository = incidentRepository,
  requireWorkspace: RequestHandler = createRequireWorkspace()
) {
  const router = Router();

  router.get('/incidents', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst', 'viewer'), async (req, res) => {
    const parsed = ListIncidentsQuerySchema.safeParse(req.query);
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
        incidents: result.incidents,
        pagination: {
          limit: parsed.data.limit,
          offset: parsed.data.offset,
          total: result.total,
          has_more: parsed.data.offset + result.incidents.length < result.total
        }
      });
    } catch {
      return res.status(503).json({
        error: 'INCIDENT_STORE_UNAVAILABLE',
        message: 'Incidents could not be loaded from the database.'
      });
    }
  });

  router.get('/incidents/:id', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst', 'viewer'), async (req, res) => {
    const parsedId = IncidentIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'INVALID_INCIDENT_ID' });
    }

    try {
      const incident = await repository.getById(parsedId.data, req.workspaceContext!.id);
      if (!incident) {
        return res.status(404).json({ error: 'INCIDENT_NOT_FOUND' });
      }
      return res.status(200).json({ status: 'ok', incident });
    } catch {
      return res.status(503).json({
        error: 'INCIDENT_STORE_UNAVAILABLE',
        message: 'The incident could not be loaded from the database.'
      });
    }
  });

  router.post('/incidents', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst'), async (req, res) => {
    const parsed = CreateIncidentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsed.error.flatten()
      });
    }

    try {
      const incident = await repository.create({
        workspaceId: req.workspaceContext!.id,
        id: randomUUID(),
        title: parsed.data.title,
        severity: parsed.data.severity,
        source: parsed.data.source,
        actorUserId: req.authUser!.id
      });
      return res.status(201).json({
        status: 'created',
        incident,
        message: 'Incident created. No automated response action was performed.'
      });
    } catch {
      return res.status(503).json({
        error: 'INCIDENT_STORE_UNAVAILABLE',
        message: 'The incident could not be created.'
      });
    }
  });

  router.patch('/incidents/:id/status', requireAuth, requireWorkspace, requireWorkspaceRole('admin', 'analyst'), async (req, res) => {
    const parsedId = IncidentIdSchema.safeParse(req.params.id);
    const parsedBody = UpdateIncidentStatusRequestSchema.safeParse(req.body);

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
      const result = await repository.updateStatus({
        workspaceId: req.workspaceContext!.id,
        incidentId: parsedId.data,
        status: parsedBody.data.status as IncidentStatus,
        note: parsedBody.data.note,
        actorUserId: req.authUser!.id,
        actorRole: req.workspaceContext!.role
      });

      if (result.outcome === 'not_found') {
        return res.status(404).json({ error: 'INCIDENT_NOT_FOUND' });
      }
      if (result.outcome === 'invalid_transition') {
        return res.status(409).json({
          error: 'INVALID_STATUS_TRANSITION',
          current_status: result.currentStatus,
          requested_status: parsedBody.data.status,
          message: 'The requested status transition is not allowed for this role or current state.'
        });
      }

      return res.status(200).json({
        status: 'updated',
        incident: result.incident,
        audit_recorded: true,
        automated_response_performed: false
      });
    } catch {
      return res.status(503).json({
        error: 'INCIDENT_STORE_UNAVAILABLE',
        message: 'The incident status could not be updated.'
      });
    }
  });

  return router;
}

export const incidentsRouter = createIncidentsRouter();
