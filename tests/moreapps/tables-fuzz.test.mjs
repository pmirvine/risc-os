// Random command sequences in and around tables (C3 fix wave, from
// the C3b review's 40,000-command fuzz; this deterministic version is
// smaller: FUZZ_SEEDS=n per document, default 40, 40 commands each).
// Documents read from .docx: a 3x3 with a nested 2x2; merges with
// row lead / tail bookmarks and pairs across cells; nested 3 deep;
// two tables in two sections; and the C3b doorways: a bookmark
// spanning a table (its end in a mark-only paragraph after it) and a
// nested table followed by empty paragraphs in its cell. Commands:
// Delete, Backspace and their word forms, typing, Enter, "u\nv",
// a paste of a random slice (same document or not), bold, centre,
// bullets, numbering, restart, upper case, Heading 1, Replace all,
// Add bookmark, Page break, and an undo + redo whose caret is
// EditApply.stepEnd's (C3b I2's way to a table's edge). After each:
// every block valid, ids unique at every depth, every cell non-empty
// and ending with a paragraph, at most one undo step (none: nothing
// changed), undo deep-equal (styles, numbering, rels the very same),
// redo exact, the caret valid, no bookmark mark duplicated and no
// pair broken (but by a step that deletes a whole table: its marks go
// with it). After each sequence: written, read back equal, undone.
import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../../tools/moreapps/!Word/EditDel';
import * as E from '../../tools/moreapps/!Word/Edit';
import {apply as fmt} from '../../tools/moreapps/!Word/FormatApply';
import {replaceAll} from '../../tools/moreapps/!Word/Find';
import {addBookmark} from '../../tools/moreapps/!Word/Bookmarks';
import {pageBreak} from '../../tools/moreapps/!Word/InsertApply';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import * as S from '../../tools/moreapps/!Word/Selection';
import {checkBlock, deepEqual} from '../../tools/moreapps/!Word/Model';
import {forEachBlock} from '../../tools/moreapps/!Word/Walk';
import {checkPos} from '../../tools/moreapps/!Word/EditPos';
import {marks} from '../../tools/moreapps/!Word/BookmarkFind';
import {p, r} from './build-docx.mjs';
import {rng} from './word-docs.mjs';
import {tbl, tr, tc, tblDocx, nestedTable} from './tbl-fixtures.mjs';
import {roundTrip} from './roundtrip-lib.mjs';

const SEEDS = Number(process.env.FUZZ_SEEDS || 40);
const MARK = (n, id) => `<w:${n} w:id="${id}"` +
  (n === 'bookmarkStart' ? ` w:name="m${id}"` : '') + '/>';
const BS = (id) => MARK('bookmarkStart', id);
const BE = (id) => MARK('bookmarkEnd', id);
const FIX = [
  ['nested', () => tblDocx(p(r('before')) + tbl([
    tr([tc(p(r('a'))), tc(p(r('b abc'))), tc(p(r('c')))]),
    tr([tc(p(r('d'))), tc(p(r('e1')) + p(r('e2')) + tbl([
      tr([tc(p(r('n1 abc'))), tc(p(r('n2')))]),
      tr([tc(p(r('n3'))), tc(p(r('n4')))])]) + p(r('e3'))),
    tc(p(r('f')))]),
    tr([tc(p(r('g'))), tc(p(r('h'))), tc(p(r('i')))])]) +
    p(r('after abc')))],
  ['merges and marks', () => tblDocx(p(BS(7) + r('top')) + tbl([
    tr([tc(p(r('wide')), {tcPr: '<w:gridSpan w:val="2"/>'}),
      tc(p(r('down')), {tcPr: '<w:vMerge w:val="restart"/>'})],
    {lead: BS(1)}),
    tr([tc(p(r('x') + BE(7))), tc(p(BS(3) + r('y'))),
      tc(p(), {tcPr: '<w:vMerge/>'})], {tail: BE(1)}),
    tr([tc(p(r('q') + BE(3))), tc(p(r('w'))), tc(p(r('z')))])]) +
    p() + p(r('end')))],
  ['nested 3 deep', () => tblDocx(p(r('x')) + nestedTable(3) + p())],
  ['two tables', () => tblDocx(p(r('one')) + tbl([tr([tc(p(r('a1'))),
    tc(p(r('a2')))]), tr([tc(p(r('a3'))), tc(p(r('a4')))])]) +
    tbl([tr([tc(p(r('b1')))])]) + p(r('mid'), '<w:sectPr/>') +
    tbl([tr([tc(p(r('c1'))), tc(p(r('c2')))])]) + p())],
  ['doorways', () => tblDocx(p(r('p0')) + tbl([
    tr([tc(p(r('a'))), tc(p(BS(4) + r('y')))]),
    tr([tc(p(r('c')) + tbl([tr([tc(p(r('n1'))), tc(p(r('n2')))])]) +
      p() + p()), tc(p(r('d')))])]) + p(BE(4)) + p(BS(5)) + tbl([
    tr([tc(p(r('k') + BE(5)))])]) + p(r('end')))],
];

/** Every caret place: paragraph offsets 0, 1, end; table edges. */
function places(doc) {
  const out = [];
  forEachBlock(doc, (b) => {
    if (b.type === 'tbl') out.push({id: b.id, off: 0}, {id: b.id, off: 1});
    else if (b.type === 'p') {
      for (const off of new Set([0, Math.min(1, b.text.length),
        b.text.length])) out.push({id: b.id, off});
    }
  });
  return out;
}

/** id -> {start, end} counts of the bookmark marks. */
function pairs(doc) {
  const m = new Map();
  for (const x of marks(doc)) {
    if (x.kind !== 'start' && x.kind !== 'end') continue;
    const e = m.get(x.id) || {start: 0, end: 0};
    e[x.kind]++;
    m.set(x.id, e);
  }
  return m;
}

const tableIds = (doc) => {
  const o = new Set();
  forEachBlock(doc, (b) => { if (b.type === 'tbl') o.add(b.id); });
  return o;
};

function invariants(doc, what) {
  const ids = new Set();
  for (const s of doc.sections) {
    assert.ok(s.blocks.length > 0, what + ' empty section');
    for (const b of s.blocks) checkBlock(b);
  }
  forEachBlock(doc, (b) => {
    if (b.type !== 'p' && b.type !== 'tbl') return;
    assert.ok(!ids.has(b.id), what + ' id twice ' + b.id);
    ids.add(b.id);
    if (b.type !== 'tbl') return;
    for (const row of b.rows) {
      for (const c of row.cells) {
        assert.ok(c.blocks.length > 0, what + ' empty cell');
        assert.equal(c.blocks[c.blocks.length - 1].type === 'tbl', false,
          what + ' a cell ends with a table');
      }
    }
  });
}

const DELS = new Set(['del', 'back', 'wback', 'wfwd', 'type', 'enter',
  'paste2']);

function sequence(d, seed) {
  const rd = rng(seed);
  const pick = (xs) => xs[Math.floor(rd() * xs.length)];
  const t = new Typing(d);
  let ops = null;
  d.on('change', (ev) => { ops = ev.ops; });
  const CMDS = [
    ['del', (s) => t.command(() => X.deleteForward(d, s))],
    ['back', (s) => t.command(() => X.deleteBack(d, s))],
    ['wback', (s) => t.command(() => X.deleteWordBack(d, s))],
    ['wfwd', (s) => t.command(() => X.deleteWordForward(d, s))],
    ['type', (s) => t.command(() => E.typeText(d, s, 'Q'))],
    ['enter', (s) => t.command(() => E.splitPara(d, s))],
    ['paste2', (s) => t.command(() => E.typeText(d, s, 'u\nv'))],
    ['bold', (s) => fmt('bold', d, t, s)],
    ['center', (s) => fmt('alignCenter', d, t, s)],
    ['bullets', (s) => fmt('bullets', d, t, s)],
    ['numbering', (s) => fmt('numbering', d, t, s)],
    ['restart', (s) => fmt('listRestart', d, t, s)],
    ['upper', (s) => fmt('changeCase', d, t, s, 'upper')],
    ['style', (s) => fmt('style', d, t, s, 'Heading1')],
    ['replaceAll', (s) => {
      t.command(() => replaceAll(d, 'abc', 'XYZW', {}));
      return s;
    }],
    ['bookmark', (s) => {
      const x = addBookmark(d, t, s, 'bm' + Math.floor(rd() * 5));
      return x && x.sel ? x.sel : s;
    }],
    ['paste', (s) => {
      const ps = places(d.doc);
      const q = S.select(pick(ps), pick(ps));
      const sl = slice(d.doc, q);
      if (!sl) return s;
      return t.command(() => pasteBlocks(d, s, sl.blocks,
        {sameDoc: rd() < 0.5, lists: sl.lists, pics: sl.pics,
          picScope: sl.picScope}));
    }],
    ['pagebreak', (s) => t.command(() => pageBreak(d, s)) || s],
  ];
  let sel = null;
  for (let n = 0; n < 40; n++) {
    const ps = places(d.doc);
    sel = rd() < 0.3 && sel && checkPos(d.doc, sel.head) &&
      checkPos(d.doc, sel.anchor) ? sel : S.select(pick(ps), pick(ps));
    const what = `seed ${seed} #${n}`;
    if (rd() < 0.1 && d.canUndo) {
      // undo and redo: the caret where stepEnd puts it (C3b I2, M3)
      t.command(() => d.undo());
      t.command(() => d.redo());
      const at = stepEnd(d.doc, ops, null);
      if (at) {
        assert.ok(checkPos(d.doc, at), what + ' stepEnd ' +
          JSON.stringify(at));
        sel = S.caret(at);
      }
      continue;
    }
    const [name, cmd] = pick(CMDS);
    const tag = `${what} ${name} ${JSON.stringify(sel)}`;
    const before = structuredClone(d.doc.sections);
    const refs = {styles: d.doc.styles, numbering: d.doc.numbering,
      rels: d.doc.rels};
    const bm = pairs(d.doc), had = tableIds(d.doc);
    const depth = d.undoDepth;
    const out = cmd(sel);
    invariants(d.doc, tag);
    const k = d.undoDepth - depth;
    assert.ok(k === 0 || k === 1, tag + ' steps ' + k);
    if (k === 0) {
      assert.ok(deepEqual(d.doc.sections, before), tag +
        ' no step but changed');
    }
    const after = pairs(d.doc), now = tableIds(d.doc);
    if (DELS.has(name)) {
      for (const [id, a] of after) {
        const e = bm.get(id) || {start: 0, end: 0};
        assert.ok(a.start <= e.start && a.end <= e.end, tag +
          ' mark duplicated ' + id);
      }
    }
    if (![...had].some((x) => !now.has(x))) {
      for (const [id, e] of bm) {
        if (!e.start || !e.end) continue;
        const a = after.get(id) || {start: 0, end: 0};
        assert.equal(a.start > 0, a.end > 0, tag + ' pair broken ' + id);
      }
    }
    if (out && out.head) {
      assert.ok(checkPos(d.doc, out.head), tag + ' bad head');
      assert.ok(checkPos(d.doc, out.anchor), tag + ' bad anchor');
      sel = out;
    }
    if (k) {
      const done = structuredClone(d.doc.sections);
      d.undo();
      assert.ok(deepEqual(d.doc.sections, before), tag + ' undo');
      for (const key of Object.keys(refs)) {
        assert.ok(d.doc[key] === refs[key], tag + ' undo keeps ' + key);
      }
      d.redo();
      assert.ok(deepEqual(d.doc.sections, done), tag + ' redo');
    }
  }
  return {};
}

for (const [name, make] of FIX) {
  it(`${name}: ${SEEDS} random sequences of 40 commands`, async () => {
    const bytes = await make();
    for (let k = 0; k < SEEDS; k++) {
      const res = await roundTrip(bytes, name, 1000 + k, sequence,
        {xsd: null, read: {}});
      assert.ok(!res.refused, 'read ' + res.refused);
    }
  });
}
