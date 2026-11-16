'use server';

import { redirect } from 'next/navigation';
import { ConfigError, retryAudit } from '@/lib/audit-runner';
import { requireUser } from '@/lib/session';

export type RetryState = { error?: string };

/** Re-runs a failed audit in place (spec §5.2 "Retry"). */
export async function retryAuditAction(auditId: string): Promise<RetryState> {
  await requireUser();
  try {
    if (!(await retryAudit(auditId))) return { error: 'This audit is not in a failed state any more. Refresh the page.' };
  } catch (err) {
    return { error: err instanceof ConfigError ? err.message : 'Could not restart the audit.' };
  }
  redirect(`/audits/${auditId}?retry=${Date.now()}`);
}
