import { z } from 'zod';
import type { KeywordRecord } from '../keywords/types';
import type { OpenAiClient } from '../providers/openai';
import type { MappingRow, MappingWorkspace } from './mapping';

/**
 * 5.8 AI-written title, H1 and meta description for each topic's page (approved per row).
 * Privacy: keywords that came only from Search Console are never sent (they are Google user
 * data); such rows keep their template drafts.
 */
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'h1', 'meta'],
        properties: { id: { type: 'string' }, title: { type: 'string' }, h1: { type: 'string' }, meta: { type: 'string' } },
      },
    },
  },
};
const parse = z.object({ pages: z.array(z.object({ id: z.string(), title: z.string(), h1: z.string(), meta: z.string() })) });

/** Rows the AI may write for: unapproved, with a primary keyword not found only through Search Console. */
export function draftableRows(ws: MappingWorkspace, keywords: KeywordRecord[], limit = 10): MappingRow[] {
  const gscOnly = new Set(keywords.filter((k) => k.sources.length > 0 && k.sources.every((s) => s === 'gsc')).map((k) => k.term));
  return ws.rows.filter((r) => !r.drafts?.approved && !gscOnly.has(r.primaryKeyword)).slice(0, limit);
}

export async function writeDrafts(
  ai: OpenAiClient,
  rows: MappingRow[],
  ctx: { brand: string; place: string | null; keywords: KeywordRecord[]; currentTitles: Record<string, string | null> },
): Promise<{ drafts: Record<string, { title: string; h1: string; meta: string }>; tokens: number }> {
  if (!rows.length) return { drafts: {}, tokens: 0 };
  const gscOnly = new Set(ctx.keywords.filter((k) => k.sources.length > 0 && k.sources.every((s) => s === 'gsc')).map((k) => k.term));
  const input = rows.map((r) => ({
    id: r.clusterId,
    primary_keyword: r.primaryKeyword,
    secondary_keywords: r.secondaryKeywords.filter((k) => !gscOnly.has(k)),
    intent: r.intent,
    page: r.url ? { address: r.url, current_title: ctx.currentTitles[r.url] ?? null } : { new_page_type: r.newPageType },
  }));
  const { data, tokens } = await ai.generateJson({
    name: 'page_drafts',
    system:
      'You write on-page SEO copy for a small local business website. For each page write: a title tag (50–60 characters, primary keyword near the start, ' +
      'ends with " | <brand>" when it fits), one H1 (natural, includes the primary keyword) and a meta description (140–160 characters, includes the primary ' +
      'keyword, a clear benefit and a call to action). Mention the place only when given. Plain English, no prices or claims you cannot know, no quotes or emojis. ' +
      'Return one entry per id, exactly as given.',
    user: JSON.stringify({ brand: ctx.brand, place: ctx.place, pages: input }),
    jsonSchema: schema,
    parse,
    maxOutputTokens: 4000,
    timeoutMs: 90_000,
  });
  const ids = new Set(rows.map((r) => r.clusterId));
  const drafts: Record<string, { title: string; h1: string; meta: string }> = {};
  for (const p of data.pages) {
    if (!ids.has(p.id)) continue;
    drafts[p.id] = { title: p.title.trim().slice(0, 70), h1: p.h1.trim().slice(0, 90), meta: p.meta.trim().slice(0, 170) };
  }
  return { drafts, tokens };
}
