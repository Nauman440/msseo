import Link from 'next/link';
import type { MappingRow, PageBrief } from '@seo/core';
import { PageChooser } from './forms';
import { CHIP, MONO } from './labels';
import { SendBrief } from './page-forms';

/** Module 5 · brief for a new page ("Create page brief"): ready for a writer, downloadable as Markdown. */
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-[22px]">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {items.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] leading-normal">
          {items.map((x) => (
            <li key={x} className="break-words">{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">None</p>
      )}
    </section>
  );
}

export function BriefView({ domain, row, brief, pages, backHref, mdHref }: { domain: string; row: MappingRow; brief: PageBrief; pages: string[]; backHref: string; mdHref: string }) {
  return (
    <div className="flex flex-col gap-[22px]">
      <Link href={backHref} className="text-sm text-ink-2 hover:text-ink">← All topics</Link>

      <div className="flex flex-wrap items-start justify-between gap-5 rounded-card border border-border bg-surface p-[22px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={EYEBROW}>Page brief · new page</p>
          <h2 className={MONO}>{brief.path}</h2>
          <p className="text-sm text-ink-2">
            Topic: <strong className="text-ink">{row.topic}</strong> · {brief.pageType}
            {brief.note ? ` · ${brief.note}` : ''}
          </p>
          <p className="text-sm text-ink-2">Length: about {brief.words} words</p>
        </div>
        <span className={`${CHIP} bg-primary-chip text-primary-heading`}>New page needed</span>
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[22px]">
        <h2 className="font-display text-lg font-bold">Title, H1 and meta description</h2>
        <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[['Title', brief.title], ['H1', brief.h1], ['Meta description', brief.meta]].map(([k, v]) => (
            <div key={k} className="rounded-[12px] border border-teal-soft bg-teal-bg px-3.5 py-3">
              <dt className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-teal-text">{k} · {v!.length} characters</dt>
              <dd className="mt-1 break-words text-sm font-semibold leading-normal">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-ink-2">
          Main keyword: <strong className="text-ink">{brief.mainKeyword}</strong>
          {brief.supporting.length > 0 && <> · supporting: {brief.supporting.join(', ')}</>}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-[22px] md:grid-cols-2">
        <Block title="Outline (H2 sections)" items={brief.outline} />
        <Block title="FAQ questions" items={brief.faq} />
        <Block title="Must have on the page" items={brief.mustHave} />
        <Block title="Link to it from" items={brief.linksFrom.map((u) => { try { return new URL(u).pathname; } catch { return u; } })} />
      </div>
      {brief.schema.length > 0 && <p className="text-sm text-ink-2">Schema: {brief.schema.join(', ')}</p>}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3.5 rounded-card bg-night px-[18px] py-3.5">
        <p className="text-[15px] text-white">
          <strong>Publishing a new page always needs your approval.</strong>
          {row.sentAt && <span className="text-mist-3"> · sent to approvals</span>}
        </p>
        <div className="flex flex-wrap items-start gap-2.5">
          <a href={mdHref} className="inline-flex min-h-11 items-center rounded-button border border-ink-3 px-[18px] text-[15px] font-semibold text-white hover:border-mist-3">Download brief (.md)</a>
          <div className="rounded-button bg-surface">
            <PageChooser domain={domain} row={row} pages={pages} label="Use an existing page" />
          </div>
          <SendBrief domain={domain} clusterId={row.clusterId} sent={Boolean(row.sentAt)} />
        </div>
      </div>
    </div>
  );
}
