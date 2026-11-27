<?php
/**
 * create_page: a new page the plan asks for, saved as a draft (a person publishes it with one click
 * after reading it; body text is never published by MS SCORE on its own). The page is made of real
 * blocks (headings, paragraphs, lists), so it is edited like any other page. Undo moves it to the
 * bin, but only while nobody has edited it.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Turns simple HTML (h2–h4, p, ul, ol, table) into Gutenberg blocks; anything else goes in an HTML block.
 *
 * @param string $html Cleaned HTML.
 * @return string Block markup.
 */
function msscore_html_to_blocks( $html ) {
	$out = '';
	if ( ! preg_match_all( '/<(h[2-4]|p|ul|ol|table)\b[^>]*>.*?<\/\1>/is', $html, $m, PREG_OFFSET_CAPTURE ) ) {
		return "<!-- wp:html -->\n" . $html . "\n<!-- /wp:html -->";
	}
	$pos = 0;
	foreach ( $m[0] as $i => $hit ) {
		$gap = trim( substr( $html, $pos, $hit[1] - $pos ) );
		if ( '' !== $gap ) {
			$out .= "<!-- wp:html -->\n" . $gap . "\n<!-- /wp:html -->\n\n";
		}
		$tag  = strtolower( $m[1][ $i ][0] );
		$part = $hit[0];
		if ( 'p' === $tag ) {
			$out .= "<!-- wp:paragraph -->\n" . $part . "\n<!-- /wp:paragraph -->\n\n";
		} elseif ( 'ul' === $tag || 'ol' === $tag ) {
			$attrs = 'ol' === $tag ? ' {"ordered":true}' : '';
			$out  .= '<!-- wp:list' . $attrs . " -->\n" . preg_replace( '/^<(ul|ol)\b[^>]*>/i', '<$1 class="wp-block-list">', $part ) . "\n<!-- /wp:list -->\n\n";
		} elseif ( 'table' === $tag ) {
			$out .= "<!-- wp:table -->\n<figure class=\"wp-block-table\">" . $part . "</figure>\n<!-- /wp:table -->\n\n";
		} else {
			$level = (int) substr( $tag, 1 );
			$attrs = 2 === $level ? '' : ' {"level":' . $level . '}';
			$out  .= '<!-- wp:heading' . $attrs . " -->\n" . preg_replace( '/^<h' . $level . '\b[^>]*>/i', '<h' . $level . ' class="wp-block-heading">', $part ) . "\n<!-- /wp:heading -->\n\n";
		}
		$pos = $hit[1] + strlen( $hit[0] );
	}
	$tail = trim( substr( $html, $pos ) );
	if ( '' !== $tail ) {
		$out .= "<!-- wp:html -->\n" . $tail . "\n<!-- /wp:html -->\n\n";
	}
	return trim( $out );
}

/**
 * create_page: { title, slug, html, parent_path?, meta_title?, meta_description?, faq? }.
 *
 * @param array $t   Target (site).
 * @param array $new Page.
 * @return array|WP_Error
 */
function msscore_apply_create_page( $t, $new ) {
	if ( ! current_user_can( 'publish_pages' ) && ! current_user_can( 'edit_pages' ) ) {
		return new WP_Error( 'failed', 'This WordPress user cannot create pages.', array( 'status' => 403 ) );
	}
	$title = isset( $new['title'] ) ? sanitize_text_field( (string) $new['title'] ) : '';
	$slug  = sanitize_title( isset( $new['slug'] ) && '' !== $new['slug'] ? (string) $new['slug'] : $title );
	$html  = wp_kses_post( isset( $new['html'] ) ? (string) $new['html'] : '' );
	if ( '' === $title || '' === $slug || '' === trim( wp_strip_all_tags( $html ) ) ) {
		return new WP_Error( 'bad_request', 'A new page needs a title, an address and its text.', array( 'status' => 400 ) );
	}
	$parent = 0;
	if ( ! empty( $new['parent_path'] ) ) {
		$p = get_page_by_path( trim( (string) $new['parent_path'], '/' ) );
		$parent = $p ? $p->ID : 0;
	}
	$path     = trim( ( $parent ? get_page_uri( $parent ) . '/' : '' ) . $slug, '/' );
	$existing = get_page_by_path( $path, OBJECT, array( 'page', 'post' ) );
	if ( $existing && 'trash' !== $existing->post_status ) {
		return new WP_Error( 'skipped', 'A page at /' . $path . '/ already exists, so no new page was made.' );
	}
	$faq = array();
	foreach ( isset( $new['faq'] ) && is_array( $new['faq'] ) ? $new['faq'] : array() as $f ) {
		if ( ! empty( $f['q'] ) && ! empty( $f['a'] ) ) {
			$faq[] = array(
				'q' => sanitize_text_field( (string) $f['q'] ),
				'a' => sanitize_textarea_field( (string) $f['a'] ),
			);
		}
	}
	$content = msscore_html_to_blocks( $html );
	if ( $faq ) {
		$content .= "\n\n" . msscore_html_to_blocks( msscore_faq_html( $faq ) );
	}
	$id = wp_insert_post(
		array(
			'post_type'    => 'page',
			'post_status'  => 'draft',
			'post_title'   => $title,
			'post_name'    => $slug,
			'post_parent'  => $parent,
			'post_content' => wp_slash( $content ),
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return new WP_Error( 'failed', 'The page could not be created: ' . $id->get_error_message() );
	}
	update_post_meta( $id, '_msscore_created', isset( $new['_change_id'] ) ? (string) $new['_change_id'] : '1' );
	if ( $faq ) {
		update_post_meta( $id, '_msscore_faq', array( 'page' => $faq ) );
	}
	$pt = array(
		'kind'     => 'post',
		'id'       => $id,
		'taxonomy' => '',
		'url'      => '',
	);
	if ( ! empty( $new['meta_title'] ) ) {
		msscore_seo_field( 'title', $pt, sanitize_text_field( (string) $new['meta_title'] ), true );
	}
	if ( ! empty( $new['meta_description'] ) ) {
		msscore_seo_field( 'description', $pt, sanitize_textarea_field( (string) $new['meta_description'] ), true );
	}
	return array(
		'before' => null,
		'after'  => array(
			'post_id' => $id,
			'title'   => $title,
			'path'    => '/' . $path . '/',
			'status'  => 'draft',
			'edit'    => get_edit_post_link( $id, 'raw' ),
			'hash'    => md5( (string) get_post_field( 'post_content', $id, 'raw' ) ),
		),
	);
}

/**
 * Undo: the page goes to the bin, unless someone edited it since (then a person decides).
 *
 * @param array $t      Target.
 * @param mixed $before Before (null).
 * @param array $after  After.
 * @return true|WP_Error
 */
function msscore_rollback_create_page( $t, $before, $after ) {
	$id   = isset( $after['post_id'] ) ? absint( $after['post_id'] ) : 0;
	$post = $id ? get_post( $id ) : null;
	if ( ! $post || 'trash' === $post->post_status ) {
		return true;
	}
	if ( md5( (string) $post->post_content ) !== ( isset( $after['hash'] ) ? $after['hash'] : '' ) ) {
		return new WP_Error( 'needs_human', 'The new page was edited after MS SCORE made it, so it was not removed. Delete it in Pages if you do not want it.' );
	}
	wp_trash_post( $id );
	return true;
}
