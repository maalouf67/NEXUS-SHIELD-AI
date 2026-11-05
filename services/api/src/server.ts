import 'dotenv/config';
import { app } from './index.js';
import { validateEnv } from './config/env.js';
import { pool } from './db/pool.js';
import { runMalwareRetentionCleanup } from './malware-scans/malware-scan-retention.js';

async function verifyActiveDefenseSchema(): Promise<void> {
  const result = await pool.query<{
    rate_limit_counters: string | null;
    security_events: string | null;
    security_event_reviews: string | null;
  }>(`
    SELECT
      to_regclass('public.api_rate_limit_counters')::text AS rate_limit_counters,
      to_regclass('public.security_events')::text AS security_events,
      to_regclass('public.security_event_reviews')::text AS security_event_reviews
  `);
  const schema = result.rows[0];
  const missing = [
    { name: 'api_rate_limit_counters', exists: Boolean(schema?.rate_limit_counters) },
    { name: 'security_events', exists: Boolean(schema?.security_events) },
    { name: 'security_event_reviews', exists: Boolean(schema?.security_event_reviews) }
  ].filter((table) => !table.exists).map((table) => table.name);
  if (missing.length > 0) {
    throw new Error(`Required Active Defense/SOC tables are missing: ${missing.join(', ')}. Run npm run db:migrate before starting the API.`);
  }
}

async function startServer(): Promise<void> {
  validateEnv();
  await verifyActiveDefenseSchema();
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = app.listen(port, host, () => {
    console.log(`NEXUS SHIELD AI API listening on http://${host}:${port}`);
    const runCleanupSafely = () => {
      void runMalwareRetentionCleanup().catch(() => {
        console.error('NEXUS malware retention cleanup did not complete; expired samples will be retried.');
      });
    };
    runCleanupSafely();
    const retentionTimer = setInterval(runCleanupSafely, 6 * 60 * 60 * 1000);
    retentionTimer.unref();
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 120_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.maxHeadersCount = 100;
}

void startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error.';
  console.error(`NEXUS SHIELD AI API startup failed: ${message}`);
  process.exitCode = 1;
});
