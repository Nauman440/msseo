import { SHORTLIST_TARGET, type CompetitorRecord, type OwnSnapshot } from '@seo/core';
import { Term } from '@/components/ui/Term';
import { cn } from '@/lib/tones';
import { RemoveFromShortlist } from './controls';

/**
 * "The competitors we watch" (the shortlist): main competitors and bigger names, as removable chips,
 * with how many to pick in plain words.
 */
export function ShortlistCard({ domain, competitors, autopilot }: { domain: string; competitors: CompetitorRecord[]; autopilot: boolean }) {
  const groups = [
    { key: 'direct' as const, title: 'Main competitors', term: 'directCompetitor' as const, hint: 'Businesses like yours, in your area, that customers find instead of you.', target: SHORTLIST_TARGET.direct },
    { key: 'aspirational' as const, title: 'Bigger names to learn from', term: 'aspirational' as const, hint: 'Stronger sites in your field. Not to beat this month, but to copy what works.', target: SHORTLIST_TARGET.aspirational },
  ];
  return (
    <section aria-labelledby="shortlist-title" className="flex flex-col gap-[18px] rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="shortlist-title" className="font-display text-[22px] font-bold">The competitors we watch</h2>
        <p className="mt-1 max-w-[760px] text-sm leading-normal text-ink-2">
          {autopilot ? 'Autopilot picks these from the businesses that show up most for your searches. ' : ''}
          We compare you with them in every report and tell you when a new one appears. Change them any time in the list below; your choice is never undone.
        </p>
      </div>
      <div className="flex flex-wrap gap-7">
        {groups.map((g) => {
          const picked = competitors.filter((c) => c.shortlist === g.key);
          const [min, max] = g.target;
          const inRange = picked.length >= min && picked.length <= max;
          return (
            <div key={g.key} className="flex min-w-0 flex-1 basis-[300px] flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <h3 className="text-[17px] font-bold"><Term k={g.term}>{g.title}</Term></h3>
                <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold tabular', inRange ? 'bg-teal-chip text-teal-text' : 'bg-amber-bg text-amber-text')}>
                  {picked.length} picked · aim for {min}–{max}
                </span>
              </div>
              <p className="text-[13px] leading-snug text-ink-2">{g.hint}</p>
              <ul className="flex flex-wrap gap-2">
                {picked.map((c) => (
                  <li key={c.domain} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[13px] font-bold', g.key === 'direct' ? 'bg-primary text-primary-ink' : 'bg-night text-white')}>
                    <span className="truncate">{c.domain}</span>
                    <RemoveFromShortlist domain={domain} competitor={c.domain} light={g.key !== 'direct'} />
                  </li>
                ))}
                {picked.length < min && (
                  <li className="rounded-full border border-dashed border-border-strong px-3.5 py-2 text-[13px] text-ink-2">
                    {picked.length ? `Pick ${min - picked.length} more from the list below` : 'None yet: pick from the list below'}
                  </li>
                )}
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
const stars = (rating: number | null | undefined, reviews: number | null | undefined) => (rating == null ? '–' : `${rating.toFixed(1)} ★${reviews != null ? ` (${reviews.toLocaleString('en-US')})` : ''}`);

/** You next to the competitors we watch, with plain column names and a bar for visits. */
export function VersusTable({ domain, own, shortlist, searches }: { domain: string; own: OwnSnapshot | null; shortlist: CompetitorRecord[]; searches: number }) {
  if (!shortlist.length) return null;
  const rows = [
    { key: 'you', label: `You · ${domain}`, you: true, seenIn: own?.seenIn ?? null, etv: own?.etv ?? null, keywords: own?.keywords ?? null, avg: own?.avgPosition ?? null, rating: own?.rating ?? null, reviews: own?.reviews ?? null },
    ...shortlist.map((c) => ({ key: c.domain, label: c.domain, you: false, seenIn: c.seenIn, etv: c.etv, keywords: c.keywords, avg: c.avgPosition, rating: c.rating ?? null, reviews: c.reviews ?? null })),
  ];
  const maxEtv = Math.max(1, ...rows.map((r) => r.etv ?? 0));
  return (
    <section aria-labelledby="vs-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 id="vs-title" className="font-display text-xl font-bold">You next to them</h2>
        <p className="mt-1 text-sm text-ink-2">A dash means we have no number for it yet.</p>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr>
              <th className={TH}>Website</th>
              <th className={cn(TH, 'text-right')}><Term k="seenIn">Shows up in your searches</Term></th>
              <th className={TH}><Term k="visitsEstimate">Visits from Google a month</Term></th>
              <th className={cn(TH, 'text-right')}><Term k="avgPosition">Usual spot</Term></th>
              <th className={cn(TH, 'text-right')}><Term k="rating">Google rating</Term></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.you ? 'bg-primary-wash' : undefined}>
                <td className={cn('border-t border-border px-2.5 py-3', r.you ? 'font-extrabold' : 'font-semibold')}>{r.label}</td>
                <td className={TD}>{r.seenIn === null || !searches ? '–' : `${r.seenIn} of ${searches}`}</td>
                <td className="border-t border-border px-2.5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 shrink-0 rounded-full bg-border" aria-hidden>
                      <div className={cn('h-2 rounded-full', r.you ? 'bg-primary' : 'bg-ink-3')} style={{ width: `${Math.round(((r.etv ?? 0) / maxEtv) * 100)}%` }} />
                    </div>
                    <span className="tabular">{r.etv === null ? '–' : `about ${n(r.etv)}`}</span>
                  </div>
                </td>
                <td className={TD}>{r.avg == null ? '–' : `#${r.avg.toFixed(1)}`}</td>
                <td className={TD}>{stars(r.rating, r.reviews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
