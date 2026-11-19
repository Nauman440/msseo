import type { LocalAudit } from '@seo/core';
import { cn } from '@/lib/tones';

/** 9.10 + 6.5.1 / 6.5.2: who wins the map, against your own profile (posts, photos, reviews, replies). */
const TH = 'whitespace-nowrap px-2.5 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-2.5 align-top';
const n = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '–' : `${v.toLocaleString('en-US')}${suffix}`);

export function RivalsTable({ a }: { a: LocalAudit }) {
  const detailed = a.rivals.some((r) => r.category !== undefined || r.posts90 !== undefined);
  const you = a.profile
    ? { name: `You · ${a.profile.title}`, domain: a.domain, share: null as number | null, category: a.profile.category, photos: a.profile.photos, posts90: a.activity?.posts90 ?? null, rating: a.reviews?.rating ?? a.profile.rating, reviews: a.reviews?.total ?? a.profile.reviews, perMonth: a.reviews?.perMonth ?? null, replyRate: a.reviews?.replyRate ?? null, you: true }
    : null;
  const rows = [
    ...(you && detailed ? [you] : []),
    ...a.rivals.map((r) => ({ name: r.name, domain: r.domain, share: Math.round((r.top3 / Math.max(1, r.points)) * 100), category: r.category ?? null, photos: r.photos ?? null, posts90: r.posts90 ?? null, rating: r.rating, reviews: r.reviews, perMonth: r.perMonth ?? null, replyRate: r.replyRate ?? null, you: false })),
  ];
  return (
    <div className="relative overflow-x-auto">
      <table className={cn('w-full text-sm', detailed ? 'min-w-[860px]' : 'min-w-[560px]')}>
        <thead>
          <tr>
            <th className={TH}>Business</th>
            <th className={cn(TH, 'text-right')}>Top 3 at</th>
            {detailed && <th className={TH}>Main category</th>}
            <th className={cn(TH, 'text-right')}>Rating</th>
            <th className={cn(TH, 'text-right')}>Reviews</th>
            {detailed && <th className={cn(TH, 'text-right')}>New a month</th>}
            {detailed && <th className={cn(TH, 'text-right')}>Answered</th>}
            {detailed && <th className={cn(TH, 'text-right')}>Posts (90 days)</th>}
            {detailed && <th className={cn(TH, 'text-right')}>Photos</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.you}-${r.name}`} className={cn(r.you && 'bg-primary-wash')}>
              <td className={cn(TD, 'font-semibold')}>{r.name}{r.domain && <span className="block text-[12px] font-normal text-ink-3">{r.domain}</span>}</td>
              <td className={cn(TD, 'text-right tabular')}>{r.share === null ? '–' : `${r.share}% of points`}</td>
              {detailed && <td className={TD}>{r.category ?? '–'}</td>}
              <td className={cn(TD, 'text-right tabular')}>{r.rating?.toFixed(1) ?? '–'}</td>
              <td className={cn(TD, 'text-right tabular')}>{n(r.reviews)}</td>
              {detailed && <td className={cn(TD, 'text-right tabular')}>{n(r.perMonth)}</td>}
              {detailed && <td className={cn(TD, 'text-right tabular')}>{n(r.replyRate, '%')}</td>}
              {detailed && <td className={cn(TD, 'text-right tabular')}>{n(r.posts90)}</td>}
              {detailed && <td className={cn(TD, 'text-right tabular')}>{n(r.photos)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {detailed && <p className="mt-2 text-[12.5px] text-ink-3">The top 3 businesses get the full profile, posts and review check; the rest show what the map shows.</p>}
    </div>
  );
}
