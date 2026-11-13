import 'server-only';
import { buildSummary, sampleReport, type Audience, type ReportModel } from '@seo/core';
import { getAuditStatus } from './audit-runner';
import { listAudits, type AuditRecord } from './audit-store';

export type AuditView =
  | { kind: 'report'; report: ReportModel }
  | { kind: 'progress'; record: AuditRecord }
  | null;

/** Demo report, a finished audit's report, or the record of an audit still running/failed. */
export async function getAuditView(auditId: string): Promise<AuditView> {
  if (auditId === 'demo') return { kind: 'report', report: sampleReport };
  const record = await getAuditStatus(auditId);
  if (!record) return null;
  if (record.status === 'completed' && record.report) {
    // Audits saved before durations were recorded: derive it from the record.
    const durationSeconds =
      record.report.durationSeconds ?? (record.finishedAt ? Math.round((Date.parse(record.finishedAt) - Date.parse(record.createdAt)) / 1000) : undefined);
    return { kind: 'report', report: { ...record.report, durationSeconds } };
  }
  return { kind: 'progress', record };
}

/** Median run time of past completed audits with the same page limit, or null if there are none. */
export async function typicalDurationSeconds(pageLimit: number): Promise<{ seconds: number; samples: number } | null> {
  const times = (await listAudits(100))
    .filter((r) => r.status === 'completed' && r.finishedAt && r.input.pageLimit === pageLimit)
    .map((r) => (Date.parse(r.finishedAt!) - Date.parse(r.createdAt)) / 1000)
    .sort((a, b) => a - b);
  if (times.length === 0) return null;
  return { seconds: Math.round(times[Math.floor(times.length / 2)]!), samples: times.length };
}

export async function getReport(auditId: string): Promise<ReportModel | null> {
  const view = await getAuditView(auditId);
  return view?.kind === 'report' ? view.report : null;
}

export function parseMode(value: string | string[] | undefined, fallback: Audience): Audience {
  return value === 'expert' || value === 'client' ? value : fallback;
}

export function reportSummary(report: ReportModel) {
  return buildSummary(report);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}
