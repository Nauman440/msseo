import Link from 'next/link';
import type { CustomerSite } from '@/lib/customer-site';
import { prepare } from '@/lib/auto';
import { autoKeywords } from '@/lib/auto-sections';
import { freshKeywords } from '@/lib/keywords';
import { journeyFor } from '@/lib/journey';
import { Preparing } from './Preparing';
import { SiteHeader, type SiteTab } from './SiteHeader';

/**
 * Every customer site page: the site header with tabs that open step by step (the journey), and the
 * page itself, or a short "finish step N first" note while its step is still locked.
 */
export async function SiteFrame({ s, tab, children }: { s: CustomerSite; tab: SiteTab; children: React.ReactNode }) {
  // Competitors and keywords for this website: prepared by autopilot now, or repaired when they were
  // built from another website's sign-up answers.
  const preparing = await autoKeywords(s.domain, s.account, Boolean(s.latestId));
  // Lists cleaned with older rules are cleaned again (free), whichever page is opened first.
  prepare(`reclean:${s.domain}`, () => freshKeywords(s.domain), 60 * 60_000);
  const journey = await journeyFor(s);
  const locks: Partial<Record<SiteTab, { n: number; title: string }>> = {};
  for (const t of ['competitors', 'keywords', 'actions', 'content', 'local', 'backlinks', 'ai-search', 'tracking', 'monitor', 'plan', 'rankings'] as SiteTab[]) {
    const o = journey.open(t);
    if (!o.open && o.step) locks[t] = { n: o.step.n, title: o.step.title };
  }
  const lock = locks[tab];
  const blocker = lock ? journey.steps.find((x) => x.n === lock.n) : null;
  return (
    <>
      <SiteHeader domain={s.domain} tab={tab} connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} autopilotAt={s.autopilotAt} locks={locks} />
      {blocker ? (
        <section className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-6">
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-primary-heading">Step {blocker.n} first</p>
          <h2 className="font-display text-xl font-bold">{blocker.title}</h2>
          <p className="max-w-2xl text-sm text-ink-2">{blocker.why} This part opens as soon as that step is done, so each step builds on the one before.</p>
          <Link href={blocker.href} className="inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover">{blocker.cta}</Link>
        </section>
      ) : (
        <>
          {preparing && <Preparing what="this website's competitors, keywords and plan" />}
          {children}
        </>
      )}
    </>
  );
}
