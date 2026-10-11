// Text to table and table to text (Batch C6.4, D29; ./TblConvert,
// ./TblToText, ./TblConvertCmd). Pure: three paragraphs a\tb\tc, d\te,
// f by tabs make a 3 x 3 table, short rows padded, long rows' extra
// pieces joined into the last cell (separators kept), runs (a bold
// b), inlines (a link, a bookmark) and pPr / pStyle kept per cell,
// ids fresh, inputs never changed; defaultSep (tabs when every
// paragraph has one, else commas, else paragraphs), colsFor (the
// longest line, 1..63); Paragraphs fill rows of `cols` cells; Other
// is one code point; a field across a separator is refused; hostile
// separators and column counts throw RangeError. tableToText: a
// paragraph per row (the cells' first paragraphs joined by the
// separator), a cell's further paragraphs following, a nested table
// flattened first with the same rule, a merged cell once, marks
// between rows and cells kept as inlines, text -> table -> text is
// the text. Commands (one undo step, undo exact): refused for a
// caret, in a cell, across a table or sections, with a field across
// a separator, more than MAX_ROWS rows; Table Grid added like Insert
// > Table; ids unique; the caret in the first cell; Table to text
// at top level and in a cell; bookmark pairs and their count kept.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, OBJ, checkBlock}
  from '../../tools/moreapps/!Word/Model';
import {textToTable, defaultSep, colsFor, straddles, sepChar}
  from '../../tools/moreapps/!Word/TblConvert';
import {tableToText} from '../../tools/moreapps/!Word/TblToText';
import {textToTableCmd, tableToTextCmd, whyText, whyTable}
  from '../../tools/moreapps/!Word/TblConvertCmd';
import {MAX_ROWS, MAX_COLS} from '../../tools/moreapps/!Word/TblCheck';
import {ids as allIds, forEachBlock}
  from '../../tools/moreapps/!Word/Walk';
import {findBlock} from '../../tools/moreapps/!Word/EditPos';
import {mk, undoable, S, bold, plain, el, raw}
  from './edit-docs.mjs';
import {modelTable, freeze, tblDocx} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {roundTrip, schema, hash} from './roundtrip-lib.mjs';

const {xsd} = schema();

const P = (t, o) => newPara(t, o);
const texts = (t) => t.rows.map((r) => r.cells.map((c) => c.blocks
  .map((b) => (b.type === 'p' ? b.text : '#')).join('|')));
const first = (t, r, k) => t.rows[r].cells[k].blocks[0];
const mark = (name, id) => ({kind: 'raw', level: 'p', text: '',
  node: {name: 'w:' + name, attrs: [['w:id', String(id)]],
    children: []}});
const bm = (id, end) => mark(end ? 'bookmarkEnd' : 'bookmarkStart', id);
const fld = (type) => ({kind: 'raw', level: 'r', node: {
  name: 'w:fldChar', attrs: [['w:fldCharType', type]], children: []}});
const top = (d) => d.doc.sections[0].blocks;
const show = (list) => list.map((b) => (b.type === 'p' ? b.text
  : b.type === 'tbl' ? `[${b.rows.length}x${b.grid.length}]` : '#'));
const unique = (doc) => {
  const a = allIds(doc);
  assert.equal(new Set(a).size, a.length, 'ids unique');
};
const idOf = (d, t) => {
  let out;
  forEachBlock(d.doc, (b) => {
    if (b.type === 'p' && b.text === t) out = b;
    return !out;
  });
  return out;
};
const sel = (d, a, b) => S.select({id: idOf(d, a).id, off: 0},
  {id: idOf(d, b).id, off: idOf(d, b).text.length});

const SRC = () => [
  P('a\tb\tc', {pStyle: 'Heading1', runs: [
    {start: 0, end: 2, rPr: plain}, {start: 2, end: 3, rPr: bold},
    {start: 3, end: 5, rPr: plain}]}),
  P('d\te', {pPr: {jc: 'center', extra: []}}),
  P('f'),
];

describe('defaultSep and colsFor', () => {
  it('tabs when every paragraph has one, else commas, else paras', () => {
    assert.equal(defaultSep(SRC().slice(0, 2)), 'tab');
    assert.equal(defaultSep(SRC()), 'para');
    assert.equal(defaultSep([P('a,b'), P('c,d'), P('e')]), 'para');
    assert.equal(defaultSep([P('a,b'), P('c,d\te')]), 'comma');
    assert.equal(defaultSep([]), 'para');
  });
  it('the longest line, 1 for paragraphs, 63 at most', () => {
    assert.equal(colsFor(SRC(), 'tab'), 3);
    assert.equal(colsFor(SRC(), 'para'), 1);
    assert.equal(colsFor([P('a;b;c;d')], ';'), 4);
    assert.equal(colsFor([P('')], 'tab'), 1);
    assert.equal(colsFor([P(','.repeat(99))], 'comma'), MAX_COLS);
    assert.equal(colsFor([P(',,')], 'comma'), 3);
  });
});

describe('textToTable', () => {
  it('three tabbed paragraphs: 3 x 3, padded, runs, pPr kept', () => {
    const src = freeze(SRC());
    const t = textToTable(src, {sep: 'tab', cols: 3});
    checkBlock(t);
    assert.deepEqual(texts(t), [['a', 'b', 'c'], ['d', 'e', ''],
      ['f', '', '']]);
    assert.equal(t.grid.length, 3);
    assert.equal(t.tblPr.tblW.type, 'auto');
    const b = first(t, 0, 1);
    assert.deepEqual(b.runs.map((r) => r.rPr.b), [true]);
    assert.equal(first(t, 0, 0).pStyle, 'Heading1');
    assert.equal(first(t, 0, 2).pStyle, 'Heading1');
    assert.equal(first(t, 1, 2).pPr.jc, 'center', 'padded: its row');
    assert.equal(first(t, 1, 0).pPr.jc, 'center');
    const ids = new Set(src.map((p) => p.id));
    for (const row of t.rows) for (const c of row.cells) {
      assert.ok(!ids.has(c.blocks[0].id), 'fresh id');
    }
    unique({sections: [{blocks: [t]}]});
  });
  it('a link and a bookmark stay in their cell', () => {
    const link = {kind: 'raw', level: 'p', text: 'x\ty',
      node: {name: 'w:hyperlink', attrs: [], children: []}};
    const p = P('a\t' + OBJ + '\tb' + OBJ, {inlines: {2: link,
      5: bm(1, true)}});
    const t = textToTable(freeze([p]), {sep: 'tab'});
    assert.deepEqual(texts(t), [['a', OBJ, 'b' + OBJ]]);
    assert.deepEqual(first(t, 0, 1).inlines[0], link);
    assert.equal(first(t, 0, 2).inlines[1].node.name, 'w:bookmarkEnd');
  });
  it('long rows: the extra pieces go in the last cell, separators in', () => {
    const t = textToTable([P('a,b,c,d'), P('e')], {sep: 'comma',
      cols: 2});
    assert.deepEqual(texts(t), [['a', 'b,c,d'], ['e', '']]);
  });
  it('Paragraphs: rows of `cols` cells, the last row padded', () => {
    const ps = ['p1', 'p2', 'p3', 'p4', 'p5'].map((x) => P(x));
    const t = textToTable(ps, {sep: 'para', cols: 2});
    assert.deepEqual(texts(t), [['p1', 'p2'], ['p3', 'p4'], ['p5', '']]);
    assert.deepEqual(texts(textToTable(ps, {sep: 'para'})),
      ps.map((p) => [p.text]), 'cols default 1');
  });
  it('Other: one code point', () => {
    const t = textToTable([P('a;b'), P('c')], {sep: ';'});
    assert.deepEqual(texts(t), [['a', 'b'], ['c', '']]);
    const u = textToTable([P('a\u{1F600}b')], {sep: '\u{1F600}'});
    assert.deepEqual(texts(u), [['a', 'b']]);
    for (const bad of ['', 'ab', '￼', 5, null, {}, '\u{1F600}x']) {
      assert.throws(() => textToTable([P('a')], {sep: bad}), RangeError);
    }
  });
  it('hostile columns and paragraphs', () => {
    for (const cols of [0, -1, 64, 1.5, NaN, Infinity, '2', 1e9]) {
      assert.throws(() => textToTable([P('a')], {sep: 'tab', cols}),
        RangeError);
    }
    assert.throws(() => textToTable([], {sep: 'tab'}), RangeError);
    assert.throws(() => textToTable([{type: 'opaque'}], {sep: 'tab'}),
      RangeError);
    assert.throws(() => textToTable([P('a')], {sep: '__proto__'}),
      RangeError);
    const w = textToTable([P('a\tb')], {sep: 'tab', cols: 63});
    assert.equal(w.grid.length, 63);
  });
  it('a field across a separator is refused, one inside a cell is not', () => {
    const across = P('a' + OBJ + 'x\ty' + OBJ + 'b', {inlines: {
      1: fld('begin'), 5: fld('end')}});
    assert.equal(straddles([across], 'tab'), true);
    assert.throws(() => textToTable([across], {sep: 'tab'}), RangeError);
    assert.doesNotThrow(() => textToTable([across], {sep: 'comma'}));
    assert.doesNotThrow(() => textToTable([across], {sep: 'para'}));
    const inside = P('a' + OBJ + 'x' + OBJ + '\tb', {inlines: {
      1: fld('begin'), 3: fld('end')}});
    assert.equal(straddles([inside], 'tab'), false);
    const t = textToTable([inside], {sep: 'tab'});
    assert.equal(first(t, 0, 0).inlines[1].node.name, 'w:fldChar');
    // begun in one paragraph, a separator in the next
    const a = P('a' + OBJ, {inlines: {1: fld('begin')}});
    assert.equal(straddles([a, P('x\ty')], 'tab'), true);
  });
});

describe('tableToText', () => {
  const T = () => freeze(modelTable([
    ['a', 'b'],
    ['c', [P('d1'), P('d2')]],
  ]));
  it('tabs: a row a paragraph, further paragraphs following', () => {
    const t = T();
    const out = tableToText(t, {sep: 'tab'});
    assert.deepEqual(out.map((b) => b.text), ['a\tb', 'c\td1', 'd2']);
    out.forEach(checkBlock);
    const old = new Set(allIds({sections: [{blocks: [t]}]}));
    for (const b of out) assert.ok(!old.has(b.id), 'fresh id');
  });
  it('commas, paragraphs and one other character', () => {
    assert.deepEqual(tableToText(T(), {sep: 'comma'}).map((b) => b.text),
      ['a,b', 'c,d1', 'd2']);
    assert.deepEqual(tableToText(T(), {sep: 'para'}).map((b) => b.text),
      ['a', 'b', 'c', 'd1', 'd2']);
    assert.deepEqual(tableToText(T(), {sep: '|'}).map((b) => b.text),
      ['a|b', 'c|d1', 'd2']);
    assert.throws(() => tableToText(T(), {sep: 'xx'}), RangeError);
    assert.throws(() => tableToText(T(), {sep: '￼'}), RangeError);
  });
  it('runs and pPr of the first cell\'s paragraph kept', () => {
    const t = freeze(modelTable([[
      [P('one', {pStyle: 'S1', runs: [{start: 0, end: 3, rPr: bold}]})],
      [P('two')]]]));
    const [p] = tableToText(t, {sep: 'tab'});
    assert.equal(p.text, 'one\ttwo');
    assert.equal(p.pStyle, 'S1');
    assert.equal(p.runs[0].rPr.b, true);
    assert.equal(p.runs[0].end, 4, 'the tab takes the format before it');
  });
  it('a nested table is flattened first, with the same rule', () => {
    const inner = modelTable([['x', 'y'], ['z', 'w']]);
    const t = freeze(modelTable([['a', [P('b'), inner, P('end')]]]));
    assert.deepEqual(tableToText(t, {sep: 'tab'}).map((b) => b.text),
      ['a\tb', 'x\ty', 'z\tw', 'end']);
    assert.deepEqual(tableToText(t, {sep: 'para'}).map((b) => b.text),
      ['a', 'b', 'x', 'y', 'z', 'w', 'end']);
  });
  it('a cell that starts with a nested table', () => {
    const inner = modelTable([['x']]);
    const t = freeze(modelTable([['a', [inner, P('end')]]]));
    assert.deepEqual(tableToText(t, {sep: 'tab'}).map((b) => b.text),
      ['a\t', 'x', 'end']);
  });
  it('a merged cell once: the continue cell adds nothing', () => {
    const t = freeze(modelTable([
      ['a', {blocks: [P('m')], tcPr: {vMerge: 'restart', extra: []}}],
      ['c', {blocks: [P('')], tcPr: {vMerge: 'continue', extra: []}}],
    ]));
    assert.deepEqual(tableToText(t, {sep: 'tab'}).map((b) => b.text),
      ['a\tm', 'c']);
    const s = freeze(modelTable([[
      {blocks: [P('wide')], tcPr: {gridSpan: 2, extra: []}}, 'z']],
    {grid: [1000, 1000, 1000]}));
    assert.deepEqual(tableToText(s, {sep: 'tab'}).map((b) => b.text),
      ['wide\tz']);
  });
  it('marks between rows and cells are kept as inlines, in place', () => {
    const base = modelTable([['a', 'b'], ['c', 'd']]);
    const t = freeze({...base, tail: [el('bookmarkEnd')],
      rows: [{...base.rows[0], lead: [el('bookmarkStart')],
        tail: [el('commentRangeEnd')]},
      {...base.rows[1], cells: [{...base.rows[1].cells[0],
        lead: [el('permStart')]}, base.rows[1].cells[1]]}]});
    const out = tableToText(t, {sep: 'tab'});
    assert.deepEqual(out.map((b) => b.text), [OBJ + 'a\tb' + OBJ,
      OBJ + 'c\td' + OBJ]);
    const names = (p) => Object.keys(p.inlines).map(
      (k) => p.inlines[k].node.name);
    assert.deepEqual(names(out[0]), ['w:bookmarkStart',
      'w:commentRangeEnd']);
    assert.deepEqual(names(out[1]), ['w:permStart', 'w:bookmarkEnd']);
    out.forEach(checkBlock);
  });
  it('text -> table -> text is the text', () => {
    const src = SRC().slice(0, 2);
    const t = textToTable(src, {sep: 'tab', cols: 3});
    assert.deepEqual(tableToText(t, {sep: 'tab'}).map((b) => b.text),
      ['a\tb\tc', 'd\te\t']);
  });
});

const doc3 = () => mk(SRC());

describe('textToTableCmd', () => {
  it('one undo step; Table Grid; the caret in the first cell', () => {
    const d = mk([...SRC(), 'after']);
    const was = d.doc.styles;
    const s = sel(d, 'a\tb\tc', 'f');
    assert.equal(whyText(d.doc, s, {sep: 'tab', cols: 3}), null);
    const out = undoable(d, () => textToTableCmd(d, s, {sep: 'tab',
      cols: 3}));
    assert.ok(out);
    assert.deepEqual(show(top(d)), ['[3x3]', 'after']);
    const t = top(d)[0];
    assert.equal(t.tblPr.tblStyle, 'TableGrid');
    assert.ok(d.doc.styles.styles.has('TableGrid'));
    assert.ok(!was.styles.has('TableGrid'));
    assert.deepEqual(out.head, {id: first(t, 0, 0).id, off: 0});
    assert.equal(out.anchor.id, out.head.id);
    unique(d.doc);
  });
  it('a table is never last: an empty paragraph goes after it', () => {
    const d = mk(['x', ['y', {}]]);
    const s = sel(d, 'x', 'y');
    const out = textToTableCmd(d, s, {sep: 'para', cols: 1});
    assert.ok(out);
    assert.deepEqual(show(top(d)), ['[2x1]', '']);
    unique(d.doc);
  });
  it('defaults: the default separator and its columns', () => {
    const d = mk(['a\tb', 'c\td']);
    const out = textToTableCmd(d, sel(d, 'a\tb', 'c\td'), {});
    assert.ok(out);
    assert.deepEqual(texts(top(d)[0]), [['a', 'b'], ['c', 'd']]);
  });
  it('a selection ending at the start of the next paragraph leaves it', () => {
    const d = mk(['a\tb', 'c\td', 'e']);
    const s = S.select({id: idOf(d, 'a\tb').id, off: 0},
      {id: idOf(d, 'e').id, off: 0});
    textToTableCmd(d, s, {sep: 'tab'});
    assert.deepEqual(show(top(d)), ['[2x2]', 'e']);
  });
  it('partial paragraphs convert whole; a paragraph alone', () => {
    const d = mk(['a\tb', 'c\td']);
    const s = S.select({id: idOf(d, 'a\tb').id, off: 1},
      {id: idOf(d, 'c\td').id, off: 1});
    assert.ok(textToTableCmd(d, s, {sep: 'tab'}));
    assert.deepEqual(texts(top(d)[0]), [['a', 'b'], ['c', 'd']]);
  });
  it('refused with no step: a caret, a cell, across a table', () => {
    const d = mk(['a\tb', 'c\td']);
    const c = S.caret({id: idOf(d, 'a\tb').id, off: 0});
    const n = d.undoDepth;
    assert.equal(textToTableCmd(d, c, {sep: 'tab'}), null);
    assert.match(whyText(d.doc, c, {sep: 'tab'}), /Select/);
    assert.equal(textToTableCmd(d, null, {sep: 'tab'}), null);
    assert.equal(d.undoDepth, n);
    const e = mk(['a', modelTable([['u', 'v'], ['w\tz', 'q']]), 'b']);
    const inCell = S.select({id: idOf(e, 'u').id, off: 0},
      {id: idOf(e, 'u').id, off: 1});
    assert.equal(textToTableCmd(e, inCell, {sep: 'tab'}), null);
    assert.match(whyText(e.doc, inCell, {sep: 'tab'}), /cell/);
    const across = sel(e, 'a', 'b');
    assert.equal(textToTableCmd(e, across, {sep: 'tab'}), null);
    assert.match(whyText(e.doc, across, {sep: 'tab'}), /table/);
    assert.equal(e.undoDepth, 0);
  });
  it('refused: separate sections, a field, hostile options', () => {
    const d = mk(['a\tb', 'c\td']);
    d.doc.sections.push({props: {extra: []}, raw: null,
      blocks: [P('e\tf')]});
    const s = S.select({id: idOf(d, 'a\tb').id, off: 0},
      {id: idOf(d, 'e\tf').id, off: 3});
    assert.equal(textToTableCmd(d, s, {sep: 'tab'}), null);
    assert.match(whyText(d.doc, s, {sep: 'tab'}), /section/);
    const f = mk([P('a' + OBJ + 'x\ty' + OBJ, {inlines: {
      1: fld('begin'), 5: fld('end')}}), 'b']);
    const sf = sel(f, 'b', 'b');
    const two = S.select({id: top(f)[0].id, off: 0}, {id: top(f)[1].id,
      off: 1});
    assert.equal(textToTableCmd(f, two, {sep: 'tab'}), null);
    assert.match(whyText(f.doc, two, {sep: 'tab'}), /field/);
    assert.ok(textToTableCmd(f, two, {sep: 'comma'}), 'other sep ok');
    assert.ok(sf);
    const g = mk(['a', 'b']);
    const sg = sel(g, 'a', 'b');
    for (const o of [{sep: 'zz'}, {sep: 'tab', cols: 64},
      {sep: 'tab', cols: 0}, {sep: 'tab', cols: NaN},
      {sep: '￼'}, {sep: 'tab', cols: '2'}]) {
      assert.equal(textToTableCmd(g, sg, o), null, JSON.stringify(o));
      assert.equal(typeof whyText(g.doc, sg, o), 'string');
    }
    assert.equal(g.undoDepth, 0);
  });
  it('more than MAX_ROWS rows is refused, MAX_ROWS is not', () => {
    const many = (n) => Array.from({length: n}, (_, i) => 'p' + i);
    const d = mk(many(MAX_ROWS + 1));
    const all = S.select({id: top(d)[0].id, off: 0},
      {id: top(d)[MAX_ROWS].id, off: 2});
    assert.equal(textToTableCmd(d, all, {sep: 'para', cols: 1}), null);
    assert.match(whyText(d.doc, all, {sep: 'para', cols: 1}), /rows/);
    assert.equal(d.undoDepth, 0);
    const e = mk(many(MAX_ROWS));
    const ok = S.select({id: top(e)[0].id, off: 0},
      {id: top(e)[MAX_ROWS - 1].id, off: 2});
    assert.ok(textToTableCmd(e, ok, {sep: 'para', cols: 1}));
    assert.equal(top(e)[0].rows.length, MAX_ROWS);
  });
  it('a bookmark pair across two cells stays whole', () => {
    const d = mk([P('a' + OBJ + '\tb' + OBJ, {inlines: {1: bm(7),
      4: bm(7, true)}})]);
    const s = S.select({id: top(d)[0].id, off: 0},
      {id: top(d)[0].id, off: 5});
    assert.ok(undoable(d, () => textToTableCmd(d, s, {sep: 'tab'})));
    const t = top(d)[0];
    assert.equal(first(t, 0, 0).inlines[1].node.name, 'w:bookmarkStart');
    assert.equal(first(t, 0, 1).inlines[1].node.name, 'w:bookmarkEnd');
  });
});

describe('tableToTextCmd', () => {
  const withTable = () => mk(['before', modelTable([['a', 'b'],
    ['c', [P('d1'), P('d2')]]]), 'after']);
  const inT = (d, t) => S.caret({id: idOf(d, t).id, off: 0});
  it('one undo step; the text where the table was', () => {
    const d = withTable();
    const out = undoable(d, () => tableToTextCmd(d, inT(d, 'a'),
      {sep: 'tab'}));
    assert.ok(out);
    assert.deepEqual(show(top(d)), ['before', 'a\tb', 'c\td1', 'd2',
      'after']);
    unique(d.doc);
    assert.equal(typeof whyTable(d.doc, inT(d, 'a\tb')), 'string');
    d.undo();
    assert.equal(whyTable(d.doc, inT(d, 'a')), null);
  });
  it('a cells selection and a nested table in a cell', () => {
    const inner = modelTable([['x', 'y'], ['z', 'w']]);
    const d = mk([modelTable([['a', [P('n'), inner, P('e')]]]), 'tail']);
    const out = undoable(d, () => tableToTextCmd(d, inT(d, 'x'),
      {sep: 'comma'}));
    assert.ok(out);
    const cell = top(d)[0].rows[0].cells[1].blocks;
    assert.deepEqual(cell.map((b) => b.text), ['n', 'x,y', 'z,w', 'e']);
    assert.deepEqual(texts(top(d)[0]), [['a', 'n|x,y|z,w|e']]);
    unique(d.doc);
  });
  it('refused with no step outside a table', () => {
    const d = withTable();
    const c = inT(d, 'before');
    const n = d.undoDepth;
    assert.equal(tableToTextCmd(d, c, {sep: 'tab'}), null);
    assert.equal(typeof whyTable(d.doc, c), 'string');
    assert.equal(tableToTextCmd(d, inT(d, 'a'), {sep: 'xy'}), null);
    assert.equal(tableToTextCmd(d, null, {sep: 'tab'}), null);
    assert.equal(d.undoDepth, n);
  });
  it('bookmarks are kept: the count of marks does not change', () => {
    const cellP = (t, i, e) => P(t + OBJ, {inlines: {[t.length]:
      bm(i, e)}});
    const d = mk([modelTable([[[cellP('a', 1)], [cellP('b', 1, true)]],
      [[P('c')], [P('d')]]]), 'tail']);
    const count = () => {
      let n = 0;
      forEachBlock(d.doc, (b) => {
        if (b.type === 'p') n += Object.keys(b.inlines).length;
        return true;
      });
      return n;
    };
    assert.equal(count(), 2);
    undoable(d, () => tableToTextCmd(d, inT(d, 'a' + OBJ), {sep: 'tab'}));
    assert.equal(count(), 2);
    assert.deepEqual(top(d).slice(0, 2).map((b) => b.text),
      ['a' + OBJ + '\tb' + OBJ, 'c\td']);
  });
  it('table -> text -> table gives the same cells', () => {
    const d = mk([modelTable([['a', 'b'], ['c', 'd']]), 'tail']);
    tableToTextCmd(d, inT(d, 'a'), {sep: 'tab'});
    const s = sel(d, 'a\tb', 'c\td');
    assert.ok(textToTableCmd(d, s, {sep: 'tab'}));
    assert.deepEqual(texts(top(d)[0]), [['a', 'b'], ['c', 'd']]);
    assert.equal(findBlock(d.doc, top(d)[0].id).at.length, 2);
  });
});

describe('written files', () => {
  it('both conversions write valid XML that reads back equal', async () => {
    const tabbed = (a, b) => p('<w:r><w:t>' + a + '</w:t><w:tab/>' +
      '<w:t>' + b + '</w:t></w:r>');
    const bytes = await tblDocx(tabbed('a', 'b') + tabbed('c', 'd') +
      p(r('end')));
    const to = async (d) => {
      const s = textToTableCmd(d, S.select(
        {id: top(d)[0].id, off: 0}, {id: top(d)[1].id, off: 3}),
      {sep: 'tab'});
      assert.ok(s);
      assert.equal(top(d)[0].rows[0].cells.length, 2);
      d.typing = null;
      return {};
    };
    const res = await roundTrip(bytes, 'text to table', hash('c64a'), to,
      {xsd, read: {}});
    assert.ok(!res.refused);
    const back = async (d) => {
      const s = textToTableCmd(d, S.select(
        {id: top(d)[0].id, off: 0}, {id: top(d)[1].id, off: 3}),
      {sep: 'tab'});
      assert.ok(s);
      assert.ok(tableToTextCmd(d, s, {sep: 'comma'}));
      assert.deepEqual(show(top(d)).slice(0, 2), ['a,b', 'c,d']);
      d.typing = null;
      return {};
    };
    const res2 = await roundTrip(bytes, 'table to text', hash('c64b'),
      back, {xsd, read: {}});
    assert.ok(!res2.refused);
  });
});

describe('C6 fix: fields never cut into cells (B2)', () => {
  // a table of contents: one field over three paragraphs
  const toc = () => [
    P(OBJ + 'Intro\t1', {inlines: {0: fld('begin')}}),
    P('Body\t2'),
    P('End\t3' + OBJ, {inlines: {5: fld('end')}}),
  ];
  for (const sep of ['para', 'tab', 'comma', '-']) {
    it(`a field over several paragraphs is refused (${sep})`, () => {
      assert.equal(straddles(toc(), sep), true);
      assert.throws(() => textToTable(toc(), {sep}), RangeError);
      const d = mk([...toc(), 'after']);
      const s = S.select({id: top(d)[0].id, off: 0},
        {id: top(d)[2].id, off: 6});
      assert.match(whyText(d.doc, s, {sep}), /field/);
      assert.equal(textToTableCmd(d, s, {sep}), null);
      assert.equal(d.undoDepth, 0);
      assert.equal(top(d).length, 4);
    });
  }
  it('a selection starting inside a field is refused', () => {
    const d = mk([P('a' + OBJ, {inlines: {1: fld('begin')}}), 'x\ty',
      'z\tw', P('q' + OBJ, {inlines: {1: fld('end')}}), 'after']);
    for (const [a, b] of [[1, 2], [1, 1], [2, 3]]) {
      const s = S.select({id: top(d)[a].id, off: 0}, {id: top(d)[b].id,
        off: top(d)[b].text.length});
      for (const sep of ['para', 'tab']) {
        assert.match(whyText(d.doc, s, {sep}), /field/, `${a}..${b}`);
        assert.equal(textToTableCmd(d, s, {sep}), null);
      }
    }
    assert.equal(d.undoDepth, 0);
    // after the field: converts
    const s = S.select({id: top(d)[4].id, off: 0}, {id: top(d)[4].id,
      off: 5});
    assert.equal(whyText(d.doc, s, {sep: 'para'}), null);
  });
  it('a field ending before the selection, or within one paragraph, ' +
    'is fine', () => {
    const d = mk([P('a' + OBJ + 'x' + OBJ, {inlines: {1: fld('begin'),
      3: fld('end')}}), P('b' + OBJ + 'c' + OBJ + '\td', {inlines: {
      1: fld('begin'), 3: fld('end')}}), 'e\tf']);
    const s = S.select({id: top(d)[1].id, off: 0}, {id: top(d)[2].id,
      off: 3});
    for (const sep of ['para', 'tab']) {
      assert.equal(whyText(d.doc, s, {sep}), null, sep);
    }
    assert.ok(textToTableCmd(d, s, {sep: 'tab'}));
    assert.equal(top(d)[1].type, 'tbl');
  });
});

describe('C6 fix: minors of Convert (B5)', () => {
  it('M4: Other refuses control characters and lone surrogates', () => {
    for (const bad of ['\u0001', '\u001f', '\u007f', '\u0085', '\ud800',
      '\udc00', '\n', '\r']) {
      assert.throws(() => sepChar(bad), RangeError, JSON.stringify(bad));
      assert.throws(() => textToTable([P('a')], {sep: bad}), RangeError);
      assert.throws(() => tableToText(modelTable([['a', 'b']]),
        {sep: bad}), RangeError);
      const d = mk(['a', 'b']);
      assert.match(whyText(d.doc, sel(d, 'a', 'b'), {sep: bad}),
        /Separator/);
    }
    for (const ok of ['-', ';', '\u00e9', '\u{1F600}', '|']) {
      assert.equal(sepChar(ok), ok);
    }
    assert.equal(sepChar('tab'), '\t');
  });
  it('M6: padding and empty cells are not in the list', () => {
    const np = {numPr: {numId: 1, ilvl: 0}, extra: []};
    const t = textToTable([P('a\t\tc', {pPr: np}), P('d', {pPr: np})],
      {sep: 'tab'});
    assert.deepEqual(first(t, 0, 0).pPr.numPr, {numId: 1, ilvl: 0});
    assert.equal(first(t, 0, 1).pPr.numPr, undefined, 'empty piece');
    assert.equal(first(t, 1, 1).pPr.numPr, undefined, 'padding');
    assert.equal(first(t, 1, 2).pPr.numPr, undefined, 'padding');
    const q = textToTable([P('a', {pPr: np}), P('b', {pPr: np}),
      P('c', {pPr: np})], {sep: 'para', cols: 2});
    assert.equal(first(q, 1, 1).pPr.numPr, undefined, 'padding');
    assert.deepEqual(first(q, 1, 0).pPr.numPr, {numId: 1, ilvl: 0});
    checkBlock(t);
  });
  it('M3: a hidden (continue) cell\'s content is kept after its row',
    () => {
      const inner = modelTable([['n1', 'n2']]);
      const t = freeze(modelTable([
        ['a', {blocks: [P('m')], tcPr: {vMerge: 'restart', extra: []}}],
        ['c', {blocks: [P('HIDDEN TEXT'), inner, P('')],
          tcPr: {vMerge: 'continue', extra: []}}],
        ['e', 'f'],
      ]));
      assert.deepEqual(tableToText(t, {sep: 'tab'}).map((b) => b.text),
        ['a\tm', 'c', 'HIDDEN TEXT', 'n1\tn2', 'e\tf']);
      assert.deepEqual(tableToText(t, {sep: 'para'}).map((b) => b.text),
        ['a', 'm', 'c', 'HIDDEN TEXT', 'n1', 'n2', 'e', 'f']);
      // only bookmark marks (and empty paragraphs): with the row
      const only = freeze(modelTable([
        ['a', {blocks: [P('m')], tcPr: {vMerge: 'restart', extra: []}}],
        ['c', {blocks: [P(OBJ, {inlines: {0: bm(9)}}), P('')],
          tcPr: {vMerge: 'continue', extra: []}}],
      ]));
      const out = tableToText(only, {sep: 'tab'});
      assert.deepEqual(out.map((b) => b.text), ['a\tm', 'c' + OBJ]);
      for (const b of out) checkBlock(b);
    });
});

void doc3; void raw;
