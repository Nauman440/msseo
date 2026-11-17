import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getKeywordWorkspace } from '@/lib/keywords';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Keywords · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 4 for the team: any client's website. */
export default async function TeamKeywordsPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const ws = await getKeywordWorkspace(domain);
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Keyword research" title={domain} intro="The searches this client’s customers use, cleaned, grouped into topics and ranked by value and chance to rank, plus the questions people ask AI assistants." />
        <Link href={`/competitors/${domain}`} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3">
          Competitors
        </Link>
      </div>
      <KeywordWorkspaceView ws={ws} audience="team" />
    </Container>
  );
}
