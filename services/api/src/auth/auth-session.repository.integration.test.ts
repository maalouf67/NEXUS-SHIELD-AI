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
           VALUES ($1, $2, 'analyst', NULL, TRUE)`,
          [userId, email]
        );

        await repository.createSession({ sessionId: firstSessionId, userId, expiresAt });
        await repository.createSession({ sessionId: secondSessionId, userId, expiresAt });

        expect(await repository.findActiveSession(firstSessionId, userId)).toEqual({
          id: userId,
          email,
          role: 'analyst'
        });

        await pool.query('UPDATE users SET role = $2 WHERE id = $1', [userId, 'viewer']);
        expect((await repository.findActiveSession(firstSessionId, userId))?.role).toBe('viewer');

        expect(await repository.findActiveSession(firstSessionId, randomUUID())).toBeNull();
        expect(await repository.findActiveSession(randomUUID(), userId)).toBeNull();

        expect(await repository.revokeSession(firstSessionId, userId, 'test_logout')).toBe(true);
        expect(await repository.findActiveSession(firstSessionId, userId)).toBeNull();
        expect(await repository.revokeSession(firstSessionId, userId, 'test_logout')).toBe(false);

        await repository.createSession({ sessionId: thirdSessionId, userId, expiresAt });
        expect(await repository.revokeAllSessions(userId, 'test_revoke_all')).toBe(2);
        expect(await repository.findActiveSession(secondSessionId, userId)).toBeNull();
        expect(await repository.findActiveSession(thirdSessionId, userId)).toBeNull();

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
