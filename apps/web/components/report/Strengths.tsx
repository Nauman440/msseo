import { auditedPages, reportStrengths, type Audience, type ReportModel } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { cn, TONE_SOFT } from '@/lib/tones';

/**
 * "What's working well" (passed checks that matter) and "Pages audited" (every page checked, its type,
 * words and issues), on the report screens and in the PDF. No md:/lg: classes (PDF print width).
 */
export function WorkingWell({ report, mode, className }: { report: ReportModel; mode: Audience; className?: string }) {
  const list = reportStrengths(report, mode === 'expert' ? 12 : 8);
  if (!list.length) return null;
  return (
    <Card title="What’s working well" className={cn('pdf-avoid', className)}>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {list.map((s) => (
          <li key={s.ruleId} className="flex items-start gap-2.5 text-[14px] leading-snug">
            <span aria-hidden className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', TONE_SOFT.pass)}>✓</span>
            <span>
              {mode === 'expert' && <span className="mr-1.5 font-mono text-[12px] text-ink-3">{s.ruleId}</span>}
              {s.message[mode]}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const TH = 'border-b border-border px-2 py-2 text-left text-[12px] font-bold uppercase tracking-[0.04em] text-ink-2';
const TD = 'border-b border-border px-2 py-2 align-top';

function PagesTable({ report, mode }: { report: ReportModel; mode: Audience }) {
  const pages = auditedPages(report);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13.5px]">
        <thead>
          <tr>
            <th className={TH}>Page</th>
            <th className={TH}>Type</th>
            <th className={cn(TH, 'text-right')}>Words</th>
            <th className={cn(TH, 'text-right')}>Issues</th>
            <th className={TH}>Main issue</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.url} className="pdf-avoid">
              <td className={cn(TD, 'break-all font-mono text-[12.5px]')}>{p.path}</td>
              <td className={TD}>{p.type}</td>
              <td className={cn(TD, 'text-right tabular')}>{p.words.toLocaleString('en-US')}</td>
              <td className={cn(TD, 'text-right font-bold tabular', p.issues ? 'text-high-strong' : 'text-pass-text')}>{p.issues}</td>
              <td className={cn(TD, 'text-ink-2')}>{p.topIssue ? p.topIssue[mode] : 'No issues found'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** On screen: folded so the report stays short. */
export function PagesAudited({ report, mode }: { report: ReportModel; mode: Audience }) {
  if (!report.pages?.length) return null;
  return (
    <details className="group rounded-card border border-border bg-surface px-6 py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-lg font-bold">Pages audited ({report.pages.length})</span>
        <span className="text-sm font-semibold text-primary-heading underline">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="mt-4">
        <PagesTable report={report} mode={mode} />
      </div>
    </details>
  );
}

/** In the PDF: always open. */
export function PdfPagesAudited({ report, mode }: { report: ReportModel; mode: Audience }) {
  if (!report.pages?.length) return null;
  return (
    <Card title={`Pages audited (${report.pages.length})`}>
      <PagesTable report={report} mode={mode} />
    </Card>
  );
}
