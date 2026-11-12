import type { Audience, CheckRow } from '@seo/core';
import { StatusPill } from '@/components/ui/Pills';

export function StatusRow({ row, mode }: { row: CheckRow; mode: Audience }) {
  return (
    <li className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <StatusPill status={row.status} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-6 text-ink">
          {mode === 'expert' && <span className="mr-2 font-mono text-xs text-ink-3">{row.ruleId}</span>}
          {row.message[mode]}
        </p>
        {row.url && (
          <p className="mt-0.5 truncate font-mono text-xs text-primary-text" title={row.url}>
            {row.url}
          </p>
        )}
        {row.sub && <p className="mt-0.5 text-[13px] text-ink-3">{row.sub[mode]}</p>}
      </div>
    </li>
  );
}
