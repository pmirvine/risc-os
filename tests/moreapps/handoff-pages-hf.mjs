// Hand-off files of headers, footers and fields (Batch D P9.3, prefix
// HF: R3; see handoff-pages.mjs, which writes them after the pg
// files): hf-1 (odd and even headers in a section numbered from 2;
// an odd-page break's blank page in NUMPAGES), hf-2 (a floating
// picture in a header over the body), hf-3 (a header, footer and
// fields made by !Letters in a new document), hf-4 (page number
// formats), hf-5 (Link to previous on the only user of a header),
// hf-6 (DATE, TIME and the core dates with no picture), hf-8 (a PAGE
// field in the body at a page end whose width changes), hf-10
// (Update of MERGEFORMAT fields with mixed formatting), hf-fields
// (every field the Field box offers, with every format, put in by
// !Letters), hf-x1 (a continuous section's first page) and hf-x2 (a
// header taller than the top margin). Each is read by !Letters (a
// fixture built from XML, or a new document), changed with its own
// commands where the question is about them (Different odd and even
// pages, Link to previous, Different first page, the first edit of a
// header, Insert > Page number / Field..., Edit > Update field) and
// written by it; save() lints, reads back and checks every block,
// and the README lines say which header and footer and which number
// !Letters shows on each page (laid out with the test measurer: the
// pages of exact 12 pt lines are the same with real fonts) and what
// each field holds.
import {insertSection} from '../../tools/moreapps/!Letters/SectBreak';
import {oddEvenCmd, linkCmd, firstPageCmd}
  from '../../tools/moreapps/!Letters/HdrCmd';
import {facadeOf, pendingFacade}
  from '../../tools/moreapps/!Letters/StoryFacade';
import {insertFieldCmd, updateCmd}
  from '../../tools/moreapps/!Letters/FieldCmd';
import {NAMES, formatsOf, codeOf, CODES}
  from '../../tools/moreapps/!Letters/FieldNames';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {refOf} from '../../tools/moreapps/!Letters/HdrPick';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {buildDocx, documentXml, stylesXml, settingsXml, relsXml, REL,
  W_NS, R_NS} from './build-docx.mjs';
import {drawingXml, URIS, pngBytes} from './pic-fixtures.mjs';
import {begin, sep, end, instr, fld} from './field-fixtures.mjs';
import {mk} from './edit-docs.mjs';
import {tm} from './word-docs.mjs';
import {car, must, open, compat} from './handoff-tables-lib.mjs';
import {p, r, save, wrote, STYLES, EXACT, line, lines, say, font,
  PAGE_LINES, NOW as RUN} from './handoff-pages-lib.mjs';

/** The clock of every field !Letters fills here (Update, insert). */
export const NOW = new Date(2026, 9, 14, 14, 5);
const PATH = 'ADFS::HardDisc4.$.Documents.hf-fields/docx';

// ------------------------------------------------------ packages
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const HEADER_STYLE = '<w:style w:type="paragraph" w:styleId="Header">' +
  '<w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr>' +
  '<w:tabs><w:tab w:val="center" w:pos="4513"/>' +
  '<w:tab w:val="right" w:pos="9026"/></w:tabs>' +
  '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
  '</w:style>';
const CORE = DECL + '<cp:coreProperties xmlns:cp="http://schemas.' +
  'openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http:' +
  '//purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/' +
  'XMLSchema-instance"><dc:title>Letters hand-off</dc:title>' +
  '<dc:creator>Ada Lovelace</dc:creator><cp:lastModifiedBy>Charles ' +
  'Babbage</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:' +
  'W3CDTF">2026-10-01T09:30:00Z</dcterms:created><dcterms:modified ' +
  'xsi:type="dcterms:W3CDTF">2026-10-10T16:45:00Z</dcterms:modified>' +
  '</cp:coreProperties>';
const PKG = 'http://schemas.openxmlformats.org/';
const hfRoot = (kind, body) => DECL + `<w:${kind} xmlns:w="${W_NS}" ` +
  `xmlns:r="${R_NS}" xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}">${body}</w:${kind}>`;
/** A Header / Footer styled paragraph. */
export const hp = (runs, kind = 'Header', pPr = '') =>
  p(runs, `<w:pStyle w:val="${kind}"/>` + pPr);

/** A sectPr in schema order: {refs: [[kind, type, id]], type, w, h,
 *  top, header, footer, pgNum: {fmt, start, chapStyle}, titlePg}. */
export function sx({refs = [], type, w = 11906, h = 16838, top = 1440,
  header = 720, footer = 720, pgNum, titlePg} = {}) {
  const pn = pgNum ? '<w:pgNumType' + (pgNum.fmt ? ` w:fmt="${pgNum.fmt}"`
    : '') + (pgNum.start !== undefined ? ` w:start="${pgNum.start}"` : '') +
    (pgNum.chapStyle ? ` w:chapStyle="${pgNum.chapStyle}" ` +
      'w:chapSep="hyphen"' : '') + '/>' : '';
  return '<w:sectPr>' + refs.map(([k, t, id]) => `<w:${k === 'hdr' ?
    'header' : 'footer'}Reference w:type="${t}" r:id="${id}"/>`)
    .join('') + (type ? `<w:type w:val="${type}"/>` : '') +
    `<w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${top}" ` +
    `w:right="1440" w:bottom="1440" w:left="1440" w:header="${header}" ` +
    `w:footer="${footer}" w:gutter="0"/>` + pn +
    '<w:cols w:space="708"/>' + (titlePg ? '<w:titlePg/>' : '') +
    '<w:docGrid w:linePitch="360"/></w:sectPr>';
}
/** A paragraph that ends a section. */
export const sectEnd = (text, o) => p(r(text), EXACT() + sx(o));

/**
 * A .docx: body (with its last sectPr), stories [{id, kind, xml,
 * pic?}] (word/header<n>.xml / footer<n>.xml in order; pic: PNG bytes
 * the story's own rIdP1 names), core properties, settings.
 */
export function hfDocx(body, {stories = [], settings = compat(15),
  core = false} = {}) {
  const parts = {'word/document.xml': documentXml(body),
    'word/styles.xml': stylesXml(STYLES + HEADER_STYLE),
    'word/settings.xml': settingsXml(settings)};
  const docRels = [];
  const n = {hdr: 0, ftr: 0};
  for (const st of stories) {
    const base = st.kind === 'hdr' ? 'header' : 'footer';
    const name = `${base}${++n[st.kind]}.xml`;
    parts['word/' + name] = hfRoot(st.kind, st.xml);
    docRels.push([st.id, REL(base), name]);
    if (st.pic) {
      const media = `media/${base}${n[st.kind]}.png`;
      parts[`word/_rels/${name}.rels`] = relsXml([['rIdP1', REL('image'),
        media]]);
      parts['word/' + media] = st.pic;
    }
  }
  const opts = {docRels};
  if (core) {
    parts['docProps/core.xml'] = CORE;
    opts.pkgRels = [['rId1', REL('officeDocument'), 'word/document.xml'],
      ['rId2', PKG + 'package/2006/relationships/metadata/' +
        'core-properties', 'docProps/core.xml']];
  }
  return buildDocx(parts, opts);
}
const fixture = async (body, o) => open(await hfDocx(body, o));

// ------------------------------------------------------ what it shows
/** Paragraph b's text, each field in it shown as {CODE}. */
function codeText(b, fs) {
  if (!b || b.type !== 'p') return '';
  let t = b.text;
  const own = fs.filter((f) => f.begin.id === b.id && f.end.id === b.id)
    .filter((f, _, a) => !a.some((g) => g !== f && g.begin.off <
      f.begin.off && g.end.off > f.end.off))
    .sort((x, y) => y.begin.off - x.begin.off);
  for (const f of own) {
    t = t.slice(0, f.begin.off) + `{${f.instr.trim()}}` +
      t.slice(f.end.off + 1);
  }
  return t.replace(/\uFFFC/g, '').replace(/\t/g, ' [tab] ').trim();
}
/** The first words of a story's text (fields as codes). */
function storyOf(doc, ref) {
  if (!ref) return 'none';
  if (ref.kept) return 'a part kept as bytes';
  if (!ref.part) return `empty (${ref.type}: none made)`;
  const st = doc.stories.get(ref.part), fs = scan(doc, ref.part);
  const t = st.blocks.map((b) => codeText(b, fs)).filter(Boolean)
    .join(' / ');
  return `"${t.length > 40 ? t.slice(0, 37) + '...' : t}"`;
}
/** Doc laid out in Print layout with the test measurer: its Pages. */
function paged(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L));
  L.place = PlacePrint(L, P);
  P.finish();
  return {L, P};
}
/** One README line per page: its number, header and footer. */
function showing(doc, max = 14) {
  const {P} = paged(doc);
  const out = [`!Letters shows ${P.count} page(s) (NUMPAGES ${P.count}; ` +
    'fields computed on each page; laid out with the test measurer):'];
  for (let i = 0; i < Math.min(P.count, max); i++) {
    const pg = P.at(i);
    out.push(`page ${i + 1}: section ${pg.s + 1}, numbered ${P.num(i)}` +
      (pg.blank ? ' (blank, not shown)' : `, header ${storyOf(doc,
        pg.header)}, footer ${storyOf(doc, pg.footer)}`));
  }
  return out;
}
/** The stored result of field f (text between separate and end). */
function resultOf(doc, f, story) {
  if (f.simple || !f.sep) return f.simple ? '(fldSimple)' : '(none)';
  let s = '';
  const blocks = story ? doc.stories.get(story).blocks : null;
  const visit = (b) => {
    if (b.type !== 'p') return true;
    const a = b.id === f.sep.id ? f.sep.off + 1 : null;
    const z = b.id === f.end.id ? f.end.off : null;
    if (a !== null || z !== null || s) {
      if (a !== null || s !== '') s += b.text.slice(a ?? 0, z ?? undefined);
    }
    return z === null;
  };
  if (blocks) blocks.every(visit);
  else forEachBlock(doc, visit);
  return s.replace(/\uFFFC/g, '');
}
/** README lines: every field of the body and of each story. */
function fieldsOf(doc) {
  const out = [];
  const add = (where, fs, story) => {
    for (const f of fs) {
      out.push(`${where}{${f.instr}} holds "${resultOf(doc, f, story)}"`);
    }
  };
  add('', scan(doc));
  for (const part of doc.stories.keys()) {
    add(part.replace('word/', '') + ': ', scan(doc, part), part);
  }
  return out;
}
/** save, then the README's pages and fields lines added. */
async function hfSave(name, d, {note, pages = true, fields = true} = {}) {
  const back = await save(name, d, {note});
  wrote.get(name).push(...(pages ? showing(back.doc) : []),
    ...(fields ? fieldsOf(back.doc) : []).slice(0, 200)
      .map((l) => '  ' + l));
  return back;
}

// ------------------------------------------------------ hf-1
const FOOT = hp(r('Page ') + fld(' PAGE ', '1') + r(' of ') +
  fld(' NUMPAGES ', '1'), 'Footer', '<w:jc w:val="center"/>');
async function oddEven() {
  const refs = [['hdr', 'default', 'rIdH1'], ['hdr', 'even', 'rIdH2'],
    ['ftr', 'default', 'rIdF1']];
  const body = [
    say('Section 1 is numbered from 2 (Format > Page numbers: Start at ' +
      '2); the document has Different odd and even pages'),
    lines('Section 1 line', PAGE_LINES + 20 - 1),
    sectEnd('End of section 1 (an odd-page section break follows)', {refs,
      pgNum: {start: 2}}),
    say('Section 2 starts on an odd page after an odd-page break'),
    lines('Section 2 line', 70),
    sx({type: 'oddPage'}),
  ];
  const d = await fixture(body.join(''), {stories: [
    {id: 'rIdH1', kind: 'hdr', xml: hp(r('ODD header (default)'))},
    {id: 'rIdH2', kind: 'hdr', xml: hp(r('EVEN header'))},
    {id: 'rIdF1', kind: 'ftr', xml: FOOT}]});
  must('odd and even', oddEvenCmd(d, true));
  await hfSave('hf-1-oddeven.docx', d, {note: 'Different odd and even ' +
    'pages set by !Letters\' header menu (oddEvenCmd)'});
}

// ------------------------------------------------------ hf-2
async function float() {
  const pos = '<wp:positionH relativeFrom="page"><wp:posOffset>2743200' +
    '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page">' +
    '<wp:posOffset>2286000</wp:posOffset></wp:positionV>';
  const pic = '<w:r>' + drawingXml({kind: 'anchor', embed: 'rIdP1',
    cx: 1828800, cy: 1371600, decl: false}).replace(
    /<wp:positionH[\s\S]*<\/wp:positionV>/, pos) + '</w:r>';
  const body = [say('A header holds a floating picture (2 x 1.5 in, ' +
    'square wrap) placed 3 in from the page\'s left and 2.5 in from its ' +
    'top: over these lines'),
  ...Array.from({length: 40}, (_, i) => p(r(`Body paragraph ${i + 1}: ` +
    'the quick brown fox jumps over the lazy dog, and the lines go on ' +
    'across the page so that a wrap round the picture would show.')))];
  const d = await fixture(body.join('') + sx({refs: [['hdr', 'default',
    'rIdH1'], ['ftr', 'default', 'rIdF1']]}), {stories: [
    {id: 'rIdH1', kind: 'hdr', pic: pngBytes(40, 30), xml:
      hp(r('Header with a floating picture') + pic)},
    {id: 'rIdF1', kind: 'ftr', xml: FOOT}]});
  await hfSave('hf-2-float.docx', d, {note: 'the picture is a wp:anchor ' +
    'in header1.xml, its media through the header\'s own relationships'});
}

// ------------------------------------------------------ hf-3
const tabsIn = (t, s) => t.type(s, '\t');
async function made() {
  const T = ['Section 1: a new document made by !Letters. Its header and ' +
    'footer were made by typing in them (the header first typed on a ' +
    'page of section 2, linked to previous).',
  'Section 2: Different first page; its first-page header typed by ' +
    '!Letters.',
  'Section 3: Link to previous turned off: a copy of the header, ' +
    'changed.'];
  const d = mk(T);
  must('break 1', insertSection(d, RUN, S.caret({id: d.doc.sections[0]
    .blocks[0].id, off: T[0].length}), 'nextPage'));
  must('break 2', insertSection(d, RUN, car(d, T[1], T[1].length),
    'nextPage'));
  // the header: first typed on section 2's page (linked: section 1 owns)
  const h = pendingFacade(d, {s: 1, kind: 'hdr', type: 'default'});
  let sel = S.caret({id: h.doc.sections[0].blocks[0].id, off: 0});
  sel = new Typing(h).type(sel, 'Header made by !Letters');
  const th = new Typing(h);
  sel = tabsIn(th, sel);
  sel = th.type(sel, 'centre');
  sel = tabsIn(th, sel);
  th.type(sel, 'right');
  // the footer: Page {PAGE} of {NUMPAGES} by Insert > Page number
  const {P} = paged(d.doc);
  const ctx = {now: NOW, page: P.at(0), pages: {finish: () => P}};
  const f = pendingFacade(d, {s: 0, kind: 'ftr', type: 'default'});
  sel = S.caret({id: f.doc.sections[0].blocks[0].id, off: 0});
  sel = new Typing(f).type(sel, 'Page ');
  const ff = facadeOf(d, f.part, 0);
  sel = must('PAGE', insertFieldCmd(ff, sel, CODES.page, ctx));
  sel = new Typing(ff).type(sel, ' of ');
  must('NUMPAGES', insertFieldCmd(ff, sel, CODES.pages, ctx));
  // section 2: Different first page, its first-page header typed
  must('first page', firstPageCmd(d, 1, true));
  const fp = pendingFacade(d, {s: 1, kind: 'hdr', type: 'first'});
  new Typing(fp).type(S.caret({id: fp.doc.sections[0].blocks[0].id,
    off: 0}), 'First page of section 2 (header made by !Letters)');
  // section 3: Link to previous off (a copy), then changed
  must('unlink', linkCmd(d, 2, 'hdr', 'default', false));
  const c = facadeOf(d, refOf(d.doc, 2, 'default', 'hdr').part, 2);
  new Typing(c).type(S.caret({id: c.doc.sections[0].blocks[0].id,
    off: 0}), 'Section 3\'s own copy: ');
  await hfSave('hf-3-new.docx', d, {note: 'a new !Letters document; ' +
    'headers and footers made on their first edit, the fields by ' +
    'Insert > Page number and Number of pages, Different first page and ' +
    'Link to previous by the header menu'});
}
// ------------------------------------------------------ hf-4
const FMTS = [['decimal', 1], ['upperRoman', 3], ['lowerRoman', 3],
  ['upperLetter', 3], ['lowerLetter', 3], ['thaiNumbers', 3],
  ['hindiNumbers', 3], ['decimalEnclosedCircle', 3], ['decimalZero', 3],
  ['numberInDash', 3], ['chicago', 3], ['ordinal', 3],
  ['decimal', 3, '1']];
async function numFmt() {
  const refs = [['ftr', 'default', 'rIdF1']];
  const body = FMTS.map(([fmt, start, chap], i) => {
    const what = `Section ${i + 1}: page numbers ${fmt}, starting at ` +
      `${start}` + (chap ? ', with chapter numbers (Heading 1, hyphen)' : '');
    const o = {refs: i === 0 ? refs : [], pgNum: {fmt, start, chapStyle:
      chap}};
    return say(what) + line('The footer shows PAGE in this format.') +
      (i < FMTS.length - 1 ? sectEnd('End of section ' + (i + 1), o)
        : sx(o));
  });
  const d = await fixture(body.join(''), {stories: [{id: 'rIdF1',
    kind: 'ftr', xml: hp(r('Page ') + fld(' PAGE ', '1'), 'Footer',
      '<w:jc w:val="center"/>')}]});
  await hfSave('hf-4-numfmt.docx', d, {note: 'one footer (section 1\'s, ' +
    'linked to by every later section) with a PAGE field'});
}

// ------------------------------------------------------ hf-5
async function unlink() {
  const body = [say('Section 1: header A and footer A (used by section 3 ' +
    'too)'), line('Section 1 text'),
  sectEnd('End of section 1', {refs: [['hdr', 'default', 'rIdH1'],
    ['ftr', 'default', 'rIdF1']]}),
  say('Section 2: had header B (with a picture) and footer B of its ' +
    'own; !Letters\' Link to previous turned on for both'),
  line('Section 2 text'),
  sectEnd('End of section 2', {refs: [['hdr', 'default', 'rIdH2'],
    ['ftr', 'default', 'rIdF2']]}),
  say('Section 3: referred to header A itself; Link to previous turned ' +
    'on'), line('Section 3 text'),
  sx({refs: [['hdr', 'default', 'rIdH1']]})];
  const d = await fixture(body.join(''), {stories: [
    {id: 'rIdH1', kind: 'hdr', xml: hp(r('Header A'))},
    {id: 'rIdH2', kind: 'hdr', pic: pngBytes(20, 10), xml: hp(r('Header ' +
      'B with a picture ') + '<w:r>' + drawingXml({embed: 'rIdP1',
      decl: false}) + '</w:r>')},
    {id: 'rIdF1', kind: 'ftr', xml: hp(r('Footer A'), 'Footer')},
    {id: 'rIdF2', kind: 'ftr', xml: hp(r('Footer B'), 'Footer')}]});
  must('link header 2', linkCmd(d, 1, 'hdr', 'default', true));
  must('link footer 2', linkCmd(d, 1, 'ftr', 'default', true));
  must('link header 3', linkCmd(d, 2, 'hdr', 'default', true));
  const back = await hfSave('hf-5-unlink.docx', d, {note: 'Link to ' +
    'previous (linkCmd) on: header2.xml, its .rels and footer2.xml ' +
    'removed from the package; header1.xml kept (section 1 uses it)'});
  wrote.get('hf-5-unlink.docx').push('    parts: ' + [...back.doc.parts
    .keys()].filter((k) => /header|footer|media/.test(k)).join(', '));
}

// ------------------------------------------------------ hf-6
const DATES = [' DATE ', ' TIME ', ' CREATEDATE ', ' SAVEDATE ',
  ' PRINTDATE ', ' DATE \\@ "dddd d MMMM yyyy" ', ' TIME \\@ "h:mm am/pm" '];
async function dates() {
  const row = (code, res) => p(r(`{${code.trim()}}: `) + fld(code, res));
  const body = [say('A: updated by !Letters (Edit > Update field) at ' +
    '14:05 on 14 October 2026 (core: created 1 October 2026 09:30 UTC, ' +
    'saved 10 October 2026 16:45 UTC, never printed)'),
  ...DATES.map((c) => row(c, '(not updated)')),
  say('B: the same fields, not updated: select each line and press F9 ' +
    'in Word'), ...DATES.map((c) => row(c, '(press F9)')),
  sx({})];
  const d = await fixture(body.join(''), {core: true});
  const ps = d.doc.sections[0].blocks;
  const sel = S.select({id: ps[1].id, off: 0}, {id: ps[DATES.length].id,
    off: ps[DATES.length].text.length});
  must('update', updateCmd(d, sel, {now: NOW}));
  await hfSave('hf-6-date.docx', d, {pages: false, note: 'language ' +
    'en-GB (docDefaults); the A fields updated with the clock at 14:05 on ' +
    '14 October 2026'});
}

// ------------------------------------------------------ hf-8
const COURIER = font('Courier New', 10);
async function bodyPage() {
  const lead = 'Case (HF8): this line ends in a PAGE \\* roman field:';
  let t = lead;
  while (t.length < 71) t += ' xx';
  t = t.slice(0, 71) + ' ';
  const body = [say('The line at the bottom of page 8 ends in a PAGE ' +
    'field in roman (viii on page 8, ix on page 9) in Courier New 10'),
  lines('Filler line', 7 * PAGE_LINES + PAGE_LINES - 2),
  p(r(t, COURIER) + fld(' PAGE \\* roman ', 'viii', {rPr: COURIER}),
    EXACT()), lines('After line', 20), sx({refs: [['ftr', 'default',
    'rIdF1']]})];
  const d = await fixture(body.join(''), {stories: [{id: 'rIdF1',
    kind: 'ftr', xml: FOOT}]});
  await hfSave('hf-8-bodypage.docx', d, {pages: false, note: `the field line: ${t.length}` +
    ' characters, then the field: 74 with "ix" fit the 75 a line holds,' +
    ' 76 with "viii" do not (the result wraps to a second line)'});
}

// ------------------------------------------------------ hf-10
const B = '<w:b/>', I = '<w:i/>', RED = '<w:color w:val="C00000"/>';
const U = '<w:u w:val="single"/>';
/** A field whose result is runs [[text, rPr]]. */
const mixed = (code, runs) => begin() + instr(code) + sep() +
  runs.map(([t, x]) => r(t, x)).join('') + end();
const MIX = [[' PAGE \\* MERGEFORMAT ', [['P', B + RED], ['ag', I],
  ['e', U]]],
[' TITLE \\* MERGEFORMAT ', [['O', B], ['l', I], ['d', RED]]],
[' TITLE ', [['O', B], ['l', I], ['d', RED]]],
[' AUTHOR \\* Upper \\* MERGEFORMAT ', [['ab', B], ['cd', I + RED]]],
[' DATE \\@ "d MMMM yyyy" \\* MERGEFORMAT ', [['1 ', B], ['Jan', I],
  ['uary 2000', RED]]]];
async function mergeFormat() {
  const row = ([code, runs]) => p(r(`{${code.trim()}}: `) +
    mixed(code, runs) + r(' (end)'));
  const body = [say('A: updated by !Letters (Edit > Update field); each ' +
    'stored result had bold, italic, red and underlined letters'),
  ...MIX.map(row), say('B: the same, not updated: select each line and ' +
    'press F9 in Word'), ...MIX.map(row), sx({})];
  const d = await fixture(body.join(''), {core: true});
  const ps = d.doc.sections[0].blocks, {P} = paged(d.doc);
  must('update', updateCmd(d, S.select({id: ps[1].id, off: 0},
    {id: ps[MIX.length].id, off: ps[MIX.length].text.length}),
  {now: NOW, pages: {finish: () => P}}));
  await hfSave('hf-10-mergeformat.docx', d, {pages: false, note: 'core ' +
    'title "Letters hand-off", creator "Ada Lovelace"; A updated at ' +
    '14:05 on 14 October 2026'});
}

// ------------------------------------------------------ hf-fields
const MORE = [' PAGE \\# "#,##0" ', ' PAGE \\# "0.00" ', ' PAGE \\# "#" ',
  ' PAGE \\* CardText ', ' PAGE \\* OrdText ', ' PAGE \\* Hex ',
  ' PAGE \\* DollarText ', ' PAGE \\# "x##" ', ' NUMWORDS \\* roman ',
  ' FILENAME \\p '];
async function allFields() {
  const rows = [];
  for (const name of NAMES) {
    for (const f of formatsOf(name)) rows.push([name, f.id, f.text]);
  }
  const label = (x) => `${x[0]} ${x[2]}: `;
  const body = [say('Every field of Insert > Field..., with every format ' +
    '(put in by !Letters at 14:05 on 14 October 2026, its file ' +
    'ADFS::HardDisc4.$.Documents.hf-fields/docx)'),
  ...rows.map((x) => p(r(label(x)))),
  say('More codes typed in the Field box (pictures and formats !Letters ' +
    'cannot do give an empty result)'), ...MORE.map((c) => p(r(`{${c
    .trim()}}: `))),
  say('Kept as read: a PAGE field inside a hyperlink (stored 99), and IF ' +
    'with a nested PAGE (HF11)'),
  p(r('In a link: ') + '<w:hyperlink w:anchor="_top">' +
    fld(' PAGE ', '99') + '</w:hyperlink>'),
  p(r('Nested: ') + fld(' IF {} = 1 "page one" "not page one" ',
    'page one', {nested: fld(' PAGE ', '1')})),
  p(r('Type into this result in Word (HF9): ') + fld(' PAGE ', '1')),
  sx({refs: [['ftr', 'default', 'rIdF1']]})];
  const d = await fixture(body.join(''), {core: true, stories: [
    {id: 'rIdF1', kind: 'ftr', xml: FOOT}]});
  const {P} = paged(d.doc);
  const ctx = {now: NOW, path: PATH, pages: {finish: () => P}};
  const at = (text) => {
    let b = null;
    forEachBlock(d.doc, (x) => {
      if (!b && x.type === 'p' && x.text === text) b = x;
      return !b;
    });
    return S.caret({id: b.id, off: text.length});
  };
  for (const x of rows) {
    must(label(x), insertFieldCmd(d, at(label(x)), codeOf(x[0], x[1]),
      ctx));
  }
  for (const c of MORE) {
    must(c, insertFieldCmd(d, at(`{${c.trim()}}: `), c.trim(), ctx));
  }
  await hfSave('hf-fields.docx', d, {pages: false, note: `${rows.length} ` +
    `fields from the Field box's names and formats, ${MORE.length} more ` +
    'codes; each one run (begin, code, separate, result, end) as ' +
    '!Letters writes a field'});
}

// ------------------------------------------------------ hf-x1
async function continuous() {
  const body = [say('Section 1: a header, and the footer with the page ' +
    'number'), lines('Section 1 line', PAGE_LINES + 20 - 1),
  sectEnd('End of section 1', {refs: [['hdr', 'default', 'rIdH1'],
    ['ftr', 'default', 'rIdF1']]}),
  say('Section 2 starts here (a continuous break, part way down page ' +
    '2): Different first page, a first-page header, numbers from 10'),
  lines('Section 2 line', 90),
  sx({type: 'continuous', titlePg: true, pgNum: {start: 10}, refs:
    [['hdr', 'first', 'rIdH2'], ['hdr', 'default', 'rIdH3']]})];
  const d = await fixture(body.join(''), {stories: [
    {id: 'rIdH1', kind: 'hdr', xml: hp(r('Section 1 header'))},
    {id: 'rIdH2', kind: 'hdr', xml: hp(r('Section 2 FIRST-PAGE header'))},
    {id: 'rIdH3', kind: 'hdr', xml: hp(r('Section 2 default header'))},
    {id: 'rIdF1', kind: 'ftr', xml: FOOT}]});
  await hfSave('hf-x1-continuous.docx', d, {note: 'section 2: w:type ' +
    'continuous, titlePg, pgNumType start 10'});
}

// ------------------------------------------------------ hf-x2
async function tall() {
  const heads = Array.from({length: 6}, (_, i) => hp(r(`Tall header ` +
    `line ${i + 1} of 6`), 'Header', i === 5 ? '<w:spacing w:after="240"/>'
    : '')).join('');
  const body = [say('The header has 6 lines and 12 pt after its last: ' +
    'taller than the 1 in top margin. Where does this line start?'),
  lines('Body line', 70), sx({refs: [['hdr', 'default', 'rIdH1'],
    ['ftr', 'default', 'rIdF1']]})];
  const d = await fixture(body.join(''), {stories: [
    {id: 'rIdH1', kind: 'hdr', xml: heads},
    {id: 'rIdF1', kind: 'ftr', xml: FOOT}]});
  const back = await hfSave('hf-x2-tall.docx', d, {note: 'header 0.5 in ' +
    'from the top (w:header 720), top margin 1 in'});
  const {P} = paged(back.doc);
  wrote.get('hf-x2-tall.docx').push(`    !Letters puts the body's top ` +
    `${(P.at(0).bodyTop / 96).toFixed(2)} in from the page's top ` +
    '(with the test measurer: real fonts may differ a little)');
}

export async function makeHf() {
  await oddEven();
  await float();
  await made();
  await numFmt();
  await unlink();
  await dates();
  await bodyPage();
  await mergeFormat();
  await allFields();
  await continuous();
  await tall();
}
