import type { Metadata } from 'next';
import { ContentView } from '@/components/content/ContentView';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoContent } from '@/lib/auto-sections';
import { getAltText } from '@/lib/alt-text';
import { getContent } from '@/lib/content';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 7 for customers: their own websites only (Content tab). */
export default async function CustomerContentPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoContent(s.domain, Boolean(s.latestId));
  const [audit, alt] = await Promise.all([getContent(s.domain), getAltText(s.domain)]);
  return (
    
      <SiteFrame s={s} tab="content">
      {preparing && <Preparing what="your content check and alt-text drafts" />}
      <ContentView audit={audit} domain={s.domain} audience="customer" alt={alt} />
    </SiteFrame>
  );
}
