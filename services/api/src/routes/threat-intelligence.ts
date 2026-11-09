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
      const assessmentId = randomUUID();
      const anomalyId = randomUUID();
      const anomalyThreshold = 5;

      try {
        // One data-modifying CTE keeps the assessment and optional anomaly
        // record atomic. Every read and write is constrained to this workspace.
        const result = await pool.query(
          `WITH selected_event AS (
             SELECT id, event_type, severity, observed_at
               FROM security_events
              WHERE workspace_id = $1 AND id = $2
           ),
           velocity AS (
             SELECT e.id, e.event_type, e.severity, e.observed_at,
                    COUNT(s.id)::int AS event_count
               FROM selected_event e
               JOIN security_events s
                 ON s.workspace_id = $1
                AND s.event_type = e.event_type
                AND s.observed_at >= e.observed_at - INTERVAL '24 hours'
                AND s.observed_at <= e.observed_at
              GROUP BY e.id, e.event_type, e.severity, e.observed_at
           ),
           scored AS (
             SELECT *,
                    LEAST(100, (CASE severity
                      WHEN 'informational' THEN 0
                      WHEN 'low' THEN 10
                      WHEN 'medium' THEN 25
                      WHEN 'high' THEN 45
                      WHEN 'critical' THEN 60
                      ELSE 0 END) + LEAST(20, GREATEST(0, (event_count - 1) * 2)))::numeric(5,2) AS risk_score,
                    LEAST(0.95, 0.5 + LEAST(event_count, 10) * 0.04)::numeric(5,4) AS confidence
               FROM velocity
           ),
           assessment AS (
             INSERT INTO threat_risk_assessments
               (id, workspace_id, security_event_id, risk_score, confidence,
                assessment_method, model_version, evidence)
             SELECT $3, $1, id, risk_score, confidence,
                    'severity_plus_24h_event_velocity',
                    'nexus-baseline-heuristic-0.1.0',
                    jsonb_build_array(
                      jsonb_build_object('type', 'severity', 'value', severity),
                      jsonb_build_object('type', 'event_velocity_24h', 'value', event_count)
                    )
               FROM scored
             RETURNING id, security_event_id, risk_score, confidence,
                       assessment_method, model_version, evidence, assessed_at
           ),
           anomaly AS (
             INSERT INTO threat_anomaly_findings
               (id, workspace_id, security_event_id, anomaly_score, threshold,
                detection_method, model_version, evidence)
             SELECT $4, $1, id, event_count, $5,
                    '24h_event_type_velocity_threshold',
                    'nexus-baseline-heuristic-0.1.0',
                    jsonb_build_array(
                      jsonb_build_object('type', 'severity', 'value', severity),
                      jsonb_build_object('type', 'event_velocity_24h', 'value', event_count)
                    )
               FROM scored
              WHERE event_count >= $5
             RETURNING id
           )
           SELECT assessment.*, scored.event_count,
                  EXISTS (SELECT 1 FROM anomaly) AS anomaly_recorded
             FROM assessment CROSS JOIN scored`,
          [workspaceId, parsedId.data, assessmentId, anomalyId, anomalyThreshold]
        );
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'SECURITY_EVENT_NOT_FOUND' });

        const riskScore = Number(row.risk_score);
        return res.status(201).json({
          status: 'assessed',
          assessment: {
            id: row.id,
            security_event_id: row.security_event_id,
            risk_score: riskScore,
            confidence: Number(row.confidence),
            risk_band: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
            method: row.assessment_method,
            model_version: row.model_version,
            evidence: row.evidence,
            assessed_at: row.assessed_at
          },
          event_velocity_24h: Number(row.event_count),
          anomaly_recorded: Boolean(row.anomaly_recorded),
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
