// Hand-off files tb-8 to tb-14 (see handoff-tables.mjs): tables pasted
// across documents, converted, in a Strict document, with bookmarks,
// hostile but valid, floating / bidi, and Word-made tables read and
// written untouched.
import fs from 'node:fs';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {insert as insertPicture}
  from '../../tools/moreapps/!Letters/InsertPicture';
import {insertRowsCmd, deleteRowsCmd, mergeCmd}
  from '../../tools/moreapps/!Letters/TblCmd';
import {deleteColsCmd, deleteTableCmd}
  from '../../tools/moreapps/!Letters/TblCmdCols';
import {textToTableCmd, tableToTextCmd, whyText}
  from '../../tools/moreapps/!Letters/TblConvertCmd';
import {collapsed} from '../../tools/moreapps/!Letters/Selection';
import {buildDocx, documentXml, stylesXml, numberingXml, STRICT_W_NS,
  STRICT_R_NS} from './build-docx.mjs';
import {NUMBERING, item} from './list-fixtures.mjs';
import {copyPaste} from './clip-lists-docs.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {GRID_TABLE_4, nestedTable} from './tbl-fixtures.mjs';
import {tbl, tr, tc, p, r, docx, open, cap, cell, cellP, W, ONE, gridTbl,
  LOOK, STYLES, car, para, sel, end, cellCar, cellEnd, cellsSel, tix,
  allTables, typer, must, save, finish, marks, wrote, DATE, S}
  from './handoff-tables-lib.mjs';
import {corpusFiles, pickTables} from './handoff-tables-corpus.mjs';
import {notes, props} from './handoff-tables-a.mjs';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';

const TG = '<w:tblStyle w:val="TableGrid"/>';
const AUTO = '<w:tblW w:w="0" w:type="auto"/>';
const vm = (k, n) => (k === 0 ? '<w:vMerge w:val="restart"/>'
  : k <= n ? '<w:vMerge/>' : '');
const bs = (n, name) => `<w:bookmarkStart w:id="${n}" w:name="${name}"/>`;
const be = (n) => `<w:bookmarkEnd w:id="${n}"/>`;
const A4 = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ' +
  'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
  'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';

// ------------------------------------------------------ tb-8
async function source() {
  const parts = {'word/document.xml': documentXml([
    cap('Source table A: a numbered list in a cell, bold text, a ' +
      'picture and a bookmark (Grid Table 4)'),
    tbl([tr([cellP(item('List one', 2) + item('List two', 2), 3120),
      cellP(p(r('Bold cell', '<w:b/>')), 3120), cell('A.1.3', 3120)]),
    tr([cell('A.2.1', 3120), cellP(p(bs(1, 'inCell') + r('bookmarked') +
      be(1)), 3120), cellP(p(r('Picture: ')), 3120)]),
    tr([cell('A.3.1', 3120), cell('A.3.2', 3120), cell('A.3.3', 3120)])],
    {grid: [3120, 3120, 3120], tblPr: '<w:tblStyle w:val=' +
      '"GridTable4"/>' + AUTO + LOOK}),
    cap('Source table B: 2 x 2, shaded second row'),
    tbl([tr([cell('B.1.1', 2000), cell('B.1.2', 2000)]),
      tr([cell('B.2.1', 2000, '<w:shd w:val="clear" w:color="auto" ' +
        'w:fill="D9D9D9"/>'), cell('B.2.2', 2000, '<w:shd w:val=' +
        '"clear" w:color="auto" w:fill="D9D9D9"/>')])],
    {grid: [2000, 2000], tblPr: TG + AUTO + LOOK}),
    cap('Source table C: a cell spanning two columns and a vertical ' +
      'merge'),
    tbl([tr([cell('C.1.1', 4000, '<w:gridSpan w:val="2"/>'),
      cell('C.1.3', 2000)]), tr([cell('C.2.1', 2000, vm(0, 1)),
      cell('C.2.2', 2000), cell('C.2.3', 2000)]),
    tr([cellP(p(), 2000, vm(1, 1)), cell('C.3.2', 2000),
      cell('C.3.3', 2000)])], {grid: [2000, 2000, 2000],
      tblPr: TG + AUTO + LOOK}),
    cap('Source table D: a content control in a cell (TBC6o)'),
    tbl([tr([cellP('<w:sdt><w:sdtPr><w:alias w:val="Pick"/><w:id ' +
      'w:val="1234"/><w:text/></w:sdtPr><w:sdtContent>' +
      p(r('inside the content control')) + '</w:sdtContent></w:sdt>' +
      p(r('after it')), 4680), cell('D.1.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    p(r('End of the source.'))].join('') + A4),
  'word/styles.xml': stylesXml(STYLES + GRID_TABLE_4 +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name ' +
    'w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind ' +
    'w:left="720"/></w:pPr></w:style>'),
  'word/numbering.xml': NUMBERING};
  const src = await open(await buildDocx(parts));
  const at = cellEnd(src, 0, 1, 2);
  must('picture', insertPicture(src, at, {bytes: pngBytes(96, 48,
    {rgb: [200, 40, 40]})}));
  await save('tb-8-source.docx', src);
  return src;
}

const paste = (src, n, dst, at) => {
  const t = allTables(src)[n].t;
  const sel0 = cellsSel(src, n, 0, 0, t.rows.length - 1,
    t.rows[0].cells.length - 1);
  return must('paste', copyPaste(src, sel0, dst, at));
};

async function pasted(src) {
  const body = [
    cap('Target 1: table A pasted into this empty paragraph:'), p(),
    cap('Target 2: table B pasted into the cell marked here (a nested ' +
      'table)'),
    gridTbl('T', 2, 2, {w: 4680}),
    cap('Target 3: table B pasted over the 2 x 2 cells at the top ' +
      'left (Overwrite cells; TBC6a)'),
    gridTbl('O', 3, 3, {w: 3120, cellPr: (i, j) => (i === 1 && j === 1
      ? '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>' : '')}),
    cap('Target 4: table C pasted at the start of the paragraph just ' +
      'below this table (no gap: TBC6e)'),
    gridTbl('U', 2, 2, {w: 4680}),
    p(r('Paragraph below the table U.')),
    cap('Target 5: table B pasted into the innermost of 8 nested ' +
      'tables (TBC6c)'),
    nestedTable(8),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  paste(src, 0, d, car(d, ''));
  paste(src, tix(src, 'B.1.1'), d, cellCar(d, tix(d, 'T.1.1'), 0, 1));
  paste(src, tix(src, 'B.1.1'), d, cellsSel(d, tix(d, 'O.1.1'), 0, 0, 1,
    1));
  paste(src, tix(src, 'C.1.1'), d, car(d, 'Paragraph below the ' +
    'table U.'));
  paste(src, tix(src, 'B.1.1'), d, car(d, 'L8'));
  await save('tb-8-pasted.docx', d);

  // a table style of another definition under the same id (TBC6d)
  const clash = await open(await docx(cap('Target: this document ' +
    'already has a different "GridTable4" (named Mine). Table A is ' +
    'pasted here:') + p(), {more: '<w:style w:type="table" w:styleId="' +
    'GridTable4"><w:name w:val="Mine"/><w:basedOn w:val="TableNormal"/>' +
    '<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="24" w:space=' +
    '"0" w:color="FF0000"/></w:tblBorders></w:tblPr></w:style>'}));
  paste(src, 0, clash, car(clash, ''));
  await save('tb-8b-style-clash.docx', clash);

  // the content control table (TBC6o)
  const sdt = await open(await docx(cap('Target: table D (a content ' +
    'control in its first cell) pasted here:') + p()));
  const D = allTables(src)[3].t.rows[0].cells;
  must('paste sdt', copyPaste(src, S.select({id: D[0].blocks[1].id,
    off: 0}, {id: D[1].blocks[0].id, off: 0}), sdt, car(sdt, '')));
  await save('tb-8c-content-control.docx', sdt);
}

// ------------------------------------------------------ tb-9
/** A paragraph of pieces joined by real tab characters (w:tab). */
const tabbed = (...parts) => p('<w:r>' + parts.map((x) => '<w:t xml:space' +
  `="preserve">${x}</w:t>`).join('<w:tab/>') + '</w:r>');
async function convert() {
  const lines = (id, ...ts) => ts.map((t) => p(r(`${id} ${t}`)));
  const fld = p('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r>' +
    '<w:instrText xml:space="preserve"> QUOTE "x" </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + r('F one,two') +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>');
  const body = [
    cap('Commas (TB16): three lines, converted by commas'),
    ...lines('C1', 'Name,Qty,Price', 'Apple,3,1.20', 'Pear,10,0.85'),
    cap('Tabs (TB16): three lines, converted by tabs'),
    tabbed('T1 Name', 'Qty', 'Price'), tabbed('T2 Apple', '3', '1.20'),
    tabbed('T3 Pear', '10', '0.85'),
    cap('Ragged (TBC6i): 3 columns asked for, one line has 5 pieces'),
    ...lines('R1', 'a,b,c', 'd,e,f,g,h', 'i,j'),
    cap('Paragraphs (TB16): each paragraph a row of one cell'),
    ...lines('P1', 'first', 'second', 'third'),
    cap('Numbered paragraphs (TBC6m): a short row pads with empty ' +
      'cells'),
    item('N1 x,y,z', 2), item('N2 u,v', 2), item('N3 w', 2),
    cap('A field the conversion would cut (TBC6j): refused; no table'),
    p(r('F0 before,')), fld,
    cap('Table to text (TB16): a cell with two paragraphs, by tabs'),
    tbl([tr([cellP(p(r('X.1.1 one')) + p(r('X.1.1 two')), 3120),
      cell('X.1.2', 3120), cell('X.1.3', 3120)]),
    tr([cell('X.2.1', 3120), cell('X.2.2', 3120), cell('X.2.3', 3120)])],
    {grid: [3120, 3120, 3120], tblPr: TG + AUTO + LOOK}),
    cap('Table to text with rows 2-3 selected (TBC6h): the whole ' +
      'table is converted, by commas'),
    gridTbl('Y', 3, 2, {w: 4680}),
    cap('Table to text of a table holding a nested table (TBC6k), by ' +
      'tabs'),
    tbl([tr([cellP(p(r('Z.1.1 outer')) + gridTbl('zn', 2, 2, {w: 2000}) +
      p(r('Z.1.1 after')), 4680), cell('Z.1.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table to text of a vertical merge whose hidden cell holds ' +
      'text (TBC6l), by tabs'),
    tbl([tr([cell('V.1.1', 4680, vm(0, 1)), cell('V.1.2', 4680)]),
      tr([cellP(p(r('V.2.1 hidden text')), 4680, vm(1, 1)),
        cell('V.2.2', 4680)])], {grid: [4680, 4680],
      tblPr: TG + AUTO + LOOK}),
    p(r('End.'))].join('');
  const d = await open(await docx(body, {more: '<w:style w:type=' +
    '"paragraph" w:styleId="ListParagraph"><w:name w:val="List ' +
    'Paragraph"/><w:basedOn w:val="Normal"/></w:style>'}));
  void NUMBERING;
  must('comma', textToTableCmd(d, sel(d, 'C1 Name,Qty,Price',
    'C1 Pear,10,0.85'), {sep: 'comma', cols: 3}));
  must('tab', textToTableCmd(d, sel(d, 'T1 Name\tQty\tPrice',
    'T3 Pear\t10\t0.85'), {sep: 'tab', cols: 3}));
  must('ragged', textToTableCmd(d, sel(d, 'R1 a,b,c', 'R1 i,j'),
    {sep: 'comma', cols: 3}));
  must('para', textToTableCmd(d, sel(d, 'P1 first', 'P1 third'),
    {sep: 'para', cols: 1}));
  const why = whyText(d.doc, sel(d, 'F0 before,', 'F0 before,'),
    {sep: 'comma', cols: 2});
  notes.set('tb-9-convert.docx', 'the field paragraph, asked for as ' +
    'text to table: ' + JSON.stringify(why));
  const tbls = (k) => cellCar(d, tix(d, k), 0, 0);
  must('totext', tableToTextCmd(d, tbls('X.1.1 one'), {sep: 'tab'}));
  must('rows', tableToTextCmd(d, cellsSel(d, tix(d, 'Y.1.1'), 1, 0, 2,
    1), {sep: 'comma'}));
  must('nested', tableToTextCmd(d, cellCar(d, tix(d, 'Z.1.1 outer'), 0,
    0), {sep: 'tab'}));
  must('vmerge', tableToTextCmd(d, tbls('V.1.1'), {sep: 'tab'}));
  void collapsed;
  must('list', textToTableCmd(d, sel(d, 'N1 x,y,z', 'N3 w'),
    {sep: 'comma', cols: 3}));
  await save('tb-9-convert.docx', d);
}

// ------------------------------------------------------ tb-10
const SPOS = (n, v) => `<w:${n} w:val="${v}"/>`;
async function strict(src) {
  const sbd = (side, c) => `<w:${side} w:val="single" w:sz="12" ` +
    `w:space="0" w:color="${c}"/>`;
  const STRICT_LOOK = '<w:tblLook w:firstRow="1" w:lastRow="0" w:' +
    'firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
  const body = [
    cap('A Strict document. Table 0: authored with start / end ' +
      'spellings, cells 1-2 merged by !Letters'),
    tbl([tr([cell('S.1.1', 3120, '<w:tcBorders>' + sbd('start',
      'FF0000') + sbd('end', '0000FF') + '</w:tcBorders>'),
    cell('S.1.2', 3120), cell('S.1.3', 3120)]), tr([1, 2, 3].map((j) =>
      cell(`S.2.${j}`, 3120)))], {grid: [3120, 3120, 3120],
      tblPr: '<w:tblW w:w="0" w:type="auto"/>' + SPOS('jc', 'center') +
      '<w:tblInd w:w="0" w:type="dxa"/>' + '<w:tblBorders>' +
      sbd('top', '000000') + sbd('start', '000000') + sbd('bottom',
        '000000') + sbd('end', '000000') + '</w:tblBorders>' +
      STRICT_LOOK}),
    cap('Table 1: Insert > Table 3 x 3 (Table Grid added by !Letters):'),
    cap('Table 2: a Transitional table (Source table A) pasted here:'),
    p(), p(r('End.'))].join('');
  const ns = {ns: STRICT_W_NS, rNs: STRICT_R_NS};
  const bytes = await buildDocx({'word/document.xml': documentXml(body +
    A4, ns), 'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
    'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal">' +
    '<w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type=' +
    '"dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:start w:w=' +
    '"108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:end w:w=' +
    '"108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>',
    {ns: STRICT_W_NS})}, {strict: true});
  const d = await open(bytes);
  must('merge', mergeCmd(d, cellsSel(d, 0, 1, 0, 1, 1)));
  must('insert', insertTable(d, end(d, 'Table 1: Insert > Table 3 x ' +
    '3 (Table Grid added by !Letters):'), {cols: 3, rows: 3}));
  const T2 = 'Table 2: a Transitional table (Source table A) pasted ' +
    'here:';
  must('paste', copyPaste(src, cellsSel(src, 0, 0, 0, 2, 2), d,
    end(d, T2)));
  // widths and borders by !Letters' own Table properties / Borders
  props(d, cellCar(d, 0, 0, 0), {colWidth: 2000, indent: 360});
  await save('tb-10-strict.docx', d);
}

// ------------------------------------------------------ tb-11
async function bookmarks() {
  const g = (label, rows, cols, o = {}) => gridTbl(label, rows, cols,
    {w: 4680 / (cols / 2), ...o});
  const body = [
    cap('Table 0: a bookmark "rows" starts between row 1 and 2 and ' +
      'ends between rows 3 and 4; row 2 is deleted (TB26, TBC4c)'),
    tbl([tr([cell('R.1.1', 4680), cell('R.1.2', 4680)]),
      tr([cell('R.2.1', 4680), cell('R.2.2', 4680)],
        {lead: bs(1, 'rows')}), tr([cell('R.3.1', 4680),
        cell('R.3.2', 4680)]), tr([cell('R.4.1', 4680),
        cell('R.4.2', 4680)], {lead: be(1)})], {grid: [4680, 4680],
      tblPr: TG + AUTO + LOOK}),
    cap('Table 1: a bookmark "col" from cell 1.1 to cell 2.2; column ' +
      '1 is deleted (TBC4c)'),
    tbl([tr([cellP(p(bs(2, 'col') + r('C.1.1')), 3120),
      cell('C.1.2', 3120), cell('C.1.3', 3120)]),
    tr([cell('C.2.1', 3120), cellP(p(r('C.2.2') + be(2)), 3120),
      cell('C.2.3', 3120)])], {grid: [3120, 3120, 3120],
      tblPr: TG + AUTO + LOOK}),
    cap('Table 2: a bookmark "span" from cell 1.2 to 1.3; cells 1.1 ' +
      'to 1.3 are merged (TBC4f)'),
    tbl([tr([cellP(p(r('M.1.1')), 3120), cellP(p(bs(3, 'span') +
      r('M.1.2')), 3120), cellP(p(r('M.1.3') + be(3)), 3120)]),
    tr([1, 2, 3].map((j) => cell(`M.2.${j}`, 3120)))],
    {grid: [3120, 3120, 3120], tblPr: TG + AUTO + LOOK}),
    cap('Table 3: a bookmark "out" starts in this paragraph and ends ' +
      'in the table; the whole table is deleted (TB26)'),
    p(bs(4, 'out') + r('Start of "out" is here')),
    tbl([tr([cellP(p(r('W.1.1') + be(4)), 4680), cell('W.1.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    cap('Table 4: a bookmark "in" lies wholly inside row 1; row 1 is ' +
      'deleted'),
    tbl([tr([cellP(p(bs(5, 'in') + r('I.1.1')), 4680),
      cellP(p(r('I.1.2') + be(5)), 4680)]), tr([cell('I.2.1', 4680),
      cell('I.2.2', 4680)])], {grid: [4680, 4680],
      tblPr: TG + AUTO + LOOK}),
    cap('Table 5: a bookmark "ver" over a vertical merge, from the ' +
      'restart cell to the cell beside the last row; a row is ' +
      'inserted inside the merge'),
    tbl([0, 1, 2].map((i) => tr([tc(p(i === 0 ? bs(6, 'ver') + r('V.1.1')
      : i === 1 ? r('') : ''), {tcPr: W(4680) + vm(i, 2)}),
    cellP(p(r(`V.${i + 1}.2`) + (i === 2 ? be(6) : '')), 4680)])),
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    p(r('End.'))].join('');
  void g;
  const d = await open(await docx(body));
  must('delrow', deleteRowsCmd(d, cellCar(d, tix(d, 'R.1.1'), 1, 0)));
  must('delcol', deleteColsCmd(d, cellCar(d, tix(d, 'C.1.1'), 0, 0)));
  must('merge', mergeCmd(d, cellsSel(d, tix(d, 'M.1.1'), 0, 0, 0, 2)));
  must('deltbl', deleteTableCmd(d, cellCar(d, tix(d, 'W.1.1'), 0, 0)));
  must('delin', deleteRowsCmd(d, cellCar(d, tix(d, 'I.1.1'), 0, 0)));
  must('insert', insertRowsCmd(d, cellCar(d, tix(d, 'V.1.1'), 0, 1),
    true));
  const back = await save('tb-11-bookmarks.docx', d);
  void back;
  const lines = await marks(await writeDocx(d.doc, {date: DATE}));
  wrote.get('tb-11-bookmarks.docx').unshift('    bookmark marks as ' +
    'written:', ...lines.map((x) => '      ' + x));
}

// ------------------------------------------------------ tb-12
async function hostile() {
  const body = [
    cap('63 columns x 5 rows (the most columns !Letters makes)'),
    gridTbl('W', 5, 63, {w: 140, text: (i, j) => (j % 9 === 0 ?
      `${i + 1}/${j + 1}` : 'x')}),
    cap('100 rows x 3 columns'),
    gridTbl('H', 100, 3, {w: 3120}),
    cap('Nested 8 deep (the deepest !Letters shows as tables)'),
    nestedTable(8),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  await save('tb-12-hostile-but-valid.docx', d);
}

// ------------------------------------------------------ tb-14
async function special() {
  const FLOAT = '<w:tblpPr w:leftFromText="180" w:rightFromText="180" ' +
    'w:vertAnchor="text" w:horzAnchor="margin" w:tblpX="2000" ' +
    'w:tblpY="200"/><w:tblOverlap w:val="never"/>';
  const body = [
    cap('Table 0: a floating table (tblpPr: 1.4 in from the margin, ' +
      '0.14 in below this line); text typed in it, a row inserted ' +
      '(TB20)'),
    p(r('Text that wraps round the floating table. '.repeat(12))),
    tbl([tr([cell('F.1.1', 2400), cell('F.1.2', 2400)]),
      tr([cell('F.2.1', 2400), cell('F.2.2', 2400)])],
    {grid: [2400, 2400], tblPr: TG + FLOAT + AUTO + LOOK}),
    p(r('Text after the floating table.')),
    cap('Table 1: bidiVisual, and a cell with text direction btLr ' +
      '(TB21)'),
    tbl([tr([cell('B.1.1', 3120), cell('B.1.2', 3120, '<w:textDirection ' +
      'w:val="btLr"/>'), cell('B.1.3', 3120)]), tr([1, 2, 3].map((j) =>
      cell(`B.2.${j}`, 3120)))], {grid: [3120, 3120, 3120],
      tblPr: TG + '<w:bidiVisual/>' + AUTO + LOOK}),
    cap('Table 2: row 2 with exceptions (tblPrEx: a thick red box ' +
      'and cell spacing); text typed in it (TB23)'),
    tbl([tr([cell('E.1.1', 4680), cell('E.1.2', 4680)]),
      tr(['<w:tblPrEx><w:tblCellSpacing w:w="60" w:type="dxa"/>' +
        '<w:tblBorders>' + ['top', 'left', 'bottom', 'right'].map(
          (n) => ONE(n, 24, 'FF0000')).join('') + '</w:tblBorders>' +
        '</w:tblPrEx>', cell('E.2.1', 4680), cell('E.2.2', 4680)])],
    {grid: [4680, 4680], tblPr: TG + AUTO + LOOK}),
    p(r('End.'))].join('');
  const d = await open(await docx(body));
  const ty = typer(d);
  ty(cellEnd(d, 0, 0, 0), ' (typed)');
  must('row', insertRowsCmd(d, cellCar(d, 0, 1, 0), true));
  ty(cellEnd(d, 1, 1, 0), ' (typed)');
  ty(cellEnd(d, 2, 1, 1), ' (typed)');
  await save('tb-14-floating-bidi.docx', d);
}

// ------------------------------------------------------ tb-13
async function roundtrip() {
  const picks = await pickTables();
  for (const kind of ['merged', 'nested', 'styled']) {
    const name = `tb-13-roundtrip-${kind}.docx`;
    if (!picks[kind]) {
      notes.set(name, 'skipped: the corpus is absent');
      continue;
    }
    const bytes = new Uint8Array(fs.readFileSync(picks[kind]));
    const d = await open(bytes);
    notes.set(name, 'from the corpus file ' + picks[kind].replace(
      /.*\/corpus\//, '') + ', read and written, not edited');
    await save(name, d, {opaque: true});
  }
  void corpusFiles;
}

export async function makeC() {
  const src = await source();
  await pasted(src);
  await convert();
  await strict(src);
  await bookmarks();
  await hostile();
  await special();
  await roundtrip();
  void S; void finish; void para;
}
