import type { Metadata } from 'next';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { MonitorView } from '@/components/monitor/MonitorView';
import { loadCustomerSite } from '@/lib/customer-site';
import { getMonitor } from '@/lib/monitor';

export const metadata: Metadata = { title: 'Monitoring' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 13 for customers: alerts, weekly numbers, rankings and monthly reports for their site. */
export default async function CustomerMonitorPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const ws = await getMonitor(s.domain);
  const q = `site=${encodeURIComponent(s.domain)}`;
  return (
    <>
      <SiteHeader domain={s.domain} tab="monitor" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <MonitorView ws={ws} audience="customer" customerSite reportHref={(m) => `/my/reports/monthly?${q}&month=${m}`} />
    </>
  );
}
