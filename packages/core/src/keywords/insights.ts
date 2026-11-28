import type { CompetitorWorkspace } from '../competitors/competitors';
import type { MappingRow, MappingWorkspace } from '../mapping/mapping';
import { normTerm } from './clean';
import { resultHost, siteKind } from './cluster';
import { localOf } from './local-volume';
import type { KeywordCluster, KeywordRecord, KeywordWorkspace } from './types';
import { siteHost } from '../site-key';

/**
 * Keyword insights (FEATURE_KEYWORD_INSIGHTS, after the OpenSEO keyword-research report shape): a one-line
 * verdict (the best theme and why the site can win it now), then at most three moves, one per page to
 * create or improve, ordered by how winnable they are (not by volume). Each move has the page's demand
 * (close variants counted once), the lead keyword's difficulty and position, a draft title, the supporting
 * keywords as sections, and the evidence from Google's first page: who holds it and whether map results
 * show. Built only from saved data (keyword research, page plan, competitors): no extra cost.
 */
export type PageOne = { directories: number; big: number; others: number; total: number; youAt: number | null; map: boolean };
export type KeywordMove = {
  clusterId: string;
  topic: string;
  /** Existing page, or null for a new page at `newPath`. */
  url: string | null;
  newPath: string | null;
  lead: string;
  difficulty: number | null;
  position: number | null;
  /** Searches a month across the page's keywords (country). */
  demand: number;
  /** The same in the first place served, when local volume is known. */
  localDemand: number | null;
  localPlace: string | null;
  title: string;
  sections: string[];
  pageOne: PageOne | null;
  why: string;
};
export type KeywordInsights = {
  verdict: string;
  moves: KeywordMove[];
  /** Businesses seen in the map results for the site's core searches (Competitors tab), most seen first. */
  mapBusinesses: string[];
};

const kebab = (s: string) => normTerm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: number) => n.toLocaleString('en-US');

/** Who holds Google's first page for a keyword, from its saved top 10. */
export function pageOneOf(k: Pick<KeywordRecord, 'serpUrls' | 'serpFeatures'> | undefined, domain: string): PageOne | null {
  const urls = k?.serpUrls ?? [];
  if (!urls.length) return null;
  // Host level: a website in a folder (site key host~folder) shows in results under its host.
  const own = siteHost(domain);
  const youIdx = urls.findIndex((u) => resultHost(u) === own || resultHost(u).endsWith(`.${own}`));
  const others = urls.filter((u) => resultHost(u) !== own);
  const kinds = others.map(siteKind);
  return {
    directories: kinds.filter((x) => x === 'directory').length,
    big: kinds.filter((x) => x === 'big').length,
    others: kinds.filter((x) => x === 'other').length,
    total: urls.length,
    youAt: youIdx >= 0 ? youIdx + 1 : null,
    map: (k?.serpFeatures ?? []).some((f) => f === 'local_pack' || f === 'map'),
  };
}

/** One plain sentence: why this page can (or will struggle to) win. */
export function whyText(p: PageOne | null, difficulty: number | null, position: number | null): string {
  const parts: string[] = [];
  if (p) {
    const mix = [p.others ? `${p.others} smaller ${p.others === 1 ? 'site' : 'sites'}` : '', p.directories ? `${p.directories} ${p.directories === 1 ? 'directory' : 'directories'}` : '', p.big ? `${p.big} big ${p.big === 1 ? 'brand' : 'brands'}` : ''].filter(Boolean);
    parts.push(`Google's first page: ${mix.join(', ')}${p.map ? ', plus map results' : ''}.`);
    // The stored position is newer than the saved first page; only one of them is quoted.
    if (p.youAt && position === null) parts.push(`You are already #${p.youAt}.`);
    else if (p.others >= 5) parts.push('Mostly businesses like yours, so a strong page can get in.');
    else if (p.big >= 4) parts.push('Big brands hold most of it, so expect this to take longer.');
    else if (p.directories >= 4) parts.push('Directories hold most of it: list your business on them too.');
  }
  if (position !== null && position >= 4 && position <= 20) parts.push(`You rank #${Math.round(position)} now, close to the top.`);
  if (difficulty !== null) parts.push(difficulty < 30 ? `Low difficulty (${difficulty}/100).` : difficulty < 50 ? `Medium difficulty (${difficulty}/100).` : `High difficulty (${difficulty}/100).`);
  return parts.join(' ') || 'No Google results saved for this search yet.';
}

/** How winnable a page is: chance to rank first, then its value; a page already in the top 3 is left out. */
const winnable = (c: KeywordCluster | undefined, r: MappingRow) => (c ? c.rankingChance * 10 + c.businessValue : 0) + (r.currentPosition !== null && r.currentPosition >= 4 && r.currentPosition <= 20 ? 15 : 0);

export function keywordInsights(kw: KeywordWorkspace, mapping: MappingWorkspace | null | undefined, competitors?: CompetitorWorkspace | null, max = 3): KeywordInsights | null {
  const kept = kw.keywords.filter((k) => k.status === 'kept');
  if (!kept.length || !kw.clusters.length) return null;
  const clusters = new Map(kw.clusters.map((c) => [c.id, c]));
  const byTerm = new Map(kept.map((k) => [normTerm(k.term), k]));
  const place = kw.businessType === 'shop' ? null : kw.localPlaces?.find((p) => p.locationName)?.place ?? null;
  const rows = (mapping?.rows ?? []).filter((r) => r.action !== 'leave' && clusters.has(r.clusterId));
  // Without a page plan yet, every topic counts as a page to create.
  const candidates: MappingRow[] = rows.length
    ? rows
    : kw.clusters.map((c) => ({ clusterId: c.id, topic: c.name, url: c.bestUrl, primaryKeyword: c.head, secondaryKeywords: kept.filter((k) => k.clusterId === c.id && k.term !== c.head).map((k) => k.term).slice(0, 5), currentPosition: c.bestPosition, priority: c.priority, volume: c.volume, action: c.bestUrl ? 'optimise' : 'create', suggestedPath: null, drafts: null } as unknown as MappingRow));

  const moves = candidates
    .slice()
    .sort((a, b) => winnable(clusters.get(b.clusterId), b) - winnable(clusters.get(a.clusterId), a) || b.priority - a.priority)
    .slice(0, max)
    .map((r): KeywordMove => {
      const c = clusters.get(r.clusterId)!;
      const lead = byTerm.get(normTerm(r.primaryKeyword)) ?? byTerm.get(normTerm(c.head));
      const members = kept.filter((k) => k.clusterId === c.id);
      const local = place ? members.map((k) => localOf(k, place)?.volume).filter((v): v is number => typeof v === 'number') : [];
      const pageOne = pageOneOf(lead, kw.domain);
      const position = r.currentPosition ?? lead?.position ?? null;
      return {
        clusterId: c.id,
        topic: r.topic,
        url: r.url,
        newPath: r.url ? null : r.suggestedPath ?? `/${kebab(c.head)}/`,
        lead: r.primaryKeyword || c.head,
        difficulty: lead?.difficulty ?? null,
        position,
        demand: c.volume,
        localDemand: local.length ? local.reduce((s, v) => s + v, 0) : null,
        localPlace: local.length ? place : null,
        title: r.drafts?.title || cap(r.primaryKeyword || c.head),
        sections: (r.secondaryKeywords ?? []).slice(0, 5).map(cap),
        pageOne,
        why: whyText(pageOne, lead?.difficulty ?? null, position),
      };
    });

  const best = moves[0];
  const verdict = best
    ? `Best theme to win now: “${best.topic}”: about ${num(best.localDemand ?? best.demand)} searches a month${best.localDemand !== null && best.localPlace ? ` in ${best.localPlace}` : ''}. ${best.pageOne ? (best.position !== null && best.position <= 20 ? `You already rank #${Math.round(best.position)}, so improving ${best.url ? 'the page' : 'a new page'} is the quickest win.` : best.pageOne.others >= 5 ? 'Google shows mostly businesses like yours for it, so a focused page can compete.' : 'It is the most winnable of your topics today.') : 'It is the most winnable of your topics today.'}`
    : 'No topic stands out yet: the next keyword update will suggest one.';
  const mapBusinesses = (competitors?.competitors ?? [])
    .filter((x) => x.sources.includes('local') && !x.rejected && x.type !== 'directory' && x.type !== 'publisher')
    .sort((a, b) => b.seenIn - a.seenIn)
    .slice(0, 5)
    .map((x) => x.name || x.domain);
  return { verdict, moves, mapBusinesses };
}

/** Keywords Google shows map results for (from the saved first page), for the keyword table's marker. */
export const showsMap = (k: Pick<KeywordRecord, 'serpFeatures'>) => (k.serpFeatures ?? []).some((f) => f === 'local_pack' || f === 'map');
