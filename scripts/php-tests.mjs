import { execFileSync } from 'node:child_process';
import { mkdtemp, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The WASM CLI needs a space-free package URL. This private symlink also works
// when the project itself lives in a folder whose name contains spaces.
const temporary = await mkdtemp(join(tmpdir(), 'ctstudio-php-'));
try {
  await symlink(resolve('node_modules'), join(temporary, 'node_modules'), 'dir');
  const cli = join(temporary, 'node_modules/@php-wasm/cli/php-wasm.js');
  const run = (args) =>
    execFileSync(
      process.execPath,
      ['--preserve-symlinks', '--preserve-symlinks-main', cli, ...args],
      { encoding: 'utf8' },
    );
  const files = [
    'plugin/component-thumbnail-studio.php',
    'plugin/uninstall.php',
    ...(await readdir('plugin/includes'))
      .filter((x) => x.endsWith('.php'))
      .map((x) => `plugin/includes/${x}`),
  ];
  for (const file of files) {
    const output = run(['-l', file]);
    if (!output.includes('No syntax errors detected')) throw new Error(output);
    console.log(output.trim());
  }
  const output = run(['tests/backend.php']);
  console.log(output.trim());
  if (
    /(?:^|\n)(?:Fatal error|Parse error|FAIL:)/i.test(output) ||
    !/Verified \d+ backend scenarios\./.test(output)
  )
    throw new Error('PHP checks failed.');
} finally {
  await rm(join(temporary, 'node_modules'));
  await rm(temporary, { recursive: true });
}
