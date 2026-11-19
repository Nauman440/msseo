import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { TrackingView } from '@/components/tracking/TrackingView';
import { requireUser } from '@/lib/session';
import { getTracking } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Tracking · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Tracking and conversion audit for the team: any client's website. */
export default async function TeamTrackingPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const ws = await getTracking(domain);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Tracking and conversions" title={domain} intro="Whether Search Console and GA4 are connected, every way to get in touch is counted as a lead, calls are tracked, sources are clean and landing pages make contact easy." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/monitor/${domain}`} className={link}>Monitoring</Link>
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
        </div>
      </div>
      <TrackingView ws={ws} audience="team" connectHref="/settings" />
    </Container>
  );
}
