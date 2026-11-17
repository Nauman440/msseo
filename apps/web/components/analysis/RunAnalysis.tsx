'use client';

import { useActionState } from 'react';
import { runAnalysisAction, type AnalysisState } from '@/app/analysis/actions';
import { Message, Submit } from '@/components/competitors/forms';

/** Starts a deep competitor analysis (about two minutes). */
export function RunAnalysis({ domain, again, disabledReason }: { domain: string; again: boolean; disabledReason?: string | null }) {
  const [state, action] = useActionState<AnalysisState>(runAnalysisAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-1.5">
      {disabledReason ? (
        <p className="text-sm font-semibold text-ink-2">{disabledReason}</p>
      ) : (
        <form action={action}>
          <Submit label={again ? 'Run the analysis again' : 'Run the analysis'} busy="Analysing… (about two minutes)" />
        </form>
      )}
      <Message state={state} />
    </div>
  );
}
