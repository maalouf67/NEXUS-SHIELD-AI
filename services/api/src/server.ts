import 'dotenv/config';
import { app } from './index.js';
import { validateEnv } from './config/env.js';
import { runMalwareRetentionCleanup } from './malware-scans/malware-scan-retention.js';

validateEnv();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';

app.listen(port, host, () => {
  console.log(`NEXUS SHIELD AI API listening on http://${host}:${port}`);

  // Files expire after 7 days; scan metadata expires after 30 days.
  // The cleanup job fails closed and leaves records/files in place if the AI service is unreachable.
  const runCleanupSafely = () => {
    void runMalwareRetentionCleanup().catch(() => {
      console.error('NEXUS malware retention cleanup did not complete; expired samples will be retried.');
    });
  };
  runCleanupSafely();
  const retentionTimer = setInterval(runCleanupSafely, 6 * 60 * 60 * 1000);
  retentionTimer.unref();
});
