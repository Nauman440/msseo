import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { usingDatabase } from './audit-store';

/**
 * Per-site JSON documents (Module 8 "backlinks", Module 9 "local"): Postgres `SiteDocument` when
 * DATABASE_URL is set, a JSON file in DATA_DIR/<kind> otherwise.
 */
const dir = (kind: string) => resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), kind);
const file = (kind: string, domain: string) => resolve(dir(kind), `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);

export async function getDoc<T>(kind: string, domain: string): Promise<T | null> {
  if (usingDatabase()) {
    const { getSiteDocument } = await import('@seo/db');
    return getSiteDocument<T>(kind, domain).catch(() => null);
  }
  try {
    return JSON.parse(await readFile(file(kind, domain), 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function saveDoc(kind: string, domain: string, data: unknown): Promise<void> {
  if (usingDatabase()) {
    const { saveSiteDocument } = await import('@seo/db');
    await saveSiteDocument(kind, domain, data);
    return;
  }
  await mkdir(dir(kind), { recursive: true });
  const tmp = `${file(kind, domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file(kind, domain));
}

/** Customer runs (Modules 6, 8, 9) share the admin's monthly cap with autopilot. */
export async function underCap(estimateUsd: number): Promise<boolean> {
  if (!usingDatabase()) return true;
  const [{ autopilotSpentThisMonth }, { appSettings }] = await Promise.all([import('@seo/db'), import('./settings')]);
  const cap = (await appSettings())['autopilot.monthlyCap'];
  return (await autopilotSpentThisMonth()) + estimateUsd <= cap;
}

/** Records a run's real DataForSEO charge (customer runs count toward the cap, team runs do not). */
export async function recordRun(endpoint: string, by: 'team' | 'customer', calls: number, costUsd: number): Promise<void> {
  if (!usingDatabase()) return;
  const { prisma } = await import('@seo/db');
  await prisma.apiUsage.create({ data: { provider: 'dataforseo', endpoint: by === 'customer' ? endpoint : `${endpoint}-team`, units: calls, costUsd } }).catch(() => undefined);
}

/** The next time a customer may run a monthly analysis (null = now). */
export function nextMonthlyRun(lastRunAt: string | null | undefined, days = 30, now = new Date()): Date | null {
  if (!lastRunAt) return null;
  const next = new Date(Date.parse(lastRunAt) + days * 86_400_000);
  return next.getTime() > now.getTime() ? next : null;
}
