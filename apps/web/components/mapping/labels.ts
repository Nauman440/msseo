import type { MappingAction, MappingRow, MappingStatus, MatchStrength } from '@seo/core';

/** Module 5 labels and chip styles, shared by server views and client forms. */
export const ACTION_LABEL: Record<MappingAction, string> = {
  optimise: 'Optimise the page',
  expand: 'Expand the content',
  merge: 'Merge competing pages',
  create: 'Create a new page',
  leave: 'Leave as it is',
};
export const STATUS_LABEL: Record<MappingStatus, string> = { todo: 'To do', in_progress: 'In progress', live: 'Live', verified: 'Verified' };

export const CHIP = 'whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold';
export const MONO = 'break-all font-mono text-[13px]';

export const MATCH: Record<MatchStrength, { label: string; bars: number; tone: string }> = {
  high: { label: 'High match', bars: 3, tone: 'bg-teal' },
  medium: { label: 'Medium match', bars: 2, tone: 'bg-amber-bar' },
  low: { label: 'Low match', bars: 1, tone: 'bg-amber-bar' },
};

/** The short "why" under the match bars. */
export function matchWhy(r: MappingRow): string {
  if (r.reason === 'Chosen by hand') return 'Chosen by you';
  if (r.match === 'high') return 'This page already ranks for it';
  if (r.match === 'low') return 'Matched by its address (sitemap)';
  return 'Matched by page content';
}

/** Position chip: top 3 teal, 4–20 orange, lower grey. */
export function positionChip(pos: number | null): string {
  if (pos === null) return 'bg-sunken text-ink-2';
  if (pos <= 3) return 'bg-teal-chip text-teal-text';
  if (pos <= 20) return 'bg-primary-chip text-primary-heading';
  return 'bg-sunken text-ink-2';
}

export const INTENT_WORDS: Record<string, string> = {
  transactional: 'Ready to hire or buy',
  commercial: 'Comparing options',
  informational: 'Looking for information',
  navigational: 'Looking for a specific site',
};

export const PAGE_TYPE: Record<string, string> = {
  home: 'homepage', service: 'service page', location: 'location page', service_location: 'service page for one area', blog_post: 'article',
  directory: 'directory listings', product: 'product page', category: 'category page', contact: 'contact page', about: 'about page', other: 'page',
};

export type MappingFilter = 'needs' | 'all' | 'mapped' | 'conflicts' | 'new';
export const MAPPING_FILTERS: MappingFilter[] = ['needs', 'all', 'mapped', 'conflicts', 'new'];
