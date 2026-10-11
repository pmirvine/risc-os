// Shared helpers of the Batch C (tables) real-Word hand-off generator
// handoff-tables.mjs (not a test; local only: the folder it writes is
// git-ignored): where the files go, `put` (writes only changed bytes),
// `save` (lint, read back, check every block, list the tables !Word
// wrote), fixtures for tables as XML (documents with styles and the
// compatibility mode), and the selection helpers the commands need.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {forEachBlock} from '../../tools/moreapps/!Word/Walk';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as S from '../../tools/moreapps/!Word/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, TABLE_NORMAL, TABLE_GRID}
  from './tbl-fixtures.mjs';
import {tm} from './word-docs.mjs';

export {tbl, tr, tc, tblDocx, p, r, S, TABLE_NORMAL, TABLE_GRID};

export const OUT = fileURLToPath(new URL('./corpus/handoff/',
  import.meta.url));
export const DATE = new Date(Date.UTC(2026, 9, 10, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
export function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

// ------------------------------------------------------ fixtures
const NORMAL = '<w:style w:type="paragraph" w:default="1" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>';
export const STYLES = NORMAL + TABLE_NORMAL + TABLE_GRID;
export const compat = (n) => '<w:compat><w:compatSetting ' +
  'w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/' +
  `office/word" w:val="${n}"/></w:compat>`;
/** A caption paragraph (bold, kept with the table below it). */
export const cap = (t) => p(r(t, '<w:b/>'), '<w:keepNext/>');
export const W = (w) => `<w:tcW w:w="${w}" w:type="dxa"/>`;
/** A cell holding text; w a dxa width (0: none); extra after tcW. */
export const cell = (text, w = 0, extra = '') => tc(p(r(text)),
  {tcPr: (w ? W(w) : '') + extra});
/** A cell of paragraphs (xml). */
export const cellP = (paras, w = 0, extra = '') => tc(paras,
  {tcPr: (w ? W(w) : '') + extra});
export const LOOK = '<w:tblLook w:val="04A0" w:firstRow="1" ' +
  'w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" ' +
  'w:noVBand="1"/>';
/** A rows x cols table (Table Grid), cells `label.i.j`, w per column. */
export function gridTbl(label, rows, cols, {w = 2000, tblPr, rowPr =
  () => '', cellPr = () => '', grid, text} = {}) {
  const ws = Array.isArray(w) ? w : Array(cols).fill(w);
  return tbl(Array.from({length: rows}, (_, i) => tr(Array.from(
    {length: cols}, (_, j) => cell(text ? text(i, j) : `${label}.${i + 1}.${j + 1}`,
      ws[j], cellPr(i, j))), {trPr: rowPr(i)})), {grid: grid || ws,
    tblPr: tblPr === undefined ? '<w:tblStyle w:val="TableGrid"/>' +
      '<w:tblW w:w="0" w:type="auto"/>' + LOOK : tblPr});
}
export const ONE = (n, sz = 4, color = 'auto', val = 'single') =>
  `<w:${n} w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/>`;

/** A .docx of body (styles Normal, Table Normal, Table Grid + more). */
export const docx = (body, {more = '', settings, strict} = {}) =>
  tblDocx(body, {styles: STYLES + more, settings, strict});

export const open = async (bytes) => new Document(await readDocx(bytes));

// ------------------------------------------------------ selections
export function para(d, text) {
  let out = null;
  forEachBlock(d.doc, (b) => {
    if (out === null && b.type === 'p' && b.text === text) out = b;
    return out === null;
  });
  if (!out) throw new Error('no paragraph ' + JSON.stringify(text));
  return out;
}
export const car = (d, text, off = 0) => S.caret({id: para(d, text).id,
  off});
export const end = (d, text) => car(d, text, para(d, text).text.length);
/** From the start of paragraph a to the end of paragraph b. */
export const sel = (d, a, b) => S.select({id: para(d, a).id, off: 0},
  {id: para(d, b).id, off: para(d, b).text.length});
/** The tables of d in document order, every depth: [{t, depth}]. */
export function tables(blocks, depth = 0, out = []) {
  for (const b of blocks) {
    if (b.type !== 'tbl') continue;
    out.push({t: b, depth});
    for (const row of b.rows) {
      for (const c of row.cells) tables(c.blocks, depth + 1, out);
    }
  }
  return out;
}
export const allTables = (d) => d.doc.sections.flatMap((s) =>
  tables(s.blocks));
/** Index (document order, every depth) of the table whose first cell
 *  holds the paragraph `label`. */
export function tix(d, label) {
  const k = allTables(d).findIndex((x) => (x.t.rows[0].cells[0]
    .blocks[0].text || '').replace(/\uFFFC/g, '') === label);
  if (k < 0) throw new Error('no table starting ' + label);
  return k;
}
/** The paragraph of cell (i, j) of the n-th table of d (0-based). */
export const cellPara = (d, n, i, j) => allTables(d)[n].t.rows[i]
  .cells[j].blocks[0];
export const cellCar = (d, n, i, j, off = 0) => S.caret({
  id: cellPara(d, n, i, j).id, off});
export const cellEnd = (d, n, i, j) => cellCar(d, n, i, j,
  cellPara(d, n, i, j).text.length);
/** Cells (i0, j0) to (i1, j1) of the n-th table selected. */
export const cellsSel = (d, n, i0, j0, i1, j1) => S.select(
  {id: cellPara(d, n, i0, j0).id, off: 0},
  {id: cellPara(d, n, i1, j1).id, off: 0});
/** A layout of d at 800 px (what the view would have). */
export function laid(d) {
  const L = new DocLayout(d.doc, tm());
  L.layout(800);
  return L;
}
/** Type text at sel (one Typing per document). */
export const typer = (d) => {
  const t = new Typing(d, {now: () => 0});
  return (sel, text) => {
    const out = t.type(sel, text);
    t.reset();
    return out;
  };
};
/** Type `label.i.j` in every cell of the n-th table (top left first). */
export function fill(d, type, n, label) {
  const t = allTables(d)[n].t;
  t.rows.forEach((row, i) => row.cells.forEach((c, j) => {
    type(cellCar(d, n, i, j), `${label}.${i + 1}.${j + 1}`);
  }));
}
/** Run a command that must not be refused. */
export function must(what, out) {
  if (!out) throw new Error(what + ' was refused');
  return out;
}

// ------------------------------------------------------ saving
const abbrev = (a) => (a.length > 8 ? a.slice(0, 7).join('/') + '/...(' +
  a.length + ')' : a.join('/'));
/** One line per table: size, style, width, merges, grid. */
export function describe(t, depth) {
  const cells = t.rows.flatMap((row) => row.cells);
  const pr = (c) => c.tcPr || {};
  const spans = cells.filter((c) => pr(c).gridSpan > 1).length;
  const merges = cells.filter((c) => pr(c).vMerge === 'restart').length;
  const w = t.tblPr && t.tblPr.tblW;
  return `${'  '.repeat(depth)}[${t.rows.length} x ${t.grid.length}]` +
    ` style ${(t.tblPr && t.tblPr.tblStyle) || '-'}, tblW ` +
    (w ? `${w.w} ${w.type}` : '-') + `, grid ${abbrev(t.grid)}` +
    (spans ? `, ${spans} gridSpan` : '') +
    (merges ? `, ${merges} vMerge` : '');
}
const words = (d) => {
  let n = 0;
  forEachBlock(d.doc, (b) => {
    if (b.type === 'p') n += b.text.split(/\s+/).filter(Boolean).length;
    return true;
  });
  return n;
};

/** Every file written: name -> the lines of what !Word wrote. */
export const wrote = new Map();

/** Save d as name; read back; every block checked; lines for README. */
export async function save(name, d, {opaque = false} = {}) {
  const bytes = await writeDocx(d.doc, {date: DATE});
  return finish(name, bytes, {opaque});
}
export async function finish(name, bytes, {opaque = false} = {}) {
  const errs = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (errs.length) throw new Error(name + ': ' + JSON.stringify(errs));
  const back = await open(bytes);
  let kept = 0;
  forEachBlock(back.doc, (b) => {
    checkBlock(b);
    if (b.type === 'opaque' && b.node && b.node.name === 'w:tbl') kept++;
    return true;
  });
  if (kept && !opaque) throw new Error(name + ': ' + kept +
    ' table(s) read back as Opaque');
  console.log(name + ': ' + put(name, bytes));
  const ts = allTables(back);
  let top = -1;
  const lines = ts.slice(0, 30).map((x) => (x.depth ? '      nested ' :
    `    Table ${++top}: `) + describe(x.t, 0));
  if (ts.length > 30) lines.push(`    ... and ${ts.length - 30} more`);
  if (kept) lines.push(`    ${kept} table(s) kept as the file had them`);
  lines.push(`    ${ts.length} table(s), ${words(back)} words`);
  wrote.set(name, lines);
  return back;
}

/** The bookmark marks of a written file, with where each one sits:
 *  ['name start: table 1 row 2 cell 1', ...] (between rows or cells
 *  where the mark is a child of w:tbl or w:tr). */
export async function marks(bytes) {
  const zip = await readZip(bytes);
  const xml = new TextDecoder().decode(zip.get('word/document.xml'));
  const out = [], stack = [];
  const top = {kids: {tbl: 0, tr: 0, tc: 0}};
  const re = /<(\/?)w:(tbl|tr|tc|bookmarkStart|bookmarkEnd)\b([^>]*?)(\/?)>/g;
  const names = new Map();
  for (let m; (m = re.exec(xml));) {
    const [, close, tag, attrs, self] = m;
    if (tag === 'bookmarkStart' || tag === 'bookmarkEnd') {
      const id = /w:id="(\d+)"/.exec(attrs)[1];
      const name = /w:name="([^"]*)"/.exec(attrs);
      if (name) names.set(id, name[1]);
      const where = stack.map((s) => `${s.tag === 'tbl' ? 'table' :
        s.tag === 'tr' ? 'row' : 'cell'} ${s.n}`).join(' ') ||
        'outside tables';
      const last = stack[stack.length - 1];
      out.push({id, start: tag === 'bookmarkStart', where: where +
        (last && last.tag === 'tbl' ? ' (between rows)' : last &&
          last.tag === 'tr' ? ' (between cells)' : '')});
    } else if (close) stack.pop();
    else if (!self) {
      const parent = stack[stack.length - 1] || top;
      stack.push({tag, n: ++parent.kids[tag],
        kids: {tbl: 0, tr: 0, tc: 0}});
    }
  }
  return out.map((x) => `${names.get(x.id) || 'id ' + x.id} ` +
    `${x.start ? 'starts' : 'ends'}: ${x.where}`);
}
