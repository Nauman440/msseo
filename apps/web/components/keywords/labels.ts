import type { BusinessType, KeywordCluster } from '@seo/core';

/** Keyword design labels and chip colours (design-reference/Keywords tab *.zip), shared by server and client components. */
export const PAGE_TYPE: Record<KeywordCluster['pageType'], string> = {
  home: 'Homepage',
  service: 'Service page',
  location: 'Location page',
  service_location: 'Service + city page',
  blog_post: 'Article or guide',
  directory: 'Directory listings',
  product: 'Product page',
  category: 'Category page',
};

/** What to make for a topic that is not showing yet ("Create a service page for …"). */
export const PAGE_TO_MAKE: Record<KeywordCluster['pageType'], string> = {
  home: 'Make your homepage about',
  service: 'Create a service page for',
  location: 'Create a page for the area for',
  service_location: 'Create a service page for',
  blog_post: 'Write a helpful article about',
  directory: 'Get listed on the directories that show for',
  product: 'Create a product page for',
  category: 'Create a category page for',
};

export const intentLabel = (intent: string | null, business: BusinessType = 'services') =>
  intent === 'transactional' ? (business === 'shop' ? 'Ready to buy' : 'Ready to hire') : intent === 'commercial' ? 'Comparing' : intent === 'informational' ? 'Learning' : intent === 'navigational' ? 'Looking for a site' : null;

export const INTENT_CHIP: Record<string, string> = {
  transactional: 'bg-teal-chip text-teal-text',
  commercial: 'bg-amber-bg text-amber-text',
  informational: 'bg-violet-bg text-violet-text',
  navigational: 'bg-sunken text-ink-2',
};

/** Chip classes: rounded full, 12px bold. */
export const CHIP = 'whitespace-nowrap rounded-full px-[9px] py-[3px] text-[12px] font-bold';

export const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Your position: top 20 in orange, further down in grey. */
export const positionChip = (p: number) => (p <= 20 ? 'bg-primary-chip text-primary-heading' : 'bg-sunken text-ink-2');

/** Difficulty bar: easy teal, medium yellow, hard red. */
export const difficultyBar = (d: number) => (d < 35 ? 'bg-teal' : d < 70 ? 'bg-amber-bar' : 'bg-chart-high');

export type TopicOrder = 'priority' | 'volume' | 'quick' | 'season';
export const TOPIC_ORDERS: { value: TopicOrder; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'volume', label: 'Searches a month' },
  { value: 'quick', label: 'Quick wins first' },
  { value: 'season', label: 'Season' },
];
