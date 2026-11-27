import { isTaskDone, orderTasks, ownerText, PLUGIN_TYPES, SITE_TASK, taskFinished, type ActionItem, type WorkItem, type WpChangeType } from '@seo/core';
import { ItemRow } from './ItemRow';

/**
 * The autopilot card's two lists, task by task: what is done (each change with Undo) and what needs
 * a person (changes the plugin cannot make, drafts to paste, and tasks for the client, our team or a
 * developer). Everything else (queued, planned for a later week) is in the To do list below.
 */
const PEOPLE: Record<string, string> = { team: 'Our team', client: 'You', developer: 'A developer' };
const plugin = (i: WorkItem) => PLUGIN_TYPES.includes(i.type as WpChangeType);

type TaskBlock = { id: string; title: string; note?: string; items: WorkItem[] };

function Block({ t, domain, undo }: { t: TaskBlock; domain: string; undo?: boolean }) {
  return (
    <li className="flex flex-col">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
          <span className="min-w-0 break-words font-semibold">{t.title}</span>
          {t.note && <span className="text-[13px] text-ink-2">{t.note}</span>}
        </summary>
        {t.items.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {t.items.map((i) => <ItemRow key={i.id} i={i} domain={domain} undo={undo && (i.status === 'applied' || i.status === 'verified')} />)}
          </ul>
        )}
      </details>
    </li>
  );
}

function Fold({ title, blocks, domain, undo, open, empty }: { title: string; blocks: TaskBlock[]; domain: string; undo?: boolean; open?: boolean; empty: string }) {
  return (
    <details open={open} className="rounded-[14px] border border-border">
      <summary className="cursor-pointer px-5 py-3 font-semibold">{title} <span className="text-ink-2 tabular">({blocks.length})</span></summary>
      {blocks.length ? <ul className="divide-y divide-border border-t border-border">{blocks.map((t) => <Block key={t.id} t={t} domain={domain} undo={undo} />)}</ul> : <p className="border-t border-border px-5 py-3 text-sm text-ink-2">{empty}</p>}
    </details>
  );
}

export function TaskResults({ actions, month, items, domain }: { actions: ActionItem[]; month: number; items: WorkItem[]; domain: string }) {
  const mine = (id: string) => items.filter((i) => i.actionId === id);
  const made = (list: WorkItem[]) => list.filter((i) => i.status === 'applied' || i.status === 'verified');
  // Tasks done this plan month (and earlier months' tasks finished by the autopilot), in plan order.
  const doneTasks = actions
    .filter((a) => a.status !== 'dismissed' && (a.plan?.month ?? 1) <= month && (isTaskDone(a) || taskFinished(a, items)))
    .sort((x, y) => (x.plan?.month ?? 0) - (y.plan?.month ?? 0) || (x.plan?.week ?? 0) - (y.plan?.week ?? 0));
  const done: TaskBlock[] = doneTasks.map((a) => {
    const list = mine(a.id).filter((i) => plugin(i) && i.status !== 'rolled_back');
    const changed = made(list).length;
    const covered = list.filter((i) => i.coveredBy).length;
    return {
      id: a.id,
      title: ownerText(a.title),
      note: changed ? `${changed} change${changed === 1 ? '' : 's'} made` : covered ? 'Done by another task' : list.length ? 'Already right' : 'Marked done',
      items: list.filter((i) => i.status !== 'keep' || !list.some((x) => x.status !== 'keep')),
    };
  });
  const site = made(mine(SITE_TASK).filter(plugin));
  if (site.length) done.unshift({ id: SITE_TASK, title: 'Site essentials (sitemap, llms.txt, main headings)', note: `${site.length} change${site.length === 1 ? '' : 's'} made`, items: site });

  // Needs a person: this month's open tasks (in order) with changes the plugin could not make, or work for people.
  const open = orderTasks(actions, month);
  const person: TaskBlock[] = [];
  for (const a of open) {
    const list = mine(a.id);
    const stuck = list.filter((i) => i.status === 'needs_human' || i.status === 'failed' || i.status === 'rolled_back' || (i.status === 'skipped' && i.reason?.startsWith('Failed twice')));
    const people = list.filter((i) => PEOPLE[i.status]);
    const manual = a.exec?.actionType === 'manual';
    if (!stuck.length && !people.length && !manual) continue;
    const who = PEOPLE[a.exec?.manualFor ?? people[0]?.status ?? ''] ?? null;
    const undone = stuck.filter((i) => i.status === 'rolled_back').length;
    person.push({ id: a.id, title: ownerText(a.title), note: undone ? `${undone} undone by a person · press Redo to make ${undone === 1 ? 'it' : 'them'} again` : stuck.length ? `${stuck.length} change${stuck.length === 1 ? '' : 's'} to make by hand` : who ? `For: ${who.toLowerCase()}` : undefined, items: stuck });
  }
  const siteStuck = mine(SITE_TASK).filter((i) => i.status === 'needs_human' || i.status === 'failed' || i.status === 'rolled_back');
  if (siteStuck.length) person.unshift({ id: SITE_TASK, title: 'Site essentials', note: `${siteStuck.length} to do by hand`, items: siteStuck });

  return (
    <div className="flex flex-col gap-3">
      <Fold title="Done" blocks={done} domain={domain} undo open={done.length > 0} empty="Nothing is done yet. Finished tasks show here with every change made, each with Undo." />
      <Fold title="Needs a person" blocks={person} domain={domain} open={person.length > 0} empty="Nothing needs a person right now." />
    </div>
  );
}
