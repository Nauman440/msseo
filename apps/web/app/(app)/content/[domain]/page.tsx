import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { ContentView } from '@/components/content/ContentView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { getAltText } from '@/lib/alt-text';
import { getContent } from '@/lib/content';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Content · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Content audit for the team: any client's website. */
export default async function TeamContentPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const [audit, alt] = await Promise.all([getContent(domain), getAltText(domain)]);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Content audit" title={domain} intro="Every page with a keep, improve, merge or remove verdict, pages losing visits, missing topics, services × places, and a content calendar." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/keywords/${domain}?view=mapping`} className={link}>Page plan</Link>
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
        </div>
      </div>
      <ContentView audit={audit} domain={domain} audience="team" alt={alt} />
    </Container>
  );
}
