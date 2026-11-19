import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { AeoView } from '@/components/aeo/AeoView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getAeo } from '@/lib/aeo';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `AI search · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** AI search (AEO) audit for the team: any client's website. */
export default async function TeamAeoPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const ws = await getAeo(domain);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="AI search" title={domain} intro="Whether ChatGPT, Perplexity and Google AI Overviews name this business, who they name instead, the sources they cite, and whether AI can read the site." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/competitors/${domain}`} className={link}>Competitors</Link>
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
        </div>
      </div>
      <AeoView ws={ws} audience="team" nextRun={null} questionsHref={`/keywords/${domain}?view=questions`} />
    </Container>
  );
}
