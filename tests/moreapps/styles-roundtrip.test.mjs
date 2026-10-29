// Styles round trip (Batch E1): documents whose styles were changed
// with !Letters' style commands (./StyleCmd through ./StyleDoc run
// and remove, ./StyleApply applyStyle: what the Styles window, the
// Modify Style box and the gallery run), mixed with undo and redo;
// then written and read back.
// The checks are those of roundtrip-lib.mjs: the model read back
// equals the changed model; every block passes ModelCheck; the
// package linter and xmllint/wml.xsd (when available, for one seed)
// add no error; undo of everything gives back the opened model and
// its bytes. Besides (the fidelity rules of the spec):
//   - an unchanged styles part is written as the tree it was read
//     (byte for byte when the file was written as the writer does);
//   - modifying one style rewrites only that w:style (and its
//     linked mate): docDefaults, latentStyles and every other style
//     come out serialized as without the change; the unknown
//     children and attributes of the modified style stay;
//   - a created style has w:customStyle="1", a unique valid id, and
//     is written after the existing styles;
//   - a deleted style's uses are gone from the body, its table
//     cells, headers and footers, and the file lints clean;
//   - the theme part is byte-identical after any style change;
//   - a latent built-in applied is added with its base;
//   - hostile files (Based on cycles, missing targets, duplicate
//     ids, __proto__ names, 10,000 styles) never throw or hang.
//
// The byte-for-byte rule (an unchanged part is written as it was
// read) is checked as tree equality plus per-node string equality:
// the writer writes its own prolog and drops the indentation between
// children, so the bytes themselves match only for a file written as
// the writer does (asserted on one such fixture, and counted for the
// corpus, where a floor on the files compared is asserted).
//
// Documents: the reader fixtures, the list fixtures, styles of every
// kind, uses in cells / headers / footers, and the corpus sample,
// gated as the other round trips (one file in ten by a hash of the
// name; WORD_EDIT_CORPUS=1 for every file, which needs
// NODE_OPTIONS=--max-old-space-size=2048). 40 seeded commands per
// file.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIXTURES} from './docx-fixtures.mjs';
import {LIST_DOCS} from './list-fixtures.mjs';
import {buildDocx, documentXml, stylesXml, p, r, REL, W_NS}
  from './build-docx.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL,
  SKIP_CORPUS, write} from './roundtrip-lib.mjs';
import {lintPackage} from './lint-package.mjs';
import {sameTree, sameBytes} from './docx-compare.mjs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {rng, tm, loadStyles} from './word-docs.mjs';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {createStyle, modifyStyle}
  from '../../tools/moreapps/!Letters/StyleCmd';
import * as SD from '../../tools/moreapps/!Letters/StyleDoc';
import {applyStyle} from '../../tools/moreapps/!Letters/StyleApply';
import * as SL from '../../tools/moreapps/!Letters/StyleList';
import {RPR_FIELDS, PPR_FIELDS}
  from '../../tools/moreapps/!Letters/PropNames';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';

export const STEPS = 40;
const BURST_MS = 3000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const allBlocks = (d) => d.doc.sections.flatMap((s) => s.blocks);
const dec = new TextDecoder();

// ------------------------------------------------------------ helpers

/** The root of a part of written bytes. */
async function rootOf(bytes, name) {
  const z = await readZip(bytes);
  const b = z.get(name);
  assert.ok(b, name + ' is in the file');
  return parseXml(dec.decode(b).replace(/^﻿/, '')).root;
}

const elKids = (n) => n.children.filter((c) => typeof c === 'object');
const local = (n) => String(n.name).replace(/^.*:/, '');
const attr = (n, k) => (n.attrs.find(([a]) => a === k) || [])[1];
const ser = (n) => JSON.stringify(n);
/** n without its whitespace-only text (the writer does not indent). */
const strip = (n) => (typeof n === 'string' ? n : {...n, children:
  n.children.filter((c) => typeof c !== 'string' || c.trim())
    .map(strip)});
const styleKids = (root) => elKids(root).filter((c) =>
  local(c) === 'style');
const styleNode = (root, id) => styleKids(root).find((c) =>
  attr(c, 'w:styleId') === id);

/** A session on a Document read from bytes. */
async function open(bytes) {
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  return {d, t};
}

/** change(table) -> a StyleDoc result for a modifyStyle patch. */
const modify = (id, patch) => (tbl) => {
  const x = modifyStyle(tbl, id, patch);
  return x && {table: x};
};
const create = (spec) => (tbl) => createStyle(tbl, spec);

const stylesName = (d) => d.doc.meta.stylesPart || 'word/styles.xml';

const errsOf = (z) => lintPackage(z).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

// ------------------------------------------------------------ the burst

/** A random position in a paragraph of the body. */
function randSel(rd, d) {
  const ps = allBlocks(d).filter((b) => b.type === 'p');
  if (!ps.length) return null;
  const at = (b) => ({id: b.id, off: rd() < 0.5 ? 0 :
    Array.from(b.text).length});
  const a = pick(rd, ps);
  if (rd() < 0.4) return S.caret(at(a));
  return S.select({id: a.id, off: 0}, at(pick(rd, ps)));
}

const COLOURS = ['FF0000', '00AA00', '0000FF', '808080'];
const RPRS = [{b: true}, {i: true}, {sz: 28, szCs: 28}, {b: null},
  {color: pick(rng(1), COLOURS)}, {sz: null, szCs: null},
  {rFonts: {ascii: 'Arial', hAnsi: 'Arial'}}];
const PPRS = [{jc: 'center'}, {jc: null}, {spacing: {after: 240}},
  {ind: {left: 720}}, {keepNext: true}];

/** One random command; [kind, selection after]. */
function command(rd, d, t, sel, k) {
  const x = rd();
  if (x < 0.12) {
    let n = 1 + Math.floor(rd() * 5);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return ['undo/redo', sel];
  }
  const tbl = d.doc.styles;
  const ids = tbl ? [...tbl.styles.values()].filter((s) =>
    s.type === 'paragraph' || s.type === 'character').map((s) => s.id)
    : [];
  if (x < 0.4) {
    if (!sel) return ['none', sel];
    const list = SL.all(d.doc).map((e) => e.id);
    const id = rd() < 0.05 ? 'NoSuchStyle' : pick(rd, list.length ?
      list : ['Normal']);
    try {
      const res = applyStyle(d, t, sel, id, undefined);
      return ['apply', (res && res.sel) || sel];
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      return ['apply refused', sel];
    }
  }
  if (!tbl) return ['none', sel];
  if (x < 0.55) {
    const type = rd() < 0.7 ? 'paragraph' : 'character';
    const same = ids.filter((i) => tbl.styles.get(i).type === type);
    const res = SD.run(d, t, create({name: 'Burst ' + k, type,
      basedOn: rd() < 0.6 && same.length ? pick(rd, same) : undefined,
      rPr: pick(rd, RPRS), pPr: type === 'paragraph' ? pick(rd, PPRS)
        : undefined, link: type === 'paragraph' && rd() < 0.3,
      qFormat: rd() < 0.5}));
    return [res ? 'create' : 'create refused', sel];
  }
  if (x < 0.82) {
    if (!ids.length) return ['none', sel];
    const id = pick(rd, ids);
    const s = tbl.styles.get(id);
    const patch = {rPr: pick(rd, RPRS)};
    if (s.type === 'paragraph' && rd() < 0.5) patch.pPr = pick(rd, PPRS);
    if (rd() < 0.15) {
      const o = pick(rd, ids);
      patch.basedOn = rd() < 0.2 ? null : o;
    }
    const res = SD.run(d, t, modify(id, patch));
    return [res ? 'modify' : 'modify refused', sel];
  }
  if (x < 0.95) {
    if (!ids.length) return ['none', sel];
    const ok = SD.remove(d, t, pick(rd, ids));
    return [ok ? 'delete' : 'delete refused', sel];
  }
  if (!ids.length) return ['none', sel];
  const id = pick(rd, ids);
  const res = SD.run(d, t, modify(id, {name: 'Renamed ' + k}));
  return [res ? 'rename' : 'rename refused', sel];
}

/** STEPS commands on d. */
export function stylesAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let sel = null;
  const counts = {};
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > BURST_MS) break;
    if (!sel || rd() < 0.6) sel = randSel(rd, d);
    let kind = '?';
    const depth = d.undoDepth;
    try {
      [kind, sel] = command(rd, d, t, sel, k);
      if (every) for (const b of allBlocks(d)) checkBlock(b);
      if (kind.endsWith(' refused')) {
        assert.equal(d.undoDepth, depth, kind + ': no undo step');
      }
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
    if (d.undoDepth > depth) {
      counts[kind + ' changed'] = (counts[kind + ' changed'] || 0) + 1;
    }
  }
  for (const b of allBlocks(d)) checkBlock(b);
  return {steps: k, capped: k < STEPS, counts};
}

export const KINDS = ['apply', 'create', 'modify', 'delete', 'rename',
  'undo/redo'];

// ------------------------------------------------------------ documents

const STY = (id, name, o = {}) => `<w:style w:type="${o.type ||
  'paragraph'}"${o.def ? ' w:default="1"' : ''}${o.custom ?
  ' w:customStyle="1"' : ''} w:styleId="${id}"><w:name w:val="${name}"/>` +
  `${o.based ? `<w:basedOn w:val="${o.based}"/>` : ''}` +
  `${o.next ? `<w:next w:val="${o.next}"/>` : ''}` +
  `${o.link ? `<w:link w:val="${o.link}"/>` : ''}` +
  `${o.more || ''}${o.pPr ? `<w:pPr>${o.pPr}</w:pPr>` : ''}` +
  `${o.rPr ? `<w:rPr>${o.rPr}</w:rPr>` : ''}</w:style>`;
const DEFAULTS = '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts ' +
  'w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz ' +
  'w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
  '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr>' +
  '</w:pPrDefault></w:docDefaults>';
const LATENT = '<w:latentStyles w:defLockedState="0" ' +
  'w:defUIPriority="99" w:defSemiHidden="0" w:defUnhideWhenUsed="0" ' +
  'w:defQFormat="0" w:count="3"><w:lsdException w:name="Normal" ' +
  'w:uiPriority="0" w:qFormat="1"/><w:lsdException w:name="heading 1" ' +
  'w:uiPriority="9" w:qFormat="1"/></w:latentStyles>';
const KINDS_STYLES = stylesXml(DEFAULTS + LATENT +
  STY('Normal', 'Normal', {def: true}) +
  STY('DefaultParagraphFont', 'Default Paragraph Font',
    {type: 'character', def: true, more: '<w:uiPriority w:val="1"/>' +
      '<w:semiHidden/><w:unhideWhenUsed/>'}) +
  STY('Plain', 'Plain', {custom: true, based: 'Normal',
    next: 'Plain', more: '<w:autoRedefine/><w:qFormat/>' +
      '<w:rsid w:val="00A1B2C3"/>',
    pPr: '<w:spacing w:before="120" w:after="60"/>' +
      '<w:jc w:val="both"/>', rPr: '<w:rFonts w:asciiTheme=' +
      '"majorHAnsi"/><w:color w:val="1F3763" w:themeColor="accent1" ' +
      'w:themeShade="80"/><w:sz w:val="26"/>'}) +
  STY('Child', 'Child', {custom: true, based: 'Plain',
    rPr: '<w:i/>'}) +
  STY('Grand', 'Grand', {custom: true, based: 'Child',
    rPr: '<w:b/>'}) +
  STY('Linked', 'Linked', {custom: true, based: 'Normal',
    link: 'LinkedChar', rPr: '<w:u w:val="single"/>'}) +
  STY('LinkedChar', 'Linked Char', {type: 'character', custom: true,
    link: 'Linked', rPr: '<w:u w:val="single"/>'}) +
  STY('Strong', 'Strong', {type: 'character', rPr: '<w:b/>'}) +
  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val=' +
  '"Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single"/>' +
  '</w:tblBorders></w:tblPr></w:style>' +
  '<w:style w:type="numbering" w:default="1" w:styleId="NoList">' +
  '<w:name w:val="No List"/></w:style>');
const kindsDoc = () => buildDocx({'word/document.xml': documentXml(
  p(r('Plain'), '<w:pStyle w:val="Plain"/>') +
  p(r('Child'), '<w:pStyle w:val="Child"/>') +
  p(r('Grand ') + r('strong', '<w:rStyle w:val="Strong"/>'),
    '<w:pStyle w:val="Grand"/>') +
  p(r('Linked'), '<w:pStyle w:val="Linked"/>') +
  p(r('Heading'), '<w:pStyle w:val="Heading1"/>') +
  p(r('Normal'))), 'word/styles.xml': KINDS_STYLES});

const LATENT_STYLES = stylesXml(LATENT + STY('Normal', 'Normal',
  {def: true}) + STY('Mine', 'Mine', {custom: true, based: 'Normal'}));
const latentDoc = () => buildDocx({'word/document.xml': documentXml(
  p(r('Some text')) + p(r('More text'), '<w:pStyle w:val="Mine"/>')),
'word/styles.xml': LATENT_STYLES});

const FANCY = STY('Fancy', 'Fancy', {custom: true, based: 'Normal',
  rPr: '<w:b/>'}) + STY('FancyRun', 'Fancy Run', {type: 'character',
  custom: true, rPr: '<w:i/>'});
const USES_STYLES = stylesXml(DEFAULTS +
  STY('Normal', 'Normal', {def: true}) + FANCY);
const fancy = (t) => p(r(t), '<w:pStyle w:val="Fancy"/>');
const fancyRun = (t) => p(r('a ') + r(t, '<w:rStyle w:val="FancyRun"/>'));
const HDR = (inner) => `<w:hdr xmlns:w="${W_NS}">${inner}</w:hdr>`;
const FTR = (inner) => `<w:ftr xmlns:w="${W_NS}">${inner}</w:ftr>`;
const usesDoc = (extra = {}) => () => buildDocx({
  'word/document.xml': documentXml(fancy('Body one') + fancyRun('run') +
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>' +
    '<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>' +
    fancy('In a cell') + fancyRun('cell run') + '</w:tc></w:tr>' +
    '</w:tbl>' + p(r('After')) +
    '<w:sectPr><w:headerReference w:type="default" r:id="rId31"/>' +
    '<w:footerReference w:type="default" r:id="rId32"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/></w:sectPr>'),
  'word/styles.xml': USES_STYLES,
  'word/header1.xml': HDR(fancy('Header') + fancyRun('hdr run')),
  'word/footer1.xml': FTR(fancy('Footer') + fancyRun('ftr run')),
  ...extra,
}, {docRels: [['rId31', REL('header'), 'header1.xml'],
  ['rId32', REL('footer'), 'footer1.xml']]});

const THEME = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '\r\n<a:theme xmlns:a="http://schemas.openxmlformats.org/' +
  'drawingml/2006/main" name="Office Theme"><a:themeElements>' +
  '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText"/>' +
  '</a:dk1><a:accent1><a:srgbClr val="4472C4"/></a:accent1>' +
  '</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin ' +
  'typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin ' +
  'typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements>' +
  '</a:theme>';
const themeDoc = () => buildDocx({'word/document.xml': documentXml(
  p(r('Themed'), '<w:pStyle w:val="Plain"/>')),
'word/styles.xml': KINDS_STYLES, 'word/theme/theme1.xml': THEME},
{docRels: [['rId41', REL('theme'), 'theme/theme1.xml']],
  extDefaults: []});

const MORE = [
  ['styles of every kind', kindsDoc],
  ['a latent Heading 1 (styles part without it)', latentDoc],
  ['uses in body, cells, header and footer', usesDoc()],
  ['a theme part', themeDoc],
];

const {xsd, note: xsdNote} = schema();
const DOCS = [...FIXTURES, ...LIST_DOCS, ...MORE];

// ------------------------------------------------------------ generated

describe('styles round trip: generated documents', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          stylesAll, {xsd: k === 0 ? xsd : null, every: true,
            stories: true});
        if (res.refused) continue;
        for (const [c, n] of Object.entries(res.counts || {}))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every kind of command ran and changed documents', () => {
    console.log('# style commands (generated): ' + JSON.stringify(total));
    for (const kind of KINDS) {
      assert.ok(total[kind] > 5, kind + ' ran: ' + JSON.stringify(total));
    }
    for (const kind of ['apply', 'create', 'modify', 'delete']) {
      assert.ok(total[kind + ' changed'] > 0, kind + ' changed');
    }
    assert.ok(Object.keys(total).some((k) => k.endsWith(' refused')),
      'a refused command ran');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

// ------------------------------------------------------------ fidelity

const MODELLED = new Set([...RPR_FIELDS.values(), ...PPR_FIELDS.values()]);

/**
 * Fidelity of the styles part of one file: unchanged, it is written
 * as the tree it was read; changing one style rewrites only that
 * w:style (and its mate). Returns {bytes: true when the written part
 * has the very bytes of the file's}.
 */
async function fidelity(bytes, what, seed) {
  let doc;
  try {
    doc = await readDocx(bytes);
  } catch (e) {
    return {skipped: true};
  }
  const name = doc.meta.stylesPart;
  if (!name || doc.meta.stylesGenerated) return {skipped: true};
  const zin = await readZip(bytes);
  const out0 = await write(doc);
  const z0 = await readZip(out0);
  const was = parseXml(dec.decode(zin.get(name)).replace(/^﻿/, ''));
  const now = parseXml(dec.decode(z0.get(name)).replace(/^﻿/, ''));
  const sorted = (x) => strip(x).children.map(ser).sort();
  if (doc.styles.extraStyles.length) {
    // (duplicate ids and unknown types are written last)
    assert.deepEqual(sorted(now.root), sorted(was.root),
      what + ': unchanged styles part');
  } else {
    sameTree(strip(now.root), strip(was.root),
      what + ': unchanged styles part');
  }
  const same = sameBytes(z0.get(name), zin.get(name));
  // modify one style of the file
  const d = new Document(doc);
  d.clearHistory();
  const t = new Typing(d, {now: () => 0});
  const tbl = d.doc.styles;
  const cands = [...tbl.styles.values()].filter((s) => s.raw &&
    (s.type === 'paragraph' || s.type === 'character'));
  if (!cands.length) return {bytes: same};
  const pickd = cands[seed % cands.length];
  const res = SD.run(d, t, modify(pickd.id, {rPr: {b: true, sz: 30,
    szCs: 30}}));
  if (!res) return {bytes: same};
  const changed = new Set([pickd.id]);
  if (pickd.link != null) changed.add(pickd.link);
  const out1 = await write(d.doc);
  const root1 = (await rootOf(out1, name));
  const root0 = (await rootOf(out0, name));
  const k0 = elKids(root0), k1 = elKids(root1);
  assert.equal(k1.length, k0.length, what + ': same children');
  k0.forEach((c, i) => {
    const id = local(c) === 'style' ? attr(c, 'w:styleId') : null;
    if (id !== null && changed.has(id)) return;
    assert.equal(ser(k1[i]), ser(c), what + ': child ' + i + ' ' +
      local(c) + ' ' + id + ' is untouched');
  });
  const a = styleNode(root0, pickd.id), b = styleNode(root1, pickd.id);
  for (const [k, v] of a.attrs) {
    assert.equal(attr(b, k), v, what + ': ' + pickd.id + ' keeps ' + k);
  }
  const mine = new Set(['name', 'basedOn', 'next', 'link', 'uiPriority',
    'qFormat', 'semiHidden', 'unhideWhenUsed', 'locked', 'pPr', 'rPr']);
  const have = new Set(elKids(b).map(ser));
  for (const c of elKids(a)) {
    if (mine.has(local(c))) continue;
    assert.ok(have.has(ser(c)), what + ': ' + pickd.id + ' keeps ' +
      local(c));
  }
  for (const part of ['pPr', 'rPr']) {
    const pa = elKids(a).find((c) => local(c) === part);
    const pb = elKids(b).find((c) => local(c) === part);
    if (!pa) continue;
    assert.ok(pb || !elKids(pa).length, what + ': ' + pickd.id + ' ' +
      part + ' kept: ' + ser(pa));
    if (!pb) continue;
    // (a modelled property is written again, its attributes in the
    // writer's order: it must be there; any other child as it was)
    const set = new Set(elKids(pb).map(ser));
    const names = new Set(elKids(pb).map(local));
    for (const c of elKids(pa)) {
      if (['b', 'bCs', 'sz', 'szCs'].includes(local(c))) continue;
      assert.ok(set.has(ser(c)) || (names.has(local(c)) &&
        MODELLED.has(local(c))), what + ': ' + pickd.id + ' ' + part +
        ' keeps ' + local(c));
    }
  }
  return {bytes: same};
}

describe('styles round trip: fidelity (generated)', () => {
  for (const [name, make] of DOCS) {
    it(name, async () => {
      await fidelity(await make(), name, hash(name));
    });
  }
});

describe('styles round trip: pinned cases', () => {
  it('an unchanged styles part is written as the tree it was read',
    async () => {
      const bytes = await kindsDoc();
      const doc = await readDocx(bytes);
      const mine = await write(doc);
      const z0 = await readZip(mine);
      const z1 = await readZip(await write(await readDocx(mine)));
      assert.ok(sameBytes(z0.get('word/styles.xml'),
        z1.get('word/styles.xml')), 'written twice: the same bytes');
      // a file as the writer writes it comes back with its very bytes
      assert.equal((await fidelity(mine, 'kinds, as written', 0)).bytes,
        true);
      // one written otherwise: the same tree (indentation aside)
      await fidelity(bytes, 'kinds', 0);
    });

  it('the attributes of a w:style element are kept when it is rebuilt',
    async () => {
      const W14 = 'http://schemas.microsoft.com/office/word/2010/' +
        'wordml';
      const attrs = ' w14:paraId="1A2B3C4D" xmlns:q="urn:q" q:k="v"' +
        ' x:type="foreign" x:default="d" x:customStyle="c" ' +
        'x:styleId="i" xmlns:x="urn:x"';
      const mk = (ns, o) => buildDocx({'word/document.xml': documentXml(
        p(r('x'), '<w:pStyle w:val="Mine"/>'), o),
      'word/styles.xml': stylesXml(STY('Mine', 'Mine', {custom: true})
        .replace('w:styleId="Mine"', 'w:styleId="Mine"' + attrs),
      {ns}).replace('<w:styles ', '<w:styles xmlns:w14="' + W14 +
        '" ')}, {strict: o && o.ns !== W_NS});
      const STRICT = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
      for (const [what, ns, o] of [['transitional', W_NS],
        ['strict', STRICT, {ns: STRICT, rNs: 'http://purl.oclc.org/' +
          'ooxml/officeDocument/relationships'}]]) {
        const s = await open(await mk(ns, o));
        const was = s.d.doc.styles.styles.get('Mine').attrs;
        assert.ok(was && was.some(([k]) => k === 'x:type'), what +
          ': a foreign attribute named type is kept in attrs');
        SD.run(s.d, s.t, modify('Mine', {rPr: {b: true}}));
        const out = await write(s.d.doc);
        const n = styleNode(await rootOf(out, 'word/styles.xml'), 'Mine');
        for (const [k, v] of was) assert.equal(attr(n, k), v, what +
          ': ' + k + ' kept');
        assert.equal(attr(n, 'w:styleId'), 'Mine');
        assert.equal(attr(n, 'x:styleId'), 'i');
        assert.equal(attr(n, 'w14:paraId'), '1A2B3C4D');
        assert.equal(attr(n, 'xmlns:q'), 'urn:q');
        // the file reads back, with the same attributes
        const back = await readDocx(out);
        assert.deepEqual(back.styles.styles.get('Mine').attrs, was);
        assert.equal(back.styles.styles.get('Mine').rPr.b, true);
      }
    });

  it('a modified style keeps its unknown children and attributes',
    async () => {
      const styles = KINDS_STYLES.replace('<w:style w:type="paragraph" ' +
        'w:customStyle="1" w:styleId="Plain">', '<w:style w:type=' +
        '"paragraph" w:customStyle="1" w:styleId="Plain" w:rsidR="00AB">');
      assert.notEqual(styles, KINDS_STYLES);
      const s = await open(await buildDocx({'word/document.xml':
        documentXml(p(r('x'), '<w:pStyle w:val="Plain"/>')),
      'word/styles.xml': styles}));
      SD.run(s.d, s.t, modify('Plain', {rPr: {sz: 40, szCs: 40},
        pPr: {jc: 'center'}}));
      const out = await write(s.d.doc);
      const n = styleNode(await rootOf(out, 'word/styles.xml'), 'Plain');
      assert.equal(attr(n, 'w:rsidR'), '00AB', 'w:rsidR kept');
      assert.equal(attr(n, 'w:customStyle'), '1');
      const names = elKids(n).map(local);
      for (const k of ['rsid', 'autoRedefine', 'qFormat'])
        assert.ok(names.includes(k), k + ' kept: ' + names);
      const rpr = elKids(elKids(n).find((c) => local(c) === 'rPr'));
      // the themed colour is not a field: it stays, as does rFonts
      assert.ok(rpr.some((c) => attr(c, 'w:themeColor') === 'accent1'));
      assert.ok(rpr.some((c) => attr(c, 'w:asciiTheme') === 'majorHAnsi'));
      assert.equal(attr(rpr.find((c) => local(c) === 'sz'), 'w:val'),
        '40');
      const back = await readDocx(out);
      assert.equal(back.styles.styles.get('Plain').rPr.sz, 40);
      // and the children come out in schema order
      assert.deepEqual(names, ['name', 'basedOn', 'next', 'autoRedefine',
        'qFormat', 'rsid', 'pPr', 'rPr'].filter((k) =>
        names.includes(k)));
    });

  it('a created style: customStyle, unique id, after the others',
    async () => {
      const bytes = await kindsDoc();
      const s = await open(bytes);
      const before = (await rootOf(await write(s.d.doc),
        'word/styles.xml'));
      const made = [];
      for (const name of ['Plain', 'My new', 'My new!', '<b>', 'normal x'])
        {
          const res = SD.run(s.d, s.t, create({name:
            name === 'Plain' ? 'Plain 2' : name, type: 'paragraph',
          basedOn: 'Normal', rPr: {b: true}}));
          if (res) made.push(res.id);
        }
      assert.ok(made.length >= 4, 'created: ' + made);
      const root = await rootOf(await write(s.d.doc), 'word/styles.xml');
      const ids = styleKids(root).map((c) => attr(c, 'w:styleId'));
      assert.equal(new Set(ids).size, ids.length, 'ids are unique');
      const last = styleKids(before).length;
      for (const id of made) {
        assert.match(id, /^[A-Za-z][A-Za-z0-9]*$/, 'a valid id');
        const n = styleNode(root, id);
        assert.equal(attr(n, 'w:customStyle'), '1', id);
        assert.ok(ids.indexOf(id) >= last, id + ' is written after ' +
          'the existing styles');
      }
      const back = await readDocx(await write(s.d.doc));
      for (const id of made)
        assert.equal(back.styles.styles.get(id).custom, true);
    });

  it('a deleted style\'s uses are gone everywhere; the file lints',
    async () => {
      const bytes = await usesDoc()();
      const s = await open(bytes);
      const zin = await readZip(bytes);
      const had = new Set(errsOf(zin));
      const frag = ['w:val="Fancy"', 'w:val="FancyRun"'];
      for (const part of ['word/document.xml', 'word/header1.xml',
        'word/footer1.xml']) {
        const text = dec.decode(zin.get(part));
        assert.ok(frag.every((f) => text.includes(f)), part + ' uses');
      }
      assert.ok(SD.usedBy(s.d.doc, 'Fancy').paragraphs >= 4,
        'the uses are found: ' + JSON.stringify(SD.usedBy(s.d.doc,
          'Fancy')));
      assert.ok(SD.remove(s.d, s.t, 'Fancy'));
      assert.ok(SD.remove(s.d, s.t, 'FancyRun'));
      assert.deepEqual(SD.usedBy(s.d.doc, 'Fancy'), {paragraphs: 0,
        runs: 0});
      const out = await write(s.d.doc);
      const z = await readZip(out);
      for (const part of ['word/document.xml', 'word/header1.xml',
        'word/footer1.xml']) {
        const text = dec.decode(z.get(part));
        assert.ok(!text.includes('Fancy'), part + ' has no use left');
      }
      assert.ok(!dec.decode(z.get('word/styles.xml')).includes('Fancy'));
      assert.deepEqual(errsOf(z).filter((e) => !had.has(e)), []);
      if (xsd) {
        const was = xsd.errors(zin.get('word/document.xml'));
        assert.deepEqual([...xsd.errors(z.get('word/document.xml'))]
          .filter((m) => !was.has(m)), []);
      }
      // reads back with the text; undo gives the uses back
      const back = await readDocx(out);
      assert.equal(allBlocks({doc: back})[0].text, 'Body one');
      while (s.d.undo());
      assert.deepEqual(SD.usedBy(s.d.doc, 'Fancy').paragraphs >= 4, true);
      assert.ok(sameBytes(await write(s.d.doc), await write(
        await readDocx(bytes))), 'undone: the opened bytes');
    });

  it('the theme part is byte-identical after style changes', async () => {
    const bytes = await themeDoc();
    const zin = await readZip(bytes);
    const s = await open(bytes);
    const theme0 = zin.get('word/theme/theme1.xml');
    assert.ok(theme0, 'the fixture has a theme');
    SD.run(s.d, s.t, modify('Plain', {rPr: {sz: 50}}));
    SD.run(s.d, s.t, create({name: 'Fresh', type: 'paragraph',
      basedOn: 'Plain'}));
    SD.remove(s.d, s.t, 'Grand');
    SD.run(s.d, s.t, (tbl) => ({table: modifyStyle(tbl, 'Child',
      {name: 'Kid'})}));
    applyStyle(s.d, s.t, S.caret({id: allBlocks(s.d)[0].id, off: 0}),
      'Heading2', undefined);
    const z = await readZip(await write(s.d.doc));
    assert.ok(sameBytes(z.get('word/theme/theme1.xml'), theme0),
      'theme bytes');
  });

  it('applying a latent Heading 1 adds it with its base; it reads back',
    async () => {
      const s = await open(await latentDoc());
      assert.equal(s.d.doc.styles.styles.has('Heading1'), false);
      assert.ok(SL.all(s.d.doc).some((e) => e.id === 'Heading1' &&
        e.latent), 'offered as latent');
      const before = s.d.doc.styles;
      applyStyle(s.d, s.t, S.caret({id: allBlocks(s.d)[0].id, off: 0}),
        'Heading1', undefined);
      assert.equal(s.d.undoDepth, 1, 'one undo step');
      assert.notEqual(s.d.doc.styles, before);
      assert.equal(before.styles.has('Heading1'), false, 'not mutated');
      assert.equal(allBlocks(s.d)[0].pStyle, 'Heading1');
      const h = s.d.doc.styles.styles.get('Heading1');
      assert.equal(h.basedOn, 'Normal');
      const out = await write(s.d.doc);
      const root = await rootOf(out, 'word/styles.xml');
      const n = styleNode(root, 'Heading1');
      assert.ok(n, 'written');
      assert.equal(attr(n, 'w:customStyle'), undefined);
      const back = await readDocx(out);
      assert.equal(back.styles.styles.get('Heading1').basedOn, 'Normal');
      assert.equal(allBlocks({doc: back})[0].pStyle, 'Heading1');
      assert.deepEqual(back.styles.styles.get('Heading1').rPr,
        h.rPr);
      // the latent entries and docDefaults are untouched
      const was = await rootOf(await write(await readDocx(
        await latentDoc())), 'word/styles.xml');
      const keep = (x) => elKids(x).filter((c) => local(c) !==
        'style' || attr(c, 'w:styleId') !== 'Heading1').map(ser);
      assert.deepEqual(keep(root), keep(was));
      while (s.d.undo());
      assert.equal(s.d.doc.styles.styles.has('Heading1'), false);
    });
});

// ------------------------------------------------------------ layout

const H1 = (sz, color, after) => '<w:style w:type="paragraph" ' +
  'w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn ' +
  'w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>' +
  '<w:keepNext/><w:spacing w:before="240" w:after="' + after + '"/>' +
  '<w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="' +
  color + '"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz +
  '"/></w:rPr></w:style>';
const NORMAL = '<w:style w:type="paragraph" w:default="1" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>';
const layoutDoc = (h1) => buildDocx({'word/document.xml': documentXml(
  p(r('A heading that is long enough to wrap onto a second line ' +
    'when the column is narrow'), '<w:pStyle w:val="Heading1"/>') +
  p(r('Body text '.repeat(30))) +
  p(r('Second heading'), '<w:pStyle w:val="Heading1"/>') +
  p(r('More body text '.repeat(20)))),
'word/styles.xml': stylesXml('<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  NORMAL + h1)});

/** What the layout decided, per item, and the formats of the runs. */
function laidOut(doc, width) {
  const L = new DocLayout(doc, tm());
  L.layout(width);
  const items = L.items.map((it) => ({kind: it.kind, x: it.x, w: it.w,
    y: it.y, h: it.h, gapAbove: it.gapAbove, gapBelow: it.gapBelow,
    lines: it.lines, metrics: it.metrics}));
  const fmts = [];
  for (const b of doc.sections.flatMap((s) => s.blocks)) {
    if (b.type !== 'p') continue;
    for (const run of b.runs) fmts.push(runFmt(doc.styles, b, run));
  }
  return {items, fmts, height: L.height};
}

describe('styles round trip: layout oracle', () => {
  it('restyled by commands = styles.xml edited by hand', async () => {
    await loadStyles();
    const orig = await layoutDoc(H1(32, '2F5496', 80));
    const hand = await layoutDoc(H1(44, 'C00000', 360));
    const s = await open(orig);
    const was = laidOut(s.d.doc, 400);
    assert.ok(SD.run(s.d, s.t, modify('Heading1', {rPr: {sz: 44,
      szCs: 44, color: 'C00000'}, pPr: {spacing: {before: 240,
      after: 360}}})));
    const byCmd = laidOut(s.d.doc, 400);
    const byHand = laidOut(await readDocx(hand), 400);
    assert.notDeepEqual(byCmd.items.map((i) => i.h),
      was.items.map((i) => i.h), 'the change moved the layout');
    assert.deepEqual(byCmd.fmts, byHand.fmts);
    assert.deepEqual(byCmd.items, byHand.items);
    assert.equal(byCmd.height, byHand.height);
    assert.notDeepEqual(byCmd.fmts[0], was.fmts[0]);
    assert.ok(byCmd.fmts[0].px > was.fmts[0].px, 'bigger');
    assert.deepEqual(byCmd.fmts[0].colour, byHand.fmts[0].colour);
    // written and read back, the same layout again
    const back = laidOut(await readDocx(await write(s.d.doc)), 400);
    assert.deepEqual(back.items, byHand.items);
    assert.deepEqual(back.fmts, byHand.fmts);
  });
});

// ------------------------------------------------------------ hostile

/** Walk a Document through every list and apply every style. */
async function abuse(bytes, what) {
  const s = await open(bytes);
  const t0 = Date.now();
  const list = SL.all(s.d.doc);
  SL.gallery(s.d.doc);
  const ps = allBlocks(s.d).filter((b) => b.type === 'p');
  const sel = ps.length ? S.caret({id: ps[0].id, off: 0}) : null;
  let n = 0;
  for (const e of list.slice(0, 40)) {
    if (!sel) break;
    try {
      applyStyle(s.d, s.t, sel, e.id, undefined);
      n++;
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
    }
  }
  const ids = [...s.d.doc.styles.styles.keys()].slice(0, 20);
  for (const id of ids) {
    SD.run(s.d, s.t, modify(id, {rPr: {b: true}}));
    SD.usedBy(s.d.doc, id);
  }
  SD.remove(s.d, s.t, ids[ids.length - 1]);
  for (const b of allBlocks(s.d)) checkBlock(b);
  const out = await write(s.d.doc);
  const back = await readDocx(out);
  assert.ok(back.styles, what + ': reads back');
  while (s.d.undo());
  return {list: list.length, applied: n, ms: Date.now() - t0};
}

describe('styles round trip: hostile styles parts', () => {
  const doc = (styles, text = 'x') => buildDocx({'word/document.xml':
    documentXml(p(r(text), '<w:pStyle w:val="A"/>') + p(r('y'))),
  'word/styles.xml': stylesXml(styles)});
  const cases = [
    ['a Based on cycle', STY('A', 'A', {based: 'B'}) +
      STY('B', 'B', {based: 'C'}) + STY('C', 'C', {based: 'A'}) +
      STY('Self', 'Self', {based: 'Self', next: 'Self',
        link: 'Self'})],
    ['missing targets', STY('A', 'A', {based: 'Nope', next: 'Gone',
      link: 'Ghost'}) + STY('B', 'B', {type: 'character',
      based: 'A', link: 'A'})],
    ['duplicate ids and names', STY('A', 'Same') + STY('A', 'Same') +
      STY('B', 'Same') + STY('A', 'Other', {type: 'character'})],
    ['__proto__ ids and names', STY('__proto__', '__proto__') +
      STY('constructor', 'constructor', {based: '__proto__'}) +
      STY('A', 'A', {based: '__proto__', next: 'constructor'}) +
      STY('toString', 'hasOwnProperty')],
    ['no ids, odd types', '<w:style w:type="paragraph"><w:name w:val=' +
      '"No id"/></w:style><w:style w:type="bogus" w:styleId="A">' +
      '<w:name w:val="A"/></w:style><w:style/>'],
  ];
  for (const [name, inner] of cases) {
    it(name, async () => {
      const res = await abuse(await doc(inner), name);
      console.log('# hostile ' + name + ': ' + JSON.stringify(res));
    });
  }
  /** Best of three of fn(), in ms. */
  const best = (fn) => {
    let b = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      fn();
      b = Math.min(b, performance.now() - t0);
    }
    return b;
  };
  const many = (n, step) => {
    let inner = STY('Normal', 'Normal', {def: true}) +
      STY('A', 'A', {based: 'Normal'});
    for (let i = 0; i < n; i++) {
      inner += STY('S' + i, 'Style ' + i, {custom: true,
        based: i % step ? 'S' + (i - 1) : 'Normal', rPr: '<w:b/>'});
    }
    return doc(inner);
  };
  // time grows with the size, not with its square (a load-robust
  // ratio; an absolute ceiling only with WORD_PERF=1)
  const scaling = async (what, step, ceiling) => {
    const times = [];
    for (const n of [1000, 10000]) {
      const s = await open(await many(n, step));
      times.push(best(() => SL.all(s.d.doc)));
    }
    console.log(`# ${what}: 1000 styles ${times[0].toFixed(1)} ms, ` +
      `10000 ${times[1].toFixed(1)} ms`);
    if (process.env.WORD_PERF) assert.ok(times[1] < ceiling,
      what + ' took ' + times[1]);
    else assert.ok(times[1] < Math.max(times[0], 1) * 30,
      what + ' is not linear');
  };
  it('10,000 styles in a file', async () => {
    const res = await abuse(await many(10000, 50), '10,000 styles');
    console.log('# hostile 10,000 styles: ' + JSON.stringify(res));
    await scaling('10,000 styles, chains of 50', 50, 1000);
  });
  it('a Based on chain 10,000 deep is cut, not quadratic', async () => {
    await scaling('chain 10,000 deep', 1e9, 1000);
    const s = await open(await many(10000, 1e9));
    const ps = allBlocks(s.d).filter((b) => b.type === 'p');
    const sel = S.caret({id: ps[0].id, off: 0});
    applyStyle(s.d, s.t, sel, 'S9999', undefined);
    modify('S9999', {rPr: {i: true}});
    assert.ok(SD.run(s.d, s.t, modify('S9999', {rPr: {i: true}})));
    for (const b of allBlocks(s.d)) checkBlock(b);
    await write(s.d.doc);
  });
});

// ------------------------------------------------------------ corpus

const files = corpusFiles();

describe('styles round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${STEPS} style commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () =>
    corpusRun(files, stylesAll, xsd, xsdNote, 'styles-edited corpus',
      {stories: true}));
  it('an unchanged styles part is written as read; changing one ' +
    'style rewrites only that w:style', async () => {
    let n = 0, asRead = 0, skipped = 0;
    const failures = [];
    for (const f of files) {
      const name = f.split('corpus/').pop();
      try {
        const res = await fidelity(readFileSync(f), name, hash(name));
        if (res.skipped) skipped++;
        else {
          n++;
          if (res.bytes) asRead++;
        }
      } catch (e) {
        failures.push(name + ': ' + String(e.message).split('\n')
          .slice(0, 3).join(' | ').slice(0, 300));
      }
    }
    console.log(`# styles fidelity (corpus): ${n} files checked, ` +
      `${asRead} byte-identical to the file, ${skipped} skipped`);
    for (const x of failures) console.log('# FAIL ' + x);
    assert.deepEqual(failures, []);
    // (a mass skip must not go unnoticed: the reader refuses about
    // one file in thirty, and a few have no styles part)
    assert.ok(n >= Math.floor(files.length * 0.8), `only ${n} of ` +
      `${files.length} files were compared`);
  });
});
