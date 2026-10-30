<?php
/**
 * Plugin Name: Component Thumbnail Studio
 * Description: Compose custom component thumbnails inside the Bricks editor.
 * Version: 1.1.2
 * Requires at least: 6.5
 * Requires PHP: 8.2
 * Author: Component Thumbnail Studio
 * License: GPL-2.0-or-later
 * Text Domain: component-thumbnail-studio
 * Domain Path: /languages
 * Update URI: false
 */

namespace ComponentThumbnailStudio;

defined( 'ABSPATH' ) || exit;

const VERSION = '1.1.2';
const FILE = __FILE__;

require_once __DIR__ . '/includes/class-storage.php';
require_once __DIR__ . '/includes/class-component-store.php';
require_once __DIR__ . '/includes/class-images.php';
require_once __DIR__ . '/includes/class-plugin.php';

add_action( 'after_setup_theme', [ Plugin::class, 'boot' ], 30 );
register_activation_hook( __FILE__, static function () {
	if ( Storage::option_names( Storage::CAPTURE_PREFIX ) || get_posts( [ 'post_type' => 'attachment', 'fields' => 'ids', 'posts_per_page' => 1, 'meta_key' => Images::OWNER_META ] ) ) {
		Storage::schedule_cleanup();
	}
} );
add_action( 'init', static function () {
	load_plugin_textdomain( 'component-thumbnail-studio', false, dirname( plugin_basename( FILE ) ) . '/languages' );
} );
register_deactivation_hook( __FILE__, static function () {
	wp_clear_scheduled_hook( 'ctstudio_cleanup' );
} );
