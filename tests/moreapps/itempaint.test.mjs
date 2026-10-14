// Painting through Place (Batch D P3.2, D4): ./DocPaint asks the
// layout's placement which items and lines a band shows
// (L.place.visible) and paints each fragment where the place puts it
// (its dx, dy); ./ItemPaint paints a paragraph's lines l0..l1 - 1
// only. In Draft (the identity placement) nothing moves and nothing
// is translated: the calls are today's. Under a shifted placement
// (a test Place moving the galley by dx, dy) every mark of every
// document is drawn exactly dx, dy further on the screen.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {paint} from '../../tools/moreapps/!Letters/DocPaint';
import {paintPara} from '../../tools/moreapps/!Letters/ItemPaint';
import {draftDocs, VIEW_W} from './draft-fixture.mjs';
import {shifted} from './place-fixture.mjs';
import {tm} from './word-docs.mjs';

const docs = {};
before(async () => {
  for (const [name, bytes] of draftDocs()) {
    docs[name] = await readDocx(await bytes);
  }
});

const laid = (doc) => {
  const L = new DocLayout(doc, tm());
  L.layout(VIEW_W);
  return L;
};

// the arguments of each call that are an (x, y) point: [x index]
const POINTS = {fillRect: [0], strokeRect: [0], clearRect: [0],
  rect: [0], moveTo: [0], lineTo: [0], fillText: [1], strokeText: [1]};
const NOT_DRAWN = new Set(['save', 'restore', 'translate']);

/**
 * A fake 2D context that keeps a translation (save, restore,
 * translate) and records every other call with its points in device
 * space, and every property set, in order.
 */
function deviceG() {
  const calls = [], stack = [];
  let tx = 0, ty = 0;
  const props = {};
  const target = {calls, translated: 0,
    save: () => stack.push([tx, ty]),
    restore: () => { [tx, ty] = stack.pop(); },
    translate: (x, y) => {
      tx += x;
      ty += y;
      target.translated++;
    },
    measureText: (t) => ({width: 6 * t.length}),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in props) return props[k];
      return (...a) => {
        const at = POINTS[k];
        if (at) {
          a = a.slice();
          a[at[0]] += tx;
          a[at[0] + 1] += ty;
        } else if (k === 'drawImage') {
          a = a.slice();
          const i = a.length === 9 ? 5 : 1;
          a[i] += tx;
          a[i + 1] += ty;
        }
        if (!NOT_DRAWN.has(k)) calls.push([k, ...a]);
      };
    },
    set(t, k, v) {
      props[k] = v;
      calls.push(['set ' + String(k), v]);
      return true;
    },
  });
}

/** Calls moved by (dx, dy): what the shifted place should draw. */
const moved = (calls, dx, dy) => calls.map(([k, ...a]) => {
  const at = POINTS[k] ? POINTS[k][0]
    : k === 'drawImage' ? (a.length === 9 ? 5 : 1) : -1;
  if (at < 0) return [k, ...a];
  a = a.slice();
  a[at] += dx;
  a[at + 1] += dy;
  return [k, ...a];
});

describe('painting through L.place (D4)', () => {
  it('Draft: no fragment is moved, nothing translated', () => {
    for (const name of Object.keys(docs)) {
      const L = laid(docs[name]), g = deviceG();
      paint(L, g, {x0: 0, y0: 0, x1: 2000, y1: L.height});
      assert.ok(g.calls.length > 0, name);
      assert.equal(g.translated, 0, name);
    }
  });
  it('a shifted place: every mark drawn moved by (dx, dy)', () => {
    const DX = 64, DY = 1000;
    for (const name of Object.keys(docs)) {
      const A = laid(docs[name]), B = laid(docs[name]);
      B.place = shifted(B, DX, DY);
      const h = A.height;
      for (const [y0, y1] of [[0, h], [0, h / 3], [h / 3, h],
        [h / 2 - 40, h / 2 + 40]]) {
        const a = deviceG(), b = deviceG();
        const Y0 = Math.round(y0), Y1 = Math.round(y1);
        paint(A, a, {x0: 0, y0: Y0, x1: 2000, y1: Y1});
        paint(B, b, {x0: DX, y0: Y0 + DY, x1: 2000 + DX, y1: Y1 + DY});
        assert.ok(a.calls.length > 0, name);
        assert.deepEqual(b.calls, moved(a.calls, DX, DY),
          `${name} ${Y0}..${Y1}`);
      }
    }
  });
});

describe('ItemPaint paintPara: lines l0..l1 - 1', () => {
  it('only the lines of the fragment, all of them in the rect', () => {
    const L = laid(docs.plain);
    const it = L.items.find((n) => n.lines && n.lines.length > 2);
    const big = {x0: 0, y0: 0, x1: 2000, y1: L.height};
    const drawn = (l0, l1) => {
      const g = deviceG();
      paintPara(L, g, it, big, l0, l1);
      return g.calls.filter((c) => c[0] === 'fillText')
        .map((c) => c[1]);
    };
    const words = (k) => it.lines[k].items.filter((x) => x.text)
      .map((x) => x.text);
    assert.deepEqual(drawn(1, 2), words(1));
    assert.deepEqual(drawn(0, 2), [...words(0), ...words(1)]);
    assert.deepEqual(drawn(2, 2), []);
    assert.deepEqual(drawn(), it.lines.flatMap((l, k) => words(k)));
  });
});
