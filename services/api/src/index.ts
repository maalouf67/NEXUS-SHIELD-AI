
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './routes/health.js';
import { threatsRouter } from './routes/threats.js';
import { apiRateLimiter } from './middleware/rate-limit.js';

export const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [];

app.use(helmet());

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : false
}));

app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRateLimiter);

app.use('/health', healthRouter);
app.use('/api', threatsRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'NEXUS SHIELD AI API',
    status: 'ok'
  });
});
