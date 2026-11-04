import { rateLimit } from "express-rate-limit";

import { PostgresRateLimitStore } from "./postgres-rate-limit-store.js";

const storeOptions = (prefix: string) => process.env.NODE_ENV === "test"
  ? {}
  : { store: new PostgresRateLimitStore(prefix) };

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  passOnStoreError: false,
  ...storeOptions("api-ip"),
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please try again later."
  }
});
