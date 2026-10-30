import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Adapter } from '../src/adapter';
import { captureDimensions } from '../src/capture';
import type { Config } from '../src/model';

class RenderedNode {
  constructor(
    readonly dataset: Record<string, string>,
    readonly parentElement: RenderedNode | null = null,
    private width = 300,
  ) {}
  closest(): RenderedNode | null {
    return 'component' in this.dataset ? this : this.parentElement?.closest() || null;
  }
  getBoundingClientRect() {
    return { width: this.width, height: 60 };
  }
}

const config = { components: [], bricksVersion: '2.4.4' } as unknown as Config;

function selectedTarget(
  t: TestContext,
  nodes: RenderedNode[],
  state: NonNullable<ReturnType<Adapter['globals']>>['$_state'],
  selected: { id: string; cid?: string },
  native: RenderedNode | null,
) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousCSS = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  t.after(() => {
    for (const [name, previous] of [
      ['document', previousDocument],
      ['CSS', previousCSS],
    ] as const)
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
  });
  const doc = {
    querySelector: (selector: string) => {
      const [, property, value] = selector.match(/^\[data-(id|component)="([^"]+)"\]$/) || [];
      return nodes.find((node) => node.dataset[property] === value) || null;
    },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { getElementById: () => ({ contentDocument: doc }) },
  });
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const adapter = new Adapter(config);
  adapter.globals = () => ({
    $_state: state,
    $_getDynamicElementById: () => selected,
    $_getElementNode: () => native as unknown as HTMLElement,
  });
  return adapter.selected()?.node as unknown as RenderedNode | undefined;
}

test('a nestable component captures the selected slot instance, not its sibling', (t) => {
  const first = new RenderedNode({ id: 'first', component: 'first', scriptId: 'first' });
  const second = new RenderedNode({ id: 'second', component: 'second', scriptId: 'second' });
  assert.equal(
    selectedTarget(
      t,
      [first, second],
      { activeId: 'second', components: [] },
      { id: 'second', cid: 'faq' },
      second,
    ),
    second,
  );
});

test('exact instance lookup works when the native node helper is unavailable', (t) => {
  const node = new RenderedNode({ id: 'instance', component: 'instance', scriptId: 'instance' });
  assert.equal(
    selectedTarget(
      t,
      [node],
      { activeId: 'instance', components: [] },
      { id: 'instance', cid: 'faq' },
      null,
    ),
    node,
  );
});

test('editing an outer component captures its root when a nested child is active', (t) => {
  const outer = new RenderedNode({ id: 'outer', component: 'outer', scriptId: 'outer' });
  const nested = new RenderedNode({ id: 'nested', component: 'nested', scriptId: 'child' }, outer);
  assert.equal(
    selectedTarget(
      t,
      [outer, nested],
      {
        activeId: 'inner',
        activeComponent: { id: 'section' },
        componentInstanceId: 'outer',
        components: [],
      },
      { id: 'inner' },
      nested,
    ),
    outer,
  );
});

test('hidden selected components do not capture a visible sibling instead', (t) => {
  const first = new RenderedNode({ id: 'first', component: 'first', scriptId: 'faq' });
  const hidden = new RenderedNode(
    { id: 'hidden', component: 'hidden', scriptId: 'hidden' },
    null,
    0,
  );
  assert.equal(
    selectedTarget(
      t,
      [first, hidden],
      { activeId: 'hidden', components: [] },
      { id: 'hidden', cid: 'faq' },
      hidden,
    ),
    undefined,
  );
});

test('fractional border boxes round up so fitted text does not wrap during capture', () => {
  const values: Record<string, string> = { width: '306.25px', height: '59.5938px' };
  assert.deepEqual(
    captureDimensions(
      { offsetWidth: 306, offsetHeight: 60 } as HTMLElement,
      {
        getComputedStyle: () => ({
          boxSizing: 'border-box',
          getPropertyValue: (key: string) => values[key] || '',
        }),
      } as unknown as Window,
    ),
    { width: 307, height: 60 },
  );
});

test('content-box captures include padding and borders, independent of builder zoom', () => {
  const values: Record<string, string> = {
    width: '100.25px',
    height: '20.5px',
    'padding-left': '5px',
    'padding-right': '5px',
    'padding-top': '2px',
    'padding-bottom': '2px',
    'border-left-width': '1px',
    'border-right-width': '1px',
    'border-top-width': '1px',
    'border-bottom-width': '1px',
  };
  assert.deepEqual(
    captureDimensions(
      { offsetWidth: 112, offsetHeight: 27 } as HTMLElement,
      {
        getComputedStyle: () => ({
          boxSizing: 'content-box',
          getPropertyValue: (key: string) => values[key] || '',
        }),
      } as unknown as Window,
    ),
    { width: 113, height: 27 },
  );
});

test('inline auto dimensions use the measured box rather than padding alone', () => {
  const values: Record<string, string> = {
    width: 'auto',
    height: 'auto',
    'padding-left': '5px',
    'padding-top': '5px',
  };
  assert.deepEqual(
    captureDimensions(
      { offsetWidth: 120, offsetHeight: 30 } as HTMLElement,
      {
        getComputedStyle: () => ({
          boxSizing: 'content-box',
          getPropertyValue: (key: string) => values[key] || '',
        }),
      } as unknown as Window,
    ),
    { width: 120, height: 30 },
  );
});
