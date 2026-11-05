import { pool } from '../db/pool.js';
import type { UserRole } from './user.repository.js';

export interface NewSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface ActiveSession {
  userId: string;
  email: string;
  role: UserRole;
}

export interface SessionRepository {
  createSession(input: NewSession): Promise<void>;
  findActiveSession(sessionId: string, userId: string): Promise<ActiveSession | null>;
  revokeSession(sessionId: string, userId: string): Promise<boolean>;
  revokeAllSessions(userId: string): Promise<number>;
}

export class PostgresSessionRepository implements SessionRepository {
  async createSession(input: NewSession): Promise<void> {
    await pool.query(
      `DELETE FROM user_sessions
       WHERE expires_at < NOW() - INTERVAL '7 days'
          OR revoked_at < NOW() - INTERVAL '30 days'`
    );
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [input.id, input.userId, input.expiresAt]
    );
  }

  async findActiveSession(sessionId: string, userId: string): Promise<ActiveSession | null> {
    const result = await pool.query(
      `SELECT u.id AS user_id, u.email, u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2
         AND s.revoked_at IS NULL AND s.expires_at > NOW()
         AND u.is_active = TRUE
       LIMIT 1`,
      [sessionId, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { userId: row.user_id, email: row.email, role: row.role as UserRole };
  }

  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2
         AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [sessionId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await pool.query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [userId]
    );
    return result.rowCount ?? 0;
  }
}

export const sessionRepository = new PostgresSessionRepository();
