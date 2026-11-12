import type { Category, Ice, RuleMeta, RuleResult, ScoreLabel } from '../types';
import { CATEGORY_WEIGHT, SCORE_LABELS, SEVERITY_WEIGHT } from './constants';

const EXCLUDED = new Set(['info', 'skipped', 'manual']);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export type ScoredRule = { meta: RuleMeta; result: RuleResult };

/** Rule score 0–1, or null when the result does not count towards scoring. */
export function ruleScore(result: RuleResult, scope: RuleMeta['scope']): number | null {
  if (EXCLUDED.has(result.status)) return null;
  if (result.status === 'pass') return 1;

  if (scope === 'site') return result.status === 'warn' ? 0.5 : 0;

  const applicable = result.applicableCount ?? 0;
  const affected = result.affectedCount ?? 0;
  let score = applicable > 0 ? clamp01(1 - affected / applicable) : 0;
  if (result.status === 'warn') score = Math.min(score, 0.5);
  if (result.status === 'fail' && result.severity === 'critical') score = 0;
  return score;
}

export function ruleWeight(result: RuleResult, meta: RuleMeta): number {
  if (meta.weight !== undefined) return meta.weight;
  return result.severity === 'info' ? 0 : SEVERITY_WEIGHT[result.severity];
}

/** Category scores (0–100). Categories with no evaluated rule are omitted. */
export function categoryScores(rules: ScoredRule[]): Partial<Record<Category, number>> {
  const acc = new Map<Category, { num: number; den: number }>();
  for (const { meta, result } of rules) {
    const score = ruleScore(result, meta.scope);
    const weight = ruleWeight(result, meta);
    if (score === null || weight === 0) continue;
    const entry = acc.get(meta.category) ?? { num: 0, den: 0 };
    entry.num += weight * score;
    entry.den += weight;
    acc.set(meta.category, entry);
  }
  const out: Partial<Record<Category, number>> = {};
  for (const [category, { num, den }] of acc) out[category] = Math.round((num / den) * 100);
  return out;
}

/** Weighted mean of category scores, re-normalised over the categories present. */
export function overallScore(categories: Partial<Record<Category, number>>): number {
  let num = 0;
  let den = 0;
  for (const [category, score] of Object.entries(categories) as [Category, number][]) {
    num += CATEGORY_WEIGHT[category] * score;
    den += CATEGORY_WEIGHT[category];
  }
  return den === 0 ? 0 : Math.round(num / den);
}

export function scoreLabel(score: number): ScoreLabel {
  return SCORE_LABELS.find((band) => score >= band.min)?.label ?? 'Critical';
}

/** Recompute with every critical and high rule treated as passing. */
export function scoreAfterFixes(rules: ScoredRule[]): number {
  const fixed = rules.map(({ meta, result }) =>
    result.severity === 'critical' || result.severity === 'high'
      ? { meta, result: { ...result, status: 'pass' as const } }
      : { meta, result },
  );
  return overallScore(categoryScores(fixed));
}

/** Action-plan priority = impact × confidence ÷ effort. */
export function icePriority(ice: Ice): number {
  return Math.round(((ice.impact * ice.confidence) / ice.effort) * 10) / 10;
}

export * from './constants';
