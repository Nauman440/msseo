import type { ConnectionView } from '@/lib/connections';
import { INPUT } from '@/components/competitors/forms';
import { CheckAndDisconnect } from './forms';

/**
 * "Your website" connection (spec §16.5), the same for customers (Connections tab) and the team
 * (action plan). Connecting opens WordPress's or Shopify's own approval screen.
 */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const SEO_NAME: Record<string, string> = { yoast: 'Yoast SEO', 'rank-math': 'Rank Math', seopress: 'SEOPress', aioseo: 'All in One SEO', bricks: 'Bricks page settings (no SEO plugin)', msscore: 'its own SEO fields (no SEO plugin found)' };
const BUTTON = 'inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover';

export function SiteConnectionCard({ domain, connection: c, back, ready, shopifyReady, audience }: {
  domain: string;
  connection: ConnectionView | null;
  /** Where the connect flow returns to. */
  back: string;
  /** ENCRYPTION_KEY is set. */
  ready: boolean;
  /** SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are set. */
  shopifyReady: boolean;
  audience: 'team' | 'customer';
}) {
  const you = audience === 'customer' ? 'your' : 'the client’s';
  return (
    <section aria-labelledby="site-connection" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="site-connection" className="font-display text-xl font-bold">{audience === 'customer' ? 'Your website' : 'Website connection'}</h2>
        {c && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.status === 'ok' ? 'bg-teal-chip text-teal-text' : 'bg-high-bg text-high-strong'}`}>
            {c.status === 'ok' ? `Connected · ${c.platform === 'wordpress' ? 'WordPress' : 'Shopify'}` : 'Needs attention'}
          </span>
        )}
      </div>

      {c ? (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[180px_1fr]">
            <dt className="text-ink-2">{c.platform === 'wordpress' ? 'Site' : 'Store'}</dt>
            <dd className="break-all font-semibold">{c.platform === 'wordpress' ? c.siteUrl : c.account}</dd>
            {c.platform === 'wordpress' && (
              <>
                <dt className="text-ink-2">Connected as</dt>
                <dd className="font-semibold">{c.account}</dd>
                <dt className="text-ink-2">MS SCORE plugin</dt>
                <dd className="font-semibold">{c.plugin ? `Installed (v${c.plugin.version}), writes to ${SEO_NAME[c.plugin.seo] ?? c.plugin.seo}` : 'Not installed yet'}</dd>
              </>
            )}
            <dt className="text-ink-2">Last checked</dt>
            <dd className="font-semibold">{day(c.checkedAt)}</dd>
          </dl>
          {c.error && <p role="alert" className="text-sm font-semibold text-fail-text">{c.error}</p>}
          {c.platform === 'wordpress' && !c.plugin && (
            <div className="flex flex-col gap-2 rounded-[14px] border border-primary-tint bg-primary-wash p-4 text-sm">
              <p className="font-semibold">Install the MS SCORE Connector plugin to change SEO titles, descriptions and redirects.</p>
              <ol className="list-decimal pl-5 text-ink-2">
                <li>Download the plugin.</li>
                <li>In WordPress: Plugins → Add New → Upload Plugin, choose the file, Install, then Activate.</li>
                <li>Come back and press “Check the connection”.</li>
              </ol>
              <a href="/downloads/msscore-connector.zip" download className="w-fit font-bold text-primary-heading underline">Download the plugin (.zip)</a>
            </div>
          )}
          <p className="text-[13px] text-ink-2">Nothing changes on {you} website until an action is approved, and every change can be undone.</p>
          <CheckAndDisconnect domain={domain} />
        </>
      ) : !ready ? (
        <p className="text-sm text-ink-2">Connecting websites is not switched on yet. Fixes can still be approved and done by hand.</p>
      ) : (
        <>
          <p className="text-[15px] text-ink-2">
            Connect {you} website so approved fixes (SEO titles, descriptions, page titles, redirects, draft pages) are applied for you, checked on the live page, and can be undone.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form method="get" action="/api/connections/wordpress/start" className="flex flex-col gap-2.5 rounded-[14px] border border-border p-4">
              <h3 className="font-bold">WordPress</h3>
              <input type="hidden" name="domain" value={domain} />
              <input type="hidden" name="back" value={back} />
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Site address
                <input name="site" defaultValue={`https://${domain}`} className={INPUT} />
              </label>
              <p className="text-[13px] text-ink-2">You approve the connection in WordPress (an editor or administrator account). Then install our small plugin.</p>
              <button type="submit" className={`${BUTTON} w-fit`}>Connect WordPress</button>
            </form>
            <form method="get" action="/api/connections/shopify/start" className="flex flex-col gap-2.5 rounded-[14px] border border-border p-4">
              <h3 className="font-bold">Shopify</h3>
              <input type="hidden" name="domain" value={domain} />
              <input type="hidden" name="back" value={back} />
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Store address
                <input name="shop" placeholder="your-store.myshopify.com" className={INPUT} disabled={!shopifyReady} />
              </label>
              <p className="text-[13px] text-ink-2">{shopifyReady ? 'You approve the app in Shopify. It never edits your theme.' : 'Shopify connections are being set up. Please check back soon.'}</p>
              <button type="submit" disabled={!shopifyReady} className={`${BUTTON} w-fit disabled:opacity-50`}>Connect Shopify</button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
