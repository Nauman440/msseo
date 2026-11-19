import type { ContentAudit, Verdict } from '@seo/core';
import { cn } from '@/lib/tones';
import { DecaySection, InventorySection } from './Inventory';
import { CalendarSection, CoverageSection, GapSection, PillarSection, QualitySection } from './Plan';
import { RunContent } from './RunContent';
import { VERDICT } from './verdict';

/** Module 7 · Content audit page body, the same for the team and customers. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

export function ContentView({ audit, domain, audience }: { audit: ContentAudit | null; domain: string; audience: 'team' | 'customer' }) {
  const a = audit;
  const used = a ? [a.usedSearchConsole && 'Search Console', a.usedAnalytics && 'Google Analytics', 'the latest site audit', 'your keywords'].filter(Boolean).join(', ') : '';
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{a ? `Last check · ${day(a.runAt)}` : 'Not checked yet'}</p>
          <p className="text-[15px] font-semibold">Which pages to keep, improve, merge or remove, what is missing, and what to write next.</p>
          <p className="text-[13px] text-ink-2">
            {a ? `Uses ${used}.` : audience === 'customer' ? 'Free to run. Connect Google to see visits and leads per page.' : 'No DataForSEO cost: Search Console, Analytics, the latest audit and the keyword workspace.'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <RunContent domain={domain} again={Boolean(a)} />
          <a href={`/api/content/${domain}/brief`} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary-heading underline">Download brief template (.md)</a>
        </div>
      </div>
      {a && (
        <>
          {a.notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              {a.notes.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          <ul aria-label="Content summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(Object.keys(VERDICT) as Verdict[]).map((v) => (
              <li key={v} className="rounded-[14px] border border-border bg-surface px-4 py-3.5">
                <p className="font-display text-[24px] font-extrabold tabular">{a.counts[v]}</p>
                <p className="text-sm font-bold"><span className={cn('rounded-full px-2 py-0.5 text-[12px]', VERDICT[v].tone)}>{VERDICT[v].label}</span></p>
                <p className="mt-1 text-[12px] text-ink-2">{VERDICT[v].hint}</p>
              </li>
            ))}
          </ul>
          <InventorySection rows={a.inventory} gsc={a.usedSearchConsole} ga4={a.usedAnalytics} />
          <DecaySection rows={a.decay} />
          <GapSection gaps={a.topicGap} />
          <CoverageSection coverage={a.coverage} />
          <PillarSection pillars={a.pillars} />
          <QualitySection rows={a.quality} />
          <CalendarSection items={a.calendar} />
        </>
      )}
    </div>
  );
}
