import type { Audience, CheckCard, RuleStatus } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { IssueBadge } from '@/components/ui/Pills';
import { HBarList } from './HBarList';
import { StackedBar } from './StackedBar';
import { StatusRow } from './StatusRow';

const RANK: Record<RuleStatus, number> = { fail: 3, warn: 2, info: 1, manual: 1, skipped: 0, pass: 0 };

export function worstStatus(card: CheckCard): RuleStatus {
  return card.rows.reduce<RuleStatus>((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), 'pass');
}

/** §8: client mode hides all-pass and expert-only cards, plus info/manual rows. */
export function visibleRows(card: CheckCard, mode: Audience) {
  if (mode === 'expert') return card.rows;
  return card.rows.filter((r) => r.status !== 'info' && r.status !== 'manual' && r.status !== 'skipped');
}

export function isCardVisible(card: CheckCard, mode: Audience): boolean {
  if (mode === 'expert') return true;
  if (card.expertOnly) return false;
  return visibleRows(card, mode).some((r) => r.status === 'fail' || r.status === 'warn');
}

export function CheckCardView({ card, mode }: { card: CheckCard; mode: Audience }) {
  const rows = visibleRows(card, mode);
  const issues = rows.filter((r) => r.status === 'fail' || r.status === 'warn').length;
  return (
    <Card title={card.title} badge={<IssueBadge count={issues} worst={worstStatus(card)} />}>
      {card.chart?.kind === 'stacked' && <StackedBar segments={card.chart.segments} className="mb-5" />}
      {card.chart?.kind === 'hbar' && (
        <div className="mb-5">
          <HBarList rows={card.chart.rows} />
        </div>
      )}
      <ul>
        {rows.map((row) => (
          <StatusRow key={row.ruleId} row={row} mode={mode} />
        ))}
      </ul>
    </Card>
  );
}
