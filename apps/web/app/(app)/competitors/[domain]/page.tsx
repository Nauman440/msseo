import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { gapByCompetitor, normDomain } from '@seo/core';
import { CompetitorWorkspaceView } from '@/components/competitors/CompetitorWorkspaceView';
import { COMPETITOR_VIEWS, type CompetitorView } from '@/components/competitors/labels';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getAnalysis } from '@/lib/analysis';
import { getWorkspace } from '@/lib/competitors';
import { getKeywordWorkspace } from '@/lib/keywords';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ view?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Competitors · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 3 for the team: any client's website (same views as the customer's Competitors tab). */
export default async function TeamCompetitorsPage({ params, searchParams }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const { view } = await searchParams;
  const [ws, keywords, analysis] = await Promise.all([getWorkspace(domain), getKeywordWorkspace(domain), getAnalysis(domain)]);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Competitors" title={domain} intro="Who competes with this client in Google: direct rivals, map-pack businesses, sites that rank for the same words, and the directories worth being listed on." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/keywords/${domain}`} className={link}>Keywords</Link>
          <Link href={`/audits/new?url=${encodeURIComponent(`https://${domain}/`)}`} className={link}>Audit this site</Link>
        </div>
      </div>
      <CompetitorWorkspaceView
        ws={ws}
        audience="team"
        base={`/competitors/${domain}`}
        view={COMPETITOR_VIEWS.includes(view as CompetitorView) ? (view as CompetitorView) : 'competitors'}
        gaps={gapByCompetitor(keywords)}
        analysis={analysis}
        gapHref={`/keywords/${domain}?view=all&from=gap`}
      />
    </Container>
  );
}
