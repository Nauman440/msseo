import type { Metadata } from 'next';
import { gapByCompetitor } from '@seo/core';
import { CompetitorWorkspaceView } from '@/components/competitors/CompetitorWorkspaceView';
import { COMPETITOR_VIEWS, type CompetitorView } from '@/components/competitors/labels';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoAnalysis } from '@/lib/auto-sections';
import { getAnalysis, nextCustomerRun } from '@/lib/analysis';
import { getWorkspace } from '@/lib/competitors';
import { loadCustomerSite } from '@/lib/customer-site';
import { getKeywordWorkspace } from '@/lib/keywords';

export const metadata: Metadata = { title: 'Your competitors' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; view?: string }> };

/** Module 3 for customers: their own websites only (Competitors tab, design: Competitors tab *.zip). */
export default async function CustomerCompetitorsPage({ searchParams }: Props) {
  const { site, view } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoAnalysis(s.domain);
  const [ws, keywords, analysis] = await Promise.all([getWorkspace(s.domain), getKeywordWorkspace(s.domain), getAnalysis(s.domain)]);
  const q = `site=${encodeURIComponent(s.domain)}`;
  return (
    
      <SiteFrame s={s} tab="competitors">
      {preparing && <Preparing what="the comparison with your competitors" />}
      <CompetitorWorkspaceView
        ws={ws}
        audience="customer"
        base={`/my/competitors?${q}`}
        view={COMPETITOR_VIEWS.includes(view as CompetitorView) ? (view as CompetitorView) : 'competitors'}
        gaps={gapByCompetitor(keywords)}
        analysis={analysis}
        nextRun={nextCustomerRun(analysis)}
        gapHref={`/my/keywords?${q}&view=all&from=gap`}
      />
    </SiteFrame>
  );
}
