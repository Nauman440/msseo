<?php
/**
 * Clears cached copies of a page after a change, so the new value is live straight away.
 * Supports WP Rocket, LiteSpeed, W3 Total Cache, WP Super Cache, SiteGround Optimizer and the
 * Cloudflare plugin; anything else falls back to clearing everything it can.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Purges one address (or the whole site when $url is empty). Returns which caches were told.
 *
 * @param string     $url     Page address.
 * @param int|null   $post_id Post, when known.
 * @return string[]
 */
function msscore_purge_cache( $url = '', $post_id = null ) {
	$done = array();
	if ( $post_id ) {
		clean_post_cache( $post_id );
	}
	if ( function_exists( 'rocket_clean_files' ) && $url ) {
		rocket_clean_files( array( $url ) );
		$done[] = 'wp-rocket';
	} elseif ( function_exists( 'rocket_clean_domain' ) ) {
		rocket_clean_domain();
		$done[] = 'wp-rocket';
	}
	if ( defined( 'LSCWP_V' ) ) {
		if ( $url ) {
			do_action( 'litespeed_purge_url', $url );
		} else {
			do_action( 'litespeed_purge_all' );
		}
		$done[] = 'litespeed';
	}
	if ( function_exists( 'w3tc_flush_url' ) && $url ) {
		w3tc_flush_url( $url );
		$done[] = 'w3-total-cache';
	} elseif ( function_exists( 'w3tc_flush_all' ) ) {
		w3tc_flush_all();
		$done[] = 'w3-total-cache';
	}
	if ( function_exists( 'wpsc_delete_url_cache' ) && $url ) {
		wpsc_delete_url_cache( $url );
		$done[] = 'wp-super-cache';
	} elseif ( function_exists( 'wp_cache_clear_cache' ) ) {
		wp_cache_clear_cache();
		$done[] = 'wp-super-cache';
	}
	if ( function_exists( 'sg_cachepress_purge_cache' ) ) {
		sg_cachepress_purge_cache( $url ? $url : null );
		$done[] = 'sg-optimizer';
	}
	if ( class_exists( '\CF\WordPress\Hooks' ) ) {
		try {
			$hooks = new \CF\WordPress\Hooks();
			if ( $post_id && method_exists( $hooks, 'purgeCacheByRelevantURLs' ) ) {
				$hooks->purgeCacheByRelevantURLs( $post_id );
			} elseif ( method_exists( $hooks, 'purgeCacheEverything' ) ) {
				$hooks->purgeCacheEverything();
			}
			$done[] = 'cloudflare';
		} catch ( \Throwable $e ) {
			// The Cloudflare plugin is not configured; nothing to purge.
			unset( $e );
		}
	}
	if ( ! $done ) {
		wp_cache_flush();
		$done[] = 'object-cache';
	}
	return $done;
}
