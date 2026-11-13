import { sampleReport } from '@seo/core';
import { Hero } from '@/components/home/Hero';
import { RecentAudits } from '@/components/home/RecentAudits';
import { CategoryGrid, ModuleRoadmap } from '@/components/home/Coverage';
import { StatTile } from '@/components/ui/StatTile';
import { modules, recentAudits, teamStats, type RecentAudit } from '@/lib/home-data';
import { listAudits, type AuditRecord } from '@/lib/audit-store';

export const dynamic = 'force-dynamic';

function toRow(r: AuditRecord): RecentAudit {
  const host = new URL(r.input.url).hostname.replace(/^www\./, '');
  return {
    id: r.id,
    project: host,
    domain: r.input.url,
    audience: r.input.audience,
    score: r.report?.overall.score ?? null,
    status: r.status,
    progress: r.progress,
    pages: r.report?.pagesCrawled ?? 0,
    date: r.createdAt.slice(0, 10),
    href: `/audits/${r.id}`,
  };
}

function SectionHeading({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 font-display text-[26px] font-bold tracking-display sm:text-[30px]">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export default async function HomePage() {
  const real = (await listAudits(10)).map(toRow);
  // Real audits first; the demo row stays so the sample report is always one click away.
  const rows = real.length ? [...real, recentAudits[0]!] : recentAudits;
  return (
    <>
      <Hero report={sampleReport} />

      <div className="mx-auto max-w-page px-4 sm:px-6">
        <section aria-label="Team stats" className="relative z-10 -mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {teamStats.map((s) => (
            <StatTile key={s.label} value={s.value} label={s.label} hint={s.hint} variant="raised" />
          ))}
        </section>

        <section className="pt-16">
          <SectionHeading
            eyebrow="Recent audits"
            title="Latest runs across your projects"
            aside={<p className="text-[13px] text-ink-3">{real.length ? 'Your audits, plus the sample report' : 'Sample data — run an audit to see yours here'}</p>}
          />
          <RecentAudits audits={rows} />
        </section>

        <section className="pt-20">
          <SectionHeading eyebrow="What every audit checks" title="Seven categories, one health score" />
          <CategoryGrid />
        </section>

        <section className="pb-24 pt-20">
          <SectionHeading eyebrow="Roadmap" title="Thirteen modules, built in order" />
          <ModuleRoadmap modules={modules} />
        </section>
      </div>
    </>
  );
}
