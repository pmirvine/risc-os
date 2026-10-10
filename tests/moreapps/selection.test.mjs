// Selection: the caret and selection as a value, moved by the keys'
// commands over a DocLayout. Measured with a fake: 8 px per unit.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import * as S from '../../tools/moreapps/!Word/Selection';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {loadStyles, tm, mkDoc, box, O, raw, el, rng}
  from './word-docs.mjs';

before(loadStyles);

const laid = (blocks, w = 1000) => {
  const L = new DocLayout(mkDoc(blocks), tm());
  L.layout(w);
  return L;
};
const ids = (L) => L.items.map((x) => x.id);
/** Run commands from a caret at (item i, off). */
function run(L, i, off, cmds, extend = false, arg) {
  let s = S.caret({id: L.items[i].id, off});
  for (const c of cmds) s = S.move(s, L, c, extend, arg);
  return s;
}
/** One paragraph in an 80 px column: three lines. */
function narrow() {
  const doc = mkDoc(['aaaaa bbbbb ccccc'], {pgSz: {w: 4200},
    pgMar: {left: 1500, right: 1500}, extra: []});
  const N = new DocLayout(doc, tm());
  N.layout(400);
  return N;
}
/** [item index, off] of a position. */
const at = (L, pos) => [L.byId.get(pos.id).index, pos.off];

describe('Selection values', () => {
  it('caret, collapsed, ordered', () => {
    const L = laid(['abc', 'def']);
    const [a, b] = ids(L);
    const c = S.caret({id: a, off: 1});
    assert.ok(S.collapsed(c));
    assert.deepEqual(c, {anchor: {id: a, off: 1}, head: {id: a, off: 1},
      affinity: 'down', goalX: null});
    assert.ok(Object.isFrozen(c));
    const s = S.select({id: b, off: 2}, {id: a, off: 1});
    assert.ok(!S.collapsed(s));
    assert.deepEqual(S.ordered(s, L), {from: {id: a, off: 1},
      to: {id: b, off: 2}});
    assert.deepEqual(S.ordered(s, L), S.ordered(s, L));
  });
});

describe('Selection left and right', () => {
  it('step by grapheme: surrogate pairs, combining marks, ZWJ', () => {
    const t = 'a\u{1F600}é\u{1F469}‍\u{1F4BB}b';
    const L = laid([t]);
    const offs = [];
    let s = S.caret({id: ids(L)[0], off: 0});
    for (let k = 0; k < 6; k++) {
      s = S.move(s, L, 'right');
      offs.push(s.head.off);
    }
    assert.deepEqual(offs, [1, 3, 5, 10, 11, 11]);
    s = S.move(s, L, 'left');
    assert.equal(s.head.off, 10);
    assert.equal(S.move(s, L, 'left').head.off, 5);
  });
  it('cross paragraph ends both ways', () => {
    const L = laid(['ab', 'cd']);
    assert.deepEqual(at(L, run(L, 0, 2, ['right']).head), [1, 0]);
    assert.deepEqual(at(L, run(L, 1, 0, ['left']).head), [0, 2]);
    assert.deepEqual(at(L, run(L, 0, 0, ['left']).head), [0, 0]);
    assert.deepEqual(at(L, run(L, 1, 2, ['right']).head), [1, 2]);
  });
  it('step over a box: before it, after it, then on', () => {
    const L = laid(['ab', box(), 'cd']);
    const seq = [];
    let s = S.caret({id: ids(L)[0], off: 2});
    for (let k = 0; k < 3; k++) {
      s = S.move(s, L, 'right');
      seq.push(at(L, s.head));
    }
    assert.deepEqual(seq, [[1, 0], [1, 1], [2, 0]]);
    s = S.move(S.move(s, L, 'left'), L, 'left');
    assert.deepEqual(at(L, s.head), [1, 0]);
  });
  it('selecting through a box selects it whole', () => {
    const L = laid(['ab', box(), 'cd']);
    const s = run(L, 0, 2, ['right', 'right', 'right'], true);
    assert.deepEqual(at(L, s.anchor), [0, 2]);
    const rs = L.selectionRects(s);
    const b = L.items[1];
    assert.ok(rs.some((r) => r.y >= b.y && r.w > 100));
  });
  it('hidden spaces after a break: one step each, in offsets', () => {
    const L = laid(['ab\n  cd']);
    const offs = [];
    let s = S.caret({id: ids(L)[0], off: 2});
    for (let k = 0; k < 4; k++) {
      s = S.move(s, L, 'right');
      offs.push(s.head.off);
    }
    assert.deepEqual(offs, [3, 4, 5, 6]);
  });
  it('a wrapper is one step', () => {
    const L = laid([['go ' + O + ' x',
      {inlines: {3: raw('hyperlink', 'p', 'the link')}}]]);
    assert.equal(run(L, 0, 3, ['right']).head.off, 4);
    assert.equal(run(L, 0, 4, ['left']).head.off, 3);
  });
  it('extend keeps the anchor; no extend collapses to the edge', () => {
    const L = laid(['abcdef', 'gh']);
    const s = run(L, 0, 2, ['right', 'right'], true);
    assert.deepEqual([s.anchor.off, s.head.off], [2, 4]);
    const l = S.move(s, L, 'left');
    assert.ok(S.collapsed(l));
    assert.equal(l.head.off, 2);
    const r = S.move(s, L, 'right');
    assert.equal(r.head.off, 4);
    const back = S.select({id: ids(L)[1], off: 1}, {id: ids(L)[0], off: 3});
    assert.deepEqual(at(L, S.move(back, L, 'right').head), [1, 1]);
    assert.deepEqual(at(L, S.move(back, L, 'left').head), [0, 3]);
  });
});

describe('Selection up and down', () => {
  it('keep the goal column across a short line', () => {
    const L = laid(['aaaaaaaaaa', 'ab', 'cccccccccc']);
    let s = S.caret({id: ids(L)[0], off: 8});
    s = S.move(s, L, 'down');
    assert.deepEqual(at(L, s.head), [1, 2]);
    s = S.move(s, L, 'down');
    assert.deepEqual(at(L, s.head), [2, 8]);
    s = S.move(s, L, 'up');
    s = S.move(s, L, 'left');
    assert.equal(s.goalX, null);
    s = S.move(s, L, 'down');
    assert.deepEqual(at(L, s.head), [2, 1]);
  });
  it('within a wrapped paragraph', () => {
    const N = narrow();
    assert.equal(N.items[0].lines.length, 3);
    const s = S.move(S.caret({id: ids(N)[0], off: 2}), N, 'down');
    assert.deepEqual(at(N, s.head), [0, 8]);
    assert.equal(S.move(s, N, 'up').head.off, 2);
  });
  it('into and out of a box; past the ends', () => {
    const L = laid(['ab', box(), 'cd']);
    let s = S.move(S.caret({id: ids(L)[0], off: 0}), L, 'down');
    assert.deepEqual(at(L, s.head), [1, 0]);
    s = S.move(s, L, 'down');
    assert.deepEqual(at(L, s.head), [2, 0]);
    s = S.move(S.caret({id: ids(L)[0], off: 2}), L, 'up');
    assert.deepEqual(at(L, s.head), [0, 0]);
    s = S.move(S.caret({id: ids(L)[2], off: 1}), L, 'down');
    assert.deepEqual(at(L, s.head), [2, 2]);
  });
  it('extending down from a selection keeps the anchor', () => {
    const L = laid(['abcd', 'efgh']);
    const s = run(L, 0, 1, ['right', 'down'], true);
    assert.deepEqual(at(L, s.anchor), [0, 1]);
    assert.deepEqual(at(L, s.head), [1, 2]);
  });
});

describe('Selection lines, words, document', () => {
  it('home and end on wrapped lines', () => {
    const N = narrow();
    const s = S.move(S.caret({id: ids(N)[0], off: 8}), N, 'end');
    assert.deepEqual([s.head.off, s.affinity], [11, 'down']);
    assert.equal(S.move(s, N, 'home').head.off, 6);
  });
  it('home and end on a box', () => {
    const L = laid([box()]);
    assert.equal(run(L, 0, 0, ['end']).head.off, 1);
    assert.equal(run(L, 0, 1, ['home']).head.off, 0);
  });
  it('words across punctuation and paragraph starts', () => {
    const L = laid(['Hello, world. Foo', 'Bar baz']);
    const right = [];
    let s = S.caret({id: ids(L)[0], off: 0});
    for (let k = 0; k < 5; k++) {
      s = S.move(s, L, 'wordRight');
      right.push(at(L, s.head));
    }
    assert.deepEqual(right, [[0, 7], [0, 14], [0, 17], [1, 0], [1, 4]]);
    const left = [];
    for (let k = 0; k < 5; k++) {
      s = S.move(s, L, 'wordLeft');
      left.push(at(L, s.head));
    }
    assert.deepEqual(left, [[1, 0], [0, 17], [0, 14], [0, 7], [0, 0]]);
  });
  it('document start and end; paragraph start and end', () => {
    const L = laid(['ab', 'cdef', box()]);
    assert.deepEqual(at(L, run(L, 1, 2, ['docHome']).head), [0, 0]);
    assert.deepEqual(at(L, run(L, 1, 2, ['docEnd']).head), [2, 1]);
    assert.deepEqual(at(L, run(L, 1, 2, ['paraStart']).head), [1, 0]);
    assert.deepEqual(at(L, run(L, 1, 0, ['paraStart']).head), [0, 0]);
    assert.deepEqual(at(L, run(L, 1, 2, ['paraEnd']).head), [1, 4]);
    assert.deepEqual(at(L, run(L, 1, 4, ['paraEnd']).head), [2, 1]);
  });
  it('page down and up by a given height', () => {
    const blocks = [];
    for (let i = 0; i < 40; i++) blocks.push('line ' + i);
    const L = laid(blocks);
    const lh = L.items[0].h;
    const s = run(L, 0, 2, ['pageDown'], false, lh * 10);
    assert.deepEqual(at(L, s.head), [10, 2]);
    const u = S.move(s, L, 'pageUp', false, lh * 4);
    assert.deepEqual(at(L, u.head), [6, 2]);
    assert.deepEqual(at(L, run(L, 35, 2, ['pageDown'], false,
      lh * 10).head), [39, 7]);
    assert.deepEqual(at(L, run(L, 3, 2, ['pageUp'], false,
      lh * 10).head), [0, 0]);
  });
  it('unknown commands leave the selection as it is', () => {
    const L = laid(['ab']);
    const s = S.caret({id: ids(L)[0], off: 1});
    assert.equal(S.move(s, L, 'sideways'), s);
  });
});

describe('Selection whole things and text', () => {
  it('selectAll, selectWord, selectPara', () => {
    const L = laid(['Hello, world', box(), 'end']);
    const a = S.selectAll(L);
    assert.deepEqual([at(L, a.anchor), at(L, a.head)], [[0, 0], [2, 3]]);
    const id = ids(L)[0];
    const w = S.selectWord(L, {id, off: 9});
    assert.deepEqual([w.anchor.off, w.head.off], [7, 12]);
    // at the end of a word: the word, not the space after it
    const e = S.selectWord(L, {id, off: 5});
    assert.deepEqual([e.anchor.off, e.head.off], [0, 5]);
    const p = S.selectPara(L, {id, off: 3});
    assert.deepEqual([p.anchor.off, p.head.off], [0, 12]);
    const bw = S.selectWord(L, {id: ids(L)[1], off: 0});
    assert.deepEqual([bw.anchor.off, bw.head.off], [0, 1]);
  });
  it('selectWord on an inline selects just the inline', () => {
    const lk = (t, ins) => laid([[t, {inlines: ins}]]);
    const sw = (L, off) => {
      const w = S.selectWord(L, {id: ids(L)[0], off});
      return [w.anchor.off, w.head.off];
    };
    const mid = lk('see ' + O + ' now', {4: raw('hyperlink', 'p', 'x')});
    assert.deepEqual(sw(mid, 4), [4, 5]);
    assert.deepEqual(sw(mid, 5), [4, 5]);
    const start = lk(O + ' go', {0: raw('hyperlink', 'p', 'x')});
    assert.deepEqual(sw(start, 0), [0, 1]);
    assert.deepEqual(sw(start, 1), [0, 1]);
    const end = lk('go ' + O, {3: raw('hyperlink', 'p', 'x')});
    assert.deepEqual(sw(end, 3), [3, 4]);
    assert.deepEqual(sw(end, 4), [3, 4]);
    const adj = lk('ab' + O + ' cd', {2: raw('hyperlink', 'p', 'x')});
    assert.deepEqual(sw(adj, 3), [2, 3]);
    assert.deepEqual(sw(adj, 1), [0, 2]);
    const two = lk('a ' + O + O + ' b', {2: raw('hyperlink', 'p', 'x'),
      3: raw('hyperlink', 'p', 'y')});
    assert.deepEqual(sw(two, 2), [2, 3]);
    assert.deepEqual(sw(two, 3), [3, 4]);
    assert.deepEqual(sw(two, 4), [3, 4]);
  });
  it('text of a selection over three paragraphs', () => {
    const L = laid(['Hello world', 'middle', ['go ' + O + '!',
      {inlines: {3: raw('hyperlink', 'p', 'link')}}]]);
    const s = S.select({id: ids(L)[0], off: 6}, {id: ids(L)[2], off: 5});
    assert.equal(S.text(s, L), 'world\nmiddle\ngo link!');
    assert.equal(S.text(S.caret({id: ids(L)[0], off: 1}), L), '');
    const t = laid(['ab', box(), 'cd']);
    assert.equal(S.text(S.selectAll(t), t), 'ab\n\ncd');
  });
  it('clamp: an offset past the end, a paragraph that went', () => {
    const L = laid(['abc', 'def', 'ghi']);
    const [a, b, c] = L.items.map((x) => x.block);
    const s = S.select({id: a.id, off: 1}, {id: b.id, off: 2});
    const doc = mkDoc([a, c]);
    const k = S.clamp(s, doc, L);
    assert.deepEqual(k.anchor, {id: a.id, off: 1});
    assert.deepEqual(k.head, {id: c.id, off: 0});
    const short = mkDoc([{...a, text: 'a', runs: []}]);
    assert.deepEqual(S.clamp(S.caret({id: a.id, off: 3}), short).head,
      {id: a.id, off: 1});
    const none = S.clamp(S.caret({id: 999999, off: 3}), doc);
    assert.deepEqual(none.head, {id: a.id, off: 0});
  });
});

/** A random paragraph of hard text: emoji, marks, wrappers... */
function hard(rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let text = '';
  const inlines = {};
  const n = 2 + Math.floor(rnd() * 30);
  for (let k = 0; k < n; k++) {
    const c = rnd();
    if (c < 0.4) text += 'abcdefghij klm'.slice(0, 1 + rnd() * 13);
    else if (c < 0.6) {
      text += pick(['\u{1F600}', 'é', '\u{1F469}‍\u{1F4BB}',
        'x\u{1F44D}\u{1F3FD}', '\u{1F1EC}\u{1F1E7}']);
    } else if (c < 0.75) text += pick([' ', '  ', '\n', '\t', ', ']);
    else {
      inlines[text.length] = pick([raw('bookmarkStart'),
        raw('hyperlink', 'p', 'link text that is long enough'),
        raw('drawing', 'r'), {kind: 'br', level: 'r', node: el('br')}]);
      text += O;
    }
  }
  return [text, {inlines}];
}

describe('Selection property test', () => {
  it('random moves never land inside a grapheme or past the end',
    () => {
      const CMDS = ['left', 'right', 'up', 'down', 'home', 'end',
        'wordLeft', 'wordRight', 'paraStart', 'paraEnd', 'pageUp',
        'pageDown'];
      for (let seed = 1; seed <= 30; seed++) {
        const rnd = rng(seed);
        const blocks = [];
        for (let i = 0; i < 6; i++) {
          blocks.push(rnd() < 0.15 ? box() : hard(rnd));
        }
        const L = laid(blocks, 300 + Math.floor(rnd() * 900));
        let s = S.caret({id: L.items[0].id, off: 0});
        for (let k = 0; k < 300; k++) {
          const cmd = CMDS[Math.floor(rnd() * CMDS.length)];
          const ext = rnd() < 0.3;
          s = S.move(s, L, cmd, ext, 60);
          for (const p of [s.anchor, s.head]) {
            const it = L.byId.get(p.id);
            const msg = `seed ${seed} step ${k} ${cmd}`;
            assert.ok(it, msg);
            if (it.kind === 'box') assert.ok(p.off === 0 || p.off === 1);
            else {
              assert.ok(graphemes(it.block.text).includes(p.off),
                `${msg}: ${p.off} in ${JSON.stringify(it.block.text)}`);
            }
          }
          const o = S.ordered(s, L);
          assert.deepEqual(S.ordered(s, L), o);
          const ia = L.byId.get(o.from.id).index;
          const ib = L.byId.get(o.to.id).index;
          assert.ok(ia < ib || (ia === ib && o.from.off <= o.to.off));
          // without Shift every move ends in a caret
          if (!ext) assert.ok(S.collapsed(s), `seed ${seed} step ${k}`);
          L.caretRect(s.head, s.affinity);
        }
      }
    });
});

describe('Selection over unseen inlines (bookmarks, proofing marks)', () => {
  const ink = (n) => raw(n);
  /** 'a' [bookmarkStart] 'b' [proofErr] [bookmarkEnd] 'c' */
  const marked = () => laid([['a' + O + 'b' + O + O + 'c', {inlines: {
    1: ink('bookmarkStart'), 3: ink('proofErr'), 4: ink('bookmarkEnd')}}],
  'next']);
  it('right and left step over them with the next character: every ' +
    'press moves the caret on the screen', () => {
    const L = marked();
    const offs = [];
    let s = S.caret({id: ids(L)[0], off: 0});
    for (let k = 0; k < 4; k++) {
      s = S.move(s, L, 'right');
      offs.push(at(L, s.head));
    }
    assert.deepEqual(offs, [[0, 1], [0, 3], [0, 6], [1, 0]]);
    const back = [];
    for (let k = 0; k < 4; k++) {
      s = S.move(s, L, 'left');
      back.push(at(L, s.head));
    }
    assert.deepEqual(back, [[0, 6], [0, 5], [0, 2], [0, 0]]);
    const xs = new Set([1, 3, 6].map((o) =>
      L.caretRect({id: ids(L)[0], off: o}).x));
    assert.equal(xs.size, 3, 'three different places');
  });
  it('Shift extends the same way', () => {
    const L = marked();
    const s = run(L, 0, 1, ['right', 'right'], true);
    assert.deepEqual([s.anchor.off, s.head.off], [1, 6]);
    const b = run(L, 0, 6, ['left', 'left'], true);
    assert.deepEqual([b.anchor.off, b.head.off], [6, 2]);
  });
  it('at a paragraph\'s edges: the mark goes with the paragraph mark',
    () => {
      const L = laid(['ab', [O + 'cd' + O, {inlines: {0: ink('bookmarkStart'),
        3: ink('bookmarkEnd')}}], 'ef']);
      assert.deepEqual(at(L, run(L, 0, 2, ['right']).head), [1, 0]);
      assert.deepEqual(at(L, run(L, 1, 0, ['right']).head), [1, 2]);
      assert.deepEqual(at(L, run(L, 1, 1, ['left']).head), [0, 2]);
      assert.deepEqual(at(L, run(L, 1, 2, ['right']).head), [1, 3]);
      assert.deepEqual(at(L, run(L, 1, 3, ['right']).head), [2, 0],
        'the end mark goes with the paragraph mark');
      assert.deepEqual(at(L, run(L, 2, 0, ['left']).head), [1, 4]);
      assert.deepEqual(at(L, run(L, 1, 4, ['left']).head), [1, 2]);
    });
  it('a paragraph of marks alone is one step, like an empty one', () => {
    const L = laid(['ab', [O + O, {inlines: {0: ink('bookmarkStart'),
      1: ink('bookmarkEnd')}}], 'cd']);
    assert.deepEqual(at(L, run(L, 0, 2, ['right']).head), [1, 0]);
    assert.deepEqual(at(L, run(L, 1, 0, ['right']).head), [2, 0]);
    assert.deepEqual(at(L, run(L, 2, 0, ['left']).head), [1, 2]);
    assert.deepEqual(at(L, run(L, 1, 2, ['left']).head), [0, 2]);
  });
  it('a link, a picture, a tab are seen: still one step each', () => {
    const L = laid([['a' + O + O + 'b', {inlines: {
      1: raw('hyperlink', 'p', 'lk'), 2: raw('drawing', 'r')}}]]);
    assert.deepEqual(run(L, 0, 0, ['right', 'right', 'right'])
      .head.off, 3);
  });
  it('a real proofErr document: the marks never cost a press',
    async () => {
      const {readDocx} = await import(
        '../../tools/moreapps/!Word/DocxRead');
      const {buildDocx, documentXml, p, r} = await import(
        './build-docx.mjs');
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('Hi ') + '<w:proofErr w:type="spellStart"/>' +
          r('wrold') + '<w:proofErr w:type="spellEnd"/>' + r('!')))}));
      const L = new DocLayout(doc, tm());
      L.layout(800);
      const t = L.items[0].block.text;
      assert.equal(t, 'Hi ' + O + 'wrold' + O + '!');
      let s = S.caret({id: L.items[0].id, off: 0});
      const offs = [];
      for (let k = 0; k < 10; k++) {
        s = S.move(s, L, 'right');
        offs.push(s.head.off);
      }
      assert.deepEqual(offs, [1, 2, 3, 5, 6, 7, 8, 9, 11, 11]);
    });
});

describe('review: a soft hyphen is a character for the caret keys', () => {
  it('right and left take a press for it (it draws as nothing)', () => {
    const L = laid([['a' + O + 'b', {inlines: {1: raw('softHyphen',
      'r')}}]]);
    assert.equal(run(L, 0, 1, ['right']).head.off, 2);
    assert.equal(run(L, 0, 2, ['left']).head.off, 1);
  });
});
