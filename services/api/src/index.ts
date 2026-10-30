import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getEnv, validateEnv } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { threatsRouter } from './routes/threats.js';

export const app = express();

validateEnv();

app.use(helmet());
app.use(cors({ origin: getEnv('ALLOWED_ORIGINS').split(',') }));
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);
app.use('/api', threatsRouter);

app.get('/', (_req, res) => {
  res.json({ name: 'NEXUS SHIELD AI API', status: 'ok' });
});

const port = Number(getEnv('PORT'));

if (require.main === module) {
  app.listen(port, getEnv('HOST'), () => {
    console.log(`API listening on http://${getEnv('HOST')}:${port}`);
  });
}
