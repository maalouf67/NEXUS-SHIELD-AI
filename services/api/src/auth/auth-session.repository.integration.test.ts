import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { pool } from '../db/pool.js';
import { PostgresAuthSessionRepository } from './auth-session.repository.js';

const databaseIntegrationEnabled =
  process.env.NEXUS_RUN_DB_INTEGRATION === 'true' &&
  Boolean(process.env.DATABASE_URL);

describe('PostgreSQL access-session lifecycle integration', () => {
  (databaseIntegrationEnabled ? it : it.skip)(
    'checks active-user state and current role, revokes one session and revokes all active sessions',
    async () => {
      const repository = new PostgresAuthSessionRepository();
      const userId = randomUUID();
      const email = `session-${randomUUID()}@example.test`;
      const firstSessionId = randomUUID();
      const secondSessionId = randomUUID();
      const thirdSessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      try {
        await pool.query(
          `INSERT INTO users (id, email, role, password_hash, is_active)
           VALUES ($1, $2, 'analyst', 'test-password-hash', TRUE)`,
          [userId, email]
        );

        await repository.createSession({ sessionId: firstSessionId, userId, expiresAt, expectedPasswordHash: 'test-password-hash' });
        await repository.createSession({ sessionId: secondSessionId, userId, expiresAt, expectedPasswordHash: 'test-password-hash' });
        await expect(repository.createSession({
          sessionId: randomUUID(),
          userId,
          expiresAt,
          expectedPasswordHash: 'stale-password-hash'
        })).rejects.toThrow('User security state changed');

        expect(await repository.findActiveSession(firstSessionId, userId)).toEqual({
          id: userId,
          email,
          role: 'analyst'
        });

        expect(await repository.findActiveSession(firstSessionId, randomUUID())).toBeNull();
        expect(await repository.findActiveSession(randomUUID(), userId)).toBeNull();

        await pool.query('UPDATE users SET role = $2 WHERE id = $1', [userId, 'viewer']);
        // A role change revokes every previously issued access session.
        expect(await repository.findActiveSession(firstSessionId, userId)).toBeNull();
        expect(await repository.findActiveSession(secondSessionId, userId)).toBeNull();

        await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, 'updated-password-hash']);
        // Credential changes also revoke existing sessions.
        await expect(repository.createSession({
          sessionId: randomUUID(),
          userId,
          expiresAt,
          expectedPasswordHash: 'test-password-hash'
        })).rejects.toThrow('User security state changed');

        await repository.createSession({
          sessionId: thirdSessionId,
          userId,
          expiresAt,
          expectedPasswordHash: 'updated-password-hash'
        });
        expect((await repository.findActiveSession(thirdSessionId, userId))?.role).toBe('viewer');
        expect(await repository.revokeSession(thirdSessionId, userId, 'test_logout')).toBe(true);
        expect(await repository.findActiveSession(thirdSessionId, userId)).toBeNull();
        const revokeAudit = await pool.query(
          'SELECT revoked_by_user_id, revocation_reason FROM auth_sessions WHERE id = $1',
          [thirdSessionId]
        );
        expect(revokeAudit.rows[0].revoked_by_user_id).toBe(userId);
        expect(revokeAudit.rows[0].revocation_reason).toBe('test_logout');
        expect(await repository.revokeSession(thirdSessionId, userId, 'test_logout')).toBe(false);

        const fourthSessionId = randomUUID();
        const fifthSessionId = randomUUID();
        await repository.createSession({ sessionId: fourthSessionId, userId, expiresAt });
        await repository.createSession({ sessionId: fifthSessionId, userId, expiresAt });
        expect(await repository.revokeAllSessions(userId, 'test_revoke_all')).toBe(2);
        expect(await repository.findActiveSession(fourthSessionId, userId)).toBeNull();
        expect(await repository.findActiveSession(fifthSessionId, userId)).toBeNull();

        const expirySessionId = randomUUID();
        await repository.createSession({
          sessionId: expirySessionId,
          userId,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        });
        await pool.query(
          'UPDATE auth_sessions SET expires_at = NOW() - INTERVAL \'1 second\' WHERE id = $1',
          [expirySessionId]
        );
        expect(await repository.findActiveSession(expirySessionId, userId)).toBeNull();

        const concurrentSessionIds = Array.from({ length: 8 }, () => randomUUID());
        await Promise.all(concurrentSessionIds.map((sessionId) =>
          repository.createSession({
            sessionId,
            userId,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
          })
        ));
        const concurrentResults = await Promise.all(concurrentSessionIds.map((sessionId) =>
          repository.findActiveSession(sessionId, userId)
        ));
        expect(concurrentResults.every((session) => session?.id === userId)).toBe(true);

        const concurrentRevokes = await Promise.all([
          repository.revokeAllSessions(userId, 'test_concurrent_revoke'),
          repository.revokeAllSessions(userId, 'test_concurrent_revoke')
        ]);
        expect(concurrentRevokes.reduce((total, count) => total + count, 0)).toBe(8);
        for (const sessionId of concurrentSessionIds) {
          expect(await repository.findActiveSession(sessionId, userId)).toBeNull();
        }

        const disabledSessionId = randomUUID();
        await repository.createSession({ sessionId: disabledSessionId, userId, expiresAt });
        await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);
        expect(await repository.findActiveSession(disabledSessionId, userId)).toBeNull();
      } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        await pool.query('SELECT 1');
      }
    }
  );
});
