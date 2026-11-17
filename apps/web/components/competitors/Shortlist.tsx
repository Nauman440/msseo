import { SHORTLIST_TARGET, type CompetitorRecord, type OwnSnapshot } from '@seo/core';
import { cn } from '@/lib/tones';
import { RemoveFromShortlist } from './controls';

/** "Your shortlist" (design): direct and aspirational groups with progress and empty slots. */
export function ShortlistCard({ domain, competitors }: { domain: string; competitors: CompetitorRecord[] }) {
  const groups = [
    { key: 'direct' as const, title: 'Direct competitors', hint: 'Same services, same area. The businesses taking your calls today.', target: SHORTLIST_TARGET.direct },
    { key: 'aspirational' as const, title: 'Aspirational', hint: 'Bigger sites you want to catch up with.', target: SHORTLIST_TARGET.aspirational },
  ];
  return (
    <section aria-labelledby="shortlist-title" className="flex flex-col gap-[18px] rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="shortlist-title" className="font-display text-[22px] font-bold">Your shortlist</h2>
        <p className="mt-1 text-sm leading-normal text-ink-2">Shortlisted competitors appear in every report and are checked again every quarter.</p>
      </div>
      <div className="flex flex-wrap gap-7">
        {groups.map((g) => {
          const picked = competitors.filter((c) => c.shortlist === g.key);
          const [min, max] = g.target;
          const inRange = picked.length >= min && picked.length <= max;
          return (
            <div key={g.key} className="flex min-w-0 flex-1 basis-[300px] flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <h3 className="text-[17px] font-bold">{g.title}</h3>
                <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold tabular', inRange ? 'bg-teal-chip text-teal-text' : 'bg-amber-bg text-amber-text')}>
                  {picked.length} of {min} to {max}
                </span>
              </div>
              <p className="text-[13px] leading-snug text-ink-2">{g.hint}</p>
              <div role="progressbar" aria-label={`${g.title} picked`} aria-valuenow={Math.min(100, Math.round((picked.length / min) * 100))} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-border">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (picked.length / min) * 100)}%` }} />
              </div>
              <ul className="flex flex-wrap gap-2">
                {picked.map((c) => (
                  <li key={c.domain} className={cn('inline-flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[13px] font-bold', g.key === 'direct' ? 'bg-primary text-primary-ink' : 'bg-night text-white')}>
                    {c.domain}
                    <RemoveFromShortlist domain={domain} competitor={c.domain} light={g.key !== 'direct'} />
                  </li>
                ))}
                {Array.from({ length: Math.max(0, min - picked.length) }, (_, i) => (
                  <li key={`empty-${i}`} className="rounded-full border border-dashed border-border-strong px-3.5 py-2 text-[13px] text-ink-2">Empty slot</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const TH = 'whitespace-nowrap px-2.5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-3 text-right tabular';
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : Math.round(v).toLocaleString('en-US'));
const stars = (rating: number | null | undefined, reviews: number | null | undefined) => (rating == null ? '–' : `${rating.toFixed(1)}${reviews != null ? ` (${reviews.toLocaleString('en-US')})` : ''}`);

/** "You vs your shortlist" (design), with the biggest keyword gap underneath. */
export function VersusTable({ domain, own, shortlist, gaps, gapHref }: { domain: string; own: OwnSnapshot | null; shortlist: CompetitorRecord[]; gaps: Record<string, number>; gapHref: string }) {
  if (!shortlist.length) return null;
  const biggest = shortlist.map((c) => ({ domain: c.domain, n: gaps[c.domain] ?? 0 })).sort((a, b) => b.n - a.n)[0];
  return (
    <section aria-labelledby="vs-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="vs-title" className="font-display text-xl font-bold">You vs your shortlist</h2>
        <p className="mt-1 text-sm text-ink-2">Visits are estimates. Reviews come from the map listing.</p>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr>
              <th className={TH}>Website</th>
              <th className={cn(TH, 'text-right')}>Visits / month</th>
              <th className={cn(TH, 'text-right')}>Keywords</th>
              <th className={cn(TH, 'text-right')}>Avg. position</th>
              <th className={cn(TH, 'text-right')}>Rating (reviews)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-primary-wash">
              <td className="border-t border-border px-2.5 py-3 font-extrabold">You · {domain}</td>
              <td className={TD}>{n(own?.etv)}</td>
              <td className={TD}>{n(own?.keywords)}</td>
              <td className={TD}>{own?.avgPosition == null ? '–' : own.avgPosition.toFixed(1)}</td>
              <td className={TD}>{stars(own?.rating, own?.reviews)}</td>
            </tr>
            {shortlist.map((c) => (
              <tr key={c.domain}>
                <td className="border-t border-border px-2.5 py-3 font-semibold">{c.domain}</td>
                <td className={TD}>{n(c.etv)}</td>
                <td className={TD}>{n(c.keywords)}</td>
                <td className={TD}>{c.avgPosition == null ? '–' : c.avgPosition.toFixed(1)}</td>
                <td className={TD}>{stars(c.rating, c.reviews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {biggest && biggest.n > 0 && (
        <p className="text-sm leading-normal">
          <strong>Biggest gap:</strong> {biggest.domain} ranks for {biggest.n.toLocaleString('en-US')} {biggest.n === 1 ? 'search' : 'searches'} you do not.{' '}
          <a href={gapHref} className="font-semibold text-primary-heading">See the keyword gap</a>
        </p>
      )}
    </section>
  );
}
