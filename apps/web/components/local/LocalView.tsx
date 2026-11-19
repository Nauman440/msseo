import type { LocalAudit } from '@seo/core';
import { cn } from '@/lib/tones';
import { MapGrid } from './MapGrid';
import { RunLocal } from './RunLocal';

/** Module 9 · Local SEO audit page body, the same for the team and customers. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const CARD = 'flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6';
const TH = 'whitespace-nowrap px-2.5 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-2.5 align-top';
const CHIP = 'whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold';
const mark = (ok: boolean | null) => (ok === null ? <span className="text-ink-3">–</span> : ok ? <span className={cn(CHIP, 'bg-teal-chip text-teal-text')}>Matches</span> : <span className={cn(CHIP, 'bg-high-bg text-high-strong')}>Different</span>);
const STATUS: Record<string, string> = { pass: 'bg-teal-chip text-teal-text', warn: 'bg-amber-bg text-amber-text', fail: 'bg-high-bg text-high-strong' };

export function LocalView({ a, domain, audience, nextRun }: { a: LocalAudit | null; domain: string; audience: 'team' | 'customer'; nextRun: Date | null }) {
  const cells = a?.grid ? a.grid.size * a.grid.size * a.grid.searches.length : 0;
  const top3 = a?.grid ? a.grid.searches.reduce((x, s) => x + s.top3, 0) : 0;
  const found = a ? a.citations.filter((c) => c.found).length : 0;
  const tiles = a
    ? [
        { label: 'Profile complete', value: a.completeness ? `${a.completeness.score}%` : '–', bad: (a.completeness?.score ?? 0) < 70 },
        { label: 'Google rating', value: a.reviews?.rating ? `${a.reviews.rating.toFixed(1)} (${(a.reviews.total ?? 0).toLocaleString('en-US')})` : '–' },
        { label: 'New reviews a month', value: a.reviews?.perMonth !== null && a.reviews?.perMonth !== undefined ? String(a.reviews.perMonth) : '–' },
        { label: 'Reviews answered', value: a.reviews?.replyRate !== null && a.reviews?.replyRate !== undefined ? `${a.reviews.replyRate}%` : '–', bad: (a.reviews?.replyRate ?? 100) < 50 },
        { label: 'In the map pack', value: cells ? `${Math.round((top3 / cells) * 100)}%` : '–', bad: cells > 0 && top3 / cells < 0.3 },
        { label: 'Listed on directories', value: `${found} of ${a.citations.length}` },
      ]
    : [];
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{a ? `Last check · ${day(a.runAt)}${audience === 'team' ? ` · $${a.costUsd.toFixed(2)}` : ''}` : 'Not checked yet'}</p>
          <p className="text-[15px] font-semibold">{a?.businessName ? `${a.businessName}: ` : ''}your Google Business Profile, reviews, listings and where you show in the map across your area.</p>
          <p className="text-[13px] text-ink-2">{audience === 'customer' ? 'You can run it once a month.' : 'About $0.20–0.35 per run (75 map checks, profile, reviews, posts, listings).'}</p>
        </div>
        <RunLocal domain={domain} again={Boolean(a)} disabledReason={nextRun ? `Next check available on ${nextRun.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.` : null} />
      </div>
      {a && (
        <>
          {(a.notes.length > 0 || a.pending.reviews || a.pending.updates) && (
            <ul className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              {a.notes.map((x) => <li key={x}>{x}</li>)}
              {(a.pending.reviews || a.pending.updates) && <li>Reviews or posts are still being collected by Google’s data partner. Open this page again in a few minutes.</li>}
            </ul>
          )}
          <ul aria-label="Local summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <li key={t.label} className={cn('rounded-[14px] border px-4 py-3.5', t.bad ? 'border-high-line bg-warn-bg' : 'border-border bg-surface')}>
                <p className={cn('font-display text-[22px] font-extrabold tabular', t.bad && 'text-high-strong')}>{t.value}</p>
                <p className="text-sm font-bold">{t.label}</p>
              </li>
            ))}
          </ul>

          {a.grid && (
            <section aria-labelledby="grid-title" className={CARD}>
              <h2 id="grid-title" className="font-display text-xl font-bold">Where you show in the map across your area</h2>
              <MapGrid grid={a.grid} />
            </section>
          )}

          {a.completeness && (
            <section aria-labelledby="profile-title" className={CARD}>
              <h2 id="profile-title" className="font-display text-xl font-bold">Google Business Profile · {a.completeness.score}% complete</h2>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
                {a.completeness.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <span aria-hidden className={c.ok ? 'text-teal-text' : 'text-high-strong'}>{c.ok ? '✓' : '✗'}</span>
                    <span><strong>{c.label}</strong> <span className="text-ink-2">· {c.detail}</span></span>
                  </li>
                ))}
              </ul>
              {a.activity && (
                <p className="text-sm text-ink-2">
                  <strong className="text-ink">Activity:</strong> {a.activity.posts90 ?? '–'} posts in the last 90 days{a.activity.latestPost ? ` (latest ${a.activity.latestPost})` : ''} · {a.activity.photos ?? '–'} photos · {a.activity.questions ?? '–'} questions{a.activity.unanswered ? `, ${a.activity.unanswered} unanswered` : ''}
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="nap-title" className={CARD}>
            <div>
              <h2 id="nap-title" className="font-display text-xl font-bold">Name, address and phone everywhere</h2>
              <p className="mt-1 text-sm text-ink-2">Google trusts a business more when its details are the same on its profile, its website and the directories.</p>
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead><tr><th className={TH}>Where</th><th className={TH}>Name</th><th className={TH}>Phone</th><th className={TH}>Address</th></tr></thead>
                <tbody>
                  {a.nap.map((r) => (
                    <tr key={r.source}>
                      <td className={cn(TD, 'font-semibold')}>{r.source}</td>
                      <td className={TD}>{r.name ? <span className="block text-[12.5px] text-ink-2">{r.name}</span> : null}{mark(r.nameOk)}</td>
                      <td className={TD}>{r.phone ? <span className="block text-[12.5px] text-ink-2">{r.phone}</span> : null}{mark(r.phoneOk)}</td>
                      <td className={TD}>{r.address ? <span className="block text-[12.5px] text-ink-2">{r.address}</span> : null}{mark(r.addressOk)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <h3 className="text-[15px] font-bold">Directories</h3>
              <ul className="flex flex-wrap gap-2">
                {a.citations.map((c) => (
                  <li key={c.site} className={cn(CHIP, c.found ? (c.phoneOk === false ? 'bg-amber-bg text-amber-text' : 'bg-teal-chip text-teal-text') : 'bg-sunken text-ink-2')}>
                    {c.label}: {c.found ? (c.phoneOk === false ? 'listed, phone differs' : 'listed') : 'not found'}
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-ink-3">Found by searching Google for the business name; a listing Google does not show may still exist.</p>
            </div>
          </section>

          {(a.rivals.length > 0 || a.fromAudit.length > 0 || a.localLinks) && (
            <section aria-labelledby="bench-title" className={CARD}>
              <h2 id="bench-title" className="font-display text-xl font-bold">Who wins the map, and the rest of your local setup</h2>
              {a.rivals.length > 0 && (
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr><th className={TH}>Business</th><th className={cn(TH, 'text-right')}>Top 3 at</th><th className={cn(TH, 'text-right')}>Rating</th><th className={cn(TH, 'text-right')}>Reviews</th></tr></thead>
                    <tbody>
                      {a.rivals.map((r) => (
                        <tr key={r.name}>
                          <td className={cn(TD, 'font-semibold')}>{r.name}{r.domain && <span className="block text-[12px] font-normal text-ink-3">{r.domain}</span>}</td>
                          <td className={cn(TD, 'text-right tabular')}>{Math.round((r.top3 / Math.max(1, r.points)) * 100)}% of points</td>
                          <td className={cn(TD, 'text-right tabular')}>{r.rating?.toFixed(1) ?? '–'}</td>
                          <td className={cn(TD, 'text-right tabular')}>{r.reviews?.toLocaleString('en-US') ?? '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {a.fromAudit.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {a.fromAudit.map((f) => (
                    <li key={f.ruleId} className="flex flex-wrap items-center gap-2"><span className={cn(CHIP, STATUS[f.status] ?? 'bg-sunken text-ink-2')}>{f.status === 'pass' ? 'OK' : f.status === 'warn' ? 'Check' : 'Fix'}</span><strong>{f.label}</strong><span className="text-ink-2">· {f.message}</span></li>
                  ))}
                </ul>
              )}
              {a.localLinks && (
                <p className="text-sm text-ink-2">
                  <strong className="text-ink">Local links:</strong> {a.localLinks.count ? `${a.localLinks.count} local websites link to you (${a.localLinks.examples.slice(0, 5).join(', ')}).` : 'no local websites link to you yet.'} Sponsor a local team or event, join the chamber of commerce and trade associations, and offer local news a useful story.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
