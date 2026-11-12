import type { ReportModel } from '@seo/core';
import { AuditLauncher } from './AuditLauncher';
import { ReportPreview } from './ReportPreview';

const SOURCES = ['DataForSEO crawl', 'PageSpeed Insights', 'Search Console (optional)'];

export function Hero({ report }: { report: ReportModel }) {
  return (
    <section className="bg-aurora relative overflow-hidden">
      <div className="bg-grid-night pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative mx-auto grid max-w-page grid-cols-1 gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12 lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70">
            <span className="size-1.5 rounded-full bg-brand" />
            Technical + on-page audit · Modules 1–2
          </p>
          <h1 className="mt-6 font-display text-[40px] font-bold leading-[1.04] tracking-display text-white sm:text-[54px]">
            Find what&apos;s holding a site back.
            <span className="mt-1 block bg-gradient-to-r from-primary-tint to-[#FFE0C7] bg-clip-text text-transparent">
              Fix it in order.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/60 sm:text-[17px]">
            Enter a client&apos;s URL. Get a health score, every technical and on-page issue ranked by
            impact, and a client-ready PDF — in under fifteen minutes.
          </p>
          <div className="mt-8">
            <AuditLauncher />
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/40">
            {SOURCES.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 7.2 5.8 10 11 4" fill="none" stroke="#FF7A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <ReportPreview report={report} />
      </div>
    </section>
  );
}
