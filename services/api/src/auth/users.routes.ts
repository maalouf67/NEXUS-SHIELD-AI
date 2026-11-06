import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { requireAuth, requireRole } from './auth.middleware.js';
import { userRepository, type UserRepository } from './user.repository.js';
import { sessionRepository, type SessionRepository } from './session.repository.js';

const CreateUserRequestSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(['analyst', 'viewer'])
}).strict();

function databaseErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return null;
}

export function createUsersRouter(
  repository: UserRepository = userRepository,
  sessions: SessionRepository = sessionRepository,
  authMiddleware: RequestHandler = requireAuth
) {
  const router = Router();

  router.get('/users', authMiddleware, requireRole('admin'), async (_req, res) => {
    try {
      const users = await repository.listUsers();
      return res.status(200).json({ users });
    } catch {
      return res.status(503).json({ error: 'USER_STORE_UNAVAILABLE' });
    }
  });

  router.post('/users/:userId/sessions/revoke-all', authMiddleware, requireRole('admin'), async (req, res) => {
    const parsedUserId = z.string().uuid().safeParse(req.params.userId);
    if (!parsedUserId.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }

    try {
      const revokedSessions = await sessions.revokeAllSessions(parsedUserId.data);
      // Return only the count; do not reveal whether a target user account exists.
      return res.status(200).json({ revoked_sessions: revokedSessions });
    } catch {
      return res.status(503).json({ error: 'AUTH_STORE_UNAVAILABLE' });
    }
  });

  router.post('/users', authMiddleware, requireRole('admin'), async (req, res) => {
    const parsed = CreateUserRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsed.error.flatten()
      });
    }

    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await repository.createUser({
        id: randomUUID(),
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash
      });

      return res.status(201).json({ user });
    } catch (error) {
      if (databaseErrorCode(error) === '23505') {
        return res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
      }

      return res.status(503).json({ error: 'USER_STORE_UNAVAILABLE' });
    }
  });

  return router;
}

export const usersRouter = createUsersRouter();
