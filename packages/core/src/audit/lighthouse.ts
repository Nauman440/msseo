import type { HttpLog } from '../providers/http';
import { runPageSpeed, type PageSpeedResult } from '../providers/pagespeed';
import type { Template } from './templates';

/** One template's Lighthouse results (spec §7). A device is null when PageSpeed failed or ran out of time. */
export type LighthouseRun = {
  label: string;
  type: Template['type'];
  url: string;
  pages: number;
  mobile: PageSpeedResult | null;
  desktop: PageSpeedResult | null;
};

export const MAX_TEMPLATES = 6;

type Opts = {
  key: string;
  /** The homepage mobile run that already started at discovery time (reused, not repeated). */
  homeMobile: Promise<PageSpeedResult | null>;
  homeUrl: string;
  /** Overall budget: runs not finished by then are reported as failed. */
  budgetMs: number;
  /** Per-call timeout and retries (shorter in quick mode). */
  timeoutMs: number;
  retries: number;
  concurrency?: number;
  log?: HttpLog;
};

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/**
 * PageSpeed mobile + desktop for each template representative (up to MAX_TEMPLATES).
 * Starts every call at once (up to `concurrency`, default 12) so the slowest single PageSpeed
 * run sets the time, within `budgetMs`; failures never fail the audit.
 */
export async function runTemplateLighthouse(templates: Template[], o: Opts): Promise<LighthouseRun[]> {
  const picked = templates.slice(0, MAX_TEMPLATES);
  const runs: LighthouseRun[] = picked.map((t) => ({ label: t.label, type: t.type, url: t.representative, pages: t.urls.length, mobile: null, desktop: null }));
  const jobs: { run: LighthouseRun; strategy: 'mobile' | 'desktop' }[] = [];
  for (const run of runs) {
    for (const strategy of ['mobile', 'desktop'] as const) {
      if (strategy === 'mobile' && norm(run.url) === norm(o.homeUrl)) continue;
      jobs.push({ run, strategy });
    }
  }
  const home = runs.find((r) => norm(r.url) === norm(o.homeUrl));
  const homeDone = o.homeMobile.then((r) => {
    if (home) home.mobile = r;
  });
  let stopped = false;
  const work = (async () => {
    const queue = [...jobs];
    await Promise.all([
      homeDone,
      ...Array.from({ length: Math.min(o.concurrency ?? 12, queue.length) }, async () => {
        for (let j = queue.shift(); j && !stopped; j = queue.shift()) {
          j.run[j.strategy] = await runPageSpeed(j.run.url, j.strategy, o.key, o.log, { timeoutMs: o.timeoutMs, retries: o.retries }).catch(() => null);
        }
      }),
    ]);
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise((resolve) => (timer = setTimeout(resolve, o.budgetMs)))]);
  clearTimeout(timer);
  stopped = true;
  // Snapshot: a call finishing after the budget must not change the saved report.
  return runs.map((r) => ({ ...r }));
}
