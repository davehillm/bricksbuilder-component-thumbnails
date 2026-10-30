=== Component Thumbnail Studio ===
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 1.1.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html

Compose custom component previews inside the Bricks editor.

== Maintenance status ==

One-off community release. Not actively maintained. No ongoing support, security fixes, or compatibility updates are promised.
Tested with Bricks 2.4.4, WordPress 7.1.4, and PHP 8.3. Test on a staging site before use.
The source is shared as a frozen reference. Forks are welcome under the GPL-2.0-or-later license.

== Requirements ==

Bricks 2.4.x. The editor adapter was verified against Bricks 2.4.4.
PHP OpenSSL and a working WordPress image editor (GD or Imagick).
An account permitted to edit the current page and Bricks components, and upload media.
Component screenshots enabled in Bricks > Settings > Templates & components.

== Use ==

Select a component in Bricks and click the camera in the main toolbar.
The current rendered instance is captured, including its properties, slots, selected variant, and breakpoint.

Drag each image to position it. Drag its corner handle to resize proportionally.
Select an image and open Image style (the rounded-square icon). Choose a preset or adjust its border and corners. Expand Shadow for position, blur, spread, color, and opacity. Styles belong to each image and are included in the finished thumbnail.
Change the background with the color swatch or six-digit hex field.
Use Add capture to return to Bricks, select another view, and capture it into the same composition.
The Component field assigns the current composition to another local component.
Apply writes the finished 1200 x 800 image to the Media Library and uses it as the native component thumbnail.

The camera beside a component in the Component Browser opens its saved composition.
Arrow keys move the selected image; Shift uses larger steps. Focus the corner handle and use arrows to resize.
Undo and Redo affect the thumbnail composition. Delete removes the selected image.

Arrangements save automatically. Apply publishes the image to the component gallery.
Use automatic thumbnail, in the three-dot menu, releases the custom assignment and requests a normal Bricks screenshot.
Applied custom previews are protected from normal Bricks screenshot generation while this plugin is active.

== Data and removal ==

The plugin stores private editing recipes in its own non-autoloaded options and encrypted source captures in uploads/ctstudio-captures.
Source images are read only through permission-checked requests. It makes no external service calls and uses no telemetry.
Reading or copying a source also requires permission to edit the page where it was captured. Reassignment preserves that origin. Protected sources are omitted for editors without that access; they can begin a new composition with their own capture.
Finished images are ordinary Media Library attachments. Unchanged Apply reuses the existing image. Changed Apply retires the previous generated image and its derivatives when no WordPress references use it. Images reused elsewhere or edited in the Media Library are preserved.

Deactivate and Delete through the WordPress Plugins screen to uninstall.
Uninstall removes plugin options, editing recipes, encrypted captures, scheduled cleanup, and image ownership metadata.
Finished Media Library images and the current native Bricks thumbnail assignments remain.
Normal Bricks regeneration resumes and may subsequently replace an assignment.
Deleting the plugin folder by FTP bypasses the WordPress uninstall process.

Unused source captures have a one-hour undo/recovery grace period and are collected hourly through WordPress scheduled tasks. Open editors refresh their undo sources; current draft sources remain available. Identical captures are stored once per component.

== Capture limits ==

Up to 12 images per composition. Source images are limited to 5 MB and 16 megapixels.
Captures are static. Cross-origin assets must allow browser image access; videos need poster images.
Embedded third-party frames, live video, and WebGL content are subject to browser screenshot limitations.

== Isolation ==

Assets load only in the main Bricks editor. The editor uses a Shadow DOM, namespaced PHP, private request names and storage keys, and a bundled dependency.
Only the chosen component's native thumbnail fields are updated; pages, component structures, styles, and theme files are not edited.
The Bricks 2.4 adapter is isolated so compatibility can be reviewed before supporting a new major editor version.

== Changelog ==

= 1.1.1 =
* Final community release with explicit maintenance status and tested environment.
* Locked GitHub release assets, checksums, and release attestation.
* Plugin behavior is unchanged from 1.1.0.

= 1.1.0 =
* Per-image style presets and adjustable borders, corners, and shadows.
* Applied status uses a green checkmark.

= 1.0.1 =
* Deduplicate unchanged captures and output. Retire unused replaced output without generating image sizes.
* Bound capture storage, browser image memory, cancellation, and failure cleanup.
* Tighten input validation and error privacy; remove unused iteration code.

= 1.0.0 =
* Initial release.
