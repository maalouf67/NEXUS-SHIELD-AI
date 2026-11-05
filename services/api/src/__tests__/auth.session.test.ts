import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createAuthRouter } from '../auth/auth.routes.js';
import { createRequireAuth } from '../auth/auth.middleware.js';
import { createUsersRouter } from '../auth/users.routes.js';
import type { ActiveSession, NewSession, SessionRepository } from '../auth/session.repository.js';
import type { StoredUser, UserRepository } from '../auth/user.repository.js';

const SECRET = 'nexus-session-test-secret-value-at-least-32';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PASSWORD = 'Correct-Horse-Battery-23!';
const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

const user: StoredUser = {
  id: USER_ID,
  email: 'session-admin@example.com',
  role: 'admin',
  passwordHash: null,
  isActive: true
};
const sessions = new Map<string, NewSession & { revokedAt?: Date }>();
let sessionStoreFails = false;

const sessionRepository: SessionRepository = {
  async createSession(input) {
    sessions.set(input.id, input);
  },
  async findActiveSession(sessionId, userId): Promise<ActiveSession | null> {
    if (sessionStoreFails) throw new Error('session store offline');
    const record = sessions.get(sessionId);
    if (!record || record.userId !== userId || record.revokedAt ||
        record.expiresAt.getTime() <= Date.now() || !user.isActive) return null;
    return { userId: user.id, email: user.email, role: user.role };
  },
  async revokeSession(sessionId, userId) {
    const record = sessions.get(sessionId);
    if (!record || record.userId !== userId || record.revokedAt ||
        record.expiresAt.getTime() <= Date.now()) return false;
    record.revokedAt = new Date();
    return true;
  },
  async revokeAllSessions(userId) {
    let count = 0;
    for (const record of sessions.values()) {
      if (record.userId === userId && !record.revokedAt && record.expiresAt.getTime() > Date.now()) {
        record.revokedAt = new Date();
        count += 1;
      }
    }
    return count;
  }
};

const repository: UserRepository = {
  async findByEmail(email) {
    return email.toLowerCase() === user.email ? user : null;
  },
  async listUsers() { return []; },
  async createUser(input) {
    return { id: input.id, email: input.email, role: input.role, isActive: true, createdAt: new Date().toISOString() };
  }
};
const noLimit: express.RequestHandler = (_req, _res, next) => next();
const strictAuth = createRequireAuth(sessionRepository, { skipSessionValidationInTests: false });

function appForSessions() {
  const app = express();
  app.use(express.json());
  app.use('/api', createAuthRouter(repository, noLimit, sessionRepository, strictAuth));
  app.use('/api', createUsersRouter(repository, sessionRepository, strictAuth));
  return app;
}

function tokenWithSession(sessionId: string, subjectId = USER_ID) {
  return jwt.sign(
    { email: user.email, role: user.role, jti: sessionId },
    SECRET,
    {
      algorithm: 'HS256',
      subject: subjectId,
      issuer: 'nexus-shield-ai',
      audience: 'nexus-shield-ai-api',
      expiresIn: '15m'
    }
  );
}

function tokenWithoutSession() {
  return jwt.sign({ email: user.email, role: user.role }, SECRET, {
    algorithm: 'HS256',
    subject: USER_ID,
    issuer: 'nexus-shield-ai',
    audience: 'nexus-shield-ai-api',
    expiresIn: '15m'
  });
}

describe('server-side session lifecycle', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = SECRET;
    sessions.clear();
    sessionStoreFails = false;
    user.passwordHash = await bcrypt.hash(PASSWORD, 4);
    user.isActive = true;
    user.role = 'admin';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('creates a server session and includes its UUID jti in the access token', async () => {
    const response = await request(appForSessions()).post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(response.status).toBe(200);
    const claims = jwt.verify(response.body.access_token, SECRET) as jwt.JwtPayload;
    expect(claims.jti).toEqual(expect.any(String));
    expect(sessions.has(claims.jti!)).toBe(true);
  });

  it('revokes the current session on logout and rejects token replay', async () => {
    const app = appForSessions();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    const token = login.body.access_token as string;

    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set('Authorization', 'Bearer ' + token)).status).toBe(204);
    const replay = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token);
    expect(replay.status).toBe(401);
  });

  it('revokes all sessions for the user, including a second token', async () => {
    const app = appForSessions();
    const first = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    const second = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });

    const logoutAll = await request(app).post('/api/auth/logout-all')
      .set('Authorization', 'Bearer ' + first.body.access_token);
    expect(logoutAll.status).toBe(200);
    expect(logoutAll.body.revoked_sessions).toBe(2);
    expect((await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer ' + second.body.access_token)).status).toBe(401);
  });

  it('uses current account role and active state on every request', async () => {
    const app = appForSessions();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    const token = login.body.access_token as string;

    user.role = 'viewer';
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token)).body.user.role).toBe('viewer');
    user.isActive = false;
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token)).status).toBe(401);
  });

  it('fails closed with HTTP 503 if session state cannot be read', async () => {
    const app = appForSessions();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    sessionStoreFails = true;

    const response = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer ' + login.body.access_token);
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('AUTH_STORE_UNAVAILABLE');
  });

  it('rejects unknown, expired, and wrong-user session identifiers', async () => {
    const app = appForSessions();
    const unknownId = randomUUID();
    const unknown = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer ' + tokenWithSession(unknownId));
    expect(unknown.status).toBe(401);

    const otherUserId = randomUUID();
    const wrongUserSessionId = randomUUID();
    await sessionRepository.createSession({
      id: wrongUserSessionId,
      userId: otherUserId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    const wrongUser = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer ' + tokenWithSession(wrongUserSessionId, USER_ID));
    expect(wrongUser.status).toBe(401);

    const expiredSessionId = randomUUID();
    await sessionRepository.createSession({
      id: expiredSessionId,
      userId: USER_ID,
      expiresAt: new Date(Date.now() - 1000)
    });
    const expired = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer ' + tokenWithSession(expiredSessionId));
    expect(expired.status).toBe(401);
  });

  it('allows an admin to revoke sessions for an account recovery target', async () => {
    const app = appForSessions();
    const login = await request(app).post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    const targetUserId = randomUUID();
    const targetSessionId = randomUUID();
    await sessionRepository.createSession({
      id: targetSessionId,
      userId: targetUserId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    const response = await request(app).post('/api/users/' + targetUserId + '/sessions/revoke-all')
      .set('Authorization', 'Bearer ' + login.body.access_token);
    expect(response.status).toBe(200);
    expect(response.body.revoked_sessions).toBe(1);
    expect(sessions.get(targetSessionId)?.revokedAt).toBeInstanceOf(Date);
  });

  it('does not allow an analyst to revoke another account sessions', async () => {
    const app = appForSessions();
    user.role = 'analyst';
    const login = await request(app).post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    const targetUserId = randomUUID();

    const response = await request(app).post('/api/users/' + targetUserId + '/sessions/revoke-all')
      .set('Authorization', 'Bearer ' + login.body.access_token);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('rejects a signed token without a jti session identifier', async () => {
    const response = await request(appForSessions()).get('/api/auth/me')
      .set('Authorization', 'Bearer ' + tokenWithoutSession());
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_ACCESS_TOKEN');
  });
});
