import type { Metadata } from 'next';
import { ContentView } from '@/components/content/ContentView';
import { currentPlanMonth, PlanMonths, taskCounts } from '@/components/actions/PlanMonths';
import { SubTabs } from '@/components/ui/SubTabs';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoActionPlan, autoContent } from '@/lib/auto-sections';
import { getConnection, viewOf } from '@/lib/connections';
import { getAltText } from '@/lib/alt-text';
import { getContent } from '@/lib/content';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Changes' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; tasks?: string }> };

/**
 * Changes tab: the 6-month plan's tasks in two sub-tabs, To do (this month open, other months locked)
 * and Done (every finished task, newest month first), then the content check (Module 7).
 */
export default async function CustomerContentPage({ searchParams }: Props) {
  const { site, tasks } = await searchParams;
  const show = tasks === 'done' ? 'done' : 'todo';
  const s = await loadCustomerSite(site);
  const preparing = await autoContent(s.domain, Boolean(s.latestId));
  const [audit, alt, plan, conn] = await Promise.all([getContent(s.domain), getAltText(s.domain), autoActionPlan(s.domain), getConnection(s.domain)]);
  return (
    <SiteFrame s={s} tab="content">
      {preparing && <Preparing what="your content check and alt-text drafts" />}
      {plan.ws.actions.length > 0 && (() => {
        const counts = taskCounts(plan.ws);
        const href = (t: string) => `/my/content?site=${encodeURIComponent(s.domain)}${t === 'done' ? '&tasks=done' : ''}`;
        return (
          <SubTabs
            label="Tasks"
            active={show}
            tabs={[
              { key: 'todo', label: 'To do', count: counts.todo, href: href('todo') },
              { key: 'done', label: 'Done', count: counts.done, href: href('done') },
            ]}
          />
        );
      })()}
      <PlanMonths
        ws={plan.ws}
        audience="customer"
        site={viewOf(conn)}
        connectHref={`/my/connections?site=${encodeURIComponent(s.domain)}`}
        current={currentPlanMonth(plan.ws)}
        title={show === 'done' ? 'Changes already made' : "This month's changes"}
        show={show}
      />
      <ContentView audit={audit} domain={s.domain} audience="customer" alt={alt} />
    </SiteFrame>
  );
}
