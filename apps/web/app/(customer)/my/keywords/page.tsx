import type { Metadata } from 'next';
import { parseKeywordView } from '@/components/keywords/KeywordTabs';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { TOPIC_ORDERS, type TopicOrder } from '@/components/keywords/labels';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { loadCustomerSite } from '@/lib/customer-site';
import { freshKeywords } from '@/lib/keywords';
import { freshMapping } from '@/lib/mapping';

export const metadata: Metadata = { title: 'Your keywords' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; view?: string; open?: string; sort?: string; topics?: string; from?: string; topic?: string; show?: string; all?: string; mode?: string }> };

/** Module 4 for customers: their own websites only (Keywords tab, design: Keywords tab *.zip). */
export default async function CustomerKeywordsPage({ searchParams }: Props) {
  const { site, view, open, sort, topics, from, topic, show, all, mode } = await searchParams;
  const s = await loadCustomerSite(site);
  const parsed = parseKeywordView(view, open);
  // Clean the list first, then the page plan follows the cleaned topics.
  const ws = await freshKeywords(s.domain);
  const mapping = await freshMapping(s.domain);
  return (
    <SiteFrame s={s} tab="keywords">
      <KeywordWorkspaceView
        ws={ws}
        audience="customer"
        base={`/my/keywords?site=${encodeURIComponent(s.domain)}`}
        state={{
          view: parsed.view,
          open: parsed.open,
          order: TOPIC_ORDERS.some((o) => o.value === sort) ? (sort as TopicOrder) : 'priority',
          allTopics: topics === 'all',
          from: from === 'gap' || from === 'pages' || from === 'ranked' || from === 'gsc' || from === 'ideas' ? from : undefined,
          mapping: { topic, show, all, mode },
        }}
        mappedTopics={mapping.rows.length}
      />
    </SiteFrame>
  );
}
