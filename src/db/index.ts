import 'server-only';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// DATABASE_URL is validated at request time, not module load time,
// so that Next.js can complete the production build without a live DB.
function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const isNeon = databaseUrl.includes("neon.tech");
  const connection = new URL(databaseUrl);
  if (isNeon || ['require', 'prefer'].includes(connection.searchParams.get('sslmode') || '')) connection.searchParams.set('sslmode', 'verify-full');
  return new Pool({
    connectionString: connection.toString(),
    ssl: isNeon ? { rejectUnauthorized: true } : undefined,
    connectionTimeoutMillis: 10000,
    query_timeout: 20000,
    idleTimeoutMillis: 60000,
    max: 10,
  });
}

const globalForDb = globalThis as typeof globalThis & {
  __vpbPool?: Pool;
};

// Reuse the pool across hot-reloads in development.
// In production each instance is fresh.
function getOrCreatePool(): Pool {
  if (!globalForDb.__vpbPool) {
    globalForDb.__vpbPool = getPool();
  }
  return globalForDb.__vpbPool;
}

export const db = drizzle(getOrCreatePool());
