import type { CompetitorAnalysis, SiteRow } from '@seo/core';
import { cn } from '@/lib/tones';

/**
 * 6.7 Technical, local and AI comparison: one column per site, "You" first and highlighted.
 * Used on screen and in the PDF (no md:/lg: classes; `compact` for print).
 */
const n = (v: number | null) => (v === null ? '–' : Math.round(v).toLocaleString('en-US'));
const speedTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 50 ? 'bg-amber-bg text-amber-text' : 'bg-high-bg text-high-text');
const hasBusinessSchema = (s: SiteRow) => s.schema.some((t) => /LocalBusiness|Organization|Business|Contractor|Plumber|Electrician|Store|Dentist|Attorney/i.test(t));

type Row = { label: string; value: (s: SiteRow) => React.ReactNode; best?: (s: SiteRow) => number | null; higher?: boolean };

/** "Up 40%" / "Down 12%" / "Steady": the last 3 months against the first 3 (12-month estimate). */
function trendWord(t: number[]): string {
  const head = t.slice(0, 3).reduce((x, y) => x + y, 0) / Math.min(3, t.length);
  const tail = t.slice(-3).reduce((x, y) => x + y, 0) / Math.min(3, t.length);
  if (!head) return tail ? 'Up' : '–';
  const pct = Math.round(((tail - head) / head) * 100);
  return Math.abs(pct) < 10 ? 'Steady' : pct > 0 ? `Up ${pct}%` : `Down ${-pct}%`;
}

export function ComparisonTable({ a, compact = false }: { a: CompetitorAnalysis; compact?: boolean }) {
  const m = a.searches.length;
  const q = a.ai?.rows.length ?? 0;
  const rows: Row[] = [
    { label: 'Visits / month (estimate)', value: (s) => n(s.etv), best: (s) => s.etv, higher: true },
    { label: 'Keywords in Google', value: (s) => n(s.keywords), best: (s) => s.keywords, higher: true },
    { label: 'Keywords in the top 3', value: (s) => n(s.top3), best: (s) => s.top3, higher: true },
    { label: 'Keywords in the top 10', value: (s) => n(s.top10 ?? null), best: (s) => s.top10 ?? null, higher: true },
    { label: 'Visits, last 12 months', value: (s) => (s.trend && s.trend.length > 1 ? trendWord(s.trend) : '–') },
    { label: 'In the map pack', value: (s) => (m ? `${s.mapIn} of ${m}${s.avgMap !== null ? ` · avg #${s.avgMap}` : ''}` : '–'), best: (s) => s.mapIn, higher: true },
    { label: 'In the search results', value: (s) => (m ? `${s.organicIn} of ${m}${s.avgOrganic !== null ? ` · avg #${s.avgOrganic}` : ''}` : '–'), best: (s) => s.organicIn, higher: true },
    { label: 'Google rating', value: (s) => (s.rating === null ? '–' : `${s.rating.toFixed(1)}${s.reviews !== null ? ` (${s.reviews.toLocaleString('en-US')})` : ''}`), best: (s) => s.reviews, higher: true },
    { label: 'Business Profile category', value: (s) => s.profile?.category ?? '–' },
    { label: 'Profile photos', value: (s) => n(s.profile?.photos ?? null), best: (s) => s.profile?.photos ?? null, higher: true },
    { label: 'Profile claimed', value: (s) => (s.profile?.claimed === null || s.profile?.claimed === undefined ? '–' : s.profile.claimed ? 'Yes' : 'No') },
    { label: 'Mobile speed (0–100)', value: (s) => (s.speed === null ? '–' : <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold tabular', speedTone(s.speed))}>{s.speed}</span>) },
    { label: 'Largest content paint (lab)', value: (s) => (s.lcpMs ? `${(s.lcpMs / 1000).toFixed(1)} s` : '–'), best: (s) => s.lcpMs ?? null },
    { label: 'Layout shift (lab)', value: (s) => (s.cls === null || s.cls === undefined ? '–' : s.cls.toFixed(2)), best: (s) => s.cls ?? null },
    { label: 'Blocking time (lab)', value: (s) => (s.tbtMs === null || s.tbtMs === undefined ? '–' : `${Math.round(s.tbtMs)} ms`), best: (s) => s.tbtMs ?? null },
    { label: 'Works well on phones', value: (s) => (s.mobileReady === null || s.mobileReady === undefined ? '–' : s.mobileReady ? 'Yes' : 'No (zoom or viewport)') },
    { label: 'Website platform', value: (s) => s.platform ?? '–' },
    { label: 'CDN / server', value: (s) => [s.cdn, s.server].filter(Boolean).join(' · ') || '–' },
    { label: 'Pages in sitemap', value: (s) => n(s.sitemapUrls), best: (s) => s.sitemapUrls, higher: true },
    { label: 'Biggest sections', value: (s) => (s.folders?.length ? s.folders.slice(0, 3).map((f) => `${f.folder} ${f.count}`).join(', ') : '–') },
    { label: 'Business schema on homepage', value: (s) => (hasBusinessSchema(s) ? 'Yes' : 'No') },
    { label: 'Words on homepage', value: (s) => n(s.homeWords) },
    ...(q ? [{ label: 'Mentioned by ChatGPT', value: (s: SiteRow) => `${s.aiMentions} of ${q}`, best: (s: SiteRow) => s.aiMentions, higher: true }] : []),
  ];
  const th = compact ? 'px-1.5 py-1.5 text-[9px]' : 'px-2.5 py-2 text-[11.5px]';
  const td = compact ? 'px-1.5 py-1.5 text-[10px]' : 'px-2.5 py-2.5 text-sm';
  return (
    <div className={cn('relative', !compact && 'overflow-x-auto')}>
      <table className={cn('w-full text-left', !compact && 'min-w-[720px]')}>
        <thead>
          <tr>
            <th className={cn(th, 'font-extrabold uppercase tracking-[0.06em] text-ink-2')}>
              <span className="sr-only">Measure</span>
            </th>
            {a.sites.map((s) => (
              <th key={s.domain} scope="col" className={cn(th, 'break-all align-bottom font-extrabold normal-case tracking-normal text-ink', s.role === 'you' && 'bg-primary-wash')}>
                {s.role === 'you' ? `You · ${s.domain}` : s.domain}
                <span className="block font-semibold text-ink-3">{s.role === 'you' ? '' : s.role === 'direct' ? 'Direct' : 'Aspirational'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const values = r.best ? a.sites.map(r.best).filter((v): v is number => v !== null) : [];
            const top = values.length > 1 ? (r.higher ? Math.max(...values) : Math.min(...values)) : null;
            return (
              <tr key={r.label}>
                <th scope="row" className={cn(td, 'border-t border-border font-semibold text-ink-2')}>{r.label}</th>
                {a.sites.map((s) => {
                  const v = r.best?.(s) ?? null;
                  return (
                    <td key={s.domain} className={cn(td, 'border-t border-border tabular', s.role === 'you' && 'bg-primary-wash', top !== null && v === top && top > 0 && 'font-extrabold text-teal-text')}>
                      {r.value(s)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 6.1/6.5 Ranking grid: each core search, where each site shows (search results and map pack). */
export function RankingGrid({ a }: { a: CompetitorAnalysis }) {
  if (!a.grid.length) return null;
  const chip = (label: string, tone: string) => <span className={cn('whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[12px] font-bold tabular', tone)}>{label}</span>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr>
            <th className="px-2.5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2">Search</th>
            {a.sites.map((s) => (
              <th key={s.domain} scope="col" className={cn('break-all px-2.5 py-2 text-[12px] font-extrabold', s.role === 'you' && 'bg-primary-wash')}>{s.role === 'you' ? 'You' : s.domain}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.grid.map((g) => (
            <tr key={g.search}>
              <th scope="row" className="border-t border-border px-2.5 py-2.5 font-semibold">{g.search}</th>
              {a.sites.map((s) => {
                const c = g.cells[s.domain];
                return (
                  <td key={s.domain} className={cn('border-t border-border px-2.5 py-2.5', s.role === 'you' && 'bg-primary-wash')}>
                    <span className="flex flex-wrap gap-1">
                      {c?.map != null && chip(`Map #${c.map}`, 'bg-indigo-bg text-indigo-text')}
                      {c?.organic != null && chip(`#${c.organic}`, c.organic <= 3 ? 'bg-teal-chip text-teal-text' : 'bg-primary-chip text-primary-heading')}
                      {!c && <span className="text-ink-3">–</span>}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
