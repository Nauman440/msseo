import 'server-only';
import { keywordInsights, keywordInsightsEnabled, type KeywordInsights, type KeywordWorkspace, type MappingWorkspace } from '@seo/core';
import { getSavedWorkspace } from './competitors';

/**
 * The Keywords tab's verdict and top moves, only where FEATURE_KEYWORD_INSIGHTS=1 (staging first).
 * Built from saved keyword research, the page plan and the competitor searches: no extra cost.
 */
export async function insightsFor(ws: KeywordWorkspace, mapping: MappingWorkspace | null): Promise<KeywordInsights | null> {
  if (!keywordInsightsEnabled()) return null;
  const competitors = await getSavedWorkspace(ws.domain).catch(() => null);
  return keywordInsights(ws, mapping, competitors);
}
