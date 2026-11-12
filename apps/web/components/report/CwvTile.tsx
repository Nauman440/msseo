import type { CwvMetric } from '@seo/core';
import { CWV_LABEL, CWV_TONE } from '@/lib/tones';
import { TonePill } from '@/components/ui/Pills';

export function CwvTile({ metric }: { metric: CwvMetric }) {
  return (
    <div className="flex flex-col rounded-tile bg-sunken p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">{metric.id}</span>
        <TonePill tone={CWV_TONE[metric.rating]}>{CWV_LABEL[metric.rating]}</TonePill>
      </div>
      <p className="mt-3 font-display text-[28px] font-semibold leading-none tracking-display tabular">{metric.value}</p>
      <p className="mt-2 text-[13px] text-ink-2">{metric.label}</p>
      <p className="mt-0.5 text-xs text-ink-3">{metric.threshold}</p>
    </div>
  );
}
