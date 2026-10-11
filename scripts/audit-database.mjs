// Read-only audit: reports booleans/counts, never names, phones, password hashes or credentials.
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { execFileSync } from 'node:child_process';
const connection = new URL(process.env.DATABASE_URL);
if (connection.hostname.endsWith('neon.tech')) connection.searchParams.set('sslmode', 'verify-full');
const pool = new pg.Pool({ connectionString: connection.toString(), connectionTimeoutMillis: 10000, query_timeout: 10000 });
try {
  const history = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8' }).split('\n').filter(row => row.endsWith(' src/app/api/seed/route.ts'));
  const known = new Map();
  for (const row of history) {
    const source = execFileSync('git', ['cat-file', '-p', row.split(' ')[0]], { encoding: 'utf8' });
    const defaults = [...source.matchAll(/const (adminPhone|adminPass|demoPhone|demoPass)\s*=\s*process\.env\.\w+\s*\|\|\s*"([^"]+)"/g)].reduce((values, match) => ({ ...values, [match[1]]: match[2] }), {});
    for (const kind of ['admin', 'demo']) if (defaults[kind + 'Phone'] && defaults[kind + 'Pass']) known.set(defaults[kind + 'Phone'] + ':' + defaults[kind + 'Pass'], { phone: defaults[kind + 'Phone'], password: defaults[kind + 'Pass'] });
  }
  const affected = new Map();
  for (const { phone, password } of known.values()) {
    const { rows } = await pool.query('SELECT id, role, password_hash FROM users WHERE phone=$1 AND active=true', [phone]);
    for (const row of rows) if (await bcrypt.compare(password, row.password_hash)) affected.set(row.id, row.role);
  }
  const defaultPasswordsStillValid = affected.size, affectedRoles = [...affected.values()];
  const { rows: privileges } = await pool.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user');
  const { rows: migrations } = await pool.query('SELECT name FROM vpb_migrations ORDER BY name');
  const { rows: integrity } = await pool.query("SELECT (SELECT count(*)::int FROM users WHERE role NOT IN ('customer','admin','delivery')) AS invalid_roles, (SELECT count(*)::int FROM products WHERE price < 0 OR stock_quantity < 0) AS invalid_products, (SELECT count(*)::int FROM orders WHERE total < 0) AS invalid_totals");
  console.log(JSON.stringify({ defaultPasswordsStillValid, affectedRoles, privileges: privileges[0], appliedMigrations: migrations.map(row => row.name), integrity: integrity[0] }, null, 2));
} catch (error) { console.error('Read-only database audit unavailable:', error.code || 'configuration/network failure'); process.exitCode = 1; }
finally { await pool.end(); }
