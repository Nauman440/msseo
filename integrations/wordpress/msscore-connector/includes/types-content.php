<?php
/**
 * Change types that touch page content: image_alt, heading_fix, content_block and internal_link.
 * Text outside MS SCORE's own markers is never removed; undo only goes ahead when nobody has edited
 * the content since (otherwise it asks a person).
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Which builder holds a post's content.
 *
 * @param int $id Post id.
 * @return string elementor | bricks | divi | gutenberg | classic
 */
function msscore_builder_of( $id ) {
	return msscore_post_builder( get_post( $id ) );
}

/**
 * Raw stored content of a post, per builder, for before/after snapshots.
 *
 * @param int $id Post id.
 * @return array{post_content:string,elementor:string,bricks:mixed}
 */
function msscore_snapshot( $id ) {
	return array(
		'post_content' => (string) get_post_field( 'post_content', $id, 'raw' ),
		'elementor'    => (string) get_post_meta( $id, '_elementor_data', true ),
		'bricks'       => get_post_meta( $id, '_bricks_page_content_2', true ),
	);
}

/**
 * Fingerprint of a snapshot (to tell whether someone edited the page after our change).
 *
 * @param array $snap Snapshot.
 * @return string
 */
function msscore_snapshot_hash( $snap ) {
	return md5( wp_json_encode( $snap ) );
}

/**
 * Writes post_content without WordPress filtering it again (MS SCORE's HTML is cleaned before).
 *
 * @param int    $id      Post id.
 * @param string $content New content.
 * @return true|WP_Error
 */
function msscore_save_content( $id, $content ) {
	$r = wp_update_post(
		array(
			'ID'           => $id,
			'post_content' => wp_slash( $content ),
		),
		true
	);
	return is_wp_error( $r ) ? $r : true;
}

/**
 * Saves Elementor data and clears Elementor's CSS so the change shows.
 *
 * @param int   $id   Post id.
 * @param array $tree Elementor tree.
 */
function msscore_save_elementor( $id, $tree ) {
	update_post_meta( $id, '_elementor_data', wp_slash( wp_json_encode( $tree ) ) );
	if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
		\Elementor\Plugin::$instance->files_manager->clear_cache();
	}
	clean_post_cache( $id );
}

/**
 * Restores a snapshot.
 *
 * @param int   $id   Post id.
 * @param array $snap Snapshot.
 */
function msscore_restore_snapshot( $id, $snap ) {
	msscore_save_content( $id, (string) $snap['post_content'] );
	if ( '' !== (string) $snap['elementor'] ) {
		update_post_meta( $id, '_elementor_data', wp_slash( (string) $snap['elementor'] ) );
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
			\Elementor\Plugin::$instance->files_manager->clear_cache();
		}
	}
	if ( is_array( $snap['bricks'] ) ) {
		update_post_meta( $id, '_bricks_page_content_2', $snap['bricks'] );
	}
	clean_post_cache( $id );
}

/**
 * Undo for snapshot-based changes: only when the page still is exactly as we left it.
 *
 * @param array $t      Target.
 * @param array $before Before value (with snapshot).
 * @param array $after  After value (with hash).
 * @return true|WP_Error
 */
function msscore_rollback_snapshot( $t, $before, $after ) {
	if ( msscore_snapshot_hash( msscore_snapshot( $t['id'] ) ) !== ( isset( $after['hash'] ) ? $after['hash'] : '' ) ) {
		return new WP_Error( 'needs_human', 'The page was edited after this change, so it was not undone automatically.' );
	}
	msscore_restore_snapshot( $t['id'], $before['snapshot'] );
	return true;
}

/* ---------- image_alt ---------- */

/**
 * Sets an image's alt text, and the alt attribute of that image inside the given posts' content.
 *
 * @param array $t   Target (attachment).
 * @param array $new { alt, post_ids? }.
 * @return array|WP_Error
 */
function msscore_apply_image_alt( $t, $new ) {
	if ( 'attachment' !== $t['kind'] ) {
		return new WP_Error( 'bad_request', 'image_alt needs an attachment_id.', array( 'status' => 400 ) );
	}
	$alt    = sanitize_text_field( isset( $new['alt'] ) ? (string) $new['alt'] : '' );
	$aid    = $t['id'];
	$before = array(
		'alt'      => (string) get_post_meta( $aid, '_wp_attachment_image_alt', true ),
		'contents' => array(),
	);
	update_post_meta( $aid, '_wp_attachment_image_alt', $alt );
	$hashes = array();
	$ids    = isset( $new['post_ids'] ) && is_array( $new['post_ids'] ) ? array_map( 'absint', $new['post_ids'] ) : array();
	foreach ( array_slice( array_filter( $ids ), 0, 20 ) as $pid ) {
		if ( ! current_user_can( 'edit_post', $pid ) ) {
			continue;
		}
		// Bricks image elements can carry their own alt text, which wins over the Media Library's.
		$els = msscore_bricks_elements( $pid );
		if ( $els ) {
			$touched = false;
			foreach ( $els as &$el ) {
				if ( isset( $el['name'], $el['settings']['image']['id'] ) && 'image' === $el['name'] && (int) $el['settings']['image']['id'] === $aid && isset( $el['settings']['altText'] ) && '' !== $el['settings']['altText'] ) {
					$el['settings']['altText'] = $alt;
					$touched                   = true;
				}
			}
			unset( $el );
			if ( $touched ) {
				$before['bricks'][ $pid ] = get_post_meta( $pid, '_bricks_page_content_2', true );
				update_post_meta( $pid, '_bricks_page_content_2', $els );
				clean_post_cache( $pid );
				$hashes[ 'bricks-' . $pid ] = md5( wp_json_encode( get_post_meta( $pid, '_bricks_page_content_2', true ) ) );
			}
		}
		$html = (string) get_post_field( 'post_content', $pid, 'raw' );
		$next = preg_replace_callback(
			'/<img\b[^>]*\bwp-image-' . $aid . '\b[^>]*>/i',
			function ( $m ) use ( $alt ) {
				$tag = preg_replace( '/\salt=(["\'])[^"\']*\1/i', '', $m[0] );
				return preg_replace( '/^<img\b/i', '<img alt="' . esc_attr( $alt ) . '"', $tag );
			},
			$html
		);
		if ( null !== $next && $next !== $html ) {
			$before['contents'][ $pid ] = $html;
			msscore_save_content( $pid, $next );
			$hashes[ $pid ] = md5( (string) get_post_field( 'post_content', $pid, 'raw' ) );
		}
	}
	return array(
		'before' => $before,
		'after'  => array(
			'alt'    => $alt,
			'hashes' => $hashes,
		),
	);
}

/**
 * Undoes image_alt.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @param array $after  After.
 * @return true|WP_Error
 */
function msscore_rollback_image_alt( $t, $before, $after ) {
	update_post_meta( $t['id'], '_wp_attachment_image_alt', (string) $before['alt'] );
	$skipped = 0;
	foreach ( isset( $before['bricks'] ) ? (array) $before['bricks'] : array() as $pid => $els ) {
		$cur = md5( wp_json_encode( get_post_meta( (int) $pid, '_bricks_page_content_2', true ) ) );
		if ( isset( $after['hashes'][ 'bricks-' . $pid ] ) && $cur === $after['hashes'][ 'bricks-' . $pid ] ) {
			update_post_meta( (int) $pid, '_bricks_page_content_2', $els );
			clean_post_cache( (int) $pid );
		} else {
			++$skipped;
		}
	}
	foreach ( (array) $before['contents'] as $pid => $html ) {
		$cur = (string) get_post_field( 'post_content', (int) $pid, 'raw' );
		if ( isset( $after['hashes'][ $pid ] ) && md5( $cur ) === $after['hashes'][ $pid ] ) {
			msscore_save_content( (int) $pid, (string) $html );
		} else {
			++$skipped;
		}
	}
	return $skipped ? new WP_Error( 'needs_human', 'The image alt text was restored, but ' . $skipped . ' page(s) were edited since and keep the new alt text.' ) : true;
}

/* ---------- heading_fix ---------- */

/**
 * Demotes every H1 after the first to H2 in Gutenberg blocks or Classic HTML. Returns the new
 * content and how many were changed.
 *
 * @param string $html    Content.
 * @param bool   $blocks  Gutenberg content.
 * @param int    $keep    How many H1s to keep (1 = keep the first; 0 = theme prints the H1).
 * @return array{0:string,1:int}
 */
function msscore_demote_h1_html( $html, $blocks, $keep ) {
	$seen    = 0;
	$changed = 0;
	$swap    = function ( $s ) use ( &$seen, &$changed, $keep ) {
		return preg_replace_callback(
			'/<h1(\b[^>]*)>(.*?)<\/h1>/is',
			function ( $m ) use ( &$seen, &$changed, $keep ) {
				++$seen;
				if ( $seen <= $keep ) {
					return $m[0];
				}
				++$changed;
				return '<h2' . $m[1] . '>' . $m[2] . '</h2>';
			},
			$s
		);
	};
	if ( ! $blocks ) {
		return array( $swap( $html ), $changed );
	}
	$walk = function ( array $list ) use ( &$walk, $swap ) {
		foreach ( $list as &$b ) {
			// innerContent holds the block's own HTML (null where inner blocks go); innerHTML is the same text joined.
			foreach ( $b['innerContent'] as $i => $piece ) {
				if ( is_string( $piece ) ) {
					$b['innerContent'][ $i ] = $swap( $piece );
				}
			}
			$b['innerHTML'] = implode( '', array_filter( $b['innerContent'], 'is_string' ) );
			if ( 'core/heading' === $b['blockName'] && isset( $b['attrs']['level'] ) && 1 === (int) $b['attrs']['level'] && preg_match( '/<h2\b/i', $b['innerHTML'] ) ) {
				unset( $b['attrs']['level'] );
			}
			if ( ! empty( $b['innerBlocks'] ) ) {
				$b['innerBlocks'] = $walk( $b['innerBlocks'] );
			}
		}
		return $list;
	};
	$out = serialize_blocks( $walk( parse_blocks( $html ) ) );
	return array( $out, $changed );
}

/**
 * Makes heading levels follow on (no jump from H1 to H3) in Gutenberg or Classic content.
 *
 * @param string $html Content.
 * @return array{0:string,1:int}
 */
function msscore_fix_heading_order_html( $html ) {
	$prev    = 1;
	$changed = 0;
	$out     = preg_replace_callback(
		'/<h([1-6])(\b[^>]*)>(.*?)<\/h\1>(\s*<!-- \/wp:heading -->)?/is',
		function ( $m ) use ( &$prev, &$changed ) {
			$level = (int) $m[1];
			$want  = $level > $prev + 1 ? $prev + 1 : $level;
			$prev  = $want;
			if ( $want === $level ) {
				return $m[0];
			}
			++$changed;
			return '<h' . $want . $m[2] . '>' . $m[3] . '</h' . $want . '>' . ( isset( $m[4] ) ? $m[4] : '' );
		},
		$html
	);
	// Keep Gutenberg's level attribute in step with the tags.
	$out = preg_replace_callback(
		'/<!-- wp:heading(\s+(\{.*?\}))?\s*-->(\s*<h([1-6]))/s',
		function ( $m ) {
			$attrs = ! empty( $m[2] ) ? json_decode( $m[2], true ) : array();
			$attrs = is_array( $attrs ) ? $attrs : array();
			$lvl   = (int) $m[4];
			if ( 2 === $lvl ) {
				unset( $attrs['level'] );
			} else {
				$attrs['level'] = $lvl;
			}
			return '<!-- wp:heading' . ( $attrs ? ' ' . wp_json_encode( $attrs ) : '' ) . ' -->' . $m[3];
		},
		$out
	);
	return array( $out, $changed );
}

/**
 * Walks an Elementor tree or Bricks element list and demotes H1s after the first $keep.
 *
 * @param string $builder elementor | bricks.
 * @param array  $data    Tree / list.
 * @param int    $keep    H1s to keep.
 * @return array{0:array,1:int}
 */
function msscore_demote_h1_builder( $builder, $data, $keep ) {
	$seen    = 0;
	$changed = 0;
	if ( 'bricks' === $builder ) {
		foreach ( $data as &$el ) {
			if ( isset( $el['settings']['tag'] ) && 'h1' === strtolower( (string) $el['settings']['tag'] ) ) {
				++$seen;
				if ( $seen > $keep ) {
					$el['settings']['tag'] = 'h2';
					++$changed;
				}
			}
		}
		return array( $data, $changed );
	}
	$walk = function ( $nodes ) use ( &$walk, &$seen, &$changed, $keep ) {
		foreach ( $nodes as &$n ) {
			if ( isset( $n['widgetType'], $n['settings']['header_size'] ) && 'heading' === $n['widgetType'] && 'h1' === $n['settings']['header_size'] ) {
				++$seen;
				if ( $seen > $keep ) {
					$n['settings']['header_size'] = 'h2';
					++$changed;
				}
			}
			if ( ! empty( $n['elements'] ) ) {
				$n['elements'] = $walk( $n['elements'] );
			}
		}
		return $nodes;
	};
	return array( $walk( $data ), $changed );
}

/**
 * heading_fix: { action: add_h1 | demote_extra_h1 | fix_order, text?, keep? }.
 * `keep` = H1s in the content to keep (default 1; 0 when the theme already prints the H1).
 *
 * @param array $t   Target (post).
 * @param array $new Instructions.
 * @return array|WP_Error
 */
function msscore_apply_heading_fix( $t, $new ) {
	if ( 'post' !== $t['kind'] ) {
		return new WP_Error( 'bad_request', 'heading_fix needs a post_id.', array( 'status' => 400 ) );
	}
	$id      = $t['id'];
	$action  = isset( $new['action'] ) ? (string) $new['action'] : '';
	$builder = msscore_builder_of( $id );
	$snap    = msscore_snapshot( $id );
	$keep    = isset( $new['keep'] ) ? max( 0, (int) $new['keep'] ) : 1;
	$changed = 0;
	if ( 'demote_extra_h1' === $action ) {
		if ( in_array( $builder, array( 'elementor', 'bricks' ), true ) ) {
			$data = 'bricks' === $builder ? $snap['bricks'] : json_decode( $snap['elementor'], true );
			if ( ! is_array( $data ) ) {
				return new WP_Error( 'needs_human', 'The page builder data could not be read.' );
			}
			list( $data, $changed ) = msscore_demote_h1_builder( $builder, $data, $keep );
			if ( $changed ) {
				if ( 'bricks' === $builder ) {
					update_post_meta( $id, '_bricks_page_content_2', $data );
					clean_post_cache( $id );
				} else {
					msscore_save_elementor( $id, $data );
				}
			}
		} elseif ( 'divi' === $builder ) {
			return new WP_Error( 'needs_human', 'This page is built with Divi; change the heading level in the Divi builder.' );
		} else {
			list( $html, $changed ) = msscore_demote_h1_html( $snap['post_content'], 'gutenberg' === $builder, $keep );
			if ( $changed ) {
				msscore_save_content( $id, $html );
			}
		}
		if ( ! $changed ) {
			return new WP_Error( 'needs_human', 'No extra H1 is in the page content; it comes from the theme or a template.' );
		}
	} elseif ( 'add_h1' === $action ) {
		$text = sanitize_text_field( isset( $new['text'] ) ? (string) $new['text'] : '' );
		if ( '' === $text ) {
			return new WP_Error( 'bad_request', 'add_h1 needs the heading text.', array( 'status' => 400 ) );
		}
		if ( ! in_array( $builder, array( 'gutenberg', 'classic' ), true ) ) {
			return new WP_Error( 'needs_human', 'This page is built with ' . $builder . '; add the H1 in the page builder.' );
		}
		$h1 = 'gutenberg' === $builder
			? '<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">' . esc_html( $text ) . '</h1><!-- /wp:heading -->' . "\n\n"
			: '<h1>' . esc_html( $text ) . "</h1>\n";
		msscore_save_content( $id, $h1 . $snap['post_content'] );
		$changed = 1;
	} elseif ( 'set_h1_text' === $action ) {
		$text = sanitize_text_field( isset( $new['text'] ) ? (string) $new['text'] : '' );
		if ( '' === $text ) {
			return new WP_Error( 'bad_request', 'set_h1_text needs the heading text.', array( 'status' => 400 ) );
		}
		$changed = msscore_set_h1_text( $id, $builder, $snap, $text );
		if ( is_wp_error( $changed ) ) {
			return $changed;
		}
	} elseif ( 'fix_order' === $action ) {
		if ( ! in_array( $builder, array( 'gutenberg', 'classic' ), true ) ) {
			return new WP_Error( 'needs_human', 'This page is built with ' . $builder . '; fix the heading order in the page builder.' );
		}
		list( $html, $changed ) = msscore_fix_heading_order_html( $snap['post_content'] );
		if ( ! $changed ) {
			return new WP_Error( 'needs_human', 'The headings in the content are already in order; the jump comes from the theme or a template.' );
		}
		msscore_save_content( $id, $html );
	} else {
		return new WP_Error( 'bad_request', 'Unknown heading_fix action.', array( 'status' => 400 ) );
	}
	return array(
		'before' => array( 'snapshot' => $snap ),
		'after'  => array(
			'action'  => $action,
			'changed' => $changed,
			'hash'    => msscore_snapshot_hash( msscore_snapshot( $id ) ),
		),
	);
}

/**
 * Replaces the words of the page's first H1 in the content (the heading level and styling stay).
 *
 * @param int    $id      Post ID.
 * @param string $builder Builder.
 * @param array  $snap    Snapshot.
 * @param string $text    New heading text.
 * @return int|WP_Error 1 when changed.
 */
function msscore_set_h1_text( $id, $builder, $snap, $text ) {
	if ( 'bricks' === $builder ) {
		$els = is_array( $snap['bricks'] ) ? $snap['bricks'] : array();
		foreach ( $els as &$el ) {
			if ( isset( $el['settings']['tag'] ) && 'h1' === strtolower( (string) $el['settings']['tag'] ) && isset( $el['settings']['text'] ) ) {
				$el['settings']['text'] = esc_html( $text );
				update_post_meta( $id, '_bricks_page_content_2', $els );
				clean_post_cache( $id );
				return 1;
			}
		}
		return new WP_Error( 'needs_human', 'The H1 is not a Bricks element with editable text; change it in Bricks.' );
	}
	if ( 'elementor' === $builder ) {
		$tree = json_decode( $snap['elementor'], true );
		$done = false;
		$walk = function ( $nodes ) use ( &$walk, &$done, $text ) {
			foreach ( $nodes as &$n ) {
				if ( ! $done && isset( $n['widgetType'], $n['settings']['header_size'] ) && 'heading' === $n['widgetType'] && 'h1' === $n['settings']['header_size'] ) {
					$n['settings']['title'] = esc_html( $text );
					$done                   = true;
				}
				if ( ! $done && ! empty( $n['elements'] ) ) {
					$n['elements'] = $walk( $n['elements'] );
				}
			}
			return $nodes;
		};
		$tree = is_array( $tree ) ? $walk( $tree ) : $tree;
		if ( ! $done ) {
			return new WP_Error( 'needs_human', 'The H1 is not an Elementor heading widget; change it in Elementor.' );
		}
		msscore_save_elementor( $id, $tree );
		return 1;
	}
	if ( 'divi' === $builder ) {
		return new WP_Error( 'needs_human', 'This page is built with Divi; change the H1 in the Divi builder.' );
	}
	$html = (string) $snap['post_content'];
	$next = preg_replace_callback(
		'/(<h1\b[^>]*>)(.*?)(<\/h1>)/is',
		function ( $m ) use ( $text ) {
			return $m[1] . esc_html( $text ) . $m[3];
		},
		$html,
		1,
		$count
	);
	if ( ! $count ) {
		return new WP_Error( 'needs_human', 'The H1 is not in the page content; it comes from the theme (usually the page title). Change the page title instead.' );
	}
	msscore_save_content( $id, $next );
	return 1;
}

/* ---------- content_block ---------- */

/**
 * The marked region of a block in content (with its Gutenberg wrapper, when present).
 *
 * @param string $block_id Block id.
 * @return string
 */
function msscore_block_pattern( $block_id ) {
	$q = preg_quote( $block_id, '/' );
	return '/(?:<!-- wp:html -->\s*)?<!-- msscore:block id=' . $q . ' -->.*?<!-- \/msscore:block id=' . $q . ' -->(?:\s*<!-- \/wp:html -->)?\n*/s';
}

/**
 * HTML for an FAQ block.
 *
 * @param array $faq [{ q, a }].
 * @return string
 */
function msscore_faq_html( $faq ) {
	$out = '<div class="msscore-faq"><h2>Frequently asked questions</h2>';
	foreach ( $faq as $f ) {
		$out .= '<h3>' . esc_html( $f['q'] ) . '</h3><p>' . esc_html( $f['a'] ) . '</p>';
	}
	return $out . '</div>';
}

/**
 * content_block: { block_id, kind: answer|faq|table|section, html?, faq?, position }.
 * Inserts the block at `position` (start, after_h1, after_first_paragraph, end) or replaces the
 * block with the same id. Only Gutenberg and Classic content; builder pages need a person.
 *
 * @param array $t   Target (post).
 * @param array $new Block.
 * @return array|WP_Error
 */
function msscore_apply_content_block( $t, $new ) {
	if ( 'post' !== $t['kind'] ) {
		return new WP_Error( 'bad_request', 'content_block needs a post_id.', array( 'status' => 400 ) );
	}
	$id       = $t['id'];
	$builder  = msscore_builder_of( $id );
	$block_id = isset( $new['block_id'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $new['block_id'] ) : '';
	if ( '' === $block_id ) {
		return new WP_Error( 'bad_request', 'content_block needs a block_id.', array( 'status' => 400 ) );
	}
	if ( ! in_array( $builder, array( 'gutenberg', 'classic' ), true ) ) {
		return new WP_Error( 'needs_human', 'This page is built with ' . $builder . '; add this section in the page builder.' );
	}
	$kind = isset( $new['kind'] ) ? sanitize_key( (string) $new['kind'] ) : 'section';
	$faq  = array();
	if ( 'faq' === $kind ) {
		foreach ( isset( $new['faq'] ) && is_array( $new['faq'] ) ? $new['faq'] : array() as $f ) {
			if ( ! empty( $f['q'] ) && ! empty( $f['a'] ) ) {
				$faq[] = array(
					'q' => sanitize_text_field( (string) $f['q'] ),
					'a' => sanitize_textarea_field( (string) $f['a'] ),
				);
			}
		}
		if ( ! $faq ) {
			return new WP_Error( 'bad_request', 'An FAQ block needs questions and answers.', array( 'status' => 400 ) );
		}
	}
	$html = 'faq' === $kind && empty( $new['html'] ) ? msscore_faq_html( $faq ) : wp_kses_post( isset( $new['html'] ) ? (string) $new['html'] : '' );
	if ( '' === trim( $html ) ) {
		return new WP_Error( 'bad_request', 'The block is empty.', array( 'status' => 400 ) );
	}
	$inner   = '<!-- msscore:block id=' . $block_id . ' -->' . $html . '<!-- /msscore:block id=' . $block_id . ' -->';
	$block   = ( 'gutenberg' === $builder ? "<!-- wp:html -->\n" . $inner . "\n<!-- /wp:html -->" : $inner ) . "\n\n";
	$snap    = msscore_snapshot( $id );
	$content = $snap['post_content'];
	$pattern = msscore_block_pattern( $block_id );
	if ( preg_match( $pattern, $content ) ) {
		$content = preg_replace( $pattern, str_replace( array( '\\', '$' ), array( '\\\\', '\\$' ), $block ), $content, 1 );
	} else {
		$pos   = isset( $new['position'] ) ? (string) $new['position'] : 'end';
		$at    = strlen( $content );
		$after = function ( $re ) use ( $content ) {
			return preg_match( $re, $content, $m, PREG_OFFSET_CAPTURE ) ? $m[0][1] + strlen( $m[0][0] ) : null;
		};
		if ( 'start' === $pos ) {
			$at = 0;
		} elseif ( 'after_h1' === $pos ) {
			$hit = $after( '/<\/h1>(\s*<!-- \/wp:heading -->)?/i' );
			$at  = null === $hit ? 0 : $hit;
		} elseif ( 'after_first_paragraph' === $pos ) {
			$hit = $after( '/<\/p>(\s*<!-- \/wp:paragraph -->)?/i' );
			$at  = null === $hit ? 0 : $hit;
		}
		$content = substr( $content, 0, $at ) . "\n\n" . $block . substr( $content, $at );
	}
	msscore_save_content( $id, $content );
	$all              = get_post_meta( $id, '_msscore_faq', true );
	$all              = is_array( $all ) ? $all : array();
	$faq_before       = isset( $all[ $block_id ] ) ? $all[ $block_id ] : null;
	if ( $faq ) {
		$all[ $block_id ] = $faq;
		update_post_meta( $id, '_msscore_faq', $all );
	}
	return array(
		'before' => array(
			'snapshot' => $snap,
			'faq'      => $faq_before,
		),
		'after'  => array(
			'block_id' => $block_id,
			'kind'     => $kind,
			'hash'     => msscore_snapshot_hash( msscore_snapshot( $id ) ),
		),
	);
}

/**
 * Undoes content_block: removes (or restores) only the marked block, even if the rest of the page
 * was edited since.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @param array $after  After.
 * @return true|WP_Error
 */
function msscore_rollback_content_block( $t, $before, $after ) {
	$id       = $t['id'];
	$block_id = (string) $after['block_id'];
	$pattern  = msscore_block_pattern( $block_id );
	$content  = (string) get_post_field( 'post_content', $id, 'raw' );
	$old      = preg_match( $pattern, (string) $before['snapshot']['post_content'], $m ) ? $m[0] : '';
	if ( ! preg_match( $pattern, $content ) ) {
		return new WP_Error( 'needs_human', 'The block was already removed from the page.' );
	}
	msscore_save_content( $id, preg_replace( $pattern, str_replace( array( '\\', '$' ), array( '\\\\', '\\$' ), $old ), $content, 1 ) );
	$all = get_post_meta( $id, '_msscore_faq', true );
	$all = is_array( $all ) ? $all : array();
	if ( null === $before['faq'] ) {
		unset( $all[ $block_id ] );
	} else {
		$all[ $block_id ] = $before['faq'];
	}
	update_post_meta( $id, '_msscore_faq', $all );
	return true;
}

/* ---------- internal_link ---------- */

/**
 * Wraps the first plain-text occurrence of $phrase (not inside a link, heading, script or style)
 * in a marked link. Returns the new HTML or null when the phrase is not found.
 *
 * @param string $html    HTML.
 * @param string $phrase  Exact phrase.
 * @param string $href    Link target.
 * @param string $link_id Marker id.
 * @return string|null
 */
function msscore_link_phrase( $html, $phrase, $href, $link_id ) {
	$parts = preg_split( '/(<[^>]+>)/', $html, -1, PREG_SPLIT_DELIM_CAPTURE );
	$skip  = 0;
	$re    = '/(?<![\p{L}\p{N}])' . preg_quote( $phrase, '/' ) . '(?![\p{L}\p{N}])/u';
	foreach ( $parts as $i => $p ) {
		if ( '' === $p ) {
			continue;
		}
		if ( '<' === $p[0] ) {
			if ( preg_match( '/^<(a|h[1-6]|script|style|button)\b/i', $p ) ) {
				++$skip;
			} elseif ( preg_match( '/^<\/(a|h[1-6]|script|style|button)>/i', $p ) ) {
				$skip = max( 0, $skip - 1 );
			}
			continue;
		}
		if ( $skip || ! preg_match( $re, $p, $m, PREG_OFFSET_CAPTURE ) ) {
			continue;
		}
		$link        = '<a href="' . esc_url( $href ) . '" data-msscore-link="' . esc_attr( $link_id ) . '">' . $m[0][0] . '</a>';
		$parts[ $i ] = substr( $p, 0, $m[0][1] ) . $link . substr( $p, $m[0][1] + strlen( $m[0][0] ) );
		return implode( '', $parts );
	}
	return null;
}

/**
 * Removes MS SCORE's link with this id, keeping its text.
 *
 * @param string $html    HTML.
 * @param string $link_id Marker id.
 * @return string
 */
function msscore_unlink( $html, $link_id ) {
	return (string) preg_replace( '/<a\b[^>]*data-msscore-link="' . preg_quote( $link_id, '/' ) . '"[^>]*>(.*?)<\/a>/is', '$1', $html );
}

/**
 * internal_link: { phrase, href, link_id }. Skipped (not an error) when the phrase is not found.
 *
 * @param array $t   Target (post).
 * @param array $new Link.
 * @return array|WP_Error
 */
function msscore_apply_internal_link( $t, $new ) {
	if ( 'post' !== $t['kind'] ) {
		return new WP_Error( 'bad_request', 'internal_link needs a post_id.', array( 'status' => 400 ) );
	}
	$id      = $t['id'];
	$phrase  = isset( $new['phrase'] ) ? trim( wp_strip_all_tags( (string) $new['phrase'] ) ) : '';
	$href    = isset( $new['href'] ) ? esc_url_raw( (string) $new['href'] ) : '';
	$link_id = isset( $new['link_id'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $new['link_id'] ) : '';
	if ( '' === $phrase || '' === $href || '' === $link_id ) {
		return new WP_Error( 'bad_request', 'internal_link needs phrase, href and link_id.', array( 'status' => 400 ) );
	}
	$builder = msscore_builder_of( $id );
	$snap    = msscore_snapshot( $id );
	$done    = false;
	if ( 'elementor' === $builder ) {
		$tree = json_decode( $snap['elementor'], true );
		$walk = function ( $nodes ) use ( &$walk, &$done, $phrase, $href, $link_id ) {
			foreach ( $nodes as &$n ) {
				if ( ! $done && isset( $n['widgetType'], $n['settings']['editor'] ) && 'text-editor' === $n['widgetType'] ) {
					$next = msscore_link_phrase( (string) $n['settings']['editor'], $phrase, $href, $link_id );
					if ( null !== $next ) {
						$n['settings']['editor'] = $next;
						$done                    = true;
					}
				}
				if ( ! $done && ! empty( $n['elements'] ) ) {
					$n['elements'] = $walk( $n['elements'] );
				}
			}
			return $nodes;
		};
		$tree = is_array( $tree ) ? $walk( $tree ) : $tree;
		if ( $done ) {
			msscore_save_elementor( $id, $tree );
		}
	} elseif ( 'bricks' === $builder ) {
		$els = is_array( $snap['bricks'] ) ? $snap['bricks'] : array();
		foreach ( $els as &$el ) {
			$name = isset( $el['name'] ) ? $el['name'] : '';
			if ( ! $done && in_array( $name, array( 'text', 'text-basic', 'rich-text' ), true ) && isset( $el['settings']['text'] ) ) {
				$next = msscore_link_phrase( (string) $el['settings']['text'], $phrase, $href, $link_id );
				if ( null !== $next ) {
					$el['settings']['text'] = $next;
					$done                   = true;
				}
			}
		}
		if ( $done ) {
			update_post_meta( $id, '_bricks_page_content_2', $els );
			clean_post_cache( $id );
		}
	} elseif ( 'divi' !== $builder ) {
		$next = msscore_link_phrase( $snap['post_content'], $phrase, $href, $link_id );
		if ( null !== $next ) {
			msscore_save_content( $id, $next );
			$done = true;
		}
	}
	if ( ! $done ) {
		return new WP_Error( 'skipped', 'The phrase “' . $phrase . '” was not found as plain text on this page.' );
	}
	return array(
		'before' => array( 'builder' => $builder ),
		'after'  => array(
			'link_id' => $link_id,
			'href'    => $href,
			'phrase'  => $phrase,
		),
	);
}

/**
 * Undoes internal_link by removing only our marked link.
 *
 * @param array $t      Target.
 * @param array $before Before.
 * @param array $after  After.
 * @return true
 */
function msscore_rollback_internal_link( $t, $before, $after ) {
	$id      = $t['id'];
	$link_id = (string) $after['link_id'];
	$snap    = msscore_snapshot( $id );
	if ( 'elementor' === $before['builder'] ) {
		$tree = json_decode( $snap['elementor'], true );
		$walk = function ( $nodes ) use ( &$walk, $link_id ) {
			foreach ( $nodes as &$n ) {
				if ( isset( $n['settings']['editor'] ) ) {
					$n['settings']['editor'] = msscore_unlink( (string) $n['settings']['editor'], $link_id );
				}
				if ( ! empty( $n['elements'] ) ) {
					$n['elements'] = $walk( $n['elements'] );
				}
			}
			return $nodes;
		};
		if ( is_array( $tree ) ) {
			msscore_save_elementor( $id, $walk( $tree ) );
		}
	} elseif ( 'bricks' === $before['builder'] ) {
		$els = is_array( $snap['bricks'] ) ? $snap['bricks'] : array();
		foreach ( $els as &$el ) {
			if ( isset( $el['settings']['text'] ) && is_string( $el['settings']['text'] ) ) {
				$el['settings']['text'] = msscore_unlink( $el['settings']['text'], $link_id );
			}
		}
		update_post_meta( $id, '_bricks_page_content_2', $els );
		clean_post_cache( $id );
	} else {
		msscore_save_content( $id, msscore_unlink( $snap['post_content'], $link_id ) );
	}
	return true;
}
