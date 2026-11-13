import { z } from 'zod';

/** Page-limit choices on the new-audit form (replaces the free-number crawl limit). */
export const PAGE_LIMIT_OPTIONS = [
  { value: 10, label: '1–10 pages' },
  { value: 20, label: '11–20 pages' },
  { value: 30, label: '21–30 pages' },
  { value: 40, label: '31–40 pages' },
  { value: 50, label: '41–50 pages' },
] as const;

export type PageLimit = (typeof PAGE_LIMIT_OPTIONS)[number]['value'];

export const DEFAULT_PAGE_LIMIT: PageLimit = 10;
export const MAX_PAGE_LIMIT: PageLimit = 50;

const pageLimitValues = PAGE_LIMIT_OPTIONS.map((o) => o.value) as [PageLimit, ...PageLimit[]];

/** Adds https:// when missing and requires a hostname with a dot. */
export function normaliseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Validates the new-audit form / API body (§5.1). */
export const newAuditSchema = z.object({
  url: z
    .string()
    .transform((v, ctx) => {
      const url = normaliseUrl(v);
      if (!url) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid website address' });
      return url ?? '';
    }),
  audience: z.enum(['client', 'expert']).default('client'),
  pageLimit: z.coerce
    .number()
    .refine((v): v is PageLimit => (pageLimitValues as number[]).includes(v), 'Choose a page limit from the list')
    .default(DEFAULT_PAGE_LIMIT),
  jsRendering: z.coerce.boolean().default(true),
  /** Add LLM-written recommendations to the report (needs OPENAI_API_KEY). */
  aiRecommendations: z.coerce.boolean().default(false),
  gscProperty: z.string().trim().min(1).nullable().default(null),
  /** Optional: send the full report (PDF) to this address when the audit completes. */
  notifyEmail: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type NewAuditInput = z.infer<typeof newAuditSchema>;
