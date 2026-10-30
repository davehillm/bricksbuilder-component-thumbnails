<?php
namespace ComponentThumbnailStudio;

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/includes/class-storage.php';
require_once __DIR__ . '/includes/class-images.php';

if ( is_multisite() ) {
	$offset = 0;
	do {
		$sites = get_sites( [ 'fields' => 'ids', 'number' => 100, 'offset' => $offset ] );
		foreach ( $sites as $site_id ) {
			switch_to_blog( $site_id );
			Storage::uninstall_site();
			restore_current_blog();
		}
		$offset += count( $sites );
	} while ( count( $sites ) === 100 );
} else {
	Storage::uninstall_site();
}
