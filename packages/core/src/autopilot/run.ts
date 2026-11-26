import type { WordPressClient, WpChange, WpChangeType } from '../providers/wordpress';
import { pageKey } from './generate';
import { pluginId, type WorkItem } from './work-items';

/**
 * Applies ready work items through the Connector plugin, one at a time, checks each on the live
 * page, and protects the site: the first run on a site proves undo works on one change; a run that
 * leaves the homepage or a key page broken is undone in full; 3 failed changes stop the run.
 */
export const PLUGIN_TYPES: WpChangeType[] = ['meta_title', 'meta_description', 'canonical', 'robots_noindex', 'og_tags', 'image_alt', 'heading_fix', 'content_block', 'internal_link', 'schema', 'redirect_301', 'sitemap', 'robots_txt', 'llms_txt'];
export const DAILY_CAP = 30;
const MAX_FAILURES = 3;

export type Fetched = { status: number; html: string; location: string | null };
export type RunDeps = {
  wp: Pick<WordPressClient, 'apply' | 'rollback'>;
  /** GET with cache-busting, no redirect following. */
  fetchPage: (url: string) => Promise<Fetched>;
  wait?: (ms: number) => Promise<void>;
  now?: () => Date;
};
export type RunSummary = {
  id: string;
  startedAt: string;
  finishedAt: string;
  applied: number;
  verified: number;
  notVisible: number;
  failed: number;
  needsHuman: number;
  skipped: number;
  /** The whole run was undone (a page broke). */
  rolledBack: boolean;
  /** The site's autopilot stopped itself; a person must look. */
  paused: boolean;
  problems: string[];
  /** First run on the site: undo was tried on one change before anything else. */
  undoTested: boolean | null;
  /** Who started it: Client, Team or Schedule. */
  by?: string;
  /** Pages changed in this run (up to 5), checked again later by the post-run check. */
  changedPages?: string[];
  /** Words on each key page before the run (for the later check). */
  baselineWords?: Record<string, number>;
  /** Set by the post-run check an hour or more later. */
  laterCheck?: { at: string; ok: boolean; problems: string[] } | null;
};

/** The post-run check: the homepage and the changed pages, an hour or more after the run. */
export async function laterHealthCheck(urls: string[], baselineWords: Map<string, number>, deps: Pick<RunDeps, 'fetchPage'>): Promise<string[]> {
  const now = await health(urls, deps);
  return now.flatMap((h) => {
    if (!h.ok) return [`${h.url} stopped answering`];
    if (!h.title) return [`${h.url} has no title`];
    const b = baselineWords.get(h.url) ?? 0;
    if (b > 100 && h.words < b / 2) return [`${h.url} lost most of its text (${b} → ${h.words} words)`];
    return [];
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const plain = (h: string) => h.replace(/&#0?38;|&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;|&#039;/g, '’').replace(/&quot;/g, '"');

/** Whether the live HTML shows the change. null = this type is checked another way. */
export function visibleIn(item: WorkItem, html: string): boolean | null {
  const v = item.newValue as Record<string, unknown> | string | null;
  const h = plain(html);
  switch (item.type) {
    case 'meta_title':
      return typeof v === 'string' && (h.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').includes(plain(v));
    case 'meta_description':
      return typeof v === 'string' && (h.match(/<meta name=["']description["'] content=["']([^"']*)["']/i)?.[1] ?? '') === plain(esc(v)).replace(/&amp;/g, '&');
    case 'canonical':
      return typeof v === 'string' && pageKey(h.match(/<link rel=["']canonical["'] href=["']([^"']*)["']/i)?.[1] ?? '') === pageKey(v);
    case 'robots_noindex': {
      const robots = h.match(/<meta name=["']robots["'] content=["']([^"']*)["']/i)?.[1] ?? '';
      return v === 'noindex' ? /noindex/.test(robots) : !/noindex/.test(robots);
    }
    case 'og_tags':
      return Boolean(v && typeof v === 'object' && (!v.title || h.includes(`content="${plain(String(v.title))}"`)));
    case 'image_alt':
      return Boolean(v && typeof v === 'object' && h.includes(`alt="${plain(String(v.alt))}"`));
    case 'schema':
      return Boolean(v && typeof v === 'object' && h.includes('msscore-schema'));
    case 'content_block': {
      const html2 = v && typeof v === 'object' ? String(v.html ?? (Array.isArray(v.faq) ? (v.faq as { q: string }[])[0]?.q ?? '' : '')) : '';
      const words = html2.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).slice(0, 6).join(' ');
      return words ? h.includes(plain(words)) : null;
    }
    case 'internal_link':
      return v && typeof v === 'object' ? h.includes(`data-msscore-link="${String(v.link_id)}"`) : null;
    case 'heading_fix':
      if (v && typeof v === 'object' && v.action === 'demote_extra_h1') return (h.match(/<h1\b/gi) ?? []).length <= 1;
      if (v && typeof v === 'object' && v.action === 'set_h1_text') return (h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim() === plain(esc(String(v.text))).replace(/&amp;/g, '&');
      return null;
    case 'sitemap':
      return v && typeof v === 'object' && v.enabled === false ? null : /<(sitemapindex|urlset)\b/.test(html);
    case 'robots_txt':
      return /^\s*sitemap:/im.test(html);
    case 'llms_txt': {
      const first = v && typeof v === 'object' ? String(v.content ?? '').split('\n')[0] ?? '' : '';
      return first ? html.includes(first) : null;
    }
    default:
      return null;
  }
}

/** Ready items in a safe order: dependencies first, then priority, then week. */
export function applyOrder(items: WorkItem[], requireApproval = false): WorkItem[] {
  const ready = items.filter((i) => i.status === 'draft' && PLUGIN_TYPES.includes(i.type as WpChangeType) && (!requireApproval || i.approvedAt)).sort((a, b) => a.week - b.week || b.priority - a.priority);
  const done = new Set(items.filter((i) => ['applied', 'verified', 'keep'].includes(i.status)).map((i) => i.id));
  const out: WorkItem[] = [];
  const left = [...ready];
  while (left.length) {
    const i = left.findIndex((x) => x.dependsOn.every((d) => done.has(d) || !items.some((y) => y.id === d && y.status === 'draft')));
    const next = left.splice(i < 0 ? 0 : i, 1)[0]!;
    out.push(next);
    done.add(next.id);
  }
  return out;
}

const change = (i: WorkItem, id = pluginId(i)): WpChange => ({ change_id: id, type: i.type as WpChangeType, target: i.target ?? { site: true }, new_value: i.newValue, label: i.label.slice(0, 160) });

type Health = { url: string; ok: boolean; title: boolean; words: number };
async function health(urls: string[], deps: Pick<RunDeps, 'fetchPage'>): Promise<Health[]> {
  const out: Health[] = [];
  for (const url of urls) {
    try {
      const r = await deps.fetchPage(url);
      const body = r.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
      out.push({ url, ok: r.status === 200, title: /<title[^>]*>[^<]+<\/title>/i.test(r.html), words: body.split(/\s+/).filter(Boolean).length });
    } catch {
      out.push({ url, ok: false, title: false, words: 0 });
    }
  }
  return out;
}

/** Pages that got worse: down, lost their title, or lost more than half their text. */
function broken(before: Health[], after: Health[]): string[] {
  return before.flatMap((b) => {
    const a = after.find((x) => x.url === b.url);
    if (!b.ok || !a) return [];
    if (!a.ok) return [`${b.url} stopped answering`];
    if (b.title && !a.title) return [`${b.url} lost its title`];
    if (b.words > 100 && a.words < b.words / 2) return [`${b.url} lost most of its text (${b.words} → ${a.words} words)`];
    return [];
  });
}

/**
 * Applies up to `cap` ready items. `keyPages`: homepage first, then up to 5 key pages for the health
 * check. `firstRun`: no change was ever applied on this site, so undo is proven first.
 */
export async function runWorkItems(items: WorkItem[], deps: RunDeps, opts: { keyPages: string[]; firstRun: boolean; cap?: number; requireApproval?: boolean }): Promise<{ items: WorkItem[]; run: RunSummary }> {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  const wait = deps.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const run: RunSummary = { id: `run-${Date.now().toString(36)}`, startedAt: now(), finishedAt: '', applied: 0, verified: 0, notVisible: 0, failed: 0, needsHuman: 0, skipped: 0, rolledBack: false, paused: false, problems: [], undoTested: null };
  const all = items.map((i) => ({ ...i }));
  const queue = applyOrder(all, opts.requireApproval).slice(0, opts.cap ?? DAILY_CAP);
  const keyPages = [...new Set(opts.keyPages)].slice(0, 6);
  const baseline = await health(keyPages, deps);
  run.baselineWords = Object.fromEntries(baseline.map((b) => [b.url, b.words]));
  const appliedNow: WorkItem[] = [];

  for (const q of queue) {
    const it = all.find((x) => x.id === q.id)!;
    it.attempts++;
    try {
      if (opts.firstRun && run.undoTested === null) {
        // Prove undo works on this site before changing anything for real.
        const testId = `${it.id}-t${Date.now().toString(36)}`;
        const test = await deps.wp.apply(change(it, testId));
        if (test.status === 'applied') {
          const rb = await deps.wp.rollback(testId, 'undo test before the first run');
          run.undoTested = rb.status === 'rolled_back';
          if (!run.undoTested) {
            run.paused = true;
            run.problems.push(`Undo did not work on this site (${rb.reason ?? rb.status}); nothing else was changed.`);
            break;
          }
        }
      }
      let r = await deps.wp.apply(change(it));
      // The plugin never applies a change id twice. This exact change was made and undone before
      // (by a person, a test or Start over), so it is made again under a new id.
      if (r.status === 'rolled_back') {
        it.changeId = `${it.id}-r${Date.now().toString(36)}`;
        r = await deps.wp.apply(change(it));
      }
      if (r.status === 'applied') {
        it.status = 'applied';
        it.appliedAt = now();
        it.before = r.before ?? it.before;
        it.reason = null;
        run.applied++;
        appliedNow.push(it);
        const site = (it.url ?? '').replace(/\/+$/, '');
        const url = it.type === 'redirect_301' ? String((it.newValue as { from: string }).from) : it.type === 'llms_txt' ? (it.url ? `${site}/llms.txt` : null) : it.type === 'robots_txt' ? (it.url ? `${new URL(it.url).origin}/robots.txt` : null) : it.url;
        if (url) {
          let seen: boolean | null = null;
          for (let tryNo = 0; tryNo < 2 && seen !== true; tryNo++) {
            if (tryNo) await wait(3000);
            const page = await deps.fetchPage(url);
            seen = it.type === 'redirect_301' ? page.status === 301 && pageKey(page.location ?? '') === pageKey(String((it.newValue as { to: string }).to)) : visibleIn(it, page.html);
          }
          if (seen === true) {
            it.status = 'verified';
            it.verifiedAt = now();
            run.verified++;
          } else if (seen === false) {
            it.reason = 'Applied in WordPress, but not visible on the live page yet (a cache may still hold the old page).';
            run.notVisible++;
          }
        }
      } else if (r.status === 'needs_human' || r.status === 'skipped') {
        it.status = r.status;
        it.reason = r.reason ?? null;
        if (r.status === 'needs_human') run.needsHuman++;
        else run.skipped++;
      } else {
        it.status = 'failed';
        it.reason = r.reason ?? 'The site refused the change.';
        run.failed++;
      }
    } catch (err) {
      it.status = 'failed';
      it.reason = err instanceof Error ? err.message.slice(0, 200) : 'The site did not answer.';
      run.failed++;
    }
    if (run.failed >= MAX_FAILURES) {
      run.paused = true;
      run.problems.push(`${run.failed} changes failed in one run, so the autopilot stopped.`);
      break;
    }
  }

  const bad = appliedNow.length ? broken(baseline, await health(keyPages, deps)) : [];
  run.changedPages = [...new Set(appliedNow.map((i) => i.url).filter((u): u is string => Boolean(u)))].slice(0, 5);
  if (bad.length) {
    run.problems.push(...bad);
    for (const it of [...appliedNow].reverse()) {
      try {
        const rb = await deps.wp.rollback(pluginId(it), 'health check failed after the run');
        if (rb.status === 'rolled_back') {
          it.status = 'rolled_back';
          it.reason = `Undone automatically: ${bad[0]}`;
        }
      } catch {
        run.problems.push(`Could not undo ${it.label}.`);
      }
    }
    run.rolledBack = true;
    run.paused = true;
  }
  run.finishedAt = now();
  return { items: all, run };
}
