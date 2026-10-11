// The layout as columns of items (Batch C2, D17): documents without
// typed tables lay out exactly as before C2 (notable-layout.json,
// made by notable-fixture.mjs from the pre-C2 tree), and every item
// carries its column: x, w, col, ci; L.root the page's column;
// L.flow the caret-holding items in flow order (L.items itself when
// there is no table).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {itemEnd, clampOff} from '../../tools/moreapps/!Word/DocPos';
import * as RI from '../../tools/moreapps/!Word/RulerInd';
import {notableDocs, sample, VIEW_W} from './notable-fixture.mjs';
import {tm} from './word-docs.mjs';

const SNAP = JSON.parse(readFileSync(new URL('./notable-layout.json',
  import.meta.url), 'utf8'));
const docs = {};

before(async () => {
  for (const [name, bytes] of notableDocs()) {
    docs[name] = await readDocx(await bytes);
  }
});

const laid = (name, w = VIEW_W, prev) => {
  const L = new DocLayout(docs[name], tm(), prev);
  L.layout(w);
  return L;
};

/** Every item in its column, the root column the page's. */
function columns(L, msg) {
  const {root} = L;
  assert.ok(root, `${msg}: L.root`);
  assert.equal(root.items, L.items, `${msg}: root items`);
  assert.equal(root.x, L.left, `${msg}: root x`);
  assert.equal(root.w, L.textW, `${msg}: root w`);
  assert.equal(L.flow, L.items, `${msg}: flow is items (no table)`);
  L.items.forEach((it, i) => {
    assert.equal(it.col, root, `${msg} ${i}: col`);
    assert.equal(it.ci, i, `${msg} ${i}: ci`);
    assert.equal(it.index, i, `${msg} ${i}: index in flow`);
    assert.equal(it.x, L.left, `${msg} ${i}: x`);
    assert.equal(it.w, L.textW, `${msg} ${i}: w`);
    assert.equal(L.byId.get(it.id), it, `${msg} ${i}: byId`);
  });
}

describe('notable layout: documents without tables as before C2', () => {
  for (const name of Object.keys(SNAP)) {
    it(`${name}: items, carets, hits and selections`, () => {
      assert.deepEqual(sample(laid(name)), SNAP[name]);
    });
  }
  it('the snapshot covers the six documents', () => {
    assert.deepEqual(Object.keys(SNAP), notableDocs().map((d) => d[0]));
  });
  it('a layout made from an older one (lines kept) gives the same',
    () => {
      for (const name of Object.keys(SNAP)) {
        const L = laid(name, VIEW_W, laid(name, 700));
        assert.deepEqual(sample(L), SNAP[name], name);
      }
    });
});

describe('notable layout: columns of items', () => {
  it('every item: x, w, col, ci of the root column; flow = items',
    () => {
      for (const name of Object.keys(SNAP)) columns(laid(name), name);
    });
  it('the root column moves with the page (another view width)',
    () => {
      const L = laid('plain');
      const x0 = L.left;
      L.layout(VIEW_W + 300);
      assert.equal(L.left, x0 + 150);
      columns(L, 'wider');
      L.layout(200);
      columns(L, 'narrow');
    });
  it('a layout from an older one has its own column', () => {
    const old = laid('lists');
    const L = laid('lists', 800, old);
    assert.notEqual(L.root, old.root);
    columns(L, 'from prev');
    columns(old, 'old untouched');
  });
  it('nextItem / prevItem go through L.flow', () => {
    const L = laid('opaque');
    const f = L.flow;
    assert.equal(L.nextItem(f[0]), f[1]);
    assert.equal(L.prevItem(f[1]), f[0]);
    assert.equal(L.nextItem(f.at(-1)), null);
    assert.equal(L.prevItem(f[0]), null);
  });
  it('any item that is not a paragraph is atomic (off 0 or 1)', () => {
    for (const kind of ['box', 'tbl']) {
      assert.equal(itemEnd({kind}), 1);
      assert.equal(clampOff({kind}, 5), 1);
      assert.equal(clampOff({kind}, -2), 0);
    }
  });
  it('the ruler shows the column of the caret\'s item', () => {
    const L = laid('plain');
    const pos = {id: L.items[2].id, off: 0};
    const s = RI.scaleOf(L, 3, 2, pos);
    assert.deepEqual(s, RI.scaleOf(L, 3, 2));
    assert.equal(s.origin, L.root.x * 2);
    assert.deepEqual(s.text, [L.root.x * 2, (L.root.x + L.root.w) * 2]);
    // (a narrower column: its own edges, the page's page)
    const col = {x: L.left + 50, w: 100, items: []};
    const fake = {...L, locate: () => ({item: {col, x: col.x,
      w: col.w}})};
    const t = RI.scaleOf(fake, 0, 1, pos);
    assert.equal(t.origin, col.x);
    assert.deepEqual(t.text, [col.x, col.x + 100]);
    assert.deepEqual(t.page, [L.pageLeft, L.pageLeft + L.pageW]);
    assert.equal(RI.textTwips(fake, pos), 1500);
    assert.equal(RI.textTwips(L, pos), RI.textTwips(L));
    assert.equal(RI.textTwips(L, {id: 1e9, off: 0}), RI.textTwips(L));
  });
});
