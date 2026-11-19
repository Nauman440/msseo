import { z } from 'zod';
import type { PageContent } from '../audit/page-content';
import type { OpenAiClient } from '../providers/openai';

/**
 * Module 2 "Automate" line: alt-text drafts for content images that have no alt attribute (rule
 * 2.5.2). OpenAI looks at each image (vision, low detail) with the page's title and H1; without AI,
 * or when an image cannot be read, a draft comes from a descriptive file name. Drafts are for a
 * person to check and paste in; nothing is written to the site.
 */
export type AltDraft = { page: string; src: string; alt: string; by: 'ai' | 'file name' };
export const ALT_LIMITS = { images: 24, perCall: 6 } as const;

// Icons, tracking pixels, spacers and data URIs are not content images.
const SKIP = /^data:|\.svg(\?|$)|pixel|spacer|blank\.(gif|png)|1x1|tracking|analytics|facebook\.com\/tr|sprite|icon[-_]?\d*\.|favicon|gravatar|captcha/i;

export function imagesMissingAlt(pages: PageContent[], limit: number = ALT_LIMITS.images): { page: string; src: string; title: string | null; h1: string | null }[] {
  const out: { page: string; src: string; title: string | null; h1: string | null }[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    for (const img of p.images) {
      if (img.alt !== undefined) continue; // alt="" marks a decorative image on purpose
      let src: string;
      try {
        src = new URL(img.src, p.url).toString();
      } catch {
        continue;
      }
      if (SKIP.test(src) || seen.has(src)) continue;
      seen.add(src);
      out.push({ page: p.url, src, title: p.title ?? null, h1: p.h1[0] ?? null });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** A readable draft from a descriptive file name ("ac-unit-install-dallas.jpg" → "Ac unit install dallas"); null for IMG_1234 and hashes. */
export function altFromFileName(src: string): string | null {
  const file = decodeURIComponent(src.split(/[?#]/)[0]!.split('/').pop() ?? '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const words = file.replace(/[-_+.]+/g, ' ').replace(/\b\d+x\d+\b|\bscaled\b|\bcopy\b|\bfinal\b|\bmin\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!words || /^(img|dsc|image|photo|pic|screenshot|wp)\s?\d*$/i.test(words) || /^[a-f0-9 ]{12,}$/i.test(words) || words.replace(/[^a-z]/gi, '').length < 4) return null;
  return (words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()).slice(0, 125);
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['images'],
  properties: { images: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'alt'], properties: { n: { type: 'integer' }, alt: { type: 'string' } } } } },
};
const parse = z.object({ images: z.array(z.object({ n: z.number(), alt: z.string() })) });

export async function draftAltTexts(ai: OpenAiClient | null, items: { page: string; src: string; title: string | null; h1: string | null }[], business: string): Promise<{ drafts: AltDraft[]; tokens: number }> {
  const drafts: AltDraft[] = [];
  let tokens = 0;
  const fallback = (it: { page: string; src: string }) => {
    const alt = altFromFileName(it.src);
    if (alt) drafts.push({ page: it.page, src: it.src, alt, by: 'file name' });
  };
  for (let i = 0; i < items.length; i += ALT_LIMITS.perCall) {
    const batch = items.slice(i, i + ALT_LIMITS.perCall);
    if (!ai) {
      batch.forEach(fallback);
      continue;
    }
    try {
      const r = await ai.generateJson({
        name: 'alt_text',
        system:
          `Write alt text for images on a ${business} website. For each image n (in order), describe what it shows in 5–15 plain words, ` +
          'specific and useful for someone who cannot see it; include the service or place only when the image or page context shows it. ' +
          'No "image of" / "picture of", no keyword stuffing, under 125 characters. Return "" for purely decorative images.',
        user: JSON.stringify(batch.map((b, n) => ({ n, page_title: b.title, page_h1: b.h1, file: b.src.split('/').pop() }))),
        images: batch.map((b) => b.src),
        jsonSchema: schema,
        parse,
        maxOutputTokens: 600,
        timeoutMs: 60_000,
      });
      tokens += r.tokens;
      batch.forEach((b, n) => {
        const alt = r.data.images.find((x) => x.n === n)?.alt.trim().slice(0, 125);
        if (alt) drafts.push({ page: b.page, src: b.src, alt, by: 'ai' });
        else if (alt === undefined) fallback(b);
      });
    } catch {
      // An image the AI service cannot download fails the batch: fall back to file names for it.
      batch.forEach(fallback);
    }
  }
  return { drafts, tokens };
}

export function altDraftsToCsv(drafts: AltDraft[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"` : v);
  return `﻿${[['page', 'image', 'alt_text', 'drafted_by'], ...drafts.map((d) => [d.page, d.src, d.alt, d.by])].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
