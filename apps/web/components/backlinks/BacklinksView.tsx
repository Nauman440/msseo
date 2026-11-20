import type { BacklinkWorkspace } from '@seo/core';
import { cn } from '@/lib/tones';
import { CompetitorLinkDetails } from './CompetitorLinks';
import { RunBacklinks } from './forms';
import { GapAndMentions, LostAndBroken, Outreach } from './Opportunities';
import { AnchorSection, QualitySection, TopLinkedPages, VersusCompetitors } from './Sections';
import { Term } from '@/components/ui/Term';
import { TILE_TERMS } from '@/lib/glossary';

/** Module 8 · Backlink audit page body, the same for the team and customers. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('en-US'));

export function BacklinksView({ ws, audience, nextRun }: { ws: BacklinkWorkspace; audience: 'team' | 'customer'; nextRun: Date | null }) {
  const a = ws.audit;
  const csv = (list: string) => `/api/backlinks/${ws.domain}/csv?list=${list}`;
  const recent = a ? a.series.filter((s) => Date.parse(s.date) > Date.parse(a.runAt) - 90 * 86_400_000) : [];
  const tiles = a
    ? [
        { label: 'Linking websites', value: n(a.summary.referringDomains), hint: 'Different sites linking to you' },
        { label: 'Backlinks', value: n(a.summary.backlinks), hint: 'All links, from every page' },
        { label: 'Site strength', value: n(a.summary.rank), hint: 'From your links, 0–100' },
        { label: 'Spammy links', value: n(a.quality.toxic), hint: 'Spam score 60 or more', bad: a.quality.toxic > 0 },
        { label: 'Broken backlinks', value: n(a.broken.length), hint: 'Links to pages that are gone', bad: a.broken.length > 0 },
        { label: 'Last 90 days', value: `+${recent.reduce((x, y) => x + y.newDomains, 0)} / −${recent.reduce((x, y) => x + y.lostDomains, 0)}`, hint: 'Linking sites won / lost' },
      ]
    : [];
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{a ? `Last check · ${day(a.runAt)}${audience === 'team' ? ` · $${a.costUsd.toFixed(2)}` : ''}` : 'Not checked yet'}</p>
          <p className="text-[15px] font-semibold">Who links to your website, which links help or hurt, and where to get more.</p>
          <p className="text-[13px] text-ink-2">{audience === 'customer' ? 'You can run it once a month.' : 'About $0.40–0.55 per run (DataForSEO Backlinks API, which must be enabled on the account).'}</p>
        </div>
        <RunBacklinks domain={ws.domain} again={Boolean(a)} disabledReason={nextRun ? `Next check available on ${nextRun.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.` : null} />
      </div>
      {a && (
        <>
          {a.notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              {a.notes.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          <ul aria-label="Backlink summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <li key={t.label} className={cn('rounded-[14px] border px-4 py-3.5', t.bad ? 'border-high-line bg-warn-bg' : 'border-border bg-surface')}>
                <p className={cn('font-display text-[24px] font-extrabold tabular', t.bad && 'text-high-strong')}>{t.value}</p>
                <p className="text-sm font-bold">{TILE_TERMS[t.label] ? <Term k={TILE_TERMS[t.label]!}>{t.label}</Term> : t.label}</p>
                <p className="text-[12px] text-ink-2">{t.hint}</p>
              </li>
            ))}
          </ul>
          <VersusCompetitors a={a} />
          <CompetitorLinkDetails a={a} />
          <GapAndMentions ws={ws} csvHref={csv('gap')} />
          <LostAndBroken ws={ws} csvHref={csv('broken')} />
          <QualitySection a={a} csvHref={csv('domains')} />
          <AnchorSection a={a} />
          <TopLinkedPages a={a} />
        </>
      )}
      <Outreach ws={ws} csvHref={csv('outreach')} />
    </div>
  );
}
