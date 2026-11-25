<?php
/**
 * Site-level change types: schema (JSON-LD), redirect_301, sitemap, robots_txt and llms_txt.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ---------- schema ---------- */

/**
 * Schema types the active SEO plugin or WooCommerce already prints (never printed twice).
 *
 * @param array $t Resolved target.
 * @return string[]
 */
function msscore_schema_taken( $t ) {
	$seo   = msscore_seo_backend();
	$taken = array();
	if ( in_array( $seo, array( 'yoast', 'rank-math', 'aioseo' ), true ) ) {
		$taken = array( 'WebSite', 'WebPage', 'Organization', 'BreadcrumbList', 'Person' );
		if ( 'post' === $t['kind'] && 'post' === get_post_type( $t['id'] ) ) {
			$taken[] = 'Article';
		}
	} elseif ( 'seopress' === $seo ) {
		$taken = array( 'WebSite', 'Organization' );
	}
	if ( 'post' === $t['kind'] && 'product' === get_post_type( $t['id'] ) && class_exists( 'WooCommerce' ) ) {
		$taken[] = 'Product';
	}
	return $taken;
}

/**
 * Top-level @type values of a JSON-LD document (one object, a list, or an @graph).
 *
 * @param mixed $json JSON-LD.
 * @return string[]
 */
function msscore_schema_types_of( $json ) {
	$nodes = isset( $json['@graph'] ) && is_array( $json['@graph'] ) ? $json['@graph'] : ( isset( $json['@type'] ) ? array( $json ) : ( is_array( $json ) ? $json : array() ) );
	$types = array();
	foreach ( $nodes as $n ) {
		if ( is_array( $n ) && isset( $n['@type'] ) ) {
			$types = array_merge( $types, (array) $n['@type'] );
		}
	}
	return array_values( array_unique( array_map( 'strval', $types ) ) );
}

/**
 * schema: { block_id, json }. JSON-LD printed in wp_head on the target page (site target = homepage).
 *
 * @param array $t   Target.
 * @param array $new Schema.
 * @return array|WP_Error
 */
function msscore_apply_schema( $t, $new ) {
	$block_id = isset( $new['block_id'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $new['block_id'] ) : '';
	$json     = isset( $new['json'] ) && is_array( $new['json'] ) ? $new['json'] : null;
	if ( '' === $block_id || ! $json ) {
		return new WP_Error( 'bad_request', 'schema needs block_id and json.', array( 'status' => 400 ) );
	}
	if ( ! in_array( $t['kind'], array( 'post', 'site' ), true ) ) {
		return new WP_Error( 'bad_request', 'schema needs a post or the site.', array( 'status' => 400 ) );
	}
	$types = msscore_schema_types_of( $json );
	$dupe  = array_values( array_intersect( $types, msscore_schema_taken( $t ) ) );
	if ( $dupe ) {
		return new WP_Error( 'skipped', implode( ', ', $dupe ) . ' is already printed by ' . ( 'msscore' === msscore_seo_backend() ? 'WooCommerce' : 'the SEO plugin' ) . '.' );
	}
	$all              = get_option( 'msscore_schema', array() );
	$all              = is_array( $all ) ? $all : array();
	$before           = isset( $all[ $block_id ] ) ? $all[ $block_id ] : null;
	$all[ $block_id ] = array(
		'post_id' => 'post' === $t['kind'] ? $t['id'] : 0,
		'types'   => $types,
		'json'    => $json,
	);
	update_option( 'msscore_schema', $all );
	return array(
		'before' => array( 'entry' => $before ),
		'after'  => array(
			'block_id' => $block_id,
			'types'    => $types,
		),
	);
}

/**
 * Undoes schema.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @param array $after  After.
 * @return true
 */
function msscore_rollback_schema( $t, $before, $after ) {
	$all = get_option( 'msscore_schema', array() );
	$all = is_array( $all ) ? $all : array();
	if ( null === $before['entry'] ) {
		unset( $all[ $after['block_id'] ] );
	} else {
		$all[ $after['block_id'] ] = $before['entry'];
	}
	update_option( 'msscore_schema', $all );
	return true;
}

/* ---------- redirect_301 ---------- */

/**
 * A redirect source as stored: the path from the domain root, lower case, no trailing slash.
 *
 * @param string $url Address or path.
 * @return string
 */
function msscore_redirect_path( $url ) {
	$path = (string) wp_parse_url( (string) $url, PHP_URL_PATH );
	$path = '/' . trim( rawurldecode( $path ), '/' );
	return strtolower( $path );
}

/**
 * All redirect sources and targets (own table + the 1.0 option), as paths.
 *
 * @return array<int,array{source:string,target:string}>
 */
function msscore_all_redirects() {
	global $wpdb;
	$t    = msscore_tables();
	$rows = $wpdb->get_results( "SELECT source, target FROM {$t['redirects']}", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	$out  = array();
	foreach ( (array) $rows as $r ) {
		$out[] = array(
			'source' => $r['source'],
			'target' => msscore_redirect_path( $r['target'] ),
		);
	}
	foreach ( (array) get_option( MSSCORE_REDIRECTS_OPTION, array() ) as $r ) {
		$out[] = array(
			'source' => msscore_redirect_path( home_url( $r['from'] ) ),
			'target' => msscore_redirect_path( home_url( $r['to'] ) ),
		);
	}
	return $out;
}

/**
 * redirect_301: { from, to }. Refuses loops and chains.
 *
 * @param array $t   Target (site).
 * @param array $new Redirect.
 * @return array|WP_Error
 */
function msscore_apply_redirect_301( $t, $new ) {
	global $wpdb;
	$from = msscore_redirect_path( isset( $new['from'] ) ? (string) $new['from'] : '' );
	$to   = isset( $new['to'] ) ? esc_url_raw( (string) $new['to'] ) : '';
	if ( '/' === $from || '' === $to ) {
		return new WP_Error( 'bad_request', 'redirect_301 needs from (not the homepage) and to.', array( 'status' => 400 ) );
	}
	$to_host = (string) wp_parse_url( $to, PHP_URL_HOST );
	if ( '' === $to_host ) {
		$to = home_url( '/' . ltrim( $to, '/' ) );
	}
	$to_path = msscore_redirect_path( $to );
	if ( $from === $to_path ) {
		return new WP_Error( 'skipped', 'A page cannot redirect to itself.' );
	}
	foreach ( msscore_all_redirects() as $r ) {
		if ( $r['source'] === $from ) {
			return new WP_Error( 'skipped', 'This address already redirects.' );
		}
		if ( $r['source'] === $to_path ) {
			return new WP_Error( 'skipped', 'The new address redirects again (a chain); point to its final address.' );
		}
		if ( $r['target'] === $from ) {
			return new WP_Error( 'skipped', 'Another address already redirects here, so this would make a chain.' );
		}
	}
	$tables = msscore_tables();
	$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$tables['redirects'],
		array(
			'source'     => $from,
			'target'     => $to,
			'code'       => 301,
			'change_id'  => isset( $new['_change_id'] ) ? $new['_change_id'] : null,
			'created_at' => current_time( 'mysql', true ),
		)
	);
	return array(
		'before' => null,
		'after'  => array(
			'id'   => (int) $wpdb->insert_id,
			'from' => $from,
			'to'   => $to,
		),
	);
}

/**
 * Undoes redirect_301.
 *
 * @param array $t      Target.
 * @param mixed $before Before.
 * @param array $after  After.
 * @return true
 */
function msscore_rollback_redirect_301( $t, $before, $after ) {
	global $wpdb;
	$tables = msscore_tables();
	$wpdb->delete( $tables['redirects'], array( 'id' => (int) $after['id'] ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
	return true;
}

add_action( 'template_redirect', 'msscore_do_table_redirects', 0 );

/**
 * Sends visitors on from redirected addresses (own table).
 */
function msscore_do_table_redirects() {
	global $wpdb;
	if ( ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$path   = msscore_redirect_path( esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) );
	$tables = msscore_tables();
	$to     = $wpdb->get_var( $wpdb->prepare( "SELECT target FROM {$tables['redirects']} WHERE source = %s LIMIT 1", $path ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery
	if ( $to ) {
		wp_safe_redirect( $to, 301, 'MS SCORE' );
		exit;
	}
}

/* ---------- sitemap, robots.txt, llms.txt ---------- */

/**
 * sitemap: { enabled }. Only when no SEO plugin makes a sitemap.
 *
 * @param array $t   Target (site).
 * @param array $new Setting.
 * @return array|WP_Error
 */
function msscore_apply_sitemap( $t, $new ) {
	$existing = msscore_existing_sitemap();
	if ( ! empty( $new['enabled'] ) && ! in_array( $existing['by'], array( 'wordpress', 'none', 'msscore' ), true ) ) {
		return new WP_Error( 'skipped', 'The SEO plugin already makes the sitemap: ' . $existing['url'] );
	}
	$before = (bool) get_option( 'msscore_sitemap_enabled', false );
	update_option( 'msscore_sitemap_enabled', ! empty( $new['enabled'] ) );
	delete_transient( 'msscore_sitemap_cache' );
	return array(
		'before' => array( 'enabled' => $before ),
		'after'  => array(
			'enabled' => ! empty( $new['enabled'] ),
			'url'     => home_url( '/sitemap.xml' ),
		),
	);
}

/**
 * Undoes sitemap.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @return true
 */
function msscore_rollback_sitemap( $t, $before ) {
	update_option( 'msscore_sitemap_enabled', ! empty( $before['enabled'] ) );
	delete_transient( 'msscore_sitemap_cache' );
	return true;
}

/**
 * The rules MS SCORE wants in robots.txt.
 *
 * @return string[]
 */
function msscore_robots_rules() {
	$rules = array( 'Disallow: /wp-admin/', 'Allow: /wp-admin/admin-ajax.php', 'Disallow: /?s=', 'Disallow: /search/' );
	if ( class_exists( 'WooCommerce' ) ) {
		$rules = array_merge( $rules, array( 'Disallow: /cart/', 'Disallow: /checkout/', 'Disallow: /my-account/', 'Disallow: /*?add-to-cart=', 'Disallow: /*?*orderby=', 'Disallow: /*?*filter_' ) );
	}
	return $rules;
}

/**
 * Merges MS SCORE's rules into robots.txt text, keeping every line already there.
 *
 * @param string $text    Current robots.txt.
 * @param string $sitemap Sitemap address.
 * @return string
 */
function msscore_merge_robots( $text, $sitemap ) {
	$lines = preg_split( '/\r\n|\r|\n/', trim( (string) $text ) );
	$lines = array_values( array_filter( $lines, 'strlen' ) );
	$have  = array_map(
		function ( $l ) {
			return strtolower( preg_replace( '/\s+/', ' ', trim( $l ) ) );
		},
		$lines
	);
	$star  = array_search( 'user-agent: *', $have, true );
	$add   = array();
	foreach ( msscore_robots_rules() as $r ) {
		if ( ! in_array( strtolower( $r ), $have, true ) ) {
			$add[] = $r;
		}
	}
	if ( false === $star ) {
		$lines = array_merge( array( 'User-agent: *' ), $add, $lines ? array( '' ) : array(), $lines );
	} else {
		array_splice( $lines, $star + 1, 0, $add );
	}
	$text = implode( "\n", $lines );
	if ( $sitemap && false === stripos( $text, 'sitemap: ' . $sitemap ) ) {
		$text .= "\n\nSitemap: " . $sitemap;
	}
	return $text . "\n";
}

/**
 * The sitemap address robots.txt should name.
 *
 * @return string
 */
function msscore_sitemap_for_robots() {
	if ( get_option( 'msscore_sitemap_enabled' ) ) {
		return home_url( '/sitemap.xml' );
	}
	$e = msscore_existing_sitemap();
	return (string) $e['url'];
}

/**
 * robots_txt: { enabled }. Adds MS SCORE's rules (never blocks CSS, JS or images) and the sitemap.
 * Only when no SEO plugin manages robots.txt and WordPress runs at the domain root.
 *
 * @param array $t   Target (site).
 * @param array $new Setting.
 * @return array|WP_Error
 */
function msscore_apply_robots_txt( $t, $new ) {
	if ( ! in_array( msscore_seo_backend(), array( 'msscore', 'bricks' ), true ) ) {
		return new WP_Error( 'needs_human', 'The SEO plugin manages robots.txt; change it there.' );
	}
	if ( '/' !== '/' . trim( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ), '/' ) ) {
		return new WP_Error( 'needs_human', 'WordPress runs in a folder, but search engines only read robots.txt at the domain root. Change robots.txt on the main site.' );
	}
	if ( '1' !== (string) get_option( 'blog_public', '1' ) ) {
		return new WP_Error( 'needs_human', 'Settings → Reading asks search engines not to index this site. Switch that off first.' );
	}
	$enabled = ! isset( $new['enabled'] ) || ! empty( $new['enabled'] );
	$file    = ABSPATH . 'robots.txt';
	if ( file_exists( $file ) ) {
		if ( ! wp_is_writable( $file ) ) {
			return new WP_Error( 'needs_human', 'robots.txt is a file on the server that WordPress cannot change.' );
		}
		$old = (string) file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$bak = ABSPATH . 'robots.txt.msscore-' . gmdate( 'Ymd-His' ) . '.bak';
		copy( $file, $bak );
		$next = $enabled ? msscore_merge_robots( $old, msscore_sitemap_for_robots() ) : $old;
		file_put_contents( $file, $next ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_put_contents_file_put_contents
		return array(
			'before' => array(
				'file'    => true,
				'content' => $old,
				'backup'  => basename( $bak ),
			),
			'after'  => array(
				'file'    => true,
				'content' => $next,
			),
		);
	}
	$before = (bool) get_option( 'msscore_robots_enabled', false );
	update_option( 'msscore_robots_enabled', $enabled );
	return array(
		'before' => array(
			'file'    => false,
			'enabled' => $before,
		),
		'after'  => array(
			'file'    => false,
			'enabled' => $enabled,
		),
	);
}

/**
 * Undoes robots_txt.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @return true
 */
function msscore_rollback_robots_txt( $t, $before ) {
	if ( ! empty( $before['file'] ) ) {
		file_put_contents( ABSPATH . 'robots.txt', (string) $before['content'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_put_contents_file_put_contents
	} else {
		update_option( 'msscore_robots_enabled', ! empty( $before['enabled'] ) );
	}
	return true;
}

add_filter( 'robots_txt', 'msscore_robots_txt', 99, 2 );

/**
 * Virtual robots.txt with MS SCORE's rules merged in (keeps every line other plugins added).
 *
 * @param string $output Robots.txt so far.
 * @param bool   $public Whether the site is public.
 * @return string
 */
function msscore_robots_txt( $output, $public ) {
	if ( ! $public || ! get_option( 'msscore_robots_enabled' ) ) {
		return $output;
	}
	return msscore_merge_robots( $output, msscore_sitemap_for_robots() );
}

/**
 * llms_txt: { content }. A short factual summary for AI assistants, served at /llms.txt.
 *
 * @param array $t   Target (site).
 * @param array $new Content.
 * @return array|WP_Error
 */
function msscore_apply_llms_txt( $t, $new ) {
	if ( file_exists( ABSPATH . 'llms.txt' ) ) {
		return new WP_Error( 'skipped', 'The site already has an llms.txt file.' );
	}
	$content = isset( $new['content'] ) ? str_replace( "\r", '', wp_strip_all_tags( (string) $new['content'] ) ) : '';
	$before  = (string) get_option( 'msscore_llms_txt', '' );
	if ( '' === trim( $content ) ) {
		delete_option( 'msscore_llms_txt' );
	} else {
		update_option( 'msscore_llms_txt', $content, false );
	}
	return array(
		'before' => array( 'content' => $before ),
		'after'  => array(
			'length' => strlen( $content ),
			'url'    => home_url( '/llms.txt' ),
		),
	);
}

/**
 * Undoes llms_txt.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @return true
 */
function msscore_rollback_llms_txt( $t, $before ) {
	if ( '' === (string) $before['content'] ) {
		delete_option( 'msscore_llms_txt' );
	} else {
		update_option( 'msscore_llms_txt', (string) $before['content'], false );
	}
	return true;
}
