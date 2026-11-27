<?php
/**
 * POST /apply, POST /rollback and GET /changes (all signed).
 *
 * /apply { change_id, type, target, new_value } is idempotent by change_id: sending the same change
 * again returns the first result. The value before the change is stored in the change log, so
 * /rollback { change_id } can put it back. Every change clears the page's cache.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The change types this plugin version can apply, and how.
 *
 * @return array<string,array>
 */
function msscore_change_handlers() {
	$custom = array();
	foreach ( array( 'image_alt', 'heading_fix', 'content_block', 'internal_link', 'schema', 'redirect_301', 'sitemap', 'robots_txt', 'llms_txt', 'create_page' ) as $type ) {
		$custom[ $type ] = array(
			'apply'    => 'msscore_apply_' . $type,
			'rollback' => 'heading_fix' === $type ? 'msscore_rollback_snapshot' : 'msscore_rollback_' . $type,
			'site'     => in_array( $type, array( 'redirect_301', 'sitemap', 'robots_txt', 'llms_txt', 'create_page' ), true ),
		);
	}
	return array_merge( msscore_field_types(), $custom );
}

/**
 * Builds the REST answer for a WP_Error from a handler.
 *
 * @param WP_Error $e Error.
 * @return array{status:string,reason:string,http:int}
 */
function msscore_error_outcome( WP_Error $e ) {
	$code = $e->get_error_code();
	$data = $e->get_error_data();
	if ( 'needs_human' === $code || 'skipped' === $code ) {
		return array(
			'status' => $code,
			'reason' => $e->get_error_message(),
			'http'   => 200,
		);
	}
	return array(
		'status' => 'failed',
		'reason' => $e->get_error_message(),
		'http'   => is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 400,
	);
}

/**
 * POST /apply.
 *
 * @param WP_REST_Request $req Request.
 * @return WP_REST_Response
 */
function msscore_rest_apply( WP_REST_Request $req ) {
	$change_id = (string) $req->get_param( 'change_id' );
	$type      = sanitize_key( (string) $req->get_param( 'type' ) );
	$target    = $req->get_param( 'target' );
	$new       = $req->get_param( 'new_value' );
	if ( ! preg_match( '/^[A-Za-z0-9_-]{8,64}$/', $change_id ) ) {
		return new WP_REST_Response( array( 'status' => 'failed', 'reason' => 'change_id must be 8–64 letters, digits, - or _.' ), 400 );
	}
	$done = msscore_log_get( $change_id );
	if ( ! $done && msscore_autopilot_paused() ) {
		return new WP_REST_Response( array( 'status' => 'skipped', 'change_id' => $change_id, 'reason' => 'The autopilot is paused in WordPress (MS SCORE Autopilot page).' ), 200 );
	}
	if ( $done ) {
		return new WP_REST_Response(
			array(
				'status'    => $done['status'],
				'change_id' => $change_id,
				'before'    => $done['before_value'],
				'after'     => $done['after_value'],
				'reason'    => $done['note'],
				'repeat'    => true,
			),
			200
		);
	}
	$handlers = msscore_change_handlers();
	if ( ! isset( $handlers[ $type ] ) ) {
		return new WP_REST_Response( array( 'status' => 'needs_human', 'reason' => 'This plugin version cannot make “' . $type . '” changes.' ), 200 );
	}
	$h = $handlers[ $type ];
	if ( ! empty( $h['site'] ) ) {
		$target = array( 'site' => true );
	}
	$t = msscore_resolve_target( $target );
	if ( is_wp_error( $t ) ) {
		$o = msscore_error_outcome( $t );
		return new WP_REST_Response( array( 'status' => $o['status'], 'reason' => $o['reason'] ), $o['http'] );
	}
	try {
		if ( isset( $h['get'] ) ) {
			$value  = call_user_func( $h['clean'], $new );
			$before = call_user_func( $h['get'], $t );
			$result = is_wp_error( $before ) ? $before : call_user_func( $h['set'], $t, $value );
			$result = is_wp_error( $result ) ? $result : array(
				'before' => $before,
				'after'  => call_user_func( $h['get'], $t ),
			);
		} else {
			$new           = is_array( $new ) ? $new : array();
			$new['_change_id'] = $change_id;
			$result        = call_user_func( $h['apply'], $t, $new );
		}
	} catch ( \Throwable $e ) {
		$result = new WP_Error( 'failed', 'The change could not be made: ' . $e->getMessage() );
	}
	if ( is_wp_error( $result ) ) {
		$o = msscore_error_outcome( $result );
		if ( 'failed' !== $o['status'] ) {
			msscore_log_insert(
				array(
					'change_id' => $change_id,
					'type'      => $type,
					'target'    => $target,
					'url'       => $t['url'],
					'before'    => null,
					'after'     => null,
					'status'    => $o['status'],
					'note'      => $o['reason'],
				)
			);
		}
		return new WP_REST_Response( array( 'status' => $o['status'], 'change_id' => $change_id, 'reason' => $o['reason'] ), $o['http'] );
	}
	msscore_log_insert(
		array(
			'change_id' => $change_id,
			'type'      => $type,
			'target'    => $target,
			'url'       => $t['url'],
			'before'    => $result['before'],
			'after'     => $result['after'],
			'status'    => 'applied',
			'note'      => sanitize_text_field( (string) $req->get_param( 'label' ) ),
		)
	);
	delete_transient( 'msscore_sitemap_cache' );
	$purged = msscore_purge_cache( $t['url'], 'post' === $t['kind'] ? $t['id'] : null );
	return new WP_REST_Response(
		array(
			'status'    => 'applied',
			'change_id' => $change_id,
			'url'       => $t['url'],
			'before'    => $result['before'],
			'after'     => $result['after'],
			'purged'    => $purged,
		),
		200
	);
}

/**
 * POST /rollback.
 *
 * @param WP_REST_Request $req Request.
 * @return WP_REST_Response
 */
function msscore_rest_rollback( WP_REST_Request $req ) {
	$o = msscore_do_rollback( (string) $req->get_param( 'change_id' ), (string) $req->get_param( 'reason' ) );
	$http = $o['http'];
	unset( $o['http'] );
	return new WP_REST_Response( $o, $http );
}

/**
 * Undoes one change (REST and the admin page).
 *
 * @param string $change_id Change id.
 * @param string $reason    Why.
 * @return array Answer with an 'http' code.
 */
function msscore_do_rollback( $change_id, $reason ) {
	$done = msscore_log_get( $change_id );
	if ( ! $done ) {
		return array( 'status' => 'failed', 'reason' => 'No change with this id.', 'http' => 404 );
	}
	if ( 'applied' !== $done['status'] ) {
		return array( 'status' => $done['status'], 'change_id' => $change_id, 'repeat' => true, 'http' => 200 );
	}
	$handlers = msscore_change_handlers();
	$h        = isset( $handlers[ $done['type'] ] ) ? $handlers[ $done['type'] ] : null;
	$t        = msscore_resolve_target( ! empty( $h['site'] ) ? array( 'site' => true ) : $done['target'] );
	if ( ! $h || is_wp_error( $t ) ) {
		return array( 'status' => 'needs_human', 'reason' => 'The page or setting this change was made on no longer exists.', 'http' => 200 );
	}
	try {
		$r = isset( $h['get'] )
			? call_user_func( $h['set'], $t, $done['before_value'] )
			: call_user_func( $h['rollback'], $t, $done['before_value'], $done['after_value'] );
	} catch ( \Throwable $e ) {
		$r = new WP_Error( 'failed', 'Undo failed: ' . $e->getMessage() );
	}
	if ( is_wp_error( $r ) ) {
		$o = msscore_error_outcome( $r );
		return array( 'status' => $o['status'], 'change_id' => $change_id, 'reason' => $o['reason'], 'http' => $o['http'] );
	}
	msscore_log_rolled_back( $change_id, $reason );
	delete_transient( 'msscore_sitemap_cache' );
	$purged = msscore_purge_cache( $t['url'], 'post' === $t['kind'] ? $t['id'] : null );
	return array(
		'status'    => 'rolled_back',
		'change_id' => $change_id,
		'restored'  => $done['before_value'],
		'purged'    => $purged,
		'http'      => 200,
	);
}

/**
 * Undoes every change still live, newest first (the "put everything back" button and route).
 *
 * @param string $reason Why.
 * @return array{undone:int,left:array<int,array{change_id:string,reason:string}>}
 */
function msscore_undo_all( $reason ) {
	$undone = 0;
	$left   = array();
	for ( $page = 0; $page < 40; $page++ ) {
		$live = array_values(
			array_filter(
				msscore_log_list( 50, 0 ),
				function ( $r ) use ( $left ) {
					return 'applied' === $r['status'] && ! isset( $left[ $r['change_id'] ] );
				}
			)
		);
		if ( ! $live ) {
			break;
		}
		foreach ( $live as $r ) {
			$o = msscore_do_rollback( $r['change_id'], $reason );
			if ( 'rolled_back' === $o['status'] ) {
				++$undone;
			} else {
				$left[ $r['change_id'] ] = array(
					'change_id' => $r['change_id'],
					'reason'    => isset( $o['reason'] ) ? (string) $o['reason'] : 'Could not be undone.',
				);
			}
		}
	}
	return array(
		'undone' => $undone,
		'left'   => array_values( $left ),
	);
}

/**
 * POST /rollback-all.
 *
 * @param WP_REST_Request $req Request.
 * @return array
 */
function msscore_rest_rollback_all( WP_REST_Request $req ) {
	$reason = sanitize_text_field( (string) $req->get_param( 'reason' ) );
	return msscore_undo_all( '' !== $reason ? $reason : 'MS SCORE asked to undo everything' );
}

/**
 * GET /changes?page=1: the change log, newest first.
 *
 * @param WP_REST_Request $req Request.
 * @return array
 */
function msscore_rest_changes( WP_REST_Request $req ) {
	$page = max( 1, absint( $req->get_param( 'page' ) ) );
	return array(
		'page'  => $page,
		'items' => msscore_log_list( 50, ( $page - 1 ) * 50 ),
	);
}

/**
 * Registers the routes.
 *
 * @param string $ns Namespace.
 */
function msscore_register_apply_routes( $ns ) {
	register_rest_route(
		$ns,
		'/apply',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'msscore_can_use_signed',
			'callback'            => 'msscore_rest_apply',
		)
	);
	register_rest_route(
		$ns,
		'/rollback',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'msscore_can_use_signed',
			'callback'            => 'msscore_rest_rollback',
		)
	);
	register_rest_route(
		$ns,
		'/rollback-all',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'msscore_can_use_signed',
			'callback'            => 'msscore_rest_rollback_all',
		)
	);
	register_rest_route(
		$ns,
		'/changes',
		array(
			'methods'             => 'GET',
			'permission_callback' => 'msscore_can_use_signed',
			'callback'            => 'msscore_rest_changes',
		)
	);
}
