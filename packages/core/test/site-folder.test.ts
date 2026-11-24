import { describe, expect, it } from 'vitest';
import { inFolder, siteBase } from '../src/providers/direct-fetch';

/** Websites that live in a folder of their domain (e.g. a WordPress install at example.com/srm/). */
describe('website folder', () => {
  it('takes the folder of the entered address', () => {
    expect(siteBase('https://example.com/')).toBe('https://example.com/');
    expect(siteBase('https://example.com/srm/')).toBe('https://example.com/srm/');
    expect(siteBase('https://example.com/srm/about')).toBe('https://example.com/srm/');
  });

  it('keeps only pages inside the folder, on either host spelling', () => {
    const base = 'https://example.com/srm/';
    expect(inFolder('https://example.com/srm/', base)).toBe(true);
    expect(inFolder('https://www.example.com/srm/services/', base)).toBe(true);
    expect(inFolder('https://example.com/srm', base)).toBe(true);
    expect(inFolder('https://example.com/', base)).toBe(false);
    expect(inFolder('https://example.com/srmother/', base)).toBe(false);
    expect(inFolder('https://other.com/srm/', base)).toBe(false);
    expect(inFolder('https://example.com/anything/', 'https://example.com/')).toBe(true);
  });
});

describe('page types for a website in a folder', () => {
  it('treats the folder as the homepage and types pages from there', async () => {
    const { buildTemplates, classifyPage } = await import('../src/audit/templates');
    expect(classifyPage('https://example.com/srm/', undefined, '/srm/')).toBe('home');
    expect(classifyPage('https://example.com/srm/contact/', undefined, '/srm/')).toBe('contact');
    expect(classifyPage('https://example.com/srm/', undefined)).toBe('other');
    const t = buildTemplates([{ url: 'https://example.com/srm/' }, { url: 'https://example.com/srm/industries/' }], new Map(), '/srm/');
    expect(t.map((x) => x.label)).toEqual(['Homepage', 'Other: /industries/']);
  });
});
