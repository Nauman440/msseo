import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { siteGoogleData } from '@/lib/customer-google';
import { loadCustomerSite } from '@/lib/customer-site';
import { cn } from '@/lib/tones';

export const metadata: Metadata = { title: 'Rankings' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };
const band = (p: number) => (p <= 3 ? 'bg-pass-bg text-pass-text' : p <= 10 ? 'bg-teal-chip text-teal-text' : p <= 20 ? 'bg-amber-bg text-amber-text' : 'bg-sunken text-ink-2');

/** Rankings tab: the searches the site appears for in Google, from Search Console (last 28 days). */
export default async function RankingsPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  if (!s.connected || !s.google.site) redirect(`/my/connections?site=${encodeURIComponent(s.domain)}`);
  const data = await siteGoogleData(s.user.id, s.domain, s.google.site, s.latest);
  const onPage1 = data.searches.filter((r) => r.position <= 10).length;
  return (
    <>
      <SiteHeader domain={s.domain} tab="rankings" connected latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} />
      <section aria-labelledby="rankings" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="rankings" className="font-display text-xl font-bold">Your Google rankings</h2>
            <p className="mt-1 text-sm text-ink-2">The 100 searches you are shown for most, last 28 days, from Search Console.</p>
          </div>
          <p className="text-sm font-semibold tabular">{onPage1} on page 1</p>
        </div>
        {data.errors.length > 0 && <p role="alert" className="text-sm text-fail-text">Search Console could not be read just now ({data.errors[0]}).</p>}
        {data.searches.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-2">
                  <th className="px-2.5 py-2.5">Search</th>
                  <th className="px-2.5 py-2.5 text-center">Position</th>
                  <th className="px-2.5 py-2.5 text-right">Seen</th>
                  <th className="px-2.5 py-2.5 text-right">Clicks</th>
                  <th className="px-2.5 py-2.5">Page</th>
                </tr>
              </thead>
              <tbody>
                {data.searches.map((r) => (
                  <tr key={r.query} className="border-b border-border last:border-0">
                    <td className="px-2.5 py-3 font-medium">{r.query}</td>
                    <td className="px-2.5 py-3 text-center">
                      <span className={cn('inline-block min-w-10 rounded-full px-2 py-0.5 text-xs font-bold tabular', band(r.position))}>{r.position.toFixed(1)}</span>
                    </td>
                    <td className="px-2.5 py-3 text-right tabular">{r.impressions.toLocaleString('en-GB')}</td>
                    <td className="px-2.5 py-3 text-right tabular">{r.clicks.toLocaleString('en-GB')}</td>
                    <td className="px-2.5 py-3 font-mono text-[12px] text-ink-2">{r.page ? new URL(r.page).pathname : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-2">No searches yet. New websites can take a few weeks to show up in Search Console.</p>
        )}
      </section>
    </>
  );
}
