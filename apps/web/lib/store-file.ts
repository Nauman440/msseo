import 'server-only';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AuditRecord } from '@seo/core';

/**
 * File audit store: one JSON file per audit in DATA_DIR/audits (git-ignored locally).
 * Used when there is no DATABASE_URL, and read once by the database store to import
 * audits saved before the move to Postgres. Records are created by audit-store.ts.
 */
export type { AuditRecord } from '@seo/core';

// DATA_DIR is set in Docker (a persistent volume); locally it is <repo>/.data.
const DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), '../../.data'), 'audits');
const file = (id: string) => resolve(DIR, `${id.replace(/[^a-z0-9-]/gi, '')}.json`);

let seq = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function saveAudit(record: AuditRecord): Promise<void> {
  await mkdir(DIR, { recursive: true });
  // Write-then-rename so a reader never sees a half-written file. Each save gets its own
  // temp file: two saves of one audit can overlap (e.g. a retry and its first progress write).
  const tmp = `${file(record.id)}.${process.pid}.${++seq}.tmp`;
  await writeFile(tmp, JSON.stringify(record));
  // Windows refuses to replace a file another request is reading (EPERM/EBUSY): retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file(record.id));
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 8 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await sleep(25 * (attempt + 1));
    }
  }
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
