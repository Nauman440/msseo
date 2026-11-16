import 'server-only';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NewAuditInput, ReportModel, StepId, StepState } from '@seo/core';

/**
 * File audit store: one JSON file per audit in DATA_DIR/audits (git-ignored locally).
 * Used when there is no DATABASE_URL, and read once by the database store to import
 * audits saved before the move to Postgres. Records are created by audit-store.ts.
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
  /** Team member who started it (absent before login existed, or in local development). */
  createdById?: string;
  createdAt: string;
  finishedAt?: string;
};

// DATA_DIR is set in Docker (a persistent volume); locally it is <repo>/.data.
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'audits');
const file = (id: string) => resolve(DIR, `${id.replace(/[^a-z0-9-]/gi, '')}.json`);

export async function saveAudit(record: AuditRecord): Promise<void> {
  await mkdir(DIR, { recursive: true });
  // Write-then-rename so a reader never sees a half-written file.
  const tmp = `${file(record.id)}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(record));
  await rename(tmp, file(record.id));
}

export async function getAudit(id: string): Promise<AuditRecord | null> {
  try {
    return JSON.parse(await readFile(file(id), 'utf8')) as AuditRecord;
  } catch {
    return null;
  }
}

export async function listAudits(limit = 20): Promise<AuditRecord[]> {
  try {
    const names = (await readdir(DIR)).filter((n) => n.endsWith('.json'));
    const records = await Promise.all(names.map((n) => getAudit(n.replace(/\.json$/, ''))));
    return records
      .filter((r): r is AuditRecord => r !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}
