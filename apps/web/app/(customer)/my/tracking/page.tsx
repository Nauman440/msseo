import type { Metadata } from 'next';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoTracking } from '@/lib/auto-sections';
import { TrackingView } from '@/components/tracking/TrackingView';
import { loadCustomerSite } from '@/lib/customer-site';
import { getTracking } from '@/lib/tracking';

export const metadata: Metadata = { title: 'Tracking' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 11 for customers: their own websites only (Tracking tab). */
export default async function CustomerTrackingPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const preparing = await autoTracking(s.domain);
  const ws = await getTracking(s.domain);
  return (
    
      <SiteFrame s={s} tab="tracking">
      {preparing && <Preparing what="your tracking check" />}
      <TrackingView ws={ws} audience="customer" connectHref={`/my/connections?site=${encodeURIComponent(s.domain)}`} />
    </SiteFrame>
  );
}
