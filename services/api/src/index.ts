import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { healthRouter } from './routes/health.js';
import { threatsRouter } from './routes/threats.js';
import { privacyRouter } from './routes/privacy.js';
import { attackPathsRouter } from './routes/attack-paths.js';
import { assetInventoryRouter } from './assets/asset-inventory.routes.js';
import { apiRateLimiter } from './middleware/rate-limit.js';

export const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [];

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRateLimiter);

app.use('/health', healthRouter);
app.use('/api', threatsRouter);
app.use('/api', privacyRouter);
app.use('/api', attackPathsRouter);
app.use('/api', assetInventoryRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'NEXUS SHIELD AI API',
    status: 'ok'
  });
});
