import Link from 'next/link';
import { pathOf, SLOT_LABEL, type MappingRow, type MapRow, type PageCheck, type PageFix } from '@seo/core';
import { cn } from '@/lib/tones';
import { CHIP, INTENT_WORDS, MONO, PAGE_TYPE, STATUS_LABEL } from './labels';
import { AddKeyword, ConfirmIntent, FixList, MoveKeyword, RecheckButton, TeamControls } from './page-forms';

/** Module 5 · the keyword map for one page (design: Keywords tab keyword map for one page). */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const TH = 'whitespace-nowrap px-2.5 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-3.5 align-top';

const STEPS = [
  { title: 'Keywords for this page', text: 'One main keyword, plus supporting ones. Each keyword belongs to one page only.' },
  { title: 'Where each one goes', text: 'Title, H1, meta description, section headings, body or FAQ.' },
  { title: 'Gaps become fixes', text: 'Missing spots are drafted below for you to approve.' },
];

export function PageMapView({ domain, row, map, fixes, check, checkFailed, gaps, topics, backHref, nextHref, audience, pageType }: {
  domain: string;
  row: MappingRow;
  map: MapRow[];
  fixes: PageFix[];
  check: PageCheck | null;
  checkFailed: boolean;
  gaps: number;
  topics: { id: string; name: string }[];
  backHref: string;
  nextHref: string | null;
  audience: 'team' | 'customer';
  pageType: string | null;
}) {
  const url = row.url!;
  const onPage = map.filter((m) => m.found.length > 0).length;
  const conflict = row.conflicts.length > 0 && !row.conflictSettled;
  const fit = pageType ? PAGE_TYPE[pageType] ?? pageType : null;
  const others = topics.filter((t) => t.id !== row.clusterId);
  return (
    <div className="flex flex-col gap-[22px]">
      <Link href={backHref} className="text-sm text-ink-2 hover:text-ink">← All topics</Link>

      <div className="flex flex-wrap items-center gap-5 rounded-card border border-border bg-surface p-[22px]">
        <div className="flex min-w-[min(260px,100%)] flex-1 flex-col gap-1.5">
          <p className={EYEBROW}>Keyword map for one page</p>
          <h2 className={MONO}>{pathOf(url)}</h2>
          <p className="text-sm text-ink-2">
            Topic: <strong className="text-ink">{row.topic}</strong> ·{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-heading">Open page</a>
          </p>
          {row.intent && (
            <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-2">
              Search intent: <strong className="text-ink">{INTENT_WORDS[row.intent] ?? row.intent}</strong>
              {fit && <> · page is a {fit}</>}
              {row.intentConfirmed ? <span className={`${CHIP} bg-teal-chip text-teal-text`}>Confirmed</span> : <ConfirmIntent domain={domain} clusterId={row.clusterId} />}
            </div>
          )}
        </div>
        {[
          { v: row.currentPosition !== null ? `#${Math.round(row.currentPosition)}` : '—', l: 'Position for main keyword' },
          { v: `${onPage} of ${map.length}`, l: 'Keywords already on page' },
          { v: String(fixes.length), l: gaps ? `Fixes to close ${gaps} ${gaps === 1 ? 'gap' : 'gaps'}` : 'Fixes drafted' },
        ].map((s) => (
          <div key={s.l} className="min-w-[120px] rounded-[12px] bg-canvas px-3.5 py-3">
            <p className="font-display text-[22px] font-extrabold tabular">{s.v}</p>
            <p className="text-[12px] text-ink-2">{s.l}</p>
          </div>
        ))}
      </div>

      {conflict && (
        <p role="note" className="rounded-[14px] border border-high-line bg-warn-bg px-[18px] py-3.5 text-sm text-high-strong">
          Two pages compete for this topic. <Link href={backHref} className="font-bold underline">Pick the main page</Link> first, so the fixes go to the right page.
        </p>
      )}

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 rounded-[14px] border border-border bg-surface px-4 py-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-night text-[13px] font-extrabold text-white">{i + 1}</span>
            <span>
              <span className="block text-sm font-bold">{s.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="map-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="map-title" className="font-display text-xl font-bold">The keyword map</h2>
            <p className="mt-1 text-sm text-ink-2">
              {check ? 'Green is already on the page. Red is missing and becomes a fix.' : 'Only the title and H1 from the last audit are known; the page could not be loaded yet.'}{' '}
              {check && <span className="text-ink-3">Checked {day(check.fetchedAt)}.</span>}
            </p>
            {checkFailed && <p role="alert" className="mt-1 text-[13px] font-semibold text-fail-text">The page did not load just now; this uses the last check.</p>}
            <RecheckButton domain={domain} clusterId={row.clusterId} />
          </div>
          <AddKeyword domain={domain} clusterId={row.clusterId} />
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH}>Keyword</th>
                <th scope="col" className={TH}>Role</th>
                <th scope="col" className={cn(TH, 'text-right')}>Searches / mo</th>
                <th scope="col" className={TH}>Position</th>
                <th scope="col" className={TH}>Where it should appear</th>
                <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {map.map((m) => (
                <tr key={m.term}>
                  <td className={cn(TD, 'font-bold')}>{m.term}</td>
                  <td className={TD}>
                    <span className={cn(CHIP, m.role === 'main' ? 'bg-primary text-primary-ink' : 'bg-sunken text-ink-2')}>{m.role === 'main' ? 'Main' : 'Supporting'}</span>
                  </td>
                  <td className={cn(TD, 'text-right tabular')}>{m.volume !== null ? m.volume.toLocaleString('en-US') : m.added ? 'Added by you' : '—'}</td>
                  <td className={cn(TD, 'tabular')}>{m.position !== null ? `#${Math.round(m.position)}` : 'Not ranking'}</td>
                  <td className={TD}>
                    {m.missing.map((s) => (
                      <span key={s} className={cn(CHIP, 'mb-1 mr-1 inline-block bg-high-bg text-high-strong')}>Missing · {SLOT_LABEL[s]}</span>
                    ))}
                    {m.shown.map((s) => (
                      <span key={s} className={cn(CHIP, 'mb-1 mr-1 inline-block bg-teal-chip text-teal-text')}>✓ {SLOT_LABEL[s]}</span>
                    ))}
                    {!m.missing.length && !m.shown.length && <span className="text-[13px] text-ink-3">Not on the page</span>}
                  </td>
                  <td className={cn(TD, 'text-right')}>{m.role === 'supporting' && others.length > 0 && <MoveKeyword domain={domain} term={m.term} topics={others} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] leading-normal text-ink-2">“Move” sends a keyword to a better page, for example if it deserves its own guide. A keyword never sits on two pages, so pages do not compete.</p>
      </section>

      {audience === 'team' && (
        <section aria-label="Owner and status" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-[22px]">
          <h2 className="font-display text-lg font-bold">Owner and status</h2>
          <TeamControls domain={domain} row={row} />
        </section>
      )}
      {audience === 'customer' && row.status !== 'todo' && (
        <p className="text-sm text-ink-2">Status: <strong className="text-ink">{STATUS_LABEL[row.status]}</strong></p>
      )}

      <FixList
        domain={domain}
        clusterId={row.clusterId}
        fixes={conflict ? [] : fixes}
        keywords={map.map((m) => ({ term: m.term, inPlace: m.missing.length === 0 }))}
        nextHref={nextHref}
      />
    </div>
  );
}
