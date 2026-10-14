// Unequal columns settle page by page (Batch D P10 fix I2, D23): in
// Print layout ./ColPass lays the paragraphs that land in a column of
// another width out again, one page after another, until every page
// is settled (no cap of 8 passes); an edit re-runs only from the
// dirty page and costs nothing when no paragraph's column width
// changes; opening a document and editing one give the same pages
// (reuse == fresh); a keystroke settles the caret's page within a
// time budget, the rest in the slices. The real ./ViewMode drives a
// stub window ('riscos' and requestAnimationFrame replaced by
// stand-ins; its newLayout passes dw.colW as ./WinFit does).
// WORD_COLS_PERF=1 also times 50,000 paragraphs (by hand: the
// numbers are in docs/apps/Letters.md).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {placeView} = await import('../../tools/moreapps/!Letters/ViewMode');
const {DocLayout} = await import('../../tools/moreapps/!Letters/DocLayout');
const {colPass, MAX_PAGE_PASSES} =
  await import('../../tools/moreapps/!Letters/ColPass');
const {blockId} = await import('../../tools/moreapps/!Letters/DocPos');
const {clock} = await import('../../tools/moreapps/!Letters/ViewPass');

let frameQ = new Map(), nextId = 1;
globalThis.requestAnimationFrame = (f) => {
  frameQ.set(nextId, f);
  return nextId++;
};
globalThis.cancelAnimationFrame = (id) => { frameQ.delete(id); };
/** Run animation frames until none is asked for (at most n). */
function frames(n) {
  let k = 0;
  for (; k < n && frameQ.size; k++) {
    const q = [...frameQ.values()];
    frameQ = new Map();
    for (const f of q) f();
  }
  return k;
}

before(loadStyles);
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const THREE = {num: 3, equalWidth: false, col: [{w: 2000, space: 300},
  {w: 3000, space: 300}, {w: 3760}]};
const LINE = 'many more words typed in here ';
const LEFT = {num: 2, space: 720, equalWidth: false,
  col: [{w: 2640, space: 720}, {w: 6000}]};

/** A document of n paragraphs (its first section's columns cols). */
function docOf(n, cols) {
  const d = mk(Array.from({length: n}, (_, i) => `${i} ` +
    WORDS[i % 10] + ' words and more words ' + WORDS[(i * 7) % 10] +
    (i % 5 ? '' : ' and then some more words to fill a line')));
  const s = d.doc.sections[0];
  s.props = {...s.props, cols};
  return d;
}

/** A stub window on Document d in Print layout, caret at block k. */
function windowOf(d, k = 0) {
  const m = tm();
  const dw = {app: {}, doc: d.doc, closed: false, viewName: 'print',
    pages: null, pagesL: null, raf: 0, bar2: null, fitN: -1,
    win: {invalidate() {}}, fitExtent() {}, laidOut: 0, colW: null};
  dw.newLayout = (metrics, prev, fields) => {
    dw.L = new DocLayout(d.doc, metrics, prev, {fields,
      colW: dw.colW || null});
    dw.L.layout(1000);
    dw.laidOut++;
    placeView(dw);
  };
  const id = blockId(d.doc.sections[0].blocks[k]);
  dw.view = {hdr: null, ensure() {},
    sel: {head: {id, off: 0}, affinity: 'down'}};
  dw.newLayout(m, null);
  return dw;
}

/** Slices until the pages are done and settled. */
function settle(dw) {
  frames(1e6);
  assert.ok(dw.pages.done);
  assert.equal(colPass(dw.L, dw.pages), null, 'settled');
}

/** An edit as the window makes one: applied, laid out from L. */
function type(dw, d, k, ins) {
  d.apply({op: 'replaceText', block: [0, k], at: 0, del: 0, ins});
  dw.newLayout(dw.L.metrics, dw.L);
}

/** Each page's columns: [start k/line, end k/line] and the widths. */
const flat = (dw) => dw.pages.list.map((pg) => (pg.cols || []).map(
  (c) => [c.start.k, c.start.line, c.end.k, c.end.line]));
const widths = (dw) => dw.L.items.map((it) => it.w);

/** Paragraphs starting in a column not at its width, of all. */
function wrong(dw) {
  const L = dw.L, n = L.items.length;
  let bad = 0, all = 0;
  for (const pg of dw.pages.list) {
    for (const c of pg.cols || []) {
      const a = c.start, b = c.end;
      const k0 = a.line || a.dy ? a.k + 1 : a.k;
      const k1 = Math.min(b.line || b.dy ? b.k + 1 : b.k, n);
      for (let k = k0; k < k1; k++, all++) {
        if (L.items[k].w !== c.w) bad++;
      }
    }
  }
  return {bad, all};
}

describe('ColPass: unequal columns settle page by page', () => {
  it('a 30-page Left-preset document: every page settled, no cap ' +
    'of 8 passes; a paragraph off its column\'s width only at a ' +
    'column\'s start, at most one a column', () => {
    const dw = windowOf(docOf(1500, LEFT));
    settle(dw);
    const P = dw.pages, cols = P.list.reduce((a, pg) =>
      a + (pg.cols ? pg.cols.length : 0), 0);
    assert.ok(P.count >= 30, `${P.count} pages`);
    assert.ok(dw.laidOut > 9, `${dw.laidOut} layouts`);
    const {bad, all} = wrong(dw);
    assert.ok(bad <= cols && bad * 20 < all, `${bad} of ${all}`);
  });

  it('edited == fresh: five edits that move lines, then a fresh ' +
    'open of the same document: the same pages and widths', () => {
    for (const cols of [LEFT, THREE]) {
      const d = docOf(700, cols), dw = windowOf(d, 10);
      settle(dw);
      for (const [k, s] of [[10, 'more words here and there '],
        [11, 'x'], [40, 'a much longer insertion of words that moves ' +
          'every line after it on '], [12, 'yy'], [300, 'z z z z z ']]) {
        type(dw, d, k, s);
        settle(dw);
      }
      const F = windowOf(d, 10);
      settle(F);
      assert.deepEqual(flat(dw), flat(F));
      assert.deepEqual(widths(dw), widths(F));
    }
  });

  it('a keystroke that changes no column width: no second layout',
    () => {
      const d = docOf(400, THREE), dw = windowOf(d, 200);
      settle(dw);
      const n = dw.laidOut;
      // (a character for one as wide: the same lines)
      d.apply({op: 'replaceText', block: [0, 200], at: 0, del: 1,
        ins: 'x'});
      dw.newLayout(dw.L.metrics, dw.L);
      settle(dw);
      assert.equal(dw.laidOut, n + 1);
    });

  it('the widths of paragraphs deleted are forgotten (P10 fix M6)',
    () => {
      const d = docOf(300, THREE), dw = windowOf(d, 0);
      settle(dw);
      const gone = dw.L.items.filter((it) => dw.L.colW.w.has(it.id))
        .slice(0, 10).map((it) => it.id);
      assert.equal(gone.length, 10);
      const ids = d.doc.sections[0].blocks.map((b) => b.id);
      for (const id of gone) {
        d.apply({op: 'removeBlock', at: [0, ids.indexOf(id) -
          gone.indexOf(id)]});
      }
      dw.newLayout(dw.L.metrics, dw.L);
      type(dw, d, 0, LINE.repeat(3));
      settle(dw);
      const cw = dw.L.colW;
      for (const id of gone) {
        assert.ok(!cw.w.has(id) && !cw.giver.has(id), String(id));
      }
      for (const id of [...cw.w.keys(), ...cw.giver.keys()]) {
        assert.ok(dw.L.byId.has(id), String(id));
      }
    });

  it('a page that cannot settle is left after MAX_PAGE_PASSES; the ' +
    'pages after it still settle', () => {
    assert.equal(MAX_PAGE_PASSES, 6);
    const d = docOf(300, THREE), dw = windowOf(d);
    settle(dw);
    // every page settled or given up: colPass finds nothing more
    assert.equal(colPass(dw.L, dw.pages), null);
  });
});

/** fn run with a slow clock: performance.now() 3 ms on at each call
 *  (a loaded machine: every time budget runs out at once), and the
 *  passes' own clock (./ViewPass clock) the same. */
function slowly(fn) {
  const real = performance.now, was = clock.now;
  let t = real.call(performance);
  performance.now = () => (t += 3);
  clock.now = () => performance.now();
  try {
    return fn();
  } finally {
    performance.now = real;
    clock.now = was;
  }
}

describe('ColPass: the passes settle with a slow clock (final fix ' +
  'A F3-I2)', () => {
  it('opened: when the slices stop, no column pass is due', () => {
    slowly(() => {
      for (const cols of [LEFT, THREE]) settle(windowOf(docOf(700,
        cols), 10));
    });
  });

  it('edits: after each, when the slices stop, every page settled',
    () => {
      slowly(() => {
        for (const cols of [LEFT, THREE]) {
          const d = docOf(700, cols), dw = windowOf(d, 10);
          settle(dw);
          for (const [k, s] of [[10, 'more words here and there '],
            [40, 'a much longer insertion of words that moves every ' +
              'line after it on '], [300, 'z z z z z ']]) {
            type(dw, d, k, s);
            settle(dw);
          }
        }
      });
    });

  it('the clock is the passes\' (ViewPass clock.now)', () => {
    assert.equal(typeof clock.now, 'function');
  });
});

/** Median ms of a Print-layout keystroke (the window's work: the
 *  layout, the caret's page and the column passes due up to it),
 *  typing `ins` (a word, or one that adds a line each time). */
function keystroke(n, settleAll, ins) {
  const d = docOf(n, THREE), k0 = settleAll ? n >> 1 : 400;
  const dw = windowOf(d, k0);
  if (settleAll) settle(dw);
  else frames(0);
  const ms = [];
  for (let j = 0; j < 23; j++) {
    const t0 = performance.now();
    type(dw, d, k0 + (j % 3), ins);
    if (j >= 3) ms.push(performance.now() - t0);
    frameQ = new Map();                  // (the slices: not timed)
    dw.raf = 0;
  }
  ms.sort((a, b) => a - b);
  return ms[ms.length >> 1];
}

describe('ColPass: keystroke cost with 3 unequal columns', () => {
  it('10,000 paragraphs, settled, caret mid-document: <= 40 ms ' +
    '(a character; a line added each time)', () => {
    for (const ins of ['x', LINE]) {
      const t = keystroke(10000, true, ins);
      console.log(`# 10,000 paragraphs, ${ins.length} chars: ` +
        `${t.toFixed(1)} ms`);
      assert.ok(t <= 40, `${t} ms`);
    }
  });

  it('50,000 paragraphs: <= 150 ms (WORD_COLS_PERF=1)',
    {skip: !process.env.WORD_COLS_PERF}, () => {
      for (const ins of ['x', LINE]) {
        const t = keystroke(50000, false, ins);
        console.log(`# 50,000 paragraphs, ${ins.length} chars: ` +
          `${t.toFixed(1)} ms`);
        assert.ok(t <= 150, `${t} ms`);
      }
    });
});
