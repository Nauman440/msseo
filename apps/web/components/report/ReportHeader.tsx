import Link from 'next/link';
import type { Audience, ReportModel } from '@seo/core';
import { formatDate } from '@/lib/reports';
import { cn } from '@/lib/tones';
import { ButtonLink } from '@/components/ui/Button';

function ModeSwitch({ auditId, mode }: { auditId: string; mode: Audience }) {
  const options: { value: Audience; label: string }[] = [
    { value: 'client', label: 'Client' },
    { value: 'expert', label: 'SEO expert' },
  ];
  return (
    <nav aria-label="Report audience" className="inline-flex rounded-full border border-border bg-sunken p-1">
      {options.map((o) => (
        <Link
          key={o.value}
          href={`/audits/${auditId}?mode=${o.value}`}
          aria-current={mode === o.value ? 'page' : undefined}
          scroll={false}
          className={cn(
            'rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors',
            mode === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export function ReportHeader({ report, mode }: { report: ReportModel; mode: Audience }) {
  const meta = [
    { label: 'URL', value: report.url, mono: true },
    { label: 'Pages crawled', value: `${report.pagesCrawled.toLocaleString('en-US')} of ${report.crawlLimit.toLocaleString('en-US')}` },
    { label: 'Crawled', value: formatDate(report.crawledAt) },
    { label: 'Search Console', value: report.gscProperty ?? 'Not used' },
  ];

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-3">
              <Link href="/" className="hover:text-ink">Audits</Link>
              <span className="mx-2">/</span>
              {report.project.name}
            </p>
            <h1 className="mt-2 font-display text-[30px] font-bold tracking-display sm:text-[36px]">
              {report.project.domain}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ModeSwitch auditId={report.auditId} mode={mode} />
            <ButtonLink href={`/audits/${report.auditId}/print?mode=${mode}`} variant="primary" className="min-h-10">
              Download PDF
            </ButtonLink>
            <button
              type="button"
              disabled
              title="Available once the audit pipeline is connected (Phase 1)"
              className="inline-flex min-h-10 items-center rounded-full border border-border-strong px-5 text-sm font-semibold text-ink-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Re-run audit
            </button>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:flex sm:flex-wrap sm:gap-x-8">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-ink-3">{m.label}</dt>
              <dd className={cn('mt-0.5 truncate font-medium text-ink', m.mono && 'font-mono text-[12.5px]')}>{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
