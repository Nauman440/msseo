<?php
/**
 * content_block on page-builder pages (Bricks and Elementor). The block becomes the builder's own
 * elements: a section with a container and one rich-text element holding the block's HTML. It is
 * labelled as MS SCORE's (Bricks: element label; Elementor: CSS class), so undo removes exactly
 * those elements even when the rest of the page was edited since. The section copies the design
 * classes of the section it is placed next to, so it looks like the rest of the page.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Label (Bricks) / CSS class (Elementor) that marks a block.
 *
 * @param string $block_id Block id.
 * @return string
 */
function msscore_builder_mark( $block_id ) {
	return 'msscore-block-' . $block_id;
}

/* ---------- Bricks ---------- */

/**
 * A new Bricks element id (6 lowercase letters/digits) not used on the page.
 *
 * @param array $els  Elements.
 * @param array $used Ids taken so far.
 * @return string
 */
function msscore_bricks_new_id( $els, &$used ) {
	foreach ( $els as $e ) {
		if ( isset( $e['id'] ) ) {
			$used[ (string) $e['id'] ] = true;
		}
	}
	do {
		$id = strtolower( wp_generate_password( 6, false, false ) );
	} while ( isset( $used[ $id ] ) || ! preg_match( '/^[a-z]/', $id ) );
	$used[ $id ] = true;
	return $id;
}

/**
 * Ids of a block's elements (its section and everything inside).
 *
 * @param array  $els      Elements.
 * @param string $block_id Block id.
 * @return array<string,bool>
 */
function msscore_bricks_block_ids( $els, $block_id ) {
	$mark = msscore_builder_mark( $block_id );
	$ids  = array();
	foreach ( $els as $e ) {
		if ( isset( $e['label'] ) && $mark === $e['label'] ) {
			$ids[ (string) $e['id'] ] = true;
		}
	}
	// Children of marked elements belong to the block too.
	for ( $changed = true; $changed; ) {
		$changed = false;
		foreach ( $els as $e ) {
			$p = isset( $e['parent'] ) ? (string) $e['parent'] : '';
			if ( '' !== $p && isset( $ids[ $p ] ) && ! isset( $ids[ (string) $e['id'] ] ) ) {
				$ids[ (string) $e['id'] ] = true;
				$changed                  = true;
			}
		}
	}
	return $ids;
}

/**
 * Whether a Bricks element is top level.
 *
 * @param array $e Element.
 * @return bool
 */
function msscore_bricks_top( $e ) {
	return empty( $e['parent'] ) || '0' === (string) $e['parent'];
}

/**
 * The top-level element that holds an element.
 *
 * @param array  $by_id Elements by id.
 * @param string $id    Element id.
 * @return string
 */
function msscore_bricks_root_of( $by_id, $id ) {
	for ( $i = 0; $i < 50 && isset( $by_id[ $id ] ) && ! msscore_bricks_top( $by_id[ $id ] ); $i++ ) {
		$id = (string) $by_id[ $id ]['parent'];
	}
	return $id;
}

/**
 * Inserts (or replaces) a block on a Bricks page.
 *
 * @param array  $els      Elements.
 * @param string $block_id Block id.
 * @param string $html     Block HTML (already cleaned).
 * @param string $position start | after_h1 | after_first_paragraph | end.
 * @return array New elements.
 */
function msscore_bricks_insert( $els, $block_id, $html, $position ) {
	$els   = is_array( $els ) ? array_values( $els ) : array();
	$old   = msscore_bricks_block_ids( $els, $block_id );
	$by_id = array();
	foreach ( $els as $e ) {
		$by_id[ (string) $e['id'] ] = $e;
	}
	$tops = array_values( array_filter( $els, 'msscore_bricks_top' ) );
	// Where it goes: the top-level section it follows (null = before every section).
	$after = null;
	if ( $old ) {
		foreach ( $tops as $i => $e ) {
			if ( isset( $old[ (string) $e['id'] ] ) ) {
				$after = $i > 0 ? (string) $tops[ $i - 1 ]['id'] : null;
				break;
			}
		}
	} elseif ( 'end' === $position && $tops ) {
		$after = (string) end( $tops )['id'];
	} elseif ( 'after_h1' === $position || 'after_first_paragraph' === $position ) {
		foreach ( msscore_bricks_page_order( $els ) as $i ) {
			$e = $els[ $i ];
			if ( isset( $e['settings']['tag'] ) && 'h1' === strtolower( (string) $e['settings']['tag'] ) ) {
				$after = msscore_bricks_root_of( $by_id, (string) $e['id'] );
				break;
			}
		}
		if ( null === $after && $tops ) {
			$after = (string) $tops[0]['id'];
		}
	}
	// Design: the classes of the section next to it (the one after, else the one before).
	$style = null;
	$ids   = array_map(
		function ( $e ) {
			return (string) $e['id'];
		},
		$tops
	);
	$at    = null === $after ? -1 : array_search( $after, $ids, true );
	foreach ( array( $at + 1, $at ) as $k ) {
		if ( isset( $tops[ $k ] ) && ! isset( $old[ (string) $tops[ $k ]['id'] ] ) && isset( $tops[ $k ]['name'] ) && 'section' === $tops[ $k ]['name'] ) {
			$style = $tops[ $k ];
			break;
		}
	}
	$inner_style = null;
	if ( $style && ! empty( $style['children'] ) && isset( $by_id[ (string) $style['children'][0] ] ) ) {
		$inner_style = $by_id[ (string) $style['children'][0] ];
	}
	$classes = function ( $from ) {
		$out = array();
		foreach ( array( '_cssGlobalClasses', '_cssClasses' ) as $k ) {
			if ( $from && isset( $from['settings'][ $k ] ) ) {
				$out[ $k ] = $from['settings'][ $k ];
			}
		}
		return $out;
	};
	$els  = array_values(
		array_filter(
			$els,
			function ( $e ) use ( $old ) {
				return ! isset( $old[ (string) $e['id'] ] );
			}
		)
	);
	$used = array();
	$sid  = msscore_bricks_new_id( $els, $used );
	$cid  = msscore_bricks_new_id( $els, $used );
	$tid  = msscore_bricks_new_id( $els, $used );
	$mark = msscore_builder_mark( $block_id );
	$new  = array(
		array( 'id' => $sid, 'name' => 'section', 'parent' => 0, 'children' => array( $cid ), 'settings' => $classes( $style ), 'label' => $mark ),
		array( 'id' => $cid, 'name' => 'container', 'parent' => $sid, 'children' => array( $tid ), 'settings' => $classes( $inner_style ), 'label' => $mark ),
		array( 'id' => $tid, 'name' => 'text', 'parent' => $cid, 'children' => array(), 'settings' => array( 'text' => $html ), 'label' => $mark ),
	);
	// Top-level order is the order of the top-level elements in the list: put the block just before
	// the next top-level element after the anchor (or at the end).
	$insert_at = count( $els );
	$seen      = null === $after;
	foreach ( $els as $i => $e ) {
		if ( ! msscore_bricks_top( $e ) ) {
			continue;
		}
		if ( $seen ) {
			$insert_at = $i;
			break;
		}
		if ( (string) $e['id'] === $after ) {
			$seen = true;
		}
	}
	array_splice( $els, $insert_at, 0, $new );
	return $els;
}

/**
 * Removes a block from a Bricks page.
 *
 * @param array  $els      Elements.
 * @param string $block_id Block id.
 * @return array|null New elements, or null when the block is not there.
 */
function msscore_bricks_remove( $els, $block_id ) {
	$ids = msscore_bricks_block_ids( is_array( $els ) ? $els : array(), $block_id );
	if ( ! $ids ) {
		return null;
	}
	return array_values(
		array_filter(
			$els,
			function ( $e ) use ( $ids ) {
				return ! isset( $ids[ (string) $e['id'] ] );
			}
		)
	);
}

/* ---------- Elementor ---------- */

/**
 * Whether an Elementor element carries the block's class.
 *
 * @param array  $n        Node.
 * @param string $block_id Block id.
 * @return bool
 */
function msscore_elementor_is_block( $n, $block_id ) {
	$c = isset( $n['settings']['_css_classes'] ) ? (string) $n['settings']['_css_classes'] : ( isset( $n['settings']['css_classes'] ) ? (string) $n['settings']['css_classes'] : '' );
	return in_array( msscore_builder_mark( $block_id ), preg_split( '/\s+/', $c ), true );
}

/**
 * Whether an Elementor subtree holds an H1 heading.
 *
 * @param array $n Node.
 * @return bool
 */
function msscore_elementor_has_h1( $n ) {
	if ( isset( $n['widgetType'], $n['settings']['header_size'] ) && 'heading' === $n['widgetType'] && 'h1' === $n['settings']['header_size'] ) {
		return true;
	}
	foreach ( isset( $n['elements'] ) && is_array( $n['elements'] ) ? $n['elements'] : array() as $c ) {
		if ( msscore_elementor_has_h1( $c ) ) {
			return true;
		}
	}
	return false;
}

/**
 * A new Elementor element id (7 hex digits).
 *
 * @return string
 */
function msscore_elementor_new_id() {
	return substr( md5( wp_generate_password( 12, false, false ) ), 0, 7 );
}

/**
 * Inserts (or replaces) a block on an Elementor page: a container (or a section with one column on
 * sites still using sections) holding a Text Editor widget.
 *
 * @param array  $tree     Elementor data.
 * @param string $block_id Block id.
 * @param string $html     Block HTML (already cleaned).
 * @param string $position start | after_h1 | after_first_paragraph | end.
 * @return array New tree.
 */
function msscore_elementor_insert( $tree, $block_id, $html, $position ) {
	$tree = is_array( $tree ) ? array_values( $tree ) : array();
	$at   = null;
	foreach ( $tree as $i => $n ) {
		if ( msscore_elementor_is_block( $n, $block_id ) ) {
			$at = $i;
			break;
		}
	}
	if ( null !== $at ) {
		array_splice( $tree, $at, 1 );
	} elseif ( 'start' === $position ) {
		$at = 0;
	} elseif ( 'end' === $position ) {
		$at = count( $tree );
	} else {
		$at = $tree ? 1 : 0;
		foreach ( $tree as $i => $n ) {
			if ( msscore_elementor_has_h1( $n ) ) {
				$at = $i + 1;
				break;
			}
		}
	}
	$sections = $tree && isset( $tree[0]['elType'] ) && 'section' === $tree[0]['elType'];
	$widget   = array(
		'id'         => msscore_elementor_new_id(),
		'elType'     => 'widget',
		'widgetType' => 'text-editor',
		'settings'   => array( 'editor' => $html ),
		'elements'   => array(),
	);
	$settings = array( '_css_classes' => 'msscore-block ' . msscore_builder_mark( $block_id ) );
	$node     = $sections
		? array(
			'id'       => msscore_elementor_new_id(),
			'elType'   => 'section',
			'settings' => $settings,
			'elements' => array(
				array(
					'id'       => msscore_elementor_new_id(),
					'elType'   => 'column',
					'settings' => array( '_column_size' => 100 ),
					'elements' => array( $widget ),
					'isInner'  => false,
				),
			),
			'isInner'  => false,
		)
		: array(
			'id'       => msscore_elementor_new_id(),
			'elType'   => 'container',
			'settings' => $settings,
			'elements' => array( $widget ),
			'isInner'  => false,
		);
	array_splice( $tree, min( $at, count( $tree ) ), 0, array( $node ) );
	return $tree;
}

/**
 * Removes a block from an Elementor page.
 *
 * @param array  $tree     Elementor data.
 * @param string $block_id Block id.
 * @return array|null New tree, or null when the block is not there.
 */
function msscore_elementor_remove( $tree, $block_id ) {
	$tree = is_array( $tree ) ? $tree : array();
	$out  = array_values(
		array_filter(
			$tree,
			function ( $n ) use ( $block_id ) {
				return ! msscore_elementor_is_block( $n, $block_id );
			}
		)
	);
	return count( $out ) === count( $tree ) ? null : $out;
}

/**
 * Elementor data of a post as an array.
 *
 * @param int $id Post id.
 * @return array
 */
function msscore_elementor_tree( $id ) {
	$raw  = (string) get_post_meta( $id, '_elementor_data', true );
	$tree = '' === $raw ? array() : json_decode( $raw, true );
	return is_array( $tree ) ? $tree : array();
}

/**
 * Applies a block on a builder page. Returns the before/after record, like the Gutenberg path.
 *
 * @param int    $id       Post id.
 * @param string $builder  bricks | elementor.
 * @param string $block_id Block id.
 * @param string $html     Block HTML.
 * @param string $position Position.
 * @return array
 */
function msscore_builder_apply_block( $id, $builder, $block_id, $html, $position ) {
	$snap = msscore_snapshot( $id );
	if ( 'bricks' === $builder ) {
		update_post_meta( $id, '_bricks_page_content_2', msscore_bricks_insert( $snap['bricks'], $block_id, $html, $position ) );
		clean_post_cache( $id );
	} else {
		msscore_save_elementor( $id, msscore_elementor_insert( msscore_elementor_tree( $id ), $block_id, $html, $position ) );
	}
	return array(
		'snapshot' => $snap,
		'replaced' => 'bricks' === $builder
			? (bool) msscore_bricks_block_ids( is_array( $snap['bricks'] ) ? $snap['bricks'] : array(), $block_id )
			: null !== msscore_elementor_remove( '' === $snap['elementor'] ? array() : (array) json_decode( $snap['elementor'], true ), $block_id ),
	);
}

/**
 * Undoes a block on a builder page: removes only its elements. A block that replaced an older one
 * is put back as it was, but only when nobody edited the page since.
 *
 * @param int    $id       Post id.
 * @param string $builder  bricks | elementor.
 * @param string $block_id Block id.
 * @param array  $before   Before record.
 * @param array  $after    After record.
 * @return true|WP_Error
 */
function msscore_builder_rollback_block( $id, $builder, $block_id, $before, $after ) {
	if ( ! empty( $before['replaced'] ) ) {
		return msscore_rollback_snapshot( array( 'id' => $id ), $before, $after );
	}
	if ( 'bricks' === $builder ) {
		$els = msscore_bricks_remove( get_post_meta( $id, '_bricks_page_content_2', true ), $block_id );
		if ( null === $els ) {
			return new WP_Error( 'needs_human', 'The section was already removed from the page.' );
		}
		update_post_meta( $id, '_bricks_page_content_2', $els );
		clean_post_cache( $id );
		return true;
	}
	$tree = msscore_elementor_remove( msscore_elementor_tree( $id ), $block_id );
	if ( null === $tree ) {
		return new WP_Error( 'needs_human', 'The section was already removed from the page.' );
	}
	msscore_save_elementor( $id, $tree );
	return true;
}
