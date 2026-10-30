import { cp, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const staging = resolve('build/package'),
  folder = resolve(staging, 'component-thumbnail-studio'),
  output = resolve(`build/component-thumbnail-studio-${version}.zip`);
const runtime = new Set([
  'component-thumbnail-studio.php',
  'uninstall.php',
  'includes/class-storage.php',
  'includes/class-component-store.php',
  'includes/class-images.php',
  'includes/class-plugin.php',
  'assets/editor.js',
  'assets/modern-screenshot-LICENSE.txt',
  'languages/component-thumbnail-studio.pot',
  'readme.txt',
  'LICENSE',
]);
async function inspect(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory()) await inspect(`${directory}/${item.name}`, `${name}/`);
    else if (!runtime.delete(name)) throw new Error(`Unexpected runtime file: ${name}`);
  }
}
await inspect('plugin');
if (runtime.size) throw new Error(`Missing runtime files: ${[...runtime].join(', ')}`);
await mkdir(staging, { recursive: true });
await rm(folder, { recursive: true, force: true });
await cp('plugin', folder, { recursive: true });
await rm(output, { force: true });
execFileSync('zip', ['-q', '-r', output, 'component-thumbnail-studio'], { cwd: staging });
console.log(output);
