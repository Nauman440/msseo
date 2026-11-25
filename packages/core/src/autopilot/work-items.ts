import type { WpChangeType, WpTarget } from '../providers/wordpress';

/**
 * WordPress autopilot, phase 3: a plan task becomes one work item per exact change (one page, one
 * value). Work items are what the scheduler (phase 4) applies through the Connector plugin.
 *
 * Status:
 *  - draft: the exact change is ready and passed the quality gate.
 *  - keep: the current value already passes the rules, so nothing is changed (KEEP rule).
 *  - needs_human: the plugin cannot make it on this site (e.g. a Bricks page needs a new section),
 *    or the draft failed the quality gate twice; `reason` says why, `newValue` holds the draft if any.
 *  - skipped: nothing to do (e.g. the phrase is not on the page, the schema is already printed).
 *  - team / client / developer: not a website change; a person does it (phase 5 notifies them).
 *  - scheduled / applied / verified / failed / rolled_back: set by the scheduler (phase 4).
 */
export type WorkItemStatus =
  | 'draft' | 'keep' | 'needs_human' | 'skipped' | 'team' | 'client' | 'developer'
  | 'scheduled' | 'applied' | 'verified' | 'failed' | 'rolled_back';

/** Changes MS SCORE makes itself, outside the website (Search Console, monitoring). */
export type InternalChangeType = 'gsc_sitemap_submit' | 'ai_visibility_check' | 'weekly_page_check';

export type WorkItem = {
  /** Stable change id sent to the plugin (the same change always gets the same id). */
  id: string;
  accountId: string;
  domain: string;
  /** The plan action (ActionItem.id) and AI-plan task id it came from. */
  actionId: string;
  taskId: string | null;
  type: WpChangeType | InternalChangeType | 'manual';
  target: WpTarget | null;
  url: string | null;
  /** Owner words, e.g. "Title tag · About". */
  label: string;
  before: unknown;
  newValue: unknown;
  status: WorkItemStatus;
  reason: string | null;
  /** Higher first. critical 40, high 30, medium 20, low 10, + plan priority. */
  priority: number;
  month: number;
  week: number;
  /** Work item ids that must be applied first. */
  dependsOn: string[];
  createdAt: string;
  scheduledFor: string | null;
  appliedAt: string | null;
  verifiedAt: string | null;
  attempts: number;
};

/** FNV-1a 64-bit as hex (browser-safe, no node:crypto). */
function fnv64(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Stable change id: the same domain, task, type, target and value always give the same id. */
export function workItemId(domain: string, actionId: string, type: string, target: WpTarget | null, value: unknown): string {
  return `ms-${fnv64([domain, actionId, type, JSON.stringify(target), JSON.stringify(value)].join('|'))}`;
}

const SEVERITY_POINTS: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10 };
export function itemPriority(severity: string, planPriority: number): number {
  return (SEVERITY_POINTS[severity] ?? 10) + Math.min(25, Math.max(0, planPriority));
}
