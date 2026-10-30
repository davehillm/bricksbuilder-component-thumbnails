<?php
namespace ComponentThumbnailStudio;

defined( 'ABSPATH' ) || exit;

final class Plugin {
	public static function boot(): void {
		add_action( 'ctstudio_cleanup', [ Storage::class, 'cleanup' ] );
		foreach ( [ 'load', 'upload_capture', 'copy_capture', 'capture_data', 'save', 'apply', 'release' ] as $operation ) {
			add_action( 'wp_ajax_ctstudio_' . $operation, static function () use ( $operation ) {
				self::dispatch( $operation );
			} );
		}
		add_action( 'wp_enqueue_scripts', [ self::class, 'enqueue' ], 50 );
		if ( defined( 'BRICKS_DB_COMPONENTS' ) ) {
			add_filter( 'pre_update_option_' . BRICKS_DB_COMPONENTS, [ ComponentStore::class, 'protect_builder_save' ], 50, 2 );
			add_action( 'update_option_' . BRICKS_DB_COMPONENTS, [ ComponentStore::class, 'observe_change' ], 50, 2 );
			add_action( 'wp_ajax_bricks_save_component_screenshot', [ self::class, 'protect_screenshot' ], 0 );
		}
	}

	public static function enqueue(): void {
		if ( ! function_exists( 'bricks_is_builder_main' ) || ! bricks_is_builder_main() || ! class_exists( '\Bricks\Builder_Permissions' ) || ! \Bricks\Builder_Permissions::user_has_permission( 'edit_components' ) || ! current_user_can( 'upload_files' ) ) {
			return;
		}
		$path = dirname( FILE ) . '/assets/editor.js';
		if ( ! is_readable( $path ) ) {
			return;
		}
		wp_enqueue_script( 'ctstudio-editor', plugins_url( 'assets/editor.js', FILE ), [ 'bricks-builder' ], (string) filemtime( $path ), true );
		$config = [
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'ctstudio-editor' ),
			'postId' => get_queried_object_id(),
			'bricksVersion' => defined( 'BRICKS_VERSION' ) ? BRICKS_VERSION : '',
			'components' => ComponentStore::summaries(),
			'screenshotsEnabled' => (bool) \Bricks\Database::get_setting( 'generateComponentScreenshots', false ),
			'strings' => self::strings(),
		];
		wp_add_inline_script( 'ctstudio-editor', 'window.ctstudioConfig=' . wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';', 'before' );
	}

	private static function strings(): array {
		return [
			'Preset' => __( 'Preset', 'component-thumbnail-studio' ),
			'None' => __( 'None', 'component-thumbnail-studio' ),
			'Soft shadow' => __( 'Soft shadow', 'component-thumbnail-studio' ),
			'Floating' => __( 'Floating', 'component-thumbnail-studio' ),
			'Outline' => __( 'Outline', 'component-thumbnail-studio' ),
			'Rounded outline' => __( 'Rounded outline', 'component-thumbnail-studio' ),
			'Custom' => __( 'Custom', 'component-thumbnail-studio' ),
			'Shadow' => __( 'Shadow', 'component-thumbnail-studio' ),
			'Horizontal' => __( 'Horizontal', 'component-thumbnail-studio' ),
			'Vertical' => __( 'Vertical', 'component-thumbnail-studio' ),
			'Blur' => __( 'Blur', 'component-thumbnail-studio' ),
			'Spread' => __( 'Spread', 'component-thumbnail-studio' ),
			'Opacity' => __( 'Opacity', 'component-thumbnail-studio' ),
			'Shadow color' => __( 'Shadow color', 'component-thumbnail-studio' ),
			'Shadow hex' => __( 'Shadow hex', 'component-thumbnail-studio' ),
			'Image style' => __( 'Image style', 'component-thumbnail-studio' ),
			'Border width' => __( 'Border width', 'component-thumbnail-studio' ),
			'Corner radius' => __( 'Corner radius', 'component-thumbnail-studio' ),
			'Border color' => __( 'Border color', 'component-thumbnail-studio' ),
			'Border hex' => __( 'Border hex', 'component-thumbnail-studio' ),
			'Some captures belong to pages you cannot edit. Add a capture to start a new composition.' => __( 'Some captures belong to pages you cannot edit. Add a capture to start a new composition.', 'component-thumbnail-studio' ),
			'The request timed out.' => __( 'The request timed out.', 'component-thumbnail-studio' ),
			'Your editor session expired. Reload Bricks to continue.' => __( 'Your editor session expired. Reload Bricks to continue.', 'component-thumbnail-studio' ),
			'A source image could not be loaded. Reopen the thumbnail or capture it again.' => __( 'A source image could not be loaded. Reopen the thumbnail or capture it again.', 'component-thumbnail-studio' ),
			'A source image is missing. Reopen the thumbnail.' => __( 'A source image is missing. Reopen the thumbnail.', 'component-thumbnail-studio' ),
			'A thumbnail can contain up to 12 images.' => __( 'A thumbnail can contain up to 12 images.', 'component-thumbnail-studio' ),
			'Add capture' => __( 'Add capture', 'component-thumbnail-studio' ),
			'An image could not be captured. Check that its server allows image access.' => __( 'An image could not be captured. Check that its server allows image access.', 'component-thumbnail-studio' ),
			'Applied' => __( 'Applied', 'component-thumbnail-studio' ),
			'Apply' => __( 'Apply', 'component-thumbnail-studio' ),
			'Automatic capture is unavailable in this Bricks version.' => __( 'Automatic capture is unavailable in this Bricks version.', 'component-thumbnail-studio' ),
			'Background color' => __( 'Background color', 'component-thumbnail-studio' ),
			'Background hex' => __( 'Background hex', 'component-thumbnail-studio' ),
			'Bring forward' => __( 'Bring forward', 'component-thumbnail-studio' ),
			'Cancel capture' => __( 'Cancel capture', 'component-thumbnail-studio' ),
			'Capture a component to begin.' => __( 'Capture a component to begin.', 'component-thumbnail-studio' ),
			'Capture selected component' => __( 'Capture selected component', 'component-thumbnail-studio' ),
			'Capture thumbnail' => __( 'Capture thumbnail', 'component-thumbnail-studio' ),
			'Capture timed out. Try again after the component has loaded.' => __( 'Capture timed out. Try again after the component has loaded.', 'component-thumbnail-studio' ),
			'Capturing…' => __( 'Capturing…', 'component-thumbnail-studio' ),
			'Center image' => __( 'Center image', 'component-thumbnail-studio' ),
			'Close' => __( 'Close', 'component-thumbnail-studio' ),
			'Component' => __( 'Component', 'component-thumbnail-studio' ),
			'Edit thumbnail' => __( 'Edit thumbnail', 'component-thumbnail-studio' ),
			'Enable component screenshots in Bricks settings to display thumbnails.' => __( 'Enable component screenshots in Bricks settings to display thumbnails.', 'component-thumbnail-studio' ),
			'Fit image' => __( 'Fit image', 'component-thumbnail-studio' ),
			'Fullscreen' => __( 'Fullscreen', 'component-thumbnail-studio' ),
			'Image %d' => __( 'Image %d', 'component-thumbnail-studio' ),
			'Loading…' => __( 'Loading…', 'component-thumbnail-studio' ),
			'More actions' => __( 'More actions', 'component-thumbnail-studio' ),
			'The selected component is not visible in the Bricks canvas. Make it visible and try again.' => __( 'The selected component is not visible in the Bricks canvas. Make it visible and try again.', 'component-thumbnail-studio' ),
			'No component selected.' => __( 'No component selected.', 'component-thumbnail-studio' ),
			'No components found.' => __( 'No components found.', 'component-thumbnail-studio' ),
			'Redo' => __( 'Redo', 'component-thumbnail-studio' ),
			'Reload latest' => __( 'Reload latest', 'component-thumbnail-studio' ),
			'Remove image' => __( 'Remove image', 'component-thumbnail-studio' ),
			'Resize image' => __( 'Resize image', 'component-thumbnail-studio' ),
			'Saved' => __( 'Saved', 'component-thumbnail-studio' ),
			'Saving…' => __( 'Saving…', 'component-thumbnail-studio' ),
			'Select image %d' => __( 'Select image %d', 'component-thumbnail-studio' ),
			'Send backward' => __( 'Send backward', 'component-thumbnail-studio' ),
			'The Bricks canvas is unavailable.' => __( 'The Bricks canvas is unavailable.', 'component-thumbnail-studio' ),
			'The image could not be created.' => __( 'The image could not be created.', 'component-thumbnail-studio' ),
			'The server could not be reached. Your arrangement is still open. Try again.' => __( 'The server could not be reached. Your arrangement is still open. Try again.', 'component-thumbnail-studio' ),
			'The thumbnail canvas is unavailable.' => __( 'The thumbnail canvas is unavailable.', 'component-thumbnail-studio' ),
			'The thumbnail could not be saved. Try again.' => __( 'The thumbnail could not be saved. Try again.', 'component-thumbnail-studio' ),
			'This component is too large to capture. Try a narrower breakpoint.' => __( 'This component is too large to capture. Try a narrower breakpoint.', 'component-thumbnail-studio' ),
			'This video needs a poster image before it can be captured.' => __( 'This video needs a poster image before it can be captured.', 'component-thumbnail-studio' ),
			'Thumbnail' => __( 'Thumbnail', 'component-thumbnail-studio' ),
			'Thumbnail canvas' => __( 'Thumbnail canvas', 'component-thumbnail-studio' ),
			'Thumbnail images' => __( 'Thumbnail images', 'component-thumbnail-studio' ),
			'Undo' => __( 'Undo', 'component-thumbnail-studio' ),
			'Use automatic thumbnail' => __( 'Use automatic thumbnail', 'component-thumbnail-studio' ),
		];
	}

	private static function authorize(): string {
		check_ajax_referer( 'ctstudio-editor', 'nonce' );
		$post_id = absint( $_POST['postId'] ?? 0 );
		$id = isset( $_POST['componentId'] ) ? sanitize_text_field( wp_unslash( $_POST['componentId'] ) ) : '';
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) || ! current_user_can( 'upload_files' ) || ! class_exists( '\Bricks\Builder_Permissions' ) || ! \Bricks\Builder_Permissions::user_has_permission( 'edit_components' ) || ! \Bricks\Capabilities::current_user_can_use_builder( $post_id ) ) {
			throw new \RuntimeException( __( 'You do not have permission to edit component thumbnails.', 'component-thumbnail-studio' ), 403 );
		}
		if ( ! preg_match( '/^[a-zA-Z0-9_-]{1,64}$/D', $id ) || ! ComponentStore::get( $id ) ) {
			throw new \RuntimeException( __( 'The component is unavailable.', 'component-thumbnail-studio' ), 404 );
		}
		return $id;
	}

	private static function uploaded_bytes( string $field ): string {
		$file = $_FILES[ $field ] ?? null;
		if ( ! is_array( $file ) || ( $file['error'] ?? UPLOAD_ERR_NO_FILE ) !== UPLOAD_ERR_OK || ! is_string( $file['tmp_name'] ?? null ) || ! is_int( $file['size'] ?? null ) || $file['size'] < 1 || $file['size'] > 5 * 1024 * 1024 || ! is_uploaded_file( $file['tmp_name'] ) || filesize( $file['tmp_name'] ) > 5 * 1024 * 1024 ) {
			throw new \InvalidArgumentException( __( 'The image upload failed. Try again with an image smaller than 5 MB.', 'component-thumbnail-studio' ) );
		}
		$bytes = @file_get_contents( $file['tmp_name'] );
		if ( $bytes === false ) {
			throw new \RuntimeException( __( 'The uploaded image could not be read.', 'component-thumbnail-studio' ) );
		}
		return $bytes;
	}

	public static function dispatch( string $operation ): void {
		try {
			$id = self::authorize();
			if ( in_array( $operation, [ 'load', 'save' ], true ) && isset( $_POST['captureIds'] ) ) {
				if ( ! is_string( $_POST['captureIds'] ) ) {
					throw new \InvalidArgumentException( __( 'The source image list is invalid.', 'component-thumbnail-studio' ) );
				}
				$ids = json_decode( wp_unslash( $_POST['captureIds'] ), true, 4, JSON_THROW_ON_ERROR );
				if ( ! is_array( $ids ) || ! array_is_list( $ids ) ) {
					throw new \InvalidArgumentException( __( 'The source image list is invalid.', 'component-thumbnail-studio' ) );
				}
				Storage::touch_captures( $ids, $id, false );
			}
			if ( $operation === 'capture_data' ) {
				$capture_id = sanitize_text_field( wp_unslash( $_POST['captureId'] ?? '' ) );
				$record = Storage::capture_record( $capture_id );
				if ( ! $record || $record['componentId'] !== $id ) {
					throw new \RuntimeException( __( 'The source image is unavailable.', 'component-thumbnail-studio' ), 404 );
				}
				$bytes = Storage::read_capture( $capture_id );
				nocache_headers();
				header( 'Content-Type: image/png' );
				header( 'X-Content-Type-Options: nosniff' );
				echo $bytes;
				exit;
			}
			if ( $operation === 'upload_capture' ) {
				wp_send_json_success( Storage::save_capture( $id, self::uploaded_bytes( 'image' ), absint( $_POST['postId'] ) ) );
			}
			if ( $operation === 'copy_capture' ) {
				$source_id = sanitize_text_field( wp_unslash( $_POST['sourceComponentId'] ?? '' ) );
				$capture_id = sanitize_text_field( wp_unslash( $_POST['captureId'] ?? '' ) );
				$source = Storage::capture_record( $capture_id );
				if ( ! $source || $source['componentId'] !== $source_id || ! ComponentStore::get( $source_id ) ) {
					throw new \InvalidArgumentException( __( 'The source image is unavailable.', 'component-thumbnail-studio' ) );
				}
				// read_capture checks the original page permission; copying preserves that provenance.
				wp_send_json_success( Storage::save_capture( $id, Storage::read_capture( $capture_id ), (int) $source['postId'] ) );
			}
			if ( $operation === 'load' ) {
				$project = Storage::project( $id );
				$count = count( $project['layers'] );
				$project['layers'] = array_values( array_filter( $project['layers'], static function ( $layer ) {
					$source = Storage::capture_record( $layer['captureId'] );
					return ! $source || Storage::can_access_capture( $source );
				} ) );
				wp_send_json_success( [ 'project' => $project, 'restrictedSources' => count( $project['layers'] ) !== $count ] );
			}
			$expected = filter_var( $_POST['revision'] ?? null, FILTER_VALIDATE_INT, [ 'options' => [ 'min_range' => 0 ] ] );
			if ( $expected === false ) {
				throw new \InvalidArgumentException( __( 'The thumbnail revision is invalid.', 'component-thumbnail-studio' ) );
			}
			if ( $operation === 'release' ) {
				$project = Storage::save_project( $id, [ 'appliedUrl' => '', 'appliedUpdated' => 0 ], $expected );
				wp_send_json_success( [ 'project' => $project ] );
			}
			if ( ! is_string( $_POST['recipe'] ?? null ) ) {
				throw new \InvalidArgumentException( __( 'The thumbnail arrangement is invalid.', 'component-thumbnail-studio' ) );
			}
			$input = json_decode( wp_unslash( $_POST['recipe'] ), true, 32, JSON_THROW_ON_ERROR );
			if ( ! is_array( $input ) ) {
				throw new \InvalidArgumentException( __( 'The thumbnail arrangement is invalid.', 'component-thumbnail-studio' ) );
			}
			$recipe = Storage::normalize_recipe( $input, $id );
			if ( $operation === 'save' ) {
				wp_send_json_success( [ 'project' => Storage::save_project( $id, $recipe, $expected ) ] );
			}
			if ( $operation === 'apply' ) {
				if ( ! $recipe['layers'] ) {
					throw new \InvalidArgumentException( __( 'Add an image before applying the thumbnail.', 'component-thumbnail-studio' ) );
				}
				if ( Storage::project( $id )['revision'] !== $expected ) {
					throw new \RuntimeException( __( 'This thumbnail changed in another window. Reopen it to continue.', 'component-thumbnail-studio' ), 409 );
				}
				$bytes = self::uploaded_bytes( 'image' );
				Storage::validate_png( $bytes, true );
				$result = self::apply( $id, $recipe, $expected, $bytes );
				wp_send_json_success( $result );
			}
			throw new \InvalidArgumentException( __( 'The thumbnail action is unavailable.', 'component-thumbnail-studio' ) );
		} catch ( \Throwable $error ) {
			$code = in_array( $error->getCode(), [ 403, 404, 409 ], true ) ? $error->getCode() : ( $error instanceof \InvalidArgumentException || $error instanceof \JsonException ? 400 : 500 );
			$message = $code === 500 ? __( 'The thumbnail action failed. Your previous preview is unchanged. Try again.', 'component-thumbnail-studio' ) : $error->getMessage();
			wp_send_json_error( [ 'message' => $message ], $code );
		}
	}

	private static function apply( string $id, array $recipe, int $expected, string $bytes ): array {
		$previous = Storage::project( $id );
		$hash = hash( 'sha256', $bytes );
		$attachment_id = (int) $previous['attachmentId'];
		$new_image = false;
		$assigned = false;
		try {
			if ( $previous['imageHash'] !== $hash || ! Images::owned( $attachment_id, $id ) || get_post_meta( $attachment_id, '_wp_attachment_backup_sizes', true ) || ! is_file( (string) get_attached_file( $attachment_id ) ) || ! wp_get_attachment_url( $attachment_id ) ) {
				$image = Images::create( $id, $bytes );
				$attachment_id = $image['attachmentId'];
				$new_image = true;
			}
			$url = wp_get_attachment_url( $attachment_id );
			$native = ComponentStore::get( $id );
			$updated = ! $new_image && ( $native['thumbnail'] ?? '' ) === $url ? (int) ( $native['thumbnailUpdated'] ?? 0 ) : time();
			$project = Storage::save_project( $id, array_merge( $recipe, [ 'appliedUrl' => $url, 'appliedUpdated' => $updated, 'attachmentId' => $attachment_id, 'imageHash' => $hash ] ), $expected );
			try {
				if ( ( $native['thumbnail'] ?? '' ) !== $url || ( $native['thumbnailUpdated'] ?? 0 ) !== $updated ) {
					ComponentStore::write_thumbnail( $id, $url, $updated );
				}
			} catch ( \Throwable $error ) {
				// Restore only assignment metadata; a newer arrangement belongs to its editor.
				for ( $attempt = 0; $attempt < 2; $attempt++ ) {
					$latest = Storage::project( $id );
					if ( $latest['appliedUrl'] !== $url || $latest['attachmentId'] !== $attachment_id ) {
						break;
					}
					try {
						$restore = array_intersect_key( $previous, array_flip( [ 'appliedUrl', 'appliedUpdated', 'attachmentId', 'imageHash' ] ) );
						Storage::save_project( $id, $restore, $latest['revision'] );
						break;
					} catch ( \RuntimeException $conflict ) {
						// Retry against the latest revision, never replace another editor's recipe.
					}
				}
				throw $error;
			}
			$assigned = true;
			// Cleanup is best-effort after commit; failure must not misreport a successful Apply.
			try {
				Images::cleanup( $id, [ (int) $previous['attachmentId'] ] );
			} catch ( \Throwable $cleanup_error ) {
				// The existing hourly cleanup retries owned, unreferenced outputs.
			}
			return [ 'project' => $project, 'fileUrl' => $url, 'updated' => $updated, 'attachmentId' => $attachment_id ];
		} finally {
			if ( ! $assigned && $new_image && $attachment_id > 0 ) {
				wp_delete_attachment( $attachment_id, true );
			}
		}
	}

	public static function protect_screenshot(): void {
		$id = isset( $_POST['componentId'] ) ? sanitize_text_field( wp_unslash( $_POST['componentId'] ) ) : '';
		$project = Storage::project( $id );
		if ( ! $project['appliedUrl'] || ( ComponentStore::get( $id )['thumbnail'] ?? '' ) !== $project['appliedUrl'] ) {
			return;
		}
		\Bricks\Ajax::verify_request( 'bricks-nonce-builder' );
		$post_id = absint( $_POST['postId'] ?? 0 );
		if ( ! $post_id || ! current_user_can( 'upload_files' ) || ! \Bricks\Builder_Permissions::user_has_permission( 'edit_components' ) || ! \Bricks\Capabilities::current_user_can_use_builder( $post_id ) ) {
			wp_send_json_error( [ 'message' => __( 'No permission.', 'component-thumbnail-studio' ) ], 403 );
		}
		wp_send_json_success( [ 'file_url' => $project['appliedUrl'], 'updated' => $project['appliedUpdated'] ] );
	}
}
