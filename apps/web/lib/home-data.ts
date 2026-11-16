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
  /** Set when the row can be opened (real audits and the demo). */
  href?: string;
};

/** The sample report, always listed so it is one click away. Fictional domain. */
export const demoAudit: RecentAudit = {
  id: 'demo',
  project: 'Sample report · Summit Air Heating & Cooling',
  domain: 'summitairhvac.com',
  audience: 'client',
  score: 58,
  status: 'completed',
  pages: 50,
  date: '2026-11-10',
  href: '/audits/demo',
};

export type ModuleStatus = 'live' | 'building' | 'planned';

export const modules: { n: number; name: string; status: ModuleStatus }[] = [
  { n: 1, name: 'Technical SEO', status: 'building' },
  { n: 2, name: 'On-page SEO', status: 'building' },
  { n: 3, name: 'Competitor identification', status: 'planned' },
  { n: 4, name: 'Keyword research', status: 'planned' },
  { n: 5, name: 'Keyword to page mapping', status: 'planned' },
  { n: 6, name: 'Deep competitor analysis', status: 'planned' },
  { n: 7, name: 'Content audit and gaps', status: 'planned' },
  { n: 8, name: 'Backlink audit', status: 'planned' },
  { n: 9, name: 'Local SEO audit', status: 'planned' },
  { n: 10, name: 'AEO / AI search audit', status: 'planned' },
  { n: 11, name: 'Tracking and conversion', status: 'planned' },
  { n: 12, name: 'Prioritisation and action plan', status: 'planned' },
  { n: 13, name: 'Reporting and monitoring', status: 'planned' },
];
