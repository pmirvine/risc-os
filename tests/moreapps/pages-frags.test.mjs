// Fragments on demand, positions to pages (Batch D P2.4, D2 + R6):
// Page.frames built lazily per page and cached per Pages (version),
// Pages.fragsBuilt, Pages.ofPos and Pages.atScreen. Fake galleys
// (page-fixtures galley: frame 100 px, margins 10 px, pages 120 px
// high, items from galley y 24) and real documents (the fake
// measurer, word-docs tm).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PAGE_GAP} from '../../tools/moreapps/!Letters/Paginate';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {galley, docLayout, BAND} from './page-fixtures.mjs';
import {p, r} from './build-docx.mjs';

before(loadStyles);
const tens = (n) => Array(n).fill(10);
const pagesOf = (spec) => new Pages(galley(spec)).finish();
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
/** Paragraph i: a few lines at 800 px with the fake measurer. */
const long = (i) => Array.from({length: 20 + (i % 7) * 9},
  (_, j) => WORDS[(i + j) % 10]).join(' ');

function lay(d, m, prev) {
  const L = new DocLayout(d.doc, m, prev);
  L.layout(800);
  return L;
}

describe('Page.frames (fake galleys)', () => {
  it('one frame per page: the column, bodyTop, frameH, the cursors',
    () => {
      const P = pagesOf({items: tens(30)});
      const pg = P.at(1), [f] = pg.frames;
      assert.equal(pg.frames.length, 1);
      assert.deepEqual({x: f.x, y: f.y, w: f.w, h: f.h},
        {x: 10, y: 10, w: 180, h: 100});
      assert.equal(f.start, pg.start);
      assert.equal(f.end, pg.end);
      assert.ok(Object.isFrozen(f) && Object.isFrozen(f.frags));
    });

  it('whole items: one frag each, y on the page from bodyTop', () => {
    const P = pagesOf({items: tens(30)});
    const fs = P.at(0).frames[0].frags;
    assert.equal(fs.length, 10);
    assert.deepEqual(fs[0], {id: 'i0', l0: 0, l1: 1, x: 10, y: 10});
    assert.deepEqual(fs[9], {id: 'i9', l0: 0, l1: 1, x: 10, y: 100});
    assert.deepEqual(P.at(1).frames[0].frags[0],
      {id: 'i10', l0: 0, l1: 1, x: 10, y: 10});
  });

  it('a split paragraph: its lines on each page, the second ' +
    'page\'s first line at the frame top', () => {
    const P = pagesOf({items: [...tens(8), {lines: tens(5)}]});
    const a = P.at(0).frames[0].frags.at(-1);
    const b = P.at(1).frames[0].frags[0];
    assert.deepEqual([a.id, a.l0, a.l1], ['i8', 0, 2]);
    assert.deepEqual([b.id, b.l0, b.l1], ['i8', 2, 5]);
    // line j is at y + its galley y in the item: line 2 at 10
    assert.equal(b.y + 20, 10);
    assert.equal(P.at(1).frames[0].frags.length, 1);
  });

  it('a page break: the break\'s line ends the page\'s frags', () => {
    const P = pagesOf({items: [10, {lines: tens(3), brPage: [0]}, 10]});
    assert.deepEqual(P.at(0).frames[0].frags.map((f) =>
      [f.id, f.l0, f.l1]), [['i0', 0, 1], ['i1', 0, 1]]);
    assert.deepEqual(P.at(1).frames[0].frags.map((f) =>
      [f.id, f.l0, f.l1]), [['i1', 1, 3], ['i2', 0, 1]]);
  });

  it('a continuous section\'s band is not placed: the frags after ' +
    'it move up by BAND', () => {
    const items = tens(8);
    items[5] = {h: 10, sectStart: 'continuous'};
    const fs = pagesOf({items}).at(0).frames[0].frags;
    assert.equal(fs[4].y, 50);
    assert.equal(fs[5].y, 60);
    assert.equal(fs[7].y, 80);
    assert.ok(BAND > 0);
  });

  it('a cut item: a frag on each page, y above the frame by what ' +
    'the pages before showed', () => {
    const P = pagesOf({items: [{kind: 'box', h: 250}, 10]});
    const ys = [0, 1, 2].map((i) => P.at(i).frames[0].frags[0].y);
    assert.deepEqual(ys, [10, -90, -190]);
    assert.deepEqual(P.at(0).frames[0].frags[0],
      {id: 'i0', l0: 0, l1: 0, x: 10, y: 10});
    assert.equal(P.at(2).frames[0].frags.length, 2);
    const c = pagesOf({items: [{lines: [250]}]});
    assert.deepEqual(c.at(1).frames[0].frags.map((f) =>
      [f.l0, f.l1, f.y]), [[0, 1, -90]]);
  });

  it('vAlign bottom: the frags moved down by vShift', () => {
    const P = pagesOf({items: tens(3), sections: [{vAlign: 'bottom'}]});
    assert.equal(P.at(0).vShift, 70);
    assert.equal(P.at(0).frames[0].frags[0].y, 80);
  });

  it('a blank page has no frames', () => {
    const items = tens(5);
    items[3] = {h: 10, sectStart: 'oddPage'};
    const P = pagesOf({items});
    const b = P.list.find((pg) => pg.blank);
    assert.ok(b);
    assert.deepEqual(b.frames, []);
  });

  it('frames are not part of the Page\'s own fields', () => {
    const pg = pagesOf({items: tens(3)}).at(0);
    assert.ok(!Object.keys(pg).includes('frames'));
    assert.ok(Object.isFrozen(pg));
  });
});

describe('Page.frames (real documents)', () => {
  it('every paragraph\'s lines are in exactly one frag across the ' +
    'pages', () => {
    const d = mk(Array.from({length: 300}, (_, i) => long(i)));
    const L = lay(d, tm());
    const P = new Pages(galleyOf(L)).finish();
    assert.ok(P.count > 5, `${P.count} pages`);
    const got = new Map();
    let split = 0;
    for (const pg of P.list) {
      for (const f of pg.frames[0].frags) {
        const it = L.byId.get(f.id);
        assert.ok(it, `frag ${f.id}`);
        if (f.l0 > 0) split++;
        const xs = got.get(f.id) || [];
        for (let j = f.l0; j < f.l1; j++) xs.push(j);
        got.set(f.id, xs);
      }
    }
    assert.ok(split > 0, 'some paragraph splits');
    for (const it of L.items) {
      assert.deepEqual(got.get(it.id),
        it.lines.map((_, j) => j), `item ${it.id}`);
    }
  });

  it('at(i).frames twice: the same object; built once', () => {
    const d = mk(Array.from({length: 100}, (_, i) => long(i)));
    const P = new Pages(galleyOf(lay(d, tm()))).finish();
    assert.equal(P.fragsBuilt, 0);
    const f = P.at(3).frames;
    assert.equal(P.at(3).frames, f);
    assert.equal(P.fragsBuilt, 1);
    P.at(4).frames;
    assert.equal(P.fragsBuilt, 2);
  });

  it('after an edit before page i: a new frames object for page i',
    () => {
      const d = mk(Array.from({length: 100}, (_, i) => long(i)));
      const m = tm(), L0 = lay(d, m);
      const P0 = new Pages(galleyOf(L0)).finish();
      const f0 = P0.at(5).frames;
      d.apply({op: 'replaceText', block: [0, 1], at: 0, del: 0,
        ins: 'x'});
      const L = lay(d, m, L0);
      const P = new Pages(galleyOf(L), P0).finish();
      const f = P.at(5).frames;
      assert.notEqual(f, f0);
      assert.deepEqual(f.map((x) => x.frags.map((g) => g.id)),
        f0.map((x) => x.frags.map((g) => g.id)));
      assert.equal(P.at(5).frames, f);
    });

  it('the cursor pass of 1,500 pages builds no frags', () => {
    const d = mk(Array.from({length: 50000}, (_, i) =>
      `${i} ${WORDS[i % 10]} words`));
    const P = new Pages(galleyOf(lay(d, tm()))).finish();
    assert.ok(P.count >= 1500, `${P.count} pages`);
    assert.equal(P.fragsBuilt, 0);
    P.at(700).frames;
    assert.equal(P.fragsBuilt, 1);
  });
});

describe('Pages.ofPos', () => {
  it('the first and the last character; every page\'s start', () => {
    const d = mk(Array.from({length: 200}, (_, i) => long(i)));
    const L = lay(d, tm());
    const P = new Pages(galleyOf(L));
    const lastIt = L.items.at(-1);
    assert.equal(P.ofPos({id: L.items[0].id, off: 0}), 0);
    const i = P.ofPos({id: lastIt.id, off: lastIt.para.text.length});
    assert.ok(P.done);
    assert.equal(i, P.count - 1);
    for (let j = 1; j < P.count; j++) {
      const c = P.at(j).start, it = L.items[c.k];
      const off = it.lines[c.line].from;
      assert.equal(P.ofPos({id: it.id, off}), j, `page ${j}`);
      if (off > 0) {
        assert.equal(P.ofPos({id: it.id, off: off - 1}), j - 1);
      }
    }
  });

  it('works out only the pages it needs', () => {
    const d = mk(Array.from({length: 300}, (_, i) => long(i)));
    const L = lay(d, tm());
    const P = new Pages(galleyOf(L));
    assert.equal(P.ofPos({id: L.items[2].id, off: 0}), 0);
    assert.ok(P.count <= 2 && !P.done, `${P.count}`);
  });

  it('a position in a table cell: the table\'s page; a page break ' +
    'before; unknown ids and bad input: -1', async () => {
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/>' +
      '</w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p>' +
      '</w:tc></w:tr></w:tbl>';
    const {L, G} = await docLayout(p(r('one')) +
      '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>two' +
      '</w:t></w:r></w:p>' + tbl + p(r('three')));
    const P = new Pages(G);
    const cell = [...L.byId.values()].find((x) => x.kind === 'p' &&
      x.para.text === 'cell');
    assert.ok(cell && !L.items.includes(cell));
    assert.equal(P.ofPos({id: cell.id, off: 2}), 1);
    assert.equal(P.ofPos({id: L.items[0].id, off: 1}), 0);
    assert.equal(P.ofPos({id: L.items[1].id, off: 0}), 1);
    assert.equal(P.ofPos({id: L.items[2].id, off: 1}), 1);
    for (const bad of [{id: 'nope', off: 0}, null, undefined, {},
      {id: '__proto__', off: 0}]) {
      assert.equal(P.ofPos(bad), -1);
    }
  });

  it('after a blank page: the page after it', () => {
    const items = tens(5).map((h) => ({h, kind: 'box'}));
    items[3] = {h: 10, kind: 'box', sectStart: 'oddPage'};
    const G = galley({items});
    G.items.forEach((x, k) => { x.ci = k; });
    G.byId = new Map(G.items.map((x) => [x.id, x]));
    const P = new Pages(G);
    assert.ok(P.at(1).blank);
    assert.equal(P.ofPos({id: 'i3', off: 0}), 2);
    assert.equal(P.ofPos({id: 'i2', off: 0}), 0);
  });
});

describe('Pages.atScreen', () => {
  const P = () => pagesOf({items: tens(30)});

  it('a point on a page: its index and the point on the page', () => {
    assert.deepEqual(P().atScreen(5, 5), {i: 0, x: 5, y: 5});
    const top1 = 120 + PAGE_GAP;
    assert.deepEqual(P().atScreen(50, top1 + 7), {i: 1, x: 50, y: 7});
    assert.deepEqual(P().atScreen(0, 2 * top1), {i: 2, x: 0, y: 0});
  });

  it('in the gap, beside or past the pages, bad input: null', () => {
    for (const [x, y] of [[5, 120], [5, 120 + PAGE_GAP - 1],
      [-1, 5], [200, 5], [5, -1], [5, 1e9], [NaN, 5], [5, NaN],
      [5, Infinity]]) {
      assert.equal(P().atScreen(x, y), null, `${x}, ${y}`);
    }
  });

  it('works out pages only as far as y', () => {
    const d = pagesOf({items: tens(3)});
    assert.equal(d.atScreen(5, 5).i, 0);
    const big = new Pages(galley({items: tens(3000)}));
    assert.equal(big.atScreen(5, 3 * (120 + PAGE_GAP) + 5).i, 3);
    assert.ok(big.count <= 5 && !big.done, `${big.count}`);
  });

  it('a blank page is never hit (it takes no room)', () => {
    const items = tens(5);
    items[3] = {h: 10, sectStart: 'oddPage'};
    const Q = pagesOf({items});
    assert.ok(Q.at(1).blank);
    assert.equal(Q.atScreen(5, 120 + PAGE_GAP + 5).i, 2);
  });
});
