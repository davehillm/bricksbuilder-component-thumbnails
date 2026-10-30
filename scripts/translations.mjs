import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const sources = await Promise.all(
  (await readdir('src'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFile(`src/${name}`, 'utf8')),
);
const frontend = sources.join('\n');
const plugin = 'plugin/includes/class-plugin.php';
const source = await readFile(plugin, 'utf8');
const pruned = source
  .split('\n')
  .filter((line) => {
    const key = line.match(/^\s*'([^']+)' => __\(/)?.[1];
    return !key || frontend.includes(`'${key}'`) || frontend.includes(`"${key}"`);
  })
  .join('\n');
if (pruned !== source) await writeFile(plugin, pruned);

const entries = new Map();
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (entry.name.endsWith('.php')) {
      const lines = (await readFile(path, 'utf8')).split('\n');
      for (let i = 0; i < lines.length; i++)
        for (const match of lines[i].matchAll(
          /__\(\s*'((?:\\.|[^'\\])*)',\s*'component-thumbnail-studio'\s*\)/g,
        )) {
          const value = match[1].replace(/\\(['\\])/g, '$1');
          entries.set(value, [...(entries.get(value) || []), `${path.slice(7)}:${i + 1}`]);
        }
    }
  }
}
await scan('plugin');
const output = [
  'msgid ""',
  'msgstr ""',
  `"Project-Id-Version: Component Thumbnail Studio ${version}\\n"`,
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Content-Transfer-Encoding: 8bit\\n"',
  '"MIME-Version: 1.0\\n"',
  '"X-Domain: component-thumbnail-studio\\n"',
  '',
];
for (const [message, locations] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
  output.push(`#: ${locations.join(' ')}`);
  if (/%[ds]/.test(message)) output.push('#, php-format');
  output.push(`msgid ${JSON.stringify(message)}`, 'msgstr ""', '');
}
await mkdir('plugin/languages', { recursive: true });
await writeFile('plugin/languages/component-thumbnail-studio.pot', output.join('\n'));
