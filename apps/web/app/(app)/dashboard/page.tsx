import { Container, SectionHeader } from '@/components/landing/primitives';
import { CategoryGrid, ModuleRoadmap } from '@/components/home/Coverage';
import { Hero } from '@/components/home/Hero';
import { ProjectList } from '@/components/home/ProjectList';
import { RecentAudits } from '@/components/home/RecentAudits';
import { isAuditActive } from '@/lib/audit-runner';
import { listAudits, listProjects, type AuditRecord } from '@/lib/audit-store';
import { dashboardStats } from '@/lib/dashboard-stats';
import { demoAudit, modules, type RecentAudit } from '@/lib/home-data';

export const dynamic = 'force-dynamic';

function toRow(r: AuditRecord): RecentAudit {
  const host = new URL(r.input.url).hostname.replace(/^www\./, '');
  return {
    id: r.id,
    project: host,
    domain: r.input.url,
    audience: r.input.audience,
    score: r.report?.overall.score ?? null,
    // A "running" audit no process is working on was interrupted by a restart.
    status: r.status === 'running' && !isAuditActive(r.id) ? 'failed' : r.status,
    progress: r.progress,
    pages: r.report?.pagesCrawled ?? 0,
    date: r.createdAt.slice(0, 10),
    href: `/audits/${r.id}`,
  };
}

/** Team dashboard, styled like the public landing page (navy hero, canvas sections, white panels). */
export default async function DashboardPage() {
  const [all, projects] = await Promise.all([listAudits(500), listProjects()]);
  const rows = [...all.slice(0, 10).map(toRow), demoAudit];

  return (
    <>
      <Hero stats={dashboardStats(all)} />

      <Container className="flex flex-col gap-16 py-16">
        {projects && (
          <section className="flex flex-col gap-6">
            <SectionHeader align="left" eyebrow="Projects" title="Client websites" intro="One project per domain, created by its first audit." />
            <ProjectList projects={projects} />
          </section>
        )}

        <section className="flex flex-col gap-6">
          <SectionHeader
            align="left"
            eyebrow="Recent audits"
            title="Latest runs"
            intro={all.length ? 'Your newest audits, plus the sample report.' : 'Run an audit to see it here. The sample report is always available.'}
          />
          <RecentAudits audits={rows} />
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader align="left" eyebrow="What every audit checks" title="Seven categories, one health score" />
          <CategoryGrid />
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader align="left" eyebrow="Roadmap" title="Thirteen modules, built in order" />
          <ModuleRoadmap modules={modules} />
        </section>
      </Container>
    </>
  );
}
