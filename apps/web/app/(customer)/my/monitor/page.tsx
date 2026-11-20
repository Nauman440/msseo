import type { Metadata } from 'next';
import { Preparing } from '@/components/customer/Preparing';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { autoMonitor } from '@/lib/auto-sections';
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
  const preparing = await autoMonitor(s.domain);
  const ws = await getMonitor(s.domain);
  const q = `site=${encodeURIComponent(s.domain)}`;
  return (
    
      <SiteFrame s={s} tab="monitor">
      {preparing && <Preparing what="your first weekly snapshot" />}
      <MonitorView ws={ws} audience="customer" customerSite reportHref={(m) => `/my/reports/monthly?${q}&month=${m}`} />
    </SiteFrame>
  );
}
