
import 'dotenv/config';
import { app } from './index.js';
import { validateEnv, getEnv } from './config/env.js';

validateEnv();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

app.listen(port, host, () => {
  console.log(`NEXUS SHIELD AI API listening on http://${host}:${port}`);
});
