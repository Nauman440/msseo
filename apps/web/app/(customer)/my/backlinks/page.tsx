import type { Metadata } from 'next';
import { BacklinksView } from '@/components/backlinks/BacklinksView';
import { SiteHeader } from '@/components/customer/SiteHeader';
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
  const ws = await getBacklinks(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="backlinks" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <BacklinksView ws={ws} audience="customer" nextRun={nextMonthlyRun(ws.audit?.runAt)} />
    </>
  );
}
