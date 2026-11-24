import { z } from 'zod';
import { HttpError, requestJson, type HttpLog } from './http';

/**
 * OpenAI Responses API client (POST /v1/responses) with strict JSON-schema output.
 * Docs: https://developers.openai.com/api/docs/guides/structured-outputs
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol';

export type OpenAiConfig = { apiKey: string; model?: string; baseUrl?: string; log?: HttpLog };

const responseSchema = z
  .object({
    status: z.string().optional(),
    incomplete_details: z.object({ reason: z.string().optional() }).nullable().optional(),
    output: z
      .array(
        z
          .object({
            type: z.string(),
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() }).passthrough())
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
    usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).passthrough().nullable().optional(),
    id: z.string().optional(),
    error: z.object({ code: z.string().nullable().optional(), message: z.string().nullable().optional() }).passthrough().nullable().optional(),
  })
  .passthrough();

export type JsonRequest<T> = {
  system: string;
  user: string;
  /** Name of the schema, [a-z_] only. */
  name: string;
  /** JSON Schema sent to OpenAI (strict: every property required, additionalProperties false). */
  jsonSchema: Record<string, unknown>;
  /** Zod mirror of jsonSchema; validates the reply. */
  parse: z.ZodType<T>;
  maxOutputTokens?: number;
  /** Images for vision checks, as data URLs (e.g. the PageSpeed mobile screenshot). */
  images?: string[];
  timeoutMs?: number;
  /**
   * Long answers: start the request in OpenAI's background mode and check back until it is done, so no
   * single HTTP request has to stay open for minutes. Falls back to a normal request if refused.
   */
  background?: { maxWaitMs: number; pollMs?: number };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The answer hit max_output_tokens (reasoning tokens count too): ask again with a higher limit. */
export class OpenAiCutOffError extends Error {
  constructor(readonly reason: string) {
    super(`OpenAI reply was cut off (${reason})`);
  }
}
const DONE = new Set(['completed', 'failed', 'incomplete', 'cancelled']);

export function createOpenAiClient(cfg: OpenAiConfig) {
  const model = cfg.model || DEFAULT_OPENAI_MODEL;
  const baseUrl = (cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');

  const headers = { authorization: `Bearer ${cfg.apiKey}` };

  async function generateJson<T>(req: JsonRequest<T>): Promise<{ data: T; model: string; tokens: number }> {
    const body = {
      model,
      input: [
          { role: 'system', content: req.system },
          req.images?.length
            ? { role: 'user', content: [{ type: 'input_text', text: req.user }, ...req.images.map((url) => ({ type: 'input_image', image_url: url, detail: 'low' }))] }
            : { role: 'user', content: req.user },
        ],
      max_output_tokens: req.maxOutputTokens ?? 4000,
      text: { format: { type: 'json_schema', name: req.name, schema: req.jsonSchema, strict: true } },
    };
    const res = req.background ? await inBackground(body, req.background, req.timeoutMs) : responseSchema.parse(await post(body, req.timeoutMs ?? 120_000));
    if (res.status === 'failed') throw new Error(`OpenAI could not finish: ${res.error?.message ?? 'no reason given'}`);
    if (res.status === 'cancelled') throw new Error('OpenAI cancelled the request');
    if (res.status === 'incomplete') throw new OpenAiCutOffError(res.incomplete_details?.reason ?? 'incomplete');
    const parts = res.output.filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    const refusal = parts.find((p) => p.type === 'refusal');
    if (refusal) throw new Error(`OpenAI declined: ${refusal.refusal ?? 'no reason given'}`);
    const text = parts.find((p) => p.type === 'output_text')?.text;
    if (!text) throw new Error('OpenAI returned no text');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HttpError('OpenAI returned invalid JSON', 200, text.slice(0, 300));
    }
    return { data: req.parse.parse(json), model, tokens: (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0) };
  }

  const post = (body: Record<string, unknown>, timeoutMs: number) =>
    requestJson<unknown>(`${baseUrl}/v1/responses`, { provider: 'openai', method: 'POST', headers, timeoutMs, retries: 1, log: cfg.log, body });

  /** Background mode: POST returns at once with an id; GET /v1/responses/{id} until it is done or the wait runs out. */
  async function inBackground(body: Record<string, unknown>, bg: { maxWaitMs: number; pollMs?: number }, fallbackTimeoutMs?: number) {
    let started: z.infer<typeof responseSchema>;
    try {
      started = responseSchema.parse(await post({ ...body, background: true, store: true }, 60_000));
    } catch (err) {
      // Refused (old model, no background support): one normal request with the whole wait as its timeout.
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        return responseSchema.parse(await post(body, fallbackTimeoutMs ?? bg.maxWaitMs));
      }
      throw err;
    }
    if (!started.id || DONE.has(started.status ?? '')) return started;
    const until = Date.now() + bg.maxWaitMs;
    let res = started;
    while (!DONE.has(res.status ?? '')) {
      if (Date.now() > until) {
        await requestJson(`${baseUrl}/v1/responses/${started.id}/cancel`, { provider: 'openai', method: 'POST', headers, timeoutMs: 15_000, retries: 0, log: cfg.log, body: {} }).catch(() => undefined);
        throw new Error(`OpenAI did not finish within ${Math.round(bg.maxWaitMs / 60_000)} minutes`);
      }
      await sleep(bg.pollMs ?? 5_000);
      res = responseSchema.parse(await requestJson<unknown>(`${baseUrl}/v1/responses/${started.id}`, { provider: 'openai', method: 'GET', headers, timeoutMs: 30_000, retries: 2, log: cfg.log }));
    }
    return res;
  }

  return { model, generateJson };
}

export type OpenAiClient = ReturnType<typeof createOpenAiClient>;
