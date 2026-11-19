import { changeTone, type MetricChange, type MonitorAlert, type MonitorWorkspace, type Snapshot } from '@seo/core';
import { CARD, CHIP, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';
import { ResolveAlert } from './forms';

/** Module 13 building blocks (server components): metric tiles, trend lines, ranking table, alerts. */
const fmt = (v: number | null) => (v === null ? '–' : Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1));
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function ChangeTiles({ changes, against }: { changes: MetricChange[]; against: string }) {
  if (!changes.length) return null;
  return (
    <ul aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {changes.map((c) => {
        const tone = changeTone(c);
        return (
          <li key={c.id} className="rounded-[14px] border border-border bg-surface px-4 py-3.5">
            <p className="font-display text-[22px] font-extrabold tabular">{fmt(c.now)}</p>
            <p className="text-[13px] font-bold">{c.label}</p>
            <p className={cn('text-[12px] tabular', tone === 'good' ? 'text-teal-text' : tone === 'bad' ? 'text-high-strong' : 'text-ink-2')}>
              {c.before === null ? 'No earlier number' : `${fmt(c.before)} ${against}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** A small line chart of one snapshot metric over time. */
export function Trend({ label, points, invert = false }: { label: string; points: { date: string; v: number | null }[]; invert?: boolean }) {
  const pts = points.filter((p): p is { date: string; v: number } => p.v !== null);
  if (pts.length < 2) return null;
  const w = 300;
  const h = 80;
  const vals = pts.map((p) => p.v);
  const [lo, hi] = [Math.min(...vals), Math.max(...vals)];
  const span = hi - lo || 1;
  const y = (v: number) => (invert ? 6 + ((v - lo) / span) * (h - 12) : h - 6 - ((v - lo) / span) * (h - 12));
  const line = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${y(p.v)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <figure className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-border p-4">
      <figcaption className="flex justify-between gap-2 text-[13px]"><b>{label}</b><span className="tabular text-ink-2">{fmt(last.v)}</span></figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" role="img" aria-label={`${label}: ${fmt(pts[0]!.v)} on ${pts[0]!.date}, ${fmt(last.v)} on ${last.date}`}>
        <polyline points={line} fill="none" className="stroke-chart-primary" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="flex justify-between text-[11.5px] text-ink-2"><span>{date(pts[0]!.date)}</span><span>{date(last.date)}</span></p>
    </figure>
  );
}

export function Trends({ snapshots }: { snapshots: Snapshot[] }) {
  const series = (k: keyof Snapshot) => snapshots.map((s) => ({ date: s.date, v: s[k] as number | null }));
  if (snapshots.length < 2) return <p className="text-sm text-ink-2">Trend lines appear after the second weekly snapshot.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Trend label="SEO health" points={series('score')} />
      <Trend label="Clicks (28 days)" points={series('clicks28')} />
      <Trend label="Searches on page 1" points={series('top10')} />
      <Trend label="Leads (28 days)" points={series('leads28')} />
      <Trend label="Average position" points={series('position28')} invert />
      <Trend label="AI share of voice (%)" points={series('aiShare')} />
    </div>
  );
}

export function RankTable({ ws }: { ws: MonitorWorkspace }) {
  const [last, prev] = [ws.ranks.history.at(-1), ws.ranks.history.at(-2)];
  const first = ws.ranks.history[0];
  if (!ws.ranks.keywords.length) return <p className="text-sm text-ink-2">No searches to track yet. Run keyword research first, or add searches by hand.</p>;
  const pos = (p: number | null | undefined) => (p === undefined ? '–' : p === null ? '>10' : `#${p}`);
  const move = (now: number | null | undefined, then: number | null | undefined) => {
    if (now === undefined || then === undefined) return null;
    const a = now ?? 11;
    const b = then ?? 11;
    return a === b ? null : b - a;
  };
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr><th className={TH}>Search</th><th className={cn(TH, 'text-right')}>Now</th><th className={cn(TH, 'text-right')}>Last week</th><th className={cn(TH, 'text-right')}>At start</th></tr></thead>
        <tbody>
          {ws.ranks.keywords.map((k) => {
            const d = move(last?.positions[k], prev?.positions[k]);
            return (
              <tr key={k}>
                <td className={cn(TD, 'font-semibold')}>{k}</td>
                <td className={cn(TD, 'text-right tabular font-bold')}>
                  {pos(last?.positions[k])}
                  {d !== null && <span className={cn('ml-1.5 text-[12px]', d > 0 ? 'text-teal-text' : 'text-high-strong')}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}
                </td>
                <td className={cn(TD, 'text-right tabular text-ink-2')}>{pos(prev?.positions[k])}</td>
                <td className={cn(TD, 'text-right tabular text-ink-2')}>{pos(first?.positions[k])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SEVERITY: Record<MonitorAlert['severity'], string> = {
  critical: 'bg-high-bg text-high-strong',
  high: 'bg-warn-bg text-warn-text',
  medium: 'bg-amber-bg text-amber-text',
  info: 'bg-teal-chip text-teal-text',
};

export function AlertList({ domain, alerts, showDomain = false, limit = 30 }: { domain: string; alerts: MonitorAlert[]; showDomain?: boolean; limit?: number }) {
  if (!alerts.length) return <p className="text-sm text-ink-2">No alerts. We check the site every morning: down, hidden pages, robots.txt, traffic, reviews and rankings.</p>;
  return (
    <ul className="flex flex-col">
      {alerts.slice(0, limit).map((a) => (
        <li key={a.id} className={cn('flex flex-wrap items-start justify-between gap-3 border-t border-border py-3 text-sm first:border-t-0', a.resolvedAt && 'opacity-60')}>
          <span className="flex min-w-0 items-start gap-3">
            <span className={cn(CHIP, 'mt-0.5 capitalize', SEVERITY[a.severity])}>{a.severity === 'info' ? 'Good news' : a.severity}</span>
            <span className="min-w-0">
              <b>{a.title}</b>
              {showDomain && <span className="ml-2 text-ink-2">{domain}</span>}
              <span className="block break-words text-ink-2">{a.detail}</span>
              <span className="block text-[12px] text-ink-3">{date(a.at)}{a.resolvedAt ? ` · closed ${date(a.resolvedAt)}` : ''}</span>
            </span>
          </span>
          {!a.resolvedAt && a.severity !== 'info' && <ResolveAlert domain={domain} id={a.id} />}
        </li>
      ))}
    </ul>
  );
}

export const Card = ({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) => (
  <section aria-labelledby={`${id}-title`} className={CARD}>
    <h2 id={`${id}-title`} className="font-display text-xl font-bold">{title}</h2>
    {intro && <p className="text-sm text-ink-2">{intro}</p>}
    {children}
  </section>
);
