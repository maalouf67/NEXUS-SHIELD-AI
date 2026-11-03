import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

export const threatAnalysisRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authenticatedUserId = req.header('x-nexus-user-id')?.trim();
    return authenticatedUserId
      ? `user:${authenticatedUserId}`
      : ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
  message: {
    error: 'AI_RATE_LIMIT',
    message: 'The AI analysis request limit has been reached. Try again later.'
  }
});
