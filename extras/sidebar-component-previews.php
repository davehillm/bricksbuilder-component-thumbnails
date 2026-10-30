<?php
/** Bricks sidebar thumbnails. Independent of Component Thumbnail Studio. */
if (!defined('ABSPATH')) return;
if (!isset($_GET['bricks']) || $_GET['bricks'] !== 'run' || isset($_GET['brickspreview'])) return;

add_action('wp_enqueue_scripts', static function () {
    if (!function_exists('bricks_is_builder_main') || !bricks_is_builder_main()
        || !defined('BRICKS_VERSION') || !str_starts_with(BRICKS_VERSION, '2.4.')
        || !defined('BRICKS_DB_COMPONENTS')
        || !current_user_can('edit_post', get_queried_object_id())
        || !\Bricks\Database::get_setting('generateComponentScreenshots', false)) return;
    $thumbnails = [];
    foreach (get_option(BRICKS_DB_COMPONENTS, []) as $component) {
        if (isset($component['id']) && is_string($component['thumbnail'] ?? null))
            $thumbnails[$component['id']] = esc_url_raw($component['thumbnail'], ['https', 'http']);
    }
    $script = <<<'BCT_COMPONENT_PREVIEWS_JS'
(() => {
  'use strict';
  const key = Symbol.for('bricksbuilder-component-thumbnails.sidebar-previews');
  if (window[key]) return;
  window[key] = true;
  const initial = __BCT_COMPONENT_PREVIEWS__;
  const listSelector = '#bricks-panel-elements-categories[data-tab="components"]';
  const rows = new WeakMap();
  let panel, observer, mountObserver, unwatch, timer, frame;
  let stopped = false;

  const globals = () => {
    const root = document.querySelector('.brx-body.main');
    return root?.__vue_app__?.config.globalProperties || root?.__vueParentComponent?.appContext.config.globalProperties;
  };
  const thumbnails = () => {
    const components = globals()?.$_state?.components;
    return Array.isArray(components)
      ? new Map(components.map(component => [component.id, component.thumbnail]))
      : new Map(Object.entries(initial));
  };
  const safeUrl = value => {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value, document.baseURI);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const observe = () => observer.observe(panel, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-tab', 'data-component-id'],
  });
  const render = () => {
    frame = undefined;
    if (stopped) return;
    const list = panel.querySelector(listSelector);
    if (!list) return;
    const sources = thumbnails();
    observer.disconnect();
    try {
      for (const row of list.querySelectorAll('[data-component-id]')) {
        const host = row.querySelector('.element-icon');
        if (!host) continue;
        row.dataset.bctComponentPreview = '';
        const id = row.dataset.componentId, url = safeUrl(sources.get(id));
        const previous = rows.get(row);
        if (previous?.id === id && previous.url === url && (!url || previous.image?.parentElement === host)) continue;
        previous?.image?.remove();
        host.classList.remove('bct-component-preview-ready');
        const current = { id, url, image: null };
        rows.set(row, current);
        if (!url) continue;
        const image = document.createElement('img');
        current.image = image;
        image.className = 'bct-component-preview-image';
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.draggable = false;
        image.loading = 'lazy';
        image.decoding = 'async';
        const loaded = () => {
          if (rows.get(row) === current && image.parentElement === host)
            host.classList.add('bct-component-preview-ready');
        };
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', () => {
          if (rows.get(row) === current) host.classList.remove('bct-component-preview-ready');
        }, { once: true });
        image.src = url;
        host.append(image);
        if (image.complete && image.naturalWidth) loaded();
      }
    } finally { if (!stopped) observe(); }
  };
  const schedule = () => {
    if (!stopped && frame === undefined) frame = requestAnimationFrame(render);
  };
  const start = node => {
    panel = node;
    mountObserver?.disconnect();
    observer = new MutationObserver(schedule);
    observe();
    const g = globals();
    if (typeof g?.$_watch === 'function') {
      unwatch = g.$_watch(() => JSON.stringify(g.$_state.components?.map(component =>
        [component.id, component.thumbnail, component.thumbnailUpdated])), schedule);
    } else {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible' && panel.querySelector(listSelector)) schedule();
      }, 2000);
    }
    schedule();
  };
  const boot = () => {
    const node = document.getElementById('bricks-panel');
    if (node) start(node);
    else {
      mountObserver = new MutationObserver(() => {
        const mounted = document.getElementById('bricks-panel');
        if (mounted) start(mounted);
      });
      mountObserver.observe(document.body, { childList: true, subtree: true });
    }
  };
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    stopped = true;
    mountObserver?.disconnect();
    observer?.disconnect();
    if (typeof unwatch === 'function') unwatch();
    clearInterval(timer);
    cancelAnimationFrame(frame);
    delete window[key];
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
BCT_COMPONENT_PREVIEWS_JS;
    $data = wp_json_encode($thumbnails, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    wp_add_inline_script('bricks-builder', str_replace('__BCT_COMPONENT_PREVIEWS__', $data, $script), 'after');
    wp_add_inline_style('bricks-builder', <<<'BCT_COMPONENT_PREVIEWS_CSS'
#bricks-panel-elements-categories[data-tab='components'] li.bricks-add-element[data-bct-component-preview] {
  min-height: 88px;
  display: flex;
  align-items: center;
}
#bricks-panel-elements-categories[data-tab='components'] li.bricks-add-element[data-bct-component-preview] > .element-data {
  align-items: center;
  width: 100%;
  gap: 12px;
}
#bricks-panel-elements-categories[data-tab='components'] li.bricks-add-element[data-bct-component-preview] .element-icon {
  position: relative;
  margin-inline-end: 0;
  flex: 0 0 clamp(80px, 28%, 112px);
  width: clamp(80px, 28%, 112px);
  height: auto;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  border-radius: var(--builder-border-radius, 4px);
}
#bricks-panel-elements-categories[data-tab='components'] li.bricks-add-element[data-bct-component-preview] .element-label {
  flex: 1;
  min-width: 0;
}
#bricks-panel-elements-categories[data-tab='components'] li.bricks-add-element[data-bct-component-preview] .component-label .label {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.3;
}
#bricks-panel-elements-categories[data-tab='components'] .bct-component-preview-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--builder-bg-2);
  pointer-events: none;
  user-select: none;
  opacity: 0;
}
#bricks-panel-elements-categories[data-tab='components'] .bct-component-preview-ready > .bct-component-preview-image {
  opacity: 1;
}
#bricks-panel-elements-categories[data-tab='components'] .bct-component-preview-ready > i {
  visibility: hidden;
}
BCT_COMPONENT_PREVIEWS_CSS
    );
}, 110);
