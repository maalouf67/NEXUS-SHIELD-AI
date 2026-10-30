import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(16),
  SESSION_SECRET: z.string().min(16),
  ALLOWED_ORIGINS: z.string().min(1),
  AI_BASE_URL: z.string().url(),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1)
});

export function validateEnv() {
  envSchema.parse(process.env);
}

export function getEnv(name: keyof typeof process.env & string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
