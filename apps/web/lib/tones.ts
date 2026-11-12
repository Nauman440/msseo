import type { CwvRating, RuleStatus, Severity, Tone } from '@seo/core';

/** Every status → colour mapping lives here so components never hard-code colours. */
export const TONE_SOFT: Record<Tone, string> = {
  pass: 'bg-pass-bg text-pass-text',
  warn: 'bg-warn-bg text-warn-text',
  high: 'bg-high-bg text-high-text',
  fail: 'bg-fail-bg text-fail-text',
  info: 'bg-info-bg text-info-text',
  primary: 'bg-primary-soft text-primary-text',
};

export const TONE_FILL: Record<Tone, string> = {
  pass: 'bg-chart-green',
  warn: 'bg-chart-yellow',
  high: 'bg-chart-orange',
  fail: 'bg-chart-red',
  info: 'bg-chart-neutral',
  primary: 'bg-chart-violet',
};

/** Hex values for SVG strokes (SVG can't take Tailwind classes on stroke reliably in print). */
export const TONE_HEX: Record<Tone, string> = {
  pass: '#15803D',
  warn: '#CA8A04',
  high: '#EA580C',
  fail: '#DC2626',
  info: '#A39FBA',
  primary: '#6D40BC',
};

export const STATUS_TONE: Record<RuleStatus, Tone> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  info: 'info',
  skipped: 'info',
  manual: 'info',
};

export const STATUS_LABEL: Record<RuleStatus, string> = {
  pass: 'Pass',
  warn: 'Warn',
  fail: 'Fail',
  info: 'Info',
  skipped: 'Skipped',
  manual: 'Manual',
};

export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: 'fail',
  high: 'high',
  medium: 'warn',
  low: 'info',
  info: 'info',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export const CWV_TONE: Record<CwvRating, Tone> = {
  good: 'pass',
  'needs-improvement': 'warn',
  poor: 'fail',
};

export const CWV_LABEL: Record<CwvRating, string> = {
  good: 'Good',
  'needs-improvement': 'Needs work',
  poor: 'Poor',
};

/** §9.2 CategoryBars: < 60 red/orange, 60–79 primary, ≥ 80 green. */
export function scoreTone(score: number): Tone {
  if (score >= 80) return 'pass';
  if (score >= 60) return 'primary';
  if (score >= 45) return 'high';
  return 'fail';
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
