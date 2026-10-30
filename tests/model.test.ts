import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  DEFAULT_IMAGE_STYLE,
  getImageStyle,
  IMAGE_PRESETS,
  imagePreset,
  imageShadow,
  imageStyle,
  fitLayer,
  History,
  moveLayer,
  normalizeColor,
  resizeLayer,
} from '../src/model.ts';
const layer = { id: 'one', captureId: 'a', x: 0, y: 0, width: 1600, height: 900 };
test('colors are normalized without admitting CSS or partial values', () => {
  assert.equal(normalizeColor(' fcf2e0 '), '#FCF2E0');
  assert.equal(normalizeColor('#123ABC'), '#123ABC');
  for (const input of ['red', '#fff', 'rgba(0,0,0,0)', '#12345678', ';background:url(x)'])
    assert.equal(normalizeColor(input), null);
});
test('fitting preserves proportions for wide and tall components', () => {
  for (const original of [layer, { ...layer, width: 400, height: 2400 }]) {
    const fitted = fitLayer(original);
    assert.ok(fitted.x >= 72 && fitted.y >= 72);
    assert.ok(fitted.width <= 1056 && fitted.height <= 656);
    assert.ok(Math.abs(fitted.width / fitted.height - original.width / original.height) < 0.0001);
    assert.equal(fitted.x * 2 + fitted.width, 1200);
    assert.equal(fitted.y * 2 + fitted.height, 800);
  }
});
test('dragging snaps to the canvas center and remains recoverable at its edges', () => {
  const item = { ...layer, width: 400, height: 200, x: 10, y: 10 };
  const snapped = moveLayer(item, 388, 292);
  assert.equal(snapped.layer.x, 400);
  assert.equal(snapped.layer.y, 300);
  assert.equal(snapped.vertical, true);
  assert.equal(snapped.horizontal, true);
  const unsnapped = moveLayer(item, 388, 292, false);
  assert.equal(unsnapped.layer.x, 398);
  const off = moveLayer(item, -10000, 10000);
  assert.equal(off.layer.x, -384);
  assert.equal(off.layer.y, 784);
});
test('resize preserves aspect ratio and has a usable minimum', () => {
  const large = resizeLayer(layer, 400, 0);
  assert.equal(large.width, 2000);
  assert.equal(large.height, 1125);
  const tiny = resizeLayer(layer, -2000, -2000);
  assert.ok(tiny.width >= 24 && tiny.height >= 24);
  assert.ok(Math.abs(tiny.width / tiny.height - 1600 / 900) < 0.0001);
});
test('history isolates snapshots and supports redo after layer removal', () => {
  const initial = { background: '#FCF2E0', layers: [{ ...layer }] },
    history = new History();
  history.push(initial);
  const changed = { background: '#112233', layers: [] };
  initial.layers[0].x = 100;
  const undone = history.undo(changed)!;
  assert.equal(undone.background, '#FCF2E0');
  assert.equal(undone.layers[0].x, 0);
  assert.deepEqual(history.redo(undone), changed);
  history.push(changed);
  assert.equal(history.canRedo, false);
});
test('source retention follows bounded undo and redo history', () => {
  const history = new History();
  for (let i = 0; i < 61; i++)
    history.push({ background: '#FCF2E0', layers: [{ ...layer, captureId: `source-${i}` }] });
  const current = { background: '#FCF2E0', layers: [{ ...layer, captureId: 'current' }] };
  const retained = history.captureIds(current);
  assert.equal(retained.size, 51);
  assert.equal(retained.has('source-0'), false);
  const undone = history.undo(current)!;
  assert.deepEqual(history.captureIds(undone), retained);
  history.clear();
  assert.deepEqual([...history.captureIds(current)], ['current']);
});
test('existing screenshots keep square corners and no added border or shadow', () => {
  assert.deepEqual(getImageStyle(layer), DEFAULT_IMAGE_STYLE);
  assert.deepEqual(imageStyle(layer), { width: 0, radius: 0, color: '#000000' });
  assert.equal(imageShadow(getImageStyle(layer)), 'none');
});
test('styles stay independent across screenshots and undo restores a fine-tuned recipe', () => {
  const history = new History();
  const initial = {
    background: '#FCF2E0',
    layers: [
      { ...layer, ...IMAGE_PRESETS[1].style },
      { ...layer, id: 'two' },
    ],
  };
  history.push(initial);
  const changed = {
    ...initial,
    layers: initial.layers.map((item) =>
      item.id === 'one' ? { ...item, borderRadius: 36, shadowOpacity: 30 } : item,
    ),
  };
  assert.equal(imagePreset(getImageStyle(changed.layers[0])), 'custom');
  assert.equal(imagePreset(getImageStyle(changed.layers[1])), 'none');
  assert.deepEqual(history.undo(changed), initial);
  assert.deepEqual(history.redo(initial), changed);
});
test('presets are recognized and visual geometry clamps without changing stored settings', () => {
  for (const preset of IMAGE_PRESETS)
    assert.equal(imagePreset(getImageStyle({ ...layer, ...preset.style })), preset.id);
  const tiny = { ...layer, width: 24, height: 12, borderWidth: 64, borderRadius: 600 };
  assert.deepEqual(imageStyle(tiny), { width: 6, radius: 6, color: '#000000' });
  assert.equal(tiny.borderRadius, 600);
  assert.equal(
    imageShadow({ ...DEFAULT_IMAGE_STYLE, shadowOpacity: 20, shadowSpread: -4 }, 0.5),
    '0px 6px 14px -2px rgba(0,0,0,0.2)',
  );
});
