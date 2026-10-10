// DocLayout reuse: after random editing (typing, Enter, deleting,
// word deletes, Tab, undo, redo) the layout made from the previous
// one, as the window does after an edit (new DocLayout(doc, metrics,
// prev)), equals a full one: the same items, ids, y, h, lines (from,
// to, x, y, their items and texts). Seeded. The same with lists:
// random list paragraphs, level changes and numbering removed or
// added (setProps numPr), the labels and level indents of
// paragraphs that did not change object relaid out too. And with
// doc.styles / doc.numbering replaced (every line dropped) and a
// decorator's gaps; List Paragraphs, contextual spacing and space
// before / after (ParaSpace's decorator: its negative gaps equal a
// full layout's after neighbours change). And with section breaks
// put in, removed (Delete / Backspace) and their types changed: the
// section-end mark is in the reuse key, the bands (SectDeco) and the
// contextual spacing next to them equal a full layout's.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {run} from '../../tools/moreapps/!Word/EditApply';
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
        assert.equal(L.height, full.height, `height, seed ${seed}`);
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
    // spacing between paragraphs: List Paragraph (contextualSpacing,
    // as Word's), the flag set directly, space before and after
    if (r() < 0.3) pPr.contextualSpacing = r() < 0.6;
    if (r() < 0.5) pPr.spacing = {before: 60 * Math.floor(r() * 5),
      after: 80 * Math.floor(r() * 5)};
    bs.push([t, r() < 0.5 ? {pPr, pStyle: 'ListParagraph'} : {pPr}]);
  }
  const d = mk(bs);
  d.doc.numbering = {raw: null, nums: NUMS()};
  return d;
}

describe('DocLayout reuse equals a full layout, with lists', () => {
  it('120 random list editing sequences', () => {
    const m = tm();
    let reused = 0, labelled = 0, cut = 0;
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
        } else if (c === 7) {
          // a neighbour's style or contextual spacing changed
          const bl = blocks(d);
          const i = Math.floor(r() * bl.length);
          if (bl[i].type === 'p') {
            const x = r();
            t.command(() => d.atomic(() => d.apply({op: 'setProps',
              block: [0, i], ...(x < 0.5 ? {pStyle: x < 0.25 ? null
                : 'ListParagraph'} : {pPr: {contextualSpacing:
                x < 0.75 ? !bl[i].pPr.contextualSpacing : null}})})));
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
          if (i.gapAbove < 0) cut++;
        }
        const full = new DocLayout(d.doc, m);
        full.layout(800);
        assert.deepEqual(shape(L), shape(full),
          `seed ${seed} step ${step} command ${c}`);
        assert.deepEqual(L.items.map((i) => i.gapAbove),
          full.items.map((i) => i.gapAbove), `gaps, seed ${seed}`);
        assert.equal(L.height, full.height, `height, seed ${seed}`);
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
    assert.ok(labelled > 2000, 'labelled paragraphs: ' + labelled);
    assert.ok(cut > 500, 'contextual spacing drawn: ' + cut);
  });
});

// (until the document-level ops exist (A1.2) the styles and numbering
// are replaced directly in the Doc, as those ops will: new objects)
const restyle = (st, r) => ({...st, docDefaults: {...st.docDefaults,
  rPr: {...st.docDefaults.rPr, b: r() < 0.5,
    sz: 16 + 2 * Math.floor(r() * 10)}}});
const renumber = (r) => {
  const nums = NUMS();
  const k = 1 + Math.floor(r() * 2), n = nums.get(k);
  nums.set(k, {...n, levels: n.levels.map((l) => ({...l,
    lvlText: r() < 0.5 ? l.lvlText : `(%${l.ilvl + 1})`,
    pPr: {ind: {left: 360 * (1 + Math.floor(r() * 6)),
      hanging: 360}}}))});
  return {raw: null, nums};
};
// a decorator that reads the paragraph and the styles (cached per
// paragraph object and styles object)
const SPACE = [(it, L) => (it.kind === 'p'
  ? {gapAbove: it.block.text.length % 7,
    gapBelow: L.doc.styles.docDefaults.rPr.b ? 5 : 0} : null)];

describe('DocLayout reuse equals a full layout, styles and ' +
  'numbering replaced', () => {
  it('120 random sequences with replacement ops and a decorator', () => {
    const m = tm();
    let reused = 0, dropped = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed * 7919);
      const d = listDoc(r);
      const t = new Typing(d);
      const deco = seed % 2 ? {decorators: SPACE} : {};
      let L = new DocLayout(d.doc, m, undefined, deco);
      L.layout(800);
      let sel = S.caret(pick(d, r));
      for (let step = 0; step < 25; step++) {
        const c = Math.floor(r() * 10);
        sel = S.caret(pick(d, r));
        let replaced = false;
        if (c < 3) sel = t.type(sel, TYPED[Math.floor(r() * TYPED.length)]);
        else if (c === 3) sel = t.command(() => E.splitPara(d, sel));
        else if (c === 4) sel = t.command(() => X.deleteBack(d, sel));
        else if (c < 7) {
          d.doc.styles = restyle(d.doc.styles, r);
          replaced = true;
        } else if (c < 9) {
          d.doc.numbering = renumber(r);
          replaced = true;
        } else if (d.canUndo) t.command(() => d.undo());
        const prev = L;
        L = new DocLayout(d.doc, m, prev);
        L.layout(800);
        for (const i of L.items) {
          const o = prev.byId.get(i.id);
          if (i.kind !== 'p' || !o) continue;
          if (o.lines === i.lines) reused++;
          else if (replaced) dropped++;
          if (replaced) assert.notEqual(o.lines, i.lines);
        }
        const full = new DocLayout(d.doc, m, undefined, deco);
        full.layout(800);
        assert.deepEqual(shape(L), shape(full),
          `seed ${seed} step ${step} command ${c}`);
        assert.deepEqual(L.items.map((i) => [i.gapAbove, i.gapBelow]),
          full.items.map((i) => [i.gapAbove, i.gapBelow]));
        assert.equal(L.height, full.height, `height, seed ${seed}`);
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
    assert.ok(dropped > 500, 'lines were dropped: ' + dropped);
  });
});

const SECT_IDS = ['sectionNext', 'sectionContinuous'];
const full = (L) => L.items.map((i) => ({id: i.id, y: i.y, h: i.h,
  gapAbove: i.gapAbove, gapBelow: i.gapBelow,
  mark: i.mark ? i.mark.type : null,
  marks: JSON.stringify(i.marks)}));

describe('DocLayout reuse equals a full layout, section breaks', () => {
  it('120 random sequences splitting and merging sections', () => {
    const m = tm();
    let reused = 0, bands = 0, merged = 0, retyped = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed * 4099);
      const d = listDoc(r);
      const t = new Typing(d);
      let L = new DocLayout(d.doc, m);
      L.layout(800);
      for (let step = 0; step < 25; step++) {
        const c = Math.floor(r() * 10);
        let sel = r() < 0.15 ? S.select(pick(d, r), pick(d, r))
          : S.caret(pick(d, r));
        const n0 = d.doc.sections.length;
        if (c < 3) {
          sel = run(SECT_IDS[Math.floor(r() * 2)], d, t, sel);
        } else if (c < 5) {
          // at a section edge when there is one: Delete / Backspace
          const secs = d.doc.sections;
          const s = Math.floor(r() * secs.length);
          if (s < secs.length - 1) {
            const bs = secs[s].blocks, last = bs[bs.length - 1];
            const fwd = r() < 0.5;
            const b = fwd ? last : secs[s + 1].blocks[0];
            const id = b.type === 'p' ? b.id : blockId(b);
            const off = fwd ? (b.type === 'p' ? b.text.length : 1) : 0;
            run(fwd ? 'delete' : 'backspace', d, t, S.caret({id, off}));
          }
        } else if (c === 5) {
          // a section's type changed (its mark, the one before it)
          const secs = d.doc.sections;
          const s = Math.floor(r() * secs.length);
          const types = ['nextPage', 'continuous', 'evenPage', undefined];
          const props = {...secs[s].props,
            type: types[Math.floor(r() * 4)]};
          if (props.type === undefined) delete props.type;
          t.command(() => d.atomic(() => d.apply({op: 'setSection',
            at: s, props, raw: secs[s].raw})));
          retyped++;
        } else if (c === 6) {
          sel = t.type(sel, TYPED[Math.floor(r() * TYPED.length)]);
        } else if (c === 7) sel = t.command(() => E.splitPara(d, sel));
        else if (c === 8 && d.canUndo) t.command(() => d.undo());
        else if (d.canRedo) t.command(() => d.redo());
        if (d.doc.sections.length < n0) merged++;
        const prev = L;
        L = new DocLayout(d.doc, m, prev);
        L.layout(800);
        for (const i of L.items) {
          const o = prev.byId.get(i.id);
          if (i.kind === 'p' && o && o.lines === i.lines) reused++;
          if (i.gapBelow === 18) bands++;
        }
        const f = new DocLayout(d.doc, m);
        f.layout(800);
        const where = `seed ${seed} step ${step} command ${c}`;
        assert.deepEqual(shape(L), shape(f), where);
        assert.deepEqual(full(L), full(f), where);
        assert.equal(L.height, f.height, where);
        const ends = d.doc.sections.length - 1;
        assert.equal(L.items.filter((i) => i.mark).length, ends, where);
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
    assert.ok(bands > 1000, 'bands: ' + bands);
    assert.ok(merged > 100, 'sections merged: ' + merged);
    assert.ok(retyped > 100, 'types changed: ' + retyped);
  });
});

// Tab stops (Batch A, A4.1): random direct stops set and cleared,
// tabs typed, and the default stop of settings.xml replaced (a new
// settings root through setDocPart, as the Tabs dialog will): the
// layout made from the previous one equals a full one.
const KINDS = ['left', 'center', 'right', 'decimal', 'bar', 'clear',
  'start', 'end'];
const randomTabs = (r) => {
  const n = Math.floor(r() * 6);
  const out = [], seen = new Set();
  for (let k = 0; k < n; k++) {
    const pos = Math.floor(r() * 14000) - 1000;
    if (seen.has(pos)) continue;
    seen.add(pos);
    out.push({val: KINDS[Math.floor(r() * KINDS.length)], pos,
      ...(r() < 0.3 ? {leader: r() < 0.5 ? 'dot' : 'underscore'} : {})});
  }
  return out.length ? out : null;
};
const settingsWith = (tw) => ({name: 'w:settings', attrs: [['xmlns:w',
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main']],
children: [{name: 'w:defaultTabStop', attrs: [['w:val', String(tw)]],
  children: []}]});
const TABBED = ['a\tb', '\t12.50\t3.5', 'x\ty\tz w\t', 'left\tright',
  '\t\t\t'];

describe('DocLayout reuse equals a full layout, tab stops', () => {
  it('120 random sequences with stops and default stops', () => {
    const m = tm();
    let reused = 0, dropped = 0, moved = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed * 6007);
      const n = 3 + Math.floor(r() * 10);
      const d = mk(Array.from({length: n}, () => (r() < 0.1 ? box()
        : [TABBED[Math.floor(r() * TABBED.length)], {pPr: {
          tabs: randomTabs(r) || undefined, jc: ['left', 'center',
            'right', 'both'][Math.floor(r() * 4)],
          ind: r() < 0.3 ? {left: 360, hanging: 360} : undefined}}])));
      d.doc.rawSettings = settingsWith(720);
      const t = new Typing(d);
      let L = new DocLayout(d.doc, m);
      L.layout(800);
      for (let step = 0; step < 25; step++) {
        const c = Math.floor(r() * 10);
        let sel = S.caret(pick(d, r));
        let replaced = false;
        if (c < 2) sel = t.type(sel, TYPED[Math.floor(r() * TYPED.length)]);
        else if (c === 2) t.command(() => E.insertTab(d, sel));
        else if (c < 6) {
          const bl = blocks(d);
          const i = Math.floor(r() * bl.length);
          if (bl[i].type === 'p') {
            t.command(() => d.atomic(() => d.apply({op: 'setProps',
              block: [0, i], pPr: {tabs: randomTabs(r)}})));
          }
        } else if (c === 6) {
          const tw = [360, 720, 1440, 567][Math.floor(r() * 4)];
          t.command(() => d.atomic(() => d.apply({op: 'setDocPart',
            key: 'settings', value: settingsWith(tw)})));
          replaced = true;
        } else if (c === 7) sel = t.command(() => E.splitPara(d, sel));
        else if (c === 8 && d.canUndo) t.command(() => d.undo());
        else if (d.canRedo) t.command(() => d.redo());
        const prev = L;
        L = new DocLayout(d.doc, m, prev);
        L.layout(800);
        for (const i of L.items) {
          const o = prev.byId.get(i.id);
          if (i.kind !== 'p' || !o) continue;
          if (o.lines === i.lines) reused++;
          else if (replaced) dropped++;
          if (replaced) assert.notEqual(o.lines, i.lines);
          else if (o.lines !== i.lines &&
            JSON.stringify(o.lines) !== JSON.stringify(i.lines)) moved++;
        }
        const f = new DocLayout(d.doc, m);
        f.layout(800);
        const where = `seed ${seed} step ${step} command ${c}`;
        assert.deepEqual(shape(L), shape(f), where);
        assert.equal(L.height, f.height, where);
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
    assert.ok(dropped > 500, 'lines were dropped: ' + dropped);
    assert.ok(moved > 100, 'lines changed: ' + moved);
  });
});

// Borders and shading (Batch A, A5.1): random paragraph borders,
// shading and indents set and cleared, page break before, typing,
// Enter (a new paragraph takes the borders: the box grows), joins
// (Backspace), section breaks, kept blocks, the document defaults
// given a border (doc.styles replaced) and undo / redo: the layout
// made from the previous one equals a full one, gaps and marks (the
// box parts, which depend on the neighbours) included.
const SIDE = (sz, space) => ({val: 'single', sz, space, color: 'auto'});
const BDRS = [null, {top: SIDE(4, 1), left: SIDE(4, 4),
  bottom: SIDE(4, 1), right: SIDE(4, 4)}, {top: SIDE(4, 1),
  left: SIDE(4, 4), bottom: SIDE(4, 1), right: SIDE(4, 4),
  between: SIDE(8, 2)}, {bottom: SIDE(24, 6)}, {left: SIDE(12, 0),
  top: {val: 'nil'}}];
const SHDS = [null, {val: 'clear', color: 'auto', fill: 'FFFF00'},
  {val: 'pct20', color: 'auto'}];
const pickOf = (r, xs) => xs[Math.floor(r() * xs.length)];

function borderDoc(r) {
  const n = 4 + Math.floor(r() * 10);
  const bs = [];
  for (let i = 0; i < n; i++) {
    if (r() < 0.08) { bs.push(box()); continue; }
    const pPr = {};
    const b = pickOf(r, BDRS), s = pickOf(r, SHDS);
    if (b) pPr.pBdr = b;
    if (s) pPr.shd = s;
    if (r() < 0.2) pPr.ind = {left: 720 * Math.floor(r() * 2)};
    if (r() < 0.3) pPr.spacing = {before: 120, after: 120};
    if (r() < 0.05) pPr.pageBreakBefore = true;
    if (r() < 0.2) pPr.numPr = {numId: 1, ilvl: Math.floor(r() * 2)};
    bs.push([WORDS[Math.floor(r() * WORDS.length)], {pPr}]);
  }
  const d = mk(bs);
  d.doc.numbering = {raw: null, nums: NUMS()};
  return d;
}

describe('DocLayout reuse equals a full layout, borders and shading', () => {
  it('120 random sequences with border boxes', () => {
    const m = tm();
    let reused = 0, boxed = 0, joined = 0, kept = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed * 3851);
      const d = borderDoc(r);
      const t = new Typing(d);
      let L = new DocLayout(d.doc, m);
      L.layout(800);
      for (let step = 0; step < 25; step++) {
        const c = Math.floor(r() * 12);
        let sel = S.caret(pick(d, r));
        let replaced = false;
        const bl = blocks(d);
        const i = Math.floor(r() * bl.length);
        const at = [0, 0];
        // the section and index of block i
        for (let s = 0, k = i; s < d.doc.sections.length; s++) {
          const nb = d.doc.sections[s].blocks.length;
          if (k < nb) { at[0] = s; at[1] = k; break; }
          k -= nb;
        }
        const set = (pPr) => bl[i].type === 'p' && t.command(() =>
          d.atomic(() => d.apply({op: 'setProps', block: at, pPr})));
        if (c < 2) sel = t.type(sel, TYPED[Math.floor(r() * TYPED.length)]);
        else if (c === 2) sel = t.command(() => E.splitPara(d, sel));
        else if (c === 3) sel = t.command(() => X.deleteBack(d, sel));
        else if (c === 4) set({pBdr: pickOf(r, BDRS)});
        else if (c === 5) set({shd: pickOf(r, SHDS)});
        else if (c === 6) set({ind: r() < 0.5 ? null : {left: 720}});
        else if (c === 7) set({pageBreakBefore: r() < 0.5 ? true : null});
        else if (c === 8) sel = run(SECT_IDS[Math.floor(r() * 2)], d, t, sel);
        else if (c === 9) {
          const st = d.doc.styles;
          d.doc.styles = {...st, docDefaults: {...st.docDefaults,
            pPr: {...st.docDefaults.pPr, pBdr: r() < 0.5
              ? {left: SIDE(4, 4)} : undefined}}};
          replaced = true;
        } else if (c === 10 && d.canUndo) t.command(() => d.undo());
        else if (d.canRedo) t.command(() => d.redo());
        const prev = L;
        L = new DocLayout(d.doc, m, prev);
        L.layout(800);
        for (const it of L.items) {
          const o = prev.byId.get(it.id);
          if (it.kind === 'p' && o && o.lines === it.lines) reused++;
          if (o && o.deco && o.deco === it.deco) kept++;
          const bm = it.marks.find((x) => x.kind === 'border');
          if (bm) boxed++;
          if (bm && bm.joinAbove) joined++;
        }
        const f = new DocLayout(d.doc, m);
        f.layout(800);
        const where = `seed ${seed} step ${step} command ${c} ${replaced}`;
        assert.deepEqual(shape(L), shape(f), where);
        assert.deepEqual(full(L), full(f), where);
        assert.equal(L.height, f.height, where);
      }
    }
    assert.ok(reused > 500, 'lines were reused: ' + reused);
    assert.ok(kept > 500, 'decorations kept: ' + kept);
    assert.ok(boxed > 2000, 'boxes drawn: ' + boxed);
    assert.ok(joined > 300, 'boxes shared: ' + joined);
  });
});
