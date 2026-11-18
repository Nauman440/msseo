import type { CompetitorAnalysis } from '@seo/core';
import { cn } from '@/lib/tones';

/** Module 6 · 6.1.3 the competitors' strongest pages and 6.1.5 the searches the client wins. */
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const TH = 'whitespace-nowrap px-2.5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-2.5';

export function TopPages({ a }: { a: CompetitorAnalysis }) {
  const rivals = a.sites.filter((s) => s.role !== 'you' && s.topPages && s.topPages.length > 0);
  if (!rivals.length) return null;
  return (
    <section aria-labelledby="top-pages-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="top-pages-title" className="font-display text-xl font-bold">Their strongest pages</h2>
        <p className="mt-1 text-sm text-ink-2">Each competitor’s pages that bring the most search traffic, with the searches they rank for.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rivals.map((s) => (
          <div key={s.domain} className="flex flex-col gap-2 rounded-[14px] border border-border p-4">
            <h3 className="break-all text-[15px] font-bold">{s.domain}</h3>
            <ol className="flex flex-col gap-2">
              {s.topPages!.map((p) => (
                <li key={p.url} className="text-[13px]">
                  <span className="break-all font-mono text-[12px]">{path(p.url)}</span>
                  <span className="text-ink-3 tabular"> · {p.volume.toLocaleString('en-US')} searches/mo</span>
                  <span className="block text-ink-2">{p.keywords.join(', ')}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Wins({ a }: { a: CompetitorAnalysis }) {
  if (!a.wins) return null;
  return (
    <section aria-labelledby="wins-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="wins-title" className="font-display text-xl font-bold">Searches you win</h2>
        <p className="mt-1 text-sm text-ink-2">Searches you rank for and your direct competitors do not. Protect these pages: keep them up to date and well linked.</p>
      </div>
      {a.wins.length ? (
        <div className="relative max-h-[420px] overflow-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={TH}>Search</th>
                <th className={cn(TH, 'text-right')}>Searches / mo</th>
                <th className={cn(TH, 'text-right')}>Your position</th>
                <th className={TH}>Not ranking</th>
              </tr>
            </thead>
            <tbody>
              {a.wins.map((w) => (
                <tr key={w.keyword}>
                  <td className={cn(TD, 'font-semibold')}>{w.keyword}</td>
                  <td className={cn(TD, 'text-right tabular')}>{w.volume === null ? '–' : w.volume.toLocaleString('en-US')}</td>
                  <td className={cn(TD, 'text-right tabular')}>{w.position === null ? '–' : `#${w.position}`}</td>
                  <td className={cn(TD, 'text-[13px] text-ink-2')}>{w.over.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-2">None found: your direct competitors rank for everything you rank for.</p>
      )}
    </section>
  );
}
