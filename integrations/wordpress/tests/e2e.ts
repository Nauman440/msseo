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
  ok(status.version === '1.4.1' && status.signed && status.paused === false, 'signed status 1.3.0', status.seo_backend as string);

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
  await roundTrip('heading_fix set H1 words (Classic)', { type: 'heading_fix', target: { post_id: ids.classic }, new_value: { action: 'set_h1_text', text: 'Contact Our Dog Bed Makers in Leeds' } }, '/contact/', (h) => h.includes('Contact Our Dog Bed Makers in Leeds</h1>'), (h) => h.includes('Contact us</h1>'));
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
  // PHP run inside WordPress, through a file (so the shell never touches the $ signs).
  const wpOption = (php: string) => {
    const f = `${D}/e2e-snippet.php`;
    writeFileSync(f, `<?php define('WP_USE_THEMES', false); require '${D}/core/wp-load.php'; ${php}`);
    return execSync(`php ${f}`, { encoding: 'utf8' });
  };
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

  // Bricks: the stored list is not the page order. The subtitle (text-basic, H1) is stored first, but the
  // main heading comes first on the page: the main heading stays H1, the subtitle becomes H2, and the H1 text change edits the main heading.
  const bricksId = Number(wpOption(`$id = wp_insert_post(array('post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Bricks test')); update_post_meta($id, '_bricks_editor_mode', 'bricks'); update_post_meta($id, '_bricks_page_content_2', array(array('id' => 'sub', 'name' => 'text-basic', 'parent' => 'sec', 'children' => array(), 'settings' => array('tag' => 'h1', 'text' => 'Subtitle')), array('id' => 'sec', 'name' => 'section', 'parent' => 0, 'children' => array('main', 'sub'), 'settings' => array()), array('id' => 'main', 'name' => 'heading', 'parent' => 'sec', 'children' => array(), 'settings' => array('tag' => 'h1', 'text' => 'Main heading')))); echo $id;`).trim());
  const tags = () => JSON.parse(wpOption(`$e = get_post_meta(${bricksId}, '_bricks_page_content_2', true); $o = array(); foreach ($e as $x) { if (isset($x['settings']['tag'])) $o[$x['id']] = array($x['settings']['tag'], $x['settings']['text']); } echo wp_json_encode($o);`)) as Record<string, [string, string]>;
  const dem = await wp.apply({ change_id: cid('bricks-h1'), type: 'heading_fix', target: { post_id: bricksId }, new_value: { action: 'demote_extra_h1', keep: 1 } } as WpChange);
  ok(dem.status === 'applied' && tags().main?.[0] === 'h1' && tags().sub?.[0] === 'h2', 'bricks: the main heading (first on the page) stays H1, the subtitle becomes H2', JSON.stringify(tags()));
  const words = await wp.apply({ change_id: cid('bricks-words'), type: 'heading_fix', target: { post_id: bricksId }, new_value: { action: 'set_h1_text', text: 'Maritime Risk Management in Dubai' } } as WpChange);
  ok(words.status === 'applied' && tags().main?.[1] === 'Maritime Risk Management in Dubai' && tags().sub?.[1] === 'Subtitle', 'bricks: the H1 words change on the main heading only', JSON.stringify(tags()));
  await wp.rollback(words.change_id!);
  await wp.rollback(dem.change_id!);
  ok(tags().main?.[0] === 'h1' && tags().sub?.[0] === 'h1' && tags().main?.[1] === 'Main heading', 'bricks: undo puts both back', JSON.stringify(tags()));

  // The live site's case: the hero title is an H2 heading and the line under it a Basic Text set to H1.
  const heroId = Number(wpOption(`$id = wp_insert_post(array('post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Hero swap')); update_post_meta($id, '_bricks_editor_mode', 'bricks'); update_post_meta($id, '_bricks_page_content_2', array(array('id' => 'sub', 'name' => 'text-basic', 'parent' => 'hero', 'children' => array(), 'settings' => array('tag' => 'h1', 'text' => 'Intelligence-Led Maritime Risk Management &amp; Shipping Operations', '_cssClasses' => 'home-hero__sub')), array('id' => 'hero', 'name' => 'section', 'parent' => 0, 'children' => array('ttl', 'sub'), 'settings' => array()), array('id' => 'ttl', 'name' => 'heading', 'parent' => 'hero', 'children' => array(), 'settings' => array('tag' => 'h2', 'text' => 'SRM Risk Management FZCO Awais')))); echo $id;`).trim());
  const heroTags = () => JSON.parse(wpOption(`$e = get_post_meta(${heroId}, '_bricks_page_content_2', true); $o = array(); foreach ($e as $x) { if (isset($x['settings']['tag'])) $o[$x['id']] = $x['settings']['tag']; } echo wp_json_encode($o);`)) as Record<string, string>;
  const swap = await wp.apply({ change_id: cid('bricks-swap'), type: 'heading_fix', target: { post_id: heroId }, new_value: { action: 'swap_h1', title: 'SRM Risk Management FZCO Awais' } } as WpChange);
  ok(swap.status === 'applied' && heroTags().ttl === 'h1' && heroTags().sub === 'h2', 'bricks swap: the H2 title becomes the H1, the Basic Text H1 under it an H2', JSON.stringify(heroTags()));
  ok((await wp.rollback(swap.change_id!)).status === 'rolled_back' && heroTags().ttl === 'h2' && heroTags().sub === 'h1', 'bricks swap: undo puts both back', JSON.stringify(heroTags()));
  const swapMiss = await wp.apply({ change_id: cid('bricks-swap-miss'), type: 'heading_fix', target: { post_id: heroId }, new_value: { action: 'swap_h1', title: 'Not on the page' } } as WpChange);
  ok(swapMiss.status === 'needs_human' && heroTags().sub === 'h1', 'bricks swap: a title that is not in the content goes to a person', swapMiss.status);
  const gbId = Number(wpOption(`echo wp_insert_post(array('post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Swap blocks', 'post_content' => "<!-- wp:heading -->\\n<h2 class=\\"wp-block-heading\\">Dog beds made in Leeds</h2>\\n<!-- /wp:heading -->\\n\\n<!-- wp:heading {\\"level\\":1} -->\\n<h1 class=\\"wp-block-heading\\">Handmade for older dogs</h1>\\n<!-- /wp:heading -->"));`).trim());
  const gbSwap = await wp.apply({ change_id: cid('gb-swap'), type: 'heading_fix', target: { post_id: gbId }, new_value: { action: 'swap_h1', title: 'Dog beds made in Leeds' } } as WpChange);
  const gbHtml = await (await fetch(`${site}/?page_id=${gbId}&c=${Date.now()}`)).text();
  const gbRaw = wpOption(`echo get_post_field('post_content', ${gbId});`);
  ok(gbSwap.status === 'applied' && /<h1[^>]*>Dog beds made in Leeds<\/h1>/.test(gbHtml) && /<h2[^>]*>Handmade for older dogs<\/h2>/.test(gbHtml) && gbRaw.includes('wp:heading {"level":1}') && !/wp:heading \{"level":1\} -->\s*<h2/.test(gbRaw), 'gutenberg swap: tags and block levels follow', gbRaw.slice(0, 300));
  ok((await wp.rollback(gbSwap.change_id!)).status === 'rolled_back' && /<h1[^>]*>Handmade for older dogs<\/h1>/.test(await (await fetch(`${site}/?page_id=${gbId}&c=${Date.now()}`)).text()), 'gutenberg swap: undo puts both back');

  // Sections on builder pages: Bricks gets section > container > text bAfter the H1's section, styled like its neighbour.
  wpOption(`$e = get_post_meta(${bricksId}, '_bricks_page_content_2', true); $e[] = array('id' => 'sec2', 'name' => 'section', 'parent' => 0, 'children' => array('box2'), 'settings' => array('_cssGlobalClasses' => array('g-section'))); $e[] = array('id' => 'box2', 'name' => 'container', 'parent' => 'sec2', 'children' => array(), 'settings' => array('_cssGlobalClasses' => array('g-box'))); update_post_meta(${bricksId}, '_bricks_page_content_2', $e);`);
  const bricks = () => JSON.parse(wpOption(`echo wp_json_encode(array_values(get_post_meta(${bricksId}, '_bricks_page_content_2', true)));`)) as { id: string; name: string; parent: string | number; label?: string; settings: Record<string, unknown> }[];
  const bBefore = bricks();
  const sec = await wp.apply({ change_id: cid('bricks-block'), type: 'content_block', target: { post_id: bricksId }, new_value: { block_id: 'testimonials', kind: 'section', position: 'after_h1', html: '<h2>What clients say</h2><p>Real words from a real client.</p>' } } as WpChange);
  const bAfter = bricks();
  const tops = bAfter.filter((e) => !e.parent || e.parent === 0 || e.parent === '0').map((e) => e.label ?? e.id);
  const text = bAfter.find((e) => e.name === 'text' && e.label === 'msscore-block-testimonials');
  const mine = bAfter.find((e) => e.name === 'section' && e.label === 'msscore-block-testimonials');
  ok(sec.status === 'applied' && JSON.stringify(tops) === JSON.stringify(['sec', 'msscore-block-testimonials', 'sec2']) && String(text?.settings.text).includes('What clients say'), 'bricks section: inserted after the H1 section as Bricks elements', JSON.stringify(tops));
  ok(JSON.stringify(mine?.settings._cssGlobalClasses) === JSON.stringify(['g-section']), 'bricks section: copies the design classes of the next section', JSON.stringify(mine?.settings));
  const again = await wp.apply({ change_id: cid('bricks-block2'), type: 'content_block', target: { post_id: bricksId }, new_value: { block_id: 'testimonials', kind: 'section', position: 'after_h1', html: '<p>Replaced text.</p>' } } as WpChange);
  ok(again.status === 'applied' && bricks().filter((e) => e.label === 'msscore-block-testimonials').length === 3 && JSON.stringify(bricks()).includes('Replaced text'), 'bricks section: the same block id replaces, never doubles');
  await wp.rollback(again.change_id!);
  await wp.rollback(sec.change_id!);
  ok(JSON.stringify(bricks()) === JSON.stringify(bBefore), 'bricks section: undo leaves the page exactly as before');
  // Someone edits the page bAfter our section: undo still removes only our elements.
  const sec3 = await wp.apply({ change_id: cid('bricks-block3'), type: 'content_block', target: { post_id: bricksId }, new_value: { block_id: 'faq', kind: 'faq', position: 'end', faq: [{ q: 'Do you cover the Red Sea?', a: 'Yes, voyage risk support covers the Red Sea.' }] } } as WpChange);
  wpOption(`$e = get_post_meta(${bricksId}, '_bricks_page_content_2', true); $e[] = array('id' => 'late', 'name' => 'section', 'parent' => 0, 'children' => array(), 'settings' => array()); update_post_meta(${bricksId}, '_bricks_page_content_2', $e);`);
  ok(sec3.status === 'applied' && (await wp.rollback(sec3.change_id!)).status === 'rolled_back' && !JSON.stringify(bricks()).includes('msscore-block') && bricks().some((e) => e.id === 'late'), 'bricks section: undo after a later edit removes only our elements');

  // Elementor: a container with a Text Editor widget after the H1's container.
  const elId = Number(wpOption(`$id = wp_insert_post(array('post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Elementor test')); update_post_meta($id, '_elementor_edit_mode', 'builder'); update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode(array(array('id' => 'a1', 'elType' => 'container', 'settings' => array(), 'elements' => array(array('id' => 'h1w', 'elType' => 'widget', 'widgetType' => 'heading', 'settings' => array('title' => 'Hero', 'header_size' => 'h1'), 'elements' => array())), 'isInner' => false), array('id' => 'b1', 'elType' => 'container', 'settings' => array(), 'elements' => array(), 'isInner' => false))))); echo $id;`).trim());
  const tree = () => JSON.parse(wpOption(`echo get_post_meta(${elId}, '_elementor_data', true);`)) as { id: string; elType: string; settings: Record<string, unknown>; elements: { widgetType?: string; settings: Record<string, unknown> }[] }[];
  const elBefore = JSON.stringify(tree());
  const el = await wp.apply({ change_id: cid('el-block'), type: 'content_block', target: { post_id: elId }, new_value: { block_id: 'answer-1', kind: 'answer', position: 'after_h1', html: '<p>We plan safe voyages.</p>' } } as WpChange);
  const t2 = tree();
  ok(el.status === 'applied' && t2.length === 3 && String(t2[1]?.settings._css_classes).includes('msscore-block-answer-1') && t2[1]?.elements[0]?.widgetType === 'text-editor' && String(t2[1]?.elements[0]?.settings.editor).includes('We plan safe voyages'), 'elementor section: container + text editor after the H1 container', JSON.stringify(t2.map((n) => n.id)));
  ok((await wp.rollback(el.change_id!)).status === 'rolled_back' && JSON.stringify(tree()) === elBefore, 'elementor section: undo leaves the page exactly as before');
  const elTwo = Number(wpOption(`$id = wp_insert_post(array('post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Elementor swap')); update_post_meta($id, '_elementor_edit_mode', 'builder'); update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode(array(array('id' => 'c1', 'elType' => 'container', 'settings' => array(), 'elements' => array(array('id' => 't2', 'elType' => 'widget', 'widgetType' => 'heading', 'settings' => array('title' => 'Hero title', 'header_size' => 'h2'), 'elements' => array()), array('id' => 's1', 'elType' => 'widget', 'widgetType' => 'heading', 'settings' => array('title' => 'Hero subtitle', 'header_size' => 'h1'), 'elements' => array())), 'isInner' => false))))); echo $id;`).trim());
  const sizes = () => Object.fromEntries((JSON.parse(wpOption(`echo get_post_meta(${elTwo}, '_elementor_data', true);`))[0].elements as { id: string; settings: { header_size: string } }[]).map((w) => [w.id, w.settings.header_size]));
  const elSwap = await wp.apply({ change_id: cid('el-swap'), type: 'heading_fix', target: { post_id: elTwo }, new_value: { action: 'swap_h1', title: 'Hero title' } } as WpChange);
  ok(elSwap.status === 'applied' && sizes().t2 === 'h1' && sizes().s1 === 'h2' && !wpOption(`echo get_post_meta(${elTwo}, '_elementor_data', true);`).includes('msscore_keep'), 'elementor swap: title widget H1, subtitle H2', JSON.stringify(sizes()));
  ok((await wp.rollback(elSwap.change_id!)).status === 'rolled_back' && sizes().t2 === 'h2' && sizes().s1 === 'h1', 'elementor swap: undo puts both back', JSON.stringify(sizes()));

  // New page: a draft made of real blocks, refused when the address exists, binned on undo.
  const np = await wp.apply({ change_id: cid('page'), type: 'create_page' as WpChange['type'], target: { site: true }, new_value: { title: 'Voyage Risk Assessment', slug: 'voyage-risk-assessment', html: '<h2>What we check</h2><p>Routes, ports and cargo.</p><ul><li>Routes</li><li>Ports</li></ul>', meta_title: 'Voyage Risk Assessment for Shipping Companies | Test Shop', meta_description: 'Voyage risk assessment for shipping companies: routes, ports and cargo checked before you sail. Ask us for an assessment today.' } } as WpChange);
  const pid = Number((np.after as { post_id?: number } | undefined)?.post_id);
  const page = JSON.parse(wpOption(`$p = get_post(${pid}); echo wp_json_encode(array('status' => $p->post_status, 'name' => $p->post_name, 'content' => $p->post_content));`)) as { status: string; name: string; content: string };
  ok(np.status === 'applied' && page.status === 'draft' && page.name === 'voyage-risk-assessment' && page.content.includes('<!-- wp:heading -->') && page.content.includes('<!-- wp:list -->'), 'create_page: a draft page made of real blocks', JSON.stringify(page).slice(0, 160));
  const dup = await wp.apply({ change_id: cid('page2'), type: 'create_page' as WpChange['type'], target: { site: true }, new_value: { title: 'Voyage Risk Assessment', slug: 'voyage-risk-assessment', html: '<p>x</p>' } } as WpChange);
  ok(dup.status === 'skipped', 'create_page: an address that exists is not made twice', dup.reason ?? '');
  ok((await wp.rollback(np.change_id!)).status === 'rolled_back' && wpOption(`echo get_post_status(${pid});`).trim() === 'trash', 'create_page: undo moves the page to the bin');

  // Undo everything: every live change goes back, newest first.
  const x1 = await wp.apply({ change_id: cid('all1'), type: 'meta_title', target: { post_id: ids.gut }, new_value: 'Undo-all test title one' } as WpChange);
  const x2 = await wp.apply({ change_id: cid('all2'), type: 'content_block', target: { post_id: bricksId }, new_value: { block_id: 'all', kind: 'section', position: 'end', html: '<p>Undo all.</p>' } } as WpChange);
  const all = await wp.rollbackAll('e2e');
  ok(x1.status === 'applied' && x2.status === 'applied' && all.left.length === 0 && all.undone >= 2 && !(await html('/')).includes('Undo-all test title one') && !JSON.stringify(bricks()).includes('msscore-block'), 'rollback-all: every live change undone', JSON.stringify(all));

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
