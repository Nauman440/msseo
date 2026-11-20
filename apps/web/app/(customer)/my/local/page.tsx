import type { Metadata } from 'next';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoLocal } from '@/lib/auto-sections';
import { LocalView } from '@/components/local/LocalView';
import { ProfilePanel } from '@/components/local/ProfilePanel';
import { profilePanelData } from '@/lib/gbp';
import { loadCustomerSite } from '@/lib/customer-site';
import { getLocal } from '@/lib/local';
import { nextMonthlyRun } from '@/lib/site-docs';

export const metadata: Metadata = { title: 'Local SEO' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; gbpError?: string }> };

/** Module 9 for customers: their own websites only (Local tab). */
export default async function CustomerLocalPage({ searchParams }: Props) {
  const { site, gbpError } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoLocal(s.domain);
  const [a, panel] = await Promise.all([getLocal(s.domain), profilePanelData(s.domain, gbpError?.slice(0, 300) ?? null)]);
  return (
    
      <SiteFrame s={s} tab="local">
      {preparing && <Preparing what="your local SEO check" />}
      <LocalView a={a} domain={s.domain} audience="customer" nextRun={nextMonthlyRun(a?.runAt)} profilePanel={<ProfilePanel d={panel} />} />
    </SiteFrame>
  );
}
