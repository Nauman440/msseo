import { Check } from '@/components/landing/icons';
import { Container } from '@/components/landing/primitives';
import { SampleScore } from '@/components/landing/SampleScore';
import type { DashboardStat } from '@/lib/dashboard-stats';
import { AuditLauncher } from './AuditLauncher';

const SOURCES = ['DataForSEO live checks', 'PageSpeed Insights', 'Search Console (optional)'];

/** Dashboard hero, in the landing page's style: flat navy, chip, Sora headline, orange accents. */
export function Hero({ stats }: { stats: DashboardStat[] }) {
  return (
    <section className="bg-night pb-14 pt-12 sm:pt-16">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-wrap items-center gap-12">
          <div className="flex min-w-0 flex-[1.15_1_300px] flex-col gap-[22px]">
            <span className="self-start rounded-full bg-night-3 px-3.5 py-1.5 text-[13px] font-bold text-primary-tint">Technical + on-page audit · Modules 1–2</span>
            <h1 className="font-display text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-mist sm:text-[46px]">
              Find what&apos;s holding a site back. <span className="text-primary-tint">Fix it in order.</span>
            </h1>
            <p className="max-w-[580px] text-[17px] leading-[1.6] text-mist-3">
              Enter a client&apos;s website. Get a health score, every technical and on-page issue ranked by impact, and a client-ready PDF in about a minute.
            </p>
            <AuditLauncher />
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-mist-3">
              {SOURCES.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <Check tone="tick" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 flex-[0.9_1_300px]">
            <SampleScore />
          </div>
        </div>
        <ul aria-label="Team stats" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {stats.map((s) => (
            <li key={s.label} className="rounded-[14px] border border-night-line px-[18px] py-4">
              <span className="font-display text-[26px] font-extrabold leading-[1.1] text-primary tabular sm:text-[28px]">{s.value}</span>
              <p className="mt-1.5 text-sm font-semibold text-mist-2">{s.label}</p>
              <p className="mt-0.5 text-[13px] text-mist-3">{s.hint}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
