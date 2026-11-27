// Plan executor proof against the local WordPress (http://localhost:8089): a 4-task plan is mapped,
// turned into exact changes, applied one task at a time in plan order, verified live, tasks marked
// done; then one change is undone and the original value is checked on the live page.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  collectInventory, createWordPressClient, executionPlan, fetchPageContents, generateWorkItems, mapPlanTasks, orderTasks,
  runWorkItems, taskFinished, taskProgress, type ActionItem, type ActionWorkspace,
} from '../../../packages/core/src/index';

const D = process.env.WP_E2E_DIR ?? '/tmp/msscore-wp';
const site = 'http://localhost:8089';
const wp = createWordPressClient({ siteUrl: site, user: 'admin', password: readFileSync(`${D}/apppass.txt`, 'utf8').trim(), signingKey: readFileSync(`${D}/key.txt`, 'utf8').trim() });
const fetchPage = async (url: string) => {
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}c=${Date.now()}`, { redirect: 'manual' });
  return { status: r.status, html: r.status === 200 ? await r.text() : '', location: r.headers.get('location') };
};
const titleOf = async (path: string) => (await (await fetch(`${site}${path}?c=${Date.now()}`)).text()).match(/<title>([^<]*)/)?.[1];
let n = 0;
const task = (title: string, o: Partial<NonNullable<ActionItem['plan']>> & { severity?: ActionItem['severity']; urls?: string[]; changes?: ActionItem['changes'] }): ActionItem => ({
  id: `t${++n}`, source: { kind: 'ai', planId: 'proof', taskId: o.taskId! }, title, detail: '', severity: o.severity ?? 'medium', impact: 3, confidence: 3, effort: 2, priority: 4,
  urls: o.urls ?? [], owner: null, dueDate: null, approval: 'none', approvedAt: null, approvedBy: null, status: 'todo', bucket: 'd30', bucketLocked: false, before: null, doneAt: null, checkpoints: [], createdAt: '', updatedAt: '', changes: o.changes,
  plan: { taskId: o.taskId!, month: 1, week: o.week ?? 1, doer: o.doer ?? 'automatic', category: 'on_page', why: '', change: o.change ?? '', keywords: [], dependsOn: o.dependsOn ?? [], successCheck: '', checkAfterDays: 14, ...(o.siteWideItem ? { siteWideItem: o.siteWideItem } : {}) },
} as ActionItem);

async function main() {
  const inventory = await collectInventory(wp, { accountId: 'proof', domain: 'localhost:8089' });
  const contact = inventory.items.find((i) => i.url?.includes('/contact'))!.url!;
  const home = inventory.items.find((i) => i.isFrontPage)!.url!;
  // In the plan the description task comes first in the list but depends on the title task.
  let ws: ActionWorkspace = { domain: 'localhost:8089', updatedAt: null, actions: [
    task('Outreach to 5 dog-bed directories', { taskId: '1.01', doer: 'team', severity: 'critical' }),
    task('New meta description for the homepage', { taskId: '1.03', dependsOn: ['1.02'], urls: [home], changes: [{ id: 'meta', label: 'Meta description', now: '', suggested: 'Orthopaedic memory foam dog beds handmade in Leeds for older and larger dogs. Free UK delivery over £50 and a 100-night trial. Order yours today.', data: { url: home } }] }),
    task('Fix the title tag on Contact', { taskId: '1.02', severity: 'high', urls: [contact], changes: [{ id: 'title', label: 'Title tag', now: '', suggested: 'Contact Our Orthopaedic Dog Bed Makers in Leeds | Test Shop', data: { url: contact } }] }),
    task('One main heading on every page', { taskId: '1.04', week: 2, siteWideItem: 'h1' }),
  ] };
  const indexable = inventory.items.filter((i) => i.url && !i.noindex && ['page', 'post'].includes(i.type)).map((i) => i.url!);
  ws = mapPlanTasks(ws, indexable).ws;
  console.log('\n== A. Tasks with their action type');
  for (const a of ws.actions) console.log(`  ${a.plan!.taskId} ${a.title} → ${a.exec!.actionType}${a.exec!.manualFor ? ` (${a.exec!.manualFor})` : ''}, targets ${a.exec!.targets.length}`);
  console.log('\n== C. Order:', orderTasks(ws.actions, 1).map((a) => a.plan!.taskId).join(' → '));

  const live = await fetchPageContents(indexable);
  const gen = await generateWorkItems({ accountId: 'proof', domain: 'localhost:8089', actions: orderTasks(ws.actions, 1), inventory, live, profile: { name: 'Test Shop', places: ['Leeds'], brands: [], services: ['dog beds'], bannedWords: [], competitors: [] }, keywords: new Map(), deadUrls: [], robotsTxt: null, idSalt: `proof-${Date.now()}` });
  let items = gen.items.filter((i) => i.actionId !== 'autopilot'); // site files are proven by e2e.ts; keep the proof to the plan's tasks
  console.log('\n== B. Exact changes per task (before → after)');
  for (const i of items) console.log(`  [${i.actionId}] ${i.type} ${i.label}: ${i.status}\n      before: ${JSON.stringify(i.before)}\n      after:  ${JSON.stringify(i.newValue)}${i.reason ? `\n      note: ${i.reason}` : ''}`);

  for (let run = 1; run <= 3; run++) {
    const q = executionPlan(ws.actions, items, { month: 1, onlyNext: true });
    if (!q.order.length) break;
    console.log(`\n== Run next task now #${run}: ${q.tasks.map((t) => `${t.title} [${t.step}]`).join(' · ')}`);
    const r = await runWorkItems(items, { wp, fetchPage }, { keyPages: [home], firstRun: run === 1, order: q.order });
    items = r.items;
    for (const id of q.order) {
      const i = items.find((x) => x.id === id)!;
      console.log(`  /apply ${i.type} → ${i.status}${i.verifiedAt ? ' (seen on the live page)' : ''} at ${i.appliedAt}`);
    }
    console.log(`  run: applied ${r.run.applied}, verified ${r.run.verified}, failed ${r.run.failed}, undo tested ${r.run.undoTested ?? false}, paused ${r.run.paused}`);
    ws = { ...ws, actions: ws.actions.map((a) => (taskFinished(a, items) ? { ...a, status: 'done' as const } : a)) };
    for (const a of ws.actions) console.log(`  ${a.plan!.taskId} ${a.title}: ${taskProgress(a, items, { actions: ws.actions }).label}`);
  }

  console.log('\n== WordPress admin "MS SCORE Autopilot" page (text)');
  const f = `${D}/proof-snippet.php`;
  writeFileSync(f, `<?php define('WP_USE_THEMES', false); require '${D}/core/wp-load.php'; require_once ABSPATH . 'wp-admin/includes/template.php'; wp_set_current_user(1); ob_start(); msscore_admin_page(); echo ob_get_clean();`);
  const admin = execSync(`php ${f}`, { encoding: 'utf8' });
  console.log(admin.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
  console.log('  Undo buttons on the page:', (admin.match(/>\s*Undo\s*</g) ?? []).length);

  const t = items.find((i) => i.type === 'meta_title' && i.status === 'verified')!;
  const path = new URL(t.url!).pathname;
  console.log('\n== Roll back one item:', t.label);
  console.log('  live title now:   ', await titleOf(path));
  console.log('  /rollback:', JSON.stringify(await wp.rollback(t.changeId ?? t.id, 'proof')));
  console.log('  live title after: ', await titleOf(path), ' (before value was', JSON.stringify(t.before), ')');
  // Clean up: undo the rest so the test site is as it was.
  for (const i of items.filter((x) => ['applied', 'verified'].includes(x.status) && x.id !== t.id)) await wp.rollback(i.changeId ?? i.id, 'proof clean-up');
}
main().catch((e) => { console.error(e); process.exit(1); });
