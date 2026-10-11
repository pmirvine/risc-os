// Hand-off files tb-1 to tb-4 (see handoff-tables.mjs): Insert >
// Table, rows and columns, merge and split, widths and heights.
import fs from 'node:fs';
import {insertTable} from '../../tools/moreapps/!Word/TblInsert';
import {tabRowCmd, insertRowsCmd, deleteRowsCmd, splitTableCmd, mergeCmd,
  splitCellsCmd, alignCmd, propsCmd, rectOf}
  from '../../tools/moreapps/!Word/TblCmd';
import {insertColsCmd, deleteColsCmd, distributeColsCmd,
  distributeRowsCmd, colDragCmd, rowDragCmd}
  from '../../tools/moreapps/!Word/TblCmdCols';
import {fill as shown, patchOf} from '../../tools/moreapps/!Word/TblPatch';
import {gridOf} from '../../tools/moreapps/!Word/TblGrid';
import {at as walkAt} from '../../tools/moreapps/!Word/Walk';
import {mk} from './edit-docs.mjs';
import {tbl, tr, tc, p, r, docx, open, cap, cell, cellP, W, ONE, gridTbl,
  LOOK, car, end, cellCar, cellEnd, cellsSel, allTables, laid, typer, fill,
  must, save, S} from './handoff-tables-lib.mjs';
import {corpusFiles} from './handoff-tables-corpus.mjs';

const TG = '<w:tblStyle w:val="TableGrid"/>';
const AUTO = '<w:tblW w:w="0" w:type="auto"/>';
const NOTES = new Map();
export const notes = NOTES;

/** The Table properties box's way: values -> patch -> propsCmd. */
export function props(d, sel, values) {
  const x = rectOf(d.doc, sel), t = walkAt(d.doc, x.at);
  const patch = patchOf(values, shown(x, t, gridOf(t)));
  if (patch.error) throw new Error('props ' + JSON.stringify(patch));
  return must('props ' + JSON.stringify(values), propsCmd(d, sel, patch));
}
const vm = (k, n) => (k === 0 ? '<w:vMerge w:val="restart"/>'
  : k <= n ? '<w:vMerge/>' : '');
const shade = '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>';
const trh = (v, rule) => `<w:trHeight w:val="${v}" w:hRule="${rule}"/>`;

async function insert() {
  const d = mk(['Insert > Table 3 x 4 in a new document (TB2, TBC4j):',
    'Fixed column width 1 inch, 2 x 3:', 'Six columns, 2 rows:',
    'This paragraph is split in two by a table here.',
    'End of the document.']);
  const ty = typer(d);
  must('3x4', insertTable(d, end(d, 'Insert > Table 3 x 4 in a new ' +
    'document (TB2, TBC4j):'), {cols: 4, rows: 3}));
  fill(d, ty, 0, 'A');
  must('fixed', insertTable(d, end(d, 'Fixed column width 1 inch, ' +
    '2 x 3:'), {cols: 2, rows: 3, widthTw: 1440}));
  must('six', insertTable(d, end(d, 'Six columns, 2 rows:'),
    {cols: 6, rows: 2}));
  must('split', insertTable(d, car(d, 'This paragraph is split in ' +
    'two by a table here.', 18), {cols: 2, rows: 2}));
  must('nested', insertTable(d, cellCar(d, 0, 1, 1), {cols: 2,
    rows: 2}));
  await save('tb-1-insert.docx', d);

  const files = corpusFiles();
  const f = files.find((q) => /tbl-having-applied-style/.test(q));
  if (!f) {
    NOTES.set('tb-1b-existing.docx', 'skipped: the corpus is absent');
    return;
  }
  const e = await open(new Uint8Array(fs.readFileSync(f)));
  const first = e.doc.sections[0].blocks.find((b) => b.type === 'p');
  const at = S.caret({id: first.id, off: first.text.length});
  must('existing', insertTable(e, at, {cols: 4, rows: 3}));
  await save('tb-1b-existing.docx', e);
}

async function rows() {
  const T = (n, extra = {}) => gridTbl('T' + n, 4, 3, {w: 3120, ...extra});
  const merge = (n) => T(n, {cellPr: (i, j) => (j === 0 ? vm(i, 2) : '')});
  const body = [
    cap('Table 0: Tab in the last cell adds a row (TB9). The last row ' +
      'is yellow, 0.42 in high, with a red top border'),
    gridTbl('T0', 3, 3, {w: 3120, rowPr: (i) => (i === 2 ? trh(600,
      'atLeast') : ''), cellPr: (i) => (i === 2 ? `<w:tcBorders>` +
      `${ONE('top', 12, 'FF0000')}</w:tcBorders>${shade}` : '')}),
    cap('Table 1: a column inserted right of column 2 in a full-width ' +
      'table (TB12, TBC4e)'),
    gridTbl('T1', 3, 3, {w: 3000}),
    cap('Table 2: a row inserted above header row 1 (TBC4a)'),
    T(2, {rowPr: (i) => (i < 2 ? '<w:tblHeader/>' : '')}),
    cap('Table 3: a row inserted below header row 2, the last header ' +
      '(TBC4a)'),
    T(3, {rowPr: (i) => (i < 2 ? '<w:tblHeader/>' : '')}),
    cap('Table 4: a row inserted below row 1 of a vertical merge ' +
      '(TBC4b: inside it)'),
    merge(4),
    cap('Table 5: a row inserted below the last row of the merge ' +
      '(TBC4b)'),
    merge(5),
    cap('Table 6: a row inserted above the first row of the merge ' +
      '(TBC4b)'),
    merge(6),
    cap('Table 7: a column inserted right of the merged column ' +
      '(TBC4d)'),
    merge(7),
    cap('Table 8: a column inserted right of a cell spanning columns ' +
      '1 and 2 (TBC4d)'),
    tbl([tr([cell('S.1.1', 6240, '<w:gridSpan w:val="2"/>'),
      cell('S.1.3', 3120)]), ...[2, 3].map((i) => tr([1, 2, 3]
      .map((j) => cell(`S.${i}.${j}`, 3120))))],
    {grid: [3120, 3120, 3120], tblPr: TG + AUTO + LOOK}),
    cap('Table 9: a row with exceptions (double top border) and a row ' +
      'inserted below it (TBC4m)'),
    tbl([tr([cell('E.1.1', 4680), cell('E.1.2', 4680)]),
      tr(['<w:tblPrEx><w:tblBorders>' + ONE('top', 12, '0000FF',
        'double') + '</w:tblBorders></w:tblPrEx>', cell('E.2.1', 4680),
      cell('E.2.2', 4680)]), tr([cell('E.3.1', 4680),
        cell('E.3.2', 4680)])], {grid: [4680, 4680],
      tblPr: TG + AUTO + LOOK}),
    cap('Table 10: percentage widths, a column inserted (TBC4l)'),
    tbl([1, 2, 3].map((i) => tr([1, 2, 3].map((j) => cell(`P.${i}.${j}`,
      0, '<w:tcW w:w="1667" w:type="pct"/>')))), {grid: [3120, 3120,
      3120], tblPr: TG + '<w:tblW w:w="5000" w:type="pct"/>' + LOOK}),
    cap('Table 11: split at row 3 (TBC4i, Ctrl-Shift-Enter)'),
    gridTbl('Q', 4, 2, {w: 4680}),
    cap('Table 12: split at the first row (TBC4i)'),
    gridTbl('R', 3, 2, {w: 4680}),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  const n = (k) => allTables(d)[k].t;
  must('tab', tabRowCmd(d, cellEnd(d, 0, 2, 2)));
  const was = n(1).grid.reduce((a, b) => a + b, 0);
  must('col', insertColsCmd(d, cellCar(d, 1, 0, 1), true, laid(d)));
  const now = n(1).grid.reduce((a, b) => a + b, 0);
  NOTES.set('tb-2-rows-cols.docx', `Table 1 (TB12): the grid totals ` +
    `${was} twips before the inserted column and ${now} after. Splitting ` +
    'Table 11 made two tables, so the caption "Table 12" is above the ' +
    'table listed as Table 13.');
  must('r2', insertRowsCmd(d, cellCar(d, 2, 0, 0), false));
  must('r3', insertRowsCmd(d, cellCar(d, 3, 1, 0), true));
  must('r4', insertRowsCmd(d, cellCar(d, 4, 0, 1), true));
  must('r5', insertRowsCmd(d, cellCar(d, 5, 2, 1), true));
  must('r6', insertRowsCmd(d, cellCar(d, 6, 0, 1), false));
  must('c7', insertColsCmd(d, cellCar(d, 7, 0, 0), true, laid(d)));
  must('c8', insertColsCmd(d, cellCar(d, 8, 0, 0), true, laid(d)));
  must('r9', insertRowsCmd(d, cellCar(d, 9, 1, 0), true));
  must('c10', insertColsCmd(d, cellCar(d, 10, 0, 1), true, laid(d)));
  must('split12', splitTableCmd(d, cellCar(d, 12, 0, 0)));
  must('split11', splitTableCmd(d, cellCar(d, 11, 2, 0)));
  await save('tb-2-rows-cols.docx', d);
}

async function merges() {
  const body = [
    cap('Table 0: 3 x 4 table, text in four cells, cells 1-3 of rows ' +
      '1-2 merged (TB13, TBC4f)'),
    gridTbl('M', 3, 4, {w: 2340, text: (i, j) => ({'0,0': 'first',
      '0,2': 'third', '1,1': 'middle', '1,2': 'right'}[`${i},${j}`] ||
      '')}),
    cap('Table 1: the centre cell split into 2 columns x 2 rows ' +
      '(TB14)'),
    gridTbl('S', 3, 3, {w: 3120}),
    cap('Table 2: the vertically merged middle cell split into 2 ' +
      'columns x 3 rows (TB14)'),
    gridTbl('V', 3, 3, {w: 3120, cellPr: (i, j) => (j === 1 ? vm(i, 2)
      : '')}),
    cap('Table 3: the second column deleted, which crosses a cell ' +
      'spanning columns 2 and 3 (TB25)'),
    tbl([tr([cell('D.1.1', 2340), cell('D.1.23', 4680,
      '<w:gridSpan w:val="2"/>'), cell('D.1.4', 2340)]),
    ...[2, 3].map((i) => tr([1, 2, 3, 4].map((j) => cell(`D.${i}.${j}`,
      2340))))], {grid: [2340, 2340, 2340, 2340],
      tblPr: TG + AUTO + LOOK}),
    cap('Table 4: row 2 deleted, which holds the restart of a ' +
      'vertical merge over rows 2-4 (TB25)'),
    gridTbl('X', 4, 3, {w: 3120, cellPr: (i, j) => (j === 1 && i > 0
      ? vm(i - 1, 2) : '')}),
    cap('Table 5: authored: the first row\'s cell is a vMerge ' +
      'continue (TB8)'),
    tbl([tr([cellP(p(r('K.1.1')), 4680, '<w:vMerge/>'),
      cell('K.1.2', 4680)]), tr([cell('K.2.1', 4680),
      cell('K.2.2', 4680)])], {grid: [4680, 4680], tblPr: TG + AUTO}),
    cap('Table 6: authored: a cell spanning 3 columns of a 2-column ' +
      'grid (TB8)'),
    tbl([tr([cell('G.1.1', 9360, '<w:gridSpan w:val="3"/>')]),
      tr([cell('G.2.1', 4680), cell('G.2.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO}),
    cap('Table 7: authored: rows with gridBefore and gridAfter (TB8)'),
    tbl([tr([cell('B.1.1', 2340), cell('B.1.2', 2340)], {trPr: '<w:' +
      'gridBefore w:val="1"/><w:wBefore w:w="2340" w:type="dxa"/>' +
      '<w:gridAfter w:val="1"/><w:wAfter w:w="2340" w:type="dxa"/>'}),
    tr([1, 2, 3, 4].map((j) => cell(`B.2.${j}`, 2340))),
    tr([cell('B.3.1', 2340), cell('B.3.2', 2340)], {trPr: '<w:' +
      'gridAfter w:val="2"/><w:wAfter w:w="4680" w:type="dxa"/>'})],
    {grid: [2340, 2340, 2340, 2340], tblPr: TG + AUTO}),
    cap('Table 8: authored: a stray vMerge continue (no merge above) ' +
      'then a row inserted below the table (TBC4n)'),
    tbl([tr([cell('Z.1.1', 4680), cell('Z.1.2', 4680)]),
      tr([cellP(p(r('Z.2.1')), 4680, '<w:vMerge/>'),
        cell('Z.2.2', 4680)]), tr([cell('Z.3.1', 4680),
        cell('Z.3.2', 4680)])], {grid: [4680, 4680],
      tblPr: TG + AUTO}),
    cap('Table 9: a vertically merged cell centred (TBC5f)'),
    gridTbl('Y', 3, 2, {w: 4680, cellPr: (i, j) => (j === 0 ? vm(i, 2)
      : '')}),
    cap('Table 10: three cells of one row merged by !Word (gridSpan)'),
    gridTbl('H', 2, 3, {w: 3120}),
    cap('Table 11: three cells of one column merged by !Word (vMerge)'),
    gridTbl('U', 3, 2, {w: 4680}),
    cap('Table 12: authored: a vMerge continue cell under a cell that ' +
      'spans other columns (TB8a)'),
    tbl([tr([cellP(p(r('J.1.12')), 4680, '<w:gridSpan w:val="2"/>' +
      vm(0, 1)), cell('J.1.3', 2340)]), tr([cellP(p(r('J.2.1')), 2340,
      vm(1, 1)), cell('J.2.2', 2340), cell('J.2.3', 2340),
    ]), tr([1, 2, 3].map((j) => cell(`J.3.${j}`, 2340)))],
    {grid: [2340, 2340, 2340], tblPr: TG + AUTO + LOOK}),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  must('merge', mergeCmd(d, cellsSel(d, 0, 0, 0, 1, 2)));
  must('split', splitCellsCmd(d, cellCar(d, 1, 1, 1), {cols: 2,
    rows: 2}));
  must('splitv', splitCellsCmd(d, cellCar(d, 2, 0, 1), {cols: 2,
    rows: 3}));
  must('delcol', deleteColsCmd(d, cellCar(d, 3, 1, 1)));
  must('delrow', deleteRowsCmd(d, cellCar(d, 4, 1, 0)));
  must('stray', insertRowsCmd(d, cellCar(d, 8, 2, 0), true));
  must('align', alignCmd(d, cellCar(d, 9, 0, 0), 'center'));
  must('hmerge', mergeCmd(d, cellsSel(d, 10, 0, 0, 0, 2)));
  must('vmerge', mergeCmd(d, cellsSel(d, 11, 0, 0, 2, 0)));
  await save('tb-3-merge-split.docx', d);
}

async function widths() {
  const long = 'Supercalifragilisticexpialidocious';
  const mix = (label, ws, tblPr, grid = [3000, 3000, 3000]) => tbl(
    [1, 2].map((i) => tr(ws.map((w, j) => tc(p(r(`${label}.${i}.${j +
      1}`)), {tcPr: w})))), {grid, tblPr: TG + tblPr + LOOK});
  const dx = (n) => W(n), pc = (n) => `<w:tcW w:w="${n}" w:type="pct"/>`;
  const au = '<w:tcW w:w="0" w:type="auto"/>';
  const body = [
    cap('Table 0: no usable grid (0 twips), tcW 1000 / 3000 / 2000 ' +
      '(TB7)'), mix('N', [dx(1000), dx(3000), dx(2000)], AUTO,
      [0, 0, 0]),
    cap('Table 1: tblW 100% (pct 5000), tcW pct 1000 / 2000 / 2000 ' +
      '(TB7)'), mix('P', [pc(1000), pc(2000), pc(2000)],
      '<w:tblW w:w="5000" w:type="pct"/>'),
    cap('Table 2: tcW auto, a long word in column 2 (TB7, TB7c)'),
    tbl([tr([tc(p(r('A.1.1')), {tcPr: au}), tc(p(r(long)),
      {tcPr: au}), tc(p(r('A.1.3')), {tcPr: au})])],
    {grid: [3000, 3000, 3000], tblPr: TG + AUTO + LOOK}),
    cap('Table 3: tcW 0 and -5 beside 2000 (TB7b)'),
    mix('Z', [dx(0), dx(-5), dx(2000)], AUTO),
    cap('Table 4: a cell spanning 2 columns with tcW 6000 (TB7a)'),
    tbl([tr([cell('S.1.1', 6000, '<w:gridSpan w:val="2"/>'),
      cell('S.1.3', 2000)]), tr([cell('S.2.1', 2000),
      cell('S.2.2', 2000), cell('S.2.3', 2000)])],
    {grid: [2000, 2000, 2000], tblPr: TG + AUTO + LOOK}),
    cap('Table 5: column border 1 dragged right 450 twips (TB18, ' +
      'TBC5l)'), gridTbl('C', 3, 3, {w: 2000}),
    cap('Table 6: right edge dragged right 400 twips, tblW 6000 dxa ' +
      '(TBC5m)'),
    gridTbl('E', 2, 3, {w: 2000, tblPr: TG +
      '<w:tblW w:w="6000" w:type="dxa"/>' + LOOK}),
    cap('Table 7: row 2 dragged to 0.5 in at least, row 3 to 0.28 in ' +
      'exactly (TB18)'), gridTbl('R', 3, 2, {w: 3000}),
    cap('Table 8: columns distributed over the whole table (TBC4h)'),
    gridTbl('D', 3, 4, {w: [1000, 3000, 2000, 2000]}),
    cap('Table 9: rows distributed (TBC4h)'),
    tbl([['x', 'one line'], ['y', 'a longer text in this cell that ' +
      'runs over several lines when the column is narrow, with more ' +
      'words to make the row tall'], ['z', 'short']].map(([a, b], i) =>
      tr([cell(`W.${i + 1}.1`, 1200), cell(b, 1200)])),
    {grid: [1200, 1200], tblPr: TG + AUTO + LOOK}),
    cap('Table 10: Table properties: row height Exactly 0.42 in ' +
      '(TBC5a)'), gridTbl('F', 3, 2, {w: 4680}),
    cap('Table 11: Table properties: column width 2.08 in on a table ' +
      'of tblW 6000 dxa (TBC5c)'),
    gridTbl('G', 2, 3, {w: 2000, tblPr: TG +
      '<w:tblW w:w="6000" w:type="dxa"/>' + LOOK}),
    cap('Table 12: Table properties: cell width 0.69 in on one cell ' +
      '(TBC5d)'), gridTbl('H', 2, 3, {w: 3000}),
    cap('Table 13: Table properties: indent -0.08 in (TBC5e)'),
    gridTbl('I', 2, 2, {w: 4680}),
    cap('Table 14: exact row height 0.17 in over three lines of text ' +
      '(TB19)'),
    tbl([tr([tc(p(r('line one')) + p(r('line two')) + p(r('line three')),
      {tcPr: W(4680)}), cell('X.1.2', 4680)], {trPr: trh(240,
      'exact')}), tr([cell('X.2.1', 4680), cell('X.2.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 15: row height at least 27.8 in, the 2112 px cap (TB24b)'),
    gridTbl('J', 2, 2, {w: 4680, rowPr: (i) => (i === 0 ? trh(40000,
      'atLeast') : '')}),
    cap('Table 16: row 1 a height of 0 at least, row 2 a height of 1 ' +
      'in with rule auto (TB24c)'),
    gridTbl('K', 3, 2, {w: 4680, rowPr: (i) => (i === 0 ? trh(0,
      'atLeast') : i === 1 ? trh(1440, 'auto') : '')}),
    cap('Table 17: a merge over three rows whose last row is exact ' +
      '0.2 in (TB24d)'),
    tbl([0, 1, 2].map((i) => tr([tc(i === 0 ? p(r('one cell, ' +
      'three rows')) + p(r('second line')) + p(r('third line')) +
      p(r('fourth line')) : p(), {tcPr: W(4680) + vm(i, 2)}),
    cell(`L.${i + 1}.2`, 4680)], {trPr: i === 2 ? trh(288, 'exact')
      : ''})), {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 18: centred, narrower than the text, tblInd 720 ' +
      '(TB6a, TBC5b)'),
    gridTbl('M', 2, 2, {w: 2000, tblPr: TG + '<w:tblW w:w="4000" w:' +
      'type="dxa"/><w:jc w:val="center"/><w:tblInd w:w="720" w:type=' +
      '"dxa"/>' + LOOK}),
    cap('Table 19: right-aligned, tblInd 720 (TB6a, TBC5b)'),
    gridTbl('O', 2, 2, {w: 2000, tblPr: TG + '<w:tblW w:w="4000" w:' +
      'type="dxa"/><w:jc w:val="right"/><w:tblInd w:w="720" w:type=' +
      '"dxa"/>' + LOOK}),
    cap('Table 20: left, 9360 wide, tblInd 720: wider than the ' +
      'column (TB6a)'),
    gridTbl('Q', 2, 3, {w: 3120, tblPr: TG + '<w:tblW w:w="9360" w:' +
      'type="dxa"/><w:tblInd w:w="720" w:type="dxa"/>' + LOOK}),
    cap('Table 21: tblW 4000 dxa but a grid of 6000, dragged (TBC5o)'),
    gridTbl('S', 2, 3, {w: 2000, tblPr: TG +
      '<w:tblW w:w="4000" w:type="dxa"/>' + LOOK}),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  const t = (k) => allTables(d)[k].t;
  const c = (k, i, j) => cellCar(d, k, i, j);
  must('drag1', colDragCmd(d, c(5, 0, 0), {table: t(5),
    grid: [2450, 1550, 2000]}));
  must('edge', colDragCmd(d, c(6, 0, 0), {table: t(6),
    grid: [2000, 2000, 2400], fitW: true}));
  must('rowdrag', rowDragCmd(d, c(7, 0, 0), {table: t(7), row: 1,
    val: 720, rule: 'atLeast'}));
  must('rowdrag2', rowDragCmd(d, c(7, 0, 0), {table: t(7), row: 2,
    val: 400, rule: 'exact'}));
  must('distc', distributeColsCmd(d, cellsSel(d, 8, 0, 0, 2, 3)));
  must('distr', distributeRowsCmd(d, cellsSel(d, 9, 0, 0, 2, 1),
    laid(d)));
  props(d, c(10, 0, 0), {rowMode: 'exact', rowHeight: 600});
  props(d, c(11, 0, 0), {colWidth: 3000});
  props(d, c(12, 0, 1), {cellWidth: 1000});
  props(d, c(13, 0, 0), {indent: -115});
  must('scaled', colDragCmd(d, c(21, 0, 0), {table: t(21),
    grid: [2000, 1200, 800]}));
  await save('tb-4-widths.docx', d);
}

export async function makeA() {
  await insert();
  await rows();
  await merges();
  await widths();
}
