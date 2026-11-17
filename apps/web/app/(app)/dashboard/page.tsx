import type { Metadata } from 'next';
import { AuditLauncher } from '@/components/home/AuditLauncher';
import { ProjectList } from '@/components/home/ProjectList';
import { RecentAudits } from '@/components/home/RecentAudits';
import { Container } from '@/components/landing/primitives';
import { StatTile } from '@/components/ui/StatTile';
import { isAuditActive } from '@/lib/audit-runner';
import { listAudits, listProjects, type AuditRecord } from '@/lib/audit-store';
import { dashboardStats } from '@/lib/dashboard-stats';
import type { RecentAudit } from '@/lib/home-data';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };
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

/** Team dashboard: start an audit, the numbers that matter, client websites, latest runs. */
export default async function DashboardPage() {
  const user = await requireUser();
  const [stored, projects] = await Promise.all([listAudits(500), listProjects()]);
  // Visitors' free audits from the homepage are not team work: leave them out of the numbers and the list.
  const all = stored.filter((r) => r.input.source !== 'public');
  const recent = all.slice(0, 8).map(toRow);
  const first = user.name.split(/[\s@]/)[0];

  return (
    <>
      <section className="bg-night py-10">
        <Container className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-[28px] font-bold tracking-display text-mist sm:text-[32px]">Dashboard</h1>
            <p className="mt-1 text-[15px] text-mist-3">{first ? `Hi ${first}. ` : ''}Run an audit for any client website.</p>
          </div>
          <AuditLauncher />
        </Container>
      </section>

      <Container className="flex flex-col gap-10 py-10">
        <ul aria-label="Team stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {dashboardStats(all).map((s) => (
            <li key={s.label}>
              <StatTile value={s.value} label={s.label} hint={s.hint} variant="raised" />
            </li>
          ))}
        </ul>

        {projects && (
          <section className="flex flex-col gap-4" aria-labelledby="clients">
            <h2 id="clients" className="font-display text-xl font-bold">Client websites</h2>
            <ProjectList projects={projects} />
          </section>
        )}

        {recent.length > 0 && (
          <section className="flex flex-col gap-4" aria-labelledby="recent">
            <h2 id="recent" className="font-display text-xl font-bold">Recent audits</h2>
            <RecentAudits audits={recent} />
          </section>
        )}
      </Container>
    </>
  );
}
