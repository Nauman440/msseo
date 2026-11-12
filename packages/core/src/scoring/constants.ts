import type { Category, ScoreLabel, Severity } from '../types';

/** §6.4 — every weight and threshold lives in this one file. */
export const SEVERITY_WEIGHT: Record<Exclude<Severity, 'info'>, number> = {
  critical: 10,
  high: 5,
  medium: 3,
  low: 1,
};

export const CATEGORY_WEIGHT: Record<Category, number> = {
  technical: 30,
  onpage: 25,
  speed: 15,
  mobile: 10,
  ai: 10,
  trust: 5,
  security: 5,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  technical: 'Technical SEO',
  speed: 'Speed and Core Web Vitals',
  mobile: 'Mobile',
  security: 'Security',
  onpage: 'On-page SEO',
  trust: 'Trust and conversion',
  ai: 'AI search readiness',
};

export const SCORE_LABELS: { min: number; label: ScoreLabel }[] = [
  { min: 90, label: 'Good' },
  { min: 70, label: 'Needs work' },
  { min: 50, label: 'Poor' },
  { min: 0, label: 'Critical' },
];

export const TOP_ISSUES_LIMIT = { client: 5, expert: 10 } as const;
