import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/auth.middleware.js';
import { pool } from '../db/pool.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';

const EventIdSchema = z.string().uuid();
const AssessmentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();

const severityWeight: Record<string, number> = {
  informational: 0,
  low: 10,
  medium: 25,
  high: 45,
  critical: 60
};

function baselineRiskScore(severity: string, relatedEvents: number): number {
  const base = severityWeight[severity] ?? 0;
  const velocity = Math.min(20, Math.max(0, (relatedEvents - 1) * 2));
  return Math.min(100, Math.max(0, base + velocity));
}

export function createThreatIntelligenceRouter(
  requireWorkspace: RequestHandler = createRequireWorkspace()
) {
  const router = Router();

  router.get(
    '/threat-intelligence/overview',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst', 'viewer'),
    async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM threat_indicators
               WHERE workspace_id = $1 AND (expires_at IS NULL OR expires_at > NOW())) AS active_indicators,
             (SELECT COUNT(*)::int FROM threat_risk_assessments
               WHERE workspace_id = $1 AND assessed_at >= NOW() - INTERVAL '24 hours') AS assessments_24h,
             (SELECT COUNT(*)::int FROM threat_anomaly_findings
               WHERE workspace_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') AS anomalies_24h,
             (SELECT COUNT(*)::int FROM threat_early_warnings
               WHERE workspace_id = $1 AND status = 'open') AS open_warnings,
             (SELECT COUNT(*)::int FROM security_events
               WHERE workspace_id = $1 AND received_at >= NOW() - INTERVAL '24 hours') AS events_24h`,
          [req.workspaceContext!.id]
        );
        const row = result.rows[0] ?? {};
        return res.status(200).json({
          status: 'ok',
          data_source: 'postgresql',
          workspace_id: req.workspaceContext!.id,
          analytics_mode: 'persisted_baseline_analytics',
          metrics: {
            active_indicators: Number(row.active_indicators ?? 0),
            assessments_24h: Number(row.assessments_24h ?? 0),
            anomalies_24h: Number(row.anomalies_24h ?? 0),
            open_warnings: Number(row.open_warnings ?? 0),
            events_24h: Number(row.events_24h ?? 0)
          },
          trained_model_active: false,
          external_intelligence_feeds_active: false
        });
      } catch {
        return res.status(503).json({ error: 'THREAT_INTELLIGENCE_UNAVAILABLE' });
      }
    }
  );

  router.post(
    '/threat-intelligence/events/:id/assess',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst'),
    async (req, res) => {
      const parsedId = EventIdSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({ error: 'INVALID_SECURITY_EVENT_ID' });
      }

      const workspaceId = req.workspaceContext!.id;
      try {
        const eventResult = await pool.query(
          `SELECT id, event_type, severity, observed_at
             FROM security_events
            WHERE workspace_id = $1 AND id = $2
            LIMIT 1`,
          [workspaceId, parsedId.data]
        );
        const event = eventResult.rows[0];
        if (!event) return res.status(404).json({ error: 'SECURITY_EVENT_NOT_FOUND' });

        const velocityResult = await pool.query(
          `SELECT COUNT(*)::int AS event_count
             FROM security_events
            WHERE workspace_id = $1
              AND event_type = $2
              AND observed_at >= $3::timestamptz - INTERVAL '24 hours'
              AND observed_at <= $3::timestamptz`,
          [workspaceId, event.event_type, event.observed_at]
        );
        const relatedEvents = Number(velocityResult.rows[0]?.event_count ?? 1);
        const riskScore = baselineRiskScore(event.severity, relatedEvents);
        const confidence = Math.min(0.95, 0.5 + Math.min(relatedEvents, 10) * 0.04);
        const assessmentId = randomUUID();
        const evidence = [{
          type: 'severity',
          value: event.severity
        }, {
          type: 'event_velocity_24h',
          value: relatedEvents
        }];

        await pool.query(
          `INSERT INTO threat_risk_assessments
             (id, workspace_id, security_event_id, risk_score, confidence,
              assessment_method, model_version, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            assessmentId,
            workspaceId,
            event.id,
            riskScore,
            confidence,
            'severity_plus_24h_event_velocity',
            'nexus-baseline-heuristic-0.1.0',
            JSON.stringify(evidence)
          ]
        );

        let anomalyRecorded = false;
        const anomalyThreshold = 5;
        if (relatedEvents >= anomalyThreshold) {
          await pool.query(
            `INSERT INTO threat_anomaly_findings
               (id, workspace_id, security_event_id, anomaly_score, threshold,
                detection_method, model_version, evidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
            [
              randomUUID(),
              workspaceId,
              event.id,
              relatedEvents,
              anomalyThreshold,
              '24h_event_type_velocity_threshold',
              'nexus-baseline-heuristic-0.1.0',
              JSON.stringify(evidence)
            ]
          );
          anomalyRecorded = true;
        }

        return res.status(201).json({
          status: 'assessed',
          assessment: {
            id: assessmentId,
            security_event_id: event.id,
            risk_score: riskScore,
            confidence: Number(confidence.toFixed(4)),
            risk_band: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
            method: 'severity_plus_24h_event_velocity',
            model_version: 'nexus-baseline-heuristic-0.1.0',
            evidence,
            assessed_at: new Date().toISOString()
          },
          anomaly_recorded: anomalyRecorded,
          anomaly_threshold: anomalyThreshold,
          trained_model_used: false,
          disclaimer: 'Deterministic baseline heuristic based on event severity and same-type event volume. This is not a trained predictive model or proof of compromise.'
        });
      } catch {
        return res.status(503).json({ error: 'THREAT_ASSESSMENT_UNAVAILABLE' });
      }
    }
  );

  router.get(
    '/threat-intelligence/assessments',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst', 'viewer'),
    async (req, res) => {
      const parsed = AssessmentQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'INVALID_QUERY', details: parsed.error.flatten() });
      }
      try {
        const result = await pool.query(
          `SELECT id, security_event_id, risk_score, confidence, assessment_method,
                  model_version, evidence, assessed_at
             FROM threat_risk_assessments
            WHERE workspace_id = $1
            ORDER BY assessed_at DESC, id
            LIMIT $2 OFFSET $3`,
          [req.workspaceContext!.id, parsed.data.limit, parsed.data.offset]
        );
        return res.status(200).json({
          status: 'ok',
          assessments: result.rows,
          pagination: { limit: parsed.data.limit, offset: parsed.data.offset }
        });
      } catch {
        return res.status(503).json({ error: 'THREAT_ASSESSMENT_UNAVAILABLE' });
      }
    }
  );

  return router;
}

export const threatIntelligenceRouter = createThreatIntelligenceRouter();
