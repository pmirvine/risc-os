// Seeded fuzz of tables on the clipboard (C6 fix: the C6a review's
// scratch fuzz made a test). Random table-heavy selections (cell
// rectangles, whole tables, ranges at any depth) of fixture sources
// (Grid Table 4 with a nested table, a Strict table with Word 2010's
// w:left borders, merges and bookmarks across cells, HTML tables) are
// copied through the exact route (ClipSlice, ClipStore, ClipHtml,
// ClipPick) or the HTML route and pasted at a caret anywhere or over
// cells, in the same document and across, into a Transitional target
// (a depth-8 nest and a vMerge table) and a Strict one. After every
// paste: each block passes checkBlock; ids unique at every depth; one
// undo step; undo and redo exact, with the identity of styles,
// numbering, rels and parts; the caret resolves; every tblStyle names
// a table style; no continue cell in a top row; no bookmark pair
// broken or reversed; no two tables touching (D27) that did not
// before; and the written file reads back as the model (C6 fix B4).
// Each run ends with the round trip (lint, xmllint of the main part,
// undo all gives the same bytes). WORD_EDIT_CORPUS=1 adds corpus
// sources and targets.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Letters/ClipStore';
import {pick} from '../../tools/moreapps/!Letters/ClipPick';
import {pasteBlocks} from '../../tools/moreapps/!Letters/ClipPaste';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {blocks as walkAll, ids as allIds}
  from '../../tools/moreapps/!Letters/Walk';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {pairs} from '../../tools/moreapps/!Letters/BookmarkFind';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {endsCell} from '../../tools/moreapps/!Letters/TblCheck';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {parseHtml} from './html-fake.mjs';
import {rng} from './word-docs.mjs';
import {assertSameDoc, expectedBack, withNewParts}
  from './docx-compare.mjs';
import {roundTrip, write, schema, corpusFiles, hash, ALL}
  from './roundtrip-lib.mjs';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, nestedTable, TABLE_NORMAL, GRID_TABLE_4}
  from './tbl-fixtures.mjs';
import {strictDocx} from './clip-lists-docs.mjs';

const KEY = 1, OTHER = 2;
const STEPS = ALL ? 25 : 40;
const done = {pastes: 0, over: 0, html: 0, cross: 0, same: 0};
const pickOf = (rd, a) => a[Math.floor(rd() * a.length)];
const all = (d) => [...walkAll(d.doc)];
const tops = (d) => d.doc.sections.flatMap((s) => s.blocks);

function paraIn(rd, b) {
  if (b.type === 'p') {
    return {id: b.id, off: Math.floor(rd() * (b.text.length + 1))};
  }
  return {id: blockId(b), off: rd() < 0.5 ? 0 : 1};
}

const inside = (e, t) => e.at.length > t.at.length &&
  t.at.every((v, i) => e.at[i] === v);

/** A table-heavy random selection in d. */
function tableSel(rd, d) {
  const es = all(d);
  const tbls = es.filter((e) => e.b.type === 'tbl');
  const ps = es.filter((e) => e.b.type === 'p');
  if (!ps.length) return null;
  const x = rd();
  if (tbls.length && x < 0.4) {
    const t = pickOf(rd, tbls);
    const inT = ps.filter((e) => inside(e, t));
    if (inT.length >= 2) {
      return S.select(paraIn(rd, pickOf(rd, inT).b),
        paraIn(rd, pickOf(rd, inT).b));
    }
  }
  if (tbls.length && x < 0.55) {
    const t = pickOf(rd, tbls).b;
    return S.select({id: blockId(t), off: 0}, {id: blockId(t), off: 1});
  }
  const a = pickOf(rd, ps), k = es.indexOf(a);
  const k2 = Math.max(0, Math.min(es.length - 1, k +
    Math.floor((rd() * 2 - 1) * 12)));
  return S.select(paraIn(rd, a.b), paraIn(rd, es[k2].b));
}

function targetSel(rd, d) {
  if (rd() < 0.3) {
    const s = tableSel(rd, d);
    if (s && !S.collapsed(s)) return s;
  }
  const es = all(d);
  // (a document whose body has no block: poi/Bug60341.docx)
  if (!es.length) return null;
  return S.caret(paraIn(rd, pickOf(rd, es).b));
}

/** Pair problems: unpaired or reversed starts, names twice. */
function bmProblems(doc) {
  let n = 0;
  const names = new Map();
  for (const q of pairs(doc)) {
    if (!q.end) n++;
    names.set(q.name, (names.get(q.name) || 0) + 1);
  }
  for (const v of names.values()) if (v > 1) n++;
  return n;
}

const badStyleRefs = (doc) => {
  const st = doc.styles && doc.styles.styles;
  let n = 0;
  for (const {b} of walkAll(doc)) {
    if (b.type !== 'tbl' || !b.tblPr || !b.tblPr.tblStyle) continue;
    const s = st && st.get(b.tblPr.tblStyle);
    if (!s || s.type !== 'table') n++;
  }
  return n;
};

const topConts = (doc) => {
  let n = 0;
  for (const {b} of walkAll(doc)) {
    if (b.type === 'tbl') n += gridOf(b).rows[0].cells.filter(
      (c) => c.cont).length;
  }
  return n;
};

/** Tables touching (D27): in sections and in every cell. */
function touching(doc) {
  let n = 0;
  const look = (list) => {
    for (let j = 1; j < list.length; j++) {
      if (endsCell(list[j]) && endsCell(list[j - 1])) n++;
    }
  };
  for (const s of doc.sections) look(s.blocks);
  for (const {b} of walkAll(doc)) {
    if (b.type === 'tbl') {
      for (const row of b.rows) for (const c of row.cells) look(c.blocks);
    }
  }
  return n;
}

const state = (d) => ({sections: structuredClone(d.doc.sections),
  styles: d.doc.styles, numbering: d.doc.numbering, rels: d.doc.rels,
  parts: d.doc.parts});

const HTML = ['<table><tr><td>h1</td><td>h2</td></tr></table>' +
  '<table><tr><td rowspan="2">v</td><td>w</td></tr><tr><td>x</td>' +
  '</tr></table>', '<p>t</p><table border="1"><tr><td><table><tr>' +
  '<td>a</td></tr></table><table><tr><td>b</td></tr></table></td>' +
  '<td colspan="2" style="background:#ff0000">c</td></tr></table>'];

/** One paste into d (checks above); problems pushed to `bad`. */
async function step(rd, d, srcs, store, bad, tag0) {
  const fromSelf = rd() < 0.2, html = !fromSelf && rd() < 0.15;
  let x;
  if (html) {
    const h = pickOf(rd, HTML);
    x = pick({text: 'x', html: h}, {store: null, docKey: KEY,
      parseHtml, textTw: 9000});
  } else {
    const sd = fromSelf ? d : pickOf(rd, srcs);
    const ss = tableSel(rd, sd);
    if (!ss || S.collapsed(ss)) return;
    const s = slice(sd.doc, ss);
    if (!s) return;
    const token = store.put(s, fromSelf ? KEY : OTHER);
    if (!token) return;
    x = pick({text: s.plain, html: toHtml(sd.doc, s, {token}) ?? ''},
      {store, docKey: KEY, parseHtml});
  }
  if (!x || (x.route !== 'exact' && x.route !== 'html')) return;
  const tsel = targetSel(rd, d);
  if (!tsel) return;
  const tag = `${tag0} ${fromSelf ? 'same' : html ? 'html' : 'cross'}`;
  const before = state(d), depth0 = d.undoDepth;
  const bm0 = bmProblems(d.doc), sr0 = badStyleRefs(d.doc);
  const tc0 = topConts(d.doc), to0 = touching(d.doc);
  let out;
  try {
    out = pasteBlocks(d, tsel, x.blocks, x.opts);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    if (d.undoDepth !== depth0 || !deepEqual(d.doc.sections,
      before.sections)) bad.push('refused paste changed doc ' + tag);
    return;
  }
  if (d.undoDepth === depth0) return;
  done.pastes++;
  if (!S.collapsed(tsel)) done.over++;
  done[fromSelf ? 'same' : html ? 'html' : 'cross']++;
  if (d.undoDepth !== depth0 + 1) bad.push('not one undo step ' + tag);
  for (const b of tops(d)) {
    try { checkBlock(b); } catch (e) { bad.push(`check ${e.message} ${tag}`); }
  }
  const ids = allIds(d.doc);
  if (new Set(ids).size !== ids.length) bad.push('duplicate ids ' + tag);
  if (!findBlock(d.doc, out.head.id)) bad.push('caret lost ' + tag);
  if (badStyleRefs(d.doc) > sr0) bad.push('tblStyle unresolved ' + tag);
  if (bmProblems(d.doc) > bm0) bad.push('bookmark pair broken ' + tag);
  if (topConts(d.doc) > tc0) bad.push('continue cell on top ' + tag);
  if (touching(d.doc) > to0) bad.push('tables touch ' + tag);
  const after = state(d);
  const back = await readDocx(await write(d.doc));
  try {
    assertSameDoc(back, withNewParts(expectedBack(d.doc), back), tag);
  } catch (e) {
    bad.push('read back differs ' + tag + ': ' + e.message.slice(0, 300));
  }
  d.undo();
  if (!deepEqual(d.doc.sections, before.sections)) bad.push('undo ' + tag);
  for (const k of ['styles', 'numbering', 'rels', 'parts']) {
    if (d.doc[k] !== before[k]) bad.push(`undo identity ${k} ${tag}`);
  }
  d.redo();
  if (!deepEqual(d.doc.sections, after.sections)) bad.push('redo ' + tag);
  for (const k of ['styles', 'numbering', 'rels', 'parts']) {
    if (d.doc[k] !== after[k]) bad.push(`redo identity ${k} ${tag}`);
  }
}

const BS = (n) => `<w:bookmarkStart w:id="${n}" w:name="b${n}"/>`;
const BE = (n) => `<w:bookmarkEnd w:id="${n}"/>`;
const SIDE = (n) => `<w:${n} w:val="thinThickThinSmallGap" w:sz="24" ` +
  'w:space="0" w:color="auto"/>';
const LR = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right',
  'insideH', 'insideV'].map(SIDE).join('') + '</w:tblBorders>';

async function sources() {
  const out = [];
  const open = async (bytes) => new Document(await readDocx(bytes));
  out.push(await open(await buildDocx({'word/document.xml': documentXml(
    p(r('S')) + tbl([tr([tc(p(r('a'))), tc(p(r('b')) + tbl([tr([tc(
      p(r('n')))])], {tblPr: '<w:tblStyle w:val="GridTable4"/>'}) +
      p())])], {tblPr: '<w:tblStyle w:val="GridTable4"/>'}) + p(r('E'))),
  'word/styles.xml': stylesXml(TABLE_NORMAL + GRID_TABLE_4)})));
  out.push(await open(await tblDocx(p(r('s')) + tbl([0, 1, 2].map((i) =>
    tr([0, 1, 2].map((j) => tc(p(r(`${i}${j}`)))))), {tblPr: LR}) +
    p(r('e')), {strict: true})));
  out.push(await open(await tblDocx(p(r('m')) + tbl([
    tr([tc(p(BS(1) + r('a')), {tcPr: '<w:vMerge w:val="restart"/>'}),
      tc(p(r('b'))), tc(p(r('c') + BE(1)))]),
    tr([tc(p(), {tcPr: '<w:vMerge/>'}), tc(p(BS(2) + r('d'))),
      tc(p(r('f')))]),
    tr([tc(p(r('g') + BE(2))), tc(p(r('h'))), tc(p(r('i')))])]) +
    p(r('z')))));
  if (ALL) {
    for (const f of corpusFiles().filter((g, i) => i % 23 === 0)) {
      try {
        const a = await readDocx(readFileSync(f));
        if ([...walkAll(a)].some(({b}) => b.type === 'tbl'))
          out.push(new Document(a));
      } catch (e) { /* refused files are not sources */ }
    }
  }
  return out;
}

async function targets() {
  const out = [['depth-8 nest and a merge', await buildDocx({
    'word/document.xml': documentXml(p(r('Before')) + nestedTable(8) +
      p(r('mid')) + tbl([tr([tc(p(BS(5) + r('a')), {tcPr:
        '<w:vMerge w:val="restart"/>'}), tc(p(r('b')))]),
      tr([tc(p(), {tcPr: '<w:vMerge/>'}), tc(p(r('d') + BE(5)))])]) +
      p(r('end'))), 'word/styles.xml': stylesXml(TABLE_NORMAL)})],
  ['strict', await strictDocx(p(r('x')) + p(r('y')))]];
  if (ALL) {
    for (const f of corpusFiles().filter((g, i) => i % 31 === 0)) {
      out.push([f, readFileSync(f)]);
    }
  }
  return out;
}

describe('tables on the clipboard: seeded fuzz', () => {
  it('pastes keep the model valid, undo exact, the file as the model',
    async () => {
      const srcs = await sources(), {xsd} = schema();
      for (const [name, bytes] of await targets()) {
        const bad = [];
        const change = async (d, seed) => {
          const rd = rng(seed), store = new ClipStore();
          for (let k = 0; k < STEPS; k++) {
            await step(rd, d, srcs, store, bad, `${name} ${seed} #${k}`);
          }
          return {grows: true};
        };
        const res = await roundTrip(bytes, name, hash(name), change,
          {xsd, keep: ['numberingPart']});
        if (res.refused) continue;
        assert.deepEqual(bad.slice(0, 5), [], name);
      }
      // the run did paste, of every kind
      assert.ok(done.pastes >= 40 && done.over >= 5 && done.html >= 3 &&
        done.cross >= 20 && done.same >= 5, JSON.stringify(done));
    });
});
