<?php
/**
 * The plugin's own tables: the change log (every change MS SCORE makes, with its before value, so
 * it can be undone) and 301 redirects.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MSSCORE_DB_VERSION', '2' );

/**
 * Table names.
 *
 * @return array{changes:string,redirects:string}
 */
function msscore_tables() {
	global $wpdb;
	return array(
		'changes'   => $wpdb->prefix . 'msscore_changes',
		'redirects' => $wpdb->prefix . 'msscore_redirects',
	);
}

/**
 * Creates or updates the tables (on activation and when the plugin is updated).
 */
function msscore_install_tables() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$t       = msscore_tables();
	$charset = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$t['changes']} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			change_id varchar(64) NOT NULL,
			type varchar(32) NOT NULL,
			target varchar(255) NOT NULL,
			url varchar(2048) NULL,
			before_value longtext NULL,
			after_value longtext NULL,
			status varchar(20) NOT NULL,
			note text NULL,
			applied_at datetime NOT NULL,
			rolled_back_at datetime NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY change_id (change_id),
			KEY applied_at (applied_at)
		) $charset;"
	);
	dbDelta(
		"CREATE TABLE {$t['redirects']} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			source varchar(1024) NOT NULL,
			target varchar(2048) NOT NULL,
			code smallint(3) NOT NULL DEFAULT 301,
			change_id varchar(64) NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY source (source(191))
		) $charset;"
	);
	update_option( 'msscore_db_version', MSSCORE_DB_VERSION, false );
}

add_action( 'plugins_loaded', 'msscore_maybe_install_tables' );

/**
 * Installs the tables when this plugin version needs them (updating a plugin does not run the
 * activation hook).
 */
function msscore_maybe_install_tables() {
	if ( MSSCORE_DB_VERSION !== get_option( 'msscore_db_version' ) ) {
		msscore_install_tables();
	}
}

/**
 * One change from the log.
 *
 * @param string $change_id Change id.
 * @return array|null
 */
function msscore_log_get( $change_id ) {
	global $wpdb;
	$t   = msscore_tables();
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t['changes']} WHERE change_id = %s", $change_id ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	if ( ! $row ) {
		return null;
	}
	$row['before_value'] = null === $row['before_value'] ? null : json_decode( $row['before_value'], true );
	$row['after_value']  = null === $row['after_value'] ? null : json_decode( $row['after_value'], true );
	$row['target']       = json_decode( $row['target'], true );
	return $row;
}

/**
 * Records a change.
 *
 * @param array $row change_id, type, target, url, before, after, status, note.
 */
function msscore_log_insert( array $row ) {
	global $wpdb;
	$t = msscore_tables();
	$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$t['changes'],
		array(
			'change_id'    => $row['change_id'],
			'type'         => $row['type'],
			'target'       => wp_json_encode( $row['target'] ),
			'url'          => isset( $row['url'] ) ? $row['url'] : null,
			'before_value' => wp_json_encode( $row['before'] ),
			'after_value'  => wp_json_encode( $row['after'] ),
			'status'       => $row['status'],
			'note'         => isset( $row['note'] ) ? $row['note'] : null,
			'applied_at'   => current_time( 'mysql', true ),
		)
	);
}

/**
 * Marks a change as undone.
 *
 * @param string $change_id Change id.
 * @param string $note      Why.
 */
function msscore_log_rolled_back( $change_id, $note = '' ) {
	global $wpdb;
	$t = msscore_tables();
	$wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$t['changes'],
		array(
			'status'         => 'rolled_back',
			'rolled_back_at' => current_time( 'mysql', true ),
			'note'           => $note,
		),
		array( 'change_id' => $change_id )
	);
}

/**
 * The latest changes (for the admin page and MS SCORE's checks).
 *
 * @param int $limit  How many.
 * @param int $offset From.
 * @return array
 */
function msscore_log_list( $limit = 50, $offset = 0 ) {
	global $wpdb;
	$t    = msscore_tables();
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT change_id, type, target, url, status, note, applied_at, rolled_back_at FROM {$t['changes']} ORDER BY id DESC LIMIT %d OFFSET %d", $limit, $offset ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	foreach ( $rows as &$r ) {
		$r['target'] = json_decode( $r['target'], true );
	}
	return $rows;
}
