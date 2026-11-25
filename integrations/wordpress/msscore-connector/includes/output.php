<?php
/**
 * What MS SCORE prints on pages when no SEO plugin does it: canonical, robots, Open Graph and
 * Twitter tags, category titles and descriptions, JSON-LD blocks and FAQ schema. With an SEO plugin
 * active, its own fields are written instead and nothing here is printed (except MS SCORE's schema
 * blocks, which never repeat a type the SEO plugin prints).
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Whether MS SCORE prints the basic SEO tags itself (no SEO plugin, or Bricks for title/description).
 *
 * @return bool
 */
function msscore_prints_tags() {
	return in_array( msscore_seo_backend(), array( 'msscore', 'bricks' ), true );
}

add_filter( 'get_canonical_url', 'msscore_canonical_url', 20, 2 );

/**
 * Own canonical address on single posts and pages (WordPress prints it with rel_canonical).
 *
 * @param string  $url  Canonical so far.
 * @param WP_Post $post Post.
 * @return string
 */
function msscore_canonical_url( $url, $post ) {
	if ( ! msscore_prints_tags() ) {
		return $url;
	}
	$own = get_post_meta( $post->ID, '_msscore_canonical', true );
	return is_string( $own ) && '' !== $own ? $own : $url;
}

add_filter( 'wp_robots', 'msscore_wp_robots', 20 );

/**
 * Own noindex on posts, pages and categories (WordPress prints the robots meta tag).
 *
 * @param array $robots Directives so far.
 * @return array
 */
function msscore_wp_robots( $robots ) {
	if ( ! msscore_prints_tags() ) {
		return $robots;
	}
	$flag = '';
	if ( is_singular() ) {
		$flag = (string) get_post_meta( get_queried_object_id(), '_msscore_noindex', true );
	} elseif ( is_category() || is_tax() ) {
		$flag = (string) get_term_meta( get_queried_object_id(), '_msscore_noindex', true );
	}
	if ( '1' === $flag ) {
		unset( $robots['index'], $robots['max-image-preview'] );
		$robots['noindex'] = true;
	}
	return $robots;
}

add_filter( 'pre_get_document_title', 'msscore_term_title', 20 );

/**
 * Own SEO title on category archives (no SEO plugin).
 *
 * @param string $title Title so far.
 * @return string
 */
function msscore_term_title( $title ) {
	if ( 'msscore' !== msscore_seo_backend() || ! ( is_category() || is_tax() ) ) {
		return $title;
	}
	$own = get_term_meta( get_queried_object_id(), '_msscore_seo_title', true );
	return is_string( $own ) && '' !== $own ? $own : $title;
}

/**
 * Whether another plugin prints Open Graph tags (Jetpack), so MS SCORE must not.
 *
 * @return bool
 */
function msscore_other_og() {
	return (bool) apply_filters( 'jetpack_enable_open_graph', false ) || class_exists( 'WPSSO' ) || defined( 'OGP_VERSION' );
}

add_action( 'wp_head', 'msscore_head_tags', 2 );

/**
 * Category description, Open Graph and Twitter tags (no SEO plugin at all; Bricks prints its own).
 */
function msscore_head_tags() {
	if ( 'msscore' !== msscore_seo_backend() ) {
		return;
	}
	if ( is_category() || is_tax() ) {
		$desc = get_term_meta( get_queried_object_id(), '_msscore_seo_description', true );
		if ( is_string( $desc ) && '' !== $desc ) {
			echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
		}
		return;
	}
	if ( ! is_singular() || msscore_other_og() ) {
		return;
	}
	$id    = get_queried_object_id();
	$seo   = msscore_get_seo( $id );
	$title = (string) get_post_meta( $id, '_msscore_og_title', true );
	$desc  = (string) get_post_meta( $id, '_msscore_og_description', true );
	$image = (string) get_post_meta( $id, '_msscore_og_image', true );
	if ( '' === $title && '' === $desc && '' === $image ) {
		return;
	}
	$title = '' !== $title ? $title : ( $seo['title'] ? $seo['title'] : get_the_title( $id ) );
	$desc  = '' !== $desc ? $desc : (string) $seo['description'];
	if ( '' === $image && has_post_thumbnail( $id ) ) {
		$image = (string) get_the_post_thumbnail_url( $id, 'large' );
	}
	$tags = array(
		'og:type'             => is_front_page() ? 'website' : 'article',
		'og:url'              => (string) wp_get_canonical_url( $id ),
		'og:title'            => $title,
		'og:description'      => $desc,
		'og:image'            => $image,
		'og:site_name'        => get_bloginfo( 'name' ),
		'twitter:card'        => '' !== $image ? 'summary_large_image' : 'summary',
		'twitter:title'       => $title,
		'twitter:description' => $desc,
		'twitter:image'       => $image,
	);
	foreach ( $tags as $k => $v ) {
		if ( '' === (string) $v ) {
			continue;
		}
		$attr = 0 === strpos( $k, 'og:' ) ? 'property' : 'name';
		echo '<meta ' . $attr . '="' . esc_attr( $k ) . '" content="' . esc_attr( $v ) . '">' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}

add_action( 'wp_head', 'msscore_head_schema', 30 );

/**
 * JSON-LD blocks for this page, and FAQPage schema for MS SCORE FAQ blocks.
 */
function msscore_head_schema() {
	$id    = is_singular() ? get_queried_object_id() : 0;
	$blobs = array();
	foreach ( (array) get_option( 'msscore_schema', array() ) as $entry ) {
		if ( ! is_array( $entry ) || empty( $entry['json'] ) ) {
			continue;
		}
		$pid = (int) $entry['post_id'];
		if ( ( 0 === $pid && is_front_page() ) || ( $pid && $pid === $id ) ) {
			$blobs[] = $entry['json'];
		}
	}
	if ( $id ) {
		$faq = get_post_meta( $id, '_msscore_faq', true );
		if ( is_array( $faq ) && $faq ) {
			$items = array();
			foreach ( $faq as $block ) {
				foreach ( (array) $block as $f ) {
					$items[] = array(
						'@type'          => 'Question',
						'name'           => $f['q'],
						'acceptedAnswer' => array(
							'@type' => 'Answer',
							'text'  => $f['a'],
						),
					);
				}
			}
			if ( $items ) {
				$blobs[] = array(
					'@context'   => 'https://schema.org',
					'@type'      => 'FAQPage',
					'mainEntity' => $items,
				);
			}
		}
	}
	foreach ( $blobs as $b ) {
		echo '<script type="application/ld+json" class="msscore-schema">' . wp_json_encode( $b, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}

add_action( 'template_redirect', 'msscore_title_buffer', 99 );

/**
 * Themes that write their own <title> ignore pre_get_document_title; for those, MS SCORE's title is
 * put into the <title> tag of the finished page (nothing else on the page is touched).
 */
function msscore_title_buffer() {
	if ( 'msscore' !== msscore_seo_backend() || current_theme_supports( 'title-tag' ) || ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ) || ! is_singular() ) {
		return;
	}
	$own = get_post_meta( get_queried_object_id(), '_msscore_seo_title', true );
	if ( ! is_string( $own ) || '' === $own ) {
		return;
	}
	ob_start(
		function ( $html ) use ( $own ) {
			return preg_replace( '/<title\b[^>]*>.*?<\/title>/is', '<title>' . esc_html( $own ) . '</title>', $html, 1 );
		}
	);
}
