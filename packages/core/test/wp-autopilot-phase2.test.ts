import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPressClient, pluginSupportsApply, WP_CHANGE_TYPES } from '../src';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = () => createWordPressClient({ siteUrl: 'https://shop.test', user: 'u', password: 'p', signingKey: 'k'.repeat(43) });

describe('apply and rollback answers from plugin 1.2.0', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads applied, needs_human and skipped answers', async () => {
    const answers = [
      reply(200, { status: 'applied', change_id: 'chg-00000001', before: 'Old', after: 'New', purged: ['object-cache'] }),
      reply(200, { status: 'needs_human', change_id: 'chg-00000002', reason: 'Add the H1 in Bricks.' }),
      reply(200, { status: 'skipped', change_id: 'chg-00000003', reason: 'Phrase not found.' }),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => answers.shift()!));
    const wp = client();
    expect(await wp.apply({ change_id: 'chg-00000001', type: 'meta_title', target: { post_id: 5 }, new_value: 'New' })).toMatchObject({ status: 'applied', before: 'Old', after: 'New' });
    expect(await wp.apply({ change_id: 'chg-00000002', type: 'heading_fix', target: { post_id: 5 }, new_value: { action: 'add_h1', text: 'x' } })).toMatchObject({ status: 'needs_human', reason: 'Add the H1 in Bricks.' });
    expect((await wp.apply({ change_id: 'chg-00000003', type: 'internal_link', target: { post_id: 5 }, new_value: {} })).status).toBe('skipped');
  });

  it('turns a refused change (4xx with a status) into a failed result, but throws on a bad signature', async () => {
    const answers = [reply(404, { status: 'failed', reason: 'No editable post with this id.' }), reply(401, { code: 'msscore_bad_signature' })];
    vi.stubGlobal('fetch', vi.fn(async () => answers.shift()!));
    const wp = client();
    expect(await wp.apply({ change_id: 'chg-00000004', type: 'meta_title', target: { post_id: 999 }, new_value: 'x' })).toMatchObject({ status: 'failed' });
    await expect(wp.apply({ change_id: 'chg-00000005', type: 'meta_title', target: { post_id: 5 }, new_value: 'x' })).rejects.toThrow();
  });

  it('sends the change exactly as signed and reads rollbacks', async () => {
    const sent: { url: string; body: string }[] = [];
    const answers = [reply(200, { status: 'rolled_back', change_id: 'chg-00000006' }), reply(404, { status: 'failed', reason: 'No change with this id.' })];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: init.body as string });
      return answers.shift()!;
    }));
    const wp = client();
    expect((await wp.rollback('chg-00000006', 'rank dropped')).status).toBe('rolled_back');
    expect(JSON.parse(sent[0]!.body)).toEqual({ change_id: 'chg-00000006', reason: 'rank dropped' });
    expect(await wp.rollback('chg-missing')).toMatchObject({ status: 'failed' });
  });

  it('knows the 1.2.0 change types', () => {
    expect(pluginSupportsApply('1.1.0')).toBe(false);
    expect(pluginSupportsApply('1.2.0')).toBe(true);
    expect(WP_CHANGE_TYPES).toHaveLength(14);
  });
});
