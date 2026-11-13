import type { AiLevel, AiRecommendations, Audience } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { TonePill } from '@/components/ui/Pills';

/* No md:/lg: classes: this card is also used in the PDF (print viewport ≈ 673px). */

const LEVEL_TEXT: Record<AiLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export function AiRecommendationsCard({ ai, mode, className }: { ai: AiRecommendations; mode: Audience; className?: string }) {
  return (
    <Card
      title="AI recommendations"
      eyebrow={mode === 'expert' ? `Written by ${ai.model} from this audit's findings` : 'Your step-by-step fix plan'}
      badge={<TonePill tone="primary">AI-assessed</TonePill>}
      className={className}
    >
      <p className="text-[15px] leading-7 text-ink-2">{ai.summary[mode]}</p>
      <ol className="mt-6 space-y-5">
        {ai.items.map((r, i) => (
          <li key={r.title} className="pdf-avoid flex gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text tabular" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                <h3 className="font-display text-base font-semibold tracking-tight">{r.title}</h3>
                <span className="text-xs text-ink-3">
                  Impact <strong className="font-semibold text-ink-2">{LEVEL_TEXT[r.impact]}</strong> · Effort{' '}
                  <strong className="font-semibold text-ink-2">{LEVEL_TEXT[r.effort]}</strong>
                  {mode === 'expert' && r.ruleIds.length > 0 && <span className="tabular"> · {r.ruleIds.join(', ')}</span>}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-ink-2">{r.why}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-ink marker:text-ink-3">
                {r.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-ink-3">AI-written from the audit results. Review each step before making changes.</p>
    </Card>
  );
}
