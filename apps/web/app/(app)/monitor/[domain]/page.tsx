import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { MonitorView } from '@/components/monitor/MonitorView';
import { getMonitor, isCustomerSite } from '@/lib/monitor';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Monitoring · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Monitoring dashboard for the team (13.7): alerts, snapshots, rankings, reports and meetings. */
export default async function TeamMonitorPage({ params }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const [ws, customerSite] = await Promise.all([getMonitor(domain), isCustomerSite(domain)]);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Monitoring" title={domain} intro="Daily alerts, weekly snapshots and rankings, the monthly report and review meetings." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/tracking/${domain}`} className={link}>Tracking</Link>
          <Link href={`/action-plan/${domain}`} className={link}>Action plan</Link>
        </div>
      </div>
      <MonitorView ws={ws} audience="team" customerSite={customerSite} reportHref={(m) => `/monitor/${domain}/report?month=${m}`} />
    </Container>
  );
}
