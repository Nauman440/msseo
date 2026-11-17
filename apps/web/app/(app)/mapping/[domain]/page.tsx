import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { MappingView } from '@/components/mapping/MappingView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { customerAudits } from '@/lib/customer-data';
import { getMapping } from '@/lib/mapping';
import { providerConfig } from '@/lib/providers-config';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Page plan · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 5 for the team: any client's website. */
export default async function TeamMappingPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const [ws, audits] = await Promise.all([getMapping(domain), customerAudits(`https://${domain}/`)]);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Keyword to page mapping" title={domain} intro="Which page should rank for each keyword topic, what to do with it, and the title, heading, links and schema to add." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/keywords/${domain}`} className={link}>Keywords</Link>
          {ws.rows.length > 0 && <a href={`/api/mapping/${domain}/csv`} className={link}>Download CSV</a>}
        </div>
      </div>
      <MappingView ws={ws} pages={audits.latest?.pages ?? []} audience="team" aiAvailable={Boolean(providerConfig().env?.openai)} />
    </Container>
  );
}
