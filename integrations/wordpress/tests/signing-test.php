<?php
/**
 * Plain PHP checks for the signature code (no WordPress needed): php integrations/wordpress/tests/signing-test.php
 *
 * @package MSScore_Connector
 */

define( 'ABSPATH', __DIR__ );
require __DIR__ . '/../msscore-connector/includes/signing.php';

$failed = 0;
/**
 * Prints and counts a failed check.
 *
 * @param bool   $ok   Result.
 * @param string $name Check name.
 */
function msscore_check( $ok, $name ) {
	global $failed;
	echo ( $ok ? 'PASS ' : 'FAIL ' ) . $name . "\n";
	if ( ! $ok ) {
		++$failed;
	}
}

$key   = str_repeat( 'k', 43 );
$query = msscore_canonical_query(
	array(
		'type'       => 'page',
		'page'       => '2',
		'rest_route' => '/msscore/v1/inventory',
		'q'          => "a b!'()*",
	)
);
msscore_check( "page=2&q=a%20b%21%27%28%29%2A&type=page" === $query, 'canonical query is sorted and RFC 3986 encoded' );

$ts  = '1700000000';
$sig = hash_hmac( 'sha256', msscore_signature_base( $ts, 'GET', '/msscore/v1/inventory', $query, '' ), $key );
// Same vector as packages/core/test/wordpress-signing.test.ts.
msscore_check( 'a44a0df6b5790d3a0188048e693182aa9d9ae8be587f47dec117da753166eafc' === $sig, 'signature matches the shared test vector' );
msscore_check( msscore_verify_signature( $key, $ts, $sig, 'GET', '/msscore/v1/inventory', $query, '', 1700000100 ), 'valid signature within 5 minutes' );
msscore_check( ! msscore_verify_signature( $key, $ts, $sig, 'GET', '/msscore/v1/inventory', $query, '', 1700000301 ), 'expired after 5 minutes' );
msscore_check( ! msscore_verify_signature( $key, $ts, $sig, 'GET', '/msscore/v1/inventory', $query, '', 1699999699 ), 'refused when from the future' );
msscore_check( ! msscore_verify_signature( $key, $ts, $sig, 'POST', '/msscore/v1/inventory', $query, '', 1700000000 ), 'method is signed' );
msscore_check( ! msscore_verify_signature( $key, $ts, $sig, 'GET', '/msscore/v1/inventory', 'page=3&type=page', '', 1700000000 ), 'query is signed' );
msscore_check( ! msscore_verify_signature( $key, $ts, $sig, 'GET', '/msscore/v1/inventory', $query, '{}', 1700000000 ), 'body is signed' );
msscore_check( ! msscore_verify_signature( '', $ts, $sig, 'GET', '/msscore/v1/inventory', $query, '', 1700000000 ), 'no key, no access' );
msscore_check( ! msscore_verify_signature( $key, 'abc', $sig, 'GET', '/msscore/v1/inventory', $query, '', 1700000000 ), 'timestamp must be a number' );

exit( $failed ? 1 : 0 );
