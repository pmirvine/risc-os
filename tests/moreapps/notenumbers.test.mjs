// NoteNumbers (Batch E2): the numbers footnote and endnote marks
// show, and how a layout draws them: ONE atomic token of the
// computed text; the model keeps one U+FFFC; an edit before a mark
// renumbers the display.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import * as NN from '../../tools/moreapps/!Letters/NoteNumbers';
import {formatNumber, chicago} from
  '../../tools/moreapps/!Letters/NumFormat';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {hitTest} from '../../tools/moreapps/!Letters/DocHit';
import {deleteBack} from '../../tools/moreapps/!Letters/EditDel';
import {move} from '../../tools/moreapps/!Letters/SelMove';
import {bump} from '../../tools/moreapps/!Letters/DocVersion';
import {loadStyles, tm, mkDoc, el, O} from './word-docs.mjs';
import {mk, C, SEL, P} from './edit-docs.mjs';
import * as S from '../../tools/moreapps/!Letters/Selection';

before(loadStyles);
const ref = (id, note = 'footnote', more = {}) => ({kind: 'noteRef',
  note, id, level: 'r', node: el(note + 'Reference'), ...more});
/** A paragraph of 'a' + one mark per spec ({id, note?, more?}). */
function marked(...specs) {
  const inlines = {};
  let text = '';
  specs.forEach((s, k) => {
    inlines[text.length + 1] = s.self ? ref(null, s.note,
      {self: true}) : ref(s.id, s.note, s.more);
    text += 'a' + O;
  });
  return newPara(text, {inlines});
}
const f = (...ids) => marked(...ids.map((id) => ({id})));
const nodeOf = (name, kids) => ({name: 'w:' + name, attrs: [],
  children: kids.map(([n, v]) => ({name: 'w:' + n,
    attrs: [['w:val', String(v)]], children: []}))});
const secWith = (blocks, kids, tag = 'footnotePr') => ({
  props: {extra: kids ? [nodeOf(tag, kids)] : []}, blocks, raw: null});
const strs = (m) => [...m.values()];
/** Give doc modelled notes for every body mark (and `more` ids). */
function withNotes(doc, more = []) {
  const ids = {footnote: new Set(more), endnote: new Set()};
  const seen = (bs) => bs.forEach((b) => {
    if (b.type === 'p') {
      Object.values(b.inlines).forEach((x) => {
        if (x.kind === 'noteRef' && !x.self && x.id !== null) {
          ids[x.note].add(x.id);
        }
      });
    } else if (b.type === 'tbl') {
      b.rows.forEach((r) => r.cells.forEach((c) => seen(c.blocks)));
    }
  });
  doc.sections.forEach((sec) => seen(sec.blocks));
  const m = (set) => new Map([...set].map((id) => [id, {id}]));
  doc.notes = {footnotes: m(ids.footnote), endnotes: m(ids.endnote),
    read: {footnotes: {}, endnotes: {}}};
  return doc;
}
const md = (blocks, more) => withNotes(mkDoc(blocks), more);
const mkd = (blocks, more) => {
  const d = mk(blocks);
  withNotes(d.doc, more);
  return d;
};

describe('NoteNumbers: the numbers', () => {
  it('decimal in document order, ids need not be in order', () => {
    const doc = md([f(5, 2), f(9)]);
    const n = NN.numbers(doc);
    assert.deepEqual([...n.footnotes], [[5, '1'], [2, '2'], [9, '3']]);
    assert.equal(n.endnotes.size, 0);
  });
  it('every format: letters wrap as aa bb, roman, symbols repeat',
    () => {
      const ids = Array.from({length: 30}, (_, i) => i + 1);
      const run = (fmt) => {
        const doc = md([f(...ids)]);
        doc.sections[0] = secWith(doc.sections[0].blocks,
          [['numFmt', fmt]]);
        return strs(NN.numbers(doc).footnotes);
      };
      const lo = run('lowerLetter');
      assert.deepEqual([lo[0], lo[25], lo[26], lo[27], lo[29]],
        ['a', 'z', 'aa', 'bb', 'dd']);
      const up = run('upperLetter');
      assert.deepEqual([up[0], up[25], up[26]], ['A', 'Z', 'AA']);
      const ro = run('lowerRoman');
      assert.deepEqual(ro.slice(0, 4), ['i', 'ii', 'iii', 'iv']);
      assert.equal(run('upperRoman')[8], 'IX');
      const sy = run('chicago');
      assert.deepEqual(sy.slice(0, 9), ['*', '†', '‡',
        '§', '**', '††', '‡‡',
        '§§', '***']);
      assert.equal(run('numberInDash')[2], '- 3 -');
      assert.equal(run('ideographDigital')[1], '2', 'unknown: decimal');
      assert.equal(run('none')[0], '');
      assert.equal(chicago(0), '0');
      assert.equal(formatNumber(1, 'chicago'), '1', 'lists as before');
    });
  it('numStart starts the count', () => {
    const doc = md([f(1, 2)]);
    doc.sections[0] = secWith(doc.sections[0].blocks,
      [['numStart', 7]]);
    assert.deepEqual(strs(NN.numbers(doc).footnotes), ['7', '8']);
  });
  it('document level settings apply (rawSettings)', () => {
    const doc = md([f(1, 2)]);
    doc.rawSettings = {name: 'w:settings', attrs: [['xmlns:w',
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main']],
    children: [nodeOf('footnotePr', [['numFmt', 'upperRoman']])]};
    assert.deepEqual(strs(NN.numbers(doc).footnotes), ['I', 'II']);
  });
  it('restart each section; endnotes are numbered by themselves',
    () => {
      const doc = md([f(1, 2, 3)]);
      doc.notes.endnotes = new Map([[1, {id: 1}], [2, {id: 2}]]);
      const kids = [['numRestart', 'eachSect']];
      doc.sections = [
        secWith([marked({id: 1}, {id: 2}, {id: 1, note: 'endnote'})],
          kids),
        secWith([marked({id: 3}, {id: 2, note: 'endnote'})], kids)];
      const n = NN.numbers(doc);
      assert.deepEqual([...n.footnotes], [[1, '1'], [2, '2'],
        [3, '1']]);
      assert.deepEqual([...n.endnotes], [[1, '1'], [2, '2']],
        'endnotes continue: their own restart is continuous');
      doc.sections[1] = secWith(doc.sections[1].blocks, null);
      assert.equal(NN.numbers(doc).footnotes.get(3), '3',
        'no restart: continuous');
    });
  it('restart each page through pageOf; numbers() counts continuous',
    () => {
      const doc = md([f(1, 2, 3, 4)]);
      doc.sections[0] = secWith(doc.sections[0].blocks,
        [['numRestart', 'eachPage']]);
      const page = (r) => (r.id <= 2 ? 1 : 2);
      const seen = [];
      const n = NN.numbersByPage(doc, (r) => {
        seen.push(r);
        return page(r);
      });
      assert.deepEqual(strs(n.footnotes), ['1', '2', '1', '2']);
      assert.deepEqual(seen[0], {note: 'footnote', id: 1,
        pid: doc.sections[0].blocks[0].id, off: 1, s: 0});
      assert.deepEqual(strs(NN.numbers(doc).footnotes),
        ['1', '2', '3', '4']);
    });
  it('endnotes\' eachPage is continuous (Word offers it for ' +
    'footnotes only)', () => {
    const e = (id) => ({id, note: 'endnote'});
    const doc = md([marked(e(1), e(2), e(3))]);
    doc.sections[0] = secWith(doc.sections[0].blocks,
      [['numRestart', 'eachPage']], 'endnotePr');
    const n = NN.numbersByPage(doc, (r) => r.id);  // (a page each)
    assert.deepEqual(strs(n.endnotes), ['1', '2', '3']);
  });
  it('custom marks and orphan notes are not counted; they show ' +
    'their text', () => {
    const doc = md([marked({id: 1}, {id: 2, more: {custom: '+'}},
      {id: 3})], [4]);
    const n = NN.numbers(doc);
    assert.deepEqual([...n.footnotes], [[1, '1'], [3, '2']]);
    assert.equal(NN.labelFor(doc, 'footnote', 2), '+');
    assert.equal(NN.labelFor(doc, 'footnote', 4), null, 'orphan');
    assert.equal(NN.labelFor(doc, 'footnote', 3), '2');
    assert.equal(NN.labelFor(doc, 'nonsense', 3), null);
  });
  it('a mark of a note a modelled part lacks shows [?] and is not ' +
    'counted; later numbers are not shifted', () => {
    const doc = md([f(1, 99, 2)]);
    doc.notes.footnotes.delete(99);
    assert.deepEqual([...NN.numbers(doc).footnotes],
      [[1, '1'], [2, '2']]);
    const p = doc.sections[0].blocks[0];
    assert.equal(NN.markText(doc, p.inlines[3]), '[?]');
    assert.equal(NN.markText(doc, p.inlines[5]), '2');
    assert.equal(NN.noteKey(doc, p), '\u00011\u0001[?]\u00012');
    assert.equal(NN.labelFor(doc, 'footnote', 99), null);
    const L = laid({doc});
    assert.equal(lineTexts(L)[0], 'a|1|a|[?]|a|2');
  });
  it('an unmodellable notes part: every mark counted and numbered',
    () => {
      const doc = md([f(1, 99, 2)]);
      doc.notes = {footnotes: new Map(), endnotes: new Map(),
        read: {footnotes: null, endnotes: null}};
      doc.rels = [{id: 'r1', mode: 'Internal', target: 'footnotes.xml',
        type: 'http://schemas.openxmlformats.org/officeDocument/' +
          '2006/relationships/footnotes'}];
      assert.deepEqual(strs(NN.numbers(doc).footnotes),
        ['1', '2', '3']);
      const p = doc.sections[0].blocks[0];
      assert.equal(NN.markText(doc, p.inlines[3]), '2');
      assert.equal(NN.labelFor(doc, 'endnote', 1), null);
    });
  it('no notes part at all: every mark is [?], nothing counted', () => {
    const doc = md([f(1, 2)]);
    doc.notes = {footnotes: new Map(), endnotes: new Map(),
      read: {footnotes: null, endnotes: null}};
    assert.equal(NN.numbers(doc).footnotes.size, 0);
    const p = doc.sections[0].blocks[0];
    assert.equal(NN.markText(doc, p.inlines[1]), '[?]');
    delete doc.notes;
    assert.equal(NN.markText(doc, p.inlines[1]), '[?]', 'no notes');
  });
  it('a note marked twice: the second mark shows the same number ' +
    'and uses none', () => {
    const doc = md([f(10, 10, 11)]);
    const p = doc.sections[0].blocks[0];
    assert.deepEqual([...NN.numbers(doc).footnotes],
      [[10, '1'], [11, '2']]);
    assert.equal(NN.noteKey(doc, p), '\u00011\u00011\u00012');
  });
  it('custom: a non-string is an ordinary mark', () => {
    const doc = md([f(1)]);
    const x = {...ref(1), custom: null};
    assert.equal(NN.markText(doc, x), '1', 'an ordinary mark');
    assert.equal(NN.isCustom({custom: ''}), true);
    assert.equal(NN.isCustom({custom: null}), false);
  });
  it('marks in table cells count in order, nested tables too; ' +
    'self marks and marks in notes do not', () => {
    const cell = (blocks) => ({tcPr: {extra: []}, blocks, attrs: []});
    const tbl = (cells) => ({type: 'tbl', id: 9001, tblPr: {extra: []},
      grid: [], rows: [{cells}], attrs: []});
    const inner = tbl([cell([f(3)])]);
    const doc = md([f(1), tbl([cell([f(2), inner]), cell([f(4)])]),
      marked({self: true}), f(5)]);
    doc.notes.footnotes.get(1).blocks = [f(77)];
    const n = NN.numbers(doc).footnotes;
    assert.deepEqual([...n], [[1, '1'], [2, '2'], [3, '3'], [4, '4'],
      [5, '5']]);
  });
  it('inserting a mark before renumbers (pure recompute)', () => {
    const doc = md([f(1, 2)], [7]);
    const a = NN.numbers(doc);
    assert.equal(NN.numbers(doc), a, 'memoised');
    doc.sections[0].blocks.unshift(f(7));
    bump(doc);                         // (what an op does)
    const b = NN.numbers(doc);
    assert.deepEqual([...b.footnotes], [[7, '1'], [1, '2'], [2, '3']]);
    assert.deepEqual([...a.footnotes], [[1, '1'], [2, '2']],
      'the older result is not changed');
  });
  it('display text of a mark and of the note own mark', () => {
    const doc = md([f(10, 20)]);
    const p = doc.sections[0].blocks[0];
    assert.equal(NN.markText(doc, p.inlines[1]), '1');
    assert.equal(NN.markText(doc, p.inlines[3]), '2');
    const own = ref(null, 'footnote', {self: true});
    assert.equal(NN.markText(doc, own, 20), '2', 'same as its mark');
    assert.equal(NN.markText(doc, own), null, 'no note given');
    assert.equal(NN.markText(doc, ref(1, 'footnote',
      {custom: '*'})), '*');
    assert.equal(NN.markText(doc, {kind: 'raw'}), null);
    assert.equal(NN.noteKey(doc, p), '\u00011\u00012');
    assert.equal(NN.noteKey(doc, newPara('plain')), '');
  });
});

describe('NoteNumbers: cost', () => {
  const big = (n) => {
    const per = 100, bs = [];
    for (let i = 0; i < n / per; i++) {
      bs.push(f(...Array.from({length: per}, (_, k) => i * per + k)));
    }
    return md(bs);
  };
  const best = (n) => {
    let t = Infinity;
    for (let k = 0; k < 5; k++) {
      const doc = big(n), t0 = performance.now();
      NN.numbers(doc);
      t = Math.min(t, performance.now() - t0);
    }
    return t;
  };
  it('10,000 marks are counted in linear time', () => {
    best(2000);                        // (warm up)
    const small = best(2500), large = best(10000);
    // 4 times the marks: a quadratic count would take 16 times
    assert.ok(large < 9 * Math.max(small, 0.2),
      `10000 marks ${large.toFixed(1)} ms, 2500 ${small.toFixed(1)}`);
    if (process.env.WORD_PERF) assert.ok(large < 100, large + ' ms');
  });
  it('a recount after a change (version bumped) is linear too, ' +
    'the marks of unchanged paragraphs coming from the cache', () => {
    const redo = (n) => {
      const doc = big(n);
      NN.numbers(doc);                 // (marks found per paragraph)
      let t = Infinity;
      for (let k = 0; k < 5; k++) {
        bump(doc);
        const t0 = performance.now();
        NN.numbers(doc);
        t = Math.min(t, performance.now() - t0);
      }
      return t;
    };
    redo(2000);
    const small = redo(2500), large = redo(10000);
    assert.ok(large < 9 * Math.max(small, 0.2),
      `10000 marks ${large.toFixed(1)} ms, 2500 ${small.toFixed(1)}`);
  });
  it('without a change the result is the same object, found fast',
    () => {
      const doc = big(10000), a = NN.numbers(doc);
      const t0 = performance.now();
      for (let k = 0; k < 1000; k++) assert.equal(NN.numbers(doc), a);
      assert.ok(performance.now() - t0 < 100, 'memo hit is cheap');
    });
});

/** The text of every line of L, items joined with '|'. */
const lineTexts = (L) => L.items.flatMap((it) => (it.lines || [])
  .map((l) => l.items.map((x) => x.text).join('|')));
const shownItems = (L) => L.items.flatMap((it) => (it.lines || [])
  .flatMap((l) => l.items.filter((x) => x.field)));
const laid = (d, prev) => {
  const L = new DocLayout(d.doc, prev ? prev.metrics : tm(), prev, {});
  L.layout(800);
  return L;
};

describe('NoteNumbers: the display', () => {
  // a1 b2 c3 -> a, mark, b, mark: "a" + mark + "a" + mark
  let d;
  const make = () => {
    d = mkd([marked({id: 1}, {id: 2}), 'plain']);
    return laid(d);
  };
  it('two marks show 1 and 2 as atomic tokens; the model keeps ' +
    'U+FFFC', () => {
    const L = make();
    assert.equal(lineTexts(L)[0], 'a|1|a|2');
    const xs = shownItems(L);
    assert.equal(xs.length, 2);
    assert.deepEqual(xs.map((x) => [x.from, x.to, x.text]),
      [[1, 2, '1'], [3, 4, '2']]);
    assert.equal(xs[0].f.colour === '#606060', false, 'run format');
    assert.equal(P(d, 0).text, 'a' + O + 'a' + O);
    assert.equal(P(d, 1).text, 'plain');
  });
  it('the shown text is measured: a wider number widens the line',
    () => {
      const L = make();
      const w1 = L.items[0].lines[0].items[1].w;
      const doc = d.doc;
      doc.sections[0] = secWith(doc.sections[0].blocks,
        [['numFmt', 'upperRoman'], ['numStart', 8]]);
      const L2 = laid(d);
      assert.equal(lineTexts(L2)[0], 'a|VIII|a|IX');
      assert.ok(L2.items[0].lines[0].items[1].w > w1);
    });
  it('the caret treats a mark as one unit; selection across it',
    () => {
      make();
      const L = laid(d);
      const id = P(d, 0).id;
      let sel = move(C(d, 0, 1), L, 'right');
      assert.equal(sel.head.off, 2, 'over the whole mark');
      sel = move(sel, L, 'left');
      assert.equal(sel.head.off, 1);
      sel = move(SEL(d, 0, 0, 0, 0), L, 'right', true);
      sel = move(sel, L, 'right', true);
      assert.deepEqual([sel.anchor.off, sel.head.off], [0, 2]);
      assert.equal(id, sel.head.id);
    });
  it('a click on the mark hits its offsets', () => {
    const L = make();
    const it = L.items[0];
    const y = it.y + 4;
    // 'a' is 8 px wide, the mark '1' the next 8 px (a stub font)
    const left = L.hitTest(L.left + 8 + 1, y);
    const right = L.hitTest(L.left + 8 + 7, y);
    assert.equal(left.pos.id, P(d, 0).id);
    assert.equal(left.pos.off, 1);
    assert.equal(right.pos.off, 2);
  });
  it('inserting a paragraph with a mark before (an op) renumbers ' +
    'the display; undo brings the numbers back', () => {
    d = mkd([marked({id: 1}), marked({id: 2}), 'plain'], [5]);
    let L = laid(d);
    const [p0, p1] = d.doc.sections[0].blocks;
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2', 'plain']);
    d.apply({op: 'insertBlock', at: [0, 0], block: marked({id: 5})});
    L = laid(d, L);
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2', 'a|3', 'plain']);
    assert.deepEqual([...NN.numbers(d.doc).footnotes],
      [[5, '1'], [1, '2'], [2, '3']]);
    assert.equal(d.doc.sections[0].blocks[1], p0, 'kept objects');
    d.undo();
    L = laid(d, L);
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2', 'plain']);
    assert.deepEqual([...NN.numbers(d.doc).footnotes],
      [[1, '1'], [2, '2']]);
    assert.equal(d.doc.sections[0].blocks[1], p1);
  });
  it('deleting a mark with Backspace renumbers the marks after it; ' +
    'undo brings them back; the model text holds one U+FFFC each',
  () => {
    d = mkd([marked({id: 1}), marked({id: 2}), 'plain']);
    let L = laid(d);
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2', 'plain']);
    const out = deleteBack(d, C(d, 0, 2));
    assert.notEqual(out, null);
    assert.equal(P(d, 0).text, 'a', 'the mark is gone');
    L = laid(d, L);
    assert.deepEqual(lineTexts(L), ['a', 'a|1', 'plain']);
    d.undo();
    L = laid(d, L);
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2', 'plain']);
    assert.equal(P(d, 0).text, 'a' + O);
  });
});

describe('NoteNumbers: a layout keeps no stale number', () => {
  it('a kept paragraph is laid out again when the count before ' +
    'it changed', () => {
    const a = marked({id: 1}), b = marked({id: 2}), c = marked({id: 3});
    const d = mkd([a, b, c]);
    let L = laid(d);
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2', 'a|3']);
    d.doc.sections[0].blocks.splice(0, 1);       // remove a
    bump(d.doc);
    L = laid(d, L);
    assert.deepEqual(lineTexts(L), ['a|1', 'a|2']);
    assert.equal(L.items[1].block, c, 'c was kept as an object');
  });
  it('in a table cell too', () => {
    const cell = (blocks) => ({tcPr: {extra: []}, blocks, attrs: []});
    const q = marked({id: 2});
    const t = {type: 'tbl', id: 9100, tblPr: {extra: []}, grid: [3000],
      rows: [{trPr: {extra: []}, cells: [cell([q])], attrs: [],
        lead: [], tail: [], tblPrEx: null}], attrs: [], tail: [],
      gridAttrs: []};
    const d = mkd([marked({id: 1}), t]);
    let L = laid(d);
    const cellTexts = (x) => x.items.find((i) => i.kind === 'tbl')
      .rows[0].cells[0].col.items[0].lines[0].items
      .map((y) => y.text).join('|');
    assert.equal(cellTexts(L), 'a|2');
    d.doc.sections[0].blocks.splice(0, 1);
    bump(d.doc);
    L = laid(d, L);
    assert.equal(cellTexts(L), 'a|1');
  });
});
