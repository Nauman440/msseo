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
    usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).passthrough().optional(),
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
};

export function createOpenAiClient(cfg: OpenAiConfig) {
  const model = cfg.model || DEFAULT_OPENAI_MODEL;
  const baseUrl = (cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');

  async function generateJson<T>(req: JsonRequest<T>): Promise<{ data: T; model: string; tokens: number }> {
    const raw = await requestJson<unknown>(`${baseUrl}/v1/responses`, {
      provider: 'openai',
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      timeoutMs: 120_000,
      retries: 1,
      log: cfg.log,
      body: {
        model,
        input: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_output_tokens: req.maxOutputTokens ?? 4000,
        text: { format: { type: 'json_schema', name: req.name, schema: req.jsonSchema, strict: true } },
      },
    });
    const res = responseSchema.parse(raw);
    if (res.status === 'incomplete') throw new Error(`OpenAI reply was cut off (${res.incomplete_details?.reason ?? 'incomplete'})`);
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

  return { model, generateJson };
}

export type OpenAiClient = ReturnType<typeof createOpenAiClient>;
