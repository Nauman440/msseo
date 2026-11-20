import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import type { ReportPage } from '../types';
import type { BusinessType } from './types';

/**
 * Research inputs for a website the customer added after sign-up: its services and places come from
 * its own audited pages (titles and H1s), never from the first website's onboarding answers. OpenAI
 * reads the page titles when it is set up; otherwise service and place pages are read directly.
 */
export type SiteSeeds = { services: string[]; locations: string[]; businessType: BusinessType; tokens: number };

const SEPARATORS = /\s+[|–—-]\s+|\s*:\s+/;
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "AC Repair in Dallas | Brand" → { service: "AC repair", place: "Dallas" }. */
export function splitServicePlace(text: string, brand: string | null): { service: string | null; place: string | null } {
  const parts = text.split(SEPARATORS).map(tidy).filter(Boolean);
  const b = brand?.toLowerCase().trim();
  const main = parts.find((p) => !b || !p.toLowerCase().includes(b)) ?? parts[0] ?? '';
  const m = main.match(/^(.*?)\s+(?:in|near|for|across|serving)\s+([A-Z][\w .'-]{2,40})$/);
  const service = tidy((m ? m[1]! : main).replace(/\b(best|top|professional|affordable|trusted|#1|services?|company)\b/gi, ' ')) || null;
  const place = m ? tidy(m[2]!.replace(/,.*$/, '')) : null;
  return { service: service && service.length >= 3 && service.split(' ').length <= 5 ? cap(service.toLowerCase()) : null, place };
}

export function seedsFromPagesHeuristic(pages: ReportPage[], brand: string | null): Omit<SiteSeeds, 'tokens'> {
  const shop = pages.some((p) => /product|category/.test(p.pageType ?? '') || p.schemaTypes.some((t) => /^(Product|Offer|ItemList)$/.test(t)));
  const services = new Map<string, number>();
  const places = new Map<string, number>();
  for (const p of pages.filter((x) => /^(service|location|service_location|category|other)$/.test(x.pageType ?? ''))) {
    const r = splitServicePlace(p.h1 ?? p.title ?? '', brand);
    if (r.service) services.set(r.service, (services.get(r.service) ?? 0) + 1);
    if (r.place) places.set(r.place, (places.get(r.place) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return { services: top(services, 8), locations: shop ? [] : top(places, 5), businessType: shop ? 'shop' : 'services' };
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['businessType', 'services', 'places'],
  properties: {
    businessType: { type: 'string', enum: ['services', 'shop'] },
    services: { type: 'array', items: { type: 'string' } },
    places: { type: 'array', items: { type: 'string' } },
  },
};
const parse = z.object({ businessType: z.enum(['services', 'shop']), services: z.array(z.string()), places: z.array(z.string()) });

export async function seedsFromPages(pages: ReportPage[], ai: OpenAiClient | null, brand: string | null): Promise<SiteSeeds> {
  const plain = seedsFromPagesHeuristic(pages, brand);
  if (!ai || !pages.length) return { ...plain, tokens: 0 };
  try {
    const r = await ai.generateJson({
      name: 'site_seeds',
      system:
        'From a website\'s page titles and H1s, list what the business sells and where. "services": 3–8 short service or product category names as customers search for them ' +
        '(e.g. "AC repair", "furnace installation", "linen bedding"), no brand names, no places. "places": the cities or areas it serves (empty for online shops). ' +
        '"businessType": "shop" when it sells products online, else "services". Only use what the titles show.',
      user: JSON.stringify({ brand, pages: pages.slice(0, 30).map((p) => ({ url: p.url, title: p.title, h1: p.h1, type: p.pageType })) }),
      jsonSchema: schema,
      parse,
      maxOutputTokens: 400,
      timeoutMs: 30_000,
    });
    const clean = (xs: string[], n: number) => [...new Set(xs.map(tidy).filter((x) => x.length >= 2 && x.length <= 60))].slice(0, n);
    const services = clean(r.data.services, 8);
    return services.length
      ? { services, locations: r.data.businessType === 'shop' ? [] : clean(r.data.places, 5), businessType: r.data.businessType, tokens: r.tokens }
      : { ...plain, tokens: r.tokens };
  } catch {
    return { ...plain, tokens: 0 };
  }
}
