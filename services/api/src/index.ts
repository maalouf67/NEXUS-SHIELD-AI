import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { healthRouter } from './routes/health.js';
import { threatsRouter } from './routes/threats.js';
import { privacyRouter } from './routes/privacy.js';
import { privacyRequestsRouter } from './privacy/privacy-requests.routes.js';
import { attackPathsRouter } from './routes/attack-paths.js';
import { assetInventoryRouter } from './assets/asset-inventory.routes.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { apiAnomalyGuard } from './middleware/api-anomaly-guard.js';
import { authRouter } from './auth/auth.routes.js';
import { usersRouter } from './auth/users.routes.js';
import { incidentsRouter } from './incidents/incidents.routes.js';
import { alertsRouter } from './alerts/alerts.routes.js';
import { securityEventsRouter } from './security-events/security-events.routes.js';
import { malwareScanRouter } from './malware-scans/malware-scans.routes.js';
import { phoneReputationRouter } from './phone-reputation/phone-reputation.routes.js';
import { ipReputationRouter } from './ip-reputation/ip-reputation.routes.js';
import { otelTracingMiddleware } from './observability/otel-tracing.middleware.js';

export const app = express();

// Trust only the explicitly configured number of reverse-proxy hops.
// Keep this at 0 for direct/local traffic. Never trust all forwarded headers.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? '0');
if (Number.isInteger(trustProxyHops) && trustProxyHops >= 0 && trustProxyHops <= 5) {
  app.set('trust proxy', trustProxyHops);
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [];

app.use(helmet());
app.use(otelTracingMiddleware);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false
  })
);
// Apply source throttling and anomaly inspection before parsing request bodies.
app.use('/api', apiRateLimiter);
// Unit tests exercise the guard directly with isolated stores. Do not make the
// shared PostgreSQL production store a hidden dependency of unrelated route tests.
app.use(process.env.NODE_ENV === 'test'
  ? (_request, _response, next) => next()
  : apiAnomalyGuard);
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api', threatsRouter);
app.use('/api', privacyRouter);
app.use('/api', privacyRequestsRouter);
app.use('/api', attackPathsRouter);
app.use('/api', assetInventoryRouter);
app.use('/api', authRouter);
app.use('/api', usersRouter);
app.use('/api', incidentsRouter);
app.use('/api', alertsRouter);
app.use('/api', securityEventsRouter);
app.use('/api', malwareScanRouter);
app.use('/api', phoneReputationRouter);
app.use('/api', ipReputationRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'NEXUS SHIELD AI API',
    status: 'ok'
  });
});
