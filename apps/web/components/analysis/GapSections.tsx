import type { CompetitorAnalysis, PageStat } from '@seo/core';
import { cn } from '@/lib/tones';

const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const TH = 'whitespace-nowrap px-2.5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-2.5';

/** 6.7 Keyword gap: searches the shortlist ranks for and the site does not (top 50). */
export function KeywordGap({ a, csvHref }: { a: CompetitorAnalysis; csvHref: string }) {
  return (
    <section aria-labelledby="gap-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gap-title" className="font-display text-xl font-bold">Searches your competitors win</h2>
          <p className="mt-1 text-sm text-ink-2">Searches a shortlisted competitor ranks for and you do not, most searched first.</p>
        </div>
        {a.keywordGap.length > 0 && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">Download CSV</a>}
      </div>
      {a.keywordGap.length ? (
        <div className="relative max-h-[480px] overflow-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={TH}>Search</th>
                <th className={cn(TH, 'text-right')}>Searches / mo</th>
                <th className={cn(TH, 'text-right')}>Difficulty</th>
                <th className={TH}>Who ranks</th>
              </tr>
            </thead>
            <tbody>
              {a.keywordGap.map((g) => (
                <tr key={g.keyword}>
                  <td className={cn(TD, 'font-semibold')}>{g.keyword}</td>
                  <td className={cn(TD, 'text-right tabular')}>{g.volume === null ? '–' : g.volume.toLocaleString('en-US')}</td>
                  <td className={cn(TD, 'text-right tabular')}>{g.difficulty ?? '–'}</td>
                  <td className={cn(TD, 'text-[13px] text-ink-2')}>{g.competitors.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-2">None found yet. The keyword gap is filled by keyword research (Keywords → Update keywords) once competitors are shortlisted.</p>
      )}
    </section>
  );
}

function PageFacts({ p }: { p: PageStat }) {
  const extra = [
    p.pageType,
    p.images !== undefined ? `${p.images} images` : '',
    p.videos ? `${p.videos} video` : '',
    p.forms !== undefined ? (p.forms ? `${p.forms} form${p.forms === 1 ? '' : 's'}` : 'no form') : '',
    p.callButtons ? 'call button' : '',
    p.trust?.length ? p.trust.join(', ') : '',
    p.price ? 'prices shown' : '',
    p.updated ? `updated ${p.updated}` : '',
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5 text-[13px] text-ink-2">
      {(p.title || p.h1) && (
        <p className="[overflow-wrap:anywhere]">
          {p.title && <>Title: <span className="text-ink">{p.title}</span></>}
          {p.h1 && p.h1 !== p.title && <> · H1: <span className="text-ink">{p.h1}</span></>}
        </p>
      )}
      <p className="tabular">
        {p.words.toLocaleString('en-US')} words · {p.headings} subheadings · FAQ {p.faq ? 'yes' : 'no'} · lists/tables {p.lists}
        {p.schema.length > 0 && ` · ${p.schema.slice(0, 3).join(', ')}`}
      </p>
      {extra.length > 0 && <p>{extra.join(' · ')}</p>}
    </div>
  );
}

/** 6.2/6.7 Content gap: for the top topics, the competitor pages that rank against yours. */
export function ContentGap({ a, csvHref }: { a: CompetitorAnalysis; csvHref: string }) {
  return (
    <section aria-labelledby="content-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="content-title" className="font-display text-xl font-bold">Their pages vs yours</h2>
          <p className="mt-1 text-sm text-ink-2">For your top topics: the competitor pages that rank on page 1, compared with your page.</p>
        </div>
        {a.contentGap.length > 0 && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">Download CSV</a>}
      </div>
      {a.contentGap.length ? (
        <ul className="flex flex-col gap-3">
          {a.contentGap.map((c) => (
            <li key={c.topic} className="flex flex-col gap-2 rounded-[14px] border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-bold">{c.topic}</h3>
                <span className="text-[13px] text-ink-2 tabular">{c.volume.toLocaleString('en-US')} searches a month · {c.yourPosition === null ? 'you are not showing' : `you rank #${c.yourPosition}`}</span>
              </div>
              <div className="rounded-[10px] bg-primary-wash px-3 py-2">
                <p className="text-sm font-semibold">You {c.you ? <span className="font-mono text-[12px] font-normal text-ink-2">{path(c.you.url)}</span> : null}</p>
                {c.you ? <PageFacts p={c.you} /> : <p className="text-[13px] text-ink-2">No page for this topic yet.</p>}
              </div>
              {c.rivals.map((r) => (
                <div key={r.url} className="px-3">
                  <p className="text-sm font-semibold">{r.domain} <span className="break-all font-mono text-[12px] font-normal text-ink-2">{path(r.url)}</span></p>
                  <PageFacts p={r} />
                </div>
              ))}
              {c.missing && c.missing.length > 0 && (
                <div className="rounded-[10px] border border-dashed border-border-strong px-3 py-2">
                  <p className="text-[13px] font-bold">Sections they have that your page does not cover</p>
                  <p className="text-[13px] text-ink-2">{c.missing.join(' · ')}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No shortlisted competitor ranks on page 1 for your top topics, or keyword topics have not been researched yet.</p>
      )}
    </section>
  );
}
