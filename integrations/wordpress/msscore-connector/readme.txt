=== MS SCORE Connector ===
Contributors: morosoft
Requires at least: 5.6
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.3.3
License: GPLv2 or later

Lets MS SCORE apply SEO changes you have approved.

== Description ==

MS SCORE finds what to fix on your pages. After you approve a change in MS SCORE, this plugin lets it:

* update SEO titles and meta descriptions (Yoast SEO, Rank Math, SEOPress, All in One SEO, or its own when none is installed),
* update page titles (H1),
* add 301 redirects when two pages are merged,
* save new pages as drafts for you to finish.

Nothing changes without your approval, and every change can be undone from MS SCORE.
Only editors and administrators can use it, through an Application Password you approve.

== Installation ==

1. Plugins → Add New → Upload Plugin, choose msscore-connector.zip, Install, Activate.
2. In MS SCORE, open Connections and press "Connect WordPress".

== Changelog ==

= 1.3.3 =
* Bricks: headings are read and fixed in the order they appear on the page (the stored list is in another order), so the page's main H1 is the one kept and rewritten.

= 1.3.2 =
* New heading change: rewrite the words of the page's main H1 (Bricks, Elementor, blocks and classic content), with undo.

= 1.3.1 =
* sitemap.xml lists every page itself when the site has up to 2,000 addresses; larger sites still get an index of smaller lists.

= 1.3.0 =
* New "MS SCORE Autopilot" admin page: connection, running or paused, last change, the sitemap, and every change with an Undo button.
* Pause the autopilot from WordPress; while paused, MS SCORE makes no new changes.
* The sitemap is rebuilt after every change and undo (a page set to noindex leaves it at once).
* Each change is logged with its plain-language label.

= 1.2.1 =
* Image alt text also updates Bricks image blocks that set their own alt text.

= 1.2.0 =
* Apply and undo: MS SCORE can make one change at a time (SEO title, meta description, canonical, noindex, Open Graph, image alt text, heading fixes, marked content blocks, internal links, schema, 301 redirects, sitemap, robots.txt, llms.txt). Each change is logged with its value before, so it can be undone, and the page's cache is cleared.
* Writes to Yoast SEO, Rank Math, SEOPress, All in One SEO or Bricks page settings when present, and prints its own tags only when no plugin does.
* Text outside MS SCORE's marked blocks is never removed.

= 1.1.0 =
* Signed requests: once MS SCORE has set its key, every request must carry a signature that expires after 5 minutes.
* Site status: WordPress, PHP, theme, SEO plugin, page builder, cache plugin, WooCommerce, sitemap, robots.txt.
* Inventory: every published page, post, product and category with its title tag, description, canonical, robots, H1s, images, word count and schema types.

= 1.0.0 =
* First version.
