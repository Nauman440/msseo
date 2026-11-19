import type { Metadata } from 'next';
import { Card, AlertList } from '@/components/monitor/parts';
import { domainOf } from '@/lib/accounts';
import { loadCustomerSite } from '@/lib/customer-site';
import { getMonitor } from '@/lib/monitor';

export const metadata: Metadata = { title: 'Alerts' };
export const dynamic = 'force-dynamic';

/** 13.4 Alerts for all of the customer's websites (sidebar "Alerts"). */
export default async function CustomerAlertsPage() {
  const s = await loadCustomerSite(undefined);
  const sites = await Promise.all(s.sites.map((w) => getMonitor(domainOf(w))));
  const open = sites.reduce((n, ws) => n + ws.alerts.filter((a) => !a.resolvedAt && a.severity !== 'info').length, 0);
  return (
    <>
      <div>
        <h1 className="font-display text-3xl font-extrabold">Alerts</h1>
        <p className="text-ink-2">{open ? `${open} open ${open === 1 ? 'alert' : 'alerts'}.` : 'Nothing needs your attention.'} We check every morning and email you when something goes wrong.</p>
      </div>
      {sites.map((ws) => (
        <Card key={ws.domain} id={`a-${ws.domain.replace(/\W/g, '-')}`} title={ws.domain}>
          <AlertList domain={ws.domain} alerts={ws.alerts} />
        </Card>
      ))}
    </>
  );
}
