<?php
namespace Bricks {
	class Builder_Permissions { public static function user_has_permission( $key ) { return $GLOBALS['allowed']; } }
	class Capabilities { public static function current_user_can_use_builder( $id ) { return $GLOBALS['allowed']; } }
}
namespace {
	define( 'ABSPATH', sys_get_temp_dir() . '/ctstudio-unit-' . getmypid() . '/' );
	define( 'BRICKS_DB_COMPONENTS', 'bricks_components' );
	define( 'DAY_IN_SECONDS', 86400 );
	foreach ( [ 'options'=>[], 'allowed'=>true, 'nonce_ok'=>true, 'fail_update'=>false, 'attachments'=>[], 'postmeta'=>[], 'filters'=>[], 'references'=>[], 'next_attachment'=>4000, 'image_encode_fail'=>false, 'media_fail'=>false, 'deleted_attachments'=>[], 'scheduled'=>false ] as $key=>$value ) $GLOBALS[$key]=$value;
	foreach ( ['wp-admin/includes','uploads','scratch'] as $directory ) mkdir(ABSPATH.$directory,0777,true);
	foreach ( ['file','media','image'] as $file ) file_put_contents(ABSPATH.'wp-admin/includes/'.$file.'.php','<?php');
	class WP_Error {}
	function is_wp_error($value){return $value instanceof WP_Error;}
	function __( $text, $domain = '' ) { return $text; }
	function get_option( $key, $default = false ) { return $GLOBALS['options'][$key] ?? $default; }
	function add_option( $key, $value, $deprecated = '', $autoload = false ) { if ( array_key_exists($key,$GLOBALS['options']) ) return false; $GLOBALS['options'][$key]=$value; return true; }
	function update_option( $key, $value, $autoload = null ) { if ($GLOBALS['fail_update']) return false; $GLOBALS['options'][$key]=$value; return true; }
	function delete_option( $key ) { unset($GLOBALS['options'][$key]); }
	function maybe_serialize( $value ) { return serialize($value); }
	function maybe_unserialize( $value ) { return is_string($value)?unserialize($value):$value; }
	function wp_cache_delete( ...$args ) {$GLOBALS['cache_deletes'][]=$args;}
	function wp_strip_all_tags( $value ) { return strip_tags($value); }
	function sanitize_key( $value ) { return preg_replace('/[^a-z0-9_-]/','',strtolower($value)); }
	function sanitize_text_field( $value ) { return is_string($value)?strip_tags($value):''; }
	function wp_unslash( $value ) { return $value; }
	function esc_url_raw( $value ) { return $value; }
	function absint( $value ) { return abs((int)$value); }
	function current_user_can( ...$args ) { return $GLOBALS['allowed'] && !(($args[0]??'')==='edit_post' && in_array($args[1]??0,$GLOBALS['denied_posts']??[],true)); }
	function check_ajax_referer( ...$args ) { if (!$GLOBALS['nonce_ok']) throw new \RuntimeException('nonce rejected',403); }
	function wp_upload_dir() { return ['basedir'=>ABSPATH.'uploads','baseurl'=>'https://example.org/uploads','error'=>false]; }
	function trailingslashit( $s ) { return rtrim($s,'/').'/'; }
	function wp_mkdir_p( $path ) { return is_dir($path)||mkdir($path,0777,true); }
	function wp_delete_file( $path ) { if(is_file($path))unlink($path); }
	function wp_clear_scheduled_hook( $name ) { $GLOBALS['cleared_hook']=$name;$GLOBALS['scheduled']=false; }
	function wp_next_scheduled($hook){return $GLOBALS['scheduled'];}
	function wp_get_schedule($hook){return $GLOBALS['recurrence']??false;}
	function wp_schedule_event($time,$recurrence,$hook){$GLOBALS['scheduled']=$time;$GLOBALS['recurrence']=$recurrence;return true;}
	function add_filter($name,$callback,$priority=10,$arguments=1){$GLOBALS['filters'][$name][]=[$callback,$priority,$arguments];}
	function remove_filter($name,$callback,$priority=10){$GLOBALS['filters'][$name]=array_values(array_filter($GLOBALS['filters'][$name]??[],fn($item)=>$item[0]!==$callback||$item[1]!==$priority));}
	function apply_filters($name,$value,...$arguments){foreach($GLOBALS['filters'][$name]??[] as [$callback,$priority,$count])$value=$callback(...array_slice([$value,...$arguments],0,$count));return $value;}
	function get_post($id){return $GLOBALS['attachments'][$id]??null;}
	function get_post_type($id){return get_post($id)?->post_type??false;}
	function get_post_meta($id,$key,$single=false){return $GLOBALS['postmeta'][$id][$key]??'';}
	function add_post_meta($id,$key,$value,$unique=false){if($unique&&isset($GLOBALS['postmeta'][$id][$key]))return false;$GLOBALS['postmeta'][$id][$key]=$value;return true;}
	function delete_post_meta($id,$key){unset($GLOBALS['postmeta'][$id][$key]);}
	function delete_metadata($type,$id,$key,$value='',$all=false){foreach($GLOBALS['postmeta'] as $post_id=>&$meta)if($all||$post_id===$id)unset($meta[$key]);return true;}
	function get_attached_file($id){return $GLOBALS['attachments'][$id]->file??'';}
	function wp_get_attachment_url($id){return get_attached_file($id)?'https://example.org/uploads/'.basename(get_attached_file($id)):false;}
	function wp_get_attachment_metadata($id){return $GLOBALS['attachments'][$id]->metadata??[];}
	function get_posts($args){return array_values(array_filter(array_keys($GLOBALS['attachments']),function($id)use($args){if(isset($args['meta_key']))return isset($GLOBALS['postmeta'][$id][$args['meta_key']])&&(!isset($args['meta_value'])||$GLOBALS['postmeta'][$id][$args['meta_key']]===$args['meta_value']);return true;}));}
	function wp_tempnam($name){return tempnam(ABSPATH.'scratch','ctstudio-');}
	function wp_image_editor_supports($args){return true;}
	function wp_generate_uuid4(){return sprintf('00000000-0000-4000-8000-%012d',$GLOBALS['next_attachment']+1);}
	function wp_get_image_editor($path){return new class($path){public function __construct(private string $path){}public function set_quality($q){}public function save($path,$mime){if($GLOBALS['image_encode_fail'])return new WP_Error();copy($this->path,$path);return ['path'=>$path];}};}
	function media_handle_sideload($file,$parent,$description,$data){
		if($GLOBALS['media_fail'])return new WP_Error();
		$id=++$GLOBALS['next_attachment'];$path=ABSPATH.'uploads/'.$file['name'];rename($file['tmp_name'],$path);
		$GLOBALS['attachments'][$id]=(object)['ID'=>$id,'post_type'=>'attachment','post_parent'=>0,'post_title'=>$data['post_title'],'post_content'=>'','post_excerpt'=>'','post_date_gmt'=>gmdate('Y-m-d H:i:s'),'file'=>$path];
		$GLOBALS['postmeta'][$id]=$data['meta_input'];
		$sizes=apply_filters('intermediate_image_sizes_advanced',['thumbnail'=>['width'=>150]],[],$id);
		$GLOBALS['other_upload_sizes']=apply_filters('intermediate_image_sizes_advanced',['thumbnail'=>['width'=>150]],[],-1);
		$GLOBALS['attachments'][$id]->metadata=['width'=>1200,'height'=>800,'sizes'=>$sizes];
		return $id;
	}
	function wp_delete_attachment($id,$force=false){if(!isset($GLOBALS['attachments'][$id]))return false;$GLOBALS['deleted_attachments'][]=$id;wp_delete_file(get_attached_file($id));unset($GLOBALS['attachments'][$id],$GLOBALS['postmeta'][$id]);return true;}
	class FakeDatabase {
		public string $options='wp_options',$posts='wp_posts',$postmeta='wp_postmeta',$termmeta='wp_termmeta',$usermeta='wp_usermeta',$commentmeta='wp_commentmeta',$last_error='';
		private ?array $snapshot=null;
		public function prepare($sql,...$args){return ['sql'=>$sql,'args'=>$args];}
		public function esc_like($prefix){return $prefix;}
		public function get_col($query){$prefix=rtrim($query['args'][0],'%');return array_values(array_filter(array_keys($GLOBALS['options']),fn($name)=>str_starts_with($name,$prefix)&&(!isset($query['args'][1])||str_contains(serialize($GLOBALS['options'][$name]),trim($query['args'][1],'%')))));}
		public function get_var($query){
			if(str_starts_with($query['sql'],'SELECT option_value'))return serialize(get_option($query['args'][0],[]));
			preg_match('/FROM (\w+)/',$query['sql'],$match);$table=$match[1];
			if(($GLOBALS['reference_error']??'')===$table){$this->last_error='deliberate scan failure';return null;}$this->last_error='';
			$pattern=end($query['args']);$likes=array_filter($query['args'],fn($value)=>is_string($value)&&str_starts_with($value,'%'));
			foreach($GLOBALS['references'][$table]??[] as $value){foreach($likes as $like)if(str_contains($value,trim($like,'%')))return 1;if(preg_match('~'.$pattern.'~',$value))return 1;}
			return null;
		}
		public function query($query){
			if($query==='START TRANSACTION'){if(isset($GLOBALS['before_native_write'])){$callback=$GLOBALS['before_native_write'];unset($GLOBALS['before_native_write']);$callback();}$this->snapshot=$GLOBALS['options'];return 1;}
			if($query==='COMMIT'){$this->snapshot=null;return 1;}
			if($query==='ROLLBACK'){if($this->snapshot!==null)$GLOBALS['options']=$this->snapshot;$this->snapshot=null;return 1;}
			if(str_starts_with($query['sql'],'DELETE')){[$name,$old]=$query['args'];if(isset($GLOBALS['before_capture_delete'])){$callback=$GLOBALS['before_capture_delete'];unset($GLOBALS['before_capture_delete']);$callback($name);}if(serialize(get_option($name))!==$old)return 0;delete_option($name);return 1;}
			[$new,$name,$old]=$query['args'];if(serialize(get_option($name))!==$old)return 0;$GLOBALS['options'][$name]=unserialize($new);return 1;
		}
	}
	$GLOBALS['wpdb']=new FakeDatabase();
	require __DIR__.'/../plugin/includes/class-storage.php';
	require __DIR__.'/../plugin/includes/class-component-store.php';
	require __DIR__.'/../plugin/includes/class-images.php';
	require __DIR__.'/../plugin/includes/class-plugin.php';
}
