import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { diffReports } from '@seo/core';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { ChangesSinceLast } from '@/components/project/ChangesSinceLast';
import { DeleteAuditButton } from '@/components/project/DeleteAuditButton';
import { ScoreTrend } from '@/components/project/ScoreTrend';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/tones';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ projectId: string }> };

async function load(id: string) {
  if (!process.env.DATABASE_URL) return null;
  const { getProjectHistory } = await import('@seo/db');
  return getProjectHistory(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).projectId);
  return { title: data ? data.project.domain : 'Project' };
}

const STATUS: Record<string, string> = { completed: 'Completed', failed: 'Failed', running: 'Running', queued: 'Queued', cancelled: 'Cancelled' };
const scoreTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 70 ? 'bg-warn-bg text-warn-text' : 'bg-high-bg text-high-text');
const BUTTON = 'inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover';

/** Project page (spec Phase 3): audit history, score trend and what changed since the last audit. */
export default async function ProjectPage({ params }: Props) {
  const user = await requireUser();
  const data = await load((await params).projectId);
  if (!data) notFound();
  const { project, audits, latest, previous } = data;
  const trend = audits
    .filter((a) => a.status === 'completed' && a.overallScore !== null)
    .map((a) => ({ date: a.createdAt.toISOString().slice(0, 10), score: a.overallScore!, href: `/audits/${a.id}` }));

  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Project" title={project.domain} intro={`${audits.length} ${audits.length === 1 ? 'audit' : 'audits'} since ${project.createdAt.toISOString().slice(0, 10)}.`} />
        <Link href={`/audits/new?url=${encodeURIComponent(`https://${project.domain}/`)}`} className={BUTTON}>
          Re-audit
        </Link>
      </div>

      <Card title="Score trend">
        <ScoreTrend points={trend} />
      </Card>

      <Card title="Changes since the last audit">
        {latest && previous ? (
          <ChangesSinceLast diff={diffReports(previous, latest)} />
        ) : (
          <p className="text-sm text-ink-2">Run a second audit of this site to see new, fixed and changed issues here.</p>
        )}
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-bold">Audit history</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
          {[...audits].reverse().map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold tabular">{a.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</p>
                <p className="text-[13px] text-ink-3">
                  {a.auditMode === 'deep' ? 'Deep crawl' : 'Quick audit'} · {a.pagesCrawled ?? 0} of {a.crawlLimit} pages
                  {a.gscProperty ? ' · Search Console' : ''}
                  {a.createdBy ? ` · by ${a.createdBy}` : ''}
                </p>
              </div>
              {a.overallScore !== null ? (
                <span className={cn('rounded-pill px-2.5 py-1 text-sm font-bold tabular', scoreTone(a.overallScore))}>{a.overallScore}</span>
              ) : (
                <span className="text-[13px] font-semibold text-ink-3">{STATUS[a.status] ?? a.status}</span>
              )}
              <Link href={`/audits/${a.id}`} className="inline-flex min-h-10 items-center rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
                {a.status === 'completed' ? 'Open report' : 'View'}
              </Link>
              {user.role === 'admin' && <DeleteAuditButton auditId={a.id} projectId={project.id} label={a.createdAt.toISOString().slice(0, 10)} />}
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
