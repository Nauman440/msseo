import Link from 'next/link';
import { cn } from '@/lib/tones';

export type ProjectRow = {
  id: string;
  domain: string;
  audits: number;
  latest: { id: string; createdAt: Date; overallScore: number | null; status: string } | null;
};

const scoreTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 70 ? 'bg-warn-bg text-warn-text' : 'bg-high-bg text-high-text');
const TOOL = 'inline-flex min-h-10 items-center px-1 text-sm font-semibold text-ink-2 hover:text-primary-text hover:underline';

/** One row per client domain (Project), newest activity first. The domain opens its audit history. */
export function ProjectList({ projects }: { projects: ProjectRow[] }) {
  if (!projects.length) {
    return <p className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-2">No client websites yet. Run an audit and its website appears here.</p>;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
      {projects.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
          {p.latest?.overallScore != null ? (
            <span className={cn('inline-flex min-w-11 justify-center rounded-pill px-2 py-1 text-sm font-bold tabular', scoreTone(p.latest.overallScore))} title="Latest health score">
              {p.latest.overallScore}
            </span>
          ) : (
            <span className="inline-flex min-w-11 justify-center text-sm text-ink-3" title="No score yet">–</span>
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/projects/${p.id}`} className="block truncate font-semibold hover:text-primary-text hover:underline">
              {p.domain}
            </Link>
            <p className="text-[13px] text-ink-3 tabular">
              {p.audits} {p.audits === 1 ? 'audit' : 'audits'}
              {p.latest && ` · last ${p.latest.createdAt.toISOString().slice(0, 10)}`}
            </p>
          </div>
          <nav aria-label={`Tools for ${p.domain}`} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {p.latest && (
              <Link href={`/audits/${p.latest.id}`} className={TOOL}>
                Report
              </Link>
            )}
            <Link href={`/keywords/${p.domain}`} className={TOOL}>
              Keywords
            </Link>
            <Link href={`/keywords/${p.domain}?view=mapping`} className={TOOL}>
              Page mapping
            </Link>
            <Link href={`/action-plan/${p.domain}`} className={TOOL}>
              Actions
            </Link>
            <Link href={`/competitors/${p.domain}`} className={TOOL}>
              Competitors
            </Link>
            <Link href={`/audits/new?url=${encodeURIComponent(`https://${p.domain}/`)}`} className="inline-flex min-h-10 items-center rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
              Re-audit
            </Link>
          </nav>
        </li>
      ))}
    </ul>
  );
}
