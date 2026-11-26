<?php
/**
 * Files MS SCORE serves: /sitemap.xml (only when switched on and no SEO plugin makes a sitemap)
 * and /llms.txt. Both are relative to the WordPress address, so a site in /shop/ gets /shop/sitemap.xml.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MSSCORE_SITEMAP_MAX', 2000 );

add_filter( 'wp_sitemaps_enabled', 'msscore_core_sitemaps_enabled', 20 );

/**
 * Turns the WordPress core sitemap off while MS SCORE's is on (one sitemap per site).
 *
 * @param bool $enabled Core setting.
 * @return bool
 */
function msscore_core_sitemaps_enabled( $enabled ) {
	return get_option( 'msscore_sitemap_enabled' ) ? false : $enabled;
}

/**
 * The requested path relative to the WordPress address ('' for the homepage).
 *
 * @return string
 */
function msscore_request_path() {
	if ( ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return '';
	}
	$path = (string) wp_parse_url( esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ), PHP_URL_PATH );
	$home = '/' . trim( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ), '/' );
	$home = '/' === $home ? '' : $home;
	if ( '' !== $home && 0 === strpos( $path, $home . '/' ) ) {
		$path = substr( $path, strlen( $home ) );
	}
	return trim( $path, '/' );
}

add_action( 'parse_request', 'msscore_serve_files', 1 );

/**
 * Answers /llms.txt, /sitemap.xml, /sitemap-<type>-<n>.xml and redirects /wp-sitemap.xml.
 */
function msscore_serve_files() {
	$path = msscore_request_path();
	if ( 'llms.txt' === $path ) {
		$llms = (string) get_option( 'msscore_llms_txt', '' );
		if ( '' !== $llms ) {
			status_header( 200 );
			header( 'Content-Type: text/plain; charset=utf-8' );
			header( 'X-Robots-Tag: noindex' );
			echo $llms; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- plain text, tags stripped when saved.
			exit;
		}
		return;
	}
	if ( ! get_option( 'msscore_sitemap_enabled' ) ) {
		return;
	}
	if ( 'wp-sitemap.xml' === $path ) {
		wp_safe_redirect( home_url( '/sitemap.xml' ), 301, 'MS SCORE' );
		exit;
	}
	if ( 'sitemap.xml' !== $path && ! preg_match( '/^sitemap-([a-z_]+)-(\d+)\.xml$/', $path, $m ) ) {
		return;
	}
	$xml = 'sitemap.xml' === $path ? msscore_sitemap_index() : msscore_sitemap_child( $m[1], (int) $m[2] );
	if ( null === $xml ) {
		return;
	}
	status_header( 200 );
	header( 'Content-Type: application/xml; charset=utf-8' );
	header( 'X-Robots-Tag: noindex, follow' );
	echo $xml; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built with esc_url / esc_xml below.
	exit;
}

/**
 * Cached sitemap text (cleared whenever content changes).
 *
 * @param string   $name  File name.
 * @param callable $build Builder.
 * @return string|null
 */
function msscore_sitemap_cached( $name, $build ) {
	$cache = get_transient( 'msscore_sitemap_cache' );
	$cache = is_array( $cache ) ? $cache : array();
	$name  = MSSCORE_CONNECTOR_VERSION . ':' . $name;
	if ( ! isset( $cache[ $name ] ) ) {
		$xml = $build();
		if ( null === $xml ) {
			return null;
		}
		$cache[ $name ] = $xml;
		set_transient( 'msscore_sitemap_cache', $cache, 12 * HOUR_IN_SECONDS );
	}
	return $cache[ $name ];
}

foreach ( array( 'save_post', 'deleted_post', 'created_term', 'edited_term', 'delete_term' ) as $msscore_hook ) {
	add_action(
		$msscore_hook,
		function () {
			delete_transient( 'msscore_sitemap_cache' );
		}
	);
}
unset( $msscore_hook );

/**
 * Pages that are never in the sitemap: shop utility pages and redirected addresses.
 *
 * @return int[]
 */
function msscore_sitemap_excluded_ids() {
	$ids = array();
	if ( function_exists( 'wc_get_page_id' ) ) {
		foreach ( array( 'cart', 'checkout', 'myaccount' ) as $p ) {
			$ids[] = (int) wc_get_page_id( $p );
		}
	}
	return array_filter( $ids, function ( $i ) {
		return $i > 0;
	} );
}

/**
 * Published, public posts of a type that may be indexed.
 *
 * @param string $type   Post type.
 * @param int    $page   1-based page.
 * @param bool   $count  Return only the count.
 * @return WP_Post[]|int
 */
function msscore_sitemap_posts( $type, $page = 1, $count = false ) {
	$q = new WP_Query(
		array(
			'post_type'              => $type,
			'post_status'            => 'publish',
			'has_password'           => false,
			'posts_per_page'         => $count ? 1 : MSSCORE_SITEMAP_MAX,
			'paged'                  => $page,
			'orderby'                => 'ID',
			'order'                  => 'ASC',
			'post__not_in'           => msscore_sitemap_excluded_ids(),
			'update_post_term_cache' => false,
			'no_found_rows'          => ! $count,
		)
	);
	if ( $count ) {
		return (int) $q->found_posts;
	}
	$redirected = array_column( msscore_all_redirects(), 'source' );
	return array_values(
		array_filter(
			$q->posts,
			function ( $p ) use ( $redirected ) {
				$f = msscore_post_seo_fields( $p->ID );
				return ! $f['noindex'] && ! in_array( msscore_redirect_path( get_permalink( $p ) ), $redirected, true );
			}
		)
	);
}

/**
 * Content types in the sitemap.
 *
 * @return array<string,string> name => post_type or taxonomy
 */
function msscore_sitemap_types() {
	$types = array(
		'page' => 'page',
		'post' => 'post',
	);
	if ( post_type_exists( 'product' ) ) {
		$types['product'] = 'product';
	}
	$types['category'] = 'category';
	if ( taxonomy_exists( 'product_cat' ) ) {
		$types['product_cat'] = 'product_cat';
	}
	return $types;
}

/**
 * The sitemap index.
 *
 * @return string
 */
function msscore_sitemap_index() {
	return msscore_sitemap_cached(
		'sitemap.xml',
		function () {
			$counts = array();
			foreach ( msscore_sitemap_types() as $name => $type ) {
				$counts[ $name ] = msscore_is_term_type( $type )
					? (int) wp_count_terms( array( 'taxonomy' => $type, 'hide_empty' => true ) )
					: msscore_sitemap_posts( $type, 1, true );
			}
			// A site that fits in one list gets every page in sitemap.xml itself; larger sites get an index.
			if ( array_sum( $counts ) <= MSSCORE_SITEMAP_MAX ) {
				$out = msscore_urlset_open();
				foreach ( $counts as $name => $n ) {
					if ( $n > 0 ) {
						$out .= msscore_sitemap_entries( $name, 1 );
					}
				}
				return $out . '</urlset>' . "\n";
			}
			$out = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
			foreach ( $counts as $name => $n ) {
				for ( $i = 1; $i <= (int) ceil( $n / MSSCORE_SITEMAP_MAX ); $i++ ) {
					$out .= '  <sitemap><loc>' . esc_url( home_url( "/sitemap-{$name}-{$i}.xml" ) ) . '</loc><lastmod>' . esc_html( gmdate( 'c' ) ) . "</lastmod></sitemap>\n";
				}
			}
			return $out . '</sitemapindex>' . "\n";
		}
	);
}

/**
 * The opening of a list of addresses.
 *
 * @return string
 */
function msscore_urlset_open() {
	return '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
}

/**
 * One child sitemap (used when the site is too large for one list; still served for smaller sites).
 *
 * @param string $name Type name.
 * @param int    $page 1-based page.
 * @return string|null
 */
function msscore_sitemap_child( $name, $page ) {
	$types = msscore_sitemap_types();
	if ( ! isset( $types[ $name ] ) || $page < 1 ) {
		return null;
	}
	return msscore_sitemap_cached(
		"sitemap-{$name}-{$page}.xml",
		function () use ( $name, $page ) {
			return msscore_urlset_open() . msscore_sitemap_entries( $name, $page ) . '</urlset>' . "\n";
		}
	);
}

/**
 * The <url> entries of one content type and page.
 *
 * @param string $name Type name.
 * @param int    $page 1-based page.
 * @return string
 */
function msscore_sitemap_entries( $name, $page ) {
	$types = msscore_sitemap_types();
	$type  = $types[ $name ];
	$out   = '';
	if ( msscore_is_term_type( $type ) ) {
		$terms = get_terms(
			array(
				'taxonomy'   => $type,
				'hide_empty' => true,
				'number'     => MSSCORE_SITEMAP_MAX,
				'offset'     => ( $page - 1 ) * MSSCORE_SITEMAP_MAX,
			)
		);
		foreach ( is_wp_error( $terms ) ? array() : $terms as $term ) {
			$f    = msscore_term_seo_fields( $term );
			$link = get_term_link( $term );
			if ( $f['noindex'] || is_wp_error( $link ) ) {
				continue;
			}
			$out .= '  <url><loc>' . esc_url( $link ) . "</loc></url>\n";
		}
		return $out;
	}
	foreach ( msscore_sitemap_posts( $type, $page ) as $p ) {
		$out .= '  <url><loc>' . esc_url( get_permalink( $p ) ) . '</loc><lastmod>' . esc_html( get_post_modified_time( 'c', true, $p ) ) . '</lastmod>';
		foreach ( array_slice( msscore_post_images( $p ), 0, 10 ) as $img ) {
			$out .= '<image:image><image:loc>' . esc_url( $img['url'] ) . '</image:loc></image:image>';
		}
		$out .= "</url>\n";
	}
	return $out;
}
