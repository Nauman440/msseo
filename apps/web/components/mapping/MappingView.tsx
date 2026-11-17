import { mappingSummary, pageInventory, type MappingAction, type MappingWorkspace, type ReportPage } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { cn } from '@/lib/tones';
import { MappingRunButtons, RowEditor, StatusSelect } from './forms';
import { ACTION_LABEL } from './labels';

/**
 * Module 5 page plan (spec §16.2), the same for the team (any client) and for customers (their
 * own sites): one card per keyword topic with the page, the action and what to change.
 */
const ACTION_TONE: Record<MappingAction, string> = {
  create: 'bg-primary-chip text-primary-heading',
  merge: 'bg-high-bg text-high-text',
  expand: 'bg-amber-bg text-amber-text',
  optimise: 'bg-teal-chip text-teal-text',
  leave: 'bg-sunken text-ink-2',
};
const PAGE_TYPE: Record<string, string> = {
  home: 'homepage', service: 'service page', location: 'location page', service_location: 'service page for a city', blog_post: 'article',
  directory: 'directory listings', product: 'product page', category: 'category page',
};
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'never');

export function MappingView({ ws, pages, audience, aiAvailable }: { ws: MappingWorkspace; pages: ReportPage[]; audience: 'team' | 'customer'; aiAvailable: boolean }) {
  const sum = mappingSummary(ws);
  const inventory = pageInventory(ws, pages);
  const pageUrls = pages.map((p) => p.url);
  return (
    <div className="flex flex-col gap-6">
      <Card title="Page plan" eyebrow={`Last built: ${day(ws.builtAt)}`}>
        <p className="mb-4 text-sm text-ink-2">
          {audience === 'team'
            ? 'Each keyword topic (Module 4) gets one page: the page Google already shows for it (Search Console clicks first), else the page whose title and address match, else a new page. Built from the latest audit; free to rebuild. Hand-made choices are kept.'
            : 'One page for each topic your customers search for: the page to improve, or a new page to create, with the title, heading and links to add.'}
        </p>
        <MappingRunButtons domain={ws.domain} hasRows={ws.rows.length > 0} aiAvailable={aiAvailable} />
      </Card>

      {ws.rows.length > 0 && (
        <ul aria-label="Plan summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <li><StatTile value={String(sum.rows)} label="Topics mapped" variant="raised" /></li>
          <li><StatTile value={String(sum.newPages)} label="New pages needed" variant="raised" /></li>
          <li><StatTile value={String(sum.conflicts)} label="Pages competing" hint="Two pages for one topic" variant="raised" /></li>
          <li><StatTile value={`${sum.done}/${sum.rows}`} label="Live or verified" variant="raised" /></li>
        </ul>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="topics">
        <h2 id="topics" className="font-display text-xl font-bold">Topics and pages</h2>
        {ws.rows.length === 0 ? (
          <p className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-2">No plan yet. Research keywords and run an audit, then press “Build the page plan”.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ws.rows.map((r) => (
              <li key={r.clusterId} className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="shrink-0 rounded-pill bg-night px-2 py-0.5 text-[12px] font-bold text-mist tabular" title="Priority: value × chance to rank">
                      {r.priority}/25
                    </span>
                    <div className="min-w-0">
                      <h3 className="break-words font-display text-[17px] font-bold">{r.topic}</h3>
                      <p className="text-[13px] text-ink-3 tabular">{r.volume.toLocaleString('en-US')} searches / month</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', ACTION_TONE[r.action])}>{ACTION_LABEL[r.action]}</span>
                    <StatusSelect domain={ws.domain} row={r} />
                  </div>
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[150px_1fr]">
                  <dt className="text-ink-3">Page</dt>
                  <dd className="min-w-0">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-[13px] text-ink hover:text-primary-text hover:underline">
                        {path(r.url)}
                      </a>
                    ) : (
                      <span className="font-semibold text-primary-heading">New page needed: {PAGE_TYPE[r.newPageType ?? 'service'] ?? 'page'}</span>
                    )}
                    <span className="block text-[12px] text-ink-3">{r.reason}</span>
                  </dd>
                  <dt className="text-ink-3">Keywords</dt>
                  <dd className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{r.primaryKeyword}</span>
                    {r.secondaryKeywords.map((k) => (
                      <span key={k} className="rounded-full border border-border px-2 py-0.5 text-[12px] text-ink-2">{k}</span>
                    ))}
                  </dd>
                  <dt className="text-ink-3">Position</dt>
                  <dd className="tabular">{r.currentPosition === null ? 'Not ranking yet' : `#${r.currentPosition}`} → aim for #{r.targetPosition}</dd>
                  {r.conflicts.length > 0 && (
                    <>
                      <dt className="text-ink-3">Competing pages</dt>
                      <dd>
                        {r.conflicts.map((c) => (
                          <span key={c.url} className="block font-mono text-[13px]">
                            {path(c.url)} <span className="font-sans text-[12px] text-ink-3">({Math.round(c.share * 100)}% of this topic)</span>
                          </span>
                        ))}
                        <span className="block text-[12px] text-ink-3">Two pages for one topic split Google’s attention: merge them into the main page and redirect the other.</span>
                      </dd>
                    </>
                  )}
                  {r.linksToAdd.length > 0 && (
                    <>
                      <dt className="text-ink-3">{r.url ? 'Links to add' : 'Link to it from'}</dt>
                      <dd>
                        {r.linksToAdd.map((l) => (
                          <span key={l.from} className="block text-[13px]">
                            from <span className="font-mono">{path(l.from)}</span> with the words “{l.anchor}”
                          </span>
                        ))}
                      </dd>
                    </>
                  )}
                  {r.schemaNeeded.length > 0 && (
                    <>
                      <dt className="text-ink-3">Schema to add</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {r.schemaNeeded.map((s) => (
                          <span key={s} className="rounded-full bg-sunken px-2 py-0.5 text-[12px] font-semibold text-ink-2">{s}</span>
                        ))}
                      </dd>
                    </>
                  )}
                  {audience === 'team' && r.owner && (
                    <>
                      <dt className="text-ink-3">Owner</dt>
                      <dd>{r.owner}</dd>
                    </>
                  )}
                </dl>
                <details className="group border-t border-border pt-3">
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-primary-heading">
                    Title, heading and changes
                    {r.drafts?.approved && <span className="rounded-full bg-teal-chip px-2 py-0.5 text-[11px] font-bold text-teal-text">Approved</span>}
                  </summary>
                  <div className="pt-3">
                    <RowEditor domain={ws.domain} row={r} pages={pageUrls} audience={audience} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inventory.length > 0 && ws.rows.length > 0 && (
        <details className="rounded-panel border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center px-5 font-display text-[17px] font-bold">Page inventory ({inventory.length} pages)</summary>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="px-4 py-3 font-semibold">Page</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Words</th>
                  <th className="px-4 py-3 font-semibold">Topics</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((p) => (
                  <tr key={p.url} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="block font-mono text-[13px]">{path(p.url)}</span>
                      {p.title && <span className="block text-[12px] text-ink-3">{p.title}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">{p.pageType ? PAGE_TYPE[p.pageType] ?? p.pageType : '–'}</td>
                    <td className="px-3 py-2.5 tabular">{p.words}</td>
                    <td className="px-4 py-2.5 text-[13px]">{p.topics.length ? p.topics.join(', ') : <span className="text-ink-3">No topic yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
