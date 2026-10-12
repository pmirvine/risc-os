// Random table-structure command sequences (C4 fix wave; from the C4a
// review's fuzz, made deterministic: FUZZ_SEEDS=n per document,
// default 20, FUZZ_N commands each, default 40). Commands: every
// TABLE id (Tab row, split table, rows above / below, delete rows,
// merge, columns left / right with a layout, delete columns, the four
// selects, distribute rows / columns) and Split cells with 1..4 x
// 1..3, with undo + redo whose caret is EditApply.stepEnd's.
// Documents: merges with row lead / tail bookmarks; gridBefore /
// gridAfter with wBefore / wAfter, tblPrEx, tblHeader, cnfStyle; a pct
// table with a stray continue and a pair across a vertical merge; a
// nested table with a vertical merge; nesting 3 deep; bookmarks in
// empty cell paragraphs; the reported reversed-pair edge; a Strict
// table whose widths and heights stay raw. After EVERY command: every
// table deep-frozen before it (no change in place), blocks valid, ids
// unique, cells ending in a paragraph, the grid memo equal to a fresh
// resolve, no property field beside a raw element of its name, at most
// one undo step (none: nothing changed), undo deep-equal with the very
// top-level blocks (the ones it did not change), styles, numbering
// and rels, redo exact, the caret valid, no bookmark mark
// duplicated, no pair broken or reversed, no mark lost and the
// paragraph texts kept by commands that delete nothing, no shown paragraph becoming hidden, no new stray continue,
// a full table staying full. After each sequence: written, read back
// equal, undone (roundTrip).
import {it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLE} from '../../tools/moreapps/!Letters/TblCmdCols';
import {splitCellsCmd} from '../../tools/moreapps/!Letters/TblCmd';
import {stepEnd} from '../../tools/moreapps/!Letters/EditApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {checkBlock, deepEqual, OBJ}
  from '../../tools/moreapps/!Letters/Model';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {checkPos} from '../../tools/moreapps/!Letters/EditPos';
import {marks} from '../../tools/moreapps/!Letters/BookmarkFind';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {p, r} from './build-docx.mjs';
import {rng} from './word-docs.mjs';
import {tbl, tr, tc, tblDocx, nestedTable, freeze}
  from './tbl-fixtures.mjs';
import {roundTrip} from './roundtrip-lib.mjs';

const SEEDS = Number(process.env.FUZZ_SEEDS || 20);
const N = Number(process.env.FUZZ_N || 40);
const MARK = (n, id) => `<w:${n} w:id="${id}"` +
  (n === 'bookmarkStart' ? ` w:name="m${id}"` : '') + '/>';
const BS = (id) => MARK('bookmarkStart', id);
const BE = (id) => MARK('bookmarkEnd', id);
const W = (w, t = 'dxa') => `<w:tcW w:w="${w}" w:type="${t}"/>`;
const SPAN = (n) => `<w:gridSpan w:val="${n}"/>`;
const VR = '<w:vMerge w:val="restart"/>', VC = '<w:vMerge/>';
const FIX = [
  ['merges and marks', () => tblDocx(p(BS(7) + r('top')) + tbl([
    tr([tc(p(r('wide')), {tcPr: SPAN(2)}),
      tc(p(r('down')), {tcPr: VR})], {lead: BS(1)}),
    tr([tc(p(r('x') + BE(7))), tc(p(BS(3) + r('y'))),
      tc(p(r('hid')), {tcPr: VC})], {tail: BE(1)}),
    tr([tc(p(r('q') + BE(3))), tc(p(r('w'))), tc(p(r('z')))])]) +
    p() + p(r('end')))],
  ['before / after, tblPrEx', () => tblDocx(p(r('x')) + tbl([
    tr([tc(p(r('a')), {tcPr: W(2000)}), tc(p(r('b')), {tcPr: W(2000)})],
      {trPr: '<w:gridAfter w:val="1"/><w:wAfter w:w="2000" ' +
        'w:type="dxa"/><w:tblHeader/>'}),
    tr([tc(p(r('c')), {tcPr: W(2000)}), tc(p(r('d')), {tcPr: W(2000)}),
      tc(p(r('e')), {tcPr: W(2000)})], {trPr: '<w:tblHeader/>'}),
    tr([tc(p(r('f')), {tcPr: W(4000) + SPAN(2)}),
      tc(p(r('g')), {tcPr: W(2000)})],
    {trPr: '<w:cnfStyle w:val="000000100000"/>'}),
    '<w:tr><w:tblPrEx><w:tblW w:w="0" w:type="auto"/></w:tblPrEx>' +
      '<w:trPr><w:gridBefore w:val="1"/><w:wBefore w:w="2000" ' +
      'w:type="dxa"/></w:trPr>' + tc(p(r('h')), {tcPr: W(2000)}) +
      tc(p(r('i')), {tcPr: W(2000)}) + '</w:tr>',
  ], {tblPr: '<w:tblW w:w="6000" w:type="dxa"/>',
    grid: [2000, 2000, 2000]}) + p())],
  ['pct and a stray continue', () => tblDocx(p(r('x')) + tbl([
    tr([tc(p(r('a')), {tcPr: W(2500, 'pct') + VR}),
      tc(p(r('b')), {tcPr: W(2500, 'pct')})]),
    tr([tc(p(r('c')), {tcPr: W(2500, 'pct')}),
      tc(p(r('d')), {tcPr: W(2500, 'pct')})]),
    tr([tc(p(r('stray')), {tcPr: W(2500, 'pct') + VC}),
      tc(p(r('e')), {tcPr: W(2500, 'pct') + VR})]),
    tr([tc(p(BS(9) + r('k')), {tcPr: W(2500, 'pct')}),
      tc(p(r('l') + BE(9)), {tcPr: W(2500, 'pct') + VC})]),
  ], {tblPr: '<w:tblW w:w="5000" w:type="pct"/>'}) + p())],
  ['nested with a merge', () => tblDocx(p(r('before')) + tbl([
    tr([tc(p(r('a'))), tc(p(r('b abc'))), tc(p(r('c')))]),
    tr([tc(p(r('d'))), tc(p(r('e1')) + p(r('e2')) + tbl([
      tr([tc(p(r('n1 abc')), {tcPr: VR}), tc(p(r('n2')))]),
      tr([tc(p(r('n3')), {tcPr: VC}), tc(p(r('n4')))])]) + p(r('e3'))),
    tc(p(r('f')))]),
    tr([tc(p(r('g'))), tc(p(r('h'))), tc(p(r('i')))])]) +
    p(r('after abc')))],
  ['nested 3 deep', () => tblDocx(p(r('x')) + nestedTable(3) + p())],
  ['empty cells with marks', () => tblDocx(p(r('x')) + tbl([
    tr([tc(p(BS(5) + BE(5))), tc(p()), tc(p(r('a')))]),
    tr([tc(p()), tc(p(BS(6))), tc(p(r('b')))]),
    tr([tc(p(BE(6))), tc(p()), tc(p(r('c')))])]) + p())],
  ['the reported edge', () => tblDocx(p(r('x')) + tbl([
    tr([tc(p(r('a'))), tc(p(r('b'))), tc(p(BS(11) + r('right')))]),
    tr([tc(p(r('c') + BE(11)), {lead: BS(12)}), tc(p(r('d') + BE(12))),
      tc(p(r('e')))])]) + p())],
  ['Strict raw widths', () => tblDocx(p(r('x')) + tbl([0, 1, 2].map(
    (i) => tr([0, 1, 2].map((j) => tc(p(r(`s${i}${j}`)),
      {tcPr: '<w:tcW w:w="155.80pt" w:type="dxa"/>'})),
    {trPr: '<w:trHeight w:val="12pt"/>'}))) + p(), {strict: true})],
];

const tables = (doc) => {
  const o = [];
  forEachBlock(doc, (b) => { if (b.type === 'tbl') o.push(b); });
  return o;
};
/** [{id, len}] of the paragraphs directly in shown cells of t. */
function cellParas(t) {
  const g = gridOf(t), o = [];
  t.rows.forEach((row, i) => row.cells.forEach((c, k) => {
    if (g.rows[i].cells[k].cont) return;
    for (const b of c.blocks) {
      if (b.type === 'p') o.push({id: b.id, len: b.text.length});
    }
  }));
  return o;
}
/** paragraph id -> whether it is hidden (in a continue cell). */
function shownMap(doc) {
  const m = new Map();
  const walk = (blocks, hid) => {
    for (const b of blocks) {
      if (b.type === 'p') m.set(b.id, hid);
      else if (b.type === 'tbl') {
        const g = gridOf(b);
        b.rows.forEach((row, i) => row.cells.forEach((c, k) =>
          walk(c.blocks, hid || g.rows[i].cells[k].cont)));
      }
    }
  };
  for (const s of doc.sections) walk(s.blocks, false);
  return m;
}
/** The paragraph texts without U+FFFC (marks and other inlines may
 *  move: a merge puts a reversed pair's start in a lead; the marks
 *  are counted by pairs()). */
const texts = (doc) => {
  const o = [];
  forEachBlock(doc, (b) => {
    const x = b.type === 'p' ? b.text.split(OBJ).join('') : '';
    if (x) o.push(x);
  });
  return o.sort();
};
/** id -> {start, end, s, e}: counts and last places of its marks. */
function pairs(doc) {
  const m = new Map();
  let i = 0;
  for (const x of marks(doc)) {
    if (x.kind !== 'start' && x.kind !== 'end') continue;
    const e = m.get(x.id) || {start: 0, end: 0, s: -1, e: -1};
    e[x.kind]++;
    if (x.kind === 'start') e.s = i;
    else e.e = i;
    i++;
    m.set(x.id, e);
  }
  return m;
}
function strays(t) {
  const g = gridOf(t);
  let n = 0;
  t.rows.forEach((row, i) => row.cells.forEach((c, k) => {
    if (c.tcPr.vMerge === 'continue' && !g.rows[i].cells[k].cont) n++;
  }));
  return n;
}
const widths = (t) => t.rows.map((row) => ((row.trPr &&
  row.trPr.gridBefore) || 0) + row.cells.reduce((a, c) => a +
  (c.tcPr.gridSpan || 1), 0) + ((row.trPr && row.trPr.gridAfter) || 0));
const RAW = /^(w:)?(tcW|gridSpan|vMerge|trHeight|gridBefore|gridAfter|tblW)$/;
/** No field beside a raw element of its name (C4 fix A1). */
function noTwice(pr, what) {
  for (const n of (pr && pr.extra) || []) {
    const m = n && typeof n.name === 'string' && RAW.exec(n.name);
    if (m) assert.equal(pr[m[2]], undefined, what + ' raw and field ' + m[2]);
  }
}
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
    const fresh = gridOf(structuredClone(b));
    assert.ok(deepEqual(JSON.parse(JSON.stringify(gridOf(b))),
      JSON.parse(JSON.stringify(fresh))), what + ' grid memo stale');
    noTwice(b.tblPr, what);
    for (const row of b.rows) {
      noTwice(row.trPr, what);
      for (const c of row.cells) {
        noTwice(c.tcPr, what);
        assert.ok(c.blocks.length > 0, what + ' empty cell');
        assert.equal(c.blocks[c.blocks.length - 1].type, 'p',
          what + ' cell not ending in p');
      }
    }
  });
}

function randSel(doc, rd, pick) {
  const ts = tables(doc);
  if (!ts.length) return null;
  const t = pick(ts), ps = cellParas(t);
  if (!ps.length) return null;
  const a = pick(ps), x = rd();
  if (x < 0.45) {
    return S.caret({id: a.id, off: Math.floor(rd() * (a.len + 1))});
  }
  if (x < 0.9) {
    const b = pick(ps);
    return S.select({id: a.id, off: 0}, {id: b.id, off: b.len});
  }
  if (x < 0.95) return S.select({id: t.id, off: 0}, {id: t.id, off: 1});
  const all = [];
  forEachBlock(doc, (b) => { if (b.type === 'p') all.push(b); });
  return S.select({id: a.id, off: 0}, {id: pick(all).id, off: 0});
}

function fakeL(doc, rd) {
  const byId = new Map();
  for (const b of tables(doc)) {
    byId.set(b.id, {block: b, col: {w: 200 + Math.floor(rd() * 600)},
      rows: b.rows.map(() => ({h: Math.floor(rd() * 60)}))});
  }
  return {byId};
}

const IDS = ['tabRow', 'splitTable', 'rowsAbove', 'rowsBelow',
  'deleteRows', 'mergeCells', 'colsLeft', 'colsRight', 'deleteCols',
  'selectCell', 'selectRow', 'selectColumn', 'selectTable',
  'distributeRows', 'distributeCols', 'split'];
const KEEP = new Set(['rowsAbove', 'rowsBelow', 'mergeCells',
  'colsLeft', 'colsRight', 'distributeRows', 'distributeCols', 'split',
  'tabRow', 'splitTable']);

/** One command's checks (see the header). */
function check(d, tag, id, out, before, depth) {
  invariants(d.doc, tag);
  const k = d.undoDepth - depth;
  assert.ok(k === 0 || k === 1, tag + ' steps ' + k);
  if (k === 0) {
    assert.ok(deepEqual(d.doc.sections, before.sections),
      tag + ' no step but changed');
  }
  if (k) assert.ok(out, tag + ' changed but refused');
  const after = pairs(d.doc), now = tables(d.doc);
  const gone = [...before.had].some((x) => !now.some((y) => y.id === x));
  for (const [bid, e] of before.bm) {
    const a = after.get(bid) || {start: 0, end: 0};
    assert.ok(a.start <= e.start && a.end <= e.end, tag + ' mark twice ' +
      bid);
    if (e.start && e.end && !gone) {
      assert.equal(a.start > 0, a.end > 0, tag + ' pair broken ' + bid);
    }
    if (e.start === 1 && e.end === 1 && e.s < e.e && a.start === 1 &&
      a.end === 1) assert.ok(a.s < a.e, tag + ' pair reversed ' + bid);
    if (KEEP.has(id)) {
      assert.ok(e.start === a.start && e.end === a.end,
        tag + ' mark lost ' + bid);
    }
  }
  const sh = shownMap(d.doc);
  for (const [pid, hid] of before.shown) {
    assert.ok(!(sh.has(pid) && !hid && sh.get(pid)),
      tag + ' paragraph ' + pid + ' became hidden');
  }
  if (KEEP.has(id)) {
    assert.deepEqual(texts(d.doc), before.texts, tag + ' text changed');
  }
  for (const b of now) {
    if (before.strays.has(b.id)) {
      assert.ok(strays(b) <= before.strays.get(b.id), tag + ' stray ' +
        'continue made in ' + b.id);
    }
    if (before.full.get(b.id)) {
      assert.ok(widths(b).every((w) => w === b.grid.length),
        tag + ' table ' + b.id + ' no longer full');
    }
  }
  if (out && out.head) {
    assert.ok(checkPos(d.doc, out.head), tag + ' bad head');
    assert.ok(checkPos(d.doc, out.anchor), tag + ' bad anchor');
  }
  return k;
}

/** The sequence for roundTrip (see the header). */
const sequence = (d, seed) => {
  const rd = rng(seed);
  const pick = (xs) => xs[Math.floor(rd() * xs.length)];
  const t = new Typing(d);
  let ops = null;
  d.on('change', (ev) => { ops = ev.ops; });
  let sel = null;
  for (let n = 0; n < N; n++) {
    if (rd() < 0.1 && d.canUndo) {
      t.command(() => d.undo());
      const a1 = stepEnd(d.doc, ops, null);
      if (a1) assert.ok(checkPos(d.doc, a1), 'stepEnd undo');
      t.command(() => d.redo());
      const a2 = stepEnd(d.doc, ops, null);
      if (a2) assert.ok(checkPos(d.doc, a2), 'stepEnd redo');
      continue;
    }
    if (!(sel && rd() < 0.4 && checkPos(d.doc, sel.head) &&
      checkPos(d.doc, sel.anchor))) sel = randSel(d.doc, rd, pick);
    if (!sel) return {};
    const id = pick(IDS);
    const tag = `seed ${seed} #${n} ${id} ${JSON.stringify(sel)}`;
    const now = tables(d.doc);
    for (const b of now) freeze(b);
    const before = {sections: structuredClone(d.doc.sections),
      top: d.doc.sections.map((s) => s.blocks.slice()),
      refs: {styles: d.doc.styles, numbering: d.doc.numbering,
        rels: d.doc.rels},
      bm: pairs(d.doc), had: new Set(now.map((b) => b.id)),
      shown: shownMap(d.doc), texts: texts(d.doc),
      strays: new Map(now.map((b) => [b.id, strays(b)])),
      full: new Map(now.map((b) => [b.id, widths(b).every((w) =>
        w === b.grid.length)]))};
    const depth = d.undoDepth, L = fakeL(d.doc, rd);
    const out = id === 'split'
      ? t.command(() => splitCellsCmd(d, sel, {cols: 1 + Math.floor(
        rd() * 4), rows: 1 + Math.floor(rd() * 3)}))
      : t.command(() => TABLE[id](d, sel, {L}));
    if (check(d, tag, id, out, before, depth)) {
      const done = structuredClone(d.doc.sections);
      // (a paragraph the command changed, as the one a removed
      // table's kept bookmark marks go to, comes back equal)
      const kept = new Set(d.doc.sections.flatMap((x) => x.blocks));
      d.undo();
      assert.ok(deepEqual(d.doc.sections, before.sections), tag + ' undo');
      d.doc.sections.forEach((s, i) => s.blocks.forEach((b, j) =>
        assert.ok(b === before.top[i][j] || b.type === 'tbl' ||
          !kept.has(before.top[i][j]), tag + ' undo: the very blocks')));
      for (const k of Object.keys(before.refs)) {
        assert.ok(d.doc[k] === before.refs[k], tag + ' undo keeps ' + k);
      }
      const a1 = stepEnd(d.doc, ops, null);
      if (a1) assert.ok(checkPos(d.doc, a1), tag + ' stepEnd');
      d.redo();
      assert.ok(deepEqual(d.doc.sections, done), tag + ' redo');
    }
    if (out && out.head) sel = out;
  }
  return {};
};

for (const [name, make] of FIX) {
  it(`${name}: ${SEEDS} x ${N} random structure commands`, async () => {
    const bytes = await make();
    for (let s = 0; s < SEEDS; s++) {
      const res = await roundTrip(bytes, name, 7000 + s, sequence,
        {read: {}});
      assert.ok(!res.refused, name + ' read');
    }
  });
}
