// Credentials arrive via stdin, never command arguments, logs, or source control.
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

console.log('Ready for admin configuration JSON on stdin. Credentials will not be printed.');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = readline.createInterface({ input: process.stdin, terminal: false });
const input = await new Promise(resolve => lines.once('line', resolve));
lines.close();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
const { username, password, phone } = JSON.parse(input);
if (!/^[a-z0-9_]{3,80}$/.test(username) || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) throw new Error('Invalid admin credentials');
const hash = await bcrypt.hash(password, 10);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  const result = await pool.query("UPDATE users SET username=$1, password_hash=$2, session_version=session_version+1 WHERE phone=$3 AND role='admin' AND active=true RETURNING id", [username, hash, phone]);
  if (result.rowCount !== 1) throw new Error('Exactly one active main-admin account must match');
  console.log('Main-admin username and password updated successfully.');
} catch (error) { console.error('Admin configuration failed:', error.code || 'Unable to update account'); process.exitCode = 1; }
finally { await pool.end(); }
