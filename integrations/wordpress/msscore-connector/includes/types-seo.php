<?php
/**
 * Change types that write SEO fields: meta_title, meta_description, canonical, robots_noindex and
 * og_tags. With an SEO plugin active its own fields are written and MS SCORE prints nothing; without
 * one, Bricks' page settings or MS SCORE's own fields are used (printed by output.php).
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * What a change is aimed at.
 *
 * @param mixed $target { post_id } | { term_id, taxonomy } | { attachment_id } | { site: true }.
 * @return array{kind:string,id:int,taxonomy:string,url:string}|WP_Error
 */
function msscore_resolve_target( $target ) {
	$target = is_array( $target ) ? $target : array();
	if ( ! empty( $target['post_id'] ) ) {
		$post = get_post( absint( $target['post_id'] ) );
		if ( ! $post || ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'not_found', 'No editable post with this id.', array( 'status' => 404 ) );
		}
		return array(
			'kind'     => 'post',
			'id'       => $post->ID,
			'taxonomy' => '',
			'url'      => (string) get_permalink( $post ),
		);
	}
	if ( ! empty( $target['term_id'] ) ) {
		$tax  = sanitize_key( isset( $target['taxonomy'] ) ? $target['taxonomy'] : 'category' );
		$term = get_term( absint( $target['term_id'] ), $tax );
		if ( ! $term || is_wp_error( $term ) || ! current_user_can( 'edit_term', $term->term_id ) ) {
			return new WP_Error( 'not_found', 'No editable category with this id.', array( 'status' => 404 ) );
		}
		$link = get_term_link( $term );
		return array(
			'kind'     => 'term',
			'id'       => $term->term_id,
			'taxonomy' => $term->taxonomy,
			'url'      => is_wp_error( $link ) ? '' : $link,
		);
	}
	if ( ! empty( $target['attachment_id'] ) ) {
		$id = absint( $target['attachment_id'] );
		if ( 'attachment' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			return new WP_Error( 'not_found', 'No editable image with this id.', array( 'status' => 404 ) );
		}
		return array(
			'kind'     => 'attachment',
			'id'       => $id,
			'taxonomy' => '',
			'url'      => '',
		);
	}
	if ( ! empty( $target['site'] ) ) {
		return array(
			'kind'     => 'site',
			'id'       => 0,
			'taxonomy' => '',
			'url'      => home_url( '/' ),
		);
	}
	return new WP_Error( 'bad_request', 'Say which post, category, image or site to change.', array( 'status' => 400 ) );
}

/**
 * Reads or writes one SEO field of a category for the active SEO plugin.
 *
 * @param array       $t     Resolved term target.
 * @param string      $field title | description | canonical | noindex.
 * @param string|null $value New value; null reads.
 * @return string|null|WP_Error The value (read), or null after a write.
 */
function msscore_term_field( $t, $field, $value = null ) {
	$backend = msscore_seo_backend();
	$id      = $t['id'];
	if ( 'yoast' === $backend ) {
		$keys = array(
			'title'       => 'wpseo_title',
			'description' => 'wpseo_desc',
			'canonical'   => 'wpseo_canonical',
			'noindex'     => 'wpseo_noindex',
		);
		$all  = get_option( 'wpseo_taxonomy_meta', array() );
		$all  = is_array( $all ) ? $all : array();
		$row  = isset( $all[ $t['taxonomy'] ][ $id ] ) ? (array) $all[ $t['taxonomy'] ][ $id ] : array();
		$key  = $keys[ $field ];
		if ( null === $value ) {
			$v = isset( $row[ $key ] ) ? (string) $row[ $key ] : '';
			return 'noindex' === $field ? ( 'noindex' === $v ? 'noindex' : 'index' ) : ( '' === $v ? null : $v );
		}
		$row[ $key ]                        = 'noindex' === $field ? ( 'noindex' === $value ? 'noindex' : 'default' ) : $value;
		$all[ $t['taxonomy'] ][ $id ]       = $row;
		update_option( 'wpseo_taxonomy_meta', $all );
		return null;
	}
	if ( 'aioseo' === $backend ) {
		return new WP_Error( 'needs_human', 'All in One SEO keeps category SEO fields in its Pro tables; change this one in All in One SEO.' );
	}
	$map  = array(
		'rank-math' => array( 'rank_math_title', 'rank_math_description', 'rank_math_canonical_url', 'rank_math_robots' ),
		'seopress'  => array( '_seopress_titles_title', '_seopress_titles_desc', '_seopress_robots_canonical', '_seopress_robots_index' ),
	);
	$keys = isset( $map[ $backend ] ) ? $map[ $backend ] : array( '_msscore_seo_title', '_msscore_seo_description', '_msscore_canonical', '_msscore_noindex' );
	$key  = $keys[ array_search( $field, array( 'title', 'description', 'canonical', 'noindex' ), true ) ];
	if ( 'noindex' === $field ) {
		return msscore_noindex_meta( 'term', $id, $key, $backend, $value );
	}
	if ( null === $value ) {
		$v = get_term_meta( $id, $key, true );
		return is_string( $v ) && '' !== $v ? $v : null;
	}
	if ( '' === $value ) {
		delete_term_meta( $id, $key );
	} else {
		update_term_meta( $id, $key, $value );
	}
	return null;
}

/**
 * Reads or writes the noindex flag stored in post or term meta, in the shape each plugin uses.
 *
 * @param string      $kind    post | term.
 * @param int         $id      Object id.
 * @param string      $key     Meta key.
 * @param string      $backend SEO backend.
 * @param string|null $value   index | noindex; null reads.
 * @return string|null
 */
function msscore_noindex_meta( $kind, $id, $key, $backend, $value ) {
	$get = 'post' === $kind ? 'get_post_meta' : 'get_term_meta';
	$set = 'post' === $kind ? 'update_post_meta' : 'update_term_meta';
	$del = 'post' === $kind ? 'delete_post_meta' : 'delete_term_meta';
	$cur = $get( $id, $key, true );
	if ( 'rank-math' === $backend ) {
		$robots = is_array( $cur ) ? $cur : array();
		if ( null === $value ) {
			return in_array( 'noindex', $robots, true ) ? 'noindex' : 'index';
		}
		$robots = array_values( array_diff( $robots, array( 'noindex', 'index' ) ) );
		$robots[] = 'noindex' === $value ? 'noindex' : 'index';
		$set( $id, $key, $robots );
		return null;
	}
	$on = 'seopress' === $backend ? 'yes' : '1';
	if ( null === $value ) {
		return $on === (string) $cur ? 'noindex' : 'index';
	}
	if ( 'noindex' === $value ) {
		$set( $id, $key, $on );
	} else {
		$del( $id, $key );
	}
	return null;
}

/**
 * Post meta key per backend for canonical, noindex and Open Graph fields.
 *
 * @param string $backend SEO backend.
 * @return array<string,string>
 */
function msscore_post_keys( $backend ) {
	$keys = array(
		'yoast'     => array(
			'canonical'      => '_yoast_wpseo_canonical',
			'noindex'        => '_yoast_wpseo_meta-robots-noindex',
			'og_title'       => '_yoast_wpseo_opengraph-title',
			'og_description' => '_yoast_wpseo_opengraph-description',
			'og_image'       => '_yoast_wpseo_opengraph-image',
		),
		'rank-math' => array(
			'canonical'      => 'rank_math_canonical_url',
			'noindex'        => 'rank_math_robots',
			'og_title'       => 'rank_math_facebook_title',
			'og_description' => 'rank_math_facebook_description',
			'og_image'       => 'rank_math_facebook_image',
		),
		'seopress'  => array(
			'canonical'      => '_seopress_robots_canonical',
			'noindex'        => '_seopress_robots_index',
			'og_title'       => '_seopress_social_fb_title',
			'og_description' => '_seopress_social_fb_desc',
			'og_image'       => '_seopress_social_fb_img',
		),
	);
	return isset( $keys[ $backend ] ) ? $keys[ $backend ] : array(
		'canonical'      => '_msscore_canonical',
		'noindex'        => '_msscore_noindex',
		'og_title'       => '_msscore_og_title',
		'og_description' => '_msscore_og_description',
		'og_image'       => '_msscore_og_image',
	);
}

/**
 * Reads or writes a plain string post meta value ('' or null removes).
 *
 * @param int         $id    Post id.
 * @param string      $key   Meta key.
 * @param string|null $value New value; null reads.
 * @param bool        $write Whether to write.
 * @return string|null
 */
function msscore_post_meta_value( $id, $key, $value, $write ) {
	if ( ! $write ) {
		$v = get_post_meta( $id, $key, true );
		return is_string( $v ) && '' !== $v ? $v : null;
	}
	if ( null === $value || '' === $value ) {
		delete_post_meta( $id, $key );
	} else {
		update_post_meta( $id, $key, $value );
	}
	return null;
}

/**
 * Lets SEO plugins that cache per post (Yoast indexables) pick up a meta change.
 *
 * @param int $id Post id.
 */
function msscore_touch_post( $id ) {
	wp_update_post( array( 'ID' => $id ) );
	clean_post_cache( $id );
}

/**
 * Get/set for one simple SEO field on any target.
 *
 * @param string $field   title | description | canonical | noindex.
 * @param array  $t       Resolved target.
 * @param mixed  $value   New value.
 * @param bool   $write   Write, or read when false.
 * @return mixed|WP_Error
 */
function msscore_seo_field( $field, $t, $value = null, $write = false ) {
	if ( 'term' === $t['kind'] ) {
		$r = msscore_term_field( $t, $field, $write ? (string) $value : null );
		return $r;
	}
	if ( 'post' !== $t['kind'] ) {
		return new WP_Error( 'bad_request', 'This change needs a post or category.', array( 'status' => 400 ) );
	}
	$id      = $t['id'];
	$backend = msscore_seo_backend();
	if ( 'title' === $field || 'description' === $field ) {
		if ( ! $write ) {
			$cur = msscore_get_seo( $id );
			return $cur[ $field ];
		}
		msscore_set_seo( $id, 'title' === $field ? (string) $value : null, 'description' === $field ? (string) $value : null );
		return null;
	}
	if ( 'aioseo' === $backend ) {
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $id );
		if ( 'canonical' === $field ) {
			if ( ! $write ) {
				return isset( $row->canonical_url ) && '' !== $row->canonical_url ? (string) $row->canonical_url : null;
			}
			$row->canonical_url = (string) $value;
		} else {
			if ( ! $write ) {
				return ! empty( $row->robots_noindex ) ? 'noindex' : 'index';
			}
			$row->robots_default = false;
			$row->robots_noindex = 'noindex' === $value;
		}
		$row->post_id = $id;
		$row->save();
		return null;
	}
	$keys = msscore_post_keys( in_array( $backend, array( 'yoast', 'rank-math', 'seopress' ), true ) ? $backend : 'msscore' );
	if ( 'noindex' === $field ) {
		$r = msscore_noindex_meta( 'post', $id, $keys['noindex'], $backend, $write ? (string) $value : null );
		if ( $write ) {
			msscore_touch_post( $id );
		}
		return $r;
	}
	$r = msscore_post_meta_value( $id, $keys['canonical'], $value, $write );
	if ( $write ) {
		msscore_touch_post( $id );
	}
	return $r;
}

/**
 * Open Graph fields of a post ({title, description, image}).
 *
 * @param array      $t     Resolved target.
 * @param array|null $value New fields; null reads.
 * @return array|null|WP_Error
 */
function msscore_og_fields( $t, $value = null ) {
	if ( 'post' !== $t['kind'] ) {
		return new WP_Error( 'needs_human', 'Open Graph tags for categories are set in the SEO plugin.' );
	}
	$id      = $t['id'];
	$backend = msscore_seo_backend();
	$fields  = array( 'title', 'description', 'image' );
	if ( 'bricks' === $backend ) {
		$map = array(
			'title'       => 'sharingTitle',
			'description' => 'sharingDescription',
			'image'       => 'sharingImage',
		);
		$bs  = msscore_bricks_settings( $id );
		if ( null === $value ) {
			$out = array();
			foreach ( $map as $f => $k ) {
				$v         = isset( $bs[ $k ] ) ? $bs[ $k ] : null;
				$out[ $f ] = 'image' === $f ? ( is_array( $v ) && isset( $v['url'] ) ? (string) $v['url'] : null ) : ( is_string( $v ) && '' !== $v ? $v : null );
			}
			return $out;
		}
		foreach ( $map as $f => $k ) {
			if ( ! array_key_exists( $f, $value ) ) {
				continue;
			}
			if ( null === $value[ $f ] || '' === $value[ $f ] ) {
				unset( $bs[ $k ] );
			} elseif ( 'image' === $f ) {
				$aid      = attachment_url_to_postid( (string) $value[ $f ] );
				$bs[ $k ] = array_filter(
					array(
						'id'  => $aid ? $aid : null,
						'url' => (string) $value[ $f ],
					)
				);
			} else {
				$bs[ $k ] = (string) $value[ $f ];
			}
		}
		update_post_meta( $id, '_bricks_page_settings', $bs );
		clean_post_cache( $id );
		return null;
	}
	if ( 'aioseo' === $backend ) {
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $id );
		if ( null === $value ) {
			return array(
				'title'       => isset( $row->og_title ) && '' !== $row->og_title ? (string) $row->og_title : null,
				'description' => isset( $row->og_description ) && '' !== $row->og_description ? (string) $row->og_description : null,
				'image'       => isset( $row->og_image_custom_url ) && '' !== $row->og_image_custom_url ? (string) $row->og_image_custom_url : null,
			);
		}
		foreach ( array( 'title' => 'og_title', 'description' => 'og_description', 'image' => 'og_image_custom_url' ) as $f => $col ) {
			if ( array_key_exists( $f, $value ) ) {
				$row->$col = (string) $value[ $f ];
			}
		}
		if ( array_key_exists( 'image', $value ) ) {
			$row->og_image_type = '' === (string) $value['image'] ? 'default' : 'custom';
		}
		$row->post_id = $id;
		$row->save();
		return null;
	}
	$keys = msscore_post_keys( in_array( $backend, array( 'yoast', 'rank-math', 'seopress' ), true ) ? $backend : 'msscore' );
	if ( null === $value ) {
		$out = array();
		foreach ( $fields as $f ) {
			$out[ $f ] = msscore_post_meta_value( $id, $keys[ 'og_' . $f ], null, false );
		}
		return $out;
	}
	foreach ( $fields as $f ) {
		if ( array_key_exists( $f, $value ) ) {
			msscore_post_meta_value( $id, $keys[ 'og_' . $f ], null === $value[ $f ] ? null : (string) $value[ $f ], true );
		}
	}
	msscore_touch_post( $id );
	return null;
}

/**
 * The simple change types: each has a reader and a writer, so applying and undoing are the same
 * operation (undo writes the before value back).
 *
 * @return array<string,array{get:callable,set:callable,clean:callable}>
 */
function msscore_field_types() {
	$text  = function ( $v ) {
		return sanitize_text_field( (string) $v );
	};
	$field = function ( $name, $clean ) {
		return array(
			'get'   => function ( $t ) use ( $name ) {
				return msscore_seo_field( $name, $t );
			},
			'set'   => function ( $t, $v ) use ( $name ) {
				return msscore_seo_field( $name, $t, $v, true );
			},
			'clean' => $clean,
		);
	};
	return array(
		'meta_title'       => $field( 'title', $text ),
		'meta_description' => $field( 'description', function ( $v ) {
			return sanitize_textarea_field( (string) $v );
		} ),
		'canonical'        => $field( 'canonical', function ( $v ) {
			return null === $v || '' === $v ? '' : esc_url_raw( (string) $v );
		} ),
		'robots_noindex'   => $field( 'noindex', function ( $v ) {
			return 'noindex' === $v || true === $v ? 'noindex' : 'index';
		} ),
		'og_tags'          => array(
			'get'   => function ( $t ) {
				return msscore_og_fields( $t );
			},
			'set'   => function ( $t, $v ) {
				return msscore_og_fields( $t, $v );
			},
			'clean' => function ( $v ) {
				$v   = is_array( $v ) ? $v : array();
				$out = array();
				foreach ( array( 'title', 'description' ) as $f ) {
					if ( array_key_exists( $f, $v ) ) {
						$out[ $f ] = null === $v[ $f ] ? null : sanitize_text_field( (string) $v[ $f ] );
					}
				}
				if ( array_key_exists( 'image', $v ) ) {
					$out['image'] = null === $v['image'] ? null : esc_url_raw( (string) $v['image'] );
				}
				return $out;
			},
		),
	);
}
