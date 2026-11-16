import type { TemplateSpeed } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { cn, lighthouseTone, TONE_SOFT } from '@/lib/tones';

/** Spec §7 Expert table: one row per page template (representative page, mobile + desktop). */

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-3">n/a</span>;
  return <span className={cn('inline-block min-w-9 rounded-pill px-2 py-0.5 text-center text-xs font-semibold tabular', TONE_SOFT[lighthouseTone(value)])}>{value}</span>;
}

const path = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const lcp = (r: TemplateSpeed) => (r.lcpMs !== undefined ? `${(r.lcpMs / 1000).toFixed(1)} s` : '–');
const tbt = (r: TemplateSpeed) => (r.tbtMs !== undefined ? `${Math.round(r.tbtMs)} ms` : '–');
const cls = (r: TemplateSpeed) => (r.cls !== undefined ? r.cls.toFixed(2) : '–');
const metrics = (r: TemplateSpeed) => `${lcp(r)} · ${tbt(r)} · ${cls(r)}`;

export function SpeedByTemplate({ rows }: { rows: TemplateSpeed[] }) {
  return (
    <Card title="Speed per page type" eyebrow="Lighthouse, one representative page per type">
      <ul className="sm:hidden">
        {rows.map((r) => (
          <li key={r.url} className="border-b border-border py-3 first:pt-0 last:border-0">
            <p className="font-medium text-ink">
              {r.label} <span className="font-normal text-ink-3 tabular">· {r.pages}</span>
            </p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-ink-3">{path(r.url)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-ink-3">Mobile</dt>
              <dd><Score value={r.mobile} /></dd>
              <dt className="text-ink-3">Desktop</dt>
              <dd><Score value={r.desktop} /></dd>
              <dt className="text-ink-3">LCP · TBT · CLS</dt>
              <dd className="tabular">{metrics(r)}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-ink-3">
              <th className="py-2 pr-3 font-semibold">Page type</th>
              <th className="py-2 pr-3 font-semibold">Mobile</th>
              <th className="py-2 pr-3 font-semibold">Desktop</th>
              <th className="py-2 pr-3 font-semibold">LCP</th>
              <th className="py-2 pr-3 font-semibold">TBT</th>
              <th className="py-2 font-semibold">CLS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.url} className="border-b border-border last:border-0">
                <td className="py-3 pr-3 align-top">
                  <p className="font-medium text-ink">
                    {r.label} <span className="font-normal text-ink-3 tabular">· {r.pages}</span>
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-ink-3">{path(r.url)}</p>
                </td>
                <td className="py-3 pr-3 align-top"><Score value={r.mobile} /></td>
                <td className="py-3 pr-3 align-top"><Score value={r.desktop} /></td>
                <td className="py-3 pr-3 align-top tabular">{lcp(r)}</td>
                <td className="py-3 pr-3 align-top tabular">{tbt(r)}</td>
                <td className="py-3 align-top tabular">{cls(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-ink-3">Lab data from the mobile run. n/a: PageSpeed did not answer in time for that page.</p>
    </Card>
  );
}
