import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createOpenAiClient } from '../src';

const answer = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'resp_1', status,
  output: status === 'completed' ? [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] : [],
  usage: status === 'completed' ? { input_tokens: 10, output_tokens: 5 } : null,
  ...extra,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const req = { system: 's', user: 'u', name: 'x', jsonSchema: {}, parse: z.object({ ok: z.boolean() }), background: { maxWaitMs: 5_000, pollMs: 1 } };

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI background mode', () => {
  it('starts in the background and checks back until the answer is complete', async () => {
    const calls: string[] = [];
    const states = ['in_progress', 'in_progress', 'completed'];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url.replace('https://api.openai.com', '')}`);
      if (init.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({ background: true, store: true });
        return json(answer('queued'));
      }
      return json(answer(states.shift()!));
    }));
    const r = await createOpenAiClient({ apiKey: 'k' }).generateJson(req);
    expect(r).toMatchObject({ data: { ok: true }, tokens: 15 });
    expect(calls).toEqual(['POST /v1/responses', 'GET /v1/responses/resp_1', 'GET /v1/responses/resp_1', 'GET /v1/responses/resp_1']);
  });

  it('falls back to a normal request when background mode is refused, and reports a failed answer', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      n++;
      if (n === 1) return json({ error: { message: 'background not supported' } }, 400);
      expect(JSON.parse(String(init.body)).background).toBeUndefined();
      return json(answer('completed'));
    }));
    expect((await createOpenAiClient({ apiKey: 'k' }).generateJson(req)).data).toEqual({ ok: true });

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => json(init.method === 'POST' ? answer('queued') : answer('failed', { error: { code: 'server_error', message: 'model overloaded' } }))));
    await expect(createOpenAiClient({ apiKey: 'k' }).generateJson(req)).rejects.toThrow(/model overloaded/);
  });
});
