import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(72641011)");
  await client.query('CREATE TABLE IF NOT EXISTS vpb_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of ['0001_delivery.sql', '0002_admin_username.sql', '0003_order_notifications.sql']) {
  const sql = (await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const windowsChecksum = createHash('sha256').update(sql.replace(/\n/g, '\r\n')).digest('hex');
  const { rows } = await client.query('SELECT checksum FROM vpb_migrations WHERE name = $1', [name]);
  if (rows.length && rows[0].checksum !== checksum) {
    if (rows[0].checksum !== windowsChecksum) throw new Error('Applied migration checksum differs; do not edit an applied migration.');
    await client.query('UPDATE vpb_migrations SET checksum = $1 WHERE name = $2', [checksum, name]);
  }
  if (!rows.length) {
    await client.query(sql);
    await client.query('INSERT INTO vpb_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
  }
  console.log(rows.length ? name + ' already applied.' : name + ' applied.');
  }
  await client.query('COMMIT');
  const counts = await client.query('SELECT (SELECT count(*)::int FROM orders) AS orders, (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM delivery_staff) AS delivery_staff, (SELECT count(*)::int FROM delivery_providers) AS delivery_providers');
  console.log('Database record counts:', counts.rows[0]);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', error.code || error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
