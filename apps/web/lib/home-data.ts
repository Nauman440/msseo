import type { Audience } from '@seo/core';

/**
 * Sample rows for the overview until the Audit/Project tables are wired up (Phase 1).
 * Domains are fictional.
 */
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
};

export const recentAudits: RecentAudit[] = [
  { id: 'demo', project: 'Summit Air Heating & Cooling', domain: 'summitairhvac.com', audience: 'client', score: 58, status: 'completed', pages: 50, date: '2026-11-10' },
  { id: 'a2', project: 'Brightline Plumbing', domain: 'brightlineplumbing.co', audience: 'expert', score: null, status: 'running', progress: 64, pages: 20, date: '2026-11-12' },
  { id: 'a3', project: 'Cedar Ridge Roofing', domain: 'cedarridgeroof.com', audience: 'client', score: 81, status: 'completed', pages: 30, date: '2026-11-08' },
  { id: 'a4', project: 'Polar Mechanical', domain: 'polarmech.net', audience: 'expert', score: 47, status: 'completed', pages: 50, date: '2026-11-05' },
  { id: 'a5', project: 'Northgate Electric', domain: 'northgate-electric.com', audience: 'client', score: null, status: 'failed', pages: 0, date: '2026-11-04' },
];

export const teamStats = [
  { value: '18', label: 'Audits this month', hint: '+6 vs October' },
  { value: '64', label: 'Average health score', hint: 'Across 11 projects' },
  { value: '23', label: 'Critical issues open', hint: '7 fixed this week' },
  { value: '640', label: 'Pages audited', hint: 'Up to 50 per audit' },
];

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
