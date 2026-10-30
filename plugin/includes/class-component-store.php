<?php
namespace ComponentThumbnailStudio;

defined( 'ABSPATH' ) || exit;

final class ComponentStore {
	public static bool $writing = false;

	public static function all(): array {
		$items = defined( 'BRICKS_DB_COMPONENTS' ) ? get_option( BRICKS_DB_COMPONENTS, [] ) : [];
		return is_array( $items ) ? $items : [];
	}

	public static function get( string $id ): ?array {
		foreach ( self::all() as $item ) {
			if ( ( $item['id'] ?? '' ) === $id ) {
				return $item;
			}
		}
		return null;
	}

	public static function summaries(): array {
		return array_map( static function ( array $item ): array {
			$root = $item['elements'][0] ?? [];
			foreach ( $item['elements'] ?? [] as $element ) {
				if ( ( $element['id'] ?? '' ) === $item['id'] ) {
					$root = $element;
					break;
				}
			}
			return [ 'id' => $item['id'], 'label' => wp_strip_all_tags( $root['label'] ?? $item['label'] ?? $item['id'] ), 'thumbnail' => $item['thumbnail'] ?? '' ];
		}, self::all() );
	}

	public static function write_thumbnail( string $id, string $url, int $updated ): void {
		global $wpdb;
		if ( ! defined( 'BRICKS_DB_COMPONENTS' ) ) {
			throw new \RuntimeException( __( 'Bricks components are unavailable.', 'component-thumbnail-studio' ) );
		}
		$name = BRICKS_DB_COMPONENTS;
		$wpdb->query( 'START TRANSACTION' );
		self::$writing = true;
		try {
			$raw = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s FOR UPDATE", $name ) );
			$items = maybe_unserialize( $raw );
			$found = false;
			if ( ! is_array( $items ) ) {
				throw new \RuntimeException( __( 'Bricks components could not be read.', 'component-thumbnail-studio' ) );
			}
			foreach ( $items as &$item ) {
				if ( ( $item['id'] ?? '' ) === $id ) {
					$item['thumbnail'] = esc_url_raw( $url );
					$item['thumbnailUpdated'] = $updated;
					$found = true;
					break;
				}
			}
			unset( $item );
			if ( ! $found ) {
				throw new \RuntimeException( __( 'The component was removed. Choose another component.', 'component-thumbnail-studio' ), 404 );
			}
			wp_cache_delete( $name, 'options' );
			wp_cache_delete( 'alloptions', 'options' );
			update_option( $name, $items );
			$actual = maybe_unserialize( $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $name ) ) );
			if ( $actual !== $items ) {
				throw new \RuntimeException( __( 'The thumbnail could not be assigned. The previous preview is unchanged.', 'component-thumbnail-studio' ) );
			}
			$wpdb->query( 'COMMIT' );
		} catch ( \Throwable $error ) {
			$wpdb->query( 'ROLLBACK' );
			throw $error;
		} finally {
			self::$writing = false;
			wp_cache_delete( $name, 'options' );
			wp_cache_delete( 'alloptions', 'options' );
		}
	}

	public static function protect_builder_save( $incoming, $old ) {
		$action = isset( $_REQUEST['action'] ) ? sanitize_key( wp_unslash( $_REQUEST['action'] ) ) : '';
		if ( $action !== 'bricks_save_post' || ! is_array( $incoming ) || ! is_array( $old ) ) {
			return $incoming;
		}
		$old_by_id = array_column( $old, null, 'id' );
		foreach ( $incoming as &$item ) {
			$id = $item['id'] ?? '';
			$project = Storage::project( $id );
			if ( $project['appliedUrl'] && ( $old_by_id[ $id ]['thumbnail'] ?? '' ) === $project['appliedUrl'] ) {
				$item['thumbnail'] = $project['appliedUrl'];
				$item['thumbnailUpdated'] = $project['appliedUpdated'];
			}
		}
		unset( $item );
		return $incoming;
	}

	public static function observe_change( $old, $new ): void {
		if ( self::$writing || ! is_array( $new ) ) {
			return;
		}
		$by_id = array_column( $new, null, 'id' );
		foreach ( is_array( $old ) ? $old : [] as $previous ) {
			$id = $previous['id'] ?? '';
			if ( ! isset( $by_id[ $id ] ) ) {
				delete_option( Storage::PROJECT_PREFIX . $id );
				continue;
			}
			$project = Storage::project( $id );
			if ( $project['appliedUrl'] && ( $by_id[ $id ]['thumbnail'] ?? '' ) !== $project['appliedUrl'] ) {
				$project['appliedUrl'] = '';
				$project['appliedUpdated'] = 0;
				$project['revision']++;
				update_option( Storage::PROJECT_PREFIX . $id, $project, false );
			}
		}
	}
}
