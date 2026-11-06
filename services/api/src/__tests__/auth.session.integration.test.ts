import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { pool } from '../db/pool.js';
import { sessionRepository } from '../auth/session.repository.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';
const userId = randomUUID();
const sessionIds: string[] = [];

describe.skipIf(!enabled)('PostgreSQL server-session integration', () => {
  afterEach(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    if (sessionIds.length) {
      await pool.query('DELETE FROM user_sessions WHERE id = ANY($1::uuid[])', [sessionIds]);
      sessionIds.length = 0;
    }
  });

  it('reads current user state and revokes one session', async () => {
    const email = `session-${userId}@example.test`;
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [userId, email]
    );

    const sessionId = randomUUID();
    sessionIds.push(sessionId);
    expect(await sessionRepository.findActiveSession(randomUUID(), userId)).toBeNull();
    await sessionRepository.createSession({
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    expect(await sessionRepository.findActiveSession(sessionId, userId)).toEqual({
      userId, email, role: 'analyst'
    });
    const wrongUserId = randomUUID();
    expect(await sessionRepository.findActiveSession(sessionId, wrongUserId)).toBeNull();

    const expiredSessionId = randomUUID();
    sessionIds.push(expiredSessionId);
    await pool.query(
      'INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() - INTERVAL \'1 minute\')',
      [expiredSessionId, userId]
    );
    expect(await sessionRepository.findActiveSession(expiredSessionId, userId)).toBeNull();
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['viewer', userId]);
    expect((await sessionRepository.findActiveSession(sessionId, userId))?.role).toBe('viewer');

    expect(await sessionRepository.revokeSession(sessionId, userId)).toBe(true);
    expect(await sessionRepository.findActiveSession(sessionId, userId)).toBeNull();
    expect(await sessionRepository.revokeSession(sessionId, userId)).toBe(false);
  });

  it('cleans stale expired sessions without deleting active ones', async () => {
    const email = `cleanup-${userId}@example.test`;
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE)`,
      [userId, email]
    );

    const staleId = randomUUID();
    const activeId = randomUUID();
    sessionIds.push(staleId, activeId);
    await pool.query(
      'INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() - INTERVAL \'8 days\')',
      [staleId, userId]
    );

    await sessionRepository.createSession({
      id: activeId,
      userId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    expect((await pool.query('SELECT id FROM user_sessions WHERE id = $1', [staleId])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM user_sessions WHERE id = $1', [activeId])).rowCount).toBe(1);
  });

  it('revokes all active sessions for one user without affecting another user', async () => {
    const otherUserId = randomUUID();
    const email = `session-${userId}@example.test`;
    const otherEmail = `other-${otherUserId}@example.test`;
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'analyst', NULL, TRUE), ($3, $4, 'viewer', NULL, TRUE)`,
      [userId, email, otherUserId, otherEmail]
    );

    const firstId = randomUUID();
    const secondId = randomUUID();
    const otherId = randomUUID();
    sessionIds.push(firstId, secondId, otherId);
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    await Promise.all([
      sessionRepository.createSession({ id: firstId, userId, expiresAt: expiry }),
      sessionRepository.createSession({ id: secondId, userId, expiresAt: expiry }),
      sessionRepository.createSession({ id: otherId, userId: otherUserId, expiresAt: expiry })
    ]);

    expect(await sessionRepository.revokeAllSessions(userId)).toBe(2);
    expect(await sessionRepository.findActiveSession(firstId, userId)).toBeNull();
    expect(await sessionRepository.findActiveSession(secondId, userId)).toBeNull();
    expect(await sessionRepository.findActiveSession(otherId, otherUserId)).not.toBeNull();

    await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
  });
});
