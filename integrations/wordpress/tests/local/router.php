<?php
$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
if ( $path !== '/' && is_file( __DIR__ . $path ) && ! str_ends_with( $path, '.php' ) ) { return false; }
if ( str_ends_with( $path, '.php' ) && is_file( __DIR__ . $path ) ) { require __DIR__ . $path; return; }
$_SERVER['SCRIPT_NAME'] = '/index.php';
require __DIR__ . '/index.php';
