import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@seo/db';

/**
 * Customer accounts from the public signup funnel (step 8): trial, plan and onboarding
 * answers. Postgres `CustomerAccount` when DATABASE_URL is set; a JSON file in DATA_DIR
 * otherwise, so the whole funnel can be developed and tested without a database.
 */
export const PLANS = {
  autopilot: { name: 'Autopilot', price: '$79', unit: '/month', websites: 1 },
  growth: { name: 'Growth', price: '$229', unit: '/month', websites: 3 },
} as const;
export type PlanId = keyof typeof PLANS;
export const isPlan = (v: unknown): v is PlanId => typeof v === 'string' && v in PLANS;
export const TRIAL_DAYS = 7;
export const CONNECTIONS = ['gsc', 'ga4', 'gbp', 'cms'] as const;
export type Connection = (typeof CONNECTIONS)[number];

export type Account = {
  id: string;
  userId: string;
  businessName: string;
  phone: string | null;
  plan: PlanId;
  status: 'trial' | 'active' | 'cancelled';
  trialEndsAt: string;
  website: string | null;
  sourceAuditId: string | null;
  country: string | null;
  areas: string[];
  otherCountries: boolean;
  language: string | null;
  services: string[];
  competitors: string[];
  connections: Connection[];
  consentChanges: boolean;
  consentAt: string | null;
  /** Next onboarding step to show (2–5); 6 = finished. Step 1 creates the account. */
  onboardingStep: number;
  onboardedAt: string | null;
  lastAutoAuditAt: string | null;
  createdAt: string;
};

export type AccountPatch = Partial<Omit<Account, 'id' | 'userId' | 'createdAt'>>;

const dbEnabled = () => Boolean(process.env.DATABASE_URL);
export const domainOf = (url: string) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// ---- file store (dev/tests) ----
const FILE = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'accounts.json');
async function readFileAccounts(): Promise<Account[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as Account[];
  } catch {
    return [];
  }
}
async function writeFileAccounts(accounts: Account[]) {
  await mkdir(resolve(FILE, '..'), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(accounts, null, 2));
  await rename(tmp, FILE);
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.customerAccount.findUnique>>>;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const fromDb = (r: Row): Account => ({
  ...r,
  plan: isPlan(r.plan) ? r.plan : 'growth',
  status: r.status === 'active' || r.status === 'cancelled' ? r.status : 'trial',
  connections: r.connections.filter((c): c is Connection => (CONNECTIONS as readonly string[]).includes(c)),
  trialEndsAt: r.trialEndsAt.toISOString(),
  consentAt: iso(r.consentAt),
  onboardedAt: iso(r.onboardedAt),
  lastAutoAuditAt: iso(r.lastAutoAuditAt),
  createdAt: r.createdAt.toISOString(),
});
const toDb = (p: AccountPatch) => ({
  ...p,
  ...(p.trialEndsAt !== undefined ? { trialEndsAt: new Date(p.trialEndsAt) } : {}),
  ...(p.consentAt !== undefined ? { consentAt: p.consentAt ? new Date(p.consentAt) : null } : {}),
  ...(p.onboardedAt !== undefined ? { onboardedAt: p.onboardedAt ? new Date(p.onboardedAt) : null } : {}),
  ...(p.lastAutoAuditAt !== undefined ? { lastAutoAuditAt: p.lastAutoAuditAt ? new Date(p.lastAutoAuditAt) : null } : {}),
});

export async function getAccountByUserId(userId: string): Promise<Account | null> {
  if (dbEnabled()) {
    const r = await prisma.customerAccount.findUnique({ where: { userId } });
    return r ? fromDb(r) : null;
  }
  return (await readFileAccounts()).find((a) => a.userId === userId) ?? null;
}

export async function createAccount(input: { userId: string; businessName: string; phone: string | null; plan: PlanId; website: string | null; sourceAuditId: string | null }): Promise<Account> {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  if (dbEnabled()) {
    const { projectIdFor } = await import('@seo/db');
    const projectId = input.website ? await projectIdFor(input.website) : null;
    return fromDb(await prisma.customerAccount.create({ data: { ...input, projectId, trialEndsAt: new Date(trialEndsAt) } }));
  }
  const account: Account = {
    id: randomUUID(), ...input, status: 'trial', trialEndsAt, country: null, areas: [], otherCountries: false, language: null, services: [], competitors: [],
    connections: [], consentChanges: false, consentAt: null, onboardingStep: 2, onboardedAt: null, lastAutoAuditAt: null, createdAt: new Date().toISOString(),
  };
  await writeFileAccounts([...(await readFileAccounts()), account]);
  return account;
}

export async function updateAccount(userId: string, patch: AccountPatch): Promise<void> {
  if (dbEnabled()) {
    const { projectIdFor } = await import('@seo/db');
    const project = patch.website ? { projectId: await projectIdFor(patch.website) } : {};
    await prisma.customerAccount.update({ where: { userId }, data: { ...toDb(patch), ...project } });
    return;
  }
  const accounts = await readFileAccounts();
  await writeFileAccounts(accounts.map((a) => (a.userId === userId ? { ...a, ...patch } : a)));
}

export type AccountWithUser = Account & { email: string; name: string | null; active: boolean };

/** For the team's Customers page, newest first. */
export async function listAccounts(): Promise<AccountWithUser[]> {
  if (dbEnabled()) {
    const rows = await prisma.customerAccount.findMany({ orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true, name: true, active: true } } } });
    return rows.map((r) => ({ ...fromDb(r), email: r.user.email, name: r.user.name, active: r.user.active }));
  }
  const { findUserById } = await import('./users');
  const accounts = (await readFileAccounts()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Promise.all(
    accounts.map(async (a) => {
      const u = await findUserById(a.userId);
      return { ...a, email: u?.email ?? '', name: u?.name ?? null, active: u?.active ?? false };
    }),
  );
}
