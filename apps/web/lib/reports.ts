import 'server-only';
import { buildSummary, sampleReport, type Audience, type ReportModel } from '@seo/core';
import { getAuditStatus } from './audit-runner';
import type { AuditRecord } from './audit-store';

export type AuditView =
  | { kind: 'report'; report: ReportModel }
  | { kind: 'progress'; record: AuditRecord }
  | null;

/** Demo report, a finished audit's report, or the record of an audit still running/failed. */
export async function getAuditView(auditId: string): Promise<AuditView> {
  if (auditId === 'demo') return { kind: 'report', report: sampleReport };
  const record = await getAuditStatus(auditId);
  if (!record) return null;
  if (record.status === 'completed' && record.report) return { kind: 'report', report: record.report };
  return { kind: 'progress', record };
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
