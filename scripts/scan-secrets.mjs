// Local-only scan. Output identifies locations/detectors and never prints secret values.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const known = [];
if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
  if (match && /SECRET|SALT|API_KEY|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL/.test(match[1])) {
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (value.length >= 8) known.push([match[1], value]);
  }
}
const patterns = {
  credential_url: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/g,
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  github_token: /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g,
  aws_key: /AKIA[A-Z0-9]{16}/g,
  literal_private_setting: /(?:JWT_SECRET|PAYU_MERCHANT_SALT|RENFLAIR_API_KEY|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|AISENSY_API_KEY)\s*[:=]\s*['"]([^'"\r\n]{8,})['"]/g,
};
const seedSource = git('rev-list', '--objects', '--all').split('\n').filter(row => row.endsWith(' src/app/api/seed/route.ts')).map(row => git('cat-file', '-p', row.split(' ')[0])).join('\n');
const retiredDefaults = [...new Set([...seedSource.matchAll(/const (adminPass|demoPass)\s*=\s*process\.env\.\w+\s*\|\|\s*"([^"]+)"/g)].map(match => match[2]))];
let findings = 0, historicalDefaults = 0, fixtureMatches = 0;
const affectedCommits = new Map();
function scan(data, label, history = false) {
  const hits = [];
  for (const [name, value] of known) if (data.includes(value)) hits.push('local_secret:' + name);
  for (const [name, regex] of Object.entries(patterns)) {
    regex.lastIndex = 0;
    for (const match of data.matchAll(regex)) {
      const fixture = /(?:tests[\\/]|scripts[\\/]e2e-server\.mjs)/.test(label) && (
        name === 'credential_url' && match[0] === ('postgresql' + '://postgres:postgres@') ||
        name === 'literal_private_setting' && (/^(?:isolated-|E2e-only-)/.test(match[1] || '') || match[1] === 'review-tests-only-secret-not-a-real-production-credential')
      );
      if (fixture) fixtureMatches++; else hits.push(name);
    }
  }
  for (const value of retiredDefaults) if (data.includes(value)) {
    if (history) {
      historicalDefaults++;
      const oid = label.split(':')[1];
      if (!affectedCommits.has(oid)) affectedCommits.set(oid, git('log', '--all', '--find-object=' + oid, '--format=%h', '--', 'src/app/api/seed/route.ts').trim().split('\n').filter(Boolean));
      console.log(JSON.stringify({ location: label, commits: affectedCommits.get(oid), warning: 'retired_public_seed_password', action: 'rotate any deployed account that used this default' }));
    }
    else hits.push('retired_public_seed_password');
  }
  if (hits.length) { findings++; console.log(JSON.stringify({ location: label, detectors: [...new Set(hits)] })); }
}
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
for (const file of files) {
  if (/^\.env(?:\.|$)/.test(file) && file !== '.env.example') { findings++; console.log(JSON.stringify({ location: file, detector: 'real_env_file' })); }
  if (existsSync(file) && statSync(file).isFile() && statSync(file).size < 5_000_000) scan(readFileSync(file, 'utf8'), file);
}
let historyBlobs = 0;
for (const row of git('rev-list', '--objects', '--all').split('\n')) {
  const space = row.indexOf(' '); if (space < 0) continue;
  const oid = row.slice(0, space), file = row.slice(space + 1);
  const realEnv = /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example');
  if (!realEnv && !/\.(?:env|ts|tsx|js|mjs|json|md|yml|yaml|txt|example|local|sql)$/.test(file)) continue;
  if (realEnv) { findings++; console.log(JSON.stringify({ location: `history:${oid}:${file}`, detector: 'committed_real_env_file' })); }
  historyBlobs++; scan(git('cat-file', '-p', oid), `history:${oid}:${file}`, true);
}
let browserFiles = 0;
function browserScan(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) browserScan(file);
    else if (/\.(?:js|map|json|svg)$/.test(file)) { browserFiles++; scan(readFileSync(file, 'utf8'), file); }
  }
}
browserScan('.next/static'); browserScan('public');
console.log(JSON.stringify({ currentSecretFindings: findings, historicalDefaultPasswordLocations: historicalDefaults, acknowledgedIsolatedFixtureMatches: fixtureMatches, worktreeFiles: files.length, historyBlobs, browserFiles }, null, 2));
process.exitCode = findings ? 1 : 0;
