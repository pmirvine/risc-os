// Table fixtures for the Batch C tests: XML builders for w:tbl /
// w:tr / w:tc, whole .docx files holding them, and typed Table models
// built with Model.newTable for op tests.
import {buildDocx, documentXml, stylesXml, settingsXml, p, r,
  STRICT_W_NS, STRICT_R_NS, W_NS} from './build-docx.mjs';
import {existsSync, readdirSync, statSync, readFileSync} from 'node:fs';
import {join as joinPath} from 'node:path';
import {xmlEntries, entryText} from './docx-compare.mjs';
import {newPara, newTable, newRow, newCell}
  from '../../tools/moreapps/!Word/Model';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const join = (x) => (Array.isArray(x) ? x.join('') : x);

/** The number of w:tc directly in a w:tr string (nested ones not). */
function topCells(row) {
  let depth = 0, n = 0;
  const re = /<(\/?)w:(tbl|tc)[\s>/]/g;
  for (let m; (m = re.exec(row));) {
    if (m[2] === 'tbl') depth += m[1] ? -1 : 1;
    else if (!m[1] && depth === 0) n++;
  }
  return n;
}

/**
 * A w:tbl: rows are w:tr strings (tr()). grid defaults to 2000 twips
 * per column, as many columns as the widest row has cells.
 */
export function tbl(rows, {tblPr = '', grid, tblAttrs = ''} = {}) {
  const g = grid || Array(Math.max(1, ...rows.map(topCells)))
    .fill(2000);
  return `<w:tbl${tblAttrs}><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>` +
    g.map((w) => `<w:gridCol w:w="${w}"/>`).join('') +
    `</w:tblGrid>${rows.join('')}</w:tbl>`;
}

/** A w:tr; `lead` goes before it (in w:tbl), `tail` after its cells. */
export const tr = (cells, {trPr = '', attrs = '', lead = '',
  tail = ''} = {}) => `${lead}<w:tr${attrs}>` +
  (trPr ? `<w:trPr>${trPr}</w:trPr>` : '') + join(cells) +
  `${tail}</w:tr>`;

/** A w:tc of blocks (strings); `lead` goes before it (in w:tr). */
export const tc = (blocks = p(), {tcPr = '', lead = ''} = {}) =>
  `${lead}<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}` +
  `${join(blocks)}</w:tc>`;

/** A table without w:tblGrid: it stays an Opaque block. */
export const TBL_OPAQUE = '<w:tbl><w:tr><w:tc>' + p(r('cell')) +
  '</w:tc></w:tr></w:tbl>';

/** A .docx whose body is `body` (with optional styles / settings). */
export function tblDocx(body, {styles, settings, strict} = {}) {
  const ns = strict ? STRICT_W_NS : W_NS;
  const parts = {'word/document.xml': documentXml(body, strict ?
    {ns, rNs: STRICT_R_NS} : {})};
  if (styles !== undefined) {
    parts['word/styles.xml'] = stylesXml(styles, {ns});
  }
  if (settings !== undefined) {
    parts['word/settings.xml'] = settingsXml(settings, {ns});
  }
  return buildDocx(parts, {strict});
}

/** A rows x cols table, cell text `r<i>c<j>`. */
export const bigTable = (rows, cols) => tbl(
  Array.from({length: rows}, (_, i) => tr(Array.from({length: cols},
    (_, j) => tc(p(r(`r${i}c${j}`)))))));

/** `depth` tables, each a 1x1 holding `L<d>`, the next one, a p. */
export function nestedTable(depth) {
  let inner = '';
  for (let d = depth; d >= 1; d--) {
    inner = tbl([tr([tc(p(r('L' + d)) + (inner ? inner + p() : ''))])]);
  }
  return inner;
}

const blockOf = (x) => (typeof x === 'string' ? newPara(x) : x);

/**
 * A typed Table (Model.newTable). spec: rows of cells; a cell is a
 * string (one paragraph), an array of strings / blocks, or
 * {blocks, tcPr}. grid defaults to 2000 per column of the widest row.
 */
export function modelTable(spec, {grid, tblPr} = {}) {
  const rows = spec.map((cells) => newRow(cells.map((c) => {
    if (typeof c === 'string') return newCell([newPara(c)]);
    if (Array.isArray(c)) return newCell(c.map(blockOf));
    return newCell(c.blocks.map(blockOf), c.tcPr);
  })));
  const g = grid || Array(Math.max(...spec.map((x) => x.length)))
    .fill(2000);
  return newTable({grid: g, rows, tblPr});
}

/** Deep Object.freeze (objects and arrays), without recursion. */
export function freeze(x) {
  const stack = [x], seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v !== 'object' || seen.has(v)) continue;
    seen.add(v);
    Object.freeze(v);
    for (const k of Object.keys(v)) stack.push(v[k]);
  }
  return x;
}

/** The w:tbl elements of the written main part's w:body. */
export async function tableXml(doc) {
  const bytes = await writeDocx(doc, {date: DATE});
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  const isEl = (c) => c && typeof c === 'object' && c.name;
  const body = root.children.find((c) => isEl(c) && c.name === 'w:body');
  return body.children.filter((c) => isEl(c) && c.name === 'w:tbl');
}

/**
 * bytes read with each top-level typed table as the Opaque block of
 * its very w:tbl element: the model the reader gave before tables
 * typed (Batch C1.7), for tests that compare the two.
 */
export async function readOpaque(bytes) {
  const doc = await readDocx(bytes);
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  const isEl = (c) => c && typeof c === 'object' && c.name;
  const body = root.children.find((c) => isEl(c) && c.name === 'w:body');
  const tbls = body.children.filter((c) => isEl(c) && c.name === 'w:tbl');
  let k = 0;
  for (const s of doc.sections) {
    s.blocks = s.blocks.map((b) => {
      if (b.type === 'tbl') return {type: 'opaque', node: tbls[k++]};
      if (b.type === 'opaque' && b.node.name === 'w:tbl') k++;
      return b;
    });
  }
  return doc;
}

// ------------------------------------------------------ table styles
// Word's table styles as w:style XML (C2.2). TABLE_NORMAL and
// TABLE_GRID are Word's definitions exactly (as C4.4 adds them).
// GRID_TABLE_4 and LIST_TABLE_3 are Word's "Grid Table 4" and "List
// Table 3" in the shape Word writes them (as Grid Table 4 Accent 1
// in the corpus, poi/table-alignment.docx, with text1 for accent1):
// every colour carries its theme attributes (w:themeColor,
// w:themeTint, w:themeFill, w:themeFillTint) beside the literal
// colour, which is what the screen shows (./TblColor).
// styleFromCorpus(id) gives a definition as Word wrote it, from the
// corpus, when the corpus is present.

const SIDE = (n, val, sz, color, theme = '') =>
  `<w:${n} w:val="${val}" w:sz="${sz}" w:space="0" ` +
  `w:color="${color}"${theme}/>`;
const SIX = (val, sz, color, theme) => ['top', 'left', 'bottom',
  'right', 'insideH', 'insideV'].map((n) =>
  SIDE(n, val, sz, color, theme)).join('');
const FOUR = (val, sz, color, theme) => ['top', 'left', 'bottom',
  'right'].map((n) => SIDE(n, val, sz, color, theme)).join('');
const TEXT1 = ' w:themeColor="text1"';
const TINT99 = ' w:themeColor="text1" w:themeTint="99"';

export const TABLE_NORMAL = '<w:style w:type="table" w:default="1" ' +
  'w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
  '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>' +
  '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar>' +
  '<w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
  '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>' +
  '</w:tblCellMar></w:tblPr></w:style>';

export const TABLE_GRID = '<w:style w:type="table" ' +
  'w:styleId="TableGrid"><w:name w:val="Table Grid"/>' +
  '<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/>' +
  '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' +
  '</w:pPr><w:tblPr><w:tblBorders>' + SIX('single', 4, 'auto') +
  '</w:tblBorders></w:tblPr></w:style>';

const SHD = (fill, theme = '') =>
  `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"${theme}/>`;
const SHD_TEXT1 = SHD('000000', ' w:themeFill="text1"');
const SHD_BAND = SHD('CCCCCC',
  ' w:themeFill="text1" w:themeFillTint="33"');
const COND = (type, inner) =>
  `<w:tblStylePr w:type="${type}">${inner}</w:tblStylePr>`;
const BOLD = '<w:rPr><w:b/><w:bCs/></w:rPr>';
const HEAD = '<w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF" ' +
  'w:themeColor="background1"/></w:rPr>';
const BEGIN = (id, name, prio) => '<w:style w:type="table" ' +
  `w:styleId="${id}"><w:name w:val="${name}"/>` +
  `<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="${prio}"/>` +
  '<w:rsid w:val="00EF0E96"/>' +
  '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' +
  '</w:pPr><w:tblPr><w:tblStyleRowBandSize w:val="1"/>' +
  '<w:tblStyleColBandSize w:val="1"/><w:tblBorders>';

export const GRID_TABLE_4 = BEGIN('GridTable4', 'Grid Table 4', 49) +
  SIX('single', 4, '666666', TINT99) + '</w:tblBorders></w:tblPr>' +
  COND('firstRow', HEAD + '<w:tblPr/><w:tcPr><w:tcBorders>' +
    FOUR('single', 4, '000000', TEXT1) +
    '<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tcBorders>' +
    SHD_TEXT1 + '</w:tcPr>') +
  COND('lastRow', BOLD + '<w:tblPr/><w:tcPr><w:tcBorders>' +
    SIDE('top', 'double', 4, '000000', TEXT1) +
    '</w:tcBorders></w:tcPr>') +
  COND('firstCol', BOLD) + COND('lastCol', BOLD) +
  COND('band1Vert', '<w:tblPr/><w:tcPr>' + SHD_BAND + '</w:tcPr>') +
  COND('band1Horz', '<w:tblPr/><w:tcPr>' + SHD_BAND + '</w:tcPr>') +
  '</w:style>';

export const LIST_TABLE_3 = BEGIN('ListTable3', 'List Table 3', 48) +
  FOUR('single', 4, '000000', TEXT1) + '</w:tblBorders></w:tblPr>' +
  COND('firstRow', HEAD + '<w:tblPr/><w:tcPr>' + SHD_TEXT1 +
    '</w:tcPr>') +
  COND('lastRow', BOLD + '<w:tblPr/><w:tcPr><w:tcBorders>' +
    SIDE('top', 'double', 4, '000000', TEXT1) +
    '</w:tcBorders></w:tcPr>') +
  COND('firstCol', BOLD) + COND('lastCol', BOLD) +
  COND('band1Vert', '<w:tblPr/><w:tcPr><w:tcBorders>' +
    SIDE('left', 'single', 4, '000000', TEXT1) +
    SIDE('right', 'single', 4, '000000', TEXT1) +
    '</w:tcBorders></w:tcPr>') +
  COND('band1Horz', '<w:tblPr/><w:tcPr><w:tcBorders>' +
    SIDE('top', 'single', 4, '000000', TEXT1) +
    SIDE('bottom', 'single', 4, '000000', TEXT1) +
    '</w:tcBorders></w:tcPr>') +
  COND('neCell', '<w:tblPr/><w:tcPr><w:tcBorders>' +
    '<w:left w:val="nil"/></w:tcBorders></w:tcPr>') +
  COND('nwCell', '<w:tblPr/><w:tcPr><w:tcBorders>' +
    '<w:right w:val="nil"/></w:tcBorders></w:tcPr>') + '</w:style>';

const CORPUS = new URL('./corpus/', import.meta.url).pathname;

function docxFiles(dir, out = []) {
  for (const n of readdirSync(dir).sort()) {
    const f = joinPath(dir, n);
    if (statSync(f).isDirectory()) docxFiles(f, out);
    else if (/\.docx$/i.test(n)) out.push(f);
  }
  return out;
}

/**
 * The w:style XML of style `id` as some corpus file's styles.xml has
 * it (the first file in name order holding it), or null when the
 * corpus is missing or no file has it. `files` limits the search.
 */
export async function styleFromCorpus(id, files) {
  if (!files && !existsSync(CORPUS)) return null;
  const want = `w:styleId="${id}"`;
  for (const f of files || docxFiles(CORPUS)) {
    let xml;
    try {
      xml = await entryText(new Uint8Array(readFileSync(f)),
        'word/styles.xml');
    } catch {
      continue;
    }
    const at = xml ? xml.indexOf(want) : -1;
    if (at < 0) continue;
    const start = xml.lastIndexOf('<w:style ', at);
    const end = xml.indexOf('</w:style>', at);
    if (start >= 0 && end > at) return xml.slice(start, end + 10);
  }
  return null;
}
