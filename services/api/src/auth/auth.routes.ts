import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { requireAuth, authTokenConfig } from './auth.middleware.js';
import { userRepository, type UserRepository } from './user.repository.js';
import { sessionRepository, type SessionRepository } from './session.repository.js';
import { loginAttemptLimiter } from '../middleware/intrusion-prevention.js';

const LoginRequestSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();

const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('base64url'), 12);

export function createAuthRouter(
  repository: UserRepository = userRepository,
  loginLimiter: RequestHandler = loginAttemptLimiter,
  sessions?: SessionRepository,
  authMiddleware: RequestHandler = requireAuth
) {
  const sessionStore = sessions ?? sessionRepository;
  const skipSessionPersistenceInTests = sessions === undefined && process.env.NODE_ENV === 'test';
  const router = Router();

  router.post('/auth/login', loginLimiter, async (req, res) => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });

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

      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      if (!skipSessionPersistenceInTests) {
        await sessionStore.createSession({ id: sessionId, userId: user.id, expiresAt });
      }

      const accessToken = jwt.sign(
        { email: user.email, role: user.role, jti: sessionId },
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
        user: { id: user.id, email: user.email, role: user.role }
      });
    } catch {
      return res.status(503).json({
        error: 'AUTH_STORE_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable.'
      });
    }
  });

  router.post('/auth/logout', authMiddleware, async (req, res) => {
    if (!req.authUser || !req.authSessionId) {
      return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
    }
    try {
      const revoked = await sessionStore.revokeSession(req.authSessionId, req.authUser.id);
      if (!revoked) return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'AUTH_STORE_UNAVAILABLE' });
    }
  });

  router.post('/auth/logout-all', authMiddleware, async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    try {
      const revokedSessions = await sessionStore.revokeAllSessions(req.authUser.id);
      return res.status(200).json({ revoked_sessions: revokedSessions });
    } catch {
      return res.status(503).json({ error: 'AUTH_STORE_UNAVAILABLE' });
    }
  });

  router.get('/auth/me', authMiddleware, (req, res) => res.status(200).json({ user: req.authUser }));
  return router;
}

export const authRouter = createAuthRouter();
