import type { Metadata } from 'next';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { LocalView } from '@/components/local/LocalView';
import { loadCustomerSite } from '@/lib/customer-site';
import { getLocal } from '@/lib/local';
import { nextMonthlyRun } from '@/lib/site-docs';

export const metadata: Metadata = { title: 'Local SEO' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 9 for customers: their own websites only (Local tab). */
export default async function CustomerLocalPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const a = await getLocal(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="local" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <LocalView a={a} domain={s.domain} audience="customer" nextRun={nextMonthlyRun(a?.runAt)} />
    </>
  );
}
