import type { Metadata } from 'next';
import { KEYWORD_VIEWS, type KeywordView } from '@/components/keywords/KeywordTabs';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { TOPIC_ORDERS, type TopicOrder } from '@/components/keywords/labels';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { loadCustomerSite } from '@/lib/customer-site';
import { getKeywordWorkspace } from '@/lib/keywords';

export const metadata: Metadata = { title: 'Your keywords' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; view?: string; sort?: string; topics?: string; from?: string }> };

/** Module 4 for customers: their own websites only (Keywords tab, design: Keywords tab *.zip). */
export default async function CustomerKeywordsPage({ searchParams }: Props) {
  const { site, view, sort, topics, from } = await searchParams;
  const s = await loadCustomerSite(site);
  const ws = await getKeywordWorkspace(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="keywords" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <KeywordWorkspaceView
        ws={ws}
        audience="customer"
        base={`/my/keywords?site=${encodeURIComponent(s.domain)}`}
        state={{
          view: KEYWORD_VIEWS.includes(view as KeywordView) ? (view as KeywordView) : 'overview',
          order: TOPIC_ORDERS.some((o) => o.value === sort) ? (sort as TopicOrder) : 'priority',
          allTopics: topics === 'all',
          from: from === 'gap' || from === 'ranked' || from === 'gsc' || from === 'ideas' ? from : undefined,
        }}
      />
    </>
  );
}
