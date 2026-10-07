// DocLayout reuse: after random editing (typing, Enter, deleting,
// word deletes, Tab, undo, redo) the layout made from the previous
// one, as the window does after an edit (new DocLayout(doc, metrics,
// prev)), equals a full one: the same items, ids, y, h, lines (from,
// to, x, y, their items and texts). Seeded. The same with lists:
// random list paragraphs, level changes and numbering removed or
// added (setProps numPr), the labels and level indents of
// paragraphs that did not change object relaid out too.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {mk, blocks, box, S} from './edit-docs.mjs';
import {tm, rng} from './word-docs.mjs';

const WORDS = ['alpha', 'be', 'gamma ray', 'été', '\u{1F600}',
  'x', 'longerword', 'a b c d e f g h i j k l m n o p'];
const TYPED = ['a', 'bc ', ' ', 'é', '\u{1F600}', 'word ',
  'a long run of typed words to wrap a line '];

const shape = (L) => L.items.map((it) => ({id: it.id, kind: it.kind,
  index: it.index, y: it.y, h: it.h,
  lines: it.kind === 'p' ? JSON.stringify(it.lines) : null}));

function startDoc(r) {
  const n = 3 + Math.floor(r() * 8);
  const bs = [];
  for (let i = 0; i < n; i++) {
    if (r() < 0.12) { bs.push(box()); continue; }
    const k = Math.floor(r() * 12);
    let t = '';
    for (let j = 0; j < k; j++) t += WORDS[Math.floor(r() * WORDS.length)] + ' ';
    bs.push(t);
  }
  return mk(bs);
}

function pick(d, r) {
  const bl = blocks(d);
  const b = bl[Math.floor(r() * bl.length)];
  const off = b.type === 'p' ? Math.floor(r() * (b.text.length + 1))
    : Math.floor(r() * 2);
  return {id: blockId(b), off};
}

describe('DocLayout reuse equals a full layout', () => {
  it('120 random editing sequences', () => {
    const m = tm();
    let reused = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed);
      const d = startDoc(r);
      const t = new Typing(d);
      let L = new DocLayout(d.doc, m);
      L.layout(800);
      let sel = S.caret(pick(d, r));
      for (let step = 0; step < 25; step++) {
        const c = Math.floor(r() * 12);
        const w = 800 - (r() < 0.2 ? 300 : 0);
        if (r() < 0.3) sel = S.select(pick(d, r), pick(d, r));
        else sel = S.caret(pick(d, r));
        if (c < 4) sel = t.type(sel, TYPED[Math.floor(r() * TYPED.length)]);
        else if (c === 4) sel = t.command(() => E.splitPara(d, sel));
        else if (c === 5) sel = t.command(() => E.lineBreak(d, sel));
        else if (c === 6) sel = t.command(() => X.deleteBack(d, sel));
        else if (c === 7) sel = t.command(() => X.deleteForward(d, sel));
        else if (c === 8) sel = t.command(() => X.deleteWordBack(d, sel));
        else if (c === 9) t.command(() => E.insertTab(d, sel));
        else if (c === 10 && d.canUndo) t.command(() => d.undo());
        else if (d.canRedo) t.command(() => d.redo());
        // (the window's way: the layout from the old one)
        const prev = L;
        L = new DocLayout(d.doc, m, prev);
        L.layout(w);
        for (const i of L.items) {
          const o = prev.byId.get(i.id);
          if (i.kind === 'p' && o && o.lines === i.lines) reused++;
        }
        const full = new DocLayout(d.doc, m);
        full.layout(w);
        assert.deepEqual(shape(L), shape(full),
          `seed ${seed} step ${step} command ${c}`);
        const texts = (x) => x.items.map((i) => i.block.type === 'p'
          ? i.block.text : '#');
        assert.deepEqual(texts(L), texts(full));
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
  });
});

const LEVEL = (k) => ({ilvl: k, numFmt: ['decimal', 'lowerLetter',
  'bullet'][k % 3], lvlText: k % 3 === 2 ? '\uF0B7' : `%${k + 1}.`,
  start: 1, suff: ['tab', 'space', 'nothing'][k % 3],
  pPr: {ind: {left: 720 * (k + 1), hanging: 360}}});
const NUMS = () => new Map([
  [1, {abstractNumId: 1, levels: [0, 1, 2, 3].map(LEVEL),
    overrides: new Map()}],
  [2, {abstractNumId: 2, levels: [LEVEL(0), LEVEL(1)],
    overrides: new Map()}]]);

function listDoc(r) {
  const n = 3 + Math.floor(r() * 10);
  const bs = [];
  for (let i = 0; i < n; i++) {
    if (r() < 0.08) { bs.push(box()); continue; }
    const k = Math.floor(r() * 6);
    let t = '';
    for (let j = 0; j < k; j++) t += WORDS[Math.floor(r() * WORDS.length)] + ' ';
    const pPr = r() < 0.75 ? {numPr: {numId: 1 + Math.floor(r() * 2),
      ilvl: Math.floor(r() * 4)}} : {};
    if (r() < 0.15) pPr.ind = {left: 1440};
    if (r() < 0.15) pPr.jc = ['center', 'right', 'both'][Math.floor(r() * 3)];
    bs.push([t, {pPr}]);
  }
  const d = mk(bs);
  d.doc.numbering = {raw: null, nums: NUMS()};
  return d;
}

describe('DocLayout reuse equals a full layout, with lists', () => {
  it('120 random list editing sequences', () => {
    const m = tm();
    let reused = 0, labelled = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed * 101);
      const d = listDoc(r);
      const t = new Typing(d);
      let L = new DocLayout(d.doc, m);
      L.layout(800);
      let sel = S.caret(pick(d, r));
      for (let step = 0; step < 25; step++) {
        const c = Math.floor(r() * 10);
        if (r() < 0.2) sel = S.select(pick(d, r), pick(d, r));
        else sel = S.caret(pick(d, r));
        if (c < 2) sel = t.type(sel, TYPED[Math.floor(r() * TYPED.length)]);
        else if (c === 2) sel = t.command(() => E.splitPara(d, sel));
        else if (c === 3) sel = t.command(() => X.deleteBack(d, sel));
        else if (c === 4) sel = t.command(() => X.deleteForward(d, sel));
        else if (c < 7) {
          // a level change, or numbering taken off or put on
          const bl = blocks(d);
          const i = Math.floor(r() * bl.length);
          if (bl[i].type === 'p') {
            const v = r() < 0.2 ? null : {numId: 1 + Math.floor(r() * 2),
              ilvl: Math.floor(r() * 4)};
            t.command(() => d.atomic(() => d.apply({op: 'setProps',
              block: [0, i], pPr: {numPr: v}})));
          }
        } else if (c < 9 && d.canUndo) t.command(() => d.undo());
        else if (d.canRedo) t.command(() => d.redo());
        const prev = L;
        L = new DocLayout(d.doc, m, prev);
        L.layout(800);
        for (const i of L.items) {
          const o = prev.byId.get(i.id);
          if (i.kind === 'p' && o && o.lines === i.lines) reused++;
          if (i.kind === 'p' && i.lines[0].label) labelled++;
        }
        const full = new DocLayout(d.doc, m);
        full.layout(800);
        assert.deepEqual(shape(L), shape(full),
          `seed ${seed} step ${step} command ${c}`);
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
    assert.ok(labelled > 2000, 'labelled paragraphs: ' + labelled);
  });
});
