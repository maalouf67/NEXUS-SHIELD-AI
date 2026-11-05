import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';

import type { UserRole } from './user.repository.js';
import { sessionRepository, type SessionRepository } from './session.repository.js';

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
  jti: z.string().uuid().optional(),
  email: z.string().email(),
  role: z.enum(['admin', 'analyst', 'viewer'])
});

export interface RequireAuthOptions {
  /** Fixture-only bypass; effective only when NODE_ENV is test. */
  skipSessionValidationInTests?: boolean;
}

export function createRequireAuth(
  sessions: SessionRepository = sessionRepository,
  options: RequireAuthOptions = {}
): RequestHandler {
  const skipSessionValidationInTests =
    options.skipSessionValidationInTests ?? process.env.NODE_ENV === 'test';

  return async (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
    }

    const authorization = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const token = match?.[1]?.trim();
    if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    let claims: z.infer<typeof AccessTokenClaimsSchema>;
    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });
      const parsed = AccessTokenClaimsSchema.safeParse(decoded);
      if (!parsed.success) return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
      claims = parsed.data;
    } catch {
      return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
    }

    if (skipSessionValidationInTests && process.env.NODE_ENV === 'test') {
      req.authUser = { id: claims.sub, email: claims.email, role: claims.role };
      req.authSessionId = claims.jti;
      return next();
    }

    if (!claims.jti) return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });

    try {
      const activeSession = await sessions.findActiveSession(claims.jti, claims.sub);
      if (!activeSession) return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });

      // Current database identity and role take precedence over token claims.
      req.authUser = {
        id: activeSession.userId,
        email: activeSession.email,
        role: activeSession.role
      };
      req.authSessionId = claims.jti;
      return next();
    } catch {
      // Revocation state is security-critical; never fall back to JWT-only auth.
      return res.status(503).json({ error: 'AUTH_STORE_UNAVAILABLE' });
    }
  };
}

export const requireAuth = createRequireAuth();

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (!allowedRoles.includes(req.authUser.role)) return res.status(403).json({ error: 'FORBIDDEN' });
    return next();
  };
}

export const authTokenConfig = { issuer: JWT_ISSUER, audience: JWT_AUDIENCE };
