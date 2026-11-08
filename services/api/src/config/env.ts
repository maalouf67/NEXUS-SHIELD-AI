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
        url.pathname === "/SeonRestService/phone-api/v2" && !url.port &&
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
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  RATE_LIMIT_HASH_SECRET: optionalServiceToken,
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
  ABUSEIPDB_API_KEY: optionalApiKey,
  ABUSEIPDB_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  ABUSEIPDB_DAILY_LIMIT: z.coerce.number().int().min(1).max(50000).default(850),
  PRIVACYHAWK_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVACYHAWK_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  PRIVACYHAWK_CLIENT_ID: optionalApiKey,
  PRIVACYHAWK_CLIENT_SECRET: optionalApiKey,
  OTEL_ENABLED: z.enum(["true", "false"]).default("false"),
  OTEL_SERVICE_NAME: z.string().min(1).max(100).default("nexus-shield-api"),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
  SEON_PHONE_API_URL: optionalSeonPhoneApiUrl,
  ALLOWED_ORIGINS: z.string().default(""),
  AI_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(["true", "false"]).default("true"),
  DATABASE_SSL_CA_PATH: optionalNonEmptyString
});

export function validateEnv() {
  const parsed = envSchema.parse(process.env);
  if (parsed.PRIVACYHAWK_ENABLED === "true" && (!parsed.PRIVACYHAWK_CLIENT_ID || !parsed.PRIVACYHAWK_CLIENT_SECRET)) {
    throw new Error("PRIVACYHAWK_CLIENT_ID and PRIVACYHAWK_CLIENT_SECRET are required when PRIVACYHAWK_ENABLED=true.");
  }
  if (parsed.OTEL_ENABLED === "true" && !parsed.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    throw new Error("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required when OTEL_ENABLED=true.");
  }
}

export function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error("Missing required environment variable: " + name);
  }
  return value;
}
