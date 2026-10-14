// Newspaper columns on pages (Batch D P10.1, D23): a page of a
// section with columns fills its columns left to right, then the
// next page (./PageCols); a column break ends the column, a
// nextColumn section starts in the next column (a new page in the
// last); a paragraph that lands in a column of another width is
// laid out at that width (./ColPass, keyed by width); Print layout
// places and hits lines in their columns; Draft keeps one column.
// Fake galleys (page-fixtures galley: frame 100 px, margins 10 px,
// pages 200 x 120 px, items from galley y 24) and real documents
// (the fake measurer, word-docs tm: 8 px a character).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {colPass, MAX_TRIES}
  from '../../tools/moreapps/!Letters/ColPass';
import {galley} from './page-fixtures.mjs';
import {balance, fillCols, BALANCE_STEPS, sameCols, colsAlike}
  from '../../tools/moreapps/!Letters/PageCols';
import {cursor} from '../../tools/moreapps/!Letters/PageCursor';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {loadStyles, tm} from './word-docs.mjs';

before(loadStyles);
const tens = (n) => Array(n).fill(10);
const TWO = [{x: 10, w: 85}, {x: 105, w: 85}];
const pagesOf = (spec) => new Pages(galley(spec)).finish();
const cur = (c) => [c.k, c.line];
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const text = (i, n) => Array.from({length: n},
  (_, j) => WORDS[(i + j) % 10]).join(' ');
const COLS2 = '<w:cols w:num="2" w:space="720"/>';
const COLS3 = '<w:cols w:num="3" w:space="300" w:equalWidth="0">' +
  '<w:col w:w="1500" w:space="300"/><w:col w:w="3000" ' +
  'w:space="300"/><w:col w:w="3926"/></w:cols>';
const sect = (inner) => '<w:sectPr>' + inner + '</w:sectPr>';

async function docOf(body) {
  return readDocx(await buildDocx({'word/document.xml':
    documentXml(body)}));
}
function lay(doc, prev, opts) {
  const L = new DocLayout(doc, prev ? prev.metrics : tm(), prev, opts);
  L.layout(1000);
  return L;
}
/** The root items that start in column c of page pg: [k]. */
function landing(pg, c, n) {
  const {start: a, end: b} = pg.cols[c];
  const k0 = a.line || a.dy || a.cuts ? a.k + 1 : a.k;
  const k1 = b.line || b.dy || b.cuts ? b.k + 1 : b.k;
  return Array.from({length: Math.max(0, Math.min(k1, n) - k0)},
    (_, j) => k0 + j);
}

describe('PageCols: frames left to right, then the next page', () => {
  it('2 equal columns fill left then right then page 2', () => {
    const P = pagesOf({items: tens(30), sections: [{cols: TWO}]});
    assert.equal(P.count, 2);
    const pg = P.at(0);
    assert.equal(pg.cols.length, 2);
    assert.deepEqual(pg.cols.map((c) => [cur(c.start), cur(c.end)]),
      [[[0, 0], [10, 0]], [[10, 0], [20, 0]]]);
    assert.deepEqual(cur(pg.end), [20, 0]);
    assert.deepEqual(cur(P.at(1).start), [20, 0]);
    assert.ok(Object.isFrozen(pg.cols) && Object.isFrozen(pg.cols[1]));
    const fr = pg.frames;
    assert.deepEqual(fr.map((f) => [f.x, f.y, f.w, f.h]),
      [[10, 10, 85, 100], [105, 10, 85, 100]]);
    assert.deepEqual(fr[1].frags[0], {id: 'i10', l0: 0, l1: 1,
      x: 105, y: 10});
    assert.equal(fr[1].frags.length, 10);
    assert.equal(P.at(1).frames.length, 1, 'page 2: one column used');
  });

  it('one column: no cols on the page, one frame (as before)', () => {
    const P = pagesOf({items: tens(30)});
    assert.equal(P.count, 3);
    assert.equal(P.at(0).cols, undefined);
    assert.equal(P.at(0).frames.length, 1);
  });

  it('a paragraph split between the columns: its lines in both',
    () => {
      const P = pagesOf({items: [...tens(8), {lines: tens(5)}, 10],
        sections: [{cols: TWO}]});
      const [a, b] = P.at(0).frames;
      assert.deepEqual(a.frags.at(-1), {id: 'i8', l0: 0, l1: 2, x: 10,
        y: 90});
      // line 2 at the second column's top
      assert.deepEqual(b.frags[0], {id: 'i8', l0: 2, l1: 5, x: 105,
        y: 10 - 20});
      assert.equal(P.count, 1);
    });
});

describe('PageCols: column breaks and nextColumn', () => {
  const br = {lines: tens(3), brPage: [0], brCol: [0]};

  it('a column break ends the column: the rest in the next one', () => {
    const P = pagesOf({items: [10, br, 10], sections: [{cols: TWO}]});
    assert.equal(P.count, 1);
    const [c0, c1] = P.at(0).cols;
    assert.equal(c0.why, 'break');
    assert.deepEqual(cur(c0.end), [1, 1]);
    assert.deepEqual(cur(c1.start), [1, 1]);
    assert.deepEqual(cur(c1.end), [3, 0]);
  });

  it('in one column a column break starts a page (as Word)', () => {
    const P = pagesOf({items: [10, br, 10]});
    assert.equal(P.count, 2);
    assert.deepEqual(cur(P.at(1).start), [1, 1]);
  });

  it('a column break in the last column starts a page', () => {
    const P = pagesOf({items: [{lines: tens(3), brPage: [0, 1],
      brCol: [0, 1]}, 10], sections: [{cols: TWO}]});
    assert.equal(P.count, 2);
    assert.deepEqual(P.at(0).cols.map((c) => cur(c.start)),
      [[0, 0], [0, 1]]);
    assert.deepEqual(cur(P.at(1).start), [0, 2]);
  });

  it('a page break in the first column ends the page', () => {
    const P = pagesOf({items: [10, {lines: tens(3), brPage: [0]}, 10],
      sections: [{cols: TWO}]});
    assert.equal(P.count, 2);
    assert.equal(P.at(0).cols.length, 1);
    assert.equal(P.at(0).why, 'break');
  });

  it('a nextColumn section starts in the next column', () => {
    const P = pagesOf({items: [...tens(3), {h: 10,
      sectStart: 'nextColumn'}, ...tens(3)],
    sections: [{cols: TWO}, {cols: TWO}]});
    assert.equal(P.count, 1);
    assert.deepEqual(P.at(0).cols.map((c) => cur(c.start)),
      [[0, 0], [3, 0]]);
    // (the break's band is not placed: the section's first item at
    // the column's top)
    assert.equal(P.at(0).frames[1].frags[0].y, 10);
  });

  it('nextColumn in the last column, or with one column: a new page',
    () => {
      const last = pagesOf({items: [...tens(15), {h: 10,
        sectStart: 'nextColumn'}, 10],
      sections: [{cols: TWO}, {cols: TWO}]});
      assert.equal(last.count, 2);
      assert.deepEqual(cur(last.at(1).start), [15, 0]);
      const one = pagesOf({items: [...tens(3), {h: 10,
        sectStart: 'nextColumn'}, 10]});
      assert.equal(one.count, 2);
    });

  it('every page moves on: an item taller than a column is cut ' +
    'down the columns', () => {
    const P = pagesOf({items: [{kind: 'box', h: 250}, 10],
      sections: [{cols: TWO}]});
    assert.equal(P.count, 2);
    assert.deepEqual(P.at(0).cols.map((c) => c.start.dy || 0),
      [0, 100]);
    assert.equal(P.at(1).start.dy, 200);
  });
});

describe('Real documents: columns, widths, placement', () => {
  const paras = (n, i0 = 0) => Array.from({length: n},
    (_, i) => p(r(text(i0 + i, 6 + (i % 4))))).join('');

  it('2 equal columns: every item lands at the column width ' +
    '(no pass needed)', async () => {
    const doc = await docOf(paras(60) + sect(COLS2));
    const L = lay(doc);
    const P = new Pages(galleyOf(L)).finish();
    const g = L.geom(0);
    assert.equal(g.cols.length, 2);
    assert.ok(P.count >= 1 && P.at(0).cols.length === 2);
    assert.equal(colPass(L, P), null);
    assert.ok(L.items.every((it) => it.w === g.cols[0].w));
  });

  it('3 unequal columns: paragraphs in column 2 laid out at column ' +
    '2\'s width', async () => {
    const doc = await docOf(paras(120) + sect(COLS3));
    let L = lay(doc), P = new Pages(galleyOf(L)).finish();
    const g = L.geom(0), ws = g.cols.map((c) => c.w);
    assert.deepEqual(ws.map(Math.round), [100, 200, 262]);
    assert.ok(L.items.every((it) => it.w === ws[0]),
      'the galley at the first column\'s width');
    const narrow = L.items.map((it) => it.lines.length);
    let passes = 0;
    for (let cw; (cw = colPass(L, P)); passes++) {
      assert.ok(passes < 10, 'converges');
      L = lay(doc, L, {colW: cw});
      P = new Pages(galleyOf(L), P).finish();
    }
    assert.ok(passes >= 1);
    const n = L.items.length;
    let at = 0, left = 0;
    for (let i = 0; i < P.count; i++) {
      const pg = P.at(i);
      pg.cols.forEach((c, j) => {
        const ks = landing(pg, j, n);
        for (const k of ks) {
          const w = L.items[k].w, msg = `page ${i} col ${j} item ${k}`;
          // never wider than its column; another width only for a
          // paragraph at a column's start that, wider, fitted the
          // column before (left at the narrower width, ColPass)
          assert.ok(w <= c.w, msg);
          if (w === c.w) at++;
          else left++;
        }
      });
    }
    assert.ok(at > 10 * left, `${at} at their column's width, ` +
      `${left} left`);
    const k = landing(P.at(0), 1, n).find((x) =>
      L.items[x].w === ws[1]);
    assert.ok(k !== undefined, 'paragraphs at column 2\'s width');
    assert.ok(L.items[k].lines.length < narrow[k],
      'fewer lines at the wider width');
    for (const ln of L.items[k].lines) {
      const e = ln.items.at(-1);
      assert.ok(!e || e.x + e.w <= ws[1] + 0.5, 'within the column');
    }
  });

  it('the pass is bounded: at most MAX_TRIES widths per paragraph ' +
    'per page settling', async () => {
    const doc = await docOf(paras(120) + sect(COLS3));
    let L = lay(doc), P = new Pages(galleyOf(L)).finish();
    const seen = new Map();
    for (let cw, i = 0; (cw = colPass(L, P)) && i < 50; i++) {
      for (const pg of cw.pages.values()) {
        for (const [id, t] of pg.tries) seen.set(id, t);
      }
      L = lay(doc, L, {colW: cw});
      P = new Pages(galleyOf(L), P).finish();
    }
    assert.ok([...seen.values()].every((t) => t <= MAX_TRIES));
  });

  it('Draft keeps one column: a layout without the pass has every ' +
    'item at the first column\'s width', async () => {
    const doc = await docOf(paras(40) + sect(COLS3));
    const L = lay(doc);
    assert.equal(L.colW, null);
    assert.ok(L.items.every((it) => it.w === L.geom(0).cols[0].w));
  });

  it('Draft layout unchanged (snapshot)', async () => {
    const body = p(r(text(0, 12))) + p(r(text(1, 30)) +
      '<w:r><w:br w:type="column"/></w:r>' + r(text(2, 5))) +
      p(r(text(3, 9)), sect(COLS2)) + p(r(text(4, 14))) +
      p(r(text(5, 20))) + sect(COLS3);
    const L = lay(await docOf(body));
    const snap = L.items.map((it) => [it.w, it.y, it.h,
      it.lines.length]);
    assert.deepEqual(snap, [[276.8666666666667, 24, 55.012499999999996,
      3], [276.8666666666667, 79.01249999999999, 128.3625, 7],
    [276.8666666666667, 207.375, 36.675, 2], [100, 262.05, 128.3625, 7],
    [100, 390.4125, 201.71250000000003, 11]]);
  });

  it('a column break in a real paragraph ends the column', async () => {
    const body = p(r(text(0, 4)) + '<w:r><w:br w:type="column"/></w:r>' +
      r(text(1, 4))) + p(r(text(2, 4))) + sect(COLS2);
    const L = lay(await docOf(body));
    const P = new Pages(galleyOf(L)).finish();
    assert.equal(P.count, 1);
    const [c0, c1] = P.at(0).cols;
    assert.equal(c0.why, 'break');
    assert.deepEqual(cur(c1.start), [0, 1]);
  });

  it('Print layout: a line in column 2 is placed and hit there',
    async () => {
      const doc = await docOf(paras(80) + sect(COLS2));
      const L = lay(doc), P = new Pages(galleyOf(L));
      const Pl = L.place = PlacePrint(L, P);
      const pg = P.at(0), c1 = pg.cols[1], S = Pl.sheet, o = S.rect(pg);
      const it = L.items[c1.start.k], k = c1.start.line;
      const at = Pl.lineAt(it, k);
      assert.equal(at.page, 0);
      assert.equal(at.x, Math.round(o.x + c1.x - it.x) + it.x);
      // (fragments move by whole px: within one of the frame's top)
      assert.ok(Math.abs(at.y - (o.y + pg.bodyTop)) < 1, `${at.y}`);
      const h = Pl.hit(at.x + 4, at.y + 2);
      assert.equal(h.it, it);
      assert.equal(h.k, k);
      // the same height in column 1: column 1's item
      const h0 = Pl.hit(o.x + pg.cols[0].x + 4, at.y + 2);
      assert.equal(h0.it, L.items[0]);
      const rs = Pl.rects(it, k, k + 1);
      assert.equal(rs.length, 1);
      assert.equal(rs[0].x, at.x);
    });

  it('an edit: the pages with columns of the new layout are a fresh ' +
    'pagination\'s', async () => {
    const d = new Document(await docOf(paras(150) + sect(COLS2)));
    d.clearHistory();
    const L0 = lay(d.doc), P0 = new Pages(galleyOf(L0)).finish();
    d.apply({op: 'replaceText', block: [0, 40], at: 0, del: 0,
      ins: 'more words here and there '});
    const L1 = lay(d.doc, L0), P1 = new Pages(galleyOf(L1), P0).finish();
    const F = new Pages(galleyOf(lay(d.doc))).finish();
    const flat = (Q) => Q.list.map((pg) => [cur(pg.start), cur(pg.end),
      pg.cols.map((c) => [cur(c.start), cur(c.end), c.y0, c.why])]);
    assert.deepEqual(flat(P1), flat(F));
    assert.ok(P1.kept > 0);
  });
});

describe('Balancing before a continuous break (P10.2, D23, PG26)', () => {
  const cont = (n) => ({h: 10, sectStart: 'continuous', id: 'c' + n});
  const two = (items, more = [{}]) => pagesOf({frame: 200, items,
    sections: [{cols: TWO}, ...more]});
  const lens = (pg) => pg.cols.map((c) => c.end.k - c.start.k);

  it('2 columns of 30 lines before a continuous break: 15 / 15',
    () => {
      const P = two([...tens(30), cont(0), 10]);
      assert.equal(P.count, 1);
      const pg = P.at(0);
      assert.deepEqual(lens(pg).slice(0, 2), [15, 15]);
      assert.deepEqual(pg.cols.map((c) => cur(c.start)),
        [[0, 0], [15, 0], [30, 0]]);
      assert.equal(pg.cols[1].why, 'cont');
    });

  it('an odd count, 31 lines: 16 / 15', () => {
    const P = two([...tens(31), cont(0), 10]);
    assert.deepEqual(lens(P.at(0)).slice(0, 2), [16, 15]);
  });

  it('no balancing at the document end (PG26)', () => {
    const P = two(tens(30), []);
    assert.deepEqual(lens(P.at(0)), [20, 10]);
    assert.ok(P.at(0).cols.every((c) => c.top === 0 && c.h === 200));
  });

  it('a following 1-column section starts below the balanced ' +
    'columns, at the text width', () => {
    const P = two([...tens(30), cont(0), 10, 10]);
    const pg = P.at(0), c = pg.cols[2];
    assert.deepEqual([c.x, c.w, c.top, c.h], [10, 180, 150, 50]);
    assert.deepEqual(pg.cols.slice(0, 2).map((x) => [x.top, x.h]),
      [[0, 150], [0, 150]]);
    const fr = pg.frames;
    assert.deepEqual(fr.map((f) => [f.x, f.y, f.w, f.h]),
      [[10, 10, 85, 150], [105, 10, 85, 150], [10, 160, 180, 50]]);
    // (the break's band is not placed: the section's first item at
    // the band's top)
    assert.deepEqual(fr[2].frags[0], {id: 'c0', l0: 0, l1: 1, x: 10,
      y: 160});
    assert.equal(c.used, 30);
    assert.deepEqual(cur(pg.end), [33, 0]);
  });

  it('a continuous section with another column count: a 1-column ' +
    'section, then 2 columns below it, then 1 again', () => {
    const P = pagesOf({frame: 200, items: [...tens(3),
      cont(0), ...tens(9), cont(1), 10],
    sections: [{}, {cols: TWO}, {}]});
    assert.equal(P.count, 1);
    const pg = P.at(0);
    assert.deepEqual(pg.cols.map((c) => [cur(c.start), c.x, c.top]),
      [[[0, 0], 10, 0], [[3, 0], 10, 30], [[8, 0], 105, 30],
        [[13, 0], 10, 80]]);
    assert.deepEqual(lens(pg), [3, 5, 5, 2]);
  });

  it('the same column count after a continuous break: balanced too',
    () => {
      const P = two([...tens(10), cont(0), ...tens(4)], [{cols: TWO}]);
      const pg = P.at(0);
      // (the second section ends the document: not balanced)
      assert.deepEqual(lens(pg), [5, 5, 5]);
      assert.deepEqual(pg.cols.map((c) => c.top), [0, 0, 50]);
    });

  it('a section that runs over pages: only its last page balanced',
    () => {
      const P = two([...tens(50), cont(0), 10]);
      assert.equal(P.count, 2);
      assert.deepEqual(lens(P.at(0)), [20, 20]);
      assert.deepEqual(lens(P.at(1)).slice(0, 2), [5, 5]);
      assert.equal(P.at(1).cols[2].top, 50);
    });

  it('no room left below the balanced columns: the next section ' +
    'starts the next page', () => {
    const P = two([...tens(40), cont(0), 10]);
    assert.equal(P.count, 2);
    assert.deepEqual(lens(P.at(0)), [20, 20]);
    assert.deepEqual(cur(P.at(1).start), [40, 0]);
    assert.equal(P.at(1).cols, undefined);
  });

  it('balancing takes at most 12 fills (a spy on the frames tried)',
    () => {
      const tried = new Set();
      const reserve = (fr) => {
        tried.add(fr.frameH);
        return 0;
      };
      const items = Array.from({length: 61}, (_, i) => ({h: 7 + i % 6,
        refs: ['r']}));
      const P = pagesOf({frame: 100000, reserve, items: [...items,
        cont(0), 10], sections: [{cols: TWO}, {}]});
      tried.delete(100000);
      assert.ok(tried.size >= 1 && tried.size <= 12, `${tried.size}`);
      const pg = P.at(0);
      assert.equal(P.count, 1);
      assert.deepEqual(cur(pg.cols[2].start), [61, 0]);
      const [a, b] = pg.cols, all = a.used + b.used;
      assert.ok(b.used > 0 && a.used < 0.6 * all, `${a.used} ${b.used}`);
    });

  it('less than a line a column (P10 fix I1): the line whole in ' +
    'column 1, never cut between the columns', () => {
    for (const first of [10, {lines: [40]}, {kind: 'box', h: 60}]) {
      const P = two([first, cont(0), 10]);
      const pg = P.at(0);
      assert.ok(!pg.cols.some((c) => c.why === 'cut'),
        JSON.stringify(pg.cols.map((c) => [c.why, c.h])));
      assert.deepEqual(cur(pg.cols[0].start), [0, 0]);
      assert.deepEqual(cur(pg.cols[0].end), [1, 0]);
      const fr = pg.frames;
      const ids = fr.map((f) => f.frags.map((x) => x.id));
      assert.deepEqual(ids[0], ['i0']);
      assert.ok(!ids.slice(1, -1).flat().includes('i0'), `${ids}`);
    }
  });

  it('a band below with less room than a line (P10 fix I1): not ' +
    'placed, its first line not cut across the columns', () => {
    const P = pagesOf({frame: 200, items: [...tens(19), 5,
      {...cont(0), h: 10}, ...tens(8)], sections: [{}, {cols: TWO}]});
    const pg = P.at(0);
    assert.ok(!(pg.cols || []).some((c) => c.why === 'cut'),
      JSON.stringify(pg.cols));
    const lines = new Map();
    for (let i = 0; i < P.count; i++) {
      for (const f of P.at(i).frames) {
        for (const g of f.frags) {
          for (let j = g.l0; j < g.l1; j++) {
            const key = g.id + ':' + j;
            lines.set(key, (lines.get(key) || 0) + 1);
          }
        }
      }
    }
    assert.ok([...lines.values()].every((n) => n === 1),
      JSON.stringify([...lines].filter(([, n]) => n !== 1)));
  });

  it('a cut the unbalanced fill has too is kept (an item taller ' +
    'than the frame)', () => {
    const P = two([{kind: 'box', h: 300}, cont(0), 10]);
    assert.ok(P.count >= 1);
    assert.ok(P.at(0).cols.some((c) => c.why === 'cut'));
  });

  it('balance(G, from, frames): the least frame height the content ' +
    'fits; the frame height when not before a continuous break',
  () => {
    const run = (items) => {
      const G = galley({frame: 200, items, sections: [{cols: TWO},
        {}]});
      const q = {start: cursor(0, 0), end: null, s: 0, frameH: 200,
        y0: 24, used: 0, why: 'end', seen: 0};
      fillCols(G, q, TWO, 0, 0, 24);
      return balance(G, q.start, q);
    };
    assert.equal(run([...tens(31), cont(0), 10]), 160);
    assert.equal(run([...tens(30), cont(0), 10]), 150);
    assert.equal(run(tens(31)), 200);
    assert.equal(BALANCE_STEPS, 12);
  });
});

describe('Balancing in real documents (P10.2)', () => {
  const paras = (n, i0 = 0) => Array.from({length: n},
    (_, i) => p(r(text(i0 + i, 6 + (i % 4))))).join('');
  const CONT = '<w:type w:val="continuous"/>';

  it('one line in a continuous 2-column section (P10 fix I1): whole ' +
    'in column 1, not drawn in two halves', async () => {
    const S = (t, c) => '<w:sectPr>' + (t ? CONT : '') +
      `<w:cols w:num="${c}" w:space="720"/></w:sectPr>`;
    const doc = await docOf(p(r('Intro'), S(false, 1)) +
      p(r('Hello world'), S(true, 2)) + p(r('After')) + S(true, 1));
    const L = lay(doc), P = new Pages(galleyOf(L)).finish();
    const pg = P.at(0), id = L.items[1].id;
    assert.ok(!pg.cols.some((c) => c.why === 'cut'));
    const holding = pg.frames.filter((f) => f.frags.some((x) =>
      x.id === id));
    assert.equal(holding.length, 1);
    assert.equal(holding[0].frags.find((x) => x.id === id).y,
      holding[0].y);
  });

  it('2 columns then a continuous 1-column section: balanced, the ' +
    'next section below; an edit converges to a fresh pagination',
  async () => {
    const body = paras(30) + p(r('end'), sect(COLS2)) + paras(5, 3) +
      sect(CONT);
    const d = new Document(await docOf(body));
    d.clearHistory();
    const L0 = lay(d.doc), P0 = new Pages(galleyOf(L0)).finish();
    const pg = P0.at(0);
    assert.ok(pg.cols.length >= 3, `${pg.cols.length}`);
    const [a, b, c] = pg.cols;
    assert.ok(Math.abs(a.used - b.used) <= 30, `${a.used} ${b.used}`);
    assert.ok(c.top >= Math.max(a.used, b.used) - 0.01);
    assert.equal(c.w, L0.geom(1).cols[0].w);
    // Print layout: section 2's first line below the columns
    const Pl = L0.place = PlacePrint(L0, P0), o = Pl.sheet.rect(pg);
    const it = L0.items[c.start.k], at = Pl.lineAt(it, 0);
    assert.ok(Math.abs(at.y - (o.y + pg.bodyTop + c.top)) < 1,
      `${at.y} ${o.y + pg.bodyTop + c.top}`);
    const h = Pl.hit(at.x + 4, at.y + 2);
    assert.equal(h.it, it);
    d.apply({op: 'replaceText', block: [0, 3], at: 0, del: 0,
      ins: 'more words here and there and more '});
    const L1 = lay(d.doc, L0), P1 = new Pages(galleyOf(L1), P0).finish();
    const F = new Pages(galleyOf(lay(d.doc))).finish();
    const flat = (Q) => Q.list.map((x) => [cur(x.start), cur(x.end),
      (x.cols || []).map((y) => [cur(y.start), cur(y.end), y.y0,
        y.why, y.top, y.h])]);
    assert.deepEqual(flat(P1), flat(F));
  });
});

describe('Column records compared within 1e-9 px (P10 fix M1)', () => {
  const col = (o = {}) => ({x: 10, w: 85, start: cursor(3, 0),
    end: cursor(9, 2, 4.5), y0: 120, used: 80, why: 'full', top: 0,
    h: 293.3999999999987, ...o});
  it('sameCols: float noise from another order of sums is the same; ' +
    'a real difference is not', () => {
    const a = [col()];
    assert.ok(sameCols(a, [col({h: 293.40000000000055})]));
    assert.ok(sameCols(a, [col({top: 1e-12, used: 80 + 1e-11,
      y0: 120 - 1e-10, end: cursor(9, 2, 4.5 + 1e-12)})]));
    assert.ok(!sameCols(a, [col({h: 293.4 + 1e-6})]));
    assert.ok(!sameCols(a, [col({end: cursor(9, 2, 4.6)})]));
    assert.ok(!sameCols(a, [col({why: 'cut'})]));
  });
  it('colsAlike: the same within 1e-9, cursors moved by d', () => {
    const a = [col()];
    const b = [col({start: cursor(5, 0), end: cursor(11, 2, 4.5 + 1e-12),
      top: 2e-12, h: 293.40000000000055})];
    assert.ok(colsAlike(a, b, 2));
    assert.ok(!colsAlike(a, [{...b[0], top: 0.001}], 2));
  });
});
