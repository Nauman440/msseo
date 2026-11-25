import { describe, expect, it } from 'vitest';
import { droppedFacts, factsIn, judgeMeta, metaProblems, settlePageMeta, titleProblems, type MetaPage, type OpenAiClient } from '../src';

// Real examples from maxbox.uk (bug report 2026-11-25).
const GOOD_META = 'British-made dry dog food from MAXBOX: grain-free Signature 80 with 80% animal ingredients, gently cooked. Free UK delivery on orders over £40.';
const GENERIC_META = 'Explore dry dog food recipes, compare ingredients and review feeding information to choose the right food for your dog. Order online today, delivered fast.';
const ctx = { suffix: ' – Maxbox UK', brand: 'maxbox' };
const url = 'https://maxbox.uk/collections/dry-dog-food';
const pages = (o: Partial<MetaPage> = {}) => new Map<string, MetaPage>([[url, { url, title: 'Dry Dog Food', description: GOOD_META, mainKeyword: 'dry dog food', ...o }]]);

describe('drafted titles and descriptions are checked before they are saved', () => {
  it('keeps a good current description instead of a weaker, generic draft (KEEP rule)', () => {
    const [v] = judgeMeta([{ url, title: 'keep', description: GENERIC_META }], pages(), ctx);
    expect(v!.row.description).toBe('keep');
    expect(v!.failed.filter((f) => f.field === 'description')).toEqual([]);
  });

  it('rejects filler openings, missing facts, "&amp;", broken length and dropped facts', () => {
    expect(metaProblems(GENERIC_META, { others: new Set() })).toEqual(expect.arrayContaining([expect.stringMatching(/filler verb/)]));
    expect(metaProblems('Dog food &amp; treats for every breed, with options for puppies, adults and seniors, and advice on feeding and portion sizes for your pet today', { others: new Set() }))
      .toEqual(expect.arrayContaining([expect.stringMatching(/&amp;/), expect.stringMatching(/complete sentence/)]));
    expect(metaProblems(GOOD_META, { others: new Set() })).toEqual([]);
    expect(factsIn(GOOD_META)).toEqual(expect.arrayContaining(['british made', '80%', 'grain free', '£40']));
    expect(droppedFacts(GOOD_META, GENERIC_META)).toEqual(expect.arrayContaining(['british made', '80%', 'grain free']));
  });

  it('when the current text breaks the rules, a draft that drops its facts is refused', () => {
    const short = 'British-made dry dog food with 80% animal ingredients.';
    const [v] = judgeMeta([{ url, title: 'keep', description: GENERIC_META }], pages({ description: short }), ctx);
    const d = v!.failed.find((f) => f.field === 'description')!;
    expect(d.problems).toEqual(expect.arrayContaining([expect.stringMatching(/filler verb/), expect.stringMatching(/drops the fact "british made"/), expect.stringMatching(/drops the fact "80%"/)]));
  });

  it('measures titles with the CMS suffix, wants the keyword near the start and the brand once', () => {
    expect(titleProblems('Grain-Free Dry Dog Food, 80% Animal Ingredients', { mainKeyword: 'dry dog food' }, ctx, new Set())).toEqual([]);
    expect(titleProblems('Dry Dog Food', { mainKeyword: 'dry dog food' }, ctx, new Set())).toEqual([expect.stringMatching(/24 characters/)]);
    expect(titleProblems('Maxbox Dry Dog Food, Grain-Free and British-Made', { mainKeyword: 'dry dog food' }, ctx, new Set())).toEqual(['brand appears twice']);
    expect(titleProblems('Grain-Free Dry Dog Food, 80% Animal Ingredients', { mainKeyword: 'dry dog food' }, ctx, new Set(['grain-free dry dog food, 80% animal ingredients – maxbox uk']))).toEqual(['same title as another page']);
  });

  it('re-asks once with the errors; what still fails keeps the current text and is flagged for review', async () => {
    const asked: string[] = [];
    const client = {
      async generateJson(req: { name: string; user: string }) {
        asked.push(req.name);
        const rows = (JSON.parse(req.user) as { rows: { url: string; errors: string[] }[] }).rows;
        expect(rows[0]!.errors.join(' ')).toMatch(/title is 31 characters with the suffix/);
        // The fix for the title passes; the description still starts with "Explore".
        return { data: { rows: [{ url, title: 'Grain-Free Dry Dog Food, 80% Animal Ingredients', description: GENERIC_META }] }, tokens: 10, model: 'fake' };
      },
    } as unknown as OpenAiClient;
    const short = 'British-made dry dog food with 80% animal ingredients.';
    const r = await settlePageMeta(client, [{ url, title: 'Dry Dog Food Online', description: GENERIC_META }], pages({ description: short }), ctx);
    expect(asked).toEqual(['page_meta_fix']);
    expect(r.rows).toEqual([{ url, title: 'Grain-Free Dry Dog Food, 80% Animal Ingredients', description: 'keep' }]);
    expect(r.review).toEqual([expect.objectContaining({ url, field: 'description' })]);
    expect(r.fixed).toBe(1);
  });
});
