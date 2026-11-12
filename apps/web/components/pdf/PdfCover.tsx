import type { Audience, ReportModel } from '@seo/core';
import { formatDate } from '@/lib/reports';
import { Logo } from '@/components/ui/Logo';
import { ScoreGauge } from '@/components/report/ScoreGauge';

export function PdfCover({ report, mode }: { report: ReportModel; mode: Audience }) {
  const facts = [
    { label: 'Audit date', value: formatDate(report.crawledAt) },
    { label: 'Pages audited', value: report.pagesCrawled.toLocaleString('en-US') },
    { label: 'Report type', value: mode === 'client' ? 'Client summary' : 'Technical (SEO expert)' },
  ];

  return (
    <section className="pdf-cover bg-aurora relative flex flex-col text-white">
      <div className="bg-grid-night absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <div className="relative flex flex-1 flex-col px-[18mm] pb-[16mm] pt-[18mm]">
        <div className="flex items-center justify-between">
          <Logo height={60} product={null} priority />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">Confidential</span>
        </div>

        <div className="mt-[34mm]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">SEO audit report</p>
          <h1 className="mt-4 font-display text-[44px] font-bold leading-[1.04] tracking-display">
            {report.project.name}
          </h1>
          <p className="mt-3 font-mono text-sm text-white/55">{report.url}</p>
        </div>

        <div className="mt-auto grid grid-cols-[auto_1fr] items-end gap-10">
          <ScoreGauge score={report.overall.score} label={report.overall.label} size={200} dark caption="health score" />
          <div className="pb-4">
            <p className="max-w-[78mm] text-[15px] leading-7 text-white/70">
              Fixing the issues in this report is projected to raise the score to{' '}
              <strong className="font-semibold text-white">{report.overall.afterFixes}</strong>.
            </p>
          </div>
        </div>

        <dl className="mt-[14mm] grid grid-cols-3 border-t border-white/[0.12] pt-6">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-[11px] uppercase tracking-[0.1em] text-white/40">{f.label}</dt>
              <dd className="mt-1.5 text-sm font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-xs text-white/40">Prepared by {report.brand}</p>
      </div>
    </section>
  );
}
