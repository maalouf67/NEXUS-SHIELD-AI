import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { requireAuth, authTokenConfig } from './auth.middleware.js';
import { userRepository, type UserRepository } from './user.repository.js';

const LoginRequestSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'LOGIN_RATE_LIMITED',
    message: 'Too many login attempts. Try again later.'
  }
});

// Use a real password hash for unknown accounts too, reducing obvious timing differences.
const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('base64url'), 12);

export function createAuthRouter(repository: UserRepository = userRepository) {
  const router = Router();

  router.post('/auth/login', loginRateLimiter, async (req, res) => {
    const parsed = LoginRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsed.error.flatten()
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
    }

    try {
      const user = await repository.findByEmail(parsed.data.email);
      const hashToCompare = user?.passwordHash ?? await dummyPasswordHash;
      const passwordMatches = await bcrypt.compare(parsed.data.password, hashToCompare);

      if (!user || !user.isActive || !user.passwordHash || !passwordMatches) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'The email or password is incorrect.'
        });
      }

      const accessToken = jwt.sign(
        { email: user.email, role: user.role },
        secret,
        {
          algorithm: 'HS256',
          subject: user.id,
          issuer: authTokenConfig.issuer,
          audience: authTokenConfig.audience,
          expiresIn: '15m'
        }
      );

      return res.status(200).json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
    } catch {
      return res.status(503).json({
        error: 'AUTH_STORE_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable.'
      });
    }
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    return res.status(200).json({
      user: req.authUser
    });
  });

  return router;
}

export const authRouter = createAuthRouter();
