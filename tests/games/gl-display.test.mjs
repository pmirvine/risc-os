import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Display, fitScale } from '../../tools/games/!GameLib/Display';
import { fakeDocument, fakeTask, fakeWimp, fakeOs }
  from './fakes.mjs';

let doc;
before(() => { doc = fakeDocument(); globalThis.document = doc; });
after(() => { delete globalThis.document; });

test('fitScale in whole device pixels', () => {
  assert.deepEqual(fitScale(1024, 768, 224, 288, 1, true),
    { cw: 448, ch: 576, left: 288, top: 96 });
  assert.deepEqual(fitScale(1920, 1080, 224, 288, 1, true),
    { cw: 672, ch: 864, left: 624, top: 108 });
  assert.deepEqual(fitScale(1920, 1080, 224, 288, 2, true),
    { cw: 784, ch: 1008, left: 568, top: 36 });
  assert.deepEqual(fitScale(300, 200, 224, 288, 1, true),
    { cw: 156, ch: 200, left: 72, top: 0 });
});

test('fitScale without whole scaling fills the area', () => {
  const r = fitScale(1024, 768, 224, 288, 1, false);
  assert.equal(r.ch, 768);
});

test('tiny and zero areas give at least 1 x 1, no NaN', () => {
  for (const [a, b] of [[0, 0], [10, 10], [-5, NaN]]) {
    const r = fitScale(a, b, 224, 288, 1, true);
    for (const v of Object.values(r)) assert.ok(Number.isFinite(v));
    assert.ok(r.cw >= 1 && r.ch >= 1);
  }
});

function make(extra = {}) {
  const task = fakeTask(), wimp = fakeWimp(), os = fakeOs(wimp);
  const calls = { close: 0, blur: 0, pointer: [] };
  const d = new Display({ task, wimp, os, title: 'Pacman',
    width: 224, height: 288, background: '#001',
    onClose: () => calls.close++, onBlur: () => calls.blur++,
    onPointer: (p) => calls.pointer.push(p), ...extra });
  return { task, wimp, os, calls, d };
}

test('open window makes one titled window', () => {
  const { task, d, wimp } = make();
  d.open('window');
  assert.equal(d.kind, 'window');
  assert.equal(task.windows.length, 1);
  const w = task.windows[0];
  assert.equal(w.def.title, 'Pacman');
  assert.equal(w.def.w, 448);
  assert.equal(w.def.h, 576);
  assert.equal(d.canvas.width, 224);
  assert.equal(d.el, w.view);
  assert.equal(wimp.caret.window, w);
  assert.equal(d.canvas.style.width, '448px');
});

test('the close icon calls onClose once; losecaret blurs', () => {
  const { task, d, calls } = make();
  d.open('window');
  const w = task.windows[0];
  const ev = w.emit('close');
  assert.equal(ev.prevented, 1);
  assert.equal(calls.close, 1);
  w.emit('losecaret');
  assert.equal(calls.blur, 1);
});

test('pointerdown maps to surface coordinates', () => {
  const { d, calls } = make();
  d.open('window');
  d.canvas.box = { left: 100, top: 50, width: 448, height: 576 };
  const ev = d.canvas.fire('pointerdown',
    { clientX: 324, clientY: 338, button: 0 });
  assert.deepEqual(calls.pointer,
    [{ type: 'down', x: 112, y: 144, button: 'select' }]);
  assert.equal(ev.stopped, 1);
  d.canvas.fire('pointermove', { clientX: 100, clientY: 50 });
  assert.deepEqual(calls.pointer[1], { type: 'move', x: 0, y: 0 });
});

test('full screen acquires once; window releases it once', () => {
  const { os, d, task } = make();
  d.open('full');
  assert.equal(os.acquired.length, 1);
  assert.equal(os.acquired[0].background, '#001');
  assert.equal(d.kind, 'full');
  assert.equal(d.canvas.style.width, '448px');
  d.open('window');
  assert.equal(os.released, 1);
  assert.equal(task.windows.length, 1);
});

test('close twice is harmless; keys follow the display', () => {
  const { os, d, task, wimp } = make();
  assert.equal(d.keysActive(), false);
  d.open('full');
  assert.equal(d.keysActive(), true);
  d.close();
  d.close();
  assert.equal(os.released, 1);
  assert.equal(d.kind, null);
  assert.equal(d.keysActive(), false);
  d.open('window');
  assert.equal(d.keysActive(), true);
  wimp.caret = { window: null };
  assert.equal(d.keysActive(), false);
  d.close();
  assert.equal(task.windows[0].deleted, 1);
});

test('present passes the canvas size', () => {
  const { d } = make();
  d.open('window');
  const seen = [];
  d.present({ present: (...a) => seen.push(a) });
  assert.equal(seen[0][1], 0);
  assert.deepEqual(seen[0].slice(3), [224, 288]);
});

test('browserFull asks the document', () => {
  const { d } = make();
  d.browserFull(true);
  assert.equal(doc.fullRequests, 1);
  d.browserFull(false);
  assert.equal(doc.exits, 1);
});
