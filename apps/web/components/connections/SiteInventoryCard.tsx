import { inventorySummary, pluginSupportsSigning, statusAlerts, type SiteInventory } from '@seo/core';
import { Preparing } from '@/components/customer/Preparing';
import type { ConnectionView } from '@/lib/connections';
import { RefreshInventoryButton } from './forms';

/**
 * Autopilot phase 1: what MS SCORE knows about the connected WordPress site (read from the Connector
 * plugin, refreshed weekly). Customers see plain numbers; the team also sees the site's setup.
 */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const TYPE_NAME: Record<string, string> = { page: 'Pages', post: 'Blog posts', product: 'Products', category: 'Blog categories', product_cat: 'Shop categories' };
const SEO_NAME: Record<string, string> = { yoast: 'Yoast SEO', 'rank-math': 'Rank Math', aioseo: 'All in One SEO', seopress: 'SEOPress', none: 'None (MS SCORE prints titles and descriptions)' };
const BUILDER: Record<string, string> = { gutenberg: 'Block editor', classic: 'Classic editor', elementor: 'Elementor', divi: 'Divi', bricks: 'Bricks', other: 'Other page builder' };

export function SiteInventoryCard({ domain, connection: c, inventory, refreshing, audience }: {
  domain: string;
  connection: ConnectionView;
  inventory: SiteInventory | null;
  refreshing: boolean;
  audience: 'team' | 'customer';
}) {
  if (c.platform !== 'wordpress' || !c.plugin) return null;
  if (!pluginSupportsSigning(c.plugin.version)) {
    return (
      <section className="flex flex-col gap-2 rounded-[18px] border border-primary-tint bg-primary-wash p-6 text-sm">
        <h2 className="font-display text-lg font-bold">Update the MS SCORE plugin</h2>
        <p>Version {c.plugin.version} is installed. Version 1.1.0 lets MS SCORE read every page on the site and signs every request for extra safety.</p>
        <p className="text-ink-2">In WordPress: Plugins → Add New → Upload Plugin, choose the new file and press “Replace current with uploaded”.</p>
        <a href="/downloads/msscore-connector.zip" download className="w-fit font-bold text-primary-heading underline">Download the new plugin (.zip)</a>
      </section>
    );
  }
  const sum = inventory ? inventorySummary(inventory) : null;
  const alerts = inventory ? statusAlerts(inventory.status) : [];
  const st = inventory?.status;
  return (
    <section aria-labelledby="site-inventory" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="site-inventory" className="font-display text-xl font-bold">What we know about {audience === 'customer' ? 'your' : 'the'} site</h2>
        {inventory && <span className="text-[13px] text-ink-2">Read {day(inventory.refreshedAt)} · updated every week</span>}
      </div>
      {refreshing && <Preparing what="the list of pages on the site" />}
      {alerts.map((a) => (
        <p key={a.message} role="alert" className={`rounded-[14px] px-4 py-3 text-sm font-semibold ${a.level === 'critical' ? 'bg-fail-bg text-fail-text' : 'bg-warn-bg text-warn-text'}`}>
          {a.level === 'critical' ? 'Urgent: ' : ''}{a.message}
        </p>
      ))}
      {sum && (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sum.byType.map((t) => (
              <li key={t.type} className="rounded-[12px] border border-border px-4 py-3">
                <span className="block font-display text-2xl font-bold tabular">{t.count.toLocaleString('en-GB')}</span>
                <span className="text-[13px] text-ink-2">{TYPE_NAME[t.type] ?? t.type}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1 text-[15px]">
            <li><b className="tabular">{sum.missingTitle}</b> without their own SEO title</li>
            <li><b className="tabular">{sum.missingDescription}</b> without a meta description</li>
            <li><b className="tabular">{sum.imagesWithoutAlt}</b> images without alt text</li>
            {sum.noindex > 0 && <li><b className="tabular">{sum.noindex}</b> hidden from Google on purpose (noindex)</li>}
          </ul>
          {inventory!.truncated && <p className="text-[13px] text-ink-2">Large site: the first {sum.total.toLocaleString('en-GB')} items were read.</p>}
          {inventory!.errors.length > 0 && audience === 'team' && <p className="text-[13px] text-fail-text">Could not read: {inventory!.errors.join('; ')}</p>}
        </>
      )}
      {st && audience === 'team' && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-[180px_1fr]">
          <dt className="text-ink-2">WordPress / PHP</dt>
          <dd>{st.wp_version} / {st.php_version}</dd>
          <dt className="text-ink-2">Theme</dt>
          <dd>{st.theme.name} {st.theme.version}{st.theme.title_tag ? '' : ' (writes its own <title>)'}</dd>
          <dt className="text-ink-2">SEO plugin</dt>
          <dd>{SEO_NAME[st.seo_plugin] ?? st.seo_plugin}</dd>
          <dt className="text-ink-2">Page builder</dt>
          <dd>{BUILDER[st.page_builder] ?? st.page_builder}{st.page_builders.length > 1 ? ` (also ${st.page_builders.slice(1).join(', ')})` : ''}</dd>
          <dt className="text-ink-2">Cache</dt>
          <dd>{st.cache_plugins.length ? st.cache_plugins.join(', ') : 'No cache plugin'}</dd>
          <dt className="text-ink-2">Shop</dt>
          <dd>{st.woocommerce ? 'WooCommerce' : 'No'}</dd>
          <dt className="text-ink-2">Sitemap</dt>
          <dd className="break-all">{st.sitemap.url ? `${st.sitemap.url} (${st.sitemap.by})` : 'None found'}</dd>
          <dt className="text-ink-2">robots.txt</dt>
          <dd>{st.robots_file ? 'A real file on the server' : 'Made by WordPress'}</dd>
          <dt className="text-ink-2">Signed requests</dt>
          <dd>{st.signed ? 'On' : 'Not yet'}</dd>
        </dl>
      )}
      {!inventory && !refreshing && <p className="text-sm text-ink-2">The pages on the site have not been read yet.</p>}
      <RefreshInventoryButton domain={domain} />
    </section>
  );
}
