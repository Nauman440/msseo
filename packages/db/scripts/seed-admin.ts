// Create or reset an admin account (spec §4), e.g. from Coolify's terminal:
//   pnpm --filter @seo/db seed:admin --email you@company.com --password 'at-least-10-chars'
// Re-running for an existing email resets its password and makes it an active admin.
import bcrypt from 'bcryptjs';
import { prisma } from '../src/index';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const password = arg('password');
const name = arg('name') ?? null;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length < 10) {
  process.stderr.write('Usage: seed:admin --email you@company.com --password <at least 10 characters> [--name "Your Name"]\n');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);
const user = await prisma.user.upsert({
  where: { email },
  create: { email, name, passwordHash, role: 'admin' },
  update: { passwordHash, role: 'admin', active: true, ...(name ? { name } : {}) },
});
process.stdout.write(`Admin ready: ${user.email}\n`);
await prisma.$disconnect();
