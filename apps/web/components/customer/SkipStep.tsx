'use client';

import { useTransition } from 'react';
import { skipJourneyStepAction } from '@/app/(customer)/my/actions';

/** "Skip for now" on the two connection steps of the journey. */
export function SkipStep({ domain, step }: { domain: string; step: 'google' | 'website' }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => skipJourneyStepAction(domain, step))}
      className="min-h-11 px-2 text-sm font-semibold text-ink-2 underline hover:text-ink disabled:opacity-60"
    >
      {pending ? 'Skipping…' : 'Skip for now'}
    </button>
  );
}
