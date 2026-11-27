<?php
/**
 * The "MS SCORE Autopilot" admin page: whether MS SCORE is connected, whether the autopilot is
 * paused, when it last changed something, and every change it made with an Undo button.
 * Administrators and editors (edit_pages) only; every action is nonce-checked.
 *
 * @package MSScore_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Whether a person paused the autopilot here. While paused, /apply makes no new changes.
 *
 * @return bool
 */
function msscore_autopilot_paused() {
	return (bool) get_option( 'msscore_autopilot_paused', false );
}

add_action( 'admin_menu', 'msscore_admin_menu' );

/**
 * Adds the page under its own menu entry.
 */
function msscore_admin_menu() {
	add_menu_page( 'MS SCORE Autopilot', 'MS SCORE Autopilot', 'edit_pages', 'msscore-autopilot', 'msscore_admin_page', 'dashicons-chart-line', 81 );
}

add_action( 'admin_post_msscore_pause', 'msscore_admin_pause' );
add_action( 'admin_post_msscore_undo', 'msscore_admin_undo' );
add_action( 'admin_post_msscore_undo_all', 'msscore_admin_undo_all' );

/**
 * Pause or resume.
 */
function msscore_admin_pause() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		wp_die( esc_html__( 'You cannot change this.', 'msscore-connector' ) );
	}
	check_admin_referer( 'msscore_pause' );
	$pause = isset( $_POST['pause'] ) && '1' === sanitize_text_field( wp_unslash( $_POST['pause'] ) );
	update_option( 'msscore_autopilot_paused', $pause );
	wp_safe_redirect( add_query_arg( array( 'page' => 'msscore-autopilot', 'msscore_msg' => $pause ? 'paused' : 'resumed' ), admin_url( 'admin.php' ) ) );
	exit;
}

/**
 * Undo one change.
 */
function msscore_admin_undo() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		wp_die( esc_html__( 'You cannot change this.', 'msscore-connector' ) );
	}
	$change_id = isset( $_POST['change_id'] ) ? sanitize_text_field( wp_unslash( $_POST['change_id'] ) ) : '';
	check_admin_referer( 'msscore_undo_' . $change_id );
	$user = wp_get_current_user();
	$o    = msscore_do_rollback( $change_id, 'by ' . $user->display_name . ' in WordPress' );
	$msg  = 'rolled_back' === $o['status'] ? 'undone' : 'undo_failed';
	wp_safe_redirect( add_query_arg( array( 'page' => 'msscore-autopilot', 'msscore_msg' => $msg ), admin_url( 'admin.php' ) ) );
	exit;
}

/**
 * Undo every change still live.
 */
function msscore_admin_undo_all() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		wp_die( esc_html__( 'You cannot change this.', 'msscore-connector' ) );
	}
	check_admin_referer( 'msscore_undo_all' );
	$user = wp_get_current_user();
	$o    = msscore_undo_all( 'everything undone by ' . $user->display_name . ' in WordPress' );
	wp_safe_redirect(
		add_query_arg(
			array(
				'page'        => 'msscore-autopilot',
				'msscore_msg' => $o['left'] ? 'undo_all_partly' : 'undo_all',
				'n'           => $o['undone'],
				'left'        => count( $o['left'] ),
			),
			admin_url( 'admin.php' )
		)
	);
	exit;
}

/**
 * Plain words for a change type.
 *
 * @param string $type Type.
 * @return string
 */
function msscore_type_label( $type ) {
	$labels = array(
		'meta_title'       => 'Title tag',
		'meta_description' => 'Meta description',
		'canonical'        => 'Canonical',
		'robots_noindex'   => 'Search engine visibility',
		'og_tags'          => 'Social sharing tags',
		'image_alt'        => 'Image alt text',
		'heading_fix'      => 'Headings',
		'content_block'    => 'Content block',
		'internal_link'    => 'Internal link',
		'schema'           => 'Schema',
		'redirect_301'     => '301 redirect',
		'sitemap'          => 'XML sitemap',
		'robots_txt'       => 'robots.txt',
		'llms_txt'         => 'llms.txt',
		'create_page'      => 'New page (draft)',
	);
	return isset( $labels[ $type ] ) ? $labels[ $type ] : $type;
}

/**
 * A short text for a stored value.
 *
 * @param mixed $v Value.
 * @return string
 */
function msscore_value_text( $v ) {
	if ( null === $v || '' === $v ) {
		return '—';
	}
	if ( is_bool( $v ) ) {
		return $v ? 'on' : 'off';
	}
	if ( is_array( $v ) ) {
		foreach ( array( 'title', 'description', 'alt', 'to', 'content', 'html', 'enabled' ) as $k ) {
			if ( isset( $v[ $k ] ) && ( is_scalar( $v[ $k ] ) ) ) {
				return msscore_value_text( $v[ $k ] );
			}
		}
		return wp_trim_words( wp_strip_all_tags( wp_json_encode( $v ) ), 14 );
	}
	return wp_trim_words( wp_strip_all_tags( (string) $v ), 18 );
}

/**
 * The page.
 */
function msscore_admin_page() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$paused    = msscore_autopilot_paused();
	$connected = '' !== (string) get_option( MSSCORE_KEY_OPTION, '' );
	$rows      = msscore_log_list( 100, 0 );
	$test      = function ( $r ) {
		return '-t' === substr( (string) $r['change_id'], -2 );
	};
	$rows      = array_values( array_filter( $rows, function ( $r ) use ( $test ) {
		return ! $test( $r );
	} ) );
	$last      = null;
	foreach ( $rows as $r ) {
		if ( 'applied' === $r['status'] || 'rolled_back' === $r['status'] ) {
			$last = $r['applied_at'];
			break;
		}
	}
	$applied = count( array_filter( $rows, function ( $r ) {
		return 'applied' === $r['status'];
	} ) );
	$msg     = isset( $_GET['msscore_msg'] ) ? sanitize_key( wp_unslash( $_GET['msscore_msg'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- message only.
	$notices = array(
		'paused'      => 'The autopilot is paused. MS SCORE will not change anything until you resume it.',
		'resumed'     => 'The autopilot is running again.',
		'undone'      => 'The change was undone.',
		'undo_failed' => 'That change could not be undone automatically (the page may have been edited since).',
		'undo_all'        => 'Every MS SCORE change was undone (' . ( isset( $_GET['n'] ) ? absint( $_GET['n'] ) : 0 ) . ').', // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- message only.
		'undo_all_partly' => 'MS SCORE changes were undone (' . ( isset( $_GET['n'] ) ? absint( $_GET['n'] ) : 0 ) . '), but ' . ( isset( $_GET['left'] ) ? absint( $_GET['left'] ) : 0 ) . ' could not be (the page was edited since). They are still listed below.', // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- message only.
	);
	?>
	<div class="wrap">
		<h1>MS SCORE Autopilot</h1>
		<?php if ( isset( $notices[ $msg ] ) ) : ?>
			<div class="notice notice-info is-dismissible"><p><?php echo esc_html( $notices[ $msg ] ); ?></p></div>
		<?php endif; ?>
		<table class="widefat striped" style="max-width:720px;margin:16px 0">
			<tbody>
				<tr><th style="width:200px">Connected to MS SCORE</th><td><?php echo $connected ? '<strong style="color:#15803D">Yes</strong>' : '<strong style="color:#B91C1C">No</strong> — connect the site from MS SCORE (Connections tab).'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed markup. ?></td></tr>
				<tr><th>Status</th><td><?php echo $paused ? '<strong style="color:#B91C1C">Paused</strong>' : '<strong style="color:#15803D">Running</strong> (changes go out Monday to Friday)'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed markup. ?></td></tr>
				<tr><th>Last change</th><td><?php echo esc_html( $last ? get_date_from_gmt( $last, get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) ) : 'None yet' ); ?></td></tr>
				<tr><th>Changes live now</th><td><?php echo esc_html( (string) $applied ); ?></td></tr>
				<tr><th>Sitemap</th><td><?php $sm = msscore_existing_sitemap(); echo $sm['url'] ? '<a href="' . esc_url( $sm['url'] ) . '" target="_blank" rel="noopener">' . esc_html( $sm['url'] ) . '</a> (' . esc_html( $sm['by'] ) . ')' : 'None'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped parts. ?></td></tr>
			</tbody>
		</table>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="msscore_pause">
			<input type="hidden" name="pause" value="<?php echo $paused ? '0' : '1'; ?>">
			<?php wp_nonce_field( 'msscore_pause' ); ?>
			<?php submit_button( $paused ? 'Resume the autopilot' : 'Pause the autopilot', $paused ? 'primary' : 'secondary', 'submit', false ); ?>
			<p class="description">Pausing stops new changes at once. Changes already made stay until you undo them.</p>
		</form>

		<?php if ( $applied ) : ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin-top:12px" onsubmit="return confirm('Undo every change MS SCORE made on this website? Pages go back to how they were before.');">
				<input type="hidden" name="action" value="msscore_undo_all">
				<?php wp_nonce_field( 'msscore_undo_all' ); ?>
				<?php submit_button( 'Undo every MS SCORE change', 'delete', 'submit', false ); ?>
			</form>
		<?php endif; ?>

		<h2 style="margin-top:28px">Changes made</h2>
		<?php if ( ! $rows ) : ?>
			<p>No changes yet.</p>
		<?php else : ?>
			<table class="widefat striped">
				<thead><tr><th>When</th><th>What</th><th>Page</th><th>Before</th><th>After</th><th>Status</th><th></th></tr></thead>
				<tbody>
				<?php foreach ( $rows as $r ) : ?>
					<tr>
						<td><?php echo esc_html( get_date_from_gmt( $r['applied_at'], 'j M Y H:i' ) ); ?></td>
						<td><?php echo esc_html( msscore_type_label( $r['type'] ) ); ?><?php if ( $r['note'] ) : ?><br><small><?php echo esc_html( $r['note'] ); ?></small><?php endif; ?></td>
						<td><?php echo $r['url'] ? '<a href="' . esc_url( $r['url'] ) . '" target="_blank" rel="noopener">' . esc_html( wp_parse_url( $r['url'], PHP_URL_PATH ) ?: '/' ) . '</a>' : '—'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped parts. ?></td>
						<td><?php echo esc_html( msscore_value_text( $r['before_value'] ) ); ?></td>
						<td><?php echo esc_html( msscore_value_text( $r['after_value'] ) ); ?></td>
						<td><?php echo esc_html( 'applied' === $r['status'] ? 'Live' : ( 'rolled_back' === $r['status'] ? 'Undone' : ucfirst( str_replace( '_', ' ', $r['status'] ) ) ) ); ?></td>
						<td>
							<?php if ( 'applied' === $r['status'] ) : ?>
								<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return confirm('Undo this change?');">
									<input type="hidden" name="action" value="msscore_undo">
									<input type="hidden" name="change_id" value="<?php echo esc_attr( $r['change_id'] ); ?>">
									<?php wp_nonce_field( 'msscore_undo_' . $r['change_id'] ); ?>
									<button type="submit" class="button button-small">Undo</button>
								</form>
							<?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
	</div>
	<?php
}
