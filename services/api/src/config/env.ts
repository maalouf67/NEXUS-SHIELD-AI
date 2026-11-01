import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().min(1),
  AI_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().url()
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
