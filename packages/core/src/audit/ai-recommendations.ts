import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import type { AiRecommendations, ReportModel } from '../types';

const level = z.enum(['low', 'medium', 'high']);

const replySchema = z.object({
  summary_client: z.string(),
  summary_expert: z.string(),
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        why: z.string(),
        steps: z.array(z.string()),
        rule_ids: z.array(z.string()),
        impact: level,
        effort: level,
      }),
    )
    .max(10),
});

const LEVEL = { type: 'string', enum: ['low', 'medium', 'high'] };
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary_client', 'summary_expert', 'recommendations'],
  properties: {
    summary_client: { type: 'string', description: '2–3 sentences for a business owner, no jargon.' },
    summary_expert: { type: 'string', description: '2–3 sentences for an SEO specialist.' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'steps', 'rule_ids', 'impact', 'effort'],
        properties: {
          title: { type: 'string' },
          why: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          rule_ids: { type: 'array', items: { type: 'string' } },
          impact: LEVEL,
          effort: LEVEL,
        },
      },
    },
  },
};

const SYSTEM = `You are a senior technical SEO consultant at an agency. You receive the findings of an automated SEO audit as JSON.
Write a prioritised action plan of 5–8 recommendations, most valuable first.
Rules:
- Base every recommendation only on the findings provided. Do not invent problems, numbers or URLs.
- Group related findings into one recommendation where they share a fix; list their rule ids in rule_ids.
- Each step is one concrete action someone can carry out (e.g. which setting, which tag, which pages).
- If the CMS/platform is unknown, give platform-neutral steps.
- Plain, direct English. No marketing language.`;

/** Compact, deterministic summary of the report for the prompt (no page HTML is sent). */
export function aiInput(report: ReportModel) {
  const issues = report.issues ?? [];
  return {
    site: report.url,
    pagesAudited: report.pagesCrawled,
    score: report.overall.score,
    categories: report.categories.map((c) => `${c.label}: ${c.score}`),
    coreWebVitals: report.cwv ? report.cwv.metrics.map((m) => `${m.label} ${m.value} (${m.rating}, ${report.cwv!.source} data)`) : 'not measured',
    notices: (report.notices ?? []).map((n) => n.expert),
    findings: issues.slice(0, 40).map((i) => ({
      id: i.ruleId,
      severity: i.severity,
      status: i.status,
      check: i.title.expert,
      result: i.message.expert,
      affected: i.affectedCount !== undefined ? `${i.affectedCount}${i.applicableCount ? ` of ${i.applicableCount}` : ''}` : undefined,
      exampleUrls: i.urls.slice(0, 5),
      standardFix: i.fix.expert,
    })),
  };
}

export async function generateAiRecommendations(report: ReportModel, client: OpenAiClient): Promise<{ ai: AiRecommendations; tokens: number }> {
  const { data, model, tokens } = await client.generateJson({
    system: SYSTEM,
    user: `Audit findings:\n${JSON.stringify(aiInput(report), null, 1)}`,
    name: 'seo_recommendations',
    jsonSchema: JSON_SCHEMA,
    parse: replySchema,
  });
  const known = new Set((report.issues ?? []).map((i) => i.ruleId));
  return {
    tokens,
    ai: {
      provider: 'openai',
      model,
      generatedAt: new Date().toISOString(),
      summary: { client: data.summary_client, expert: data.summary_expert },
      items: data.recommendations.map((r) => ({
        title: r.title,
        why: r.why,
        steps: r.steps,
        // Drop ids the model made up.
        ruleIds: r.rule_ids.filter((id) => known.has(id)),
        impact: r.impact,
        effort: r.effort,
      })),
    },
  };
}
