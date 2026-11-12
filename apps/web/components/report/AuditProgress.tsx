'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { StepState } from '@seo/core';
import { cn } from '@/lib/tones';

type Step = { id: string; label: string; state: StepState; detail?: string };
export type ProgressSnapshot = { status: 'running' | 'completed' | 'failed'; progress: number; steps: Step[]; error?: string };

const DOT: Record<StepState, string> = {
  queued: 'border-2 border-border-strong bg-surface',
  running: 'border-2 border-primary bg-primary-soft animate-pulse',
  done: 'bg-chart-pass',
  skipped: 'bg-chart-neutral',
  failed: 'bg-chart-fail',
};

const STATE_TEXT: Record<StepState, string> = { queued: 'Waiting', running: 'In progress', done: 'Done', skipped: 'Skipped', failed: 'Failed' };

export function AuditProgress({ id, url, initial }: { id: string; url: string; initial: ProgressSnapshot }) {
  const router = useRouter();
  const [snap, setSnap] = useState(initial);

  useEffect(() => {
    if (snap.status !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/audits/${id}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as ProgressSnapshot;
        setSnap(next);
        if (next.status === 'completed') router.refresh();
      } catch {
        // transient network error: keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [id, router, snap.status]);

  const failed = snap.status === 'failed';
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{failed ? 'Audit failed' : 'Audit running'}</p>
      <h1 className="mt-2 break-all font-display text-[28px] font-bold tracking-display sm:text-[32px]">{url}</h1>

      <section className="mt-8 rounded-card border border-border bg-surface p-6 shadow-card sm:p-8" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold">{failed ? 'Stopped' : snap.status === 'completed' ? 'Finishing…' : 'Working on it'}</p>
          <p className="font-display text-2xl font-bold tabular">{snap.progress}%</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-bar bg-chart-track" role="progressbar" aria-valuenow={snap.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Audit progress">
          <div className={cn('h-full rounded-bar transition-[width] duration-700', failed ? 'bg-chart-fail' : 'bg-primary')} style={{ width: `${snap.progress}%` }} />
        </div>

        <ol className="mt-6 space-y-4">
          {snap.steps.map((s) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className={cn('mt-1 size-3 shrink-0 rounded-full', DOT[s.state])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', s.state === 'queued' ? 'text-ink-3' : 'text-ink')}>{s.label}</p>
                {s.detail && <p className="text-[13px] text-ink-3 tabular">{s.detail}</p>}
              </div>
              <span className="text-xs font-medium text-ink-3">{STATE_TEXT[s.state]}</span>
            </li>
          ))}
        </ol>

        {failed && (
          <div className="mt-6 rounded-tile border border-fail-text/20 bg-fail-bg p-4">
            <p className="text-sm font-medium text-fail-text">{snap.error ?? 'Something went wrong.'}</p>
            <Link href={`/audits/new?url=${encodeURIComponent(url)}`} className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
              Try again
            </Link>
          </div>
        )}
      </section>
      {!failed && <p className="mt-4 text-[13px] text-ink-3">You can leave this page — the audit keeps running and appears on the overview when it’s done.</p>}
    </div>
  );
}
