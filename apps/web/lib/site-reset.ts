import 'server-only';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normDomain } from '@seo/core';
import { usingDatabase } from './audit-store';
import { clearSigningKey, deleteConnection, getConnection } from './connections';
import { siteSession } from './autopilot-wp';

/**
 * Admin: delete everything MS SCORE stored about one website, so it can be tested again from the
 * start. Optionally first undoes every change MS SCORE made on the website itself (through the
 * plugin), so the website is also back as it was. Customer accounts, logins and API usage history
 * are kept; the website stays on its customer's account and starts again at step 1 (the audit).
 */
export type SiteResetResult = {
  domain: string;
  undone: number | null;
  notUndone: { change_id: string; reason: string }[];
  undoProblem: string | null;
  deleted: string[];
};

const DATA = () => resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'));
const safe = (s: string) => s.replace(/[^a-z0-9.-]/gi, '');

/** Undoes every live change on the website (plugin 1.4.0+ in one call; older plugins one by one). */
async function undoOnSite(domain: string): Promise<Pick<SiteResetResult, 'undone' | 'notUndone' | 'undoProblem'>> {
  const conn = await getConnection(domain);
  if (!conn || conn.platform !== 'wordpress') return { undone: null, notUndone: [], undoProblem: conn ? 'Only WordPress sites can be put back automatically.' : null };
  try {
    const { wp } = await siteSession(conn);
    try {
      const r = await wp.rollbackAll('All data for this website deleted in MS SCORE');
      return { undone: r.undone, notUndone: r.left, undoProblem: null };
    } catch {
      // Plugin before 1.4.0: undo the live changes from its change log, newest first.
      let undone = 0;
      const notUndone: SiteResetResult['notUndone'] = [];
      for (let page = 1; page <= 10; page++) {
        const list = await wp.changes(page);
        for (const c of list.filter((x) => x.status === 'applied')) {
          const r = await wp.rollback(c.change_id, 'All data for this website deleted in MS SCORE');
          if (r.status === 'rolled_back') undone++;
          else notUndone.push({ change_id: c.change_id, reason: r.reason ?? r.status });
        }
        if (list.length < 50) break;
      }
      return { undone, notUndone, undoProblem: null };
    }
  } catch (err) {
    return { undone: null, notUndone: [], undoProblem: err instanceof Error ? err.message.slice(0, 200) : 'The website did not answer.' };
  }
}

export async function deleteSiteData(rawDomain: string, opts: { undoWebsite: boolean }): Promise<SiteResetResult> {
  const domain = normDomain(rawDomain);
  const undo = opts.undoWebsite ? await undoOnSite(domain) : { undone: null, notUndone: [], undoProblem: null };
  // The plugin forgets MS SCORE's key, so the next connection starts clean.
  const conn = await getConnection(domain);
  if (conn) await clearSigningKey(conn).catch(() => undefined);
  const deleted: string[] = [];
  const hosts = [domain, `www.${domain}`];

  if (usingDatabase()) {
    const { prisma } = await import('@seo/db');
    const projects = await prisma.project.findMany({ where: { domain: { in: hosts } }, select: { id: true } });
    const ids = projects.map((p) => p.id);
    const counts = await prisma.$transaction([
      prisma.audit.deleteMany({ where: { projectId: { in: ids } } }),
      prisma.competitorWorkspace.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.keywordWorkspace.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.mappingWorkspace.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.actionWorkspace.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.competitorAnalysis.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.siteConnection.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.siteDocument.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.siteInventory.deleteMany({ where: { domain: { in: hosts } } }),
      prisma.wpAutopilot.deleteMany({ where: { domain: { in: hosts } } }),
    ]);
    const names = ['audits', 'competitors', 'keywords', 'page plan', 'action plan', 'competitor analysis', 'website connection', 'other site documents', 'WordPress inventory', 'autopilot'];
    counts.forEach((c, i) => c.count && deleted.push(`${names[i]} (${c.count})`));
    // The Search Console / Analytics property chosen for this website (the Google login itself stays).
    for (const g of await prisma.customerGoogle.findMany({ select: { userId: true, sites: true } })) {
      const sites = { ...((g.sites ?? {}) as Record<string, unknown>) };
      if (!hosts.some((h) => h in sites)) continue;
      for (const h of hosts) delete sites[h];
      await prisma.customerGoogle.update({ where: { userId: g.userId }, data: { sites: sites as object } });
      deleted.push('Google property choice');
    }
    return { domain, ...undo, deleted };
  }

  // Without a database: one JSON file per website in each folder of DATA_DIR, audits by their address.
  const root = DATA();
  for (const dir of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!dir.isDirectory()) continue;
    const folder = resolve(root, dir.name);
    for (const f of await readdir(folder).catch(() => [] as string[])) {
      if (!f.endsWith('.json')) continue;
      let mine = hosts.some((h) => f === `${safe(h)}.json` || f.endsWith(`__${safe(h)}.json`));
      if (!mine && dir.name === 'audits') {
        try {
          const a = JSON.parse(await readFile(resolve(folder, f), 'utf8')) as { url?: string };
          mine = hosts.includes(new URL(a.url ?? '').hostname.toLowerCase());
        } catch {
          mine = false;
        }
      }
      if (mine) {
        await unlink(resolve(folder, f)).catch(() => undefined);
        deleted.push(`${dir.name}/${f}`);
      }
    }
  }
  await deleteConnection(domain).catch(() => undefined);
  return { domain, ...undo, deleted };
}
