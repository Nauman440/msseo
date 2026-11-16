import Link from 'next/link';
import { cn } from '@/lib/tones';

export type ProjectRow = {
  id: string;
  domain: string;
  audits: number;
  latest: { id: string; createdAt: Date; overallScore: number | null; status: string } | null;
};

const scoreTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 70 ? 'bg-warn-bg text-warn-text' : 'bg-high-bg text-high-text');

/** One row per client domain (Project), newest activity first. */
export function ProjectList({ projects }: { projects: ProjectRow[] }) {
  if (!projects.length) {
    return <p className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-2">No projects yet. Run an audit and its domain becomes a project.</p>;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
      {projects.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Link href={`/projects/${p.id}`} className="block truncate font-semibold hover:text-primary-text hover:underline">
              {p.domain}
            </Link>
            <p className="text-[13px] text-ink-3 tabular">
              {p.audits} {p.audits === 1 ? 'audit' : 'audits'}
              {p.latest && ` · last ${p.latest.createdAt.toISOString().slice(0, 10)}`}
            </p>
          </div>
          {p.latest?.overallScore != null && (
            <span className={cn('rounded-pill px-2.5 py-1 text-sm font-bold tabular', scoreTone(p.latest.overallScore))}>{p.latest.overallScore}</span>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${p.id}`} className="inline-flex min-h-10 items-center rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
              History
            </Link>
            {p.latest && (
              <Link href={`/audits/${p.latest.id}`} className="inline-flex min-h-10 items-center rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
                Latest report
              </Link>
            )}
            <Link href={`/audits/new?url=${encodeURIComponent(`https://${p.domain}/`)}`} className="inline-flex min-h-10 items-center rounded-button bg-primary px-4 text-sm font-semibold text-primary-ink hover:bg-primary-hover">
              Re-audit
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
