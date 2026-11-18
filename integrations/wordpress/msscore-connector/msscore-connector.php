<?php
/**
 * Plugin Name:       MS SCORE Connector
 * Description:       Lets MS SCORE apply SEO changes you have approved: SEO titles and meta descriptions (Yoast, Rank Math, SEOPress, AIOSEO or its own), page titles, 301 redirects and draft pages. Every change can be undone from MS SCORE.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Morosoft Technologies
 * License:           GPL-2.0-or-later
 * Text Domain:       msscore-connector
 *
 * @package MsscoreConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MSSCORE_CONNECTOR_VERSION', '1.0.0' );
define( 'MSSCORE_REDIRECTS_OPTION', 'msscore_redirects' );

/**
 * Which SEO plugin stores titles and descriptions on this site.
 *
 * @return string
 */
function msscore_seo_backend() {
	if ( defined( 'WPSEO_VERSION' ) ) {
		return 'yoast';
	}
	if ( class_exists( 'RankMath' ) ) {
		return 'rank-math';
	}
	if ( defined( 'SEOPRESS_VERSION' ) ) {
		return 'seopress';
	}
	if ( function_exists( 'aioseo' ) && class_exists( '\AIOSEO\Plugin\Common\Models\Post' ) ) {
		return 'aioseo';
	}
	return 'msscore';
}

/**
 * Post meta keys for SEO title and description per SEO plugin.
 *
 * @param string $backend Backend name.
 * @return array{0:string,1:string}
 */
function msscore_meta_keys( $backend ) {
	$keys = array(
		'yoast'     => array( '_yoast_wpseo_title', '_yoast_wpseo_metadesc' ),
		'rank-math' => array( 'rank_math_title', 'rank_math_description' ),
		'seopress'  => array( '_seopress_titles_title', '_seopress_titles_desc' ),
		'msscore'   => array( '_msscore_seo_title', '_msscore_seo_description' ),
	);
	return isset( $keys[ $backend ] ) ? $keys[ $backend ] : $keys['msscore'];
}

/**
 * Current SEO title and description of a post.
 *
 * @param int $post_id Post ID.
 * @return array{title:string|null,description:string|null}
 */
function msscore_get_seo( $post_id ) {
	$backend = msscore_seo_backend();
	if ( 'aioseo' === $backend ) {
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $post_id );
		return array(
			'title'       => isset( $row->title ) ? (string) $row->title : null,
			'description' => isset( $row->description ) ? (string) $row->description : null,
		);
	}
	list( $title_key, $desc_key ) = msscore_meta_keys( $backend );
	$title = get_post_meta( $post_id, $title_key, true );
	$desc  = get_post_meta( $post_id, $desc_key, true );
	return array(
		'title'       => '' === $title ? null : (string) $title,
		'description' => '' === $desc ? null : (string) $desc,
	);
}

/**
 * Writes the SEO title and/or description (an empty string removes it).
 *
 * @param int         $post_id     Post ID.
 * @param string|null $title       New SEO title, or null to leave it.
 * @param string|null $description New description, or null to leave it.
 */
function msscore_set_seo( $post_id, $title, $description ) {
	$backend = msscore_seo_backend();
	if ( 'aioseo' === $backend ) {
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $post_id );
		if ( null !== $title ) {
			$row->title = $title;
		}
		if ( null !== $description ) {
			$row->description = $description;
		}
		$row->post_id = $post_id;
		$row->save();
		return;
	}
	list( $title_key, $desc_key ) = msscore_meta_keys( $backend );
	foreach ( array( $title_key => $title, $desc_key => $description ) as $key => $value ) {
		if ( null === $value ) {
			continue;
		}
		if ( '' === $value ) {
			delete_post_meta( $post_id, $key );
		} else {
			update_post_meta( $post_id, $key, $value );
		}
	}
	// Let SEO plugins that cache per post (Yoast indexables) pick up the new values.
	wp_update_post( array( 'ID' => $post_id ) );
	clean_post_cache( $post_id );
}

/**
 * Only users who can edit other people's pages (editors and administrators) may use the API.
 *
 * @return bool
 */
function msscore_can_use() {
	return current_user_can( 'edit_others_pages' );
}

/**
 * Normalises a same-site path: leading slash, no host, no query, lower case, no trailing slash.
 *
 * @param string $path Path or address.
 * @return string
 */
function msscore_norm_path( $path ) {
	$path = (string) wp_parse_url( $path, PHP_URL_PATH );
	$path = '/' . trim( $path, '/' );
	return strtolower( untrailingslashit( $path ) ? untrailingslashit( $path ) : '/' );
}

/**
 * Post data returned to MS SCORE.
 *
 * @param WP_Post $post Post.
 * @return array
 */
function msscore_post_payload( $post ) {
	$seo = msscore_get_seo( $post->ID );
	return array(
		'id'              => $post->ID,
		'type'            => $post->post_type,
		'title'           => $post->post_title,
		'seo_title'       => $seo['title'],
		'seo_description' => $seo['description'],
		'edit_url'        => get_edit_post_link( $post->ID, 'raw' ),
	);
}

add_action( 'rest_api_init', 'msscore_register_routes' );

/**
 * REST routes under /wp-json/msscore/v1/.
 */
function msscore_register_routes() {
	$ns = 'msscore/v1';

	register_rest_route(
		$ns,
		'/status',
		array(
			'methods'             => 'GET',
			'permission_callback' => 'msscore_can_use',
			'callback'            => function () {
				return array(
					'version' => MSSCORE_CONNECTOR_VERSION,
					'seo'     => msscore_seo_backend(),
				);
			},
		)
	);

	register_rest_route(
		$ns,
		'/resolve',
		array(
			'methods'             => 'GET',
			'permission_callback' => 'msscore_can_use',
			'args'                => array(
				'url' => array(
					'required'          => true,
					'sanitize_callback' => 'esc_url_raw',
				),
			),
			'callback'            => function ( WP_REST_Request $req ) {
				$url = $req->get_param( 'url' );
				// Match by path on this site's own address (www or not, http or https).
				$path    = (string) wp_parse_url( $url, PHP_URL_PATH );
				$post_id = url_to_postid( home_url( '' === $path ? '/' : $path ) );
				if ( ! $post_id && '/' === msscore_norm_path( $url ) ) {
					$post_id = (int) get_option( 'page_on_front' );
				}
				$post = $post_id ? get_post( $post_id ) : null;
				if ( ! $post || ! current_user_can( 'edit_post', $post->ID ) ) {
					return new WP_Error( 'not_found', 'No editable post or page at this address.', array( 'status' => 404 ) );
				}
				return msscore_post_payload( $post );
			},
		)
	);

	register_rest_route(
		$ns,
		'/seo',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'msscore_can_use',
			'callback'            => function ( WP_REST_Request $req ) {
				$post_id = absint( $req->get_param( 'id' ) );
				if ( ! $post_id || ! get_post( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
					return new WP_Error( 'not_found', 'Post not found.', array( 'status' => 404 ) );
				}
				$before      = msscore_get_seo( $post_id );
				$title       = $req->has_param( 'title' ) ? sanitize_text_field( (string) $req->get_param( 'title' ) ) : null;
				$description = $req->has_param( 'description' ) ? sanitize_textarea_field( (string) $req->get_param( 'description' ) ) : null;
				msscore_set_seo( $post_id, $title, $description );
				return array( 'before' => $before );
			},
		)
	);

	register_rest_route(
		$ns,
		'/title',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'msscore_can_use',
			'callback'            => function ( WP_REST_Request $req ) {
				$post_id = absint( $req->get_param( 'id' ) );
				$title   = sanitize_text_field( (string) $req->get_param( 'title' ) );
				if ( ! $post_id || '' === $title || ! current_user_can( 'edit_post', $post_id ) ) {
					return new WP_Error( 'bad_request', 'Post or title missing.', array( 'status' => 400 ) );
				}
				$before = get_post_field( 'post_title', $post_id );
				$result = wp_update_post(
					array(
						'ID'         => $post_id,
						'post_title' => $title,
					),
					true
				);
				if ( is_wp_error( $result ) ) {
					return $result;
				}
				return array( 'before' => $before );
			},
		)
	);

	register_rest_route(
		$ns,
		'/redirects',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'msscore_can_use',
			'callback'            => function ( WP_REST_Request $req ) {
				$from = msscore_norm_path( (string) $req->get_param( 'from' ) );
				$to   = msscore_norm_path( (string) $req->get_param( 'to' ) );
				if ( '/' === $from || $from === $to ) {
					return new WP_Error( 'bad_request', 'Choose two different pages.', array( 'status' => 400 ) );
				}
				$redirects = get_option( MSSCORE_REDIRECTS_OPTION, array() );
				$id        = substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 12 );
				$redirects[ $id ] = array(
					'from' => $from,
					'to'   => $to,
				);
				update_option( MSSCORE_REDIRECTS_OPTION, array_slice( $redirects, -500, null, true ) );
				return array( 'id' => $id );
			},
		)
	);

	register_rest_route(
		$ns,
		'/redirects/(?P<id>[a-z0-9]{1,32})',
		array(
			'methods'             => 'DELETE',
			'permission_callback' => 'msscore_can_use',
			'callback'            => function ( WP_REST_Request $req ) {
				$redirects = get_option( MSSCORE_REDIRECTS_OPTION, array() );
				unset( $redirects[ $req->get_param( 'id' ) ] );
				update_option( MSSCORE_REDIRECTS_OPTION, $redirects );
				return array( 'deleted' => true );
			},
		)
	);
}

add_action( 'template_redirect', 'msscore_do_redirects', 1 );

/**
 * 301 redirects created from MS SCORE (merged pages).
 */
function msscore_do_redirects() {
	$redirects = get_option( MSSCORE_REDIRECTS_OPTION, array() );
	if ( empty( $redirects ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$path = msscore_norm_path( esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) );
	foreach ( $redirects as $redirect ) {
		if ( $redirect['from'] === $path ) {
			wp_safe_redirect( home_url( trailingslashit( $redirect['to'] ) ), 301, 'MS SCORE' );
			exit;
		}
	}
}

/*
 * Without an SEO plugin, MS SCORE's own SEO title and description are printed.
 */
add_filter( 'pre_get_document_title', 'msscore_document_title', 20 );

/**
 * Own SEO title on single posts and pages.
 *
 * @param string $title Title so far.
 * @return string
 */
function msscore_document_title( $title ) {
	if ( 'msscore' !== msscore_seo_backend() || ! is_singular() ) {
		return $title;
	}
	$custom = get_post_meta( get_queried_object_id(), '_msscore_seo_title', true );
	return '' !== $custom ? $custom : $title;
}

add_action( 'wp_head', 'msscore_meta_description', 1 );

/**
 * Own meta description on single posts and pages.
 */
function msscore_meta_description() {
	if ( 'msscore' !== msscore_seo_backend() || ! is_singular() ) {
		return;
	}
	$desc = get_post_meta( get_queried_object_id(), '_msscore_seo_description', true );
	if ( '' !== $desc ) {
		echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
	}
}
