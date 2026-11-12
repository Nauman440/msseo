/** §5.3 — pipeline step order. Each step gets its own file in this folder as it is built. */
export const PIPELINE_STEPS = [
  'preflight',
  'bot-access',
  'crawl-start',
  'crawl-wait',
  'crawl-fetch',
  'sitemap-parse',
  'normalise',
  'lighthouse',
  'gsc',
  'ai-checks',
  'rules',
  'score',
  'finalise',
] as const;

export type StepName = (typeof PIPELINE_STEPS)[number];

export type StepState = 'queued' | 'running' | 'done' | 'skipped' | 'failed';

export type AuditJobData = { auditId: string };
