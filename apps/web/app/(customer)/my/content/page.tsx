import type { Metadata } from 'next';
import { ContentView } from '@/components/content/ContentView';
import { currentPlanMonth, PlanMonths } from '@/components/actions/PlanMonths';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoActionPlan, autoContent } from '@/lib/auto-sections';
import { getConnection, viewOf } from '@/lib/connections';
import { getAltText } from '@/lib/alt-text';
import { getContent } from '@/lib/content';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Changes' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Changes tab: this month's to-dos from the 6-month plan (other months locked), then the content check (Module 7). */
export default async function CustomerContentPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoContent(s.domain, Boolean(s.latestId));
  const [audit, alt, plan, conn] = await Promise.all([getContent(s.domain), getAltText(s.domain), autoActionPlan(s.domain), getConnection(s.domain)]);
  return (
    <SiteFrame s={s} tab="content">
      {preparing && <Preparing what="your content check and alt-text drafts" />}
      <PlanMonths ws={plan.ws} audience="customer" site={viewOf(conn)} connectHref={`/my/connections?site=${encodeURIComponent(s.domain)}`} current={currentPlanMonth(plan.ws)} title="This month's changes" />
      <ContentView audit={audit} domain={s.domain} audience="customer" alt={alt} />
    </SiteFrame>
  );
}
