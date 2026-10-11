// Read-only local verification. Input credentials and session cookies are never logged.
import readline from 'node:readline';
console.log('Ready for admin login JSON on stdin.');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = readline.createInterface({ input: process.stdin, terminal: false });
const input = await new Promise(resolve => lines.once('line', resolve));
lines.close();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
const credentials = JSON.parse(input);
const base = 'http://localhost:3000';
const start = performance.now();
const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(30000) });
console.log(JSON.stringify({ route: '/api/admin/login', status: login.status, milliseconds: Math.round(performance.now() - start) }));
if (!login.ok) process.exit(1);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
for (const route of ['/api/admin?res=stats', '/api/delivery/settings', '/api/delivery/shipments']) {
  const begin = performance.now();
  const response = await fetch(base + route, { headers: { cookie }, signal: AbortSignal.timeout(30000) });
  await response.text();
  console.log(JSON.stringify({ route, status: response.status, milliseconds: Math.round(performance.now() - begin) }));
  if (!response.ok) process.exitCode = 1;
}
