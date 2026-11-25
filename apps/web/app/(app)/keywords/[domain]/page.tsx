import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { parseKeywordView } from '@/components/keywords/KeywordTabs';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { TOPIC_ORDERS, type TopicOrder } from '@/components/keywords/labels';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { freshKeywords } from '@/lib/keywords';
import { freshMapping } from '@/lib/mapping';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ view?: string; open?: string; sort?: string; topics?: string; from?: string; topic?: string; show?: string; all?: string; mode?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Keywords · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 4 for the team: any client's website (same views as the customer's Keywords tab). */
export default async function TeamKeywordsPage({ params, searchParams }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const { view, open, sort, topics, from, topic, show, all, mode } = await searchParams;
  const parsed = parseKeywordView(view, open);
  // Clean the list first, then the page plan follows the cleaned topics.
  const ws = await freshKeywords(domain);
  const mapping = await freshMapping(domain);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Keyword research" title={domain} intro="The searches this client’s customers use, cleaned, grouped into topics and ranked by value and chance to rank, the page plan that turns them into changes, and the questions people ask AI assistants." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
          <Link href={`/competitors/${domain}`} className={link}>Competitors</Link>
        </div>
      </div>
      <KeywordWorkspaceView
        ws={ws}
        audience="team"
        base={`/keywords/${domain}`}
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
    </Container>
  );
}
