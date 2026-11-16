import type { NewAuditInput } from '../audit-input';
import type { HttpLog } from '../providers/http';
import type { ReportModel } from '../types';
import { AUDIT_STEPS, runAudit, type AuditEnv, type StepId, type StepState } from './run';

/**
 * A stored audit: what the web app shows and what the worker updates. Persisted as a
 * Postgres row (packages/db) or, without a database, a JSON file (apps/web).
 */
export type AuditRecord = {
  id: string;
  input: NewAuditInput;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  steps: { id: StepId; label: string; state: StepState; detail?: string; startedAt?: string; finishedAt?: string }[];
  error?: string;
  report?: ReportModel;
  costUsd?: number;
  /** API calls per provider (and OpenAI tokens) for cost tracking; written to ApiUsage. */
  usage?: ApiUsageEntry[];
  /** Team member who started it (absent before login existed, or in local development). */
  createdById?: string;
  createdAt: string;
  finishedAt?: string;
};

/** One usage line: `units` calls (endpoint "calls") or OpenAI tokens (endpoint "tokens"). */
export type ApiUsageEntry = { provider: string; endpoint: 'calls' | 'tokens'; units: number; costUsd?: number };

/** Paid or quota-limited providers worth tracking (requests to the audited site itself are not). */
const TRACKED = new Set(['dataforseo', 'pagespeed', 'gsc', 'gsc-inspect', 'openai']);

const freshSteps = (): AuditRecord['steps'] => AUDIT_STEPS.map((s) => ({ id: s.id, label: s.label, state: 'queued' as StepState }));

export function newAuditRecord(input: NewAuditInput, createdById?: string | null): AuditRecord {
  return {
    // Web Crypto: available in Node 20+ and browsers, so core stays free of node: imports.
    id: globalThis.crypto.randomUUID(),
    input,
    ...(createdById ? { createdById } : {}),
    status: 'running',
    progress: 0,
    steps: freshSteps(),
    createdAt: new Date().toISOString(),
  };
}

/** Network failures carry the real reason in `cause` (Node's fetch only says "fetch failed"). */
function networkReason(err: unknown): string | null {
  const cause = (err as { cause?: { code?: string; hostname?: string } } | null)?.cause;
  switch (cause?.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `The website address could not be found${cause.hostname ? ` (${cause.hostname})` : ''}: the domain has no DNS record. Check the spelling, or whether the domain has expired.`;
    case 'ECONNREFUSED':
      return 'The website refused the connection. Check that the site is online.';
    case 'ECONNRESET':
    case 'UND_ERR_SOCKET':
      return 'The website closed the connection. A firewall may be blocking automated requests.';
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return 'The website did not answer in time. Check that it is online, then try again.';
    case 'CERT_HAS_EXPIRED':
      return "The website's security certificate has expired, so it cannot be checked securely.";
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return "The website's security certificate is not valid for this address.";
    default:
      return null;
  }
}

/** Turns provider errors into a sentence the team can act on. */
export function friendlyError(err: unknown): string {
  const network = networkReason(err);
  if (network) return network;
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|unauthori|40100|40101/i.test(msg)) return 'DataForSEO rejected the login. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (use the API password, not the website password).';
  if (/402|40200|balance|insufficient/i.test(msg)) return 'DataForSEO account balance is too low to run this audit.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) return `Could not reach a service: ${msg}`;
  return msg;
}

/**
 * Runs an audit end to end and keeps `record` saved as it goes: step progress, the
 * finished report (shown at once), then the AI recommendations when they arrive.
 * Never throws for audit problems: failures are saved on the record. Used by the web
 * app's in-process runner and by apps/worker, so both behave identically.
 */
export async function executeAudit(record: AuditRecord, env: AuditEnv, save: (r: AuditRecord) => Promise<void>): Promise<void> {
  // A retried job (worker restarted mid-run) starts clean.
  Object.assign(record, { status: 'running', progress: 0, steps: freshSteps(), error: undefined, report: undefined, finishedAt: undefined, usage: undefined });

  // Count API calls per provider (every attempt, since retries are billed too).
  const calls = new Map<string, number>();
  let cost: number | undefined;
  let tokens = 0;
  const log: HttpLog = (e) => {
    if (TRACKED.has(e.provider)) calls.set(e.provider, (calls.get(e.provider) ?? 0) + 1);
    env.log?.(e);
  };
  const usage = (): ApiUsageEntry[] => [
    ...[...calls].map(([provider, units]) => ({ provider, endpoint: 'calls' as const, units, ...(provider === 'dataforseo' && cost !== undefined ? { costUsd: cost } : {}) })),
    ...(tokens ? [{ provider: 'openai', endpoint: 'tokens' as const, units: tokens }] : []),
  ];

  // Progress writes are serialised so they never overwrite each other out of order.
  let chain = save(record);
  const update = (mutate: (r: AuditRecord) => void) => {
    chain = chain.then(() => {
      mutate(record);
      return save(record);
    });
    return chain;
  };

  try {
    const { report, cost: crawlCost, finishAi } = await runAudit(record.id, record.input, { ...env, log }, (u) =>
      update((r) => {
        r.progress = Math.max(r.progress, u.progress);
        const step = r.steps.find((s) => s.id === u.step);
        if (!step) return;
        const now = new Date().toISOString();
        step.startedAt ??= now;
        if (u.state !== 'running' && u.state !== 'queued') step.finishedAt = now;
        Object.assign(step, { state: u.state, detail: u.detail });
      }),
    );
    await update((r) => {
      const finishedAt = new Date().toISOString();
      const durationSeconds = Math.round((Date.parse(finishedAt) - Date.parse(r.createdAt)) / 1000);
      cost = crawlCost;
      Object.assign(r, { status: 'completed', progress: 100, report: { ...report, durationSeconds }, costUsd: crawlCost, finishedAt, usage: usage() });
    });
    if (!finishAi) return;
    const result = await finishAi();
    tokens = result.tokens;
    await update((r) => {
      if (r.report) r.report = { ...r.report, ...(result.ai ? { ai: result.ai } : {}), aiPending: false };
      r.usage = usage();
    });
  } catch (err) {
    await update((r) => {
      const step = r.steps.find((s) => s.state === 'running');
      if (step) step.state = 'failed';
      Object.assign(r, { status: 'failed', error: friendlyError(err), finishedAt: new Date().toISOString(), usage: usage() });
    });
  }
}
