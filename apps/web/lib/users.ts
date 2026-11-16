import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '@seo/db';

/**
 * Team accounts. Postgres `User` table when DATABASE_URL is set (the server); a JSON
 * file in DATA_DIR otherwise, so login can be developed and tested without a database.
 */
export type Role = 'admin' | 'member' | 'customer';
/** Team roles use the internal tool; customers only see their own website (step 8). */
export const isTeamRole = (r: Role): r is 'admin' | 'member' => r === 'admin' || r === 'member';
export type TeamUser = { id: string; email: string; name: string | null; role: Role; active: boolean; passwordHash: string; createdAt: string };
export type PublicUser = Omit<TeamUser, 'passwordHash'>;

const BCRYPT_COST = 12; // spec §4
const dbEnabled = () => Boolean(process.env.DATABASE_URL);
export const normaliseEmail = (email: string) => email.trim().toLowerCase();
export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const toPublic = (u: TeamUser): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt });

// ---- file store (dev/tests) ----
const FILE = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'users.json');
async function readFileUsers(): Promise<TeamUser[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as TeamUser[];
  } catch {
    return [];
  }
}
async function writeFileUsers(users: TeamUser[]) {
  await mkdir(resolve(FILE, '..'), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(users, null, 2));
  await rename(tmp, FILE);
}

const fromDb = (u: { id: string; email: string; name: string | null; role: Role; active: boolean; passwordHash: string; createdAt: Date }): TeamUser => ({ ...u, createdAt: u.createdAt.toISOString() });

export async function countUsers(): Promise<number> {
  return dbEnabled() ? prisma.user.count() : (await readFileUsers()).length;
}

export async function findUserByEmail(email: string): Promise<TeamUser | null> {
  const e = normaliseEmail(email);
  if (dbEnabled()) {
    const u = await prisma.user.findUnique({ where: { email: e } });
    return u ? fromDb(u) : null;
  }
  return (await readFileUsers()).find((u) => u.email === e) ?? null;
}

export async function findUserById(id: string): Promise<TeamUser | null> {
  if (dbEnabled()) {
    const u = await prisma.user.findUnique({ where: { id } });
    return u ? fromDb(u) : null;
  }
  return (await readFileUsers()).find((u) => u.id === id) ?? null;
}

/** Team members only (customers are listed on the Customers page). */
export async function listUsers(): Promise<PublicUser[]> {
  const users = dbEnabled() ? (await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })).map(fromDb) : await readFileUsers();
  return users.filter((u) => isTeamRole(u.role)).map(toPublic);
}

export class UserExistsError extends Error {}

export async function createUser(input: { email: string; name?: string | null; role: Role; password: string }): Promise<PublicUser> {
  const email = normaliseEmail(input.email);
  if (await findUserByEmail(email)) throw new UserExistsError(`An account for ${email} already exists.`);
  const passwordHash = await hashPassword(input.password);
  if (dbEnabled()) {
    return toPublic(fromDb(await prisma.user.create({ data: { email, name: input.name ?? null, role: input.role, passwordHash } })));
  }
  const users = await readFileUsers();
  const user: TeamUser = { id: randomUUID(), email, name: input.name ?? null, role: input.role, active: true, passwordHash, createdAt: new Date().toISOString() };
  await writeFileUsers([...users, user]);
  return toPublic(user);
}

export async function updateUser(id: string, patch: Partial<Pick<TeamUser, 'name' | 'role' | 'active'>> & { password?: string }): Promise<void> {
  const data: Partial<TeamUser> = { ...('name' in patch ? { name: patch.name ?? null } : {}), ...(patch.role ? { role: patch.role } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) };
  if (patch.password) data.passwordHash = await hashPassword(patch.password);
  if (dbEnabled()) {
    await prisma.user.update({ where: { id }, data });
    return;
  }
  const users = await readFileUsers();
  await writeFileUsers(users.map((u) => (u.id === id ? { ...u, ...data } : u)));
}
