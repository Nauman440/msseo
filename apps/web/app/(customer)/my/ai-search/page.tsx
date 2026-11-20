import type { Metadata } from 'next';
import { AeoView } from '@/components/aeo/AeoView';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoAeo } from '@/lib/auto-sections';
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
  const preparing = await autoAeo(s.domain);
  const ws = await getAeo(s.domain);
  return (
    
      <SiteFrame s={s} tab="ai-search">
      {preparing && <Preparing what="your AI search check" />}
      <AeoView ws={ws} audience="customer" nextRun={nextMonthlyRun(ws.audit?.runAt, AEO_CUSTOMER_DAYS)} questionsHref={`/my/keywords?site=${encodeURIComponent(s.domain)}&view=questions`} />
    </SiteFrame>
  );
}
