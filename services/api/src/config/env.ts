import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional()
);
const optionalServiceToken = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(32).optional()
);
const optionalApiKey = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional()
);
const seonHosts = new Set([
  "api.seon.io",
  "api.me-central-1-main.seon.io",
  "api.us-east-1-main.seon.io",
  "api.ap-southeast-1-main.seon.io"
]);
const optionalSeonPhoneApiUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        seonHosts.has(url.hostname) &&
        url.pathname === "/SeonRestService/phone-api/v2" &&
        !url.search && !url.hash && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "SEON_PHONE_API_URL must be an official HTTPS SEON Phone API endpoint").optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("127.0.0.1"),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  NEXUS_SERVICE_API_TOKEN: optionalServiceToken,
  NEXUS_EVENT_INGESTION_TOKEN: optionalServiceToken,
  IPQS_API_KEY: optionalApiKey,
  IPQS_PHONE_STRICTNESS: z.preprocess(
    (value) => value === "" || value === undefined ? 0 : value,
    z.coerce.number().int().min(0).max(2).default(0)
  ),
  SEON_API_KEY: optionalApiKey,
  SEON_PHONE_API_URL: optionalSeonPhoneApiUrl,
  ALLOWED_ORIGINS: z.string().default(""),
  AI_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(["true", "false"]).default("true"),
  DATABASE_SSL_CA_PATH: optionalNonEmptyString
});

export function validateEnv() {
  envSchema.parse(process.env);
}

export function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error("Missing required environment variable: " + name);
  }
  return value;
}
