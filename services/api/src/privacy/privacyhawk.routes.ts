import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/auth.middleware.js';
import { pool } from '../db/pool.js';
import { PrivacyHawkClient, type PrivacyHawkProfile, type PrivacyHawkScan } from './privacyhawk.client.js';

const ConsentSchema = z.object({
  granted: z.literal(true),
  explicit: z.literal(true),
  version: z.string().trim().min(1).max(32)
}).strict();

const ProfileSchema = z.object({
  name: z.object({
    first: z.string().trim().min(1).max(80),
    last: z.string().trim().min(1).max(80),
    middle: z.string().trim().max(80).optional(),
    prefix: z.string().trim().max(24).optional(),
    suffix: z.string().trim().max(24).optional()
  }).strict(),
  emailAddresses: z.array(z.string().email().max(254)).min(1).max(5),
  phoneNumbers: z.array(z.string().regex(/^\\+[1-9]\\d{7,14}$/)).max(5).optional(),
  addresses: z.array(z.object({
    address1: z.string().trim().max(160).optional(),
    address2: z.string().trim().max(160).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(24).optional(),
    country: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
    current: z.boolean().optional()
  }).strict()).max(5).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getUTCFullYear()).optional(),
  birthMonth: z.number().int().min(1).max(12).optional()
}).strict();

const ScanRequestSchema = z.object({
  consent: ConsentSchema,
  profile: ProfileSchema,
  realtime: z.boolean().default(true)
}).strict();
const ScanIdSchema = z.string().uuid();

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};

type QueryResult = { rows: Array<Record<string, unknown>>; rowCount: number | null };
type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};
type Database = {
  connect: () => Promise<DatabaseClient>;
  query: (sql: string, values?: unknown[]) => Promise<QueryResult>;
};
export type PrivacyHawkProvider = {
  isConfigured: () => boolean;
  environment: () => string;
  createScan: (customerId: string, profile: PrivacyHawkProfile, realtime?: boolean) => Promise<PrivacyHawkScan>;
  getScan: (scanId: string) => Promise<PrivacyHawkScan>;
  getScanRecords: (scanId: string) => Promise<unknown[]>;
  listBrokers: () => Promise<unknown[]>;
};

function localStatus(value: string): string {
  switch (value.toLowerCase()) {
    case 'created': return 'created';
    case 'started':
    case 'running':
    case 'processing': return 'in_progress';
    case 'success':
    case 'completed': return 'completed';
    case 'failed':
    case 'error': return 'failed';
    case 'stopped': return 'stopped';
    default: return 'unknown';
  }
}
const RECORD_FIELDS = [
  'id', 'brokerId', 'score', 'createdAt', 'submittedAt', 'confirmedAt',
  'verifiedAt', 'age', 'addresses', 'fullName', 'phoneNumbers', 'emailAddresses'
];
function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(RECORD_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(record, key))
    .map((key) => [key, record[key]]));
}
function safeBroker(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const broker = value as Record<string, unknown>;
  const fields = ['id', 'name', 'url', 'enabled', 'infoTypes', 'estimatedDaysToRemoveRecords', 'brokerType', 'capabilities'];
  return Object.fromEntries(fields.filter((key) => Object.prototype.hasOwnProperty.call(broker, key))
    .map((key) => [key, broker[key]]));
}

export function createPrivacyHawkRouter(dependencies: {
  database?: Database;
  provider?: PrivacyHawkProvider;
} = {}) {
  const database = dependencies.database ?? pool as unknown as Database;
  const provider = dependencies.provider ?? new PrivacyHawkClient();
  const router = Router();
  router.use(noStore);

  router.get('/privacy/providers/privacyhawk/status', requireAuth, (_req, res) => {
    const configured = provider.isConfigured();
    return res.status(200).json({
      provider: 'privacyhawk',
      connection_state: configured ? 'credentials_configured' : 'not_configured',
      configured,
      environment: provider.environment(),
      capabilities: { dataBrokerScans: true, brokerCatalog: true, recurringRemovalEnrollment: false },
      consent_required_for_profile_transfer: true
    });
  });

  router.post('/privacy/providers/privacyhawk/scans', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const parsed = ScanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PRIVACYHAWK_SCAN_REQUEST', details: parsed.error.flatten() });
    }
    if (!provider.isConfigured()) return res.status(503).json({ error: 'PRIVACYHAWK_NOT_CONFIGURED' });

    const scanRunId = randomUUID();
    const client = await database.connect().catch(() => null);
    if (!client) return res.status(503).json({ error: 'PRIVACYHAWK_STORE_UNAVAILABLE' });
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO privacyhawk_provider_consents (id, user_id, consent_version, purpose) VALUES ($1, $2, $3, 'data_broker_scan')",
        [randomUUID(), req.authUser.id, parsed.data.consent.version]
      );
      await client.query(
        "INSERT INTO privacyhawk_scan_runs (id, user_id, status, realtime) VALUES ($1, $2, 'submitting', $3)",
        [scanRunId, req.authUser.id, parsed.data.realtime]
      );
      await client.query(
        "INSERT INTO privacyhawk_provider_events (id, user_id, scan_run_id, event_code) VALUES ($1, $2, $3, 'scan_requested')",
        [randomUUID(), req.authUser.id, scanRunId]
      );
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return res.status(503).json({ error: 'PRIVACYHAWK_STORE_UNAVAILABLE' });
    } finally {
      client.release();
    }

    try {
      // The authenticated NEXUS user UUID is the partner-side customerId.
      // Profile values are sent for this scan only and are not persisted here.
      const scan = await provider.createScan(req.authUser.id, parsed.data.profile, parsed.data.realtime);
      const status = localStatus(scan.status);
      await database.query(
        "UPDATE privacyhawk_scan_runs SET provider_scan_id = $2, status = $3, broker_count = $4, modified_at = COALESCE($5::timestamptz, NOW()), started_at = $6, stopped_at = $7 WHERE id = $1 AND user_id = $8",
        [scanRunId, scan.id, status, scan.brokerCount ?? null, scan.modifiedAt ?? null, scan.startedAt ?? null, scan.stoppedAt ?? null, req.authUser.id]
      );
      await database.query(
        "INSERT INTO privacyhawk_provider_events (id, user_id, scan_run_id, event_code) VALUES ($1, $2, $3, 'scan_created')",
        [randomUUID(), req.authUser.id, scanRunId]
      );
      return res.status(202).json({
        scan: {
          id: scanRunId,
          provider_scan_id: scan.id,
          status,
          broker_count: scan.brokerCount ?? null,
          created_at: scan.createdAt ?? new Date().toISOString()
        },
        notice: 'Your profile was sent to PrivacyHawk for this scan. No recurring removal enrollment or broker opt-out request was created.'
      });
    } catch {
      // A timeout can happen after provider acceptance. Unknown is safer than
      // claiming failure and encouraging a duplicate scan.
      await database.query(
        "UPDATE privacyhawk_scan_runs SET status = 'unknown', last_error_code = 'PROVIDER_RESULT_UNKNOWN' WHERE id = $1 AND user_id = $2",
        [scanRunId, req.authUser.id]
      ).catch(() => undefined);
      await database.query(
        "INSERT INTO privacyhawk_provider_events (id, user_id, scan_run_id, event_code) VALUES ($1, $2, $3, 'scan_result_unknown')",
        [randomUUID(), req.authUser.id, scanRunId]
      ).catch(() => undefined);
      return res.status(502).json({
        error: 'PRIVACYHAWK_SCAN_RESULT_UNKNOWN',
        scan_id: scanRunId,
        message: 'The provider response could not be confirmed. Check this scan before submitting another.'
      });
    }
  });

  router.get('/privacy/providers/privacyhawk/scans', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    try {
      const result = await database.query(
        'SELECT id, status, broker_count, realtime, created_at, modified_at, started_at, stopped_at FROM privacyhawk_scan_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.authUser.id]
      );
      return res.status(200).json({ scans: result.rows });
    } catch {
      return res.status(503).json({ error: 'PRIVACYHAWK_STORE_UNAVAILABLE' });
    }
  });

  router.get('/privacy/providers/privacyhawk/scans/:scanId', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const id = ScanIdSchema.safeParse(req.params.scanId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_SCAN_ID' });
    try {
      const result = await database.query(
        'SELECT id, provider_scan_id, status, broker_count, realtime, created_at FROM privacyhawk_scan_runs WHERE id = $1 AND user_id = $2 LIMIT 1',
        [id.data, req.authUser.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'SCAN_NOT_FOUND' });
      const row = result.rows[0];
      if (!row.provider_scan_id || !provider.isConfigured()) {
        return res.status(200).json({ scan: row, provider_status_available: false });
      }
      try {
        const remote = await provider.getScan(String(row.provider_scan_id));
        const status = localStatus(remote.status);
        await database.query(
          'UPDATE privacyhawk_scan_runs SET status = $3, broker_count = $4, modified_at = COALESCE($5::timestamptz, NOW()), started_at = $6, stopped_at = $7 WHERE id = $1 AND user_id = $2',
          [id.data, req.authUser.id, status, remote.brokerCount ?? null, remote.modifiedAt ?? null, remote.startedAt ?? null, remote.stoppedAt ?? null]
        );
        return res.status(200).json({ scan: { ...row, status, broker_count: remote.brokerCount ?? null }, provider_status_available: true });
      } catch {
        return res.status(200).json({ scan: row, provider_status_available: false });
      }
    } catch {
      return res.status(503).json({ error: 'PRIVACYHAWK_STORE_UNAVAILABLE' });
    }
  });

  router.get('/privacy/providers/privacyhawk/scans/:scanId/records', requireAuth, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const id = ScanIdSchema.safeParse(req.params.scanId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_SCAN_ID' });
    if (!provider.isConfigured()) return res.status(503).json({ error: 'PRIVACYHAWK_NOT_CONFIGURED' });
    try {
      const result = await database.query(
        'SELECT provider_scan_id FROM privacyhawk_scan_runs WHERE id = $1 AND user_id = $2 LIMIT 1',
        [id.data, req.authUser.id]
      );
      if (!result.rowCount || !result.rows[0].provider_scan_id) return res.status(404).json({ error: 'SCAN_NOT_FOUND' });
      const records = await provider.getScanRecords(String(result.rows[0].provider_scan_id));
      return res.status(200).json({ records: records.map(safeRecord), count: records.length });
    } catch {
      return res.status(502).json({ error: 'PRIVACYHAWK_RECORDS_UNAVAILABLE' });
    }
  });

  router.get('/privacy/providers/privacyhawk/brokers', requireAuth, async (_req, res) => {
    if (!provider.isConfigured()) return res.status(503).json({ error: 'PRIVACYHAWK_NOT_CONFIGURED' });
    try {
      const brokers = await provider.listBrokers();
      return res.status(200).json({ brokers: brokers.map(safeBroker), count: brokers.length });
    } catch {
      return res.status(502).json({ error: 'PRIVACYHAWK_BROKERS_UNAVAILABLE' });
    }
  });

  return router;
}
export const privacyHawkRouter = createPrivacyHawkRouter();
