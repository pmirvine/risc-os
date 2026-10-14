// Shared helpers of the Batch D (pages) real-Word hand-off generator
// handoff-pages.mjs (not a test; local only: the folder it writes is
// git-ignored). Built on handoff-tables-lib.mjs (`put`, `open`, the
// table fixtures, the selection helpers): documents with a footer
// that shows the page number (so Word's numbering can be read on
// every page), Word-like styles (Normal, Heading 1 and 2 with keep
// with next, Table Grid), lines of an EXACT height (12 pt) whose
// place on a page can be worked out in both programs, a section's
// sectPr, and `save` (lint, read back, every block checked, the
// sections !Letters wrote listed for the README).
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {givenOf} from '../../tools/moreapps/!Letters/SectGeom';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {buildDocx, documentXml, stylesXml, settingsXml, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {put, open, DATE, p, r, tbl, tr, tc, compat, TABLE_NORMAL,
  TABLE_GRID, allTables} from './handoff-tables-lib.mjs';
import {URIS, pngBytes} from './pic-fixtures.mjs';

export {put, open, p, r, tbl, tr, tc, compat};

// ------------------------------------------------------ styles
const FONT = (f) => `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" ` +
  `w:cs="${f}"/>`;
const DEFAULTS = '<w:docDefaults><w:rPrDefault><w:rPr>' +
  FONT('Calibri') + '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
  '<w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault>' +
  '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>';
const NORMAL = '<w:style w:type="paragraph" w:default="1" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>';
const head = (n, sz, before) => '<w:style w:type="paragraph" ' +
  `w:styleId="Heading${n}"><w:name w:val="heading ${n}"/>` +
  '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:keepNext/><w:keepLines/>' +
  `<w:spacing w:before="${before}" w:after="0"/>` +
  `<w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr>` +
  FONT('Calibri Light') + '<w:color w:val="2F5496"/>' +
  `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
const FOOTER_STYLE = '<w:style w:type="paragraph" w:styleId="Footer">' +
  '<w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr>' +
  '<w:tabs><w:tab w:val="center" w:pos="4513"/>' +
  '<w:tab w:val="right" w:pos="9026"/></w:tabs>' +
  '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
  '</w:style>';
/** docDefaults (Calibri 11, after 8 pt, line 1.08), Normal, Heading 1
 *  and 2 (keepNext, keepLines), Footer, Table Normal, Table Grid.
 *  widowControl is set NOWHERE (PG1a asks what that means). */
export const STYLES = DEFAULTS + NORMAL + head(1, 32, 240) +
  head(2, 26, 40) + FOOTER_STYLE + TABLE_NORMAL + TABLE_GRID;

// ------------------------------------------------------ paragraphs
/** Run properties: a font and a size in points. */
export const font = (f, pt) => FONT(f) + `<w:sz w:val="${pt * 2}"/>` +
  `<w:szCs w:val="${pt * 2}"/>`;
/** Spacing: before / after in points, lines exactly `ex` points. */
export const EXACT = (before = 0, after = 0, ex = 12) =>
  `<w:spacing w:before="${before * 20}" w:after="${after * 20}" ` +
  `w:line="${ex * 20}" w:lineRule="exact"/>`;
/** A paragraph of one exact 12 pt line (no space before or after). */
export const line = (text, pPr = '') => p(r(text), pPr + EXACT());
/** n exact lines `label 1` .. `label n`, each its own paragraph. */
export const lines = (label, n, from = 1) => Array.from({length: n},
  (_, i) => line(`${label} ${i + from}`)).join('');
/** One paragraph of n exact lines (line breaks between). */
export function tall(label, n, pPr = '') {
  const runs = Array.from({length: n}, (_, i) => r(`${label}, line ` +
    `${i + 1} of ${n}`) + (i < n - 1 ? '<w:r><w:br/></w:r>' : ''));
  return p(runs.join(''), pPr + EXACT());
}
/** A bold caption paragraph (exact 12 pt) that says what to look at. */
export const say = (text, pPr = '') => p(r(text, '<w:b/>'),
  pPr + EXACT());
export const PAGE_BREAK = '<w:r><w:br w:type="page"/></w:r>';
/** A paragraph that ends in a page break. */
export const breakLine = (text) => p(r(text) + PAGE_BREAK, EXACT());

// A4 with 1 inch margins: the body is 16838 - 2 x 1440 = 13958 twips,
// 697.9 pt: 58 exact 12 pt lines (696 pt) fill it, a 59th does not
// fit. The footer (0.5 in from the edge, one line) stays inside the
// bottom margin, so it never pushes the body.
export const PAGE_LINES = 58;

// ------------------------------------------------------ sections
const A4 = {w: 11906, h: 16838};
/** A sectPr: {type, w, h, orient, mar: {top...}, vAlign, titlePg,
 *  footer (true: footerReference rIdF1), more (after pgMar), grid}. */
export function sect({type, w = A4.w, h = A4.h, orient, mar = {},
  vAlign, titlePg, footer = true, more = '', grid = ''} = {}) {
  const m = {top: 1440, right: 1440, bottom: 1440, left: 1440,
    header: 720, footer: 720, gutter: 0, ...mar};
  return '<w:sectPr>' + (footer ? '<w:footerReference w:type="default" ' +
    'r:id="rIdF1"/>' : '') + (type ? `<w:type w:val="${type}"/>` : '') +
    `<w:pgSz w:w="${w}" w:h="${h}"` +
    (orient ? ` w:orient="${orient}"` : '') + '/>' +
    `<w:pgMar w:top="${m.top}" w:right="${m.right}" ` +
    `w:bottom="${m.bottom}" w:left="${m.left}" w:header="${m.header}" ` +
    `w:footer="${m.footer}" w:gutter="${m.gutter}"/>` + more +
    '<w:cols w:space="708"/>' +
    (vAlign ? `<w:vAlign w:val="${vAlign}"/>` : '') +
    (titlePg ? '<w:titlePg/>' : '') +
    (grid || '<w:docGrid w:linePitch="360"/>') + '</w:sectPr>';
}
/** A paragraph that ends a section (its sectPr in its pPr). */
export const sectEnd = (text, opts, pPr = '') => p(r(text),
  pPr + EXACT() + sect(opts));

const FTR = '<w:ftr xmlns:w="' + W_NS + '" xmlns:r="' + R_NS + '">' +
  '<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/>' +
  '</w:pPr><w:r><w:t xml:space="preserve">Page </w:t></w:r>' +
  '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>' +
  '</w:p></w:ftr>';

/** The relationship id of the one picture of a pgDocx with pics. */
export const PIC_RID = 'rIdImg1';
const PIC_ROOT = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}"`;

/** A .docx: body (its last sectPr included by the caller, or the
 *  default one), the styles, settings (compatibility mode 15 unless
 *  given), the page-number footer when footer is not false; pics:
 *  the wp, a and pic namespaces on the root and one PNG (blue, 96 x
 *  48 pixels) that PIC_RID names, for every picture of the body. */
export function pgDocx(body, {settings = compat(15), footer = true,
  lastSect, pics = false} = {}) {
  const parts = {
    'word/document.xml': documentXml(body + (lastSect === undefined ?
      sect({footer}) : lastSect), pics ? {rootAttrs: PIC_ROOT} : {}),
    'word/styles.xml': stylesXml(STYLES),
    'word/settings.xml': settingsXml(settings),
  };
  const docRels = [];
  if (footer) {
    parts['word/footer1.xml'] = '<?xml version="1.0" encoding="UTF-8" ' +
      'standalone="yes"?>\n' + FTR;
    docRels.push(['rIdF1', REL('footer'), 'footer1.xml']);
  }
  if (pics) {
    parts['word/media/image1.png'] = pngBytes(96, 48, {rgb: [91, 155,
      213]});
    docRels.push([PIC_RID, REL('image'), 'media/image1.png']);
  }
  return buildDocx(parts, {docRels});
}

/** pgDocx read into a Document (to edit with !Letters' commands). */
export const fixture = async (body, opts) => open(await pgDocx(body,
  opts));

/** typing for commands that take one: runs the step at once. */
export const NOW = {command: (fn) => fn()};

// ------------------------------------------------------ saving
const words = (d) => {
  let n = 0, paras = 0;
  forEachBlock(d.doc, (b) => {
    if (b.type === 'p') {
      paras++;
      n += b.text.split(/\s+/).filter(Boolean).length;
    }
    return true;
  });
  return {n, paras};
};
const inch = (tw) => +(tw / 1440).toFixed(2);
const raw = (pr, name) => (pr.extra || []).some((x) => x && x.node &&
  x.node.name === 'w:' + name || x && x.name === 'w:' + name);
/** ', N columns ...' of a section's typed w:cols (none for one). */
function colsText(pr) {
  if (raw(pr, 'cols')) return ', w:cols kept as read (not typed)';
  const c = pr.cols;
  if (!c || (c.num || 1) <= 1 && !(c.col && c.col.length > 1)) return '';
  const n = c.col && c.equalWidth === false ? c.col.length : c.num;
  return `, ${n} columns ` + (c.equalWidth === false && c.col ? '(' +
    c.col.map((x) => inch(x.w || 0) + (x.space ? ' + ' + inch(x.space)
      : '')).join(', ') + ' in)' : `${inch(c.space ?? 720)} in apart`) +
    (c.sep ? ', line between' : '');
}
/** ', line numbers ...' of a section's typed w:lnNumType. */
function lnText(pr) {
  if (raw(pr, 'lnNumType')) return ', w:lnNumType kept as read';
  const n = pr.lnNumType;
  if (!n) return '';
  return `, line numbers (countBy ${n.countBy ?? 'absent'}, start ` +
    `${n.start ?? 'absent'}, distance ${n.distance === undefined ?
      'auto' : inch(n.distance) + ' in'}, ${n.restart || 'newPage'})`;
}
/** One line per section: start, size, margins, vAlign, titlePg,
 *  columns, line numbers. */
export function sections(doc) {
  const first = doc.sections[0];
  return doc.sections.map((s, i) => {
    const pr = s.props || {};
    const {size, mar} = givenOf(s, first);
    const o = pr.pgSz && pr.pgSz.orient ? ' ' + pr.pgSz.orient : '';
    return `    Section ${i + 1}: ${pr.type || 'nextPage (no w:type)'}, ` +
      `${inch(size.w)} x ${inch(size.h)} in${o}, margins ` +
      `${inch(mar.top)}/${inch(mar.bottom)}/${inch(mar.left)}/` +
      `${inch(mar.right)} in (top/bottom/left/right)` +
      (mar.gutter ? `, gutter ${inch(mar.gutter)}` : '') +
      (mar.header !== 720 || mar.footer !== 720 ? `, header / footer ` +
        `${inch(mar.header)} / ${inch(mar.footer)} in from the edge` : '') +
      (pr.vAlign ? `, vAlign ${pr.vAlign}` : '') +
      (pr.titlePg ? ', titlePg' : '') + colsText(pr) + lnText(pr) +
      `, ${s.blocks.length} block` +
      (s.blocks.length === 1 ? '' : 's');
  });
}

/** Every file written: name -> the lines of what !Letters wrote. */
export const wrote = new Map();

/** Save d as name (written by !Letters); lint, read back, check every
 *  block; no table may come back Opaque; lines for the README. */
export async function save(name, d, {note} = {}) {
  const bytes = await writeDocx(d.doc, {date: DATE});
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
  if (kept) throw new Error(name + ': ' + kept + ' table(s) Opaque');
  console.log(name + ': ' + put(name, bytes));
  const w = words(back);
  const t = allTables(back).length;
  wrote.set(name, [...sections(back.doc),
    ...(note ? ['    ' + note] : []),
    `    ${w.paras} paragraphs, ${w.n} words` +
    (t ? `, ${t} table(s)` : '')]);
  return back;
}
