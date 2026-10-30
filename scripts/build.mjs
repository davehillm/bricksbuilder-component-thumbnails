import { build, transform } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
await import('./translations.mjs');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const php = await readFile('plugin/component-thumbnail-studio.php', 'utf8');
if (!php.includes(`* Version: ${version}`) || !php.includes(`const VERSION = '${version}'`))
  throw new Error('Release versions do not match');
await mkdir('plugin/assets', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'plugin/assets/editor.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome110', 'firefox115', 'safari16.4'],
  legalComments: 'eof',
  sourcemap: false,
  plugins: [
    {
      name: 'shadow-css',
      setup(bundler) {
        bundler.onLoad({ filter: /\.css$/ }, async (args) => {
          const css = await transform(await readFile(args.path, 'utf8'), {
            loader: 'css',
            minify: true,
            target: ['chrome110', 'firefox115', 'safari16.4'],
          });
          return { contents: `export default ${JSON.stringify(css.code)};`, loader: 'js' };
        });
      },
    },
  ],
  banner: {
    js: '/*! Component Thumbnail Studio — GPL-2.0-or-later\nTHESIS: Native Bricks component preview composition with direct image manipulation.\nOWN-WORLD: Inherited Bricks tokens, compact controls, one native accent.\nSTORY: Capture the rendered component, arrange its views, apply a durable native thumbnail.\nFIRST VIEWPORT: Native popup header and toolbar, large 3:2 canvas, compact image strip.\nFORM: User-pinned extension of the Bricks component manager.\nFINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md\n*/',
  },
});
await copyFile(
  'node_modules/modern-screenshot/LICENSE',
  'plugin/assets/modern-screenshot-LICENSE.txt',
);
console.log(`Built editor (${(await readFile('plugin/assets/editor.js')).length} bytes).`);
