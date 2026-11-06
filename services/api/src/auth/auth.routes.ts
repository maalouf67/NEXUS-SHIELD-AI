import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { createRequireAuth, requireRole, authTokenConfig } from './auth.middleware.js';
import { authSessionRepository, type AuthSessionRepository } from './auth-session.repository.js';
import { userRepository, type UserRepository } from './user.repository.js';
import { loginAttemptLimiter } from '../middleware/intrusion-prevention.js';

const LoginRequestSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();

// Use a real password hash for unknown accounts too, reducing obvious timing differences.
const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('base64url'), 12);
const USER_ID_SCHEMA = z.string().uuid();
const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;

export function createAuthRouter(
  repository: UserRepository = userRepository,
  loginLimiter = loginAttemptLimiter,
  sessions: AuthSessionRepository = authSessionRepository
) {
  const router = Router();
  const requireSessionAuth = createRequireAuth(sessions);

  router.post('/auth/login', loginLimiter, async (req, res) => {
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

      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + ACCESS_TOKEN_LIFETIME_SECONDS * 1000);

      // Persist the session before returning a token. If storage is unavailable,
      // login fails rather than issuing a token that cannot be revoked or checked.
      await sessions.createSession({
        sessionId,
        userId: user.id,
        expiresAt,
        expectedPasswordHash: user.passwordHash,
        testIdentity: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });

      const accessToken = jwt.sign(
        { jti: sessionId },
        secret,
        {
          algorithm: 'HS256',
          subject: user.id,
          issuer: authTokenConfig.issuer,
          audience: authTokenConfig.audience,
          expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS
        }
      );

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
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

  router.get('/auth/me', requireSessionAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      user: req.authUser
    });
  });

  router.post('/auth/logout', requireSessionAuth, async (req, res) => {
    if (!req.authUser || !req.authSessionId) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    try {
      await sessions.revokeSession(req.authSessionId, req.authUser.id, 'logout');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ success: true });
    } catch {
      return res.status(503).json({ error: 'AUTH_SESSION_STORE_UNAVAILABLE' });
    }
  });

  router.post('/auth/logout-all', requireSessionAuth, async (req, res) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    try {
      const revokedSessions = await sessions.revokeAllSessions(req.authUser.id, 'logout_all');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        success: true,
        revoked_sessions: revokedSessions
      });
    } catch {
      return res.status(503).json({ error: 'AUTH_SESSION_STORE_UNAVAILABLE' });
    }
  });

  router.post(
    '/auth/users/:userId/sessions/revoke-all',
    requireSessionAuth,
    requireRole('admin'),
    async (req, res) => {
      if (!req.authUser) {
        return res.status(401).json({ error: 'UNAUTHENTICATED' });
      }
      const parsedUserId = USER_ID_SCHEMA.safeParse(req.params.userId);
      if (!parsedUserId.success) {
        return res.status(400).json({ error: 'INVALID_USER_ID' });
      }

      try {
        const revokedSessions = await sessions.revokeAllSessions(
          parsedUserId.data,
          'admin_revoke_all',
          req.authUser.id
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          success: true,
          revoked_sessions: revokedSessions
        });
      } catch {
        return res.status(503).json({ error: 'AUTH_SESSION_STORE_UNAVAILABLE' });
      }
    }
  );

  return router;
}

export const authRouter = createAuthRouter();
