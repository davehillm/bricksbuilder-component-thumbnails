<?php
namespace ComponentThumbnailStudio;

defined( 'ABSPATH' ) || exit;

/** Owns finished attachments; never changes an unrelated Media Library item. */
final class Images {
	public const OWNER_META = '_ctstudio_component';
	public const TITLE_META = '_ctstudio_title';

	public static function owned( int $attachment_id, string $component_id ): bool {
		return $attachment_id > 0 && get_post_type( $attachment_id ) === 'attachment' && get_post_meta( $attachment_id, self::OWNER_META, true ) === $component_id;
	}

	public static function create( string $component_id, string $bytes ): array {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$tmp = wp_tempnam( 'ctstudio.png' );
		$encoded_path = '';
		$attachment_id = 0;
		$complete = false;
		try {
			if ( ! $tmp || @file_put_contents( $tmp, $bytes, LOCK_EX ) !== strlen( $bytes ) ) {
				throw new \RuntimeException( __( 'The finished image could not be saved.', 'component-thumbnail-studio' ) );
			}
			$editor = wp_get_image_editor( $tmp );
			if ( is_wp_error( $editor ) ) {
				throw new \RuntimeException( __( 'The server could not process the image.', 'component-thumbnail-studio' ) );
			}
			$mime = wp_image_editor_supports( [ 'mime_type' => 'image/webp' ] ) ? 'image/webp' : 'image/png';
			$editor->set_quality( 94 );
			$extension = $mime === 'image/webp' ? 'webp' : 'png';
			$encoded = $editor->save( $tmp . '.' . $extension, $mime );
			if ( is_wp_error( $encoded ) || ! is_array( $encoded ) || empty( $encoded['path'] ) ) {
				throw new \RuntimeException( __( 'The server could not encode the thumbnail.', 'component-thumbnail-studio' ) );
			}
			$encoded_path = $encoded['path'];
			$labels = array_column( ComponentStore::summaries(), 'label', 'id' );
			$title = sprintf( __( 'Component thumbnail: %s', 'component-thumbnail-studio' ), $labels[ $component_id ] ?? $component_id );
			// Bricks uses the finished image directly, so derivative sizes serve no purpose.
			// This temporary filter is scoped to the newly marked attachment and always removed.
			$sizes_filter = static function ( $sizes, $metadata, $id ) use ( $component_id ) {
				return self::owned( (int) $id, $component_id ) ? [] : $sizes;
			};
			add_filter( 'intermediate_image_sizes_advanced', $sizes_filter, 100, 3 );
			try {
				$result = media_handle_sideload(
					[ 'name' => 'component-thumbnail-' . $component_id . '-' . wp_generate_uuid4() . '.' . $extension, 'tmp_name' => $encoded_path ],
					0,
					null,
					[ 'post_title' => $title, 'meta_input' => [ self::OWNER_META => $component_id, self::TITLE_META => $title ] ]
				);
			} finally {
				remove_filter( 'intermediate_image_sizes_advanced', $sizes_filter, 100 );
			}
			if ( is_wp_error( $result ) ) {
				throw new \RuntimeException( __( 'The thumbnail could not be added to the Media Library.', 'component-thumbnail-studio' ) );
			}
			$attachment_id = (int) $result;
			$url = wp_get_attachment_url( $attachment_id );
			if ( ! $url || ! get_attached_file( $attachment_id ) || ! self::owned( $attachment_id, $component_id ) ) {
				throw new \RuntimeException( __( 'The saved image could not be verified.', 'component-thumbnail-studio' ) );
			}
			Storage::schedule_cleanup();
			$complete = true;
			return [ 'attachmentId' => $attachment_id, 'fileUrl' => $url ];
		} finally {
			foreach ( [ $tmp, $encoded_path ] as $path ) {
				if ( $path && is_file( $path ) ) {
					wp_delete_file( $path );
				}
			}
			if ( ! $complete && $attachment_id > 0 ) {
				wp_delete_attachment( $attachment_id, true );
			}
		}
	}

	public static function referenced( int $id, string $url ): bool {
		global $wpdb;
		$file = basename( (string) get_attached_file( $id ) );
		if ( ! $file || ! $url ) {
			return true;
		}
		// Structured numeric boundaries avoid treating timestamps/hash fragments as IDs.
		$pattern = '(^|[[:space:]:,;\[\]"\'=])' . $id . '([[:space:]:,;\[\]"\'}]|$)|wp-image-' . $id . '([^0-9]|$)';
		$urls = array_unique( [ $url, preg_replace( '/[?#].*$/', '', $url ) ] );
		$needles = [ $file ];
		foreach ( $urls as $value ) {
			$needles[] = $value;
			$needles[] = str_replace( '/', '\\/', $value );
		}
		$tables = [
			[ $wpdb->posts, [ 'post_content', 'post_excerpt' ], 'ID <> %d', [ $id ] ],
			[ $wpdb->postmeta, [ 'meta_value' ], 'post_id <> %d', [ $id ] ],
			[ $wpdb->options, [ 'option_value' ], 'option_name NOT LIKE %s', [ $wpdb->esc_like( 'ctstudio_' ) . '%' ] ],
			[ $wpdb->termmeta, [ 'meta_value' ], '1=1', [] ],
			[ $wpdb->usermeta, [ 'meta_value' ], '1=1', [] ],
			[ $wpdb->commentmeta, [ 'meta_value' ], '1=1', [] ],
		];
		foreach ( $tables as [ $table, $columns, $exclude, $arguments ] ) {
			$clauses = [];
			foreach ( $columns as $column ) {
				foreach ( array_unique( $needles ) as $needle ) {
					$clauses[] = "$column LIKE %s";
					$arguments[] = '%' . $wpdb->esc_like( $needle ) . '%';
				}
				$clauses[] = "$column REGEXP %s";
				$arguments[] = $pattern;
			}
			// Table and column identifiers above are fixed WordPress identifiers, never input.
			$query = $wpdb->prepare( "SELECT 1 FROM $table WHERE $exclude AND (" . implode( ' OR ', $clauses ) . ') LIMIT 1', ...$arguments );
			if ( $wpdb->get_var( $query ) || $wpdb->last_error ) {
				return true; // A failed scan is not proof that an image is unused.
			}
		}
		// Integrations storing references in custom tables can veto retirement.
		return (bool) apply_filters( 'ctstudio_attachment_is_referenced', false, $id );
	}

	public static function cleanup( ?string $component_id = null, array $retired = [] ): void {
		$current = [];
		foreach ( Storage::option_names( Storage::PROJECT_PREFIX ) as $name ) {
			$current[] = (int) ( get_option( $name, [] )['attachmentId'] ?? 0 );
		}
		$args = [ 'post_type' => 'attachment', 'post_status' => 'inherit', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => self::OWNER_META ];
		if ( $component_id !== null ) {
			$args['meta_value'] = $component_id;
		}
		foreach ( get_posts( $args ) as $id ) {
			if ( in_array( (int) $id, $current, true ) ) {
				continue;
			}
			$post = get_post( $id );
			if ( $post && ! in_array( (int) $id, $retired, true ) && strtotime( $post->post_date_gmt . ' UTC' ) > time() - 600 ) {
				continue; // Another request may still be committing this fresh attachment.
			}
			if ( ! $post || $post->post_parent || $post->post_content || $post->post_excerpt || get_post_meta( $id, '_wp_attachment_image_alt', true ) || get_post_meta( $id, '_wp_attachment_backup_sizes', true ) || $post->post_title !== get_post_meta( $id, self::TITLE_META, true ) ) {
				self::release( $id );
				continue;
			}
			if ( ! self::referenced( $id, (string) wp_get_attachment_url( $id ) ) ) {
				wp_delete_attachment( $id, true );
			}
		}
	}

	private static function release( int $id ): void {
		delete_post_meta( $id, self::OWNER_META );
		delete_post_meta( $id, self::TITLE_META );
	}

	public static function uninstall(): void {
		delete_metadata( 'post', 0, self::OWNER_META, '', true );
		delete_metadata( 'post', 0, self::TITLE_META, '', true );
	}
}
