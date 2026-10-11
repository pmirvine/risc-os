// Typing, Enter, Backspace and Delete in and around tables (Batch
// C3.4, D10's rules, TB10, TB11; D23's delete rows; R17, R18): every
// command one undo step that undoes deep-equal (tables deep-frozen:
// copy-on-write), a refusal or a no-op none. In a cell: typing, Enter
// (two paragraphs in the cell), Backspace at its start and Delete at
// its end do nothing; around a table TB10's four cases; at a table's
// edge the first press selects it and the second deletes it (a
// section, or a cell, left ending with a table gets a paragraph);
// over a 'cells' shape Delete clears (each cell keeps one empty
// paragraph with its first paragraph's pPr and style), Backspace
// removes whole rows / the whole table, else clears; typing, Enter
// and paste over cells clear them and go into the top-left cell; a
// 'mixed' range deletes its paragraphs and the covered rows, keeping
// a bookmark pair across them whole; Ctrl-Enter and section breaks
// in a cell are refused; the caret after undoing a table restore
// (R18); TblEdit.emptyLike / clearCells / deleteRows; TblCmd.onTable.
// D20: EditPos ranks kept per row (./EditRank) equal the layout's
// flow places; a whole keystroke in a cell (the edit with its
// findBlock, the layout, Selection.clamp) of one of five 1000 x 5
// tables within +5 ms of one in the same document without tables.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../../tools/moreapps/!Word/EditDel';
import * as E from '../../tools/moreapps/!Word/Edit';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {emptyLike, clearCells, deleteRows}
  from '../../tools/moreapps/!Word/TblEdit';
import {onTable} from '../../tools/moreapps/!Word/TblCmd';
import {marks} from '../../tools/moreapps/!Word/BookmarkFind';
import {newPara, newSection, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {at as walkAt} from '../../tools/moreapps/!Word/Walk';
import {mk, undoable, snap, S, O} from './edit-docs.mjs';
import {tm, loadStyles, mkDoc, rng} from './word-docs.mjs';
import {findBlock, atRank, checkPos}
  from '../../tools/moreapps/!Word/EditPos';
import {forEachBlock} from '../../tools/moreapps/!Word/Walk';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {checkTable} from '../../tools/moreapps/!Word/TblCheck';
import {Document} from '../../tools/moreapps/!Word/Document';
import {modelTable, freeze} from './tbl-fixtures.mjs';

/** The paragraph whose text is t (any depth). */
function byText(doc, t) {
  let out = null;
  const look = (list) => list.forEach((b) => {
    if (b.type === 'p' && b.text === t && !out) out = b;
    if (b.type === 'tbl') {
      b.rows.forEach((r) => r.cells.forEach((c) => look(c.blocks)));
    }
  });
  doc.sections.forEach((s) => look(s.blocks));
  return out;
}
const pos = (d, t, off = 0) => ({id: byText(d.doc, t).id, off});
const car = (d, t, off) => S.caret(pos(d, t, off));
const sel = (d, a, ao, h, ho) => S.select(pos(d, a, ao), pos(d, h, ho));
/** The texts of a block list, a table as its rows of cells' texts. */
function show(list) {
  return list.map((b) => (b.type === 'p' ? b.text : b.type !== 'tbl'
    ? '#' : b.rows.map((r) => r.cells.map((c) => show(c.blocks)))));
}
const body = (d) => show(d.doc.sections[0].blocks);
const name = (d, p) => {
  let out = null;
  const look = (list) => list.forEach((b) => {
    if (b.id === p.id) out = b.type === 'p' ? `${b.text}:${p.off}`
      : `tbl:${p.off}`;
    if (b.type === 'tbl') {
      b.rows.forEach((r) => r.cells.forEach((c) => look(c.blocks)));
    }
  });
  d.doc.sections.forEach((s) => look(s.blocks));
  return out;
};
const head = (d, s) => name(d, s.head);
const T3 = (cell = (i, j) => `r${i}c${j}`) => modelTable([0, 1, 2]
  .map((i) => [0, 1, 2].map((j) => cell(i, j))));
/** before..., a deep-frozen table, after...: {d, T}. */
function doc(T, before = ['p0'], after = ['p2']) {
  return {d: mk([...before, freeze(T), ...after]), T};
}
const tblOf = (d) => d.doc.sections[0].blocks.find((b) => b.type ===
  'tbl');
const mark = (n, id) => ({kind: 'raw', level: 'p', text: '',
  node: {name: 'w:' + n, attrs: [['w:id', String(id)]], children: []}});
const node = (n, id) => ({name: 'w:' + n, attrs: [['w:id', String(id)]],
  children: []});
const kinds = (d) => marks(d.doc).map((m) => `${m.kind}${m.id}`).sort();

describe('in a cell: typing, Enter, the cell\'s edges', () => {
  it('typing in a cell: one step, undo deep-equal', () => {
    const {d} = doc(T3());
    const out = undoable(d, () => E.typeText(d, car(d, 'r1c1', 2), 'xy'));
    assert.equal(head(d, out), 'r1xyc1:4');
    assert.deepEqual(body(d)[1][1], [['r1c0'], ['r1xyc1'], ['r1c2']]);
  });
  it('Enter in a cell: two paragraphs in the cell', () => {
    const {d} = doc(T3());
    const out = undoable(d, () => E.splitPara(d, car(d, 'r1c1', 2)));
    assert.deepEqual(body(d)[1][1][1], ['r1', 'c1']);
    assert.equal(head(d, out), 'c1:0');
  });
  it('Backspace at a cell\'s first paragraph start: nothing, no step',
    () => {
      const {d} = doc(T3());
      const before = snap(d), s = car(d, 'r1c1', 0);
      assert.equal(X.deleteBack(d, s), s);
      assert.equal(X.deleteWordBack(d, s), s);
      assert.equal(d.undoDepth, 0);
      assert.ok(deepEqual(d.doc.sections, before));
    });
  it('Delete at a cell\'s last paragraph end: nothing, no step', () => {
    const {d} = doc(T3((i, j) => (i === 1 && j === 1 ? ['a', 'b']
      : `r${i}c${j}`)));
    const s = car(d, 'b', 1);
    assert.equal(X.deleteForward(d, s), s);
    assert.equal(d.undoDepth, 0);
    // inside the cell they still join
    undoable(d, () => X.deleteForward(d, car(d, 'a', 1)));
    assert.deepEqual(body(d)[1][1][1], ['ab']);
  });
  it('a selection within one cell over two paragraphs is deleted there',
    () => {
      const {d} = doc(T3((i, j) => (i === 0 && j === 0 ? ['ab', 'cd']
        : `r${i}c${j}`)));
      const out = undoable(d, () => X.deleteForward(d,
        sel(d, 'ab', 1, 'cd', 1)));
      assert.deepEqual(body(d)[1][0][0], ['ad']);
      assert.equal(head(d, out), 'ad:1');
    });
});

describe('TB10: Backspace after a table, Delete before one', () => {
  it('Backspace at an empty paragraph after a table (not last): ' +
    'removed, the caret at the end of the last cell', () => {
    const {d} = doc(T3(), ['p0'], ['', 'p3']);
    const out = undoable(d, () => X.deleteBack(d, car(d, '', 0)));
    assert.equal(body(d).length, 3);
    assert.equal(head(d, out), 'r2c2:4');
    assert.equal(d.undoDepth, 1);
  });
  it('Backspace at a paragraph after a table: the caret moves to the ' +
    'last cell\'s end, nothing deleted (also an empty last one)', () => {
    const {d} = doc(T3(), ['p0'], ['p2']);
    const out = X.deleteBack(d, car(d, 'p2', 0));
    assert.equal(head(d, out), 'r2c2:4');
    const e = doc(T3(), ['p0'], ['']).d;
    const o2 = X.deleteBack(e, car(e, '', 0));
    assert.equal(head(e, o2), 'r2c2:4');
    assert.equal(d.undoDepth + e.undoDepth, 0);
    assert.equal(body(e).length, 3);
  });
  it('Delete at an empty paragraph before a table: removed, the caret ' +
    'in the first cell', () => {
    const {d} = doc(T3(), ['p0', ''], ['p2']);
    const out = undoable(d, () => X.deleteForward(d, car(d, '', 0)));
    assert.equal(body(d).length, 3);
    assert.equal(head(d, out), 'r0c0:0');
  });
  it('Delete at the end of a paragraph before a table: nothing', () => {
    const {d} = doc(T3());
    const s = car(d, 'p0', 2);
    assert.equal(X.deleteForward(d, s), s);
    assert.equal(d.undoDepth, 0);
  });
  it('the same in a cell, before and after a nested table', () => {
    const N = modelTable([['n1', 'n2']]);
    const {d} = doc(modelTable([[['', N, 'z'], 'b']]));
    const out = undoable(d, () => X.deleteBack(d, car(d, 'z', 0)));
    assert.equal(head(d, out), 'n2:2');
    const o2 = undoable(d, () => X.deleteForward(d, car(d, '', 0)));
    assert.equal(head(d, o2), 'n1:0');
    assert.equal(body(d)[1][0][0].length, 2);
  });
});

describe('at a table\'s edge: select, then delete', () => {
  it('Backspace at {t, 1}: the table selected; again: deleted; the ' +
    'section left ending with a table gets its paragraph', () => {
    const T1 = freeze(modelTable([['a']])), T = freeze(T3());
    const d = mk(['p0', T1, T]);
    const s2 = newSection();
    s2.blocks.push(newPara('z'));
    d.doc.sections.push(s2);
    d.clearHistory();
    const s = S.caret({id: T.id, off: 1});
    const s1 = X.deleteBack(d, s);
    assert.deepEqual([s1.anchor, s1.head], [{id: T.id, off: 0},
      {id: T.id, off: 1}]);
    assert.equal(d.undoDepth, 0);
    undoable(d, () => X.deleteBack(d, s1));
    const bs = d.doc.sections[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(bs[2].text, '');
  });
  it('a nested table in its cell (a paragraph after it: a cell ends ' +
    'with one): selected, then deleted', () => {
    const N = modelTable([['n1']]);
    const {d} = doc(modelTable([[['a', N, ''], 'b']]));
    const s1 = X.deleteBack(d, S.caret({id: N.id, off: 1}));
    assert.equal(s1.anchor.id, N.id);
    const out = undoable(d, () => X.deleteBack(d, s1));
    assert.deepEqual(body(d)[1][0][0], ['a', '']);
    assert.equal(head(d, out), ':0', 'the block after it');
    const M = modelTable([['m1']]);
    const e = doc(modelTable([[[M, ''], 'b']])).d;
    const o2 = undoable(e, () => X.deleteForward(e,
      S.select({id: M.id, off: 0}, {id: M.id, off: 1})));
    assert.deepEqual(body(e)[1][0][0], ['']);
    assert.equal(head(e, o2), ':0');
  });
});

describe('TB11: Delete, Backspace and typing over cells', () => {
  /** 3x3; cell (0,0) holds two paragraphs, its first centred, Heading1. */
  const rich = () => doc(T3((i, j) => (i === 0 && j === 0
    ? [newPara('r0c0', {pPr: {jc: 'center', extra: []},
      pStyle: 'Heading1'}), 'more'] : `r${i}c${j}`)));
  it('2x2 + Delete: four cells cleared, each one empty paragraph with ' +
    'its first paragraph\'s pPr and style', () => {
    const {d, T} = rich();
    const out = undoable(d, () => X.deleteForward(d,
      sel(d, 'r0c0', 1, 'r1c1', 2)));
    const t = tblOf(d);
    assert.deepEqual(show([t])[0], [[[''], [''], ['r0c2']],
      [[''], [''], ['r1c2']], [['r2c0'], ['r2c1'], ['r2c2']]]);
    const p = t.rows[0].cells[0].blocks[0];
    assert.equal(p.pPr.jc, 'center');
    assert.equal(p.pStyle, 'Heading1');
    assert.notEqual(p.id, T.rows[0].cells[0].blocks[0].id);
    assert.equal(t.rows[2], T.rows[2], 'rows not touched are shared');
    assert.equal(t.rows[0].cells[2], T.rows[0].cells[2]);
    assert.equal(head(d, out), ':0');
    assert.equal(out.head.id, p.id);
  });
  it('2x2 + Backspace inside a 3x3: cleared too', () => {
    const {d} = rich();
    undoable(d, () => X.deleteBack(d, sel(d, 'r1c1', 1, 'r2c2', 2)));
    assert.deepEqual(show([tblOf(d)])[0][2], [['r2c0'], [''], ['']]);
  });
  it('cells already empty: nothing to clear, no step', () => {
    const {d} = doc(T3(() => ''));
    const t = tblOf(d);
    const s = S.select({id: t.rows[0].cells[0].blocks[0].id, off: 0},
      {id: t.rows[1].cells[1].blocks[0].id, off: 0});
    X.deleteForward(d, s);
    assert.equal(d.undoDepth, 0);
  });
  it('whole rows + Backspace: the rows removed', () => {
    const {d} = doc(T3());
    const out = undoable(d, () => X.deleteBack(d,
      sel(d, 'r1c0', 0, 'r1c2', 4)));
    assert.deepEqual(show([tblOf(d)])[0].map((r) => r.map((c) => c[0])),
      [['r0c0', 'r0c1', 'r0c2'], ['r2c0', 'r2c1', 'r2c2']]);
    assert.equal(head(d, out), 'r2c0:0');
  });
  it('whole rows + Delete: cleared, not removed', () => {
    const {d} = doc(T3());
    undoable(d, () => X.deleteForward(d, sel(d, 'r2c0', 0, 'r2c2', 4)));
    assert.deepEqual(show([tblOf(d)])[0][2], [[''], [''], ['']]);
  });
  it('every cell + Backspace: the table removed', () => {
    const {d} = doc(T3());
    const out = undoable(d, () => X.deleteBack(d,
      sel(d, 'r0c0', 0, 'r2c2', 4)));
    assert.deepEqual(body(d), ['p0', 'p2']);
    assert.equal(head(d, out), 'p2:0');
  });
  it('typing x over 2x2: the cells cleared, x in the top-left cell',
    () => {
      const {d} = doc(T3());
      const out = undoable(d, () => E.typeText(d,
        sel(d, 'r1c1', 2, 'r0c0', 1), 'x'));
      assert.deepEqual(show([tblOf(d)])[0].slice(0, 2),
        [[['x'], [''], ['r0c2']], [[''], [''], ['r1c2']]]);
      assert.equal(head(d, out), 'x:1');
    });
  it('Enter over cells: cleared, the top-left cell split', () => {
    const {d} = doc(T3());
    undoable(d, () => E.splitPara(d, sel(d, 'r0c0', 1, 'r0c1', 1)));
    assert.deepEqual(show([tblOf(d)])[0][0], [['', ''], [''],
      ['r0c2']]);
  });
  it('paste over cells: cleared, the text into the top-left cell',
    () => {
      const {d} = doc(T3());
      undoable(d, () => pasteBlocks(d, sel(d, 'r0c0', 1, 'r1c0', 1),
        [newPara('pasted')], {sameDoc: true}));
      assert.deepEqual(show([tblOf(d)])[0].map((r) => r[0]),
        [['pasted'], [''], ['r2c0']]);
    });
});

describe('mixed ranges: paragraphs and the covered rows', () => {
  it('from before the table into row 1 + Delete: the paragraphs and ' +
    'rows 0..1 gone; a bookmark pair across them kept', () => {
    const T = T3((i, j) => (i === 0 && j === 1
      ? [newPara('r0' + O + 'c1', {inlines: {2: mark('bookmarkStart',
        1)}})] : i === 2 && j === 2 ? [newPara('r2c2' + O, {inlines:
        {4: mark('bookmarkEnd', 1)}})] : `r${i}c${j}`));
    // a loose start before row 1, its end after the last row
    const T2 = {...T, rows: T.rows.map((r, i) => (i === 1
      ? {...r, lead: [node('bookmarkStart', 2)]} : r)),
    tail: [node('bookmarkEnd', 2)]};
    const {d} = doc(T2, ['ab', 'p0'], ['p2']);
    assert.deepEqual(kinds(d), ['end1', 'end2', 'start1', 'start2']);
    const out = undoable(d, () => X.deleteForward(d,
      sel(d, 'ab', 1, 'r1c0', 2)));
    const bs = d.doc.sections[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
    // (C4.1: deleteRows moves the removed rows' marks, the paragraph
    // mark start1 too, to the next row's lead: not at the caret)
    assert.equal(bs[0].text, 'a');
    assert.equal(bs[1].rows.length, 1);
    assert.deepEqual(show([bs[1]])[0][0].map((c) => c[0]),
      ['r2c0', 'r2c1', 'r2c2' + O]);
    assert.deepEqual(bs[1].rows[0].lead.map((n) => n.name +
      n.attrs[0][1]), ['w:bookmarkStart1', 'w:bookmarkStart2'],
    'the loose start and the paragraph\'s start moved');
    assert.deepEqual(kinds(d), ['end1', 'end2', 'start1', 'start2']);
    assert.equal(head(d, out), 'a:1');
  });
  it('from row 1 to after the table + Backspace: rows 1..2 and the ' +
    'text gone, the caret at the cut', () => {
    const {d} = doc(T3(), ['p0'], ['p2', 'p3']);
    const out = undoable(d, () => X.deleteBack(d,
      sel(d, 'r1c1', 1, 'p2', 1)));
    assert.deepEqual(body(d), ['p0', [[['r0c0'], ['r0c1'], ['r0c2']]],
      '2', 'p3']);
    assert.equal(head(d, out), '2:0');
  });
  it('a range whose rows cover the whole table removes it', () => {
    const {d} = doc(T3(), ['p0'], ['p2']);
    undoable(d, () => X.deleteForward(d, sel(d, 'p0', 1, 'r2c2', 2)));
    assert.deepEqual(body(d), ['p', 'p2']);
  });
  it('from one table into the next: rows of both, an empty paragraph ' +
    'left between them (D27: tables never touch; C6 fix)', () => {
    const A = freeze(modelTable([['a0'], ['a1']]));
    const B = freeze(modelTable([['b0'], ['b1']]));
    const d = mk(['p0', A, 'mid', B, 'p2']);
    const out = undoable(d, () => X.deleteForward(d,
      sel(d, 'a1', 1, 'b0', 1)));
    assert.deepEqual(body(d), ['p0', [[['a0']]], '', [[['b1']]], 'p2']);
    assert.equal(head(d, out), ':0');
  });
  it('the same in a cell: a paragraph between the two nested tables',
    () => {
      const A = modelTable([['a0'], ['a1']]);
      const B = modelTable([['b0'], ['b1']]);
      const d = mk([freeze(modelTable([[[A, 'mid', B, 'end']]])), 'z']);
      undoable(d, () => X.deleteForward(d, sel(d, 'a1', 1, 'b0', 1)));
      assert.deepEqual(body(d), [[[[[[['a0']]], '', [[['b1']]], 'end']]],
        'z']);
    });
});

describe('refused in a cell: Ctrl-Enter and section breaks', () => {
  it('Ctrl-Enter (pageBreak) in a cell: null (a beep), no step', () => {
    const {d} = doc(T3());
    const t = new Typing(d);
    assert.equal(run('pageBreak', d, t, car(d, 'r1c1', 1)), null);
    assert.equal(run('pageBreak', d, t, sel(d, 'r0c0', 1, 'r1c1', 1)),
      null);
    assert.equal(run('sectionNext', d, t, car(d, 'r1c1', 1)), null);
    assert.equal(d.undoDepth, 0);
    // outside the table as before
    run('pageBreak', d, t, car(d, 'p0', 1));
    assert.equal(d.undoDepth, 1);
  });
});

describe('the caret after undoing a table restore (R18)', () => {
  it('the first row that differs, cell 0, its first paragraph', () => {
    const {d} = doc(T3());
    const m = tm();
    let L = new DocLayout(d.doc, m);
    L.layout(800);
    let ops = null;
    d.on('change', (ev) => { ops = ev.ops; });
    X.deleteForward(d, sel(d, 'r1c1', 1, 'r2c2', 2));
    L = new DocLayout(d.doc, m, L);
    L.layout(800);
    d.undo();
    const p = stepEnd(d.doc, ops, L);
    assert.equal(name(d, p), 'r1c0:0');
  });
});

describe('TblEdit and TblCmd', () => {
  it('emptyLike: a fresh id, pPr (raw mark rPr kept) and style', () => {
    const rPr = {name: 'w:rPr', attrs: [], children: []};
    const p = freeze(newPara('abc', {pPr: {jc: 'right', extra: [rPr]},
      pStyle: 'Title', extraP: [['w:rsidR', '00AB']]}));
    const e = emptyLike(p);
    assert.notEqual(e.id, p.id);
    assert.equal(e.text, '');
    assert.deepEqual(e.pPr, p.pPr);
    assert.equal(e.pStyle, 'Title');
    assert.deepEqual(e.extraP, []);
    assert.equal(emptyLike(undefined).text, '');
  });
  it('clearCells: cells not listed shared; nothing to clear: the same ' +
    'table', () => {
    const T = freeze(T3());
    const t = clearCells(T, [{r: 1, k: 1}]);
    assert.equal(t.rows[0], T.rows[0]);
    assert.equal(t.rows[1].cells[0], T.rows[1].cells[0]);
    assert.equal(t.rows[1].cells[1].blocks[0].text, '');
    assert.equal(clearCells(t, [{r: 1, k: 1}]), t);
  });
  it('deleteRows: a restart passes to the next row; marks move; all ' +
    'rows: null', () => {
    const vm = (v) => ({tcPr: {vMerge: v, extra: []}, blocks: ['x' + v]});
    const T = freeze(modelTable([['a', vm('restart')], ['b',
      vm('continue')], ['c', vm('continue')]]));
    const T1 = freeze({...T, rows: T.rows.map((r, i) => (i === 0
      ? {...r, lead: [node('bookmarkStart', 7)],
        cells: [{...r.cells[0], lead: [node('bookmarkEnd', 7)]},
          r.cells[1]]} : r))});
    const t = deleteRows(T1, 0, 0);
    assert.equal(t.rows.length, 2);
    assert.equal(t.rows[0].cells[1].tcPr.vMerge, 'restart');
    assert.equal(t.rows[1].cells[1].tcPr.vMerge, 'continue');
    assert.deepEqual(t.rows[0].lead.map((n) => n.name),
      ['w:bookmarkStart', 'w:bookmarkEnd']);
    const z = deleteRows(T1, 1, 2);
    assert.equal(z.rows.length, 1);
    assert.equal(z.rows[0], T1.rows[0]);
    assert.equal(deleteRows(T1, 0, 2), null);
    for (const [a, b] of [[-1, 0], [0, 3], [2, 1], [NaN, 0], [0, 1e9],
      ['0', 1]]) {
      assert.throws(() => deleteRows(T1, a, b), RangeError, `${a} ${b}`);
    }
  });
  it('onTable: one restoreBlock; the same table: null, no step', () => {
    const {d} = doc(T3());
    const at = [0, 1];
    assert.equal(onTable(d, at, (t) => t), null);
    assert.equal(d.undoDepth, 0);
    let s = null;
    d.atomic(() => {
      s = onTable(d, at, (t) => clearCells(t, [{r: 0, k: 0}]));
    });
    assert.equal(d.undoDepth, 1);
    assert.equal(name(d, s.head), ':0');
    assert.equal(walkAt(d.doc, at).rows[0].cells[0].blocks[0].text, '');
  });
});

describe('D20: ranks per row; a whole keystroke in a cell', () => {
  before(loadStyles);
  it('findBlock ranks and atRank equal the flow places (nested ' +
    'tables, a vertical merge), also after edits in cells', () => {
    const vm = (v, t) => ({tcPr: {vMerge: v, extra: []}, blocks: [t]});
    const N = modelTable([['n1', ['n2', modelTable([['m1']]), 'n3']]]);
    const T = modelTable([['a', vm('restart', 'b')], [['c', N, 'd'],
      vm('continue', 'e')], ['f', 'g']]);
    const {d} = doc(T, ['p0'], ['p2']);
    const check = () => {
      const L = new DocLayout(d.doc, tm());
      L.layout(800);
      for (const it of L.byId.values()) {
        const loc = findBlock(d.doc, it.id);
        assert.equal(loc.rank, it.index, `rank of ${it.id}`);
        assert.equal(atRank(d.doc, it.index).b, it.block);
        if (it.kind === 'tbl') {
          assert.equal(loc.endRank, it.endIndex);
          assert.equal(atRank(d.doc, it.endIndex).b, it.block);
        }
      }
    };
    check();
    E.typeText(d, car(d, 'n2', 1), 'xx');
    E.splitPara(d, car(d, 'c', 1));
    X.deleteForward(d, sel(d, 'f', 0, 'g', 1));
    check();
  });
  it('five 1000 x 5 tables: a keystroke in cell (500, 2) within +5 ' +
    'ms of the document without them', () => {
    const big = () => modelTable(Array.from({length: 1000}, (_, i) =>
      Array.from({length: 5}, (_, j) => `r${i}c${j}`)));
    const blocks = (tables) => {
      const out = [];
      for (let k = 0; k < 5; k++) {
        for (let i = 0; i < 200; i++) out.push(`paragraph ${k}.${i}`);
        if (tables) out.push(big());
      }
      return out;
    };
    const m = tm();
    /** Median of 20 (after 3) whole keystrokes at the paragraph id. */
    const keys = (dd, id) => {
      let L = new DocLayout(dd.doc, m);
      L.layout(800);
      let s = S.caret({id, off: 0});
      const ms = [];
      for (let i = 0; i < 23; i++) {
        const t0 = performance.now();
        s = E.typeText(dd, s, i % 2 ? ' ' : 'k', {key: 'typing'});
        const old = L;
        L = new DocLayout(dd.doc, m, old);
        L.layout(800);
        s = S.clamp(s, dd.doc, old);
        if (i >= 3) ms.push(performance.now() - t0);
      }
      return ms.sort((a, b) => a - b)[10];
    };
    const free = new Document(mkDoc(blocks(false)));
    const dd = new Document(mkDoc(blocks(true)));
    const f = keys(free, free.doc.sections[0].blocks[0].id);
    const p = keys(dd, dd.doc.sections[0].blocks[0].id);
    const c = keys(dd, dd.doc.sections[0].blocks[200].rows[500]
      .cells[2].blocks[0].id);
    console.log(`# whole keystroke: without tables ${f.toFixed(2)} ` +
      `ms; five 1000x5: plain ${p.toFixed(2)} ms, cell ${c.toFixed(2)}` +
      ' ms');
    assert.ok(c <= f + 5, `cell ${c} vs ${f}`);
    assert.ok(c <= p + 5, `cell ${c} vs plain ${p}`);
  });
});

describe('random selections in and around tables (seeded)', () => {
  /** Every caret place: paragraph offsets 0, 1, end; table edges. */
  function places(doc) {
    const out = [];
    forEachBlock(doc, (b) => {
      if (b.type === 'tbl') out.push({id: b.id, off: 0}, {id: b.id, off: 1});
      else if (b.type === 'p') {
        for (const off of new Set([0, Math.min(1, b.text.length),
          b.text.length])) out.push({id: b.id, off});
      }
    });
    return out;
  }
  it('Delete, Backspace, typing and Enter over 300 random ' +
    'selections: valid, one step that undoes deep-equal, a valid caret',
  () => {
    const r = rng(34);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const vm = (v, t) => ({tcPr: {vMerge: v, extra: []}, blocks: [t]});
    const make = () => {
      const N = modelTable([['n1', 'n2'], ['n3', 'n4']]);
      const T = modelTable([['a', vm('restart', 'b'), 'c'],
        [['d', N, 'e'], vm('continue', 'f'), 'g'], ['h', 'i', 'j']]);
      return mk(['p0', freeze(T), 'p1', freeze(modelTable([['x', 'y']])),
        'p2']);
    };
    const cmds = [(d, s) => X.deleteForward(d, s),
      (d, s) => X.deleteBack(d, s), (d, s) => E.typeText(d, s, 'Q'),
      (d, s) => E.splitPara(d, s)];
    for (let n = 0; n < 300; n++) {
      const d = make(), ps = places(d.doc);
      const s0 = S.select(pick(ps), pick(ps)), cmd = pick(cmds);
      const out = undoable(d, () => cmd(d, s0));
      for (const b of d.doc.sections[0].blocks) {
        if (b.type === 'tbl') {
          checkTable(b, {block: () => {}, props: () => {}}, 1);
        }
      }
      assert.ok(d.doc.sections[0].blocks.length > 0);
      assert.ok(checkPos(d.doc, out.head), `caret ${n}`);
      assert.ok(checkPos(d.doc, out.anchor), `anchor ${n}`);
    }
  });
});

describe('C3 fix wave (review C3b I1..I2, M3)', () => {
  const bm = (n, id) => newPara(O, {inlines: {0: mark(n, id)}});
  const marked = (t, n, id) => newPara(t + O, {inlines: {[t.length]:
    mark(n, id)}});
  it('I1: Backspace removing a mark-only paragraph after a table keeps ' +
    'its bookmark marks (the pair spanning the table stays whole)', () => {
    const T = modelTable([['a', [marked('y', 'bookmarkStart', 3)]]]);
    const d = mk(['p0', freeze(T), bm('bookmarkEnd', 3), 'end']);
    const before = kinds(d);
    const at = d.doc.sections[0].blocks[2].id;
    const out = undoable(d, () => X.deleteBack(d,
      S.caret({id: at, off: 0})));
    assert.equal(d.doc.sections[0].blocks.length, 3, 'removed');
    assert.deepEqual(kinds(d), before, 'no mark lost');
    assert.equal(out.head.id, byText(d.doc, 'y' + O + O).id);
    assert.equal(d.undoDepth, 1);
  });
  it('I1: Delete removing a mark-only paragraph before a table keeps ' +
    'its marks; the same from a kept block\'s edge', () => {
    const T = modelTable([[[marked('x', 'bookmarkEnd', 5)], 'b']]);
    const d = mk(['p0', bm('bookmarkStart', 5), freeze(T), 'p2']);
    const before = kinds(d);
    const at = d.doc.sections[0].blocks[1].id;
    undoable(d, () => X.deleteForward(d, S.caret({id: at, off: 1})));
    assert.equal(d.doc.sections[0].blocks.length, 3, 'removed');
    assert.deepEqual(kinds(d), before);
    const e = mk([marked('p0', 'bookmarkStart', 4), O, bm('bookmarkEnd',
      4), 'z'].map((x) => (x === O ? {type: 'opaque',
      node: {name: 'w:sdt', attrs: [], children: []}} : x)));
    const box = e.doc.sections[0].blocks[1];
    const b0 = kinds(e);
    undoable(e, () => X.deleteForward(e, S.caret({id: blockId(box),
      off: 1})));
    assert.equal(e.doc.sections[0].blocks.length, 3, 'removed');
    assert.deepEqual(kinds(e), b0);
  });
  it('I2: Delete on a nested table\'s end edge never leaves the cell ' +
    'ending with the table (the caret goes into the paragraph)', () => {
    const N = modelTable([['n1', 'n2']]);
    const {d} = doc(modelTable([[['a', N, ''], 'b']]));
    const s = S.caret({id: N.id, off: 1});
    for (const fn of [X.deleteForward, X.deleteWordForward]) {
      const out = fn(d, s);
      assert.equal(d.undoDepth, 0, 'nothing removed');
      assert.equal(head(d, out), ':0');
    }
    assert.deepEqual(body(d)[1][0][0].length, 3);
  });
  it('I2 / M3: after redoing a TB10 removal the caret is where the ' +
    'command left it (the end of the last cell), and Delete there ' +
    'cannot strip the cell\'s last paragraph', () => {
    const N = modelTable([['n1', 'n2']]);
    const {d} = doc(modelTable([[['a', N, '', ''], 'b']]));
    let ops = null;
    d.on('change', (ev) => { ops = ev.ops; });
    const first = d.doc.sections[0].blocks[1].rows[0].cells[0].blocks[2];
    const out = X.deleteBack(d, S.caret({id: first.id, off: 0}));
    assert.equal(head(d, out), 'n2:2');
    d.undo();
    d.redo();
    const p = stepEnd(d.doc, ops, null);
    assert.equal(name(d, p), 'n2:2', 'the redo caret');
    const again = X.deleteForward(d, S.caret({id: N.id, off: 1}));
    const cell = d.doc.sections[0].blocks[1].rows[0].cells[0].blocks;
    assert.equal(cell[cell.length - 1].type, 'p');
    assert.equal(head(d, again), ':0');
  });
  it('stepEnd of a removeBlock with no block before the gap and a ' +
    'table after it: the table\'s first paragraph, not its edge', () => {
    const {d} = doc(T3(), [''], ['p2']);
    let ops = null;
    d.on('change', (ev) => { ops = ev.ops; });
    const out = X.deleteForward(d, car(d, '', 0));
    assert.equal(head(d, out), 'r0c0:0');
    d.undo();
    d.redo();
    assert.equal(name(d, stepEnd(d.doc, ops, null)), 'r0c0:0');
  });
});

