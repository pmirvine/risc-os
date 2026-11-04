// .doc import, task 12 (fix round 1): our reading of a .doc that real
// Word saved (Word 97-2003) against our reading of the .docx Word made
// it from, property by property, character by character and paragraph
// by paragraph (task 13: tables and lists, table by table, cell by
// cell and list paragraph by list paragraph). The .docx sources are docword-fixtures.mjs's; Word's
// .doc of each is made by tools/doc-word-fixtures.mjs into the
// uncommitted tests/moreapps/word-check-out/doc-from-word/ (fix-*.doc
// beside fix-*.docx). Skipped when they are absent.
//
// The .docx side is resolved as Word resolves it: a toggle property
// (bold, italic, caps...) in a character style flips the paragraph
// style's value (ECMA-376 17.7.3) and one set off does nothing, where
// ./Styles resolveRun overrides; tab stops merge layer by layer (a
// clear removes the one under it); everything else as resolveRun /
// resolvePara give it. KNOWN lists what the .doc reader does not read
// yet, or what Word changes on the way, by property.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {runLayers, paraLayers, resolveRun, resolvePara}
  from '../../tools/moreapps/!Letters/Styles';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {emit} from './word-emit.mjs';
import {labels} from '../../tools/moreapps/!Letters/ListNumbers';
import {levelOf} from '../../tools/moreapps/!Letters/ReadNumbering';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname),
  'word-check-out', 'doc-from-word');
const NAMES = ['runs', 'paras', 'styles'];
const have = NAMES.filter((n) => fs.existsSync(path.join(DIR,
  `fix-${n}.doc`)) && fs.existsSync(path.join(DIR, `fix-${n}.docx`)));

/** Properties not compared (the .doc reader's known limits, or Word's
 *  changes when it saves a .doc): property -> why. */
export const KNOWN = {};

const TOGGLE = ['b', 'i', 'strike', 'caps', 'smallCaps', 'vanish',
  'dstrike', 'outline', 'shadow', 'emboss', 'imprint'];
const EXTRA = ['caps', 'smallCaps', 'vanish', 'dstrike', 'outline',
  'shadow', 'emboss', 'imprint', 'position', 'spacing', 'w'];

const local = (n) => n.split(':').pop();
const attr = (x, k) => {
  const a = (x.attrs || []).find((p) => local(p[0]) === k);
  return a ? a[1] : undefined;
};
const on = (v) => v === undefined || !['0', 'false', 'off'].includes(v);

/** A layer's value of key k: true / false / undefined (not set). */
function layerValue(l, k) {
  if (!l) return undefined;
  if (l[k] !== undefined && ['b', 'i', 'strike'].includes(k)) return l[k];
  const x = (l.extra || []).find((e) => e && e.name &&
    local(e.name) === k);
  return x ? on(attr(x, 'val')) : undefined;
}

/** Word's toggle value of key k for run r in paragraph p. */
function wordToggle(styles, p, r, k) {
  const layers = runLayers(styles, p, r);
  const nPara = paraLayers(styles, p).length - 1;
  let v = false;
  for (const l of layers.slice(0, nPara)) {
    const x = layerValue(l, k);
    if (x !== undefined) v = x;
  }
  for (const l of layers.slice(nPara, -1)) {
    if (layerValue(l, k) === true) v = !v;
  }
  const d = layerValue(layers[layers.length - 1], k);
  return d === undefined ? v : d;
}

/** The comparable look of run r of paragraph p (doc's styles). */
function look(doc, p, r, word) {
  const rr = resolveRun(doc.styles, p, r);
  const out = {u: rr.u && rr.u !== 'none' ? rr.u : 'none',
    sz: rr.sz, font: rr.rFonts && rr.rFonts.ascii,
    color: rr.color && rr.color !== 'auto' ? rr.color.toUpperCase()
      : 'auto',
    highlight: rr.highlight && rr.highlight !== 'none' ? rr.highlight
      : 'none',
    vertAlign: rr.vertAlign || 'baseline',
    shading: rr.shd && rr.shd.fill && rr.shd.fill !== 'auto'
      ? rr.shd.fill.toUpperCase() : 'none'};
  for (const k of TOGGLE) {
    out[k] = word ? wordToggle(doc.styles, p, r, k)
      : !!layerValue({...rr, extra: rr.extra}, k);
  }
  for (const k of ['position', 'spacing', 'w']) {
    const x = rr.extra.filter((e) => e && e.name && local(e.name) === k)
      .pop();
    out[k] = x ? Number(attr(x, 'val')) : k === 'w' ? 100 : 0;
  }
  const uc = rr.extra.filter((e) => e && local(e.name) === 'u').pop();
  if (uc) {
    out.u = attr(uc, 'val');
    out.uColor = attr(uc, 'color');
  }
  return out;
}

/** The tab stops of p as Word merges them: each layer's over the
 *  ones under it (a clear removes one), where resolvePara takes the
 *  top layer's list whole. */
function tabsOf(doc, p) {
  let ts = [];
  for (const l of paraLayers(doc.styles, p)) {
    for (const t of (l && l.tabs) || []) {
      ts = ts.filter((x) => x.pos !== t.pos);
      if (t.val !== 'clear') ts.push(t);
    }
  }
  return ts;
}

/** The comparable look of paragraph p. */
function paraLook(doc, p) {
  const pp = resolvePara(doc.styles, p);
  const ind = pp.ind || {}, sp = pp.spacing || {};
  const side = (b) => b && b.val !== 'none' && b.val !== 'nil'
    ? {val: b.val, sz: b.sz, color: (b.color || 'auto').toUpperCase(),
      space: b.space || 0} : 'none';
  return {jc: pp.jc === 'left' || pp.jc === 'start' || !pp.jc ? 'left'
    : pp.jc, left: ind.left || 0, right: ind.right || 0,
  first: ind.hanging ? -ind.hanging : ind.firstLine || 0,
  before: sp.before || 0, after: sp.after || 0, line: sp.line || 240,
  lineRule: sp.lineRule || 'auto', keepNext: !!pp.keepNext,
  keepLines: !!pp.keepLines, pageBreakBefore: !!pp.pageBreakBefore,
  widowControl: pp.widowControl !== false,
  suppressLineNumbers: !!pp.suppressLineNumbers,
  contextualSpacing: !!pp.contextualSpacing,
  outlineLvl: pp.outlineLvl === undefined ? 9 : pp.outlineLvl,
  tabs: tabsOf(doc, p).map((t) => `${t.val}@${t.pos}${t.leader && t.leader !== 'none'
      ? '/' + t.leader : ''}`).sort().join(' '),
  shd: pp.shd && pp.shd.fill && pp.shd.fill !== 'auto'
    ? pp.shd.fill.toUpperCase() : 'none',
  ...Object.fromEntries(['top', 'left', 'bottom', 'right'].map((s) =>
    ['bdr-' + s, JSON.stringify(side(pp.pBdr && pp.pBdr[s]))]))};
}

/** The paragraphs of doc: [{text, p, chars: [look]}]. */
function parasOf(doc, word) {
  return doc.sections.flatMap((s) => s.blocks)
    .filter((b) => b.type === 'p' && b.text)
    .map((b) => {
      const chars = [];
      for (const r of b.runs) {
        const l = look(doc, b, r, word);
        for (let k = r.start; k < r.end; k++) chars[k] = l;
      }
      // (a tab is U+FFFC with a tab inline on the .docx side)
      return {text: b.text.replaceAll('\uFFFC', '\t'), p: b, chars};
    });
}

/** The differences [what, ours, word's] of the two readings. */
function differences(fromDoc, fromDocx, wordView = false) {
  const out = [];
  const a = parasOf(fromDoc, wordView), b = parasOf(fromDocx, true);
  assert.deepEqual(a.map((x) => x.text), b.map((x) => x.text));
  a.forEach((pa, i) => {
    const pb = b[i];
    const la = paraLook(fromDoc, pa.p), lb = paraLook(fromDocx, pb.p);
    for (const k of Object.keys(lb)) {
      if (JSON.stringify(la[k]) !== JSON.stringify(lb[k])) {
        out.push([`"${pa.text.slice(0, 30)}" ${k}`, la[k], lb[k]]);
      }
    }
    const seen = new Set();
    for (let c = 0; c < pa.text.length; c++) {
      if (/\s/.test(pa.text[c])) continue;
      for (const k of Object.keys(pb.chars[c])) {
        if (k in KNOWN) continue;
        const x = pa.chars[c][k], y = pb.chars[c][k];
        const key = `"${pa.text.slice(0, 30)}" ${k}`;
        if (x !== y && !seen.has(key)) {
          seen.add(key);
          out.push([key + ' at ' + c, x, y]);
        }
      }
    }
  });
  return out;
}

describe('.doc saved by real Word against its .docx', {skip: have.length
  ? false : 'no Word-made fixtures (tools/doc-word-fixtures.mjs)'}, () => {
  for (const name of have) {
    it(`fix-${name}: every property the reader reads is Word's`,
      async () => {
        const docBytes = new Uint8Array(fs.readFileSync(path.join(DIR,
          `fix-${name}.doc`)));
        const {doc, notes} = readDoc(docBytes);
        const src = await readDocx(new Uint8Array(fs.readFileSync(
          path.join(DIR, `fix-${name}.docx`))));
        const diffs = differences(doc, src);
        assert.deepEqual(diffs, [], JSON.stringify(notes));
        // the Doc of the .doc read back as .docx looks the same, as
        // !Letters resolves it and as Word does (toggles by XOR)
        const bytes = await writeDocx(doc);
        emit('doc-word-' + name, bytes);
        const back = await readDocx(bytes);
        assert.deepEqual(differences(back, src), []);
        assert.deepEqual(differences(back, src, true), []);
      });
  }
});

// ---------------------------------------------------------------------
// Task 13: tables and lists, table by table and list by list.

const SHAPES = ['lists', 'tables'];
const haveShapes = SHAPES.filter((n) => fs.existsSync(path.join(DIR,
  `fix-${n}.doc`)) && fs.existsSync(path.join(DIR, `fix-${n}.docx`)));

/** What is not compared in tables and lists, and why. */
export const KNOWN_SHAPES = {
  tblW: 'the .docx\'s auto width is Word\'s default: not written',
  tblLayout: 'a table\'s fixed / autofit layout is not read',
  tblCellMar: 'cell margins (sprmTCellPaddingDefault) are not read',
  tblInd: 'compared only where the .docx gives one: Word stores the ' +
    'cell margin as the indent (sprmTWidthIndent) of a table with none',
};

const sideOf = (b) => (b && b.val !== 'none' && b.val !== 'nil'
  ? `${b.val}/${b.sz}/${(b.color || 'auto').toUpperCase()}` : 'none');
const sides = (o, names) => Object.fromEntries(names.map((s) =>
  [s, sideOf(o && o[s])]));

/** The comparable shape of a table (nested ones inside). */
function tableLook(doc, t, L, givenInd) {
  const p = t.tblPr;
  const out = {grid: t.grid.join(' '), jc: p.jc || 'left',
    borders: sides(p.tblBorders, ['top', 'left', 'bottom', 'right',
      'insideH', 'insideV']),
    shd: p.shd && p.shd.fill ? p.shd.fill : 'none'};
  if (givenInd !== undefined) out.tblInd = givenInd;
  out.rows = t.rows.map((r) => ({
    trHeight: r.trPr.trHeight ? `${r.trPr.trHeight.val}/` +
      `${r.trPr.trHeight.hRule || 'atLeast'}` : 'auto',
    header: !!r.trPr.tblHeader, cantSplit: !!r.trPr.cantSplit,
    before: r.trPr.gridBefore || 0, after: r.trPr.gridAfter || 0,
    cells: r.cells.map((c) => {
      const q = c.tcPr;
      return {span: q.gridSpan || 1, vMerge: q.vMerge || 'none',
        w: q.tcW ? `${q.tcW.w}/${q.tcW.type}` : 'none',
        shd: q.shd && q.shd.fill && q.shd.fill !== 'auto'
          ? q.shd.fill.toUpperCase() : 'none',
        vAlign: q.vAlign || 'top', dir: q.textDirection || 'lrTb',
        borders: sides(q.tcBorders, ['top', 'left', 'bottom', 'right']),
        blocks: blocksLook(doc, c.blocks, L, null)};
    })}));
  return out;
}

/** A paragraph's list look. */
function listLook(doc, b, L) {
  const l = L.get(b.id);
  const pp = resolvePara(doc.styles, b, l && l.indent);
  const ind = pp.ind || {};
  const out = {text: b.text, label: l ? l.text : null,
    left: ind.left || 0, right: ind.right || 0,
    first: ind.hanging ? -ind.hanging : ind.firstLine || 0};
  if (b.pPr.numPr) {
    const n = doc.numbering.nums.get(b.pPr.numPr.numId);
    const lv = n && levelOf(n, b.pPr.numPr.ilvl);
    if (lv) {
      const rp = lv.rPr || {};
      Object.assign(out, {fmt: lv.numFmt, lvlText: lv.lvlText,
        start: lv.start ?? 0, suff: lv.suff || 'tab',
        font: rp.rFonts ? rp.rFonts.ascii : 'none', b: !!rp.b,
        i: !!rp.i, color: rp.color || 'auto', sz: rp.sz || 0});
    }
  }
  return out;
}

/** Blocks: paragraphs' list looks and tables' looks. inds the
 *  .docx's tblInd of each top table (undefined: none given). */
function blocksLook(doc, bs, L, inds) {
  let k = 0;
  return bs.map((b) => {
    if (b.type !== 'tbl') return listLook(doc, b, L);
    const given = inds ? inds[k++] : undefined;
    return tableLook(doc, b, L, given);
  });
}

function shapesOf(doc, inds) {
  return blocksLook(doc, doc.sections.flatMap((s) => s.blocks),
    labels(doc), inds);
}

/** The tblInd each top-level table of the .docx gives. */
const indsOf = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'tbl').map((t) => (t.tblPr.tblInd
    ? t.tblPr.tblInd.w : undefined));

describe('.doc tables and lists saved by real Word against the .docx',
  {skip: haveShapes.length ? false
    : 'no Word-made fixtures (tools/doc-word-fixtures.mjs)'}, () => {
    for (const name of haveShapes) {
      it(`fix-${name}: tables and lists are Word's`, async () => {
        const {doc, notes} = readDoc(new Uint8Array(fs.readFileSync(
          path.join(DIR, `fix-${name}.doc`))));
        const src = await readDocx(new Uint8Array(fs.readFileSync(
          path.join(DIR, `fix-${name}.docx`))));
        const inds = indsOf(src);
        assert.deepEqual(notes, []);
        assert.deepEqual(shapesOf(doc, inds), shapesOf(src, inds));
        const bytes = await writeDocx(doc);
        emit('doc-word-' + name, bytes);
        const back = await readDocx(bytes);
        assert.deepEqual(shapesOf(back, inds), shapesOf(src, inds));
      });
    }
  });
