import Link from 'next/link';
import { mappingSummary, needsYou, normTerm, type KeywordRecord, type MappingRow, type MappingWorkspace, type ReportPage } from '@seo/core';
import { cn } from '@/lib/tones';
import { MappingRunButtons, SendAllBar } from './forms';
import { Inventory } from './Inventory';
import type { MappingFilter } from './labels';
import { TopicCard } from './TopicCard';

/**
 * Module 5 overview (design: Keywords tab page mapping): which page should rank for each topic,
 * conflicts to settle, new pages needed, and drafted fixes. The same for the team and customers.
 */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const FIRST = 8;

const FILTER_TEST: Record<MappingFilter, (r: MappingRow) => boolean> = {
  needs: needsYou,
  all: () => true,
  mapped: (r) => Boolean(r.url) && !(r.conflicts.length && !r.conflictSettled),
  conflicts: (r) => r.conflicts.length > 0 && !r.conflictSettled,
  new: (r) => !r.url,
};

export function MappingOverview({ ws, keywords, fixes, pages, reportPages, audience, aiAvailable, href, filter, showAll }: {
  ws: MappingWorkspace;
  keywords: KeywordRecord[];
  /** Drafted fixes per topic (cluster id). */
  fixes: Record<string, number>;
  /** Pages to choose from: audited pages, then sitemap-only pages. */
  pages: string[];
  reportPages: ReportPage[];
  audience: 'team' | 'customer';
  aiAvailable: boolean;
  href: (extra?: Record<string, string>) => string;
  filter: MappingFilter | null;
  showAll: boolean;
}) {
  const sum = mappingSummary(ws);
  const active: MappingFilter = filter ?? (sum.needsYou ? 'needs' : 'all');
  const rows = ws.rows.filter(FILTER_TEST[active]);
  const shown = showAll ? rows : rows.slice(0, FIRST);
  const totalFixes = Object.values(fixes).reduce((s, n) => s + n, 0);
  const supportingOf = (r: MappingRow) => {
    const moves = ws.moves ?? {};
    const here = keywords.filter((k) => k.status === 'kept' && (moves[normTerm(k.term)] ?? k.clusterId) === r.clusterId).length;
    const added = (ws.added ?? []).filter((a) => a.clusterId === r.clusterId).length;
    return Math.max(0, here + added - 1);
  };
  const tiles = [
    { value: sum.rows, label: 'Topics', hint: 'One page each', tone: 'border-border bg-surface', num: 'text-ink' },
    { value: sum.mapped, label: 'Mapped', hint: 'Matched to a page', tone: 'border-border bg-surface', num: 'text-teal-text' },
    { value: sum.conflicts, label: 'Two pages compete', hint: 'Pick the main page', tone: 'border-high-line bg-warn-bg', num: 'text-high-strong' },
    { value: sum.newPages, label: 'New pages needed', hint: 'No page covers these', tone: 'border-primary-tint bg-primary-wash', num: 'text-primary-heading' },
  ];
  const chips: { key: MappingFilter; label: string; n: number }[] = [
    { key: 'needs', label: 'Needs you first', n: sum.needsYou },
    { key: 'all', label: 'All', n: sum.rows },
    { key: 'mapped', label: 'Mapped', n: sum.mapped },
    { key: 'conflicts', label: 'Two pages compete', n: sum.conflicts },
    { key: 'new', label: 'New pages', n: sum.newPages },
  ];

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex max-w-[640px] flex-col gap-1">
          <p className={EYEBROW}>{ws.builtAt ? `Last matched · ${day(ws.builtAt)}` : 'Not matched yet'}</p>
          <h2 className="font-display text-[22px] font-bold sm:text-[26px]">Which page should rank for each topic</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            {ws.usedSearchConsole ? 'We matched every topic to one page using Search Console and your page content.' : 'We matched every topic to one page using your page content and sitemap.'} Check the matches, settle the
            conflicts, and we draft the fixes for each page.
          </p>
        </div>
        <MappingRunButtons domain={ws.domain} hasRows={ws.rows.length > 0} aiAvailable={aiAvailable} csvHref={ws.rows.length ? `/api/mapping/${ws.domain}/csv` : null} />
      </div>

      {ws.rows.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-[15px] text-ink-2">
          No matches yet. This needs keyword topics (Overview → “Update keywords”) and an audit of the site; then press “Match pages to topics”.
        </p>
      ) : (
        <>
          <ul aria-label="Page mapping summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <li key={t.label} className={cn('rounded-[14px] border px-[18px] py-4', t.tone)}>
                <p className={cn('font-display text-[30px] font-extrabold tabular', t.num)}>{t.value}</p>
                <p className="text-sm font-bold">{t.label}</p>
                <p className="mt-0.5 text-[12px] text-ink-2">{t.hint}</p>
              </li>
            ))}
          </ul>

          <nav aria-label="Show topics" className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={href(c.key === 'all' && !sum.needsYou ? {} : { show: c.key })}
                aria-current={active === c.key ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-full border px-3.5 text-[13px] font-semibold',
                  active === c.key ? 'border-night bg-night text-white' : 'border-border-strong bg-surface text-ink hover:border-ink-3',
                )}
              >
                {c.label} <span className="ml-1.5 tabular">{c.n}</span>
              </Link>
            ))}
          </nav>

          {shown.length === 0 && <p className="rounded-card border border-border bg-surface p-6 text-sm text-ink-2">Nothing here.</p>}
          {shown.map((r) => (
            <TopicCard
              key={r.clusterId}
              domain={ws.domain}
              row={r}
              supporting={supportingOf(r)}
              fixes={fixes[r.clusterId] ?? 0}
              pages={pages}
              pageHref={href({ topic: r.clusterId })}
              positions={r.url ? { [r.url]: r.currentPosition } : {}}
            />
          ))}
          {!showAll && rows.length > FIRST && (
            <div className="flex justify-center">
              <Link href={href({ ...(filter ? { show: filter } : {}), all: '1' })} className="inline-flex min-h-12 items-center rounded-button border border-border-strong bg-surface px-5 text-[15px] font-semibold hover:border-ink-3">
                Show all {rows.length} topics
              </Link>
            </div>
          )}

          {audience === 'team' && <Inventory ws={ws} pages={reportPages} />}

          <SendAllBar domain={ws.domain} conflicts={sum.conflicts} fixes={totalFixes} />
        </>
      )}
    </div>
  );
}
