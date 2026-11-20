import type { Metadata } from 'next';
import { suggestions } from '@seo/core';
import { ActionPlanView } from '@/components/actions/ActionPlanView';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoActionPlan } from '@/lib/auto-sections';
import { planContext } from '@/lib/actions';
import { getConnection, viewOf } from '@/lib/connections';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Action plan' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 12 for customers: their own websites only (Action plan tab). */
export default async function CustomerActionsPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const [ws, ctx, conn] = await Promise.all([autoActionPlan(s.domain), planContext(s.domain), getConnection(s.domain)]);
  return (
    
      <SiteFrame s={s} tab="actions">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] font-bold">Your action plan</h2>
          <p className="mt-1 max-w-2xl text-[15px] text-ink-2">What to fix, in order, over the next 90 days. After each fix we check the results at 7, 14 and 28 days.</p>
        </div>
        {ws.actions.length > 0 && (
          <a href={`/api/action-plan/${s.domain}/csv`} className="inline-flex min-h-10 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3">
            Download CSV
          </a>
        )}
      </div>
      <ActionPlanView ws={ws} open={suggestions(ws, ctx.report, ctx.mapping)} audience="customer" hasAudit={Boolean(ctx.report)} site={viewOf(conn)} connectHref={`/my/connections?site=${encodeURIComponent(s.domain)}`} />
    </SiteFrame>
  );
}
