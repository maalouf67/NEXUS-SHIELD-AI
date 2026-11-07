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
