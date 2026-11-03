import { pool } from '../db/pool.js';

export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface StoredUser {
  id: string;
  email: string;
  role: UserRole;
  passwordHash: string | null;
  isActive: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface NewUser {
  id: string;
  email: string;
  role: UserRole;
  passwordHash: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  listUsers(): Promise<PublicUser[]>;
  createUser(input: NewUser): Promise<PublicUser>;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PostgresUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<StoredUser | null> {
    const result = await pool.query(
      `SELECT id, email, role, password_hash, is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      passwordHash: row.password_hash ?? null,
      isActive: row.is_active === true
    };
  }

  async listUsers(): Promise<PublicUser[]> {
    const result = await pool.query(
      `SELECT id, email, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC, email ASC`
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      isActive: row.is_active === true,
      createdAt: toIsoString(row.created_at)
    }));
  }

  async createUser(input: NewUser): Promise<PublicUser> {
    const result = await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, email, role, is_active, created_at`,
      [input.id, input.email.toLowerCase(), input.role, input.passwordHash]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      isActive: row.is_active === true,
      createdAt: toIsoString(row.created_at)
    };
  }
}

export const userRepository = new PostgresUserRepository();
