<?php
/**
 * Signed requests from MS SCORE.
 *
 * On top of the Application Password (which gives the request a WordPress user and its permissions),
 * MS SCORE signs every request with a key only it and this site know:
 *
 *   X-MSScore-Timestamp: unix seconds
 *   X-MSScore-Signature: hex HMAC-SHA256( key, timestamp \n METHOD \n route \n sorted query \n sha256(body) )
 *
 * A signature older or newer than 5 minutes is refused.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MSSCORE_KEY_OPTION', 'msscore_signing_key' );
define( 'MSSCORE_SIGNATURE_WINDOW', 300 );

/**
 * The signing key MS SCORE gave this site ('' until it has been set).
 *
 * @return string
 */
function msscore_signing_key() {
	return (string) get_option( MSSCORE_KEY_OPTION, '' );
}

/**
 * Query parameters in a fixed order, encoded the same way MS SCORE encodes them (RFC 3986).
 *
 * @param array $params Query parameters.
 * @return string
 */
function msscore_canonical_query( array $params ) {
	unset( $params['rest_route'] );
	$parts = array();
	foreach ( $params as $k => $v ) {
		if ( is_array( $v ) ) {
			continue;
		}
		$parts[ (string) $k ] = (string) $v;
	}
	ksort( $parts, SORT_STRING );
	$out = array();
	foreach ( $parts as $k => $v ) {
		$out[] = rawurlencode( $k ) . '=' . rawurlencode( $v );
	}
	return implode( '&', $out );
}

/**
 * The text that is signed.
 *
 * @param string $ts     Timestamp.
 * @param string $method HTTP method.
 * @param string $route  REST route, e.g. /msscore/v1/inventory.
 * @param string $query  Canonical query.
 * @param string $body   Raw request body.
 * @return string
 */
function msscore_signature_base( $ts, $method, $route, $query, $body ) {
	return $ts . "\n" . strtoupper( $method ) . "\n" . $route . "\n" . $query . "\n" . hash( 'sha256', (string) $body );
}

/**
 * Checks a signature (pure function, so it can be tested without WordPress).
 *
 * @param string $key    Signing key.
 * @param string $ts     X-MSScore-Timestamp.
 * @param string $sig    X-MSScore-Signature.
 * @param string $method HTTP method.
 * @param string $route  REST route.
 * @param string $query  Canonical query.
 * @param string $body   Raw body.
 * @param int    $now    Current unix time.
 * @return bool
 */
function msscore_verify_signature( $key, $ts, $sig, $method, $route, $query, $body, $now ) {
	if ( '' === (string) $key || '' === (string) $sig || ! ctype_digit( (string) $ts ) ) {
		return false;
	}
	if ( abs( (int) $now - (int) $ts ) > MSSCORE_SIGNATURE_WINDOW ) {
		return false;
	}
	$expected = hash_hmac( 'sha256', msscore_signature_base( $ts, $method, $route, $query, $body ), (string) $key );
	return hash_equals( $expected, strtolower( (string) $sig ) );
}

/**
 * Whether a REST request carries a valid signature.
 *
 * @param WP_REST_Request $req Request.
 * @return bool
 */
function msscore_request_signed( WP_REST_Request $req ) {
	return msscore_verify_signature(
		msscore_signing_key(),
		(string) $req->get_header( 'x_msscore_timestamp' ),
		(string) $req->get_header( 'x_msscore_signature' ),
		$req->get_method(),
		$req->get_route(),
		msscore_canonical_query( (array) $req->get_query_params() ),
		(string) $req->get_body(),
		time()
	);
}

/**
 * Permission for routes that need a signature: an editor or administrator, a key, and a valid signature.
 *
 * @param WP_REST_Request $req Request.
 * @return bool|WP_Error
 */
function msscore_can_use_signed( WP_REST_Request $req ) {
	if ( ! msscore_can_use() ) {
		return false;
	}
	if ( '' === msscore_signing_key() ) {
		return new WP_Error( 'msscore_no_key', 'MS SCORE has not set up signed requests on this site yet.', array( 'status' => 401 ) );
	}
	if ( ! msscore_request_signed( $req ) ) {
		return new WP_Error( 'msscore_bad_signature', 'The request signature is missing, wrong or expired.', array( 'status' => 401 ) );
	}
	return true;
}

/**
 * Permission for routes that also work before a key exists (status, setting the key): once a key is
 * set, the request must be signed with it.
 *
 * @param WP_REST_Request $req Request.
 * @return bool|WP_Error
 */
function msscore_can_use_maybe_signed( WP_REST_Request $req ) {
	if ( ! msscore_can_use() ) {
		return false;
	}
	if ( '' === msscore_signing_key() ) {
		return true;
	}
	return msscore_can_use_signed( $req );
}

/**
 * POST /key: stores the signing key. The first key needs only the Application Password; a new key
 * must be signed with the current one.
 *
 * @param WP_REST_Request $req Request.
 * @return array|WP_Error
 */
function msscore_rest_set_key( WP_REST_Request $req ) {
	$key = (string) $req->get_param( 'key' );
	if ( ! preg_match( '/^[A-Za-z0-9_-]{43,128}$/', $key ) ) {
		return new WP_Error( 'bad_request', 'The key must be 43 to 128 letters, digits, - or _.', array( 'status' => 400 ) );
	}
	update_option( MSSCORE_KEY_OPTION, $key, false );
	return array( 'ok' => true );
}

/**
 * DELETE /key: forgets the signing key (MS SCORE calls it, signed, when the site is disconnected),
 * so connecting again starts fresh.
 *
 * @return array
 */
function msscore_rest_clear_key() {
	delete_option( MSSCORE_KEY_OPTION );
	return array( 'ok' => true );
}
