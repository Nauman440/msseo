import { openActions, type ActionWorkspace, ownerText } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { Roadmap } from './Roadmap';

/**
 * Report and PDF section (Module 12.3 + 12.7): the top 10 open actions in plain language and the
 * 6-month roadmap. No md:/lg: classes (PDF print width).
 */
export function ActionPlanSummary({ ws, now, href, showTop = true }: { ws: ActionWorkspace; now?: Date; href?: string; /** Customers' screens leave out the "Top 10" list. */ showTop?: boolean }) {
  const top = openActions(ws).slice(0, 10);
  if (!ws.actions.some((a) => a.status !== 'dismissed')) return null;
  return (
    <div className="flex flex-col gap-6">
      {showTop && top.length > 0 && (
        <Card title="Top 10 to do now" eyebrow="Action plan" className="pdf-avoid" badge={href ? <a href={href} className="text-sm font-semibold text-primary-text hover:underline">Open the plan</a> : undefined}>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] leading-6">
            {top.map((a) => (
              <li key={a.id} className="pl-1">
                <span className="font-semibold">{ownerText(a.title)}</span>
                {a.dueDate && <span className="text-ink-3"> · by {new Date(a.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>}
              </li>
            ))}
          </ol>
        </Card>
      )}
      <Card title="6-month roadmap" eyebrow="Action plan" className="pdf-avoid">
        <Roadmap ws={ws} now={now} />
      </Card>
    </div>
  );
}
