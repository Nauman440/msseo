<?php
/**
 * What this WordPress site runs: versions, theme, SEO plugin, page builder, cache plugin, shop,
 * sitemap and robots.txt. MS SCORE uses it to decide how each change can be made.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The page builders in use (first = the main one).
 *
 * @return string[]
 */
function msscore_page_builders() {
	$found = array();
	if ( msscore_bricks_active() ) {
		$found[] = 'bricks';
	}
	if ( defined( 'ELEMENTOR_VERSION' ) ) {
		$found[] = 'elementor';
	}
	$theme = wp_get_theme();
	if ( defined( 'ET_BUILDER_VERSION' ) || 'Divi' === $theme->get_template() ) {
		$found[] = 'divi';
	}
	if ( defined( 'FL_BUILDER_VERSION' ) ) {
		$found[] = 'beaver-builder';
	}
	if ( defined( 'WPB_VC_VERSION' ) ) {
		$found[] = 'wpbakery';
	}
	if ( class_exists( 'Classic_Editor' ) || ( function_exists( 'use_block_editor_for_post_type' ) && ! use_block_editor_for_post_type( 'page' ) ) ) {
		$found[] = 'classic';
	} else {
		$found[] = 'gutenberg';
	}
	return $found;
}

/**
 * The main page builder in MS SCORE's words: gutenberg, classic, elementor, divi, bricks or other.
 *
 * @return string
 */
function msscore_main_builder() {
	$main = msscore_page_builders()[0];
	return in_array( $main, array( 'gutenberg', 'classic', 'elementor', 'divi', 'bricks' ), true ) ? $main : 'other';
}

/**
 * Cache plugins that are active.
 *
 * @return string[]
 */
function msscore_cache_plugins() {
	$found = array();
	if ( defined( 'WP_ROCKET_VERSION' ) ) {
		$found[] = 'wp-rocket';
	}
	if ( defined( 'LSCWP_V' ) ) {
		$found[] = 'litespeed';
	}
	if ( defined( 'W3TC' ) ) {
		$found[] = 'w3-total-cache';
	}
	if ( defined( 'WPCACHEHOME' ) || function_exists( 'wp_cache_clean_cache' ) ) {
		$found[] = 'wp-super-cache';
	}
	if ( class_exists( '\SiteGround_Optimizer\Supercacher\Supercacher' ) ) {
		$found[] = 'sg-optimizer';
	}
	if ( defined( 'CLOUDFLARE_PLUGIN_DIR' ) ) {
		$found[] = 'cloudflare';
	}
	return $found;
}

/**
 * The sitemap the site already serves, and what makes it.
 *
 * @return array{url:string|null,by:string}
 */
function msscore_existing_sitemap() {
	if ( get_option( 'msscore_sitemap_enabled' ) ) {
		return array(
			'url' => home_url( '/sitemap.xml' ),
			'by'  => 'msscore',
		);
	}
	$seo = msscore_seo_backend();
	if ( 'yoast' === $seo && class_exists( 'WPSEO_Options' ) && WPSEO_Options::get( 'enable_xml_sitemap' ) ) {
		return array(
			'url' => home_url( '/sitemap_index.xml' ),
			'by'  => 'yoast',
		);
	}
	if ( 'rank-math' === $seo && class_exists( '\RankMath\Helper' ) && \RankMath\Helper::is_module_active( 'sitemap' ) ) {
		return array(
			'url' => home_url( '/sitemap_index.xml' ),
			'by'  => 'rank-math',
		);
	}
	if ( 'aioseo' === $seo && function_exists( 'aioseo' ) && ! empty( aioseo()->options->sitemap->general->enable ) ) {
		return array(
			'url' => home_url( '/sitemap.xml' ),
			'by'  => 'aioseo',
		);
	}
	if ( 'seopress' === $seo ) {
		$opt = get_option( 'seopress_xml_sitemap_option_name', array() );
		if ( is_array( $opt ) && ! empty( $opt['seopress_xml_sitemap_general_enable'] ) ) {
			return array(
				'url' => home_url( '/sitemaps.xml' ),
				'by'  => 'seopress',
			);
		}
	}
	if ( function_exists( 'wp_sitemaps_get_server' ) && wp_sitemaps_get_server()->sitemaps_enabled() ) {
		return array(
			'url' => home_url( '/wp-sitemap.xml' ),
			'by'  => 'wordpress',
		);
	}
	return array(
		'url' => null,
		'by'  => 'none',
	);
}

/**
 * Everything GET /status reports.
 *
 * @return array
 */
function msscore_site_status() {
	global $wp_version;
	$theme   = wp_get_theme();
	$seo     = msscore_seo_backend();
	$sitemap = msscore_existing_sitemap();
	return array(
		'version'         => MSSCORE_CONNECTOR_VERSION,
		'seo'             => $seo,
		'seo_plugin'      => in_array( $seo, array( 'msscore', 'bricks' ), true ) ? 'none' : $seo,
		'wp_version'      => (string) $wp_version,
		'php_version'     => PHP_VERSION,
		'theme'           => array(
			'name'      => $theme->get( 'Name' ),
			'version'   => $theme->get( 'Version' ),
			'template'  => $theme->get_template(),
			'title_tag' => current_theme_supports( 'title-tag' ) || ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ),
		),
		'page_builder'    => msscore_main_builder(),
		'page_builders'   => msscore_page_builders(),
		'cache_plugins'   => msscore_cache_plugins(),
		'woocommerce'     => class_exists( 'WooCommerce' ),
		'sitemap'         => $sitemap,
		'robots_file'     => file_exists( ABSPATH . 'robots.txt' ),
		'llms_file'       => file_exists( ABSPATH . 'llms.txt' ),
		'search_visible'  => '1' === (string) get_option( 'blog_public', '1' ),
		'home_url'        => home_url( '/' ),
		'signed'          => '' !== msscore_signing_key(),
		'inventory_types' => msscore_inventory_types(),
		'change_types'    => array_keys( msscore_change_handlers() ),
		'seo_backend'     => $seo,
		'llms_served'     => '' !== (string) get_option( 'msscore_llms_txt', '' ),
		'robots_managed'  => (bool) get_option( 'msscore_robots_enabled' ),
	);
}
