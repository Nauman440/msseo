'use client';

import { useTransition, useState } from 'react';
import { deleteAuditAction } from '@/app/(app)/settings/actions';

/** Admin only: deletes one audit after a confirmation. */
export function DeleteAuditButton({ auditId, projectId, label }: { auditId: string; projectId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete the audit from ${label}`}
        onClick={() => {
          if (!window.confirm(`Delete the audit from ${label}? Its report and history entry are removed for good.`)) return;
          start(async () => {
            const res = await deleteAuditAction(auditId, projectId);
            setError(res.error ?? null);
          });
        }}
        className="inline-flex min-h-10 items-center rounded-button px-3 text-sm font-semibold text-high-text hover:bg-fail-bg disabled:opacity-60"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span role="alert" className="text-[12px] text-fail-text">{error}</span>}
    </span>
  );
}
