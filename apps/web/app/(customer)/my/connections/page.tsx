import type { Metadata } from 'next';
import Link from 'next/link';
import { disconnectGoogleAction } from '../connect/actions';
import { ConnectGoogleCard } from '@/components/customer/ConnectGoogle';
import { SiteFrame } from '@/components/customer/SiteFrame';
import { SiteConnectionCard } from '@/components/connections/SiteConnectionCard';
import { SiteInventoryCard } from '@/components/connections/SiteInventoryCard';
import { inventoryFor } from '@/lib/inventory';
import { connectionsReady, getConnection, shopifyApp, viewOf } from '@/lib/connections';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Connections' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; error?: string; disconnected?: string; connected?: string }> };
const shown = (p: string) => (p.startsWith('sc-domain:') ? `${p.slice('sc-domain:'.length)} (domain)` : p);

/** Connections tab: the customer's own Google account (Search Console + Analytics 4) and their website (WordPress or Shopify, spec §16.5). */
export default async function ConnectionsPage({ searchParams }: Props) {
  const { site, error, disconnected, connected } = await searchParams;
  const s = await loadCustomerSite(site);
  const [conn, inv] = await Promise.all([getConnection(s.domain), inventoryFor(s.domain)]);
  const g = s.google;
  return (
    
      <SiteFrame s={s} tab="connections">
      {error && <p role="alert" className="rounded-[14px] border border-fail-bg bg-surface p-4 text-sm font-semibold text-fail-text">{error}</p>}
      {connected && <p role="status" className="rounded-[14px] border border-border bg-surface p-4 text-sm font-semibold text-pass-text">{connected === 'shopify' ? 'Your Shopify store' : 'Your WordPress site'} is connected.</p>}
      {disconnected && <p role="status" className="rounded-[14px] border border-border bg-surface p-4 text-sm text-ink-2">Google is disconnected. Your past reports are kept.</p>}

      {s.connected && g.site ? (
        <section aria-labelledby="google" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="google" className="font-display text-xl font-bold">Google</h2>
            <span className="rounded-full bg-teal-chip px-2.5 py-1 text-xs font-bold text-teal-text">Connected as {g.email}</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[180px_1fr]">
            <dt className="text-ink-2">Search Console</dt>
            <dd className="break-all font-semibold">{g.site.gscProperty ? shown(g.site.gscProperty) : 'Not chosen'}</dd>
            <dt className="text-ink-2">Analytics 4</dt>
            <dd className="font-semibold">{g.site.ga4Name ?? 'Not used'}</dd>
          </dl>
          <p className="text-[13px] text-ink-2">Read-only: we never change anything in your Google accounts. Your weekly audits and keyword research use this data too.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/my/connect?site=${encodeURIComponent(s.domain)}`} className="inline-flex min-h-11 items-center rounded-control border border-border-strong px-5 text-[15px] font-semibold hover:border-ink-3">
              Change properties
            </Link>
            <form action={disconnectGoogleAction.bind(null, s.domain)}>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-control px-3 text-[15px] font-semibold text-fail-text hover:underline">
                Disconnect Google
              </button>
            </form>
          </div>
        </section>
      ) : (
        <ConnectGoogleCard domain={s.domain} google={g} />
      )}

      <div id="website" className="scroll-mt-6" />
      <SiteConnectionCard domain={s.domain} connection={viewOf(conn)} back={`/my/connections?site=${encodeURIComponent(s.domain)}`} ready={connectionsReady()} shopifyReady={Boolean(shopifyApp())} audience="customer" />
      {conn && <SiteInventoryCard domain={s.domain} connection={viewOf(conn)!} inventory={inv.inventory} refreshing={inv.refreshing} audience="customer" />}
    </SiteFrame>
  );
}
