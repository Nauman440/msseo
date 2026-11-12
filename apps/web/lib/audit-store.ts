import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AUDIT_STEPS, type NewAuditInput, type ReportModel, type StepId, type StepState } from '@seo/core';

/**
 * Local audit store: one JSON file per audit in <repo>/.data/audits (git-ignored).
 * Phase 1 swaps this for Prisma (Audit / AuditStep tables) behind the same functions.
 */
export type AuditRecord = {
  id: string;
  input: NewAuditInput;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  steps: { id: StepId; label: string; state: StepState; detail?: string }[];
  error?: string;
  report?: ReportModel;
  costUsd?: number;
  createdAt: string;
  finishedAt?: string;
};

const DIR = resolve(process.cwd(), '../../.data/audits');
const file = (id: string) => resolve(DIR, `${id.replace(/[^a-z0-9-]/gi, '')}.json`);

export async function createAudit(input: NewAuditInput): Promise<AuditRecord> {
  const record: AuditRecord = {
    id: randomUUID(),
    input,
    status: 'running',
    progress: 0,
    steps: AUDIT_STEPS.map((s) => ({ id: s.id, label: s.label, state: 'queued' })),
    createdAt: new Date().toISOString(),
  };
  await saveAudit(record);
  return record;
}

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
