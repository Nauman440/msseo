import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { CompetitorWorkspaceView } from '@/components/competitors/CompetitorWorkspaceView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getWorkspace } from '@/lib/competitors';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Competitors · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 3 for the team: any client's website. */
export default async function TeamCompetitorsPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const ws = await getWorkspace(domain);
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Competitors" title={domain} intro="Who competes with this client in Google: direct rivals, map-pack businesses, sites that rank for the same words, and the directories worth being listed on." />
        <div className="flex flex-wrap gap-3">
        <Link href={`/keywords/${domain}`} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3">
          Keywords
        </Link>
        <Link href={`/audits/new?url=${encodeURIComponent(`https://${domain}/`)}`} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3">
          Audit this site
        </Link>
        </div>
      </div>
      <CompetitorWorkspaceView ws={ws} audience="team" />
    </Container>
  );
}
