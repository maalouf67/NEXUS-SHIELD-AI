import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';

import {
  authSessionRepository,
  type AuthSessionRepository
} from './auth-session.repository.js';
import type { UserRole } from './user.repository.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authSessionId?: string;
    }
  }
}

const JWT_ISSUER = 'nexus-shield-ai';
const JWT_AUDIENCE = 'nexus-shield-ai-api';

const AccessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  jti: z.string().uuid()
}).strict();

/**
 * Verifies the signed access token, then checks its random jti against the
 * server-side session store and loads the user's current active role.
 * A session-store failure is fail-closed; no protected route is continued.
 */
export function createRequireAuth(
  sessions: AuthSessionRepository = authSessionRepository
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
    }

    const authorization = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const token = match?.[1]?.trim();

    if (!token) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    let claims: z.infer<typeof AccessTokenClaimsSchema>;
    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });
      const parsed = AccessTokenClaimsSchema.safeParse(decoded);

      if (!parsed.success) {
        return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
      }
      claims = parsed.data;
    } catch {
      return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
    }

    void sessions.findActiveSession(claims.jti, claims.sub)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
          return;
        }

        req.authUser = user;
        req.authSessionId = claims.jti;
        next();
      })
      .catch(() => {
        res.status(503).json({ error: 'AUTH_SESSION_STORE_UNAVAILABLE' });
      });
  };
}

export const requireAuth = createRequireAuth();

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    return next();
  };
}

export const authTokenConfig = {
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE
};
