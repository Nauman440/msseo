import 'server-only';
import { cache } from 'react';
import { normDomain } from '@seo/core';
import { getActions } from './actions';
import { getConnection } from './connections';
import { getSavedWorkspace } from './competitors';
import type { CustomerSite } from './customer-site';
import { getKeywordWorkspace } from './keywords';
import { getDoc, saveDoc } from './site-docs';

/**
 * The customer's SEO journey, one step after the other (customers only; the team sees every tab).
 * Each tab belongs to a step and opens once every step before it is done. The two connection steps
 * can be skipped; the steps autopilot does (competitors, keywords, action plan) count as done once
 * they have data or autopilot has run, so a failed paid call never locks a customer out. The last two
 * steps are areas to explore: they open together once the plan exists.
 */
export type StepId = 'audit' | 'google' | 'website' | 'competitors' | 'keywords' | 'actions' | 'grow' | 'monitor';
export type JourneyStep = { id: StepId; n: number; title: string; why: string; done: boolean; skippable: boolean; skipped: boolean; href: string; cta: string };
export type Journey = { steps: JourneyStep[]; current: JourneyStep | null; open: (tab: string) => { open: boolean; step: JourneyStep | null } };

const TAB_STEP: Record<string, StepId> = {
  overview: 'audit', issues: 'audit', reports: 'audit',
  connections: 'google', plan: 'google', rankings: 'google',
  competitors: 'competitors',
  keywords: 'keywords',
  actions: 'actions',
  content: 'grow', local: 'grow', backlinks: 'grow', 'ai-search': 'grow', tracking: 'grow',
  monitor: 'monitor',
};

type JourneyDoc = { skipped: StepId[] };
export const getSkips = async (domain: string) => (await getDoc<JourneyDoc>('journey', normDomain(domain)))?.skipped ?? [];
export async function skipStep(domain: string, step: StepId): Promise<void> {
  const skipped = await getSkips(domain);
  await saveDoc('journey', normDomain(domain), { skipped: [...new Set([...skipped, step])] });
}

export const journeyFor = cache(async (s: Pick<CustomerSite, 'domain' | 'latestId' | 'connected' | 'autopilotAt'>): Promise<Journey> => {
  const q = `site=${encodeURIComponent(s.domain)}`;
  const [skipped, connection, competitors, keywords, actions] = await Promise.all([
    getSkips(s.domain),
    getConnection(s.domain).catch(() => null),
    getSavedWorkspace(s.domain).catch(() => null),
    getKeywordWorkspace(s.domain).catch(() => null),
    getActions(s.domain).catch(() => null),
  ]);
  const ran = Boolean(s.autopilotAt);
  const steps: Omit<JourneyStep, 'n'>[] = [
    { id: 'audit', title: 'Check your website', why: 'We look at every page for problems that stop Google from showing it.', done: Boolean(s.latestId), skippable: false, skipped: false, href: `/my?${q}`, cta: 'See the audit' },
    { id: 'google', title: 'Connect Google', why: 'Search Console and Analytics show the searches that already find you and the calls and forms they bring.', done: s.connected || skipped.includes('google'), skippable: true, skipped: skipped.includes('google') && !s.connected, href: `/my/connections?${q}`, cta: 'Connect Google' },
    { id: 'website', title: 'Connect your website', why: 'So the fixes you approve can be put on your site for you (WordPress or Shopify).', done: Boolean(connection) || skipped.includes('website'), skippable: true, skipped: skipped.includes('website') && !connection, href: `/my/connections?${q}#website`, cta: 'Connect your website' },
    { id: 'competitors', title: 'Know your competitors', why: 'The businesses that show up instead of you, and how strong they are.', done: Boolean(competitors?.competitors.some((c) => c.shortlist !== 'none')) || ran, skippable: false, skipped: false, href: `/my/competitors?${q}`, cta: 'See competitors' },
    { id: 'keywords', title: 'Find the searches that bring customers', why: 'What people type into Google when they need you, grouped into topics, and which page should win each one.', done: Boolean(keywords?.clusters.length) || ran, skippable: false, skipped: false, href: `/my/keywords?${q}`, cta: 'See keywords' },
    { id: 'actions', title: 'Your 6-month plan', why: 'Every fix, most important first, spread over six months.', done: Boolean(actions?.actions.length), skippable: false, skipped: false, href: `/my/actions?${q}`, cta: 'See the plan' },
    { id: 'grow', title: 'Grow: changes, local, links', why: 'Better pages, your Google Business Profile and links from other sites.', done: Boolean(actions?.actions.length), skippable: false, skipped: false, href: `/my/content?${q}`, cta: 'Start growing' },
    { id: 'monitor', title: 'Watch the results', why: 'Rankings, visits and leads every week, alerts when something breaks, and a monthly report.', done: Boolean(actions?.actions.length), skippable: false, skipped: false, href: `/my/monitor?${q}`, cta: 'See results' },
  ];
  const numbered = steps.map((x, i) => ({ ...x, n: i + 1 }));
  const current = numbered.find((x) => !x.done) ?? null;
  return {
    steps: numbered,
    current,
    open: (tab) => {
      const id = TAB_STEP[tab];
      if (!id) return { open: true, step: null };
      const i = numbered.findIndex((x) => x.id === id);
      // Competitors and keywords are prepared by autopilot: shown as progress, they never lock a tab
      // (autopilot may be off or over budget). The other steps open the next ones in order.
      const blocker = numbered.slice(0, i).find((x) => !x.done && x.id !== 'competitors' && x.id !== 'keywords') ?? null;
      return { open: !blocker, step: blocker };
    },
  };
});
