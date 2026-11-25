import type { CalendarItem, ContentAudit, Pillar, QualityRow, TopicGap } from '@seo/core';
import { CARD, CHIP, pathOf, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';

/** 7.4 topic gap, 7.5 coverage matrix, 7.6 pillars, 7.7 quality, 7.8 calendar. */
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function GapSection({ gaps }: { gaps: TopicGap[] }) {
  if (!gaps.length) return null;
  return (
    <section aria-labelledby="gap-title" className={CARD}>
      <h2 id="gap-title" className="font-display text-xl font-bold">Topics you do not cover yet</h2>
      <ul className="flex flex-col">
        {gaps.map((g) => (
          <li key={`${g.source}-${g.topic}`} className="flex flex-wrap items-start justify-between gap-2 border-t border-border py-2.5 text-sm first:border-t-0">
            <span className="min-w-0">
              <b>{g.topic}</b>
              <span className="block text-[12.5px] text-ink-2">{g.detail}</span>
            </span>
            <span className={cn(CHIP, g.source === 'competitors' ? 'bg-warn-bg text-warn-text' : 'bg-indigo-bg text-indigo-text')}>{g.source === 'competitors' ? 'Competitors have it' : 'No page yet'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CoverageSection({ coverage }: { coverage: ContentAudit['coverage'] }) {
  if (!coverage || !coverage.services.length || !coverage.places.length) return null;
  const cell = (s: string, p: string) => coverage.cells.find((c) => c.service === s && c.place === p)?.url ?? null;
  const covered = coverage.cells.filter((c) => c.url).length;
  return (
    <section aria-labelledby="cov-title" className={CARD}>
      <h2 id="cov-title" className="font-display text-xl font-bold">Services × places you serve</h2>
      <p className="text-sm text-ink-2">{covered} of {coverage.cells.length} combinations have a page. A page per service and town helps you show up for “service + town” searches.</p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr>
              <th className={TH}>Service</th>
              {coverage.places.map((p) => <th key={p} className={TH}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {coverage.services.map((s) => (
              <tr key={s}>
                <td className={cn(TD, 'font-semibold')}>{s}</td>
                {coverage.places.map((p) => {
                  const url = cell(s, p);
                  return (
                    <td key={p} className={TD}>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" title={pathOf(url)} className={cn(CHIP, 'bg-teal-chip text-teal-text hover:underline')}>Page</a>
                      ) : (
                        <span className={cn(CHIP, 'bg-sunken text-ink-2')}>Missing</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PillarSection({ pillars }: { pillars: Pillar[] }) {
  if (!pillars.length) return null;
  return (
    <section aria-labelledby="pil-title" className={CARD}>
      <h2 id="pil-title" className="font-display text-xl font-bold">Your key pages and the pages that support them</h2>
      <p className="text-sm text-ink-2">Each service gets one main page; the topics around it link back to it.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {pillars.map((p) => (
          <div key={p.service} className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-border p-4">
            <p className="font-bold">{p.service}</p>
            <p className="break-all text-[12.5px] text-ink-2">{p.url ? pathOf(p.url) : 'No main page yet'}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {p.clusters.map((c) => (
                <li key={c.topic} className="flex flex-wrap justify-between gap-2">
                  <span>{c.topic}</span>
                  <span className="text-[12.5px] text-ink-2">{c.action}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function QualitySection({ rows }: { rows: QualityRow[] }) {
  if (!rows.length) return null;
  const score = (v: number) => <span className={cn(CHIP, v >= 4 ? 'bg-teal-chip text-teal-text' : v >= 3 ? 'bg-sunken text-ink-2' : 'bg-high-bg text-high-strong')}>{v}/5</span>;
  return (
    <section aria-labelledby="q-title" className={CARD}>
      <h2 id="q-title" className="font-display text-xl font-bold">Content quality of your key pages</h2>
      <p className="text-sm text-ink-2">Read by AI: is it your own, is it accurate and current, and does it show real experience?</p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr><th className={TH}>Page</th><th className={TH}>Original</th><th className={TH}>Accurate</th><th className={TH}>Experience</th><th className={TH}>What to fix</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.url}>
                <td className={cn(TD, 'break-all font-semibold')}>{pathOf(r.url)}</td>
                <td className={TD}>{score(r.original)}</td>
                <td className={TD}>{score(r.accurate)}</td>
                <td className={TD}>{score(r.experience)}</td>
                <td className={cn(TD, 'text-ink-2')}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CalendarSection({ items }: { items: CalendarItem[] }) {
  if (!items.length) return null;
  const months = [...new Set(items.map((i) => i.month))];
  return (
    <section aria-labelledby="cal-title" className={CARD}>
      <h2 id="cal-title" className="font-display text-xl font-bold">Content calendar</h2>
      <p className="text-sm text-ink-2">Busy-season topics come first, a month before people start searching.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {months.map((m) => (
          <div key={m} className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-border p-4">
            <p className="font-bold">{monthLabel(m)}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {items.filter((i) => i.month === m).map((i) => (
                <li key={i.topicId}>
                  <b>{i.action}:</b> {i.topic}
                  <span className="block text-[12.5px] text-ink-2">{i.why}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
