<?php
namespace ComponentThumbnailStudio;

defined( 'ABSPATH' ) || exit;

final class Storage {
	public const PROJECT_PREFIX = 'ctstudio_project_';
	public const CAPTURE_PREFIX = 'ctstudio_capture_';
	public const MAX_LAYERS = 12;
	public const WIDTH = 1200;
	public const HEIGHT = 800;
	public const CAPTURE_GRACE = 3600;
	public const MAX_RETAINED = 612;

	public static function project( string $id ): array {
		$value = get_option( self::PROJECT_PREFIX . $id, [] );
		return is_array( $value ) ? array_merge( self::empty_project(), $value ) : self::empty_project();
	}

	public static function empty_project(): array {
		return [ 'revision' => 0, 'background' => '#FCF2E0', 'layers' => [], 'appliedUrl' => '', 'appliedUpdated' => 0, 'attachmentId' => 0, 'imageHash' => '' ];
	}

	public static function normalize_recipe( array $input, string $component_id ): array {
		$color = $input['background'] ?? '';
		if ( ! is_string( $color ) || ! preg_match( '/^#[a-f0-9]{6}$/iD', $color ) ) {
			throw new \InvalidArgumentException( __( 'Enter a six-digit hex color.', 'component-thumbnail-studio' ) );
		}
		$layers = $input['layers'] ?? null;
		if ( ! is_array( $layers ) || ! array_is_list( $layers ) || count( $layers ) > self::MAX_LAYERS ) {
			throw new \InvalidArgumentException( __( 'A thumbnail can contain up to 12 images.', 'component-thumbnail-studio' ) );
		}
		$out = [];
		$ids = [];
		foreach ( $layers as $layer ) {
			if ( ! is_array( $layer ) || ! is_string( $layer['id'] ?? null ) || ! preg_match( '/^[a-z0-9-]{1,64}$/D', $layer['id'] ) || isset( $ids[ $layer['id'] ] ) ) {
				throw new \InvalidArgumentException( __( 'The image arrangement is invalid.', 'component-thumbnail-studio' ) );
			}
			$capture_id = $layer['captureId'] ?? '';
			$asset = is_string( $capture_id ) ? self::capture_record( $capture_id ) : null;
			if ( ! $asset || $asset['componentId'] !== $component_id ) {
				throw new \InvalidArgumentException( __( 'A source image is missing. Capture it again.', 'component-thumbnail-studio' ) );
			}
			if ( ! self::can_access_capture( $asset ) ) {
				throw new \RuntimeException( __( 'You cannot access a source image from its original page.', 'component-thumbnail-studio' ), 403 );
			}
			self::touch_captures( [ $layer['captureId'] ], $component_id );
			$item = [ 'id' => $layer['id'], 'captureId' => $layer['captureId'] ];
			foreach ( [ 'x', 'y', 'width', 'height' ] as $key ) {
				$n = $layer[ $key ] ?? null;
				if ( ! is_numeric( $n ) || ! is_finite( (float) $n ) || abs( (float) $n ) > 24000 || ( in_array( $key, [ 'width', 'height' ], true ) && (float) $n < 1 ) ) {
					throw new \InvalidArgumentException( __( 'The image size or position is invalid.', 'component-thumbnail-studio' ) );
				}
				$item[ $key ] = round( (float) $n, 3 );
			}
			$ratio = $asset['width'] / $asset['height'];
			if ( abs( $item['width'] / $item['height'] - $ratio ) > max( 0.01, $ratio * 0.01 ) ) {
				throw new \InvalidArgumentException( __( 'Images must keep their original proportions.', 'component-thumbnail-studio' ) );
			}
			$ids[ $item['id'] ] = true;
			$style_numbers = [ 'borderWidth' => [ 0, 64, 0 ], 'borderRadius' => [ 0, 600, 0 ], 'shadowX' => [ -200, 200, 0 ], 'shadowY' => [ -200, 200, 12 ], 'shadowBlur' => [ 0, 200, 28 ], 'shadowSpread' => [ -100, 100, 0 ], 'shadowOpacity' => [ 0, 100, 0 ] ];
			foreach ( $style_numbers as $key => [ $minimum, $maximum, $default ] ) {
				$value = $layer[ $key ] ?? $default;
				if ( ! is_numeric( $value ) || ! is_finite( (float) $value ) || (float) $value < $minimum || (float) $value > $maximum ) {
					throw new \InvalidArgumentException( __( 'The image border, corners, or shadow settings are invalid.', 'component-thumbnail-studio' ) );
				}
				$item[ $key ] = round( (float) $value, 3 );
			}
			foreach ( [ 'borderColor', 'shadowColor' ] as $key ) {
				$style_color = $layer[ $key ] ?? '#000000';
				if ( ! is_string( $style_color ) || ! preg_match( '/^#[a-f0-9]{6}$/iD', $style_color ) ) {
					throw new \InvalidArgumentException( __( 'Enter a six-digit image style color.', 'component-thumbnail-studio' ) );
				}
				$item[ $key ] = strtoupper( $style_color );
			}
			$out[] = $item;
		}
		return [ 'background' => strtoupper( $color ), 'layers' => $out ];
	}

	public static function save_project( string $id, array $recipe, int $expected ): array {
		$name = self::PROJECT_PREFIX . $id;
		$old = self::project( $id );
		if ( $old['revision'] !== $expected ) {
			throw new \RuntimeException( __( 'This thumbnail changed in another window. Reopen it to load the latest version.', 'component-thumbnail-studio' ), 409 );
		}
		$new = array_merge( $old, $recipe, [ 'revision' => $expected + 1, 'updated' => time() ] );
		if ( $expected === 0 && false === get_option( $name, false ) ) {
			if ( ! add_option( $name, $new, '', false ) ) {
				throw new \RuntimeException( __( 'This thumbnail changed in another window. Reopen it to continue.', 'component-thumbnail-studio' ), 409 );
			}
		} else {
			self::compare_exchange( $name, $old, $new );
		}
		return $new;
	}

	public static function compare_exchange( string $name, array $old, array $new ): void {
		global $wpdb;
		$changed = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value = %s", maybe_serialize( $new ), $name, maybe_serialize( $old ) ) );
		wp_cache_delete( $name, 'options' );
		if ( $changed !== 1 ) {
			throw new \RuntimeException( __( 'This thumbnail changed in another window. Reopen it to continue.', 'component-thumbnail-studio' ), 409 );
		}
	}

	public static function capture_record( string $id ): ?array {
		if ( ! preg_match( '/^[a-f0-9]{32}$/D', $id ) ) {
			return null;
		}
		$value = get_option( self::CAPTURE_PREFIX . $id, null );
		return is_array( $value ) ? $value : null;
	}

	public static function can_access_capture( array $record ): bool {
		return ! empty( $record['postId'] ) && current_user_can( 'edit_post', (int) $record['postId'] );
	}

	private static function directory( bool $create = false ): string {
		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			throw new \RuntimeException( __( 'The uploads folder is unavailable.', 'component-thumbnail-studio' ) );
		}
		$dir = trailingslashit( $uploads['basedir'] ) . 'ctstudio-captures/';
		if ( is_link( rtrim( $dir, '/' ) ) || ( $create && ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) ) {
			throw new \RuntimeException( __( 'The source image could not be saved.', 'component-thumbnail-studio' ) );
		}
		return $dir;
	}

	private static function key(): string {
		$key = get_option( 'ctstudio_capture_key', '' );
		if ( ! is_string( $key ) || ! preg_match( '/^[a-f0-9]{64}$/D', $key ) ) {
			add_option( 'ctstudio_capture_key', bin2hex( random_bytes( 32 ) ), '', false );
			$key = get_option( 'ctstudio_capture_key', '' );
		}
		$decoded = is_string( $key ) && preg_match( '/^[a-f0-9]{64}$/D', $key ) ? hex2bin( $key ) : false;
		if ( $decoded === false || strlen( $decoded ) !== 32 ) {
			throw new \RuntimeException( __( 'Source image storage is unavailable.', 'component-thumbnail-studio' ) );
		}
		return $decoded;
	}

	public static function validate_png( string $bytes, bool $final = false ): array {
		if ( strlen( $bytes ) > 5 * 1024 * 1024 || substr( $bytes, 0, 8 ) !== "\x89PNG\r\n\x1a\n" ) {
			throw new \InvalidArgumentException( __( 'Use a PNG image smaller than 5 MB.', 'component-thumbnail-studio' ) );
		}
		$size = @getimagesizefromstring( $bytes );
		if ( ! $size || $size[2] !== IMAGETYPE_PNG || $size[0] < 1 || $size[1] < 1 || max( $size[0], $size[1] ) > 8192 || $size[0] * $size[1] > 16000000 ) {
			throw new \InvalidArgumentException( __( 'The captured image is invalid or too large.', 'component-thumbnail-studio' ) );
		}
		if ( $final && ( $size[0] !== self::WIDTH || $size[1] !== self::HEIGHT ) ) {
			throw new \InvalidArgumentException( __( 'The finished image has the wrong dimensions.', 'component-thumbnail-studio' ) );
		}
		return [ (int) $size[0], (int) $size[1] ];
	}

	public static function save_capture( string $component_id, string $bytes, int $post_id ): array {
		if ( $post_id < 1 || ! current_user_can( 'edit_post', $post_id ) ) {
			throw new \RuntimeException( __( 'You cannot access a source image from its original page.', 'component-thumbnail-studio' ), 403 );
		}
		if ( ! function_exists( 'openssl_encrypt' ) ) {
			throw new \RuntimeException( __( 'The server needs OpenSSL to store source images securely.', 'component-thumbnail-studio' ) );
		}
		[ $width, $height ] = self::validate_png( $bytes );
		$hash = hash( 'sha256', $bytes );
		global $wpdb;
		$matches = $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s AND option_value LIKE %s", $wpdb->esc_like( self::CAPTURE_PREFIX ) . '%', '%' . $wpdb->esc_like( $hash ) . '%' ) );
		foreach ( $matches as $name ) {
			$existing_id = substr( $name, strlen( self::CAPTURE_PREFIX ) );
			$existing = self::capture_record( $existing_id );
			if ( $existing && $existing['componentId'] === $component_id && ( $existing['postId'] ?? 0 ) === $post_id && ( $existing['hash'] ?? '' ) === $hash ) {
				try {
					if ( hash_equals( $hash, hash( 'sha256', self::read_capture( $existing_id ) ) ) ) {
					self::touch_captures( [ $existing_id ], $component_id );
						self::schedule_cleanup();
					return $existing;
					}
				} catch ( \RuntimeException $error ) {
					// A broken old capture must not stop a fresh capture from repairing it.
				}
			}
		}
		$id = bin2hex( random_bytes( 16 ) );
		$nonce = random_bytes( 12 );
		$tag = '';
		$encrypted = openssl_encrypt( $bytes, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $nonce, $tag, $id );
		if ( $encrypted === false ) {
			throw new \RuntimeException( __( 'The source image could not be saved.', 'component-thumbnail-studio' ) );
		}
		$record = [ 'id' => $id, 'componentId' => $component_id, 'postId' => $post_id, 'width' => $width, 'height' => $height, 'created' => time(), 'lastUsed' => time(), 'hash' => $hash ];
		$path = self::directory( true ) . $id . '.cts';
		$payload = 'CTS1' . $nonce . $tag . $encrypted;
		if ( @file_put_contents( $path, $payload, LOCK_EX ) !== strlen( $payload ) ) {
			if ( is_file( $path ) ) {
				wp_delete_file( $path );
			}
			throw new \RuntimeException( __( 'The source image could not be saved.', 'component-thumbnail-studio' ) );
		}
		if ( ! add_option( self::CAPTURE_PREFIX . $id, $record, '', false ) ) {
			wp_delete_file( $path );
			throw new \RuntimeException( __( 'The source image could not be saved.', 'component-thumbnail-studio' ) );
		}
		self::schedule_cleanup();
		return $record;
	}

	public static function schedule_cleanup(): void {
		if ( wp_next_scheduled( 'ctstudio_cleanup' ) && wp_get_schedule( 'ctstudio_cleanup' ) !== 'hourly' ) {
			wp_clear_scheduled_hook( 'ctstudio_cleanup' );
		}
		if ( ! wp_next_scheduled( 'ctstudio_cleanup' ) ) {
			wp_schedule_event( time() + self::CAPTURE_GRACE, 'hourly', 'ctstudio_cleanup' );
		}
	}

	/** Refresh undo/redo sources without creating per-editor sessions or options. */
	public static function touch_captures( array $ids, string $component_id, bool $strict = true ): void {
		if ( count( $ids ) > self::MAX_RETAINED ) {
			throw new \InvalidArgumentException( __( 'Too many retained source images.', 'component-thumbnail-studio' ) );
		}
		foreach ( $ids as $id ) {
			if ( ! is_string( $id ) ) {
				throw new \InvalidArgumentException( __( 'The source image is unavailable.', 'component-thumbnail-studio' ) );
			}
		}
		foreach ( array_unique( $ids ) as $id ) {
			$record = self::capture_record( $id );
			if ( ! $record && ! $strict ) {
				continue;
			}
			if ( ! $record || $record['componentId'] !== $component_id ) {
				throw new \InvalidArgumentException( __( 'The source image is unavailable.', 'component-thumbnail-studio' ) );
			}
			if ( ! self::can_access_capture( $record ) ) {
				throw new \RuntimeException( __( 'You cannot access a source image from its original page.', 'component-thumbnail-studio' ), 403 );
			}
			if ( ( $record['lastUsed'] ?? $record['created'] ) > time() - 300 ) {
				continue;
			}
			$new = array_merge( $record, [ 'lastUsed' => time() ] );
			try {
				self::compare_exchange( self::CAPTURE_PREFIX . $id, $record, $new );
			} catch ( \RuntimeException $error ) {
				$latest = self::capture_record( $id );
				if ( ! $latest || $latest['componentId'] !== $component_id || ( $latest['lastUsed'] ?? 0 ) < $new['lastUsed'] ) {
					throw new \InvalidArgumentException( __( 'The source image is unavailable.', 'component-thumbnail-studio' ) );
				}
			}
		}
	}

	public static function read_capture( string $id ): string {
		$record = self::capture_record( $id );
		if ( ! $record ) {
			throw new \RuntimeException( __( 'The source image is missing. Capture it again.', 'component-thumbnail-studio' ), 404 );
		}
		if ( ! self::can_access_capture( $record ) ) {
			throw new \RuntimeException( __( 'You cannot access a source image from its original page.', 'component-thumbnail-studio' ), 403 );
		}
		$path = self::directory() . $id . '.cts';
		$data = is_file( $path ) && ! is_link( $path ) ? @file_get_contents( $path ) : false;
		if ( $data === false || strlen( $data ) < 33 || substr( $data, 0, 4 ) !== 'CTS1' ) {
			throw new \RuntimeException( __( 'The source image could not be opened.', 'component-thumbnail-studio' ), 404 );
		}
		$bytes = openssl_decrypt( substr( $data, 32 ), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr( $data, 4, 12 ), substr( $data, 16, 16 ), $id );
		if ( $bytes === false ) {
			throw new \RuntimeException( __( 'The source image could not be opened.', 'component-thumbnail-studio' ) );
		}
		return $bytes;
	}

	public static function option_names( string $prefix ): array {
		global $wpdb;
		return $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like( $prefix ) . '%' ) );
	}

	public static function delete_capture( string $id ): void {
		if ( ! self::capture_record( $id ) ) {
			return;
		}
		$path = self::directory() . $id . '.cts';
		if ( is_file( $path ) && ! is_link( $path ) ) {
			wp_delete_file( $path );
		}
		if ( ! file_exists( $path ) ) {
			delete_option( self::CAPTURE_PREFIX . $id );
		}
	}

	public static function cleanup(): void {
		global $wpdb;
		$used = [];
		foreach ( self::option_names( self::PROJECT_PREFIX ) as $name ) {
			$project = get_option( $name, [] );
			foreach ( $project['layers'] ?? [] as $layer ) {
				$used[ $layer['captureId'] ] = true;
			}
		}
		foreach ( self::option_names( self::CAPTURE_PREFIX ) as $name ) {
			if ( $name === 'ctstudio_capture_key' ) {
				continue;
			}
			$id = substr( $name, strlen( self::CAPTURE_PREFIX ) );
			$record = self::capture_record( $id );
			if ( $record && ! isset( $used[ $id ] ) && ( $record['lastUsed'] ?? $record['created'] ) < time() - self::CAPTURE_GRACE ) {
				// The conditional delete loses to a concurrent editor refreshing its source.
				$deleted = $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $name, maybe_serialize( $record ) ) );
				wp_cache_delete( $name, 'options' );
				if ( $deleted === 1 ) {
					$path = self::directory() . $id . '.cts';
					if ( is_file( $path ) && ! is_link( $path ) ) {
						wp_delete_file( $path );
					}
				}
			}
		}
		self::cleanup_orphan_files( false );
		Images::cleanup();
	}

	private static function cleanup_orphan_files( bool $uninstall ): void {
		$uploads = wp_upload_dir();
		$dir = trailingslashit( $uploads['basedir'] ) . 'ctstudio-captures';
		if ( ! is_dir( $dir ) || ! is_readable( $dir ) || is_link( $dir ) ) {
			return;
		}
		foreach ( new \DirectoryIterator( $dir ) as $entry ) {
			if ( $entry->isLink() || ! $entry->isFile() || ! preg_match( '/^([a-f0-9]{32})\.cts$/D', $entry->getFilename(), $match ) || ( ! $uninstall && ( self::capture_record( $match[1] ) || $entry->getMTime() > time() - self::CAPTURE_GRACE ) ) ) {
				continue;
			}
			$header = @file_get_contents( $entry->getPathname(), false, null, 0, 4 );
			if ( $header === 'CTS1' ) {
				wp_delete_file( $entry->getPathname() );
			}
		}
	}

	public static function uninstall_site(): void {
		wp_clear_scheduled_hook( 'ctstudio_cleanup' );
		foreach ( self::option_names( self::CAPTURE_PREFIX ) as $name ) {
			$id = substr( $name, strlen( self::CAPTURE_PREFIX ) );
			if ( preg_match( '/^[a-f0-9]{32}$/D', $id ) ) {
				self::delete_capture( $id );
			}
		}
		foreach ( self::option_names( self::PROJECT_PREFIX ) as $name ) {
			delete_option( $name );
		}
		delete_option( 'ctstudio_capture_key' );
		self::cleanup_orphan_files( true );
		Images::uninstall();
		$uploads = wp_upload_dir();
		$dir = trailingslashit( $uploads['basedir'] ) . 'ctstudio-captures';
		if ( is_dir( $dir ) && ! is_link( $dir ) && count( array_diff( scandir( $dir ), [ '.', '..' ] ) ) === 0 ) {
			@rmdir( $dir );
		}
	}
}
