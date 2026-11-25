<?php
define( 'WP_INSTALLING', true );
$_SERVER['HTTP_HOST'] = 'localhost:8089';
require __DIR__ . '/core/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
if ( ! is_blog_installed() ) {
	wp_install( 'Test Shop', 'admin', 'admin@example.com', true, '', 'adminpass' );
}
update_option( 'permalink_structure', '/%postname%/' );
$r = activate_plugin( 'msscore-connector/msscore-connector.php' );
echo is_wp_error( $r ) ? 'activate error: ' . $r->get_error_message() : 'activated', "\n";
$u = get_user_by( 'login', 'admin' );
list( $pw ) = WP_Application_Passwords::create_new_application_password( $u->ID, array( 'name' => 'msscore-test-' . time() ) );
file_put_contents( __DIR__ . '/apppass.txt', $pw );
echo "app password saved\n";
