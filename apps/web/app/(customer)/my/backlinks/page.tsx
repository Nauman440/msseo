import type { Metadata } from 'next';
import { BacklinksView } from '@/components/backlinks/BacklinksView';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoBacklinks } from '@/lib/auto-sections';
import { getBacklinks } from '@/lib/backlinks';
import { loadCustomerSite } from '@/lib/customer-site';
import { nextMonthlyRun } from '@/lib/site-docs';

export const metadata: Metadata = { title: 'Backlinks' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 8 for customers: their own websites only (Backlinks tab). */
export default async function CustomerBacklinksPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoBacklinks(s.domain);
  const ws = await getBacklinks(s.domain);
  return (
    
      <SiteFrame s={s} tab="backlinks">
      {preparing && <Preparing what="your backlink check" />}
      <BacklinksView ws={ws} audience="customer" nextRun={nextMonthlyRun(ws.audit?.runAt)} />
    </SiteFrame>
  );
}
