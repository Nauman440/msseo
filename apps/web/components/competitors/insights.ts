import { hiddenReason, type CompetitorRecord, type CompetitorWorkspace } from '@seo/core';
import { isListing } from './ListingsView';

/**
 * "What we learned": the comparisons an SEO consultant would open a meeting with, in plain words.
 * Each card compares the site with the competitors that matter (the shortlist, else those seen most),
 * says who is ahead and gives one thing to do. Cards without data are left out.
 */
export type Insight = {
  id: 'visibility' | 'visitors' | 'reviews' | 'gap';
  title: string;
  /** The comparison in one sentence. */
  finding: string;
  /** One thing to do about it. */
  todo: string;
  ahead: boolean;
  link?: { href: string; label: string };
};

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
const median = (vals: number[]) => {
  const s = [...vals].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null;
};

/** The competitors to compare with: the shortlist (main ones first), else the five seen most. */
export function watched(ws: CompetitorWorkspace): CompetitorRecord[] {
  const rivals = ws.competitors.filter((c) => !isListing(c) && !hiddenReason(c) && !c.rejected);
  const picked = rivals.filter((c) => c.shortlist !== 'none').sort((a, b) => (a.shortlist === b.shortlist ? b.seenIn - a.seenIn : a.shortlist === 'direct' ? -1 : 1));
  return picked.length ? picked : rivals.sort((a, b) => b.seenIn - a.seenIn).slice(0, 5);
}

export function competitorInsights(ws: CompetitorWorkspace, gaps: Record<string, number>, links: { pagePlan: string; analysis: string; gap: string; local: string | null }): Insight[] {
  const list = watched(ws);
  if (!list.length) return [];
  const main = list.filter((c) => c.shortlist !== 'aspirational');
  const peers = main.length ? main : list;
  const own = ws.own ?? null;
  const n = ws.searches.length;
  const out: Insight[] = [];

  // 1. How often each of you shows up for the searches customers type.
  const top = [...peers].sort((a, b) => b.seenIn - a.seenIn)[0]!;
  if (n > 0 && own) {
    const ahead = own.seenIn >= top.seenIn;
    out.push({
      id: 'visibility',
      title: 'Showing up when customers search',
      finding: ahead
        ? `You show up in ${own.seenIn} of the ${n} searches we checked, as often as or more than any competitor (${top.domain}: ${top.seenIn}).`
        : `${top.domain} shows up in ${top.seenIn} of the ${n} searches we checked. You show up in ${own.seenIn}.`,
      todo: ahead
        ? 'Keep it that way: every service and every place you serve should have its own page.'
        : 'Each search a customer types needs a page on your site that answers it. The page plan lists the pages to add or improve.',
      ahead,
      link: { href: links.pagePlan, label: 'See the page plan' },
    });
  }

  // 2. Visitors from Google (estimates).
  const theirs = median(peers.map((c) => c.etv).filter((v): v is number => v !== null && v !== undefined && v > 0));
  if (theirs !== null && own?.etv !== null && own?.etv !== undefined) {
    const mine = own.etv;
    const ahead = mine >= theirs;
    const times = mine > 0 ? theirs / mine : null;
    out.push({
      id: 'visitors',
      title: 'Visitors from Google',
      finding: ahead
        ? `You get about ${fmt(mine)} visits a month from Google, more than your main competitors (about ${fmt(theirs)} each).`
        : `Your main competitors get about ${fmt(theirs)} visits a month from Google${times && times >= 1.5 ? `, about ${times >= 10 ? fmt(times) : times.toFixed(1)} times yours` : ''}. You get about ${fmt(mine)}.`,
      todo: ahead
        ? 'Turn more of those visitors into calls and enquiries: a clear button and phone number on every page.'
        : 'Most of their visits come from pages you do not have yet. Compare in detail shows their best pages.',
      ahead,
      link: { href: links.analysis, label: 'Compare in detail' },
    });
  }

  // 3. Google reviews on the map listing.
  const rated = peers.filter((c) => c.reviews != null && c.reviews > 0);
  if (rated.length) {
    const avgReviews = rated.reduce((s, c) => s + (c.reviews ?? 0), 0) / rated.length;
    const avgRating = rated.reduce((s, c) => s + (c.rating ?? 0), 0) / rated.length;
    const mine = own?.reviews ?? null;
    const ahead = mine !== null && mine >= avgReviews && (own?.rating ?? 0) >= avgRating - 0.1;
    out.push({
      id: 'reviews',
      title: 'Google reviews',
      finding: mine === null
        ? `Your competitors in the map average ${avgRating.toFixed(1)} stars from ${fmt(avgReviews)} reviews. We did not find your business in the map results for these searches.`
        : `Your competitors in the map average ${avgRating.toFixed(1)} stars from ${fmt(avgReviews)} reviews. You have ${own?.rating?.toFixed(1) ?? '–'} stars from ${fmt(mine)}.`,
      todo: mine === null
        ? 'Claim and complete your Google Business Profile, with the same name, address and phone as your website.'
        : ahead
          ? 'Keep asking every happy customer for a review, and reply to every one.'
          : `Ask every happy customer for a Google review and reply to each one. About ${fmt(Math.max(1, avgReviews - mine))} more would put you level.`,
      ahead,
      ...(links.local ? { link: { href: links.local, label: 'Your map listing' } } : {}),
    });
  }

  // 4. Searches a competitor wins and the site does not (Module 4 keyword gap).
  const gap = list.map((c) => ({ domain: c.domain, count: gaps[c.domain] ?? 0 })).sort((a, b) => b.count - a.count)[0];
  if (gap && gap.count > 0) {
    out.push({
      id: 'gap',
      title: 'Searches they win and you do not',
      finding: `${gap.domain} shows up for ${fmt(gap.count)} ${gap.count === 1 ? 'search' : 'searches'} worth going after that you do not.`,
      todo: 'These are the quickest ideas for new pages and sections. Autopilot adds the best ones to your keywords and page plan.',
      ahead: false,
      link: { href: links.gap, label: 'See the searches' },
    });
  }
  return out;
}
