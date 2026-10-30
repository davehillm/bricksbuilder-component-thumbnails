# Sidebar component previews

[Download the PHP snippet](https://raw.githubusercontent.com/davehillm/bricksbuilder-component-thumbnails/main/extras/sidebar-component-previews.php) or [view its source](sidebar-component-previews.php).

Shows saved Bricks component thumbnails in the normal Components sidebar. Rows have a minimum height of 88px, and complete images fit into a responsive 3:2 preview area. Names, usage counts, categories, native actions, and component insertion stay available. Missing or failed images fall back to the native icon.

## Install

1. Add `sidebar-component-previews.php` as a **PHP snippet** in your existing code manager, such as FluentSnippets or Code Snippets.
2. If the editor already supplies `<?php`, omit that opening tag when pasting.
3. Allow the snippet to run on the frontend or everywhere, then activate it. Its own checks restrict it to the main Bricks editor.
4. Enable component screenshots in Bricks settings and reload the editor.

The snippet reads native component IDs and thumbnail URLs. It works with native screenshots and with custom images assigned by Component Thumbnail Studio. It does not require Thumbnail Studio and can remain active after that plugin is uninstalled, while the saved native assignments remain.

Install it separately from the removable plugin. The `extras` folder belongs to the source repository and is not included in the plugin installation ZIP. Do not also install a second copy of the snippet.

## Requirements and removal

Bricks 2.4.x and PHP 8.2 or later. Verified with Bricks 2.4.4. The adapter uses native editor data and DOM selectors, so review compatibility before expanding support to another Bricks version.

Disable or delete the snippet and reload Bricks to restore the native sidebar. The snippet creates no images, options, tables, endpoints, or scheduled tasks and does not write component definitions or assignments. Its image loading is lazy; styling and DOM updates are limited to the Components sidebar. Public pages, the preview iframe, and the ordinary Elements tab are excluded.

This snippet is optional and covered by the repository’s [GPL-2.0-or-later license](../LICENSE).
