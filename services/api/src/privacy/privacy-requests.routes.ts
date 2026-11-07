import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const RequestSchema = z.object({
  request_type: z.enum(['access','rectification','erasure','restriction','objection','portability']),
  scope_categories: z.array(z.enum(['account','authentication','assets','incidents','alerts','security_events','malware_scans','preferences'])).min(1).max(8),
  subject_note: z.string().trim().max(500).optional()
}).strict();

const ReviewSchema = z.object({
  action: z.enum(['verify_identity','start_review','block','approve','reject']),
  reason_code: z.enum(['identity_verified','identity_not_verified','ownership_ambiguous','legal_review_required','request_out_of_scope','approved_for_processing']).optional()
}).strict();

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};

export function createPrivacyRequestsRouter() {
  const router = Router();
  router.use(noStore);

  router.post('/privacy/requests', requireAuth, async (req, res) => {
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    const client = await pool.connect().catch(() => null);
    if (!client) return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    const id = randomUUID();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO privacy_requests (id, subject_user_id, request_type, scope_categories, subject_note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, request_type, status, scope_categories, received_at, due_at`,
        [id, req.authUser.id, parsed.data.request_type, parsed.data.scope_categories, parsed.data.subject_note ?? null]
      );
      await client.query(
        `INSERT INTO privacy_request_events (id, request_id, actor_user_id, event_code, to_status)
         VALUES ($1, $2, $3, 'request_submitted', 'received')`,
        [randomUUID(), id, req.authUser.id]
      );
      await client.query('COMMIT');
      return res.status(201).json({ request: inserted.rows[0] });
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    } finally { client.release(); }
  });

  router.get('/privacy/requests', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    try {
      const result = await pool.query(
        `SELECT id, request_type, status, scope_categories, received_at, verified_at, due_at, closed_at
         FROM privacy_requests WHERE subject_user_id = $1 ORDER BY received_at DESC LIMIT 100`,
        [req.authUser.id]
      );
      return res.status(200).json({ requests: result.rows });
    } catch { return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' }); }
  });

  router.get('/privacy/requests/:requestId', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const id = z.string().uuid().safeParse(req.params.requestId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_REQUEST_ID' });
    try {
      const result = await pool.query(
        `SELECT id, request_type, status, scope_categories, received_at, verified_at, due_at, closed_at
         FROM privacy_requests
         WHERE id = $1 AND subject_user_id = $2
         LIMIT 1`,
        [id.data, req.authUser.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
      const events = await pool.query(
        `SELECT event_code, from_status, to_status, reason_code, created_at
         FROM privacy_request_events
         WHERE request_id = $1
         ORDER BY created_at ASC`,
        [id.data]
      );
      return res.status(200).json({ request: result.rows[0], events: events.rows });
    } catch { return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' }); }
  });

  // Direct, subject-scoped access/portability export. This deliberately exports
  // only records with an unambiguous user foreign key and never includes secrets.
  router.get('/privacy/requests/:requestId/export', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const id = z.string().uuid().safeParse(req.params.requestId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_REQUEST_ID' });

    const client = await pool.connect().catch(() => null);
    if (!client) return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    try {
      await client.query('BEGIN');
      const requestResult = await client.query(
        `SELECT id, request_type, status, scope_categories, verified_at
         FROM privacy_requests
         WHERE id = $1 AND subject_user_id = $2
         FOR UPDATE`,
        [id.data, req.authUser.id]
      );
      if (!requestResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
      }
      const privacyRequest = requestResult.rows[0] as {
        id: string;
        request_type: string;
        status: string;
        scope_categories: string[];
        verified_at: Date | string | null;
      };
      if (!['access', 'portability'].includes(privacyRequest.request_type)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'EXPORT_NOT_APPLICABLE_TO_REQUEST_TYPE' });
      }
      if (!privacyRequest.verified_at || privacyRequest.status !== 'processing') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'REQUEST_NOT_APPROVED_FOR_EXPORT' });
      }

      const requested = new Set(privacyRequest.scope_categories);
      const exported: Record<string, unknown> = {};
      const excluded: { category: string; reason: string }[] = [];
      if (requested.has('account')) {
        const account = await client.query(
          `SELECT id, email, role, is_active, created_at
           FROM users WHERE id = $1 LIMIT 1`,
          [req.authUser.id]
        );
        exported.account = account.rows[0] ?? null;
      }
      if (requested.has('authentication')) {
        const sessions = await client.query(
          `SELECT created_at, expires_at, revoked_at, revocation_reason
           FROM auth_sessions WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 500`,
          [req.authUser.id]
        );
        exported.authentication = { sessions: sessions.rows };
      }
      if (requested.has('malware_scans')) {
        const scans = await client.query(
          `SELECT s.sha256, s.size_bytes, s.created_at AS sample_created_at,
                  s.expires_at AS sample_expires_at, s.storage_deleted_at,
                  r.verdict, r.scanner, r.error_code, r.scanned_at, r.created_at AS scan_created_at
           FROM malware_samples s
           LEFT JOIN malware_scan_runs r ON r.sample_record_id = s.id
           WHERE s.owner_user_id = $1
           ORDER BY s.created_at DESC, r.created_at DESC
           LIMIT 1000`,
          [req.authUser.id]
        );
        exported.malware_scans = { records: scans.rows };
      }

      for (const category of privacyRequest.scope_categories) {
        if (['assets', 'incidents', 'alerts', 'security_events'].includes(category)) {
          excluded.push({ category, reason: 'ownership_not_verified_for_subject_export' });
        } else if (category === 'preferences') {
          excluded.push({ category, reason: 'preferences_are_browser_local_and_not_stored_in_account_database' });
        }
      }

      await client.query(
        `INSERT INTO privacy_request_events (id, request_id, actor_user_id, event_code, reason_code)
         VALUES ($1, $2, $3, 'subject_export_generated', 'scoped_direct_json_export')`,
        [randomUUID(), id.data, req.authUser.id]
      );
      await client.query('COMMIT');
      res.setHeader('Content-Disposition', `attachment; filename="nexus-privacy-export-${id.data}.json"`);
      return res.status(200).json({
        export_status: excluded.length > 0 ? 'partial' : 'generated',
        request_id: id.data,
        generated_at: new Date().toISOString(),
        data: exported,
        excluded_categories: excluded,
        security_notice: 'This response contains only subject-owned records with verified ownership. Password hashes, tokens, secrets, uploaded files, and globally scoped SOC records are excluded. A partial export is not completion of the full request.'
      });
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return res.status(503).json({ error: 'PRIVACY_EXPORT_UNAVAILABLE' });
    } finally { client.release(); }
  });

  router.post('/privacy/requests/:requestId/withdraw', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const id = z.string().uuid().safeParse(req.params.requestId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_REQUEST_ID' });
    const client = await pool.connect().catch(() => null);
    if (!client) return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT status FROM privacy_requests WHERE id = $1 AND subject_user_id = $2 FOR UPDATE',
        [id.data, req.authUser.id]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
      }
      const fromStatus = current.rows[0].status as string;
      if (!['received', 'identity_verification_required', 'verified', 'in_review', 'blocked'].includes(fromStatus)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'REQUEST_CANNOT_BE_WITHDRAWN', current_status: fromStatus });
      }
      const updated = await client.query(
        `UPDATE privacy_requests SET status = 'withdrawn', closed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND subject_user_id = $2
         RETURNING id, request_type, status, received_at, closed_at`,
        [id.data, req.authUser.id]
      );
      await client.query(
        `INSERT INTO privacy_request_events (id, request_id, actor_user_id, event_code, from_status, to_status, reason_code)
         VALUES ($1, $2, $3, 'request_withdrawn', $4, 'withdrawn', 'subject_requested_withdrawal')`,
        [randomUUID(), id.data, req.authUser.id, fromStatus]
      );
      await client.query('COMMIT');
      return res.status(200).json({ request: updated.rows[0] });
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    } finally { client.release(); }
  });

  router.get('/admin/privacy/requests', requireAuth, requireRole('admin'), async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.id, r.request_type, r.status, r.scope_categories, r.received_at, r.verified_at,
                r.due_at, r.assigned_reviewer_user_id, u.email AS subject_email
         FROM privacy_requests r
         LEFT JOIN users u ON u.id = r.subject_user_id
         ORDER BY r.received_at ASC LIMIT 200`
      );
      return res.status(200).json({ requests: result.rows });
    } catch { return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' }); }
  });

  router.patch('/admin/privacy/requests/:requestId', requireAuth, requireRole('admin'), async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.requestId);
    const parsed = ReviewSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: 'INVALID_REQUEST' });
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    const transitions: Record<string, { status: string; event: string }> = {
      verify_identity: { status: 'verified', event: 'identity_verified' },
      start_review: { status: 'in_review', event: 'review_started' },
      block: { status: 'blocked', event: 'request_blocked' },
      approve: { status: 'processing', event: 'request_approved_for_processing' },
      reject: { status: 'rejected', event: 'request_rejected' }
    };
    const next = transitions[parsed.data.action];
    const requiredReason: Record<string, string> = {
      verify_identity: 'identity_verified',
      approve: 'approved_for_processing'
    };
    if (['block', 'reject', 'verify_identity', 'approve'].includes(parsed.data.action) && !parsed.data.reason_code) {
      return res.status(400).json({ error: 'REASON_REQUIRED' });
    }
    if (requiredReason[parsed.data.action] && parsed.data.reason_code !== requiredReason[parsed.data.action]) {
      return res.status(400).json({ error: 'INVALID_REASON_FOR_ACTION' });
    }
    const client = await pool.connect().catch(() => null);
    if (!client) return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT status FROM privacy_requests WHERE id = $1 FOR UPDATE', [id.data]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
      }
      const fromStatus = current.rows[0].status as string;
      const allowedFrom: Record<string, string[]> = {
        verify_identity: ['received', 'identity_verification_required'],
        start_review: ['verified'],
        block: ['received', 'identity_verification_required', 'verified', 'in_review', 'processing'],
        approve: ['verified', 'in_review'],
        reject: ['received', 'identity_verification_required', 'verified', 'in_review', 'blocked']
      };
      if (!allowedFrom[parsed.data.action].includes(fromStatus)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'INVALID_STATUS_TRANSITION', current_status: fromStatus });
      }
      if (['completed','rejected','withdrawn'].includes(fromStatus)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'REQUEST_ALREADY_CLOSED' });
      }
      const updated = await client.query(
        `UPDATE privacy_requests
         SET status = $2,
             verified_at = CASE WHEN $3 = 'verify_identity' THEN NOW() ELSE verified_at END,
             assigned_reviewer_user_id = COALESCE(assigned_reviewer_user_id, $4),
             decision_code = COALESCE($5, decision_code),
             updated_at = NOW(),
             closed_at = CASE WHEN $2 = 'rejected' THEN NOW() ELSE closed_at END
         WHERE id = $1
         RETURNING id, request_type, status, received_at, verified_at, assigned_reviewer_user_id, decision_code`,
        [id.data, next.status, parsed.data.action, req.authUser.id, parsed.data.reason_code ?? null]
      );
      await client.query(
        `INSERT INTO privacy_request_events (id, request_id, actor_user_id, event_code, from_status, to_status, reason_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), id.data, req.authUser.id, next.event, fromStatus, next.status, parsed.data.reason_code ?? null]
      );
      await client.query('COMMIT');
      return res.status(200).json({ request: updated.rows[0] });
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return res.status(503).json({ error: 'PRIVACY_STORE_UNAVAILABLE' });
    } finally { client.release(); }
  });

  return router;
}

export const privacyRequestsRouter = createPrivacyRequestsRouter();
