import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

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
    }
  }
}

const JWT_ISSUER = 'nexus-shield-ai';
const JWT_AUDIENCE = 'nexus-shield-ai-api';

const AccessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'analyst', 'viewer'])
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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

    req.authUser = {
      id: parsed.data.sub,
      email: parsed.data.email,
      role: parsed.data.role
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN' });
  }
}

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
