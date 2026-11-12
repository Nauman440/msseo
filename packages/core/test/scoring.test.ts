import { describe, expect, it } from 'vitest';
import {
  categoryScores,
  icePriority,
  overallScore,
  ruleScore,
  scoreAfterFixes,
  scoreLabel,
  type RuleMeta,
  type RuleResult,
  type ScoredRule,
} from '../src';

const meta = (over: Partial<RuleMeta> = {}): RuleMeta => ({
  id: '1.0.0',
  module: 1,
  category: 'technical',
  title: { client: 't', expert: 't' },
  method: 'auto',
  scope: 'page',
  explain: { client: '', expert: '' },
  fix: { client: '', expert: '' },
  ice: { impact: 3, confidence: 3, effort: 3 },
  ...over,
});

const result = (over: Partial<RuleResult> = {}): RuleResult => ({
  ruleId: '1.0.0',
  status: 'fail',
  severity: 'high',
  examples: [],
  message: { client: '', expert: '' },
  ...over,
});

describe('ruleScore', () => {
  it('scores site rules 1 / 0.5 / 0', () => {
    expect(ruleScore(result({ status: 'pass' }), 'site')).toBe(1);
    expect(ruleScore(result({ status: 'warn' }), 'site')).toBe(0.5);
    expect(ruleScore(result({ status: 'fail' }), 'site')).toBe(0);
  });

  it('excludes info, skipped and manual', () => {
    for (const status of ['info', 'skipped', 'manual'] as const) {
      expect(ruleScore(result({ status }), 'site')).toBeNull();
    }
  });

  it('uses the affected share for page rules', () => {
    expect(ruleScore(result({ affectedCount: 25, applicableCount: 100 }), 'page')).toBe(0.75);
  });

  it('caps warn at 0.5 and zeroes critical fails', () => {
    expect(ruleScore(result({ status: 'warn', affectedCount: 1, applicableCount: 100 }), 'page')).toBe(0.5);
    expect(
      ruleScore(result({ severity: 'critical', affectedCount: 1, applicableCount: 100 }), 'page'),
    ).toBe(0);
  });
});

describe('category and overall scores', () => {
  const rules: ScoredRule[] = [
    { meta: meta({ scope: 'site' }), result: result({ status: 'pass', severity: 'critical' }) },
    { meta: meta({ scope: 'site' }), result: result({ status: 'fail', severity: 'low' }) },
    { meta: meta({ scope: 'site', category: 'onpage' }), result: result({ status: 'warn', severity: 'medium' }) },
  ];

  it('weights rules by severity', () => {
    expect(categoryScores(rules)).toEqual({ technical: 91, onpage: 50 });
  });

  it('re-normalises over present categories', () => {
    expect(overallScore({ technical: 91, onpage: 50 })).toBe(Math.round((91 * 30 + 50 * 25) / 55));
  });

  it('treats critical and high as fixed for score after fixes', () => {
    const failing: ScoredRule[] = [
      { meta: meta({ scope: 'site' }), result: result({ status: 'fail', severity: 'high' }) },
    ];
    expect(scoreAfterFixes(failing)).toBe(100);
  });
});

describe('labels and priority', () => {
  it('maps score bands', () => {
    expect(scoreLabel(95)).toBe('Good');
    expect(scoreLabel(70)).toBe('Needs work');
    expect(scoreLabel(50)).toBe('Poor');
    expect(scoreLabel(12)).toBe('Critical');
  });

  it('computes ICE priority', () => {
    expect(icePriority({ impact: 5, confidence: 4, effort: 2 })).toBe(10);
  });
});
