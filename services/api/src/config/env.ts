import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(1).optional()
);

const optionalServiceToken = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(32).optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  NEXUS_SERVICE_API_TOKEN: optionalServiceToken,
  ALLOWED_ORIGINS: z.string().min(1),
  AI_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(['true', 'false']).default('true'),
  DATABASE_SSL_CA_PATH: optionalNonEmptyString
});

export function validateEnv() {
  envSchema.parse(process.env);
}

export function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
