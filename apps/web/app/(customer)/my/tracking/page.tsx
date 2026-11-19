import type { Metadata } from 'next';
import { SiteHeader } from '@/components/customer/SiteHeader';
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
  const ws = await getTracking(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="tracking" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <TrackingView ws={ws} audience="customer" connectHref={`/my/connections?site=${encodeURIComponent(s.domain)}`} />
    </>
  );
}
