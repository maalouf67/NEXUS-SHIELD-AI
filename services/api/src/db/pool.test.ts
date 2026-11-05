import { describe, expect, it } from 'vitest';
import { createDatabaseSslOptions } from './pool.js';

describe('PostgreSQL TLS configuration', () => {
  it('disables TLS only when DATABASE_SSL is explicitly false', () => {
    expect(createDatabaseSslOptions({
      DATABASE_SSL: 'false',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/nexus'
    })).toBe(false);
  });

  it('uses the bundled Supabase CA only for Supabase database hosts', () => {
    const options = createDatabaseSslOptions({
      DATABASE_SSL: 'true',
      DATABASE_URL: 'postgresql://user:pass@db.project-ref.supabase.co:5432/postgres'
    });

    expect(options).not.toBe(false);
    if (options === false) throw new Error('TLS unexpectedly disabled');
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.ca).toContain('BEGIN CERTIFICATE');
  });

  it('uses the bundled Supabase CA for Supabase pooler hosts', () => {
    const options = createDatabaseSslOptions({
      DATABASE_SSL: 'true',
      DATABASE_URL: 'postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
    });

    expect(options).not.toBe(false);
    if (options === false) throw new Error('TLS unexpectedly disabled');
    expect(options.ca).toContain('BEGIN CERTIFICATE');
    expect(options.rejectUnauthorized).toBe(true);
  });

  it('uses the system trust store for other managed PostgreSQL providers', () => {
    const options = createDatabaseSslOptions({
      DATABASE_SSL: 'true',
      DATABASE_URL: 'postgresql://user:pass@private-db.railway.internal:5432/nexus'
    });

    expect(options).toEqual({ rejectUnauthorized: true });
    if (options !== false) expect(options).not.toHaveProperty('ca');
  });

  it('does not disable TLS when the database URL is temporarily absent or invalid', () => {
    expect(createDatabaseSslOptions({ DATABASE_SSL: 'true' }))
      .toEqual({ rejectUnauthorized: true });
    expect(createDatabaseSslOptions({
      DATABASE_SSL: 'true',
      DATABASE_URL: 'not-a-valid-url'
    })).toEqual({ rejectUnauthorized: true });
  });
});
