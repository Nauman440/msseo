import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { KEYWORD_VIEWS, type KeywordView } from '@/components/keywords/KeywordTabs';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { TOPIC_ORDERS, type TopicOrder } from '@/components/keywords/labels';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getKeywordWorkspace } from '@/lib/keywords';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ view?: string; sort?: string; topics?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Keywords · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 4 for the team: any client's website (same views as the customer's Keywords tab). */
export default async function TeamKeywordsPage({ params, searchParams }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const { view, sort, topics } = await searchParams;
  const ws = await getKeywordWorkspace(domain);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Keyword research" title={domain} intro="The searches this client’s customers use, cleaned, grouped into topics and ranked by value and chance to rank, plus the questions people ask AI assistants." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/mapping/${domain}`} className={link}>Page plan</Link>
          <Link href={`/competitors/${domain}`} className={link}>Competitors</Link>
        </div>
      </div>
      <KeywordWorkspaceView
        ws={ws}
        audience="team"
        base={`/keywords/${domain}`}
        state={{
          view: KEYWORD_VIEWS.includes(view as KeywordView) ? (view as KeywordView) : 'overview',
          order: TOPIC_ORDERS.some((o) => o.value === sort) ? (sort as TopicOrder) : 'priority',
          allTopics: topics === 'all',
        }}
      />
    </Container>
  );
}
