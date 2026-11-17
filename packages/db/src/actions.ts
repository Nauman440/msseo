import { gscSearchAnalytics, hasDueChecks, judgeCheckpoint, matchGscProperties, runChecks, type ActionItem, type ActionWorkspace, type ReportModel } from '@seo/core';
import { prisma, type Prisma } from './client';
import { customerGoogleReady, customerGoogleToken, getCustomerGoogle } from './customer-google';
import { getGscConnection, gscAccessToken, gscProperties, gscSetup } from './gsc';

/** Module 12 action plans in Postgres (one JSON document per website). */
export async function getActionWorkspace(domain: string): Promise<ActionWorkspace | null> {
  const row = await prisma.actionWorkspace.findUnique({ where: { domain } });
  return row ? (row.data as unknown as ActionWorkspace) : null;
}

export async function saveActionWorkspace(ws: ActionWorkspace): Promise<void> {
  const data = ws as unknown as Prisma.InputJsonValue;
  await prisma.actionWorkspace.upsert({ where: { domain: ws.domain }, create: { domain: ws.domain, data }, update: { data } });
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};
const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;
/** Search Console data arrives about 3 days late. */
const LAG_DAYS = 3;

/** Read access to the site's Search Console: the customer's own connection first, else the agency one. */
async function searchConsoleFor(domain: string): Promise<{ token: string; property: string } | null> {
  if (customerGoogleReady()) {
    const owners = await prisma.customerAccount.findMany({ select: { userId: true, website: true, extraWebsites: true } });
    const owner = owners.find((a) => [a.website, ...a.extraWebsites].some((w) => w && hostOf(w) === domain));
    const conn = owner ? await getCustomerGoogle(owner.userId).catch(() => null) : null;
    const property = conn?.sites[domain]?.gscProperty;
    if (owner && property) return { token: await customerGoogleToken(owner.userId), property };
  }
  if (!gscSetup().ready || !(await getGscConnection())) return null;
  const property = matchGscProperties(await gscProperties(), `https://${domain}/`)[0];
  return property ? { token: await gscAccessToken(), property } : null;
}

async function latestAudit(domain: string): Promise<{ report: ReportModel | null; finishedAt: string | null }> {
  const project = await prisma.project.findUnique({ where: { domain }, select: { id: true } });
  const a = project
    ? await prisma.audit.findFirst({ where: { projectId: project.id, status: 'completed' }, orderBy: { createdAt: 'desc' }, select: { report: true, finishedAt: true, createdAt: true } })
    : null;
  return { report: (a?.report as unknown as ReportModel) ?? null, finishedAt: (a?.finishedAt ?? a?.createdAt)?.toISOString() ?? null };
}

/** Clicks per day for the action's pages and for every other page, before and after the fix. */
async function clicksAround(sc: { token: string; property: string }, a: ActionItem, until: number) {
  const done = Date.parse(a.doneAt!);
  const end = Math.min(until, Date.now() - LAG_DAYS * DAY);
  const afterDays = Math.floor((end - done) / DAY);
  if (afterDays < 3) return null;
  const read = (from: number, to: number) => gscSearchAnalytics(sc.token, sc.property, { startDate: day(from), endDate: day(to), dimensions: ['page'], maxRows: 5000 });
  const [before, after] = await Promise.all([read(done - 28 * DAY, done - DAY), read(done, end)]);
  const mine = new Set(a.urls.map(normUrl));
  const split = (rows: { keys: string[]; clicks: number }[], days: number) => {
    let target = 0;
    let control = 0;
    for (const r of rows) (mine.has(normUrl(r.keys[0] ?? '')) ? (target += r.clicks) : (control += r.clicks));
    return { target: target / days, control: control / days };
  };
  const b = split(before, 28);
  const n = split(after, afterDays);
  return { targetBefore: b.target, targetAfter: n.target, controlBefore: b.control, controlAfter: n.control };
}

export type ActionCheckRun = { domain: string; checked: number; verified: number; error: string | null };

/**
 * 12.6 Daily: for every finished action with a checkpoint (7/14/28 days) that is due, compare the
 * newest audit and Search Console clicks with the before-state. A 28-day result of fixed or
 * improved marks the action verified.
 */
export async function checkActionWorkspace(ws: ActionWorkspace, now = new Date()): Promise<ActionCheckRun & { ws: ActionWorkspace }> {
  let error: string | null = null;
  const latest = await latestAudit(ws.domain).catch(() => ({ report: null, finishedAt: null }));
  const sc = await searchConsoleFor(ws.domain).catch((err: unknown) => {
    error = `Search Console: ${err instanceof Error ? err.message : String(err)}`;
    return null;
  });
  const r = await runChecks(
    ws,
    async (a, c) => judgeCheckpoint(a, latest, sc && a.urls.length ? await clicksAround(sc, a, Date.parse(c.dueAt)).catch(() => null) : null, now),
    now,
  );
  if (r.checked) await saveActionWorkspace(r.ws);
  return { domain: ws.domain, checked: r.checked, verified: r.verified, error, ws: r.ws };
}

export async function runDueActionChecks(now = new Date()): Promise<ActionCheckRun[]> {
  const rows = await prisma.actionWorkspace.findMany({ select: { data: true } });
  const out: ActionCheckRun[] = [];
  for (const row of rows) {
    const ws = row.data as unknown as ActionWorkspace;
    if (!hasDueChecks(ws, now)) continue;
    const { ws: _ws, ...r } = await checkActionWorkspace(ws, now);
    out.push(r);
  }
  return out;
}
