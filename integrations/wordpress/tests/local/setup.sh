#!/usr/bin/env bash
# Local WordPress for the plugin's end-to-end tests (no Docker): MariaDB + PHP's built-in server.
#   bash integrations/wordpress/tests/local/setup.sh      # installs into $WP_E2E_DIR (default /tmp/msscore-wp)
#   WP_E2E_DIR=/tmp/msscore-wp npx tsx integrations/wordpress/tests/e2e.ts
# Needs: php (mysqli), composer, mariadb-server. WordPress core comes from Packagist (johnpbloch/wordpress-core).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../../msscore-connector" && pwd)"
D="${WP_E2E_DIR:-/tmp/msscore-wp}"
mkdir -p "$D"
[ -d "$D/core/wp-admin" ] || composer create-project --no-interaction --no-progress johnpbloch/wordpress-core "$D/core"
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld 2>/dev/null || true
mysqladmin ping >/dev/null 2>&1 || (setsid mysqld_safe --user=mysql >/dev/null 2>&1 < /dev/null &)
for _ in $(seq 1 30); do mysqladmin ping >/dev/null 2>&1 && break; sleep 1; done
mysql -e "DROP DATABASE IF EXISTS wptest; CREATE DATABASE wptest; CREATE USER IF NOT EXISTS 'wp'@'localhost' IDENTIFIED BY 'wp'; GRANT ALL ON wptest.* TO 'wp'@'localhost'; FLUSH PRIVILEGES;"
cat > "$D/core/wp-config.php" <<'CFG'
<?php
define( 'DB_NAME', 'wptest' ); define( 'DB_USER', 'wp' ); define( 'DB_PASSWORD', 'wp' ); define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' ); define( 'DB_COLLATE', '' );
foreach ( array( 'AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY', 'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT' ) as $k ) { define( $k, 'local-test' ); }
$table_prefix = 'wp_';
define( 'WP_DEBUG', true ); define( 'WP_DEBUG_LOG', __DIR__ . '/debug.log' ); define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_ENVIRONMENT_TYPE', 'local' );
define( 'WP_HOME', 'http://localhost:8089' ); define( 'WP_SITEURL', 'http://localhost:8089' );
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', __DIR__ . '/' ); }
require_once ABSPATH . 'wp-settings.php';
CFG
cp "$here/router.php" "$D/core/router.php"
mkdir -p "$D/core/wp-content/plugins" && ln -sfn "$plugin" "$D/core/wp-content/plugins/msscore-connector"
cp "$here/install.php" "$here/seed.php" "$D/"
rm -f "$D/key.txt"
php "$D/install.php"
php "$D/seed.php" > "$D/ids.json"
(cd "$D/core" && setsid nohup php -S localhost:8089 router.php > "$D/server.log" 2>&1 < /dev/null &)
echo "WordPress running at http://localhost:8089 (files in $D)"
