import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyActions, hasDueChecks, judgeCheckpoint, normDomain, runChecks, type ActionWorkspace, type MappingWorkspace, type ReportModel } from '@seo/core';
import { usingDatabase } from './audit-store';
import { customerAudits } from './customer-data';
import { gscQueryPages } from './keywords';
import { getMapping } from './mapping';

/**
 * Module 12 action plans: Postgres when DATABASE_URL is set, a JSON file per site in
 * DATA_DIR/actions otherwise. Access is the same as Modules 3–5 (`competitorAccess`).
 */
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'actions');
const file = (domain: string) => resolve(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '')}.json`);

async function readPlan(domain: string): Promise<ActionWorkspace> {
  if (usingDatabase()) {
    const { getActionWorkspace } = await import('@seo/db');
    return (await getActionWorkspace(domain).catch(() => null)) ?? emptyActions(domain);
  }
  try {
    return JSON.parse(await readFile(file(domain), 'utf8')) as ActionWorkspace;
  } catch {
    return emptyActions(domain);
  }
}

export async function saveActions(ws: ActionWorkspace): Promise<void> {
  if (usingDatabase()) {
    const { saveActionWorkspace } = await import('@seo/db');
    await saveActionWorkspace(ws);
    return;
  }
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(ws.domain)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(ws));
  await rename(tmp, file(ws.domain));
}

/**
 * The plan, with any 7/14/28-day check that has come due judged first. The worker does this
 * daily; doing it on open as well keeps checks working without the worker.
 */
export async function getActions(rawDomain: string): Promise<ActionWorkspace> {
  const domain = normDomain(rawDomain);
  const ws = await readPlan(domain);
  if (!hasDueChecks(ws)) return ws;
  try {
    if (usingDatabase()) {
      const { checkActionWorkspace } = await import('@seo/db');
      return (await checkActionWorkspace(ws)).ws;
    }
    const audits = await customerAudits(`https://${domain}/`);
    const finishedAt = audits.rows.find((r) => r.status === 'completed')?.createdAt ?? null;
    const now = new Date();
    const r = await runChecks(ws, async (a) => judgeCheckpoint(a, { report: audits.latest ?? null, finishedAt }, null, now), now);
    if (r.checked) await saveActions(r.ws);
    return r.ws;
  } catch {
    return ws;
  }
}

/** Search Console clicks and impressions per page (last 3 months), for before-state snapshots. */
async function gscPages(domain: string) {
  const byPage = new Map<string, { url: string; clicks: number; impressions: number }>();
  for (const r of await gscQueryPages(domain)) {
    const p = byPage.get(r.page) ?? { url: r.page, clicks: 0, impressions: 0 };
    p.clicks += r.clicks;
    p.impressions += r.impressions;
    byPage.set(r.page, p);
  }
  return byPage.size ? [...byPage.values()] : null;
}

/** Everything suggestions and new actions need: the latest audit, the page plan and Search Console. */
export async function planContext(rawDomain: string, withGsc = false): Promise<{ report: ReportModel | null; mapping: MappingWorkspace; gsc: { url: string; clicks: number; impressions: number }[] | null }> {
  const domain = normDomain(rawDomain);
  const [audits, mapping, gsc] = await Promise.all([customerAudits(`https://${domain}/`), getMapping(domain), withGsc ? gscPages(domain) : Promise.resolve(null)]);
  return { report: audits.latest ?? null, mapping, gsc };
}
