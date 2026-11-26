import { COUNTRY_ISO } from '../providers/dataforseo-analysis';
import { matchAdsLocation, type LocalVolumeClient } from '../providers/dataforseo-keywords';
import type { KeywordRecord, KeywordWorkspace, LocalVolume } from './types';

/**
 * Local search volume (keyword research, FEATURE_KEYWORD_INSIGHTS): for a local business, how often
 * each keyword is searched in the places it serves, not only across the country. One Google Ads task per
 * place ($0.09, up to 1,000 keywords), at most LOCAL_PLACES places per run; a place measured within the
 * reuse window is not bought again unless many keywords are new.
 */
export const LOCAL_PLACES = 2;
const MAX_TERMS = 1000;
/** New keywords without a local figure before a recently measured place is measured again. */
const REFRESH_MISSING = 25;

/** The local figure for one place (the first place served when none is named). */
export const localOf = (k: Pick<KeywordRecord, 'local'>, place?: string): LocalVolume | null => (place ? k.local?.find((l) => l.place === place) : k.local?.[0]) ?? null;
/** The most searched place's volume, or null without local data. */
export const localMax = (k: Pick<KeywordRecord, 'local'>): number | null => {
  const v = (k.local ?? []).map((l) => l.volume).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.max(...v) : null;
};

export async function addLocalVolume(
  client: LocalVolumeClient,
  ws: Pick<KeywordWorkspace, 'country' | 'language' | 'businessType' | 'seeds' | 'localPlaces'>,
  keywords: KeywordRecord[],
  opts: { now?: Date; reuseDays?: number } = {},
): Promise<{ keywords: KeywordRecord[]; localPlaces: NonNullable<KeywordWorkspace['localPlaces']>; cost: number; errors: string[]; calls: number }> {
  const now = opts.now ?? new Date();
  const places = ws.businessType === 'shop' ? [] : ws.seeds.locations.map((p) => p.trim()).filter(Boolean).slice(0, LOCAL_PLACES);
  const iso = COUNTRY_ISO[ws.country];
  const saved = new Map((ws.localPlaces ?? []).map((p) => [p.place, p]));
  const out = { keywords, localPlaces: places.map((p) => saved.get(p) ?? { place: p, locationName: null, at: '' }), cost: 0, errors: [] as string[], calls: 0 };
  if (!places.length || !iso) return out;

  let list: Awaited<ReturnType<LocalVolumeClient['locations']>> = [];
  try {
    list = await client.locations(iso);
  } catch (err) {
    out.errors.push(`Local search volume: ${err instanceof Error ? err.message : String(err)}`);
    return out;
  }
  // Most searched first, so the 1,000 measured are the ones that matter; keywords a person removed are skipped.
  const candidates = keywords.filter((k) => !(k.status === 'removed' && k.statusLocked)).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, MAX_TERMS);
  const byTerm = new Map(keywords.map((k) => [k.term, k]));
  const reuseMs = (opts.reuseDays ?? 7) * 86_400_000;

  for (const [i, place] of places.entries()) {
    const loc = matchAdsLocation(list, place);
    if (!loc) {
      out.localPlaces[i] = { place, locationName: null, at: now.toISOString() };
      out.errors.push(`Local search volume: no Google Ads location found for "${place}"`);
      continue;
    }
    const prev = saved.get(place);
    const missing = candidates.filter((k) => !localOf(k, place)).length;
    if (prev?.locationName === loc.name && prev.at && now.getTime() - Date.parse(prev.at) < reuseMs && missing < REFRESH_MISSING) continue;
    try {
      const r = await client.volume(candidates.map((k) => k.term), loc.name, ws.language);
      out.cost += r.cost;
      out.calls++;
      for (const row of r.rows) {
        const k = byTerm.get(row.term);
        if (!k) continue;
        const entry: LocalVolume = { place, volume: row.volume, cpc: row.cpc };
        byTerm.set(k.term, { ...k, local: [...(k.local ?? []).filter((l) => l.place !== place), entry] });
      }
      out.localPlaces[i] = { place, locationName: loc.name, at: now.toISOString() };
    } catch (err) {
      out.errors.push(`Local search volume for ${place}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  out.keywords = keywords.map((k) => byTerm.get(k.term) ?? k);
  return out;
}

/**
 * Keyword insights are switched on per server with FEATURE_KEYWORD_INSIGHTS=1 (staging first): local search
 * volume, the verdict and top moves on the Keywords tab, and map-results markers. Off = no extra cost and the
 * screens stay as they were.
 */
export const keywordInsightsEnabled = (env: Record<string, string | undefined> = process.env) => env.FEATURE_KEYWORD_INSIGHTS?.trim() === '1';
