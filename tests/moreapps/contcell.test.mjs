// The hidden part of a vertical merge (C3 fix wave, review C3a I1): a
// vMerge continue cell's paragraphs stay in the flow (D9 ranks) but
// are never drawn or hit, so no key leaves the caret there: Left /
// Right, the word and paragraph moves and Shift-extend pass them (as
// Up / Down, clicks and Tab do); Selection.clamp maps a position in
// one to the start of the merge's restart cell; TblPos firstPos /
// lastPos / cellPos / rowPos never give one. A seeded walk of random
// moves and typing never puts the caret or text in one.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {contOf, shown, firstPos, lastPos, cellPos, rowPos}
  from '../../tools/moreapps/!Letters/TblPos';
import * as E from '../../tools/moreapps/!Letters/Edit';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {loadStyles, tm, rng} from './word-docs.mjs';
import {mk, S} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

before(loadStyles);

const lay = (doc, w = 800) => {
  const L = new DocLayout(doc, tm());
  L.layout(w);
  return L;
};

/** The block whose text is t (any depth). */
function byText(doc, t) {
  let out = null;
  forEachBlock(doc, (b) => {
    if (!out && b.type === 'p' && b.text === t) out = b;
  });
  return out;
}
const pos = (d, t, off = 0) => ({id: byText(d.doc, t).id, off});
const name = (d, p) => {
  let out = null;
  forEachBlock(d.doc, (b) => {
    if (b.id === p.id) out = b.type === 'p' ? `${b.text}:${p.off}`
      : `tbl:${p.off}`;
  });
  return out;
};
const vm = (v, blocks) => ({tcPr: {vMerge: v, extra: []},
  blocks: Array.isArray(blocks) ? blocks : [blocks]});
/** Whether position p is in a continue cell (hidden). */
const hidden = (doc, p) => {
  const loc = findBlock(doc, p.id);
  return !!loc && !!contOf(doc, loc.at);
};

/** Before, [[top, a, b], [(continue: cont...), c, d]], After. */
function fixture(cont = ['']) {
  const T = modelTable([[vm('restart', 'top'), 'a', 'b'],
    [vm('continue', cont), 'c', 'd']]);
  const d = mk(['Before', freeze(T), 'After']);
  return {d, T, L: lay(d.doc)};
}

describe('Left and Right pass a continue cell (review C3a I1)', () => {
  it('Right from b\'s end goes to c, Left from c back to b', () => {
    const {d, L} = fixture();
    let s = S.caret(pos(d, 'b', 1));
    s = S.move(s, L, 'right');
    assert.equal(name(d, s.head), 'c:0');
    s = S.move(s, L, 'left');
    assert.equal(name(d, s.head), 'b:1');
  });
  it('with text and a nested table in the continue cell: still passed',
    () => {
      const N = modelTable([['n1', 'n2']]);
      const {d, L} = fixture(['h1', N, 'h2']);
      let s = S.caret(pos(d, 'b', 1));
      for (const want of ['c:0', 'c:1', 'd:0']) {
        s = S.move(s, L, 'right');
        assert.equal(name(d, s.head), want);
      }
      s = S.caret(pos(d, 'c', 0));
      s = S.move(s, L, 'left');
      assert.equal(name(d, s.head), 'b:1');
    });
  it('word, paragraph moves and Shift-extend pass it too', () => {
    const {d, L} = fixture(['hid']);
    const from = S.caret(pos(d, 'b', 1));
    for (const cmd of ['right', 'wordRight', 'paraEnd']) {
      const s = S.move(from, L, cmd, true);
      assert.ok(!hidden(d.doc, s.head), cmd);
      assert.equal(name(d, s.anchor), 'b:1');
      assert.equal(s.head.id, pos(d, 'c').id, cmd);
    }
    const back = S.caret(pos(d, 'c', 0));
    for (const cmd of ['left', 'wordLeft', 'paraStart']) {
      const s = S.move(back, L, cmd, true);
      assert.ok(!hidden(d.doc, s.head), cmd);
      assert.equal(s.head.id, pos(d, 'b').id, cmd);
    }
  });
  it('a merge in the last row: Right from the table\'s last shown ' +
    'cell goes out to After; Left from After comes back to it', () => {
      const T = modelTable([['a', vm('restart', 'm')],
        ['c', vm('continue', 'hid')]]);
      const d = mk(['Before', freeze(T), 'After']);
      const L = lay(d.doc);
      let s = S.move(S.caret(pos(d, 'c', 1)), L, 'right');
      assert.equal(name(d, s.head), 'After:0');
      s = S.move(s, L, 'left');
      assert.equal(name(d, s.head), 'c:1');
    });
});

describe('caret places never hidden (TblPos, Selection.clamp)', () => {
  it('lastPos skips a continue cell; cellPos and rowPos give the ' +
    'restart cell', () => {
      const T = modelTable([['a', vm('restart', 'm')],
        [vm('restart', 'x'), vm('continue', 'hid')],
        [vm('continue', 'h2'), vm('continue', 'h3')]]);
      const d = mk([freeze(T)]);
      assert.equal(name(d, lastPos(T)), 'x:1');
      assert.equal(name(d, firstPos(T)), 'a:0');
      assert.equal(name(d, cellPos(T, 1, 1)), 'm:0');
      assert.equal(name(d, rowPos(T, 2)), 'x:0');
      assert.equal(name(d, rowPos(T, 1)), 'x:0');
    });
  it('contOf: the outermost continue cell, also around a nested one',
    () => {
      const N = modelTable([[vm('restart', 'nt')],
        [vm('continue', 'nh')]]);
      const {d, T} = fixture(['h1', N, 'h2']);
      const at = findBlock(d.doc, pos(d, 'nh').id).at;
      const c = contOf(d.doc, at);
      assert.deepEqual(c, {tp: [0, 1], r: 0, k: 0});
      assert.equal(contOf(d.doc, findBlock(d.doc, pos(d, 'c').id).at),
        null);
      assert.equal(contOf(d.doc, [0, 0]), null);
      assert.equal(name(d, shown(d.doc, pos(d, 'nh', 1))), 'top:0');
      assert.equal(T.rows.length, 2);
    });
  it('clamp maps a caret or an end in a continue cell to the restart ' +
    'cell\'s start', () => {
      const {d} = fixture(['hid']);
      const c = S.clamp(S.caret(pos(d, 'hid', 2)), d.doc);
      assert.equal(name(d, c.head), 'top:0');
      assert.equal(name(d, c.anchor), 'top:0');
      const s = S.clamp(S.select(pos(d, 'a', 0), pos(d, 'hid', 1)),
        d.doc);
      assert.equal(name(d, s.anchor), 'a:0');
      assert.equal(name(d, s.head), 'top:0');
      const v = S.clamp(S.caret(pos(d, 'c', 1)), d.doc);
      assert.equal(name(d, v.head), 'c:1', 'a shown cell: unchanged');
    });
});

describe('a seeded walk never reaches a hidden paragraph', () => {
  const CMDS = ['left', 'right', 'wordLeft', 'wordRight', 'paraStart',
    'paraEnd', 'up', 'down', 'home', 'end'];
  it('600 random moves (some extending) and typing, 3 documents',
    () => {
      const r = rng(41);
      const pick = (xs) => xs[Math.floor(r() * xs.length)];
      const N = () => modelTable([[vm('restart', 'n1'), 'n2'],
        [vm('continue', 'nh'), 'n3']]);
      const docs = [
        () => [modelTable([[vm('restart', 'a'), 'b', vm('restart', 'c')],
          [vm('continue', 'h1'), 'd', vm('continue', ['h2', N(), 'h4'])],
          [vm('continue', 'h3'), 'e', 'f']]), 'p'],
        () => ['p', modelTable([['a', ['b', N(), 'b2']],
          [vm('restart', 'c'), 'd'], [vm('continue', ''), 'e']])],
        () => ['p', modelTable([[vm('restart', 'a'), vm('restart', 'b')],
          [vm('continue', 'h1'), vm('continue', 'h2')]]), 'q'],
      ];
      for (const make of docs) {
        const d = mk(make().map((b) => (b.type ? freeze(b) : b)));
        let s = S.caret(firstShown(d));
        for (let n = 0; n < 200; n++) {
          const L = lay(d.doc);
          s = S.move(s, L, pick(CMDS), r() < 0.3);
          assert.ok(!hidden(d.doc, s.head), `head ${n}`);
          assert.ok(!hidden(d.doc, s.anchor), `anchor ${n}`);
          if (r() < 0.15 && S.collapsed(s)) {
            const out = E.typeText(d, s, 'Q');
            assert.ok(!hidden(d.doc, out.head), `typed ${n}`);
            s = S.clamp(out, d.doc);
          }
        }
        forEachBlock(d.doc, (b, at) => {
          if (b.type === 'p' && contOf(d.doc, at)) {
            assert.ok(!b.text.includes('Q'), `typed into ${b.text}`);
          }
        });
      }
    });
});

/** The first paragraph of the document that is shown. */
function firstShown(d) {
  let out = null;
  forEachBlock(d.doc, (b, at) => {
    if (!out && b.type === 'p' && !contOf(d.doc, at)) {
      out = {id: b.id, off: 0};
    }
  });
  return out;
}

describe('the hidden columns are marked once per layout (C7.1)', () => {
  it('Right across 4995 hidden cells of a 1000 x 5 table whose ' +
    'columns are merged top to bottom: a fresh layout each time, ' +
    'the first press as cheap as the rest', () => {
    const rows = [[0, 1, 2, 3, 4].map((c) => vm('restart', `t${c}`))];
    for (let r = 1; r < 1000; r++) {
      rows.push([0, 1, 2, 3, 4].map(() => vm('continue', '')));
    }
    const d = mk(['Before', freeze(modelTable(rows)), 'After']);
    const times = [];
    for (let k = 0; k < 5; k++) {
      const L = lay(d.doc);
      const t0 = performance.now();
      const s = S.move(S.caret(pos(d, 't4', 2)), L, 'right');
      times.push(performance.now() - t0);
      assert.equal(name(d, s.head), 'After:0');
    }
    times.sort((a, b) => a - b);
    assert.ok(times[2] < 40, `median ${times[2].toFixed(1)} ms`);
  });
});
