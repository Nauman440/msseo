import type { Metadata } from 'next';
import { KEYWORD_VIEWS, type KeywordView } from '@/components/keywords/KeywordTabs';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { TOPIC_ORDERS, type TopicOrder } from '@/components/keywords/labels';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoKeywords } from '@/lib/auto-sections';
import { loadCustomerSite } from '@/lib/customer-site';
import { getKeywordWorkspace } from '@/lib/keywords';
import { freshMapping } from '@/lib/mapping';

export const metadata: Metadata = { title: 'Your keywords' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; view?: string; sort?: string; topics?: string; from?: string; topic?: string; show?: string; all?: string }> };

/** Module 4 for customers: their own websites only (Keywords tab, design: Keywords tab *.zip). */
export default async function CustomerKeywordsPage({ searchParams }: Props) {
  const { site, view, sort, topics, from, topic, show, all } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoKeywords(s.domain, s.account, Boolean(s.latestId));
  const [ws, mapping] = await Promise.all([getKeywordWorkspace(s.domain), freshMapping(s.domain)]);
  return (
    
      <SiteFrame s={s} tab="keywords">
      {preparing && <Preparing what="your keywords, topics and page plan" />}
      <KeywordWorkspaceView
        ws={ws}
        audience="customer"
        base={`/my/keywords?site=${encodeURIComponent(s.domain)}`}
        state={{
          view: KEYWORD_VIEWS.includes(view as KeywordView) ? (view as KeywordView) : 'overview',
          order: TOPIC_ORDERS.some((o) => o.value === sort) ? (sort as TopicOrder) : 'priority',
          allTopics: topics === 'all',
          from: from === 'gap' || from === 'pages' || from === 'ranked' || from === 'gsc' || from === 'ideas' ? from : undefined,
          mapping: { topic, show, all },
        }}
        mappedTopics={mapping.rows.length}
      />
    </SiteFrame>
  );
}
