import { KEYWORD_ROLES, type KeywordRole } from '@seo/core';
import type { Metadata } from 'next';
import { parseKeywordView } from '@/components/keywords/KeywordTabs';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { TOPIC_ORDERS, type TopicOrder } from '@/components/keywords/labels';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { loadCustomerSite } from '@/lib/customer-site';
import { freshKeywords } from '@/lib/keywords';
import { freshMapping } from '@/lib/mapping';
import { restoreKeywordsAfterFast } from '@/lib/keyword-restore';
import { insightsFor } from '@/lib/keyword-insights';
import { Preparing } from '@/components/customer/Preparing';

export const metadata: Metadata = { title: 'Your keywords' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; view?: string; open?: string; sort?: string; topics?: string; from?: string; topic?: string; show?: string; all?: string; mode?: string; role?: string }> };

/** Module 4 for customers: their own websites only (Keywords tab, design: Keywords tab *.zip). */
export default async function CustomerKeywordsPage({ searchParams }: Props) {
  const { site, view, open, sort, topics, from, topic, show, all, mode, role } = await searchParams;
  const s = await loadCustomerSite(site);
  const parsed = parseKeywordView(view, open);
  // Clean the list first, then the page plan follows the cleaned topics.
  // Lists cut down by the withdrawn fast keyword run get the full research again (once, in the background).
  const restoring = await restoreKeywordsAfterFast(s.domain);
  const ws = await freshKeywords(s.domain);
  const mapping = await freshMapping(s.domain);
  const insights = await insightsFor(ws, mapping);
  return (
    <SiteFrame s={s} tab="keywords">
      {restoring && <Preparing what="your full keyword list again" />}
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
          role: KEYWORD_ROLES.includes(role as KeywordRole) ? (role as KeywordRole) : undefined,
          mapping: { topic, show, all, mode },
        }}
        mappedTopics={mapping.rows.length}
        insights={insights}
      />
    </SiteFrame>
  );
}
