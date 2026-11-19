import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { LocalView } from '@/components/local/LocalView';
import { ProfilePanel } from '@/components/local/ProfilePanel';
import { profilePanelData } from '@/lib/gbp';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getLocal } from '@/lib/local';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ gbpError?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Local SEO · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Local SEO audit for the team: any client's website. */
export default async function TeamLocalViewPage({ params, searchParams }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const [data, panel] = await Promise.all([getLocal(domain), profilePanelData(domain, (await searchParams).gbpError?.slice(0, 300) ?? null)]);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Local SEO audit" title={domain} intro="Google Business Profile, reviews, directory listings, name/address/phone consistency and the map pack across the service area." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/competitors/${domain}`} className={link}>Competitors</Link>
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
        </div>
      </div>
      <LocalView a={data} domain={domain} audience="team" nextRun={null} profilePanel={<ProfilePanel d={panel} />} />
    </Container>
  );
}
