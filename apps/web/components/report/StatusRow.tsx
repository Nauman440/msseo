import type { Audience, CheckRow, ReportModel } from '@seo/core';
import { StatusPill } from '@/components/ui/Pills';

/** Expert extras for a row: every affected URL and a CSV link (spec §8). Built once per report. */
export type RowExtras = { auditId: string; host: string; urls: Map<string, string[]> };

/** Same-site URLs as their path (the part that differs); other sites keep their host. */
function short(u: string, host: string): string {
  try {
    const url = new URL(u);
    const h = url.hostname.replace(/^www\./, '');
    return h === host ? url.pathname + url.search : h + url.pathname + url.search;
  } catch {
    return u;
  }
}

export const rowExtras = (report: ReportModel): RowExtras => ({
  auditId: report.auditId,
  host: report.project.domain.replace(/^www\./, ''),
  urls: new Map((report.issues ?? []).filter((i) => i.urls.length).map((i) => [i.ruleId, i.urls])),
});

export function StatusRow({ row, mode, extras }: { row: CheckRow; mode: Audience; extras?: RowExtras }) {
  const urls = mode === 'expert' ? extras?.urls.get(row.ruleId) : undefined;
  return (
    <li className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <StatusPill status={row.status} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-6 text-ink">
          {mode === 'expert' && <span className="mr-2 font-mono text-xs text-ink-3">{row.ruleId}</span>}
          {row.message[mode]}
        </p>
        {row.url && !(urls && urls.length > 1) && (
          <p className="mt-0.5 truncate font-mono text-xs text-primary-text" title={row.url}>
            {row.url}
          </p>
        )}
        {row.sub && <p className="mt-0.5 text-[13px] text-ink-3">{row.sub[mode]}</p>}
        {urls && urls.length > 1 && extras && (
          <details className="group mt-1.5">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-primary-text hover:underline [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
              All {urls.length.toLocaleString('en-US')} affected
            </summary>
            <ul className="mt-1 max-h-64 overflow-y-auto rounded-tile border border-border bg-sunken/40 px-3 py-2">
              {urls.map((u) => (
                <li key={u} className="break-all py-0.5 font-mono text-xs text-ink-2" title={u}>
                  {short(u, extras.host)}
                </li>
              ))}
            </ul>
            <a href={`/api/audits/${extras.auditId}/csv?rule=${encodeURIComponent(row.ruleId)}`} download className="mt-1 inline-flex min-h-10 items-center text-[13px] font-semibold text-primary-text hover:underline">
              Download CSV
            </a>
          </details>
        )}
      </div>
    </li>
  );
}
