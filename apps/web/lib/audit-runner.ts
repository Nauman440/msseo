import 'server-only';
import { runAudit, type NewAuditInput } from '@seo/core';
import { createAudit, getAudit, saveAudit, type AuditRecord } from './audit-store';
import { providerConfig } from './providers-config';

/**
 * Local runner: audits run inside the web process (no Redis needed). With REDIS_URL
 * set, Phase 1 enqueues a BullMQ job here instead and apps/worker runs the same runAudit().
 */
const running = ((globalThis as { __auditJobs?: Set<string> }).__auditJobs ??= new Set<string>());

export class ConfigError extends Error {}

export async function startAudit(input: NewAuditInput): Promise<AuditRecord> {
  const { env } = providerConfig();
  if (!env) throw new ConfigError('DataForSEO login and password are missing from .env.');

  const record = await createAudit(input);
  running.add(record.id);

  // Progress writes are serialised so they never overwrite each other out of order.
  let chain = Promise.resolve();
  const update = (mutate: (r: AuditRecord) => void) => {
    chain = chain.then(async () => {
      mutate(record);
      await saveAudit(record);
    });
    return chain;
  };

  void runAudit(record.id, input, env, (u) =>
    update((r) => {
      r.progress = Math.max(r.progress, u.progress);
      const step = r.steps.find((s) => s.id === u.step);
      if (step) Object.assign(step, { state: u.state, detail: u.detail });
    }),
  )
    .then(({ report, cost }) =>
      update((r) => {
        Object.assign(r, { status: 'completed', progress: 100, report, costUsd: cost, finishedAt: new Date().toISOString() });
      }),
    )
    .catch((err: unknown) =>
      update((r) => {
        const step = r.steps.find((s) => s.state === 'running');
        if (step) step.state = 'failed';
        Object.assign(r, { status: 'failed', error: friendlyError(err), finishedAt: new Date().toISOString() });
      }),
    )
    .finally(() => running.delete(record.id));

  return record;
}

/** A running audit whose job is gone (server restarted) is reported as interrupted. */
export async function getAuditStatus(id: string): Promise<AuditRecord | null> {
  const record = await getAudit(id);
  if (record?.status === 'running' && !running.has(id)) {
    record.status = 'failed';
    record.error = 'The audit was interrupted (the app restarted). Please run it again.';
    await saveAudit(record);
  }
  return record;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|unauthori|40100|40101/i.test(msg)) return 'DataForSEO rejected the login. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env (use the API password, not the website password).';
  if (/402|40200|balance|insufficient/i.test(msg)) return 'DataForSEO account balance is too low to run this audit.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) return `Could not reach a service: ${msg}`;
  return msg;
}
