import type { Pool } from 'pg';
import { afterEach, expect, test, vi } from 'vitest';
import { users } from '../src/db/schema';

const cache = globalThis as typeof globalThis & { __vpbPool?: Pool };

afterEach(async () => {
  await cache.__vpbPool?.end();
  delete cache.__vpbPool;
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('routes can import the database without runtime credentials', async () => {
  vi.stubEnv('DATABASE_URL', undefined);
  const { db } = await import('../src/db');
  expect(cache.__vpbPool).toBeUndefined();
  expect(() => db.select().from(users)).toThrow('DATABASE_URL environment variable is required');
  expect(cache.__vpbPool).toBeUndefined();
});

test('credentials provided after import initialize a usable shared database', async () => {
  vi.stubEnv('DATABASE_URL', undefined);
  const { db } = await import('../src/db');
  expect(() => db.select().from(users)).toThrow('DATABASE_URL environment variable is required');

  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:54329/postgres');
  const query = db.select({ id: users.id }).from(users).toSQL();
  expect(query.sql).toBe('select "id" from "users"');
  const pool = cache.__vpbPool;
  expect(pool).toBeDefined();
  db.select().from(users).toSQL();
  expect(cache.__vpbPool).toBe(pool);
});
