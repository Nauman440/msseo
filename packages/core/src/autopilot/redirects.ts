/**
 * Old addresses that Search Console, rankings or links still send people to but that now answer 404:
 * each is matched to the closest live page by its name and address words. No good match → a person
 * decides (never a blanket redirect to the homepage).
 */
export type DeadUrl = { url: string; why: string; clicks?: number };
export type LivePage = { url: string; name: string };
export type RedirectMatch = { from: string; to: string | null; score: number; why: string };

const STOP = new Set(['the', 'and', 'for', 'with', 'our', 'your', 'a', 'an', 'of', 'to', 'in', 'on', 'page', 'html', 'php', 'index', 'www']);
const tokens = (s: string) =>
  (decodeURIComponent(s).toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map((t) => t.replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})s$/, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Similarity of two word sets (Dice), 0–1. */
function dice(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return (2 * both) / (A.size + B.size);
}

export const REDIRECT_MIN_SCORE = 0.34;

export function matchRedirects(dead: DeadUrl[], live: LivePage[]): RedirectMatch[] {
  return dead.map((d) => {
    const from = tokens(pathOf(d.url));
    let best: { page: LivePage; score: number } | null = null;
    for (const p of live) {
      const s = Math.max(dice(from, tokens(pathOf(p.url))), dice(from, tokens(p.name)) * 0.95);
      if (!best || s > best.score) best = { page: p, score: s };
    }
    return best && best.score >= REDIRECT_MIN_SCORE
      ? { from: d.url, to: best.page.url, score: Math.round(best.score * 100) / 100, why: d.why }
      : { from: d.url, to: null, score: best ? Math.round(best.score * 100) / 100 : 0, why: d.why };
  });
}
