import express from 'express';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createAuthRouter } from '../auth/auth.routes.js';
import { createUsersRouter } from '../auth/users.routes.js';
import type {
  NewUser,
  PublicUser,
  StoredUser,
  UserRepository
} from '../auth/user.repository.js';

const TEST_SECRET = 'nexus-auth-test-secret-value-at-least-32-chars';
const TEST_PASSWORD = 'Correct-Horse-Battery-23!';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const ANALYST_ID = '550e8400-e29b-41d4-a716-446655440001';
const originalSecret = process.env.JWT_SECRET;

const publicAdmin: PublicUser = {
  id: ADMIN_ID,
  email: 'admin@example.com',
  role: 'admin',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z'
};

const adminUser: StoredUser = {
  id: ADMIN_ID,
  email: 'admin@example.com',
  role: 'admin',
  passwordHash: null,
  isActive: true
};

function makeRepository(
  overrides: Partial<UserRepository> = {},
  user: StoredUser = adminUser
): UserRepository {
  return {
    async findByEmail(email: string) {
      return email.toLowerCase() === user.email ? user : null;
    },
    async listUsers() {
      return [publicAdmin];
    },
    async createUser(input: NewUser) {
      return {
        id: input.id,
        email: input.email,
        role: input.role,
        isActive: true,
        createdAt: '2026-01-02T00:00:00.000Z'
      };
    },
    ...overrides
  };
}

function createTestApp(repository: UserRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAuthRouter(repository));
  app.use('/api', createUsersRouter(repository));
  return app;
}

async function loginAs(repository: UserRepository, email: string, password: string) {
  const response = await request(createTestApp(repository))
    .post('/api/auth/login')
    .send({ email, password });

  expect(response.status).toBe(200);
  return response.body.access_token as string;
}

describe('NEXUS user authentication and RBAC', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('issues a short-lived bearer token for valid credentials', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const repository = makeRepository({}, {
      ...adminUser,
      passwordHash
    });

    const response = await request(createTestApp(repository))
      .post('/api/auth/login')
      .send({ email: 'ADMIN@example.com', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.token_type).toBe('Bearer');
    expect(response.body.expires_in).toBe(900);
    expect(response.body.user.role).toBe('admin');
    expect(response.body.access_token).toEqual(expect.any(String));
    expect(response.body.access_token).not.toContain(TEST_PASSWORD);
  });

  it('rejects invalid credentials without revealing whether the account exists', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const repository = makeRepository({}, {
      ...adminUser,
      passwordHash
    });

    const response = await request(createTestApp(repository))
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('does not issue tokens for disabled accounts', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const repository = makeRepository({}, {
      ...adminUser,
      passwordHash,
      isActive: false
    });

    const response = await request(createTestApp(repository))
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: TEST_PASSWORD });

    expect(response.status).toBe(401);
  });

  it('returns the authenticated identity from a valid bearer token', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const repository = makeRepository({}, {
      ...adminUser,
      passwordHash
    });
    const app = createTestApp(repository);
    const token = await loginAs(repository, 'admin@example.com', TEST_PASSWORD);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: ADMIN_ID,
      email: 'admin@example.com',
      role: 'admin'
    });
  });

  it('requires authentication before exposing the user directory', async () => {
    const response = await request(createTestApp(makeRepository()))
      .get('/api/users');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });

  it('prevents analysts from creating users', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const analyst: StoredUser = {
      ...adminUser,
      id: ANALYST_ID,
      email: 'analyst@example.com',
      role: 'analyst',
      passwordHash
    };
    const repository = makeRepository({}, analyst);
    const token = await loginAs(repository, analyst.email, TEST_PASSWORD);

    const response = await request(createTestApp(repository))
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new-user@example.com',
        password: 'Another-Strong-Password-99!',
        role: 'viewer'
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('allows admins to create analyst or viewer accounts without returning password hashes', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    let createdInput: NewUser | undefined;
    const repository = makeRepository({
      async createUser(input) {
        createdInput = input;
        return {
          id: input.id,
          email: input.email,
          role: input.role,
          isActive: true,
          createdAt: '2026-01-02T00:00:00.000Z'
        };
      }
    }, {
      ...adminUser,
      passwordHash
    });
    const token = await loginAs(repository, adminUser.email, TEST_PASSWORD);

    const response = await request(createTestApp(repository))
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new-user@example.com',
        password: 'Another-Strong-Password-99!',
        role: 'analyst'
      });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('new-user@example.com');
    expect(response.body.user.role).toBe('analyst');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(createdInput?.passwordHash).toEqual(expect.any(String));
    expect(await bcrypt.compare('Another-Strong-Password-99!', createdInput!.passwordHash)).toBe(true);
  });

  it('does not allow the user API to create additional administrators', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const repository = makeRepository({}, {
      ...adminUser,
      passwordHash
    });
    const token = await loginAs(repository, adminUser.email, TEST_PASSWORD);

    const response = await request(createTestApp(repository))
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'another-admin@example.com',
        password: 'Another-Strong-Password-99!',
        role: 'admin'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });
});
