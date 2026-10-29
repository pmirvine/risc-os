// Generates the real-Word hand-off files for !Letters' styles (Batch
// E1: the Styles window, the Modify / New Style box, the gallery and
// the Format menu's style commands). Local only, never committed:
// tests/moreapps/corpus/ is git-ignored. Not a test:
//
//   node tests/moreapps/handoff-styles.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   st-1-created.docx      a created paragraph style and a created
//                          character style, used
//   st-2-modified.docx     a Word-style styles part (docDefaults,
//                          latent styles, theme colour, an rsid
//                          attribute and child) with two styles
//                          modified
//   st-3-deleted.docx      a style used in the body, a table cell, a
//                          header and a footer, then deleted
//   st-4-linked.docx       a linked paragraph / character pair made
//                          in !Letters and applied by Word's rule
//   st-5-basedon.docx      a Based on chain A > B > C with A modified
//                          and B deleted
//   st-6-themefont.docx    styles in theme fonts and theme colours,
//                          one modified (theme part kept)
//   st-7-builtin-name.docx a user style named like a built-in
//   st-8-latent.docx       Heading 1 and Heading 2 applied to a
//                          document whose styles part lacked them
//   st-README.txt          what Word should show, the open questions
//                          (ST1..), a PRIORITY list first
// Everything is done with !Letters' own commands (./StyleCmd through
// ./StyleDoc run and remove, ./StyleApply applyStyle) on a Document,
// as the windows make them. A file is written only when its bytes
// change, so a file open in Word is left alone; nothing else in the
// folder is touched or removed. Each file is read back and its
// styles and paragraphs listed in the README, so the list is what
// was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {createStyle, modifyStyle}
  from '../../tools/moreapps/!Letters/StyleCmd';
import * as SD from '../../tools/moreapps/!Letters/StyleDoc';
import {applyStyle} from '../../tools/moreapps/!Letters/StyleApply';
import * as S from '../../tools/moreapps/!Letters/Selection';
import * as E from '../../tools/moreapps/!Letters/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, p, r, REL, W_NS}
  from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {schemaChecker} from './roundtrip-lib.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 29, 12));
fs.mkdirSync(OUT, {recursive: true});
const xsd = schemaChecker();

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

/** A session on a Document, with a clock for Typing. */
function session(doc) {
  const d = new Document(doc);
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => now});
  const all = () => d.doc.sections.flatMap((s) => s.blocks);
  const para = (start) => {
    const b = all().find((x) => x.type === 'p' &&
      x.text.startsWith(start));
    if (!b) throw new Error('no paragraph starting ' +
      JSON.stringify(start));
    return b;
  };
  return {
    d, t, para, all,
    caret: (start, off = 0) => S.caret({id: para(start).id, off}),
    part: (start, from, to) => S.select({id: para(start).id, off: from},
      {id: para(start).id, off: to}),
    whole: (start) => S.select({id: para(start).id, off: 0},
      {id: para(start).id, off: para(start).text.length}),
    type(sel, text) {
      for (const ch of text) { now += 50; sel = t.type(sel, ch); }
      return sel;
    },
    enter(sel) { return t.command(() => E.splitPara(d, sel)); },
    /** Run a table change (a StyleCmd command) as one undo step. */
    cmd(change) {
      now += 2000;
      const res = SD.run(d, t, change);
      if (!res) throw new Error('the style command did nothing');
      return res;
    },
    apply(sel, id) { now += 2000; return applyStyle(d, t, sel, id); },
    remove(id) {
      now += 2000;
      if (!SD.remove(d, t, id)) throw new Error('could not delete ' + id);
    },
  };
}

const lines = [];
const say = (...x) => lines.push(...x);
const make = (spec) => (tbl) => createStyle(tbl, spec);
const modify = (id, patch) => (tbl) => {
  const x = modifyStyle(tbl, id, patch);
  return x && {table: x};
};

// ------------------------------------------------------------ read back

const props = (o) => Object.entries(o || {})
  .filter(([k]) => k !== 'extra')
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');

/** What a written file holds: the styles, then each paragraph. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const used = new Set(['Normal']);
  const blocksOf = [...doc.sections.map((x) => x.blocks),
    ...[...(doc.stories || new Map()).values()].map((x) => x.blocks)];
  const seen = (blocks) => {
    for (const b of blocks) {
      if (b.type !== 'p') continue;
      if (b.pStyle) used.add(b.pStyle);
      for (const x of b.runs || []) if (x.rStyle) used.add(x.rStyle);
    }
  };
  blocksOf.forEach(seen);
  const out = ['  styles (the custom ones and those in use; id: name, ' +
    'type, based on, next, link):'];
  for (const s of doc.styles.styles.values()) {
    if (s.type !== 'paragraph' && s.type !== 'character') continue;
    if (!s.custom && !used.has(s.id)) continue;
    const bits = [s.type, s.basedOn && 'based on ' + s.basedOn,
      s.next && 'next ' + s.next, s.link && 'link ' + s.link,
      s.custom && 'custom'].filter(Boolean).join(', ');
    out.push(`    ${s.id}: "${s.name}", ${bits}`);
    const pp = props(s.pPr), rp = props(s.rPr);
    if (pp) out.push(`      pPr ${pp}`);
    if (rp) out.push(`      rPr ${rp}`);
    if (s.extra && s.extra.length) {
      out.push('      kept as written: ' + s.extra.map((n) => n.name)
        .join(' '));
    }
    if (s.attrs) out.push('      element attributes kept: ' +
      s.attrs.map(([k, v]) => `${k}="${v}"`).join(' '));
  }
  out.push('  paragraphs:');
  let k = 0;
  const walk = (blocks, label) => {
    for (const b of blocks) {
      k++;
      if (b.type !== 'p') { out.push(`  ${label}${k}. (kept block)`); continue; }
      const runs = (b.runs || []).filter((x) => x.rStyle)
        .map((x) => `chars ${x.start}-${x.end} [${x.rStyle}]`);
      out.push(`  ${label}${String(k).padStart(2)}. ` +
        `${b.text.slice(0, 70)}${b.pStyle ? '   [' + b.pStyle + ']' : ''}` +
        `${runs.length ? '   ' + runs.join(' ') : ''}`);
    }
  };
  for (const sec of doc.sections) walk(sec.blocks, '');
  for (const [name, st] of doc.stories || []) {
    out.push(`  ${name}:`);
    walk(st.blocks, '   ');
  }
  return out;
}

const made = [];
async function save(name, doc, about) {
  const bytes = await writeDocx(doc, {date: DATE});
  const z = await readZip(bytes);
  const problems = lintPackage(z).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  let schema = 'schema check skipped';
  if (typeof xsd !== 'string') {
    const n = xsd.errors(z.get(doc.meta.mainPart)).size;
    const m = xsd.errors(z.get(doc.meta.stylesPart)).size;
    schema = `xmllint/wml.xsd: ${n} messages in the document, ${m} in ` +
      'the styles';
  }
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)}; ` +
    `lint clean; ${schema})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Letters wrote (read back from the saved file):',
    ...await describe(bytes));
}

const read = async (parts, opts) => readDocx(await buildDocx(parts, opts));

// ------------------------------------------------------------ 1: created

{
  const s = session(newDoc({date: DATE}));
  let c = S.caret({id: s.all()[0].id, off: 0});
  const texts = ['Created styles', 'Callout: a created paragraph style',
    'Plain text after it, in Normal.',
    'A sentence with a marked word inside it.', 'End'];
  texts.forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
  const callout = s.cmd(make({name: 'Callout', type: 'paragraph',
    basedOn: 'Normal', next: 'Normal', qFormat: true,
    pPr: {spacing: {before: 240, after: 240}, ind: {left: 720}},
    rPr: {b: true, color: 'C00000', sz: 26, szCs: 26}}));
  const marker = s.cmd(make({name: 'Marker', type: 'character',
    rPr: {b: true, highlight: 'yellow'}}));
  s.apply(s.caret('Callout'), callout.id);
  const t = s.para('A sentence').text;
  s.apply(s.part('A sentence', t.indexOf('marked'), t.indexOf('marked') + 6),
    marker.id);
  await save('st-1-created.docx', s.d.doc, [
    'A new document. "Callout" (a paragraph style: bold, dark red,',
    '13 pt, indented 0.5", 12 pt before and after, based on Normal,',
    'next paragraph Normal, shown in the gallery) is on line 2.',
    '"Marker" (a character style: bold on yellow) is on the word',
    '"marked" of line 4. Both were created in !Letters and are',
    'written with w:customStyle="1" and an id Word accepts.',
  ]);
}

// ------------------------------------------------------------ 2: modified

const DEFAULTS = '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts ' +
  'w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" ' +
  'w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/><w:sz w:val="22"/>' +
  '<w:szCs w:val="22"/><w:lang w:val="en-GB" w:eastAsia="en-US" ' +
  'w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
  '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr>' +
  '</w:pPrDefault></w:docDefaults>';
const LATENT = '<w:latentStyles w:defLockedState="0" ' +
  'w:defUIPriority="99" w:defSemiHidden="0" w:defUnhideWhenUsed="0" ' +
  'w:defQFormat="0" w:count="376"><w:lsdException w:name="Normal" ' +
  'w:uiPriority="0" w:qFormat="1"/><w:lsdException w:name="heading 1" ' +
  'w:uiPriority="9" w:qFormat="1"/><w:lsdException w:name="heading 2" ' +
  'w:semiHidden="1" w:uiPriority="9" w:unhideWhenUsed="1" ' +
  'w:qFormat="1"/></w:latentStyles>';
const STY = (id, name, o = {}) => `<w:style w:type="${o.type ||
  'paragraph'}"${o.def ? ' w:default="1"' : ''}${o.custom ?
  ' w:customStyle="1"' : ''} w:styleId="${id}"${o.attrs || ''}>` +
  `<w:name w:val="${name}"/>` +
  `${o.based ? `<w:basedOn w:val="${o.based}"/>` : ''}` +
  `${o.next ? `<w:next w:val="${o.next}"/>` : ''}` +
  `${o.link ? `<w:link w:val="${o.link}"/>` : ''}${o.more || ''}` +
  `${o.pPr ? `<w:pPr>${o.pPr}</w:pPr>` : ''}` +
  `${o.rPr ? `<w:rPr>${o.rPr}</w:rPr>` : ''}</w:style>`;
const NORMAL = STY('Normal', 'Normal', {def: true,
  more: '<w:qFormat/>'});
const DPF = STY('DefaultParagraphFont', 'Default Paragraph Font',
  {type: 'character', def: true, more: '<w:uiPriority w:val="1"/>' +
    '<w:semiHidden/><w:unhideWhenUsed/>'});
const doc = (body, styles, more = {}, opts) => read({
  'word/document.xml': documentXml(body),
  'word/styles.xml': stylesXml(styles), ...more}, opts);

{
  const styles = DEFAULTS + LATENT + NORMAL + DPF +
    STY('Heading1', 'heading 1', {based: 'Normal', next: 'Normal',
      more: '<w:uiPriority w:val="9"/><w:qFormat/>',
      pPr: '<w:keepNext/><w:keepLines/><w:spacing w:before="240" ' +
        'w:after="0"/><w:outlineLvl w:val="0"/>',
      rPr: '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme=' +
        '"majorHAnsi"/><w:color w:val="2F5496" w:themeColor="accent1" ' +
        'w:themeShade="BF"/><w:sz w:val="32"/><w:szCs w:val="32"/>'}) +
    STY('Note', 'Note', {custom: true, based: 'Normal', attrs:
      ' w:rsidR="00A1B2C3"', more: '<w:autoRedefine/><w:qFormat/>' +
      '<w:rsid w:val="00A1B2C3"/>', pPr: '<w:jc w:val="both"/>',
    rPr: '<w:i/><w:color w:val="595959"/>'});
  const d0 = await doc(
    p(r('Modified styles'), '<w:pStyle w:val="Heading1"/>') +
    p(r('A Note paragraph: justified, italic grey. '.repeat(6)),
      '<w:pStyle w:val="Note"/>') +
    p(r('Another heading'), '<w:pStyle w:val="Heading1"/>') +
    p(r('Normal text.')), styles);
  const s = session(d0);
  s.cmd(modify('Heading1', {rPr: {sz: 44, szCs: 44, color: 'C00000'},
    pPr: {spacing: {before: 360, after: 120}}}));
  s.cmd(modify('Note', {rPr: {i: null, b: true}, pPr: {jc: 'center',
    ind: {left: 720, right: 720}}}));
  await save('st-2-modified.docx', s.d.doc, [
    'A document in the shape Word writes (docDefaults with theme',
    'fonts, latent styles, a theme-coloured Heading 1, a style with a',
    'w:rsidR attribute and w:autoRedefine / w:rsid children). In',
    '!Letters: Heading 1 changed to 22 pt, dark red (C00000; the',
    'theme colour is replaced), 18 pt before and 6 pt after; Note',
    'changed from italic justified to bold centred with 0.5"',
    'indents. Every other style, the docDefaults and the latent',
    'styles are written exactly as they were.',
  ]);
}

// ------------------------------------------------------------ 3: deleted

{
  const FANCY = STY('Warning', 'Warning', {custom: true, based: 'Normal',
    more: '<w:qFormat/>', rPr: '<w:b/><w:color w:val="FF0000"/>'}) +
    STY('Loud', 'Loud', {type: 'character', custom: true,
      rPr: '<w:b/><w:u w:val="single"/>'});
  const warn = (t) => p(r(t), '<w:pStyle w:val="Warning"/>');
  const loud = (t) => p(r('a ') + r(t, '<w:rStyle w:val="Loud"/>') +
    r(' b'));
  const body = warn('Warning in the body (this style is deleted)') +
    loud('Loud run in the body') +
    '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/>' +
    '<w:left w:val="single" w:sz="4"/><w:bottom w:val="single" ' +
    'w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH ' +
    'w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>' +
    '</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/>' +
    '<w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW ' +
    'w:w="4500" w:type="dxa"/></w:tcPr>' + warn('Warning in a cell') +
    '</w:tc><w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>' +
    loud('Loud in a cell') + '</w:tc></w:tr></w:tbl>' +
    p(r('Normal text after the table.')) +
    '<w:sectPr><w:headerReference w:type="default" r:id="rId31"/>' +
    '<w:footerReference w:type="default" r:id="rId32"/><w:pgSz ' +
    'w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" ' +
    'w:bottom="1440" w:left="1440" w:header="708" w:footer="708" ' +
    'w:gutter="0"/></w:sectPr>';
  const d0 = await read({
    'word/document.xml': documentXml(body),
    'word/styles.xml': stylesXml(DEFAULTS + NORMAL + DPF + FANCY),
    'word/header1.xml': `<w:hdr xmlns:w="${W_NS}">` +
      warn('Warning in the header') + loud('Loud in the header') +
      '</w:hdr>',
    'word/footer1.xml': `<w:ftr xmlns:w="${W_NS}">` +
      warn('Warning in the footer') + loud('Loud in the footer') +
      '</w:ftr>',
  }, {docRels: [['rId31', REL('header'), 'header1.xml'],
    ['rId32', REL('footer'), 'footer1.xml']]});
  const s = session(d0);
  s.remove('Warning');
  s.remove('Loud');
  await save('st-3-deleted.docx', s.d.doc, [
    'Two custom styles, Warning (bold red paragraphs) and Loud (bold',
    'underlined characters), were used in the body, in a table cell,',
    'in the header and in the footer; both were deleted in !Letters',
    '(Styles window, Delete: the paragraphs go back to Normal and',
    'the runs to the paragraph font). No pStyle / rStyle naming them',
    'is left in the document, the header or the footer.',
  ]);
}

// ------------------------------------------------------------ 4: linked

{
  const s = session(newDoc({date: DATE}));
  let c = S.caret({id: s.all()[0].id, off: 0});
  ['Linked styles', 'Pull quote over a whole paragraph (paragraph half)',
    'Pull quote over only some words of this paragraph (character half)',
    'Quote at a caret: the text typed next gets it: ',
    'End'].forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
  const q = s.cmd(make({name: 'Pull Quote', type: 'paragraph',
    basedOn: 'Normal', link: true, qFormat: true,
    pPr: {ind: {left: 1080, right: 1080}, jc: 'center'},
    rPr: {i: true, color: '1F4E79', sz: 28, szCs: 28}}));
  s.apply(s.whole('Pull quote over a whole'), q.id);
  const t = s.para('Pull quote over only').text;
  s.apply(s.part('Pull quote over only', t.indexOf('some words'),
    t.indexOf('some words') + 10), q.id);
  s.cmd(modify(q.id, {rPr: {b: true}}));
  await save('st-4-linked.docx', s.d.doc, [
    '"Pull Quote" (paragraph) and "Pull Quote Char" (character) are',
    'linked (w:link both ways), made in !Letters. Line 2: the whole',
    'paragraph has the paragraph style. Line 3: only "some words"',
    'have the character half. After that the style was changed to',
    'add bold: both halves hold the bold (the rPr change goes to',
    'both). Word shows the pair as one gallery entry "Pull Quote".',
  ]);
}

// ------------------------------------------------------------ 5: based on

{
  const s = session(newDoc({date: DATE}));
  let c = S.caret({id: s.all()[0].id, off: 0});
  ['Based on chain', 'Alpha paragraph', 'Beta paragraph',
    'Gamma paragraph', 'Plain paragraph'].forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
  const a = s.cmd(make({name: 'Alpha', type: 'paragraph',
    basedOn: 'Normal', rPr: {color: '1F4E79', sz: 26, szCs: 26}}));
  const b = s.cmd(make({name: 'Beta', type: 'paragraph',
    basedOn: a.id, rPr: {i: true}}));
  const g = s.cmd(make({name: 'Gamma', type: 'paragraph',
    basedOn: b.id, pPr: {jc: 'right'}}));
  s.apply(s.caret('Alpha paragraph'), a.id);
  s.apply(s.caret('Beta paragraph'), b.id);
  s.apply(s.caret('Gamma paragraph'), g.id);
  s.cmd(modify(a.id, {rPr: {color: '7030A0', b: true}}));
  s.remove(b.id);
  await save('st-5-basedon.docx', s.d.doc, [
    'Alpha (blue 13 pt) > Beta (italic) > Gamma (right aligned) in',
    '!Letters. Alpha was then changed to bold purple, and Beta was',
    'deleted: Gamma is now based on Alpha, its text keeps the',
    'purple bold 13 pt (from Alpha) but not the italic, and is still',
    'right aligned; the Beta paragraph is Normal again.',
  ]);
}

// ------------------------------------------------------------ 6: theme

{
  const THEME = '<?xml version="1.0" encoding="UTF-8" standalone=' +
    '"yes"?>\r\n<a:theme xmlns:a="http://schemas.openxmlformats.org/' +
    'drawingml/2006/main" name="Office Theme"><a:themeElements>' +
    '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" ' +
    'lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" ' +
    'lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2>' +
    '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr ' +
    'val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/>' +
    '</a:accent2></a:clrScheme><a:fontScheme name="Office"><a:majorFont>' +
    '<a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/>' +
    '</a:majorFont><a:minorFont><a:latin typeface="Georgia"/><a:ea ' +
    'typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '</a:themeElements></a:theme>';
  const styles = DEFAULTS + NORMAL + DPF +
    STY('Display', 'Display', {custom: true, based: 'Normal',
      more: '<w:qFormat/>', rPr: '<w:rFonts w:asciiTheme="majorHAnsi" ' +
        'w:hAnsiTheme="majorHAnsi"/><w:color w:val="4472C4" ' +
        'w:themeColor="accent1"/><w:sz w:val="40"/>'}) +
    STY('Accent', 'Accent', {custom: true, based: 'Normal',
      more: '<w:qFormat/>', rPr: '<w:color w:val="ED7D31" ' +
        'w:themeColor="accent2"/>'});
  const d0 = await doc(
    p(r('Display style: theme heading font (Cambria), accent 1 blue'),
      '<w:pStyle w:val="Display"/>') +
    p(r('Accent style: theme body font (Georgia), accent 2 orange'),
      '<w:pStyle w:val="Accent"/>') + p(r('Normal: theme body font.')),
  styles, {'word/theme/theme1.xml': THEME},
  {docRels: [['rId41', REL('theme'), 'theme/theme1.xml']]});
  const s = session(d0);
  s.cmd(modify('Display', {rPr: {sz: 52, szCs: 52}}));
  s.cmd(modify('Accent', {rPr: {b: true}}));
  await save('st-6-themefont.docx', s.d.doc, [
    'A theme with Cambria (headings) and Georgia (body) and two',
    'custom styles that name them by theme (w:asciiTheme, and a',
    'w:themeColor on the colour). In !Letters Display was made 26 pt',
    'and Accent bold: the theme font and the theme colour attributes',
    'are not replaced (only a colour or font chosen in !Letters',
    'would). The theme part is written as it was read.',
  ]);
}

// ------------------------------------------------------------ 7: name

{
  const styles = DEFAULTS + NORMAL + DPF +
    STY('Title2', 'Title', {custom: true, based: 'Normal',
      rPr: '<w:b/><w:sz w:val="48"/>'}) +
    STY('H1x', 'heading 1', {custom: true, based: 'Normal',
      pPr: '<w:outlineLvl w:val="0"/>', rPr: '<w:i/>'});
  const d0 = await doc(
    p(r('Custom style named Title (id Title2)'),
      '<w:pStyle w:val="Title2"/>') +
    p(r('Custom style named heading 1 (id H1x)'),
      '<w:pStyle w:val="H1x"/>') + p(r('Normal text.')), styles);
  const s = session(d0);
  s.cmd(modify('Title2', {rPr: {color: '1F4E79'}}));
  const refused = createStyle(s.d.doc.styles, {name: 'Heading 1',
    type: 'paragraph'});
  const refused2 = createStyle(s.d.doc.styles, {name: 'title',
    type: 'paragraph'});
  await save('st-7-builtin-name.docx', s.d.doc, [
    'Two custom styles (w:customStyle="1") whose names are those of',
    'Word built-ins: "Title" (id Title2) and "heading 1" (id H1x), as',
    'a file from another program may have. In !Letters Title2 was',
    'made blue. Making a new style named "Heading 1" or "title" is',
    refused || refused2 ? 'made, which is wrong.' :
      'refused in !Letters (no style is made).',
  ]);
}

// ------------------------------------------------------------ 8: latent

{
  const d0 = await doc(p(r('Latent built-ins')) + p(r('Some text')) +
    p(r('A second heading')) + p(r('More text')),
  LATENT + NORMAL + DPF);
  const s = session(d0);
  s.apply(s.caret('Latent built-ins'), 'Heading1');
  s.apply(s.caret('A second heading'), 'Heading2');
  await save('st-8-latent.docx', s.d.doc, [
    'A document whose styles part had no Heading 1 or Heading 2 (only',
    'latent entries). Line 1 got Heading 1 and line 3 Heading 2 in',
    '!Letters, which wrote each into the styles part on first use,',
    'with Word\'s own definition (Heading 2 is based on Normal, next',
    'Normal, bold, 13 pt, outline level 2; Heading 1 is bold 16 pt).',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  'Styles (!Letters Batch E1: the Styles window, the Modify / New',
  'Style box, the gallery, the Format menu\'s style commands): the',
  'real-Word hand-off',
  '(made by node tests/moreapps/handoff-styles.mjs; local only, this',
  'folder is never committed)',
  '',
  'Every file is a document !Letters read and wrote itself, after',
  'its own style commands (Create, Modify, Delete, Apply). Each was',
  'written, checked by the package lint, read back by !Letters, and',
  'its styles and paragraphs are listed below under the file, so the',
  'list is what was really written. Open each in !Letters too and',
  'compare.',
  '',
  'PRIORITY: the questions may be too many for one session. Take',
  'these 5 first, in this order: the files that could show a repair',
  'prompt (a style rebuilt by !Letters, a style part written for the',
  'first time, ids Word may refuse). Everything else is "if time',
  'allows".',
  '',
  '  1. Smoke test: open EVERY st-*.docx once. Note any repair prompt',
  '     or "unreadable content" message and which file (st-1, st-2,',
  '     st-8 above all). ST1.',
  '  2. st-1-created: ST2, ST3 (does the created style show in the',
  '     gallery and Styles pane, with its look, and can it be',
  '     edited in Word?).',
  '  3. st-2-modified: ST4, ST5 (the modified styles look right and',
  '     the theme colour / rsid attributes are not a problem).',
  '  4. st-3-deleted: ST6 (nothing left over, no repair, the',
  '     header and footer look right).',
  '  5. st-8-latent: ST7 (the written Heading 1 and 2 are what Word',
  '     would write; the outline and navigation pane).',
  '',
  'Questions',
  '---------',
  'ST1 Does any st-*.docx show a repair prompt, or lose a style, a',
  '    paragraph or the header / footer when opened?',
  'ST2 st-1: is "Callout" in the gallery (Home > Styles) after the',
  '    built-ins, with bold dark red text? Does the paragraph look',
  '    like its description (indent 0.5", 12 pt before and after)?',
  '    Is "Marker" in the Styles pane as a character style, and does',
  '    "marked" show bold on yellow?',
  'ST3 st-1: right-click Callout > Modify: does Word show the values',
  '    in the description (based on Normal, next style Normal)? Does',
  '    Word treat the id (Callout, Marker) as it would its own?',
  'ST4 st-2: Heading 1 is 22 pt dark red, 18 pt before and 6 pt',
  '    after? Is the Note style bold, centred, with 0.5" indents?',
  '    Does Word still show its quick-style gallery as before (the',
  '    latent styles kept)?',
  'ST5 st-2: Note keeps w:rsidR on the style element, w:autoRedefine',
  '    and w:rsid. Does Word keep "Automatically update" ticked in',
  '    the Modify box? Any complaint about the unknown attribute?',
  '    (w:rsidR on w:style is not in the schema: xmllint reports it',
  '    for this file, and for the file as it was made, on purpose: it',
  '    tests that !Letters keeps what it does not know.)',
  'ST6 st-3: are the Warning and Loud styles gone from the Styles',
  '    pane? Do the paragraphs (body, cell, header, footer) look',
  '    like Normal text? (Word does the same when a style is',
  '    deleted.)',
  'ST7 st-8: are Heading 1 and Heading 2 in the gallery? !Letters\'',
  '    definitions are bold black 16 pt and 13 pt (Word\'s own are',
  '    Calibri Light blue): is that acceptable to Word without a',
  '    message? Does the Navigation pane list both headings? What',
  '    does Word write for them when it saves the file (compare the',
  '    w:style elements)?',
  'ST8 st-4: is "Pull Quote" one gallery entry (linked style)? Is',
  '    "some words" in line 3 shown with the character half (italic,',
  '    blue, 14 pt) and not the whole paragraph? Is Bold in both',
  '    halves after the change? Does Word show "Linked (paragraph',
  '    and character)" in the Modify box?',
  'ST9 st-5: does Gamma look as described (purple bold 13 pt, right',
  '    aligned, not italic)? Is Beta gone? Is Gamma "based on Alpha"',
  '    in the Modify box?',
  'ST10 st-6: do Display and Accent still use Cambria and Georgia (the',
  '    theme fonts) and the accent colours after the size / bold',
  '    changes? After Design > Fonts to another font set, do they',
  '    follow the theme?',
  'ST11 st-7: how does Word treat a custom style named "Title" or',
  '    "heading 1" (id Title2, H1x)? Does it merge it with the',
  '    built-in, rename it, or list it twice? Does the file open',
  '    without a message?',
  'ST12 Word\'s own behaviour to compare (no file): create a style in',
  '    Word with a name like a built-in; what id and customStyle',
  '    value does it write? Does Word write a created style\'s',
  '    w:uiPriority / w:qFormat the same way !Letters does?',
  ...lines,
  '',
];
/** A line of at most 72 characters, or its pieces (indented). */
function wrap(line) {
  if (line.length <= 72) return [line];
  const ind = line.match(/^ */)[0] + '    ';
  const out = [];
  let cur = line;
  while (cur.length > 72) {
    let at = cur.lastIndexOf(' ', 72);
    if (at <= ind.length) at = cur.indexOf(' ', ind.length + 1);
    if (at < 0) break;
    out.push(cur.slice(0, at));
    cur = ind + cur.slice(at + 1);
  }
  out.push(cur);
  return out;
}
const how = put('st-README.txt', Buffer.from(
  README.flatMap(wrap).join('\n'), 'utf8'));
made.push(`st-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
