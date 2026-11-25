import type { KeywordIntent } from '../providers/dataforseo-keywords';
import type { FastCache, FastResult } from './fast-run';

/**
 * Module 4 · Keyword research (spec §16.2). One workspace per website (keyed by domain),
 * used by the team for any client and by customers for their own sites, like Module 3.
 */
export type KeywordSource = 'seed' | 'ranked' | 'competitor' | 'suggestion' | 'autocomplete' | 'gsc' | 'import' | 'manual';
export type KeywordStatus = 'kept' | 'removed';

export type KeywordRecord = {
  term: string;
  volume: number | null;
  /** Monthly volume, oldest first, starting at `trendFrom` ("YYYY-MM"). */
  trend: number[] | null;
  trendFrom: string | null;
  difficulty: number | null;
  cpc: number | null;
  intent: KeywordIntent | null;
  /** The site's own Google position and ranking URL (Labs or Search Console). */
  position: number | null;
  url: string | null;
  gscClicks: number | null;
  gscImpressions: number | null;
  sources: KeywordSource[];
  status: KeywordStatus;
  removeReason: string | null;
  /** Kept or removed by hand: the cleaning rules no longer change it. */
  statusLocked: boolean;
  /** Top-10 result URLs (clustering), kept so a re-cluster does not pay again. */
  serpUrls: string[] | null;
  /** Google features on page 1 besides plain results (local_pack, people_also_ask, video…), from the same check. */
  serpFeatures?: string[] | null;
  /** Competitors (domains) whose keyword gap brought this keyword in. */
  gapFrom?: string[];
  /** 4.2.6 Competitor pages (their strongest by search volume) that rank for it. */
  fromPages?: string[];
  clusterId: string | null;
  addedAt: string;
};

export type ClusterPageType = 'home' | 'service' | 'location' | 'service_location' | 'blog_post' | 'directory' | 'product' | 'category';

export type KeywordCluster = {
  id: string;
  name: string;
  /** The most searched keyword; clusters keep their id and hand-set scores across re-runs. */
  head: string;
  size: number;
  intent: KeywordIntent | null;
  /** The kind of page Google ranks for the head keyword (SERP check), or a guess from intent. */
  pageType: ClusterPageType;
  volume: number;
  /**
   * Traffic potential: estimated monthly visits of the page ranking #1 for the head keyword, across the
   * topic's keywords (search volume × expected click rate at that page's position in each saved result).
   * null when the head keyword has no saved Google result yet.
   */
  trafficPotential?: number | null;
  /** 1–5. Business value (intent + CPC) and chance to rank (difficulty + current position). */
  businessValue: number;
  rankingChance: number;
  scoresLocked: boolean;
  /** businessValue × rankingChance (1–25). */
  priority: number;
  bestPosition: number | null;
  bestUrl: string | null;
  /** Already on Google page 1–2 (positions 4–20): optimise the existing page first. */
  quickWin: boolean;
  /** Valuable but hard: a long-term content and link project. */
  longTerm: boolean;
  /** Peak month (1–12) when searches are ≥ 40% above average; publish two months before. */
  seasonalPeak: number | null;
  seasonalDeadline: string | null;
};

export type AiPrompt = {
  id: string;
  text: string;
  service: string | null;
  location: string | null;
  /** Ticked for tracking in AI assistants (missing = ticked). */
  tracked?: boolean;
  /** Added or edited by hand: kept when new questions are written. */
  custom?: boolean;
};

export type KeywordSeeds = {
  services: string[]; locations: string[]; brands: string[]; extra: string[];
  /** Fast pipeline (2026-11-25): the business's own brand names, what it does NOT sell, and claims it must never make. */
  ownBrands?: string[]; notOffered?: string[]; bannedClaims?: string[];
};
/** services: visits, repairs and bookings in an area. shop: products sold online (no places; product and category pages). */
export type BusinessType = 'services' | 'shop';

export type KeywordWorkspace = {
  domain: string;
  country: string;
  language: string;
  /** Missing on workspaces saved before shop mode: treated as "services". */
  businessType?: BusinessType;
  seeds: KeywordSeeds;
  keywords: KeywordRecord[];
  clusters: KeywordCluster[];
  prompts: AiPrompt[];
  lastRunAt: string | null;
  clusteredAt: string | null;
  promptsAt: string | null;
  /** The research inputs the AI questions were written from (`seedsKey`); new inputs mean new questions. */
  promptsSeeds?: string;
  /** Autopilot (customers): when competitors → keywords → page plan last ran by itself, its cost and any problem. */
  autopilot?: { lastRunAt: string; costUsd: number; steps: string[]; error: string | null };
  /** "People also ask" questions from Google for the checked keywords: ready-made FAQ material. */
  questions?: { text: string; keyword: string }[];
  /** When each paid source was last fetched ("ranked:site.com", "ideas:ac repair"), for one country/language. */
  fetched?: { scope: string; at: Record<string, string> };
  /** Distinctive words of this website's audited pages (titles and H1s): keywords must be about what the site covers. */
  siteWords?: string[];
  /** Version of the quality rules the list was last cleaned with (`KEYWORD_QUALITY_VERSION`). */
  qualityVersion?: number;
  /** The fast pipeline's last result (Keywords tab and Page plan read it) and its 30-day data cache. */
  fast?: FastResult;
  fastCache?: FastCache;
  /** Yes/No answers to the fast pipeline's client questions ("is X your brand?"): they change the next run's filters. */
  fastAnswers?: { keyword: string; question: string; answer: 'yes' | 'no'; at: string }[];
};
