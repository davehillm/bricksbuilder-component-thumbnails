import test from 'node:test';
import assert from 'node:assert/strict';
import { withAbort } from '../src/async';
import { Api, ApiError } from '../src/api';
import type { Config } from '../src/model';

test('cancellation does not wait for a stalled operation', async () => {
  const controller = new AbortController();
  const operation = withAbort(new Promise<never>(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
});
test('an already-cancelled request consumes a later underlying rejection', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(withAbort(Promise.reject(new Error('late failure')), controller.signal), {
    name: 'AbortError',
  });
});
test('successful operations retain their result', async () => {
  assert.equal(await withAbort(Promise.resolve(42), new AbortController().signal), 42);
});
const config: Config = {
  ajaxUrl: 'https://example.org/wp-admin/admin-ajax.php',
  nonce: 'test-only',
  postId: 7,
  bricksVersion: '2.4.4',
  components: [],
  screenshotsEnabled: true,
  strings: {},
};
test('cancelling a capture also cancels its upload', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
        once: true,
      });
    });
  const controller = new AbortController(),
    request = new Api(config).upload('abc123', new Blob(['png']), controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});
test('expired WordPress sessions have an actionable error', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => new Response('-1', { status: 403 });
  await assert.rejects(
    new Api(config).load('abc123'),
    (error) =>
      error instanceof ApiError && error.status === 403 && error.message.includes('Reload Bricks'),
  );
});
