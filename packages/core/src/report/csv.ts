import type { ReportModel } from '../types';

/**
 * Expert CSV export (spec §8): one row per affected URL (or one row for an issue without
 * URLs), for one issue (`ruleId`) or every issue. RFC 4180 quoting; a leading quote
 * guard stops spreadsheet apps from running cell text that starts with = + - @.
 */
export const csvCell = (v: string | number | undefined) => {
  let s = v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function issuesToCsv(report: ReportModel, ruleId?: string): string | null {
  const issues = (report.issues ?? []).filter((i) => !ruleId || i.ruleId === ruleId);
  if (ruleId && !issues.length) return null;
  const header = ['rule_id', 'check', 'severity', 'status', 'affected', 'of', 'url', 'finding', 'how_to_fix'];
  const rows = issues.flatMap((i) => {
    const base = [i.ruleId, i.title.expert, i.severity, i.status, i.affectedCount, i.applicableCount];
    const tail = [i.message.expert, i.fix.expert];
    return (i.urls.length ? i.urls : ['']).map((url) => [...base, url, ...tail]);
  });
  // BOM so Excel opens UTF-8 (e.g. "→", "≥") correctly.
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
