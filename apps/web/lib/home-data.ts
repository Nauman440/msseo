import type { Audience } from '@seo/core';

/** A row in the dashboard's "Recent audits" list. */
export type RecentAudit = {
  id: string;
  project: string;
  domain: string;
  audience: Audience;
  score: number | null;
  status: 'completed' | 'running' | 'failed';
  progress?: number;
  pages: number;
  date: string;
  /** Set when the row can be opened. */
  href?: string;
};
