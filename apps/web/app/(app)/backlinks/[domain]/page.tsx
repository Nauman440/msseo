import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { BacklinksView } from '@/components/backlinks/BacklinksView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getBacklinks } from '@/lib/backlinks';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Backlinks · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Backlink audit for the team: any client's website. */
export default async function TeamBacklinksViewPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const data = await getBacklinks(domain);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Backlink audit" title={domain} intro="Who links to this site, which links help or hurt, the links competitors have and this site does not, and the outreach list." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/competitors/${domain}`} className={link}>Competitors</Link>
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
        </div>
      </div>
      <BacklinksView ws={data} audience="team" nextRun={null} />
    </Container>
  );
}
