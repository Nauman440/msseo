// Fails when a committed env template contains real values, or when a .env file is staged.
// Runs as a git pre-commit hook (.githooks/pre-commit) and in CI.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SECRET_KEYS = /^(?:[A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN|LOGIN)|DATABASE_URL|REDIS_URL)=(.*)$/;
const problems = [];

const template = readFileSync('.env.example', 'utf8').replace(/\r/g, '');
for (const line of template.split('\n')) {
  const m = SECRET_KEYS.exec(line);
  if (m && m[1].replace(/#.*/, '').trim()) problems.push(`.env.example: ${line.split('=')[0]} has a value — keep real keys in .env only`);
}

try {
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n');
  for (const f of staged) if (/(^|\/)\.env(\.[^/]*)?$/.test(f) && !f.endsWith('.env.example')) problems.push(`${f} is staged — env files must never be committed`);
} catch {
  // not in a git checkout (e.g. CI tarball): template check above still applies
}

if (problems.length) {
  console.error('Secret check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Secret check passed');
