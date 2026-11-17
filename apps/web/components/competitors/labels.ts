import type { CompetitorRecord, ListingKind, ListingStatus } from '@seo/core';

/** Competitors design (design-reference/Competitors tab *.zip): labels and chip colours, shared by server and client components. */
export type CompetitorView = 'competitors' | 'listings' | 'analysis' | 'where';
export const COMPETITOR_VIEWS: CompetitorView[] = ['competitors', 'listings', 'analysis', 'where'];

export const CHIP = 'whitespace-nowrap rounded-full px-[9px] py-[3px] text-[12px] font-bold';

export const KIND_LABEL: Record<ListingKind, string> = { review: 'Review site', directory: 'Directory', social: 'Social network', marketplace: 'Marketplace', publisher: 'Publisher' };
export const KIND_CHIP: Record<ListingKind, string> = {
  review: 'bg-teal-chip text-teal-text',
  directory: 'bg-indigo-bg text-indigo-text',
  social: 'bg-indigo-bg text-indigo-text',
  marketplace: 'bg-amber-bg text-amber-text',
  publisher: 'bg-violet-bg text-violet-text',
};

export const LISTING_LABEL: Record<ListingStatus, string> = { unchecked: 'Not checked', listed: 'Listed', not_listed: 'Not listed', wrong: 'Details wrong', irrelevant: 'Not relevant' };
export const LISTING_CHIP: Record<ListingStatus, string> = {
  unchecked: 'bg-sunken text-ink-2',
  listed: 'bg-teal-chip text-teal-text',
  not_listed: 'bg-amber-bg text-amber-text',
  wrong: 'bg-high-bg text-fail-text',
  irrelevant: 'bg-sunken text-ink-3',
};

/** Why each kind of site matters (first line on a listing card). */
const WHY: Record<ListingKind, string> = {
  review: 'Shows in Google for your searches, and customers read the reviews there.',
  directory: 'A directory that ranks for your searches: customers find businesses there.',
  social: 'Business pages show up for brand and review searches.',
  marketplace: 'A marketplace that shows up for your searches: a place to sell, not a rival.',
  publisher: 'Articles, threads or videos that rank for your searches, and AI assistants often cite them.',
};
const WHY_SITE: Record<string, string> = {
  'reddit.com': 'Local threads ask for recommendations, and AI assistants often cite them.',
  'youtube.com': 'Videos rank for "how to" and problem searches.',
  'quora.com': 'Answers to your customers’ questions rank in Google and are read by AI assistants.',
  'bbb.org': 'Trusted by customers comparing businesses.',
  'nextdoor.com': 'Neighbours recommend local businesses to each other here.',
};
export const whyItMatters = (domain: string, kind: ListingKind) => WHY_SITE[domain] ?? WHY[kind];

/** What to do next, by status (second line on a listing card). */
export function nextStep(status: ListingStatus, kind: ListingKind): string {
  if (status === 'listed') return 'Listed with matching details. Keep your details up to date and reply to reviews.';
  if (status === 'wrong') return 'Update your listing so the business name, address and phone match your website exactly.';
  if (status === 'irrelevant') return 'Marked as not relevant.';
  if (kind === 'publisher') return status === 'not_listed' ? 'Get mentioned: answer genuine questions or share a helpful guide or video. No spam.' : 'Check whether you are mentioned there.';
  if (status === 'not_listed') return 'Create a free business listing with the same name, address and phone as your website.';
  return 'Check whether your business is listed there with the same name, address and phone.';
}

/** "Map pack" when the competitor shows in the map results, else "Search results". */
export const whereSeen = (c: Pick<CompetitorRecord, 'sources'>) => (c.sources.includes('local') ? 'Map pack' : c.sources.includes('serp') ? 'Search results' : null);
