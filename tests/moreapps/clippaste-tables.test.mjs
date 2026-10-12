// Paste rules of typed tables (Batch C6.2, D27, D28, TB15) and table
// styles across documents (./TblStyleCopy):
//   - a table block at a caret mid-paragraph: the paragraph split, the
//     table between, one undo step; at a paragraph's start before it;
//     never touching a table before it
//   - at a caret in a cell: nested; in a cell of a depth-8 table: the
//     table flattened to text (./Walk flatText), never refused
//   - over a cells shape: the pasted table's cells overwrite the
//     rectangle's cells' contents from its top-left, no row or column
//     added, extra cells dropped
//   - fresh ids, unique at every depth
//   - across documents: tblStyle GridTable4 copied with its basedOn
//     chain (one undo step gives back doc.styles itself), a style of
//     the same name in the target used, fresh ids when the id is
//     taken; lists and pictures in pasted cells made in the target
//   - written: lints, reads back with the style (./TblStyle viewOf)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Letters/ClipPaste';
import {sourceStyles, copyStyles, restyle, tableStyleIds, MAX_COPY}
  from '../../tools/moreapps/!Letters/TblStyleCopy';
import {fitDepth} from '../../tools/moreapps/!Letters/ClipPasteTbl';
import {ids as allIds, walkBlocks}
  from '../../tools/moreapps/!Letters/Walk';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import {usedDocPrIds} from '../../tools/moreapps/!Letters/PicIds';
import {viewOf} from '../../tools/moreapps/!Letters/TblStyle';
import {bookmarkNames} from '../../tools/moreapps/!Letters/BookmarkFind';
import {shapeOf} from '../../tools/moreapps/!Letters/SelShape';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {p, r, stylesXml, STRICT_W_NS} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, modelTable, freeze, nestedTable,
  TABLE_NORMAL, GRID_TABLE_4} from './tbl-fixtures.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';
import {mk, undoable} from './edit-docs.mjs';
import {write, schema} from './roundtrip-lib.mjs';
import {lintPackage} from './lint-package.mjs';
import {item} from './list-fixtures.mjs';
import {sourceDocx, copyPaste, strictDocx}
  from './clip-lists-docs.mjs';
import {readHtml} from '../../tools/moreapps/!Letters/ClipRead';
import {apart} from '../../tools/moreapps/!Letters/ClipCleanTbl';
import {parseHtml} from './html-fake.mjs';
import {TBL_OPAQUE} from './tbl-fixtures.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {existsSync, readFileSync} from 'node:fs';
import {CORPUS} from './roundtrip-lib.mjs';

const tops = (d) => d.doc.sections.flatMap((s) => s.blocks);
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);
const caretAt = (b, off) => S.caret({id: blockId(b), off});
const selOf = (a, o1, b, o2) => S.select({id: blockId(a), off: o1},
  {id: blockId(b), off: o2});
const open = async (bytes) => new Document(await readDocx(bytes));
const texts = (t) => t.rows.map((row) => row.cells.map((c) =>
  c.blocks.map((b) => (b.type === 'p' ? b.text : '#')).join('|')));
const GT4 = '<w:tblStyle w:val="GridTable4"/>';

/** A clipboard 2x2 table block (no ids), from a slice of a doc. */
async function twoByTwo(tblPr = '') {
  const src = await open(await tblDocx(p(r('s')) + tbl([
    tr([tc(p(r('a'))), tc(p(r('b')))]),
    tr([tc(p(r('c'))), tc(p(r('d')))])], {tblPr}) + p(r('e')),
  {styles: TABLE_NORMAL + GRID_TABLE_4}));
  const [s, , e] = tops(src);
  return {src, s: slice(src.doc, selOf(s, 0, e, 1))};
}
const onlyTable = (s) => s.blocks.filter((b) => b.type === 'tbl');
const sameOpts = (s) => ({sameDoc: true, styleNames: s.styleNames,
  lists: s.lists, pics: s.pics, picScope: s.picScope,
  styles: s.styles});

/** The first paragraph in a cell (r, c) of table t. */
const cellP = (t, row, c) => t.rows[row].cells[c].blocks[0];

describe('a table block pasted at a caret (D27 placement)', () => {
  it('mid-paragraph: split, the table between, one undo step', async () => {
    const {s} = await twoByTwo();
    const d = mk(['hello world']);
    const before = allIds(d.doc);
    undoable(d, () => pasteBlocks(d, caretAt(tops(d)[0], 5),
      onlyTable(s), sameOpts(s)));
    const bl = tops(d);
    assert.deepEqual(bl.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(bl[0].text, 'hello');
    assert.equal(bl[2].text, ' world');
    assert.equal(bl[0].id, before[0], 'the head keeps its id');
    assert.deepEqual(texts(bl[1]), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(dupes(allIds(d.doc)), []);
    checkBlock(bl[1]);
  });

  it('at the start of a paragraph after a table: a paragraph between ' +
    '(tables never touch)', async () => {
    const {s} = await twoByTwo();
    const d = mk([modelTable([['x']]), 'after']);
    undoable(d, () => pasteBlocks(d, caretAt(tops(d)[1], 0),
      onlyTable(s), sameOpts(s)));
    assert.deepEqual(tops(d).map((b) => b.type),
      ['tbl', 'p', 'tbl', 'p']);
    assert.equal(tops(d)[1].text, '');
    assert.equal(tops(d)[3].text, 'after');
    assert.deepEqual(dupes(allIds(d.doc)), []);
  });
});

describe('a table block pasted in a cell', () => {
  it('is nested; ids fresh everywhere', async () => {
    const {s} = await twoByTwo();
    const d = mk([modelTable([['in a cell', 'y']]), 'z']);
    const T = tops(d)[0];
    const q = cellP(T, 0, 0);
    undoable(d, () => pasteBlocks(d, S.caret({id: q.id, off: 9}),
      onlyTable(s), sameOpts(s)));
    const cell = tops(d)[0].rows[0].cells[0];
    assert.deepEqual(cell.blocks.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(cell.blocks[0].text, 'in a cell');
    assert.deepEqual(texts(cell.blocks[1]), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(dupes(allIds(d.doc)), []);
    checkBlock(tops(d)[0]);
  });

  it('in a cell of a depth-8 table: flattened to text, not refused',
    async () => {
      const {s} = await twoByTwo();
      const d = await open(await tblDocx(nestedTable(8) + p()));
      let deep = null;
      for (const e of walkBlocks(tops(d))) {
        if (e.b.type === 'p' && e.b.text === 'L8') deep = e;
      }
      assert.equal(deep.depth, 8);
      const out = undoable(d, () => pasteBlocks(d, S.caret({id: deep.b.id,
        off: 2}), onlyTable(s), sameOpts(s)));
      assert.ok(out);
      const got = [];
      for (const e of walkBlocks(tops(d))) {
        if (e.b.type === 'tbl') assert.ok(e.depth < 8, 'no 9th table');
        if (e.depth === 8 && e.b.type === 'p') got.push(e.b.text);
      }
      // (the text pasted as paragraphs: the first joins L8's)
      assert.deepEqual(got, ['L8a\tb', 'c\td']);
      assert.deepEqual(dupes(allIds(d.doc)), []);
    });

  it('fitDepth: tables past depth 8 flattened, the rest shared', () => {
    const inner = modelTable([['i']]);
    const t = freeze(modelTable([[['o', inner, 'p']]]));
    assert.equal(fitDepth([t], 6)[0], t, 'fits: the same object');
    const at7 = fitDepth([t], 7)[0];
    assert.equal(at7.type, 'tbl');
    assert.deepEqual(at7.rows[0].cells[0].blocks.map((b) => b.text),
      ['o', 'i', 'p']);
    assert.deepEqual(fitDepth([t], 8).map((b) => b.text), ['o i p']);
    assert.deepEqual(fitDepth([t], 100).map((b) => b.text), ['o i p']);
  });
});

describe('a table pasted over a cells shape (TB15: overwrite)', () => {
  const grid3 = () => mk([modelTable([['1', '2', '3'], ['4', '5', '6'],
    ['7', '8', '9']]), 'after']);
  it('a 2x2 over a 3x3 rectangle: the top-left 2x2 replaced, nothing ' +
    'added', async () => {
    const {s} = await twoByTwo();
    const d = grid3();
    const T = tops(d)[0];
    const sel = selOf(cellP(T, 0, 0), 0, cellP(T, 2, 2), 1);
    assert.equal(shapeOf(d.doc, sel).kind, 'cells');
    const before = allIds(d.doc);
    const out = undoable(d, () => pasteBlocks(d, sel, onlyTable(s),
      sameOpts(s)));
    const U = tops(d)[0];
    assert.deepEqual(texts(U), [['a', 'b', '3'], ['c', 'd', '6'],
      ['7', '8', '9']]);
    assert.equal(U.id, T.id, 'the same table');
    assert.equal(U.grid, T.grid, 'no column added');
    assert.equal(U.rows[2], T.rows[2], 'rows not touched are shared');
    assert.equal(U.rows[0].cells[0].tcPr, T.rows[0].cells[0].tcPr,
      'the target cell keeps its properties');
    assert.deepEqual(dupes(allIds(d.doc)), []);
    const fresh = [cellP(U, 0, 0), cellP(U, 1, 1)].map((q) => q.id);
    assert.ok(fresh.every((id) => !before.includes(id)), 'fresh ids');
    assert.deepEqual(out.head, {id: cellP(U, 1, 1).id, off: 1});
    checkBlock(U);
  });

  it('a 2x2 over one cell (a 1x1 table selected whole): one cell ' +
    'overwritten, the rest dropped', async () => {
    const {s} = await twoByTwo();
    const d = mk([modelTable([['only']]), 'z']);
    const T = tops(d)[0];
    const sel = S.select({id: T.id, off: 0}, {id: T.id, off: 1});
    assert.equal(shapeOf(d.doc, sel).kind, 'cells');
    undoable(d, () => pasteBlocks(d, sel, onlyTable(s), sameOpts(s)));
    const U = tops(d)[0];
    assert.deepEqual(texts(U), [['a']]);
    assert.equal(U.rows.length, 1);
    assert.equal(tops(d).length, 2);
  });

  it('a hidden (vMerge continue) cell of the rectangle is left alone',
    async () => {
      const {s} = await twoByTwo();
      const d = await open(await tblDocx(tbl([
        tr([tc(p(r('m')), {tcPr: '<w:vMerge w:val="restart"/>'}),
          tc(p(r('x')))]),
        tr([tc(p(), {tcPr: '<w:vMerge/>'}), tc(p(r('y')))])]) + p()));
      const T = tops(d)[0];
      const sel = selOf(cellP(T, 0, 0), 0, cellP(T, 1, 1), 1);
      undoable(d, () => pasteBlocks(d, sel, onlyTable(s), sameOpts(s)));
      assert.deepEqual(texts(tops(d)[0]), [['a', 'b'], ['', 'd']]);
    });

  it('a bookmark starting in an overwritten cell keeps its pair',
    async () => {
      const {s} = await twoByTwo();
      const bs = '<w:bookmarkStart w:id="7" w:name="keep"/>';
      const d = await open(await tblDocx(tbl([
        tr([tc(p(bs + r('x'))), tc(p(r('y')))]),
        tr([tc(p(r('z'))), tc(p(r('w')))])]) +
        p(r('end') + '<w:bookmarkEnd w:id="7"/>')));
      const T = tops(d)[0];
      undoable(d, () => pasteBlocks(d, selOf(cellP(T, 0, 0), 0,
        cellP(T, 1, 1), 1), onlyTable(s), sameOpts(s)));
      assert.deepEqual(texts(tops(d)[0]).map((row) => row.map((t) =>
        t.replace(/\ufffc/g, '^'))), [['^a', 'b'], ['c', 'd']],
      'the start at the start of the first cell (C6 fix B3)');
      assert.deepEqual(bookmarkNames(d.doc), ['keep']);
    });

  it('paragraphs over cells keep today\'s rule (cleared, then put in)',
    async () => {
      const d = grid3();
      const T = tops(d)[0];
      const sel = selOf(cellP(T, 0, 0), 0, cellP(T, 0, 1), 1);
      const src = mk(['pp']);
      const s = slice(src.doc, selOf(tops(src)[0], 0, tops(src)[0], 2));
      undoable(d, () => pasteBlocks(d, sel, s.blocks, sameOpts(s)));
      assert.equal(tops(d)[0].rows.length, 3);
      assert.equal(tops(d)[0].rows[0].cells.length, 3);
    });
});

/** A source: a GridTable4 2x2 between two paragraphs. */
const gt4Source = async (styles = TABLE_NORMAL + GRID_TABLE_4) =>
  open(await tblDocx(p(r('s')) + tbl([tr([tc(p(r('a'))),
    tc(p(r('b')))]), tr([tc(p(r('c'))), tc(p(r('d')))])],
  {tblPr: GT4}) + p(r('e')), {styles}));
const copyAll = (src, d, at) => {
  const [a, , b] = tops(src);
  return copyPaste(src, selOf(a, 0, b, 1), d, at);
};
const named = (d, name) => [...d.doc.styles.styles.values()].filter(
  (x) => x.name === name);

describe('table styles across documents (TblStyleCopy)', () => {
  it('the target lacks Grid Table 4: it and its basedOn chain copied, ' +
    'one undo step gives back doc.styles itself', async () => {
    const src = await gt4Source();
    const d = mk(['x']);
    const st0 = d.doc.styles;
    assert.equal(named(d, 'Grid Table 4').length, 0);
    undoable(d, () => copyAll(src, d, caretAt(tops(d)[0], 1)));
    const U = tops(d).find((b) => b.type === 'tbl');
    assert.equal(U.tblPr.tblStyle, 'GridTable4');
    const gt = d.doc.styles.styles.get('GridTable4');
    assert.equal(gt.type, 'table');
    assert.equal(gt.basedOn, 'TableNormal');
    assert.equal(d.doc.styles.styles.get('TableNormal').name,
      'Normal Table');
    assert.notEqual(gt.isDefault, true);
    assert.notEqual(d.doc.styles.styles.get('TableNormal').isDefault,
      true, 'the target keeps its defaults');
    for (const [id, x] of st0.styles) {
      assert.equal(d.doc.styles.styles.get(id), x, 'kept: ' + id);
    }
    const v = viewOf(d.doc.styles, 'GridTable4');
    assert.equal(v.tblPr.tblBorders.top.color, '666666');
    assert.deepEqual(v.tblPr.tblCellMar.left, {w: 108, type: 'dxa'},
      'TableNormal\'s margins through basedOn');
    assert.ok(v.cond.has('firstRow'));
    assert.ok(d.undo());
    assert.equal(d.doc.styles, st0, 'undo: the very styles object');
    assert.ok(d.redo());
    // written: lints, and reads back with the style
    const bytes = await write(d.doc);
    const errs = lintPackage(await readZip(bytes)).problems
      .filter((q) => q.level === 'error');
    assert.deepEqual(errs, []);
    const back = await readDocx(bytes);
    assert.equal(viewOf(back.styles, 'GridTable4').tblPr.tblBorders.top
      .color, '666666');
    const {xsd} = schema();
    if (xsd) {
      const part = (await readZip(bytes)).get('word/styles.xml');
      assert.deepEqual([...xsd.errors(part)], [], 'styles.xml valid');
    }
    const V = back.sections[0].blocks.find((b) => b.type === 'tbl');
    assert.equal(V.tblPr.tblStyle, 'GridTable4');
  });

  it('the target has a style named "Grid Table 4": that one is used, ' +
    'nothing copied', async () => {
    const src = await gt4Source();
    const d = await open(await tblDocx(p(r('x')), {styles: TABLE_NORMAL +
      GRID_TABLE_4.replace('w:styleId="GridTable4"',
        'w:styleId="MyGT4"')}));
    const st0 = d.doc.styles;
    undoable(d, () => copyAll(src, d, caretAt(tops(d)[0], 1)));
    const U = tops(d).find((b) => b.type === 'tbl');
    assert.equal(U.tblPr.tblStyle, 'MyGT4');
    assert.equal(d.doc.styles, st0, 'no style added');
  });

  it('the id is taken by another style: a fresh id', async () => {
    const src = await gt4Source();
    const other = '<w:style w:type="paragraph" w:styleId="GridTable4">' +
      '<w:name w:val="Something else"/></w:style>';
    const d = await open(await tblDocx(p(r('x')), {styles: other}));
    undoable(d, () => copyAll(src, d, caretAt(tops(d)[0], 1)));
    const U = tops(d).find((b) => b.type === 'tbl');
    assert.equal(U.tblPr.tblStyle, 'GridTable41');
    assert.equal(d.doc.styles.styles.get('GridTable4').name,
      'Something else', 'the target\'s own style unchanged');
    assert.equal(d.doc.styles.styles.get('GridTable41').name,
      'Grid Table 4');
    assert.equal(d.doc.styles.styles.get('GridTable41').basedOn,
      'TableNormal');
    const bytes = await write(d.doc);
    const back = await readDocx(bytes);
    assert.ok(viewOf(back.styles, 'GridTable41'));
  });

  it('a Strict target: the copied style is written Strict; the linter ' +
    'adds no error (xmllint is not run: the cached schema is ' +
    'Transitional only)', async () => {
    const src = await gt4Source();
    const d = await open(await strictDocx(p(r('x'))));
    undoable(d, () => copyAll(src, d, caretAt(tops(d)[0], 1)));
    const bytes = await write(d.doc);
    const errs = lintPackage(await readZip(bytes)).problems
      .filter((q) => q.level === 'error');
    assert.deepEqual(errs, []);
    const back = await readDocx(bytes);
    assert.equal(back.meta.conformance, 'strict');
    assert.equal(viewOf(back.styles, 'GridTable4').tblPr.tblBorders
      .top.color, '666666');
    const xml = new TextDecoder().decode((await readZip(bytes))
      .get('word/styles.xml'));
    assert.ok(xml.includes(STRICT_W_NS), 'the part is Strict');
    assert.ok(!xml.includes('schemas.openxmlformats.org/wordprocessingml'),
      'no Transitional namespace in it');
  });

  it('a Strict source into a Transitional target', async () => {
    const src = await open(await tblDocx(p(r('s')) + tbl([tr([tc(p(
      r('a')))])], {tblPr: GT4}) + p(r('e')), {styles: TABLE_NORMAL +
      GRID_TABLE_4, strict: true}));
    assert.equal(src.doc.meta.conformance, 'strict');
    const d = mk(['x']);
    undoable(d, () => copyAll(src, d, caretAt(tops(d)[0], 1)));
    assert.equal(viewOf(d.doc.styles, 'GridTable4').tblPr.tblBorders.top
      .color, '666666');
    const back = await readDocx(await write(d.doc));
    assert.ok(viewOf(back.styles, 'GridTable4'));
  });

  it('Table Grid made by !Letters (no raw) is copied by its fields',
    async () => {
      const {insertTable} = await import(
        '../../tools/moreapps/!Letters/TblInsert');
      const src = mk(['s', 'e']);
      insertTable(src, caretAt(tops(src)[0], 1), {cols: 2, rows: 1});
      assert.equal(src.doc.styles.styles.get('TableGrid').raw, null);
      const d = mk(['x']);
      const [a] = tops(src), b = tops(src)[tops(src).length - 1];
      undoable(d, () => copyPaste(src, selOf(a, 0, b, 1), d,
        caretAt(tops(d)[0], 1)));
      const U = tops(d).find((x) => x.type === 'tbl');
      assert.equal(U.tblPr.tblStyle, 'TableGrid');
      const g = d.doc.styles.styles.get('TableGrid');
      assert.equal(g.basedOn, 'TableNormal');
      assert.equal(viewOf(d.doc.styles, 'TableGrid').tblPr.tblBorders
        .insideH.val, 'single');
      const back = await readDocx(await write(d.doc));
      assert.ok(viewOf(back.styles, 'TableGrid'));
    });

  it('in the same document no style is copied', async () => {
    const src = await gt4Source();
    const st0 = src.doc.styles;
    const [a, , b] = tops(src);
    const s = slice(src.doc, selOf(a, 0, b, 1));
    pasteBlocks(src, caretAt(b, 1), s.blocks, sameOpts(s));
    assert.equal(src.doc.styles, st0);
    assert.equal(tops(src).filter((x) => x.type === 'tbl')[1].tblPr
      .tblStyle, 'GridTable4');
  });
});

describe('lists and pictures in pasted cells across documents', () => {
  it('over cells: list items in the pasted cells make their list',
    async () => {
      const src = await open(await sourceDocx({paras: [p(r('s')), tbl([
        tr([tc(item('one', 2)), tc(p(r('b')))]),
        tr([tc(item('two', 2)), tc(p(r('d')))])]), p(r('e'))]}));
      const d = mk([modelTable([['1', '2'], ['3', '4']]), 'z']);
      const T = tops(d)[0];
      const X = tops(src)[1];
      undoable(d, () => copyPaste(src, selOf(cellP(X, 0, 0), 0,
        cellP(X, 1, 1), 1), d, selOf(cellP(T, 0, 0), 0, cellP(T, 1, 1),
        1)));
      const U = tops(d)[0];
      assert.deepEqual(texts(U), [['one', 'b'], ['two', 'd']]);
      const n0 = cellP(U, 0, 0).pPr.numPr, n1 = cellP(U, 1, 0).pPr.numPr;
      assert.ok(n0 && n1);
      assert.equal(n0.numId, n1.numId, 'one list');
      assert.ok(d.doc.numbering, 'numbering made');
    });

  it('a picture in a pasted cell is carried (over cells and nested)',
    async () => {
      const cellPic = p('<w:r>' + drawingXml({id: 40, embed: 'rId11',
        decl: false}) + '</w:r>');
      const src = await open(await picDocx({body: p(r('s')) + tbl([
        tr([tc(cellPic), tc(p(r('b')))])], {tblPr: GT4}) + p(r('e')),
      parts: {'word/styles.xml': stylesXml(TABLE_NORMAL +
        GRID_TABLE_4)}}));
      assert.ok(src.doc.styles.styles.has('GridTable4'));
      const [, a, X, b] = tops(src);
      const d = mk([modelTable([['1', '2']]), 'z']);
      const T = tops(d)[0];
      undoable(d, () => copyPaste(src, selOf(cellP(X, 0, 0), 0,
        cellP(X, 0, 1), 1), d, selOf(cellP(T, 0, 0), 0, cellP(T, 0, 1),
        1)));
      assert.equal(tops(d)[0].rows[0].cells[1].blocks[0].text, 'b');
      assert.equal(named(d, 'Grid Table 4').length, 0,
        'the pasted table\'s own style does not land');
      assert.equal(usedDocPrIds(d.doc).ids.size, 1, 'the picture came');
      assert.ok([...d.doc.parts.keys()].some((k) => k.includes('media')));
      // and nested in a cell
      const q = cellP(tops(d)[0], 0, 1);
      undoable(d, () => copyPaste(src, selOf(a, 0, b, 1), d,
        S.caret({id: q.id, off: q.text.length})));
      assert.equal(usedDocPrIds(d.doc).ids.size, 2);
      assert.deepEqual(dupes(allIds(d.doc)), []);
    });
});

describe('TblStyleCopy (pure)', () => {
  const T = (id, name, more = {}) => ({id, name, type: 'table',
    pPr: {extra: []}, rPr: {extra: []}, extra: [], raw: null, ...more});
  const table = (list, extra = {}) => ({styles: new Map(list.map((s) =>
    [s.id, s])), defaults: {}, docDefaults: {}, ...extra});
  const docOf = (st) => ({styles: st, sections: [], meta: {}});

  it('sourceStyles follows basedOn and link, cycle-safe', () => {
    const a = T('A', 'a', {basedOn: 'B'});
    const b = T('B', 'b', {basedOn: 'A', link: 'C'});
    const c = {...T('C', 'c'), type: 'paragraph'};
    const src = sourceStyles(docOf(table([a, b, c, T('D', 'd')])),
      ['A', 'missing', 42, '__proto__']);
    assert.deepEqual([...src.keys()].sort(), ['A', 'B', 'C']);
    assert.equal(src.get('A').style, a, 'shared, not copied');
  });

  it('copyStyles: a cycle, a missing base, a name of another type',
    () => {
      const src = sourceStyles(docOf(table([
        T('A', 'Alpha', {basedOn: 'B'}), T('B', 'Beta', {basedOn: 'A'}),
        T('C', 'Gamma', {basedOn: 'Nope'}), T('D', 'Para')])),
      ['A', 'C', 'D']);
      const tgt = table([{...T('X', 'para'), type: 'paragraph'}]);
      const got = copyStyles(docOf(tgt), src, ['A', 'C', 'D']);
      assert.equal(got.ops.length, 1);
      const out = got.ops[0].value;
      assert.equal(out.styles.get('X'), tgt.styles.get('X'));
      assert.equal(got.map.get('A'), 'A');
      assert.equal(got.map.get('B'), 'B');
      assert.equal(out.styles.get('A').basedOn, 'B');
      assert.equal(out.styles.get('B').basedOn, 'A');
      assert.equal(out.styles.get('C').basedOn, undefined,
        'a base that is not there is left out');
      assert.equal(got.map.has('D'), false,
        '"Para" is a paragraph style here');
      assert.equal(tgt.styles.size, 1, 'the old table is not changed');
    });

  it('copyStyles: nothing to do, no style table, hostile input', () => {
    const src = sourceStyles(docOf(table([T('A', 'a')])), ['A']);
    const st = table([T('Z', 'a')]);
    const got = copyStyles(docOf(st), src, ['A']);
    assert.deepEqual(got.ops, []);
    assert.equal(got.map.get('A'), 'Z', 'by name, case ignored');
    for (const bad of [null, undefined, {}, [], new Map([['A', null]]),
      new Map([['A', {style: 5}]])]) {
      assert.deepEqual(copyStyles(docOf(st), bad, ['A']).ops, []);
    }
    assert.deepEqual(copyStyles({styles: null}, src, ['A']).ops, []);
    assert.deepEqual(copyStyles(docOf(st), src, null).ops, []);
  });

  it('copyStyles: a forged entry (key not its id) names no style; at ' +
    'most MAX_COPY styles copied (C6 fix B5, C6a M6)', () => {
    const real = sourceStyles(docOf(table([T('A', 'one')])), ['A']);
    const forged = new Map([['B', real.get('A')]]);
    const st = table([T('Z', 'z')]);
    const got = copyStyles(docOf(st), forged, ['B']);
    assert.deepEqual(got.ops, []);
    assert.equal(got.map.has('B'), false);
    const many = [];
    for (let i = 0; i < MAX_COPY + 20; i++) many.push(T('S' + i, 's' + i));
    const srcMany = sourceStyles(docOf(table(many)), many.map((x) => x.id));
    const all = copyStyles(docOf(st), srcMany, many.map((x) => x.id));
    assert.equal(MAX_COPY, 500);
    assert.equal(all.ops[0].value.styles.size, 1 + MAX_COPY);
    assert.equal(all.map.size, MAX_COPY);
    const ids = many.map((x) => x.id);
    const d = mk(['x']);
    const blocks = ids.map((id) => ({...modelTable([['c']]),
      tblPr: {tblStyle: id, extra: []}}));
    const re = restyle(blocks, all.map);
    assert.equal(re.filter((b) => b.tblPr.tblStyle === undefined).length,
      20, 'the rest: no style');
    void d;
  });

  it('copyStyles: ids taken twice over', () => {
    const src = sourceStyles(docOf(table([T('A', 'new one')])), ['A']);
    const st = table([T('A', 'x'), T('A1', 'y'), T('A2', 'z')]);
    const got = copyStyles(docOf(st), src, ['A']);
    assert.equal(got.map.get('A'), 'A3');
    assert.equal(got.ops[0].value.styles.get('A3').name, 'new one');
  });

  it('restyle and tableStyleIds', () => {
    const inner = modelTable([['i']], {tblPr: {tblStyle: 'B',
      extra: []}});
    const t = freeze(modelTable([[['o', inner, 'p']]], {tblPr:
      {tblStyle: 'A', extra: []}}));
    assert.deepEqual(tableStyleIds([t]).sort(), ['A', 'B']);
    const out = restyle([t], new Map([['A', 'A9']]))[0];
    assert.equal(out.tblPr.tblStyle, 'A9');
    assert.equal(out.rows[0].cells[0].blocks[1].tblPr.tblStyle,
      undefined, 'not mapped: left out');
    const same = restyle([t], new Map([['A', 'A'], ['B', 'B']]));
    assert.equal(same[0], t);
    assert.ok(deepEqual(t.tblPr, {tblStyle: 'A', extra: []}));
  });
});

describe('tables never touch (C6 fix B1: D27 at every level)', () => {
  const H1 = '<table><tr><td>a</td><td>b</td></tr></table>';
  const H2 = '<table><tr><td>c</td></tr><tr><td>d</td></tr></table>';
  const html = (h) => readHtml(h, parseHtml, {textTw: 9000});
  const kinds = (bs) => bs.map((b) => (b.type === 'p' ? 'p:' + b.text
    : b.type));
  const backSame = async (d) => {
    const bytes = await write(d.doc);
    assertSameDoc(await readDocx(bytes), expectedBack(d.doc));
    return readDocx(bytes);
  };

  it('two HTML tables pasted mid-paragraph: a paragraph between',
    async () => {
      const x = html(H1 + H2);
      const d = mk(['xy']);
      undoable(d, () => pasteBlocks(d, caretAt(tops(d)[0], 1), x.blocks,
        {sameDoc: false, styleNames: x.styleNames}));
      assert.deepEqual(kinds(tops(d)), ['p:x', 'tbl', 'p:', 'tbl',
        'p:y']);
      assert.deepEqual(dupes(allIds(d.doc)), []);
      const back = await backSame(d);
      assert.deepEqual(kinds(back.sections[0].blocks), ['p:x', 'tbl',
        'p:', 'tbl', 'p:y']);
    });

  it('two HTML tables in a cell: a paragraph between', async () => {
    const x = html(`<table><tr><td>${H1}${H2}</td><td>z</td></tr>` +
      '</table>');
    const d = mk(['xy']);
    undoable(d, () => pasteBlocks(d, caretAt(tops(d)[0], 2), x.blocks,
      {sameDoc: false, styleNames: x.styleNames}));
    const T = tops(d).find((b) => b.type === 'tbl');
    assert.deepEqual(kinds(T.rows[0].cells[0].blocks), ['tbl', 'p:',
      'tbl', 'p:']);
    for (const b of tops(d)) checkBlock(b);
    assert.deepEqual(dupes(allIds(d.doc)), []);
    const back = await backSame(d);
    const bT = back.sections[0].blocks.find((b) => b.type === 'tbl');
    assert.deepEqual(kinds(bT.rows[0].cells[0].blocks), ['tbl', 'p:',
      'tbl', 'p:']);
  });

  it('a table pasted in a cell right after a table there', async () => {
    const {s} = await twoByTwo();
    const inner = modelTable([['n']]);
    const d = mk([modelTable([[[inner, 'q'], 'y']]), 'z']);
    const q = tops(d)[0].rows[0].cells[0].blocks[1];
    undoable(d, () => pasteBlocks(d, caretAt(q, 0), onlyTable(s),
      sameOpts(s)));
    assert.deepEqual(kinds(tops(d)[0].rows[0].cells[0].blocks), ['tbl',
      'p:', 'tbl', 'p:q']);
    checkBlock(tops(d)[0]);
  });

  it('a table pasted right after a kept (Opaque) table: a paragraph ' +
    'between (endsCell, C6a M3)', async () => {
    const {s} = await twoByTwo();
    const d = await open(await tblDocx(TBL_OPAQUE + p(r('after'))));
    assert.equal(tops(d)[0].type, 'opaque');
    undoable(d, () => pasteBlocks(d, caretAt(tops(d)[1], 0),
      onlyTable(s), sameOpts(s)));
    assert.deepEqual(kinds(tops(d)), ['opaque', 'p:', 'tbl', 'p:after']);
    const back = await backSame(d);
    assert.deepEqual(kinds(back.sections[0].blocks), ['opaque', 'p:',
      'tbl', 'p:after']);
  });

  it('apart: the same list when nothing touches; copy on write', () => {
    const t1 = freeze(modelTable([['a']])), t2 = freeze(modelTable([['b']]));
    const list = freeze([t1, {type: 'p', text: '', runs: [], inlines: {},
      pPr: {extra: []}}, t2]);
    assert.equal(apart(list), list);
    const outer = freeze(modelTable([[[t1, t2, mk(['e']).doc.sections[0]
      .blocks[0]]]]));
    const got = apart([outer, t2]);
    assert.deepEqual(kinds(got), ['tbl', 'p:', 'tbl']);
    assert.deepEqual(kinds(got[0].rows[0].cells[0].blocks), ['tbl', 'p:',
      'tbl', 'p:e']);
    assert.equal(got[2], t2);
    assert.equal(got[0].rows[0].cells[0].blocks[0], t1);
  });
});

describe('across conformance: what reads back as a field is one (C6 ' +
  'fix B4)', () => {
  const SIDE = (n, v = 'thinThickThinSmallGap') => `<w:${n} w:val="` +
    `${v}" w:sz="24" w:space="0" w:color="auto"/>`;
  // Word 2010 writes Strict tables with w:left / w:right (the Strict
  // reader keeps those raw), as the corpus file
  // O14ISOStrict/Word/insideH-...thinThickThinSmallGap.docx.docx
  const LR = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right',
    'insideH', 'insideV'].map((n) => SIDE(n)).join('') +
    '</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/>' +
    '</w:tblCellMar>';
  const TC_LR = '<w:tcBorders>' + SIDE('left', 'single') +
    '</w:tcBorders><w:tcMar><w:right w:w="50" w:type="dxa"/></w:tcMar>';
  const SE = '<w:tblBorders>' + ['top', 'start', 'bottom', 'end']
    .map((n) => SIDE(n, 'double')).join('') + '</w:tblBorders>';
  const src = async (tblPr, tcPr, strict) => open(await tblDocx(p(r('s')) +
    tbl([tr([tc(p(r('a')), {tcPr}), tc(p(r('b')))]),
      tr([tc(p(r('c'))), tc(p(r('d')))])], {tblPr}) + p(r('e')),
    {strict}));
  const pasteInto = async (from, d) => {
    const T = tops(from)[1];
    return copyPaste(from, selOf(cellP(T, 0, 0), 0, cellP(T, 1, 1), 1),
      d, caretAt(tops(d)[0], 1));
  };
  const same = async (d) => {
    const back = await readDocx(await write(d.doc));
    assertSameDoc(back, expectedBack(d.doc));
    return back;
  };
  const keys = (pr) => Object.keys(pr).sort();

  it('a Strict table with w:left / w:right into a Transitional one',
    async () => {
      const from = await src(LR, TC_LR, true);
      const T0 = tops(from)[1];
      assert.ok(T0.tblPr.tblBorders === undefined, 'raw in Strict');
      const d = mk(['xy']);
      undoable(d, () => pasteInto(from, d));
      const t = tops(d).find((b) => b.type === 'tbl');
      assert.ok(t.tblPr.tblBorders, 'a field in the model');
      assert.equal(t.tblPr.tblBorders.left.val, 'thinThickThinSmallGap');
      assert.ok(t.tblPr.tblCellMar, 'margins a field');
      assert.ok(t.rows[0].cells[0].tcPr.tcBorders, 'tcBorders a field');
      assert.ok(t.rows[0].cells[0].tcPr.tcMar, 'tcMar a field');
      assert.ok(!t.tblPr.extra.some((e) => /tblBorders|tblCellMar/
        .test(e.name)));
      const back = await same(d);
      const bt = back.sections[0].blocks.find((b) => b.type === 'tbl');
      assert.deepEqual(keys(bt.tblPr), keys(t.tblPr));
    });

  it('a Transitional table with w:start / w:end into a Strict one',
    async () => {
      const from = await src(SE, '', false);
      assert.ok(tops(from)[1].tblPr.tblBorders === undefined,
        'raw in Transitional');
      const d = await open(await strictDocx(p(r('xy'))));
      undoable(d, () => pasteInto(from, d));
      const t = tops(d).find((b) => b.type === 'tbl');
      assert.equal(t.tblPr.tblBorders.left.val, 'double');
      await same(d);
    });

  it('the same conformance: raw stays raw', async () => {
    const from = await src(LR, '', true);
    const d = await open(await strictDocx(p(r('xy'))));
    undoable(d, () => pasteInto(from, d));
    const t = tops(d).find((b) => b.type === 'tbl');
    assert.equal(t.tblPr.tblBorders, undefined);
    assert.ok(t.tblPr.extra.some((e) => /tblBorders/.test(e.name)));
    await same(d);
  });

  const FILE = `${CORPUS}/open-xml-sdk/O14ISOStrict/Word/insideH-Table ` +
    'Inside Horizontal Edges Border-val-thinThickThinSmallGap.docx.docx';
  it('the corpus file: read after paste equals read after save',
    {skip: !existsSync(FILE) && 'corpus missing'}, async () => {
      const from = await open(readFileSync(FILE));
      const T = tops(from).find((b) => b.type === 'tbl');
      const d = mk(['xy']);
      undoable(d, () => copyPaste(from, selOf(cellP(T, 0, 0), 0,
        cellP(T, 1, 1), 0), d, caretAt(tops(d)[0], 1)));
      const t = tops(d).find((b) => b.type === 'tbl');
      assert.ok(t.tblPr.tblBorders);
      await same(d);
    });
});
