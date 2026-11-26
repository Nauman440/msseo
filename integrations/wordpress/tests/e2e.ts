import { execSync } from 'node:child_process';
// Phase 2 end-to-end against the local WordPress (http://localhost:8089).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createWordPressClient, newSigningKey, type WpChange } from '../../../packages/core/src/index';

const D: string = process.env.WP_E2E_DIR ?? '/tmp/msscore-wp';
const site = 'http://localhost:8089';
const ids = JSON.parse(readFileSync(`${D}/ids.json`, 'utf8')) as { img: number; gut: number; classic: number; post: number };
const pw = readFileSync(`${D}/apppass.txt`, 'utf8').trim();
let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails++;
};
const html = async (path: string) => (await fetch(`${site}${path}${path.includes('?') ? '&' : '?'}nocache=${Date.now()}`)).text();
const raw = async (path: string) => {
  const r = await fetch(`${site}${path}`, { redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location'), body: r.status === 200 ? await r.text() : '' };
};
let n = 0;
const cid = (t: string) => `e2e-${Date.now().toString(36)}-${t}-${n++}`;

async function main() {
  const keyFile = `${D}/key.txt`;
  let key = existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '';
  if (!key) {
    key = newSigningKey();
    await createWordPressClient({ siteUrl: site, user: 'admin', password: pw }).setKey(key);
    writeFileSync(keyFile, key);
  }
  const wp = createWordPressClient({ siteUrl: site, user: 'admin', password: pw, signingKey: key });
  const status = await wp.status();
  ok(status.version === '1.3.1' && status.signed && status.paused === false, 'signed status 1.3.0', status.seo_backend as string);

  async function roundTrip(name: string, change: Omit<WpChange, 'change_id'>, path: string, seen: (h: string) => boolean, gone: (h: string) => boolean) {
    const c = { ...change, change_id: cid(change.type) } as WpChange;
    const r = await wp.apply(c);
    ok(r.status === 'applied', `${name}: applied`, r.reason ?? '');
    ok(seen(await html(path)), `${name}: visible on the live page`);
    const again = await wp.apply(c);
    ok(again.status === 'applied' && again.repeat === true, `${name}: same change_id is not applied twice`);
    const rb = await wp.rollback(c.change_id, 'e2e');
    ok(rb.status === 'rolled_back', `${name}: rolled back`, rb.reason ?? '');
    ok(gone(await html(path)), `${name}: back to before on the live page`);
    const rb2 = await wp.rollback(c.change_id);
    ok(rb2.status === 'rolled_back' && rb2.repeat === true, `${name}: second rollback is a no-op`);
  }

  const T = 'Orthopaedic Dog Beds Made in Britain | Test Shop';
  await roundTrip('meta_title', { type: 'meta_title', target: { post_id: ids.classic }, new_value: T }, '/contact/', (h) => h.includes(`<title>${T}`) || h.includes('<title>Orthopaedic'), (h) => h.includes('<title>Contact'));
  const MD = 'Memory foam orthopaedic dog beds, made in Britain for older dogs. Free UK delivery over £50 and 100-night trial. Order yours today.';
  await roundTrip('meta_description', { type: 'meta_description', target: { post_id: ids.gut }, new_value: MD }, '/', (h) => h.includes('name="description" content="Memory foam'), (h) => !h.includes('Memory foam orthopaedic dog beds, made'));
  await roundTrip('canonical', { type: 'canonical', target: { post_id: ids.classic }, new_value: `${site}/dog-beds/` }, '/contact/', (h) => /rel="canonical" href="http:\/\/localhost:8089\/dog-beds\/"/.test(h), (h) => /rel="canonical" href="http:\/\/localhost:8089\/contact\/"/.test(h));
  await roundTrip('robots_noindex', { type: 'robots_noindex', target: { post_id: ids.post }, new_value: 'noindex' }, '/old-guide/', (h) => /name=['"]robots['"][^>]*noindex/.test(h), (h) => !/name=['"]robots['"][^>]*noindex/.test(h));
  await roundTrip('og_tags', { type: 'og_tags', target: { post_id: ids.gut }, new_value: { title: 'Dog beds OG', description: 'OG description', image: `${site}/wp-content/uploads/dog-bed.jpg` } }, '/', (h) => h.includes('property="og:title" content="Dog beds OG"') && h.includes('twitter:card'), (h) => !h.includes('Dog beds OG'));
  await roundTrip('image_alt', { type: 'image_alt', target: { attachment_id: ids.img }, new_value: { alt: 'Grey orthopaedic dog bed with memory foam', post_ids: [ids.gut] } }, '/', (h) => h.includes('alt="Grey orthopaedic dog bed with memory foam"'), (h) => !h.includes('Grey orthopaedic dog bed'));
  await roundTrip('heading_fix demote (Gutenberg)', { type: 'heading_fix', target: { post_id: ids.gut }, new_value: { action: 'demote_extra_h1', keep: 0 } }, '/', (h) => (h.match(/<h1\b/g) ?? []).length === 1 && h.includes('wp-block-post-title') && h.includes('Second H1</h2>'), (h) => h.includes('Second H1</h1>'));
  await roundTrip('heading_fix demote (Classic)', { type: 'heading_fix', target: { post_id: ids.classic }, new_value: { action: 'demote_extra_h1' } }, '/contact/', (h) => h.includes('Extra</h2>') && h.includes('Contact us</h1>'), (h) => h.includes('Extra</h1>'));
  await roundTrip('heading_fix order', { type: 'heading_fix', target: { post_id: ids.gut }, new_value: { action: 'fix_order' } }, '/', (h) => h.includes('Sizes</h2>'), (h) => h.includes('Sizes</h4>'));
  await roundTrip('content_block answer', { type: 'content_block', target: { post_id: ids.gut }, new_value: { block_id: 'answer1', kind: 'answer', position: 'after_first_paragraph', html: '<p>Our beds suit dogs of every size, with washable covers.</p>' } }, '/', (h) => h.includes('washable covers'), (h) => !h.includes('washable covers'));
  await roundTrip('content_block faq + FAQPage schema', { type: 'content_block', target: { post_id: ids.gut }, new_value: { block_id: 'faq1', kind: 'faq', position: 'end', faq: [{ q: 'Are the covers washable?', a: 'Yes, at 40 degrees.' }] } }, '/', (h) => h.includes('Are the covers washable?</h3>') && h.includes('"@type":"FAQPage"'), (h) => !h.includes('Are the covers washable') && !h.includes('FAQPage'));
  await roundTrip('internal_link', { type: 'internal_link', target: { post_id: ids.gut }, new_value: { phrase: 'dog food guide', href: `${site}/old-guide/`, link_id: 'lnk1' } }, '/', (h) => /<a href="http:\/\/localhost:8089\/old-guide\/" data-msscore-link="lnk1">dog food guide<\/a>/.test(h), (h) => !h.includes('data-msscore-link'));
  await roundTrip('schema Organization (site)', { type: 'schema', target: { site: true }, new_value: { block_id: 'org', json: { '@context': 'https://schema.org', '@type': 'Organization', name: 'Test Shop', sameAs: ['https://facebook.com/testshop'] } } }, '/', (h) => h.includes('msscore-schema') && h.includes('"@type":"Organization"'), (h) => !h.includes('msscore-schema'));
  await roundTrip('llms_txt', { type: 'llms_txt', target: { site: true }, new_value: { content: '# Test Shop\n\n> Orthopaedic dog beds made in Britain.\n' } }, '/llms.txt', (h) => h.startsWith('# Test Shop'), (h) => !h.startsWith('# Test Shop'));

  // Redirect + chain/loop refusal.
  const red = { change_id: cid('redirect'), type: 'redirect_301', target: { site: true }, new_value: { from: '/old-dog-beds/', to: `${site}/dog-beds/` } } as WpChange;
  ok((await wp.apply(red)).status === 'applied', 'redirect_301: applied');
  const hop = await raw('/old-dog-beds/');
  ok(hop.status === 301 && hop.location === `${site}/dog-beds/`, 'redirect_301: 301 to the new page', `${hop.status} ${hop.location}`);
  ok((await wp.apply({ change_id: cid('chain'), type: 'redirect_301', target: { site: true }, new_value: { from: '/older/', to: `${site}/old-dog-beds/` } })).status === 'skipped', 'redirect_301: chain refused');
  ok((await wp.apply({ change_id: cid('loop'), type: 'redirect_301', target: { site: true }, new_value: { from: '/dog-beds/', to: `${site}/dog-beds/` } })).status === 'skipped', 'redirect_301: loop refused');
  ok((await wp.rollback(red.change_id)).status === 'rolled_back', 'redirect_301: rolled back');
  ok((await raw('/old-dog-beds/')).status === 404, 'redirect_301: gone after rollback');

  // Sitemap.
  const sm = { change_id: cid('sitemap'), type: 'sitemap', target: { site: true }, new_value: { enabled: true } } as WpChange;
  ok((await wp.apply(sm)).status === 'applied', 'sitemap: switched on');
  const idx = await raw('/sitemap.xml');
  ok(idx.status === 200 && idx.body.includes('<urlset') && idx.body.includes(`<loc>${site}/</loc>`) && idx.body.includes('/contact/') && !idx.body.includes('<sitemapindex'), 'sitemap: a small site lists every page in sitemap.xml itself', idx.body.slice(0, 300));
  const pages = await raw('/sitemap-page-1.xml');
  ok(pages.body.includes(`<loc>${site}/</loc>`) && pages.body.includes('/contact/') && pages.body.includes('image:loc'), 'sitemap: pages with images', pages.body.slice(0, 400));
  ok((await raw('/wp-sitemap.xml')).status === 301, 'sitemap: core sitemap redirects to ours');
  const s2 = await wp.status();
  ok(s2.sitemap.by === 'msscore', 'sitemap: status reports ours');
  // The sitemap follows changes at once: a page set to noindex leaves it, and comes back after undo.
  const ni = { change_id: cid('noindex'), type: 'robots_noindex', target: { post_id: ids.classic }, new_value: 'noindex' } as WpChange;
  const before = await raw('/sitemap-page-1.xml');
  ok((await wp.apply(ni)).status === 'applied', 'sitemap: noindex applied');
  const without = await raw('/sitemap-page-1.xml');
  ok(before.body.split('<url>').length - 1 === without.body.split('<url>').length, 'sitemap: noindexed page left out at once', `${before.body.split('<url>').length} → ${without.body.split('<url>').length}`);
  ok((await wp.rollback(ni.change_id)).status === 'rolled_back' && (await raw('/sitemap-page-1.xml')).body.split('<url>').length === before.body.split('<url>').length, 'sitemap: page back after undo');
  ok((await wp.rollback(sm.change_id)).status === 'rolled_back', 'sitemap: rolled back');
  const after = await raw('/sitemap.xml');
  ok(after.status !== 200 && (await raw('/wp-sitemap.xml')).status === 200, 'sitemap: back to the core sitemap', `${after.status} ${after.location}`);

  // robots.txt (WordPress at the domain root here).
  const rt = { change_id: cid('robots'), type: 'robots_txt', target: { site: true }, new_value: { enabled: true } } as WpChange;
  const rr = await wp.apply(rt);
  ok(rr.status === 'applied', 'robots_txt: applied', rr.reason ?? '');
  const robots = (await raw('/robots.txt')).body;
  ok(robots.includes('Disallow: /?s=') && robots.includes('Allow: /wp-admin/admin-ajax.php') && robots.includes('Sitemap: ') && !/Disallow: .*\.(css|js)/.test(robots), 'robots_txt: rules + sitemap, CSS/JS not blocked');
  ok((await wp.rollback(rt.change_id)).status === 'rolled_back' && !(await raw('/robots.txt')).body.includes('Disallow: /?s='), 'robots_txt: rolled back');

  // Pause from WordPress: no new changes while paused; the change log carries the label.
  const wpOption = (php: string) => execSync(`php -r ${JSON.stringify(`define('WP_USE_THEMES', false); require '${D}/core/wp-load.php'; ${php}`)}`, { encoding: 'utf8' });
  wpOption("update_option('msscore_autopilot_paused', true);");
  const paused = await wp.apply({ change_id: cid('paused'), type: 'meta_title', target: { post_id: ids.gut }, new_value: 'Paused title', label: 'Title tag · Test' });
  ok(paused.status === 'skipped' && /paused/i.test(paused.reason ?? '') && (await wp.status()).paused === true, 'pause: no change while paused', paused.reason ?? '');
  wpOption("update_option('msscore_autopilot_paused', false);");
  const labelled = { change_id: cid('label'), type: 'meta_title', target: { post_id: ids.gut }, new_value: 'Labelled title for the log', label: 'Title tag · Test' } as WpChange;
  ok((await wp.apply(labelled)).status === 'applied', 'pause: changes again after resume');
  const log = await wp.changes();
  ok(log[0]?.change_id === labelled.change_id && log[0]?.note === 'Title tag · Test', 'change log: newest first with its label', JSON.stringify(log[0]));
  // The admin page's undo uses the same code path as /rollback.
  wpOption(`wp_set_current_user(1); msscore_do_rollback('${labelled.change_id}', 'by Admin in WordPress');`);
  const after2 = (await wp.changes()).find((c) => c.change_id === labelled.change_id);
  ok(after2?.status === 'rolled_back' && /Undone: by Admin/.test(after2.note ?? ''), 'admin undo: logged and visible to MS SCORE', JSON.stringify(after2));
  const admin = wpOption("require_once ABSPATH . 'wp-admin/includes/template.php'; wp_set_current_user(1); ob_start(); msscore_admin_page(); echo ob_get_clean();");
  ok(admin.includes('MS SCORE Autopilot') && admin.includes('Pause the autopilot') && admin.includes('Changes made'), 'admin page renders', admin.slice(0, 200));

  // Unsupported / validation.
  ok((await wp.apply({ change_id: cid('x'), type: 'meta_title' as const, target: { post_id: 999999 }, new_value: 'x' })).status === 'failed', 'unknown post refused');
  const unsigned = createWordPressClient({ siteUrl: site, user: 'admin', password: pw });
  ok(await unsigned.apply({ change_id: cid('u'), type: 'meta_title', target: { post_id: ids.gut }, new_value: 'x' }).then(() => false, () => true), 'unsigned apply refused');

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error('ERROR', e instanceof Error ? `${e.message} ${(e as { body?: string }).body ?? ''}` : e);
  process.exit(1);
});
