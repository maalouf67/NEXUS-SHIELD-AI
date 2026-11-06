import { pool } from '../db/pool.js';
import type { UserRole } from './user.repository.js';

export interface AuthenticatedSessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface CreateAuthSessionInput {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  expectedPasswordHash?: string;
  /** Used only by the isolated in-memory test repository. Never persisted. */
  testIdentity?: AuthenticatedSessionUser;
}

export interface AuthSessionRepository {
  createSession(input: CreateAuthSessionInput): Promise<void>;
  findActiveSession(sessionId: string, userId: string): Promise<AuthenticatedSessionUser | null>;
  revokeSession(sessionId: string, userId: string, reason: string, revokedByUserId?: string): Promise<boolean>;
  revokeAllSessions(userId: string, reason: string, revokedByUserId?: string): Promise<number>;
}

export class PostgresAuthSessionRepository implements AuthSessionRepository {
  async createSession(input: CreateAuthSessionInput): Promise<void> {
    // Bound historical session metadata retention and serialize session
    // creation against concurrent user disablement/password changes.
    await pool.query(
      "DELETE FROM auth_sessions WHERE expires_at < NOW() - INTERVAL '30 days'"
    );
    const result = await pool.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at)
       SELECT $1, users.id, $3
       FROM users
       WHERE users.id = $2
         AND users.is_active = TRUE
         AND ($4::text IS NULL OR users.password_hash = $4)
       RETURNING id`,
      [input.sessionId, input.userId, input.expiresAt, input.expectedPasswordHash ?? null]
    );
    if ((result.rowCount ?? 0) !== 1) {
      throw new Error('User security state changed before the session could be created.');
    }
  }

  async findActiveSession(
    sessionId: string,
    userId: string
  ): Promise<AuthenticatedSessionUser | null> {
    const result = await pool.query<{
      id: string;
      email: string;
      role: UserRole;
    }>(
      `SELECT users.id, users.email, users.role
       FROM auth_sessions
       INNER JOIN users ON users.id = auth_sessions.user_id
       WHERE auth_sessions.id = $1
         AND auth_sessions.user_id = $2
         AND auth_sessions.revoked_at IS NULL
         AND auth_sessions.expires_at > NOW()
         AND users.is_active = TRUE
       LIMIT 1`,
      [sessionId, userId]
    );

    return result.rows[0] ?? null;
  }

  async revokeSession(sessionId: string, userId: string, reason: string, revokedByUserId = userId): Promise<boolean> {
    const result = await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW(), revocation_reason = $3, revoked_by_user_id = $4
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [sessionId, userId, reason, revokedByUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeAllSessions(userId: string, reason: string, revokedByUserId = userId): Promise<number> {
    const result = await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW(), revocation_reason = $2, revoked_by_user_id = $3
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       RETURNING id`,
      [userId, reason, revokedByUserId]
    );
    return result.rowCount ?? 0;
  }
}

type MemorySession = {
  userId: string;
  expiresAt: number;
  revokedAt: number | null;
  revokedByUserId: string | null;
  identity: AuthenticatedSessionUser;
};

export class InMemoryAuthSessionRepository implements AuthSessionRepository {
  private readonly sessions = new Map<string, MemorySession>();

  registerTestSession(input: CreateAuthSessionInput): void {
    if (!input.testIdentity) {
      throw new Error('An in-memory test session requires a test identity.');
    }
    this.sessions.set(input.sessionId, {
      userId: input.userId,
      expiresAt: input.expiresAt.getTime(),
      revokedAt: null,
      revokedByUserId: null,
      identity: input.testIdentity
    });
  }

  async createSession(input: CreateAuthSessionInput): Promise<void> {
    this.registerTestSession(input);
  }

  async findActiveSession(
    sessionId: string,
    userId: string
  ): Promise<AuthenticatedSessionUser | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.revokedAt !== null ||
        session.expiresAt <= Date.now()) {
      return null;
    }
    return session.identity;
  }

  async revokeSession(sessionId: string, userId: string, _reason: string, revokedByUserId = userId): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.revokedAt !== null) return false;
    session.revokedAt = Date.now();
    session.revokedByUserId = revokedByUserId;
    return true;
  }

  async revokeAllSessions(userId: string, _reason: string, revokedByUserId = userId): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.revokedAt === null &&
          session.expiresAt > Date.now()) {
        session.revokedAt = Date.now();
        session.revokedByUserId = revokedByUserId;
        revoked += 1;
      }
    }
    return revoked;
  }
}

const testSessionRepository = process.env.NODE_ENV === 'test'
  ? new InMemoryAuthSessionRepository()
  : null;

export const authSessionRepository: AuthSessionRepository =
  testSessionRepository ?? new PostgresAuthSessionRepository();

/**
 * Register a token/session pair only in the unit-test process. Production code
 * cannot use this function to create sessions or bypass the PostgreSQL store.
 */
export function registerTestAuthSession(input: CreateAuthSessionInput): void {
  if (!testSessionRepository) {
    throw new Error('Test auth sessions are available only when NODE_ENV=test.');
  }
  testSessionRepository.registerTestSession(input);
}
