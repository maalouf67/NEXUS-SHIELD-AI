import 'dotenv/config';
import { app } from './index.js';
import { validateEnv } from './config/env.js';

validateEnv();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';

app.listen(port, host, () => {
  console.log(`NEXUS SHIELD AI API listening on http://${host}:${port}`);
});
