import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { pool } from '../db/pool.js';

const emailSchema = z.string().email().max(254);
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? '';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';

async function main() {
  try {
    const parsedEmail = emailSchema.safeParse(adminEmail);
    if (!parsedEmail.success || adminPassword.length < 16 || adminPassword.length > 128) {
      throw new Error(
        'Set a valid BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of 16–128 characters.'
      );
    }

    const existingAdmin = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existingAdmin.rowCount && existingAdmin.rowCount > 0) {
      throw new Error(
        'An admin account already exists. Bootstrap is one-time and will not replace an existing administrator.'
      );
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'admin', $3, TRUE)`,
      [randomUUID(), parsedEmail.data, passwordHash]
    );

    console.log(`Created the initial administrator account for ${parsedEmail.data}.`);
    console.log('Remove BOOTSTRAP_ADMIN_PASSWORD from the environment after this one-time operation.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown bootstrap failure.';
    console.error(`Admin bootstrap failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
