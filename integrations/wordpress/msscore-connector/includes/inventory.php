<?php
/**
 * GET /inventory: every published post, page, product, category and product category with what MS
 * SCORE needs to plan changes and keep "before" values (title tag, description, canonical, robots,
 * H1s, images, word count, schema types).
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MSSCORE_INVENTORY_MAX_PER_PAGE', 100 );

/**
 * Content types this site has, in the order MS SCORE reads them.
 *
 * @return string[]
 */
function msscore_inventory_types() {
	$types = array( 'page', 'post' );
	if ( post_type_exists( 'product' ) ) {
		$types[] = 'product';
	}
	$types[] = 'category';
	if ( taxonomy_exists( 'product_cat' ) ) {
		$types[] = 'product_cat';
	}
	return $types;
}

/**
 * Whether a type is a taxonomy (categories) rather than a post type.
 *
 * @param string $type Inventory type.
 * @return bool
 */
function msscore_is_term_type( $type ) {
	return in_array( $type, array( 'category', 'product_cat' ), true );
}

/**
 * SEO fields of a post as the active SEO plugin stores them.
 *
 * @param int $post_id Post ID.
 * @return array{title:string|null,description:string|null,canonical:string|null,noindex:bool,nofollow:bool}
 */
function msscore_post_seo_fields( $post_id ) {
	$backend = msscore_seo_backend();
	$base    = msscore_get_seo( $post_id );
	$get     = function ( $key ) use ( $post_id ) {
		$v = get_post_meta( $post_id, $key, true );
		return is_string( $v ) ? $v : '';
	};
	$canonical = '';
	$noindex   = false;
	$nofollow  = false;
	switch ( $backend ) {
		case 'yoast':
			$canonical = $get( '_yoast_wpseo_canonical' );
			$noindex   = '1' === $get( '_yoast_wpseo_meta-robots-noindex' );
			$nofollow  = '1' === $get( '_yoast_wpseo_meta-robots-nofollow' );
			break;
		case 'rank-math':
			$canonical = $get( 'rank_math_canonical_url' );
			$robots    = get_post_meta( $post_id, 'rank_math_robots', true );
			$robots    = is_array( $robots ) ? $robots : array();
			$noindex   = in_array( 'noindex', $robots, true );
			$nofollow  = in_array( 'nofollow', $robots, true );
			break;
		case 'seopress':
			$canonical = $get( '_seopress_robots_canonical' );
			$noindex   = 'yes' === $get( '_seopress_robots_index' );
			$nofollow  = 'yes' === $get( '_seopress_robots_follow' );
			break;
		case 'aioseo':
			$row       = \AIOSEO\Plugin\Common\Models\Post::getPost( $post_id );
			$canonical = isset( $row->canonical_url ) ? (string) $row->canonical_url : '';
			$noindex   = ! empty( $row->robots_noindex );
			$nofollow  = ! empty( $row->robots_nofollow );
			break;
		case 'bricks':
			$bs        = msscore_bricks_settings( $post_id );
			$robots    = isset( $bs['robots'] ) && is_array( $bs['robots'] ) ? $bs['robots'] : array();
			$canonical = $get( '_msscore_canonical' );
			$noindex   = in_array( 'noindex', $robots, true ) || '1' === $get( '_msscore_noindex' );
			$nofollow  = in_array( 'nofollow', $robots, true );
			break;
		default:
			$canonical = $get( '_msscore_canonical' );
			$noindex   = '1' === $get( '_msscore_noindex' );
	}
	return array(
		'title'       => $base['title'],
		'description' => $base['description'],
		'canonical'   => '' === $canonical ? null : $canonical,
		'noindex'     => $noindex,
		'nofollow'    => $nofollow,
	);
}

/**
 * SEO fields of a category or product category.
 *
 * @param WP_Term $term Term.
 * @return array{title:string|null,description:string|null,canonical:string|null,noindex:bool,nofollow:bool}
 */
function msscore_term_seo_fields( $term ) {
	$backend = msscore_seo_backend();
	$out     = array(
		'title'       => null,
		'description' => null,
		'canonical'   => null,
		'noindex'     => false,
		'nofollow'    => false,
	);
	$meta    = function ( $key ) use ( $term ) {
		$v = get_term_meta( $term->term_id, $key, true );
		return is_string( $v ) && '' !== $v ? $v : null;
	};
	if ( 'yoast' === $backend ) {
		$all = get_option( 'wpseo_taxonomy_meta', array() );
		$row = isset( $all[ $term->taxonomy ][ $term->term_id ] ) ? (array) $all[ $term->taxonomy ][ $term->term_id ] : array();
		$out['title']       = ! empty( $row['wpseo_title'] ) ? (string) $row['wpseo_title'] : null;
		$out['description'] = ! empty( $row['wpseo_desc'] ) ? (string) $row['wpseo_desc'] : null;
		$out['canonical']   = ! empty( $row['wpseo_canonical'] ) ? (string) $row['wpseo_canonical'] : null;
		$out['noindex']     = isset( $row['wpseo_noindex'] ) && 'noindex' === $row['wpseo_noindex'];
	} elseif ( 'rank-math' === $backend ) {
		$out['title']       = $meta( 'rank_math_title' );
		$out['description'] = $meta( 'rank_math_description' );
		$out['canonical']   = $meta( 'rank_math_canonical_url' );
		$robots             = get_term_meta( $term->term_id, 'rank_math_robots', true );
		$out['noindex']     = is_array( $robots ) && in_array( 'noindex', $robots, true );
		$out['nofollow']    = is_array( $robots ) && in_array( 'nofollow', $robots, true );
	} elseif ( 'seopress' === $backend ) {
		$out['title']       = $meta( '_seopress_titles_title' );
		$out['description'] = $meta( '_seopress_titles_desc' );
		$out['canonical']   = $meta( '_seopress_robots_canonical' );
		$out['noindex']     = 'yes' === $meta( '_seopress_robots_index' );
	} elseif ( 'msscore' === $backend ) {
		$out['title']       = $meta( '_msscore_seo_title' );
		$out['description'] = $meta( '_msscore_seo_description' );
		$out['canonical']   = $meta( '_msscore_canonical' );
		$out['noindex']     = '1' === $meta( '_msscore_noindex' );
	}
	return $out;
}

/**
 * The stored SEO title with the SEO plugin's variables filled in, where the plugin can do that.
 *
 * @param string|null $stored Stored SEO title.
 * @param WP_Post     $post   Post.
 * @return string|null
 */
function msscore_resolved_title( $stored, $post ) {
	if ( null === $stored || '' === $stored ) {
		return null;
	}
	if ( false === strpos( $stored, '%' ) ) {
		return $stored;
	}
	if ( function_exists( 'wpseo_replace_vars' ) ) {
		return (string) wpseo_replace_vars( $stored, $post );
	}
	if ( class_exists( '\RankMath\Helper' ) && method_exists( '\RankMath\Helper', 'replace_vars' ) ) {
		return (string) \RankMath\Helper::replace_vars( $stored, $post );
	}
	return null;
}

/**
 * Bricks elements of a post (flat list), or an empty list when the page is not built with Bricks.
 *
 * @param int $post_id Post ID.
 * @return array<int,array>
 */
function msscore_bricks_elements( $post_id ) {
	if ( 'bricks' !== get_post_meta( $post_id, '_bricks_editor_mode', true ) ) {
		return array();
	}
	$els = get_post_meta( $post_id, '_bricks_page_content_2', true );
	return is_array( $els ) ? array_values( array_filter( $els, 'is_array' ) ) : array();
}

/**
 * H1 headings written in the content: Classic HTML, Gutenberg heading blocks and Elementor widgets.
 * (An H1 the theme prints around the post title is not in the content; MS SCORE reads it from the page.)
 *
 * @param WP_Post $post Post.
 * @return string[]
 */
function msscore_content_h1s( $post ) {
	$h1s = array();
	if ( preg_match_all( '/<h1\b[^>]*>(.*?)<\/h1>/is', (string) $post->post_content, $m ) ) {
		foreach ( $m[1] as $h ) {
			$h1s[] = trim( wp_strip_all_tags( $h ) );
		}
	}
	$data = get_post_meta( $post->ID, '_elementor_data', true );
	if ( is_string( $data ) && '' !== $data ) {
		$tree = json_decode( $data, true );
		if ( is_array( $tree ) ) {
			$walk = function ( $nodes ) use ( &$walk, &$h1s ) {
				foreach ( (array) $nodes as $n ) {
					if ( ! is_array( $n ) ) {
						continue;
					}
					if ( isset( $n['widgetType'] ) && 'heading' === $n['widgetType'] && isset( $n['settings']['header_size'] ) && 'h1' === $n['settings']['header_size'] ) {
						$h1s[] = trim( wp_strip_all_tags( (string) ( isset( $n['settings']['title'] ) ? $n['settings']['title'] : '' ) ) );
					}
					if ( ! empty( $n['elements'] ) ) {
						$walk( $n['elements'] );
					}
				}
			};
			$walk( $tree );
		}
	}
	foreach ( msscore_bricks_elements( $post->ID ) as $el ) {
		$set = isset( $el['settings'] ) && is_array( $el['settings'] ) ? $el['settings'] : array();
		$tag = isset( $set['tag'] ) ? strtolower( (string) $set['tag'] ) : ( isset( $el['name'] ) && 'heading' === $el['name'] ? 'h3' : '' );
		if ( 'h1' === $tag && isset( $set['text'] ) ) {
			$h1s[] = trim( wp_strip_all_tags( (string) $set['text'] ) );
		}
	}
	return array_values( array_filter( $h1s, 'strlen' ) );
}

/**
 * The text a visitor reads, for the word count (Elementor text widgets included).
 *
 * @param WP_Post $post Post.
 * @return string
 */
function msscore_plain_text( $post ) {
	$text = (string) $post->post_content;
	$data = get_post_meta( $post->ID, '_elementor_data', true );
	if ( is_string( $data ) && '' !== $data && preg_match_all( '/"(?:editor|title|description_text|text)":"((?:[^"\\\\]|\\\\.)*)"/', $data, $m ) ) {
		foreach ( $m[1] as $s ) {
			$decoded = json_decode( '"' . $s . '"' );
			$text   .= ' ' . ( is_string( $decoded ) ? $decoded : '' );
		}
	}
	foreach ( msscore_bricks_elements( $post->ID ) as $el ) {
		if ( isset( $el['settings']['text'] ) && is_string( $el['settings']['text'] ) ) {
			$text .= ' ' . $el['settings']['text'];
		}
	}
	$text = strip_shortcodes( $text );
	$text = preg_replace( '/<!--.*?-->/s', ' ', $text );
	return trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $text ) ) );
}

/**
 * Images on a post: the featured image and every image in the content, with alt text.
 *
 * @param WP_Post $post Post.
 * @return array<int,array{id:int|null,url:string,alt:string|null,featured:bool}>
 */
function msscore_post_images( $post ) {
	$images = array();
	$seen   = array();
	$thumb  = get_post_thumbnail_id( $post->ID );
	if ( $thumb ) {
		$url = wp_get_attachment_url( $thumb );
		if ( $url ) {
			$seen[ $url ] = true;
			$images[]     = array(
				'id'       => (int) $thumb,
				'url'      => $url,
				'alt'      => (string) get_post_meta( $thumb, '_wp_attachment_image_alt', true ),
				'featured' => true,
			);
		}
	}
	if ( preg_match_all( '/<img\b[^>]*>/i', (string) $post->post_content, $m ) ) {
		foreach ( $m[0] as $tag ) {
			if ( ! preg_match( '/\ssrc=["\']([^"\']+)["\']/i', $tag, $src ) || isset( $seen[ $src[1] ] ) ) {
				continue;
			}
			$seen[ $src[1] ] = true;
			$id              = preg_match( '/wp-image-(\d+)/', $tag, $idm ) ? (int) $idm[1] : null;
			$alt             = preg_match( '/\salt=["\']([^"\']*)["\']/i', $tag, $altm ) ? html_entity_decode( $altm[1], ENT_QUOTES ) : null;
			if ( null === $alt && $id ) {
				$alt = (string) get_post_meta( $id, '_wp_attachment_image_alt', true );
			}
			$images[] = array(
				'id'       => $id,
				'url'      => $src[1],
				'alt'      => $alt,
				'featured' => false,
			);
			if ( count( $images ) >= 60 ) {
				break;
			}
		}
	}
	foreach ( msscore_bricks_elements( $post->ID ) as $el ) {
		if ( ! isset( $el['name'] ) || 'image' !== $el['name'] || empty( $el['settings']['image'] ) || ! is_array( $el['settings']['image'] ) ) {
			continue;
		}
		$img = $el['settings']['image'];
		$id  = isset( $img['id'] ) ? (int) $img['id'] : null;
		$url = isset( $img['url'] ) ? (string) $img['url'] : ( $id ? (string) wp_get_attachment_url( $id ) : '' );
		if ( '' === $url || isset( $seen[ $url ] ) || count( $images ) >= 60 ) {
			continue;
		}
		$seen[ $url ] = true;
		$alt          = isset( $el['settings']['altText'] ) && '' !== $el['settings']['altText'] ? (string) $el['settings']['altText'] : ( $id ? (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) : null );
		$images[]     = array(
			'id'       => $id,
			'url'      => $url,
			'alt'      => $alt,
			'featured' => false,
		);
	}
	return $images;
}

/**
 * Schema types the site prints for a page of this type, as far as the plugin can tell without
 * rendering it (SEO plugin defaults, WooCommerce, MS SCORE's own blocks). MS SCORE also reads the
 * live page, which is the final word.
 *
 * @param WP_Post $post Post.
 * @return string[]
 */
function msscore_schema_types( $post ) {
	$types = array();
	$seo   = msscore_seo_backend();
	if ( in_array( $seo, array( 'yoast', 'rank-math', 'aioseo', 'seopress' ), true ) ) {
		$types[] = 'WebPage';
		if ( 'seopress' !== $seo ) {
			$types[] = 'WebSite';
			$types[] = 'BreadcrumbList';
		}
		if ( 'post' === $post->post_type ) {
			$types[] = 'Article';
		}
	}
	if ( 'product' === $post->post_type && class_exists( 'WooCommerce' ) ) {
		$types[] = 'Product';
	}
	if ( preg_match_all( '/"@type"\s*:\s*"([A-Za-z]+)"/', (string) $post->post_content, $m ) ) {
		$types = array_merge( $types, $m[1] );
	}
	return array_values( array_unique( $types ) );
}

/**
 * How a post's content was built: elementor, gutenberg or classic.
 *
 * @param WP_Post $post Post.
 * @return string
 */
function msscore_post_builder( $post ) {
	if ( 'builder' === get_post_meta( $post->ID, '_elementor_edit_mode', true ) ) {
		return 'elementor';
	}
	if ( 'on' === get_post_meta( $post->ID, '_et_pb_use_builder', true ) ) {
		return 'divi';
	}
	if ( 'bricks' === get_post_meta( $post->ID, '_bricks_editor_mode', true ) ) {
		return 'bricks';
	}
	return function_exists( 'has_blocks' ) && has_blocks( $post ) ? 'gutenberg' : 'classic';
}

/**
 * One inventory row for a post, page or product.
 *
 * @param WP_Post $post Post.
 * @return array
 */
function msscore_inventory_post( $post ) {
	$seo  = msscore_post_seo_fields( $post->ID );
	$text = msscore_plain_text( $post );
	return array(
		'id'               => $post->ID,
		'url'              => get_permalink( $post ),
		'type'             => $post->post_type,
		'name'             => $post->post_title,
		'title_tag'        => msscore_resolved_title( $seo['title'], $post ),
		'seo_title'        => $seo['title'],
		'meta_description' => $seo['description'],
		'canonical'        => $seo['canonical'],
		'robots'           => array(
			'noindex'  => $seo['noindex'],
			'nofollow' => $seo['nofollow'],
		),
		'h1s'              => msscore_content_h1s( $post ),
		'images'           => msscore_post_images( $post ),
		'word_count'       => '' === $text ? 0 : count( preg_split( '/\s+/u', $text ) ),
		'schema_types'     => msscore_schema_types( $post ),
		'builder'          => msscore_post_builder( $post ),
		'is_front_page'    => (int) get_option( 'page_on_front' ) === $post->ID,
		'modified'         => get_post_modified_time( 'c', true, $post ),
	);
}

/**
 * One inventory row for a category or product category.
 *
 * @param WP_Term $term Term.
 * @return array
 */
function msscore_inventory_term( $term ) {
	$seo  = msscore_term_seo_fields( $term );
	$link = get_term_link( $term );
	$text = trim( wp_strip_all_tags( (string) $term->description ) );
	return array(
		'id'               => $term->term_id,
		'url'              => is_wp_error( $link ) ? null : $link,
		'type'             => $term->taxonomy,
		'name'             => $term->name,
		'title_tag'        => $seo['title'],
		'seo_title'        => $seo['title'],
		'meta_description' => $seo['description'],
		'canonical'        => $seo['canonical'],
		'robots'           => array(
			'noindex'  => $seo['noindex'],
			'nofollow' => $seo['nofollow'],
		),
		'h1s'              => array(),
		'images'           => array(),
		'word_count'       => '' === $text ? 0 : count( preg_split( '/\s+/u', $text ) ),
		'schema_types'     => array(),
		'builder'          => null,
		'is_front_page'    => false,
		'modified'         => null,
		'count'            => (int) $term->count,
	);
}

/**
 * GET /inventory?type=page&page=1&per_page=50
 *
 * @param WP_REST_Request $req Request.
 * @return array|WP_Error
 */
function msscore_rest_inventory( WP_REST_Request $req ) {
	$type     = sanitize_key( (string) $req->get_param( 'type' ) );
	$page     = max( 1, absint( $req->get_param( 'page' ) ) );
	$per_page = min( MSSCORE_INVENTORY_MAX_PER_PAGE, max( 1, absint( $req->get_param( 'per_page' ) ? $req->get_param( 'per_page' ) : 50 ) ) );
	if ( ! in_array( $type, msscore_inventory_types(), true ) ) {
		return new WP_Error( 'bad_request', 'Unknown type. Use one of: ' . implode( ', ', msscore_inventory_types() ), array( 'status' => 400 ) );
	}
	if ( msscore_is_term_type( $type ) ) {
		$total = (int) wp_count_terms(
			array(
				'taxonomy'   => $type,
				'hide_empty' => false,
			)
		);
		$terms = get_terms(
			array(
				'taxonomy'   => $type,
				'hide_empty' => false,
				'number'     => $per_page,
				'offset'     => ( $page - 1 ) * $per_page,
				'orderby'    => 'term_id',
				'order'      => 'ASC',
			)
		);
		$items = is_wp_error( $terms ) ? array() : array_map( 'msscore_inventory_term', $terms );
	} else {
		$q     = new WP_Query(
			array(
				'post_type'           => $type,
				'post_status'         => 'publish',
				'has_password'        => false,
				'posts_per_page'      => $per_page,
				'paged'               => $page,
				'orderby'             => 'ID',
				'order'               => 'ASC',
				'ignore_sticky_posts' => true,
				'no_found_rows'       => false,
			)
		);
		$total = (int) $q->found_posts;
		$items = array_map( 'msscore_inventory_post', $q->posts );
	}
	return array(
		'type'        => $type,
		'page'        => $page,
		'per_page'    => $per_page,
		'total'       => $total,
		'total_pages' => (int) ceil( $total / $per_page ),
		'items'       => $items,
	);
}
