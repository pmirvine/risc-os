// Hand-off files tb-5 to tb-7 (see handoff-tables.mjs): borders and
// shading, table styles, the compatibility modes, nested tables.
import {fill as bfill, patch as bpatch, sidesOf, effOf}
  from '../../tools/moreapps/!Letters/TblBorderPatch';
import {bordersCmd} from '../../tools/moreapps/!Letters/TblCmdCols';
import {tabRowCmd, deleteRowsCmd, rectOf}
  from '../../tools/moreapps/!Letters/TblCmd';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {at as walkAt} from '../../tools/moreapps/!Letters/Walk';
import {tbl, tr, tc, p, r, docx, open, cap, cell, cellP, W, ONE, gridTbl,
  LOOK, cellCar, cellEnd, cellsSel, allTables, tix, laid, must, save}
  from './handoff-tables-lib.mjs';
import {GRID_TABLE_4, LIST_TABLE_3} from './tbl-fixtures.mjs';

const TG = '<w:tblStyle w:val="TableGrid"/>';
const AUTO = '<w:tblW w:w="0" w:type="auto"/>';
const vm = (k, n) => (k === 0 ? '<w:vMerge w:val="restart"/>'
  : k <= n ? '<w:vMerge/>' : '');
const side = (n, val, sz, color = 'auto') => `<w:${n} w:val="${val}" ` +
  `w:sz="${sz}" w:space="0" w:color="${color}"/>`;
const bd = (...s) => `<w:tcBorders>${s.join('')}</w:tcBorders>`;
const shd = (fill) => `<w:shd w:val="clear" w:color="auto" ` +
  `w:fill="${fill}"/>`;

/** The Borders and shading box's way: values -> patch -> bordersCmd. */
function borders(d, n, [i0, j0, i1, j1], apply, o) {
  const sel = cellsSel(d, n, i0, j0, i1, j1);
  const x = rectOf(d.doc, sel), t = walkAt(d.doc, x.at);
  const g = gridOf(t), eff = effOf(laid(d), t);
  const v = {...bfill(x, t, g, apply, eff), ...o, apply};
  const pt = bpatch(v, {shape: x, table: t, g, eff});
  if (pt.bad) throw new Error('borders ' + JSON.stringify(pt.bad));
  return must('borders', bordersCmd(d, sel, pt));
}
const BOX = {setting: 'box', ...sidesOf('box')};
const NONE = {setting: 'none', ...sidesOf('none')};
const ALL = {setting: 'all', ...sidesOf('all')};
const LINE = (style, width, colour) => ({style, width, colour});

async function bordersFile() {
  const pair = (n, a, b, why) => tr([cell(`${n}a`, 0, bd(a)),
    cell(`${n}b ${why}`, 0, bd(b))]);
  const body = [
    cap('Table 0: neighbours across a shared edge (TB3, TB3e, TB3g). ' +
      'Left cell\'s right side against the right cell\'s left side'),
    tbl([
      pair(1, side('right', 'single', 4), side('left', 'double', 6),
        'single 4 | double 6'),
      pair(2, side('right', 'single', 12), side('left', 'double', 6),
        'single 12 | double 6'),
      pair(3, side('right', 'dotted', 24), side('left', 'single', 12),
        'dotted 24 | single 12'),
      pair(4, side('right', 'single', 12, 'FF0000'), side('left',
        'single', 12, '0000FF'), 'red 12 | blue 12'),
      pair(5, side('right', 'nil', 0), side('left', 'single', 8),
        'nil | single 8'),
      pair(6, side('right', 'thinThickThinSmallGap', 6), side('left',
        'double', 6), 'thinThickThinSmallGap 6 | double 6')],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 1: cell spacing 40 twips (TB3c, TB24a)'),
    gridTbl('S', 2, 3, {w: 3120, tblPr: TG + AUTO +
      '<w:tblCellSpacing w:w="40" w:type="dxa"/>' + LOOK}),
    cap('Table 2: a merged cell: each row\'s right side differs, the ' +
      'last row has a double bottom (TB3d)'),
    tbl([0, 1, 2].map((i) => tr([tc(p(r(`V.${i + 1}.1`)), {tcPr: W(4680) +
      vm(i, 2) + bd(i === 2 ? side('bottom', 'double', 6) : '',
        i === 0 ? side('right', 'single', 12, 'FF0000')
          : i === 1 ? '' : side('right', 'single', 12, '0000FF'))})
      .replace(
      /<w:tcBorders><\/w:tcBorders>/, ''), cell(`V.${i + 1}.2`, 4680)])),
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 3: Grid Table 4, one cell with direct clear shading and ' +
      'no fill (TB3f)'),
    tbl([0, 1, 2].map((i) => tr([0, 1, 2].map((j) => cell(`G.${i + 1}.` +
      `${j + 1}`, 3120, i === 1 && j === 1 ? '<w:shd w:val="clear" ' +
      'w:color="auto" w:fill="auto"/>' : '')))), {grid: [3120, 3120,
      3120], tblPr: '<w:tblStyle w:val="GridTable4"/>' + AUTO + LOOK}),
    cap('Table 4: themed colours kept as written: a blue accent1 top ' +
      'border and accent1 shading (tint 66)'),
    tbl([tr([cell('T.1.1', 4680, bd('<w:top w:val="single" w:sz="12" ' +
      'w:space="0" w:color="4472C4" w:themeColor="accent1"/>') +
      '<w:shd w:val="clear" w:color="auto" w:fill="B4C6E7" w:themeFill=' +
      '"accent1" w:themeFillTint="66"/>'), cell('T.1.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 5: a cell with every side nil, in a Table Grid table ' +
      '(nil sides)'),
    gridTbl('N', 3, 3, {w: 3120, cellPr: (i, j) => (i === 1 && j === 1
      ? bd(['top', 'left', 'bottom', 'right'].map((n) => `<w:${n} ` +
        'w:val="nil"/>').join('')) : '')}),
    cap('Table 6: Borders and shading, Apply to Cell: a red 2.25 pt box ' +
      'round the centre cell (TBC5k)'),
    gridTbl('B', 3, 3, {w: 3120, tblPr: AUTO + LOOK}),
    cap('Table 7: Apply to Cell: all sides, grey fill, over 2 x 2 cells'),
    gridTbl('A', 3, 3, {w: 3120, tblPr: AUTO + LOOK}),
    cap('Table 8: Table Grid, Apply to Cell: None on the centre cell ' +
      '(TBC5h, TBC5i: the neighbours get nil too)'),
    gridTbl('O', 3, 3, {w: 3120}),
    cap('Table 9: borders in the table, Apply to Cell: top turned off ' +
      'on the first cell (TBC5i)'),
    gridTbl('D', 2, 2, {w: 4680, tblPr: TG + AUTO + LOOK}),
    cap('Table 10: Grid Table 4 with yellow cells in row 2, Fill None ' +
      'there (TBC5j)'),
    gridTbl('F', 3, 3, {w: 3120, tblPr: '<w:tblStyle w:val=' +
      '"GridTable4"/>' + AUTO + LOOK, cellPr: (i) => (i === 1 ? shd(
      'FFFF00') : '')}),
    cap('Table 11: only the neighbour draws the line between cells 1 ' +
      'and 2 (its left side); try Apply to Cell on cell 1 (TBC5q)'),
    tbl([tr([cell('Q.1.1', 4680), cell('Q.1.2', 4680, bd(side('left',
      'single', 12, 'FF0000')))])], {grid: [4680, 4680],
    tblPr: AUTO + LOOK}),
    cap('Table 12: every cell has its own box; Apply to Table: None ' +
      '(TBC5r)'),
    gridTbl('K', 2, 2, {w: 4680, cellPr: () => bd(
      ['top', 'left', 'bottom', 'right'].map((n) => side(n, 'single',
        8)).join(''))}),
    cap('Table 13: Apply to Table: all six sides double blue, ' +
      'table shading pale yellow'),
    gridTbl('L', 2, 3, {w: 3120, tblPr: AUTO + LOOK}),
    p(r('End.'))].join('');
  const d = await open(await docx(body, {more: GRID_TABLE_4}));
  borders(d, 6, [1, 1, 1, 1], 'cell', {...BOX, ...LINE('single', 18,
    'FF0000')});
  borders(d, 7, [0, 0, 1, 1], 'cell', {...ALL, ...LINE('single', 4,
    'auto'), fillkind: 'colour', fill: 'D9D9D9'});
  borders(d, 8, [1, 1, 1, 1], 'cell', NONE);
  borders(d, 9, [0, 0, 0, 0], 'cell', {top: false});
  borders(d, 10, [1, 0, 1, 2], 'cell', {fillkind: 'none'});
  borders(d, 12, [0, 0, 0, 0], 'table', NONE);
  borders(d, 13, [0, 0, 0, 0], 'table', {...ALL, ...LINE('double', 6,
    '0000FF'), fillkind: 'colour', fill: 'FFF2CC'});
  await save('tb-5-borders-shading.docx', d);
}

const FLAGS = {firstRow: 0x20, lastRow: 0x40, firstColumn: 0x80,
  lastColumn: 0x100, noHBand: 0x200, noVBand: 0x400};
/** A tblLook (hex and booleans), `on` the flags that are 1. */
function look(on, val) {
  const v = val || (Object.entries(FLAGS).reduce((a, [k, n]) => a +
    (on.includes(k) ? n : 0), 0).toString(16).toUpperCase()
    .padStart(4, '0'));
  return `<w:tblLook w:val="${v}" ` + Object.keys(FLAGS).map((k) =>
    `w:${k}="${on.includes(k) ? 1 : 0}"`).join(' ') + '/>';
}
const COMBOS = [
  ['header row, first column, banded rows (04A0)', ['firstRow',
    'firstColumn', 'noVBand']],
  ['no flags: no header, no first column, no banding (0600)',
    ['noHBand', 'noVBand']],
  ['header row only, both bandings on (0020)', ['firstRow']],
  ['last row on (04E0)', ['firstRow', 'lastRow', 'firstColumn',
    'noVBand']],
  ['last column on (05A0)', ['firstRow', 'firstColumn', 'lastColumn',
    'noVBand']],
  ['every flag on, no banding off (01E0)', ['firstRow', 'lastRow',
    'firstColumn', 'lastColumn']],
  ['first column only, banded rows (0480)', ['firstColumn', 'noVBand']],
];

async function stylesFile() {
  const out = [];
  let k = 0;
  for (const [id, name] of [['GridTable4', 'Grid Table 4'],
    ['ListTable3', 'List Table 3']]) {
    for (const [what, on] of COMBOS) {
      out.push(cap(`Table ${k++}: ${name}, tblLook ${what} (TB4, ` +
        'TB4a, TB4c)'), gridTbl(id[0] + k, 5, 4, {w: 2340, tblPr:
        `<w:tblStyle w:val="${id}"/>` + AUTO + look(on)}));
    }
  }
  out.push(
    cap(`Table ${k++}: Grid Table 4, two header rows (tblHeader) and ` +
      'the header row flag on (TB4d)'),
    gridTbl('H', 4, 3, {w: 3120, tblPr: '<w:tblStyle w:val=' +
      '"GridTable4"/>' + AUTO + look(['firstRow', 'noVBand']),
    rowPr: (i) => (i < 2 ? '<w:tblHeader/>' : '')}),
    cap(`Table ${k++}: Grid Table 4 with direct red table borders and ` +
      '0.25 in left cell margins (TB3b)'),
    gridTbl('D', 3, 3, {w: 3120, tblPr: '<w:tblStyle w:val=' +
      '"GridTable4"/>' + AUTO + '<w:tblBorders>' + ['top', 'left',
      'bottom', 'right', 'insideH', 'insideV'].map((n) => side(n,
      'single', 12, 'FF0000')).join('') + '</w:tblBorders>' +
      '<w:tblCellMar><w:left w:w="360" w:type="dxa"/></w:tblCellMar>' +
      look(['firstRow', 'noVBand'])}),
    cap(`Table ${k++}: Grid Table 4, last column on: a cell spanning ` +
      'the last two columns, and a whole-row cell (TB24e)'),
    tbl([tr([1, 2, 3, 4].map((j) => cell(`E.1.${j}`, 2340))),
      tr([cell('E.2.1', 2340), cell('E.2.2', 2340),
        cell('E.2.34', 4680, '<w:gridSpan w:val="2"/>')]),
      tr([cell('E.3.1234', 9360, '<w:gridSpan w:val="4"/>')])],
    {grid: [2340, 2340, 2340, 2340], tblPr: '<w:tblStyle w:val=' +
      '"GridTable4"/>' + AUTO + look(['firstRow', 'firstColumn',
        'lastColumn', 'noVBand'])}),
    p(r('End.')));
  const d = await open(await docx(out.join(''), {more: GRID_TABLE_4 +
    LIST_TABLE_3}));
  await save('tb-6-styles.docx', d);
}

const SMALL = '<w:style w:type="table" w:styleId="SmallCentre"><w:name ' +
  'w:val="Small Centre"/><w:basedOn w:val="TableNormal"/><w:pPr><w:jc ' +
  'w:val="center"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr><w:tblPr/>' +
  '</w:style>';
const NORMAL11 = '<w:style w:type="paragraph" w:styleId="Body11">' +
  '<w:name w:val="Body 11"/><w:basedOn w:val="Normal"/><w:rPr><w:sz ' +
  'w:val="22"/></w:rPr></w:style>';

function compatBody(n) {
  const ind = (tw, mar) => `<w:tblInd w:w="${tw}" w:type="dxa"/>` +
    '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH',
      'insideV'].map((s) => side(s, 'single', 12, 'FF0000')).join('') +
    `</w:tblBorders><w:tblCellMar><w:left w:w="${mar}" w:type="dxa"/>` +
    `<w:right w:w="${mar}" w:type="dxa"/></w:tblCellMar>`;
  const out = [p(r(`Compatibility mode ${n} (settings.xml). The red ` +
    'rules are the table borders; the page text margin is the left ' +
    'edge of this paragraph.'))];
  for (const [tw, mar] of [[0, 108], [720, 108], [0, 0], [720, 0]]) {
    out.push(cap(`Table: tblInd ${tw}, cell margins left and right ` +
      `${mar} (TB6): where is the left border?`),
    gridTbl(`I${tw}-${mar}`, 2, 2, {w: 2000, tblPr: '<w:tblW w:w="4000"' +
      ` w:type="dxa"/>${ind(tw, mar)}` + LOOK}));
  }
  out.push(cap('Table: style "Small Centre" (sz 9, jc center) over ' +
    'Normal 11 left (TB5)'),
  gridTbl('S', 2, 2, {w: 4680, tblPr: '<w:tblStyle w:val=' +
    '"SmallCentre"/>' + AUTO + LOOK}),
  cap('Table: the same, with a Body 11 paragraph style in the cells'),
  tbl([tr([tc(p(r('S2.1'), '<w:pStyle w:val="Body11"/>'),
    {tcPr: W(4680)}), tc(p(r('S2.2'), '<w:pStyle w:val="Body11"/>'),
    {tcPr: W(4680)})])], {grid: [4680, 4680], tblPr:
    '<w:tblStyle w:val="SmallCentre"/>' + AUTO + LOOK}),
  cap('Table: Grid Table 4, tblLook val 0000 but the booleans say ' +
    'header row, first column, banded rows (TB5: the booleans win)'),
  gridTbl('L', 3, 3, {w: 3120, tblPr: '<w:tblStyle w:val=' +
    '"GridTable4"/>' + AUTO + look(['firstRow', 'firstColumn',
      'noVBand'], '0000')}),
  cap('Table: Grid Table 4, tblLook val 04A0, every boolean 0 (TB5)'),
  gridTbl('M', 3, 3, {w: 3120, tblPr: '<w:tblStyle w:val=' +
    '"GridTable4"/>' + AUTO + look([], '04A0')}),
  p(r('End.')));
  return out.join('');
}

async function compatFiles() {
  for (const [n, name] of [[14, 'tb-6b-compat14.docx'],
    [15, 'tb-6c-compat15.docx']]) {
    const bytes = await docx(compatBody(n), {more: GRID_TABLE_4 + SMALL +
      NORMAL11, settings: '<w:compat><w:compatSetting ' +
      'w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/' +
      `office/word" w:val="${n}"/></w:compat>`});
    await save(name, await open(bytes));
  }
}

async function nested() {
  const inner = (l) => gridTbl(l, 2, 2, {w: 2000});
  const body = [
    cap('Table 0: authored: a 2 x 2 table nested in the top right ' +
      'cell (a paragraph after it)'),
    tbl([tr([cell('O.1.1', 4680), cellP(p(r('O.1.2')) + inner('n') +
      p(), 4680)]), tr([cell('O.2.1', 4680), cell('O.2.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 1: Insert > Table 2 x 2 with the caret in a cell (made ' +
      'by !Letters)'),
    gridTbl('P', 2, 2, {w: 4680}),
    cap('Table 2: Insert > Table with the cells 1-2 of row 1 selected ' +
      '(TBC4o: they are cleared, the table goes in the first)'),
    gridTbl('Q', 2, 3, {w: 3120}),
    cap('Table 3: Tab in the last cell of the nested table adds a row ' +
      'to the nested table'),
    tbl([tr([cellP(p(r('R.1.1')) + gridTbl('m', 2, 2, {w: 2000}) + p(),
      9360)])], {grid: [9360], tblPr: TG + AUTO + LOOK}),
    cap('Table 4: the outer row 2 holding a nested table is deleted'),
    tbl([tr([cell('X.1.1', 4680), cell('X.1.2', 4680)]),
      tr([cellP(p(r('X.2.1')) + inner('d') + p(), 4680),
        cell('X.2.2', 4680)])], {grid: [4680, 4680],
      tblPr: TG + AUTO + LOOK}),
    cap('Table 5: three levels, authored, each cell holding the next'),
    tbl([tr([cellP(p(r('L1')) + tbl([tr([cellP(p(r('L2')) + tbl([tr([
      cell('L3', 2000)])], {grid: [2000], tblPr: TG + AUTO + LOOK}) +
      p(), 4000)])], {grid: [4000], tblPr: TG + AUTO + LOOK}) + p(),
    9360)])], {grid: [9360], tblPr: TG + AUTO + LOOK}),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  must('nest', insertTable(d, cellCar(d, tix(d, 'P.1.1'), 0, 0),
    {cols: 2, rows: 2}));
  must('nest2', insertTable(d, cellsSel(d, tix(d, 'Q.1.1'), 0, 0, 0, 1),
    {cols: 2, rows: 2}));
  await save('tb-7-nested.docx', d);
  const e = await open(await docx(body));
  const last = (n) => {
    const t = allTables(e)[n].t, i = t.rows.length - 1;
    return cellEnd(e, n, i, t.rows[i].cells.length - 1);
  };
  must('tab', tabRowCmd(e, last(tix(e, 'm.1.1'))));
  must('delrow', deleteRowsCmd(e, cellCar(e, tix(e, 'X.1.1'), 1, 0)));
  await save('tb-7b-nested-edits.docx', e);
}

export async function makeB() {
  await bordersFile();
  await stylesFile();
  await compatFiles();
  await nested();
}
