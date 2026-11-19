import type { Metadata } from 'next';
import { AeoView } from '@/components/aeo/AeoView';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { AEO_CUSTOMER_DAYS, getAeo } from '@/lib/aeo';
import { loadCustomerSite } from '@/lib/customer-site';
import { nextMonthlyRun } from '@/lib/site-docs';

export const metadata: Metadata = { title: 'AI search' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 10 for customers: their own websites only (AI search tab). */
export default async function CustomerAeoPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const ws = await getAeo(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="ai-search" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <AeoView ws={ws} audience="customer" nextRun={nextMonthlyRun(ws.audit?.runAt, AEO_CUSTOMER_DAYS)} questionsHref={`/my/keywords?site=${encodeURIComponent(s.domain)}&view=questions`} />
    </>
  );
}
