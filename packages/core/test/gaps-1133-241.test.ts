import { describe, expect, it } from 'vitest';
import { evaluateRules, pageRivalMap, type AuditData, type MappingWorkspace } from '../src';
import { detectLanguage, untranslated } from '../src/audit/language';
import { parsePageContent } from '../src/audit/page-content';

/** Checklist gaps closed on 2026-11-18: 1.13.3 (translation and RTL) and 2.4.1 (depth vs the pages that rank). */
const EN = 'Our team repairs air conditioners and furnaces for homes across the city. We are licensed and insured, and we offer free quotes for every job. Call us today and your system will be working again before the end of the day, with a warranty on all parts and labour. '.repeat(3);
const FR = 'Notre équipe répare les climatiseurs et les chaudières pour les maisons de la ville. Nous sommes assurés et nous offrons des devis gratuits pour chaque travail. Appelez-nous et votre système sera réparé dans la journée, avec une garantie sur les pièces. '.repeat(3);
const AR = 'نحن نقدم خدمات إصلاح المكيفات والسخانات لجميع المنازل في المدينة مع ضمان على جميع القطع والعمل ونقدم عروض أسعار مجانية لكل عمل '.repeat(4);

const data = (content: ReturnType<typeof parsePageContent>[], extra: Partial<AuditData> = {}) =>
  ({ url: 'https://myhvac.com/', pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight: { origin: 'https://myhvac.com', homepage: { url: 'https://myhvac.com/', status: 200, finalUrl: 'https://myhvac.com/', headers: {}, robotsDirectives: [] }, variants: [], robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] }, sitemaps: [], sitemapUrlChecks: [], sitemapUrlTotal: 0, botAccess: [] }, summary: null, pages: [], psi: null, content, ...extra }) as unknown as AuditData;
const result = (d: AuditData, id: string) => evaluateRules(d).find((r) => r.def.id === id)?.result;

describe('1.13.3 language versions', () => {
  it('detects the language of the text', () => {
    expect(detectLanguage(EN)).toBe('en');
    expect(detectLanguage(FR)).toBe('fr');
    expect(detectLanguage(AR)).toBe('ar');
    expect(detectLanguage('Too short.')).toBeNull();
    expect(untranslated('fr-FR', EN)).toBe(true);
    expect(untranslated('fr', FR)).toBe(false);
    expect(untranslated('ur', AR)).toBe(false); // same script
    expect(untranslated('ja', EN)).toBe(true);
    expect(untranslated('fi', EN)).toBe(false); // no word list for Finnish: not judged
  });

  it('flags an untranslated alternate and a right-to-left page without dir="rtl"', () => {
    const tags = (self: string) => `<link rel="alternate" hreflang="en" href="https://myhvac.com/"><link rel="alternate" hreflang="fr" href="https://myhvac.com/fr/"><link rel="alternate" hreflang="ar" href="https://myhvac.com/ar/"><link rel="alternate" hreflang="x-default" href="https://myhvac.com/">${self}`;
    const page = (url: string, lang: string, body: string, dir = '') => parsePageContent(`<html lang="${lang}"${dir}><head>${tags('')}</head><body><main><p>${body}</p></main></body></html>`, url);
    const good = [page('https://myhvac.com/', 'en', EN), page('https://myhvac.com/fr/', 'fr', FR), page('https://myhvac.com/ar/', 'ar', AR, ' dir="rtl"')];
    expect(result(data(good), '1.13.3')).toMatchObject({ affectedCount: 0 });
    const bad = [page('https://myhvac.com/', 'en', EN), page('https://myhvac.com/fr/', 'fr', EN), page('https://myhvac.com/ar/', 'ar', AR)];
    expect(result(data(bad), '1.13.3')).toMatchObject({ affectedCount: 2 });
  });
});

describe('2.4.1 depth vs the pages that rank', () => {
  it('finds the ranking pages for each mapped page (never the site itself)', () => {
    const ws = { domain: 'myhvac.com', rows: [
      { url: 'https://myhvac.com/ac-repair/', primaryKeyword: 'ac repair', priority: 20 },
      { url: null, primaryKeyword: 'furnace', priority: 15 },
    ] } as unknown as MappingWorkspace;
    const map = pageRivalMap(ws, [{ term: 'ac repair', serpUrls: ['https://www.myhvac.com/x/', 'https://a.com/ac/', 'https://b.com/ac/', 'https://c.com/ac/', 'https://d.com/ac/'] }]);
    expect(map).toEqual({ 'myhvac.com/ac-repair': ['https://a.com/ac/', 'https://b.com/ac/', 'https://c.com/ac/'] });
  });

  it('compares mapped pages with the ranking pages when their word counts are known', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    const short = parsePageContent(`<html><body><main><h1>AC repair</h1><p>${words(300)}</p></main></body></html>`, 'https://myhvac.com/ac-repair/');
    expect(result(data([short], { rivalWords: { 'myhvac.com/ac-repair': [1400, 1800, 900] } }), '2.4.1')).toMatchObject({ affectedCount: 1, status: 'warn' });
    expect(result(data([short], { rivalWords: { 'myhvac.com/ac-repair': [500, 450] } }), '2.4.1')).toMatchObject({ affectedCount: 0 });
  });
});
