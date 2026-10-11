// The C4 fix wave's table rules (./TblNorm and the commands using
// them). A1: a command that sets (or removes) a tcPr / trPr / tblPr
// field drops the raw element of the same name kept in extra (a
// Strict w:tcW w:w="155.80pt"), so no cell is written with two w:tcW
// (insert columns, distribute columns / rows, merge, split; written
// XML read back equal to the model). A2: merge (and split over a
// cells shape) never writes a bookmark pair end-before-start: the
// shown cells' leads go with their content, and a start the merge
// leaves after its moved end goes to the merged cell's lead. A3: a
// stray vMerge continue cell (no merge above it: read as a restart)
// is written restart by every structural command, so delete rows,
// merge and split into rows never join it to a merge (its text
// hidden). A4 (ruling): a row inserted below a merge's last row (Tab
// in the last cell, Insert row below) gets plain cells; a merge grows
// only when the new row is strictly inside it.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {prWith, unstray} from '../../tools/moreapps/!Word/TblNorm';
import {TABLE} from '../../tools/moreapps/!Word/TblCmdCols';
import {splitCellsCmd} from '../../tools/moreapps/!Word/TblCmd';
import {mergeCells} from '../../tools/moreapps/!Word/TblMerge';
import {insertRows} from '../../tools/moreapps/!Word/TblEdit';
import {gridOf} from '../../tools/moreapps/!Word/TblGrid';
import {newPara, reserveIds, OBJ} from '../../tools/moreapps/!Word/Model';
import {forEachBlock} from '../../tools/moreapps/!Word/Walk';
import {marks} from '../../tools/moreapps/!Word/BookmarkFind';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import * as S from '../../tools/moreapps/!Word/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, modelTable, freeze}
  from './tbl-fixtures.mjs';
import {xmlEntries, assertSameDoc, expectedBack}
  from './docx-compare.mjs';
import {CORPUS} from './roundtrip-lib.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const VR = '<w:vMerge w:val="restart"/>', VC = '<w:vMerge/>';
const SPAN = (n) => `<w:gridSpan w:val="${n}"/>`;
const BS = (id) => `<w:bookmarkStart w:id="${id}" w:name="m${id}"/>`;
const BE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const raw = (name, attrs) => ({name, attrs, children: []});

const open = async (body, o) => new Document(await readDocx(
  await tblDocx(body, o), {}));
const tables = (doc) => {
  const out = [];
  forEachBlock(doc, (b) => { if (b.type === 'tbl') out.push(b); });
  return out;
};
const plain = (b) => b.text.split(OBJ).join('');
function para(d, t) {
  let o = null;
  forEachBlock(d.doc, (b) => {
    if (b.type === 'p' && plain(b) === t && !o) o = b;
  });
  assert.ok(o, 'no paragraph ' + t);
  return o;
}
const car = (d, t) => S.caret({id: para(d, t).id, off: 0});
const cells = (d, a, b) => S.select({id: para(d, a).id, off: 0},
  {id: para(d, b).id, off: para(d, b).text.length});
/** Whether the paragraph with text t is in a continue cell (hidden). */
function hidden(d, t) {
  let out = null;
  const walk = (blocks, hid) => {
    for (const b of blocks) {
      if (b.type === 'p' && plain(b) === t) out = hid;
      if (b.type !== 'tbl') continue;
      const g = gridOf(b);
      b.rows.forEach((row, i) => row.cells.forEach((c, k) =>
        walk(c.blocks, hid || g.rows[i].cells[k].cont)));
    }
  };
  for (const s of d.doc.sections) walk(s.blocks, false);
  assert.notEqual(out, null, 'no paragraph ' + t);
  return out;
}
/** The bookmark marks of doc in order: 'start7 end7 ...'. */
const order = (doc) => marks(doc).filter((m) => m.kind === 'start' ||
  m.kind === 'end').map((m) => m.kind + m.id).join(' ');

/** Every w:tcPr / w:trPr of the written document: no child twice. */
async function onceEach(doc, what) {
  const bytes = await writeDocx(doc, {date: DATE});
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  let n = 0;
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.name === 'w:tcPr' || x.name === 'w:trPr' ||
      x.name === 'w:tblPr') {
      n++;
      const names = x.children.filter((c) => c && c.name)
        .map((c) => c.name);
      assert.equal(new Set(names).size, names.length, what + ': ' +
        x.name + ' has ' + names.join(' '));
    }
    for (const c of x.children || []) walk(c);
  };
  walk(root);
  assert.ok(n > 0);
  const back = await readDocx(bytes, {});
  assertSameDoc(back, expectedBack(doc), what + ' read back');
  return bytes;
}

describe('prWith (A1: the setProps rule for table properties)', () => {
  const W1 = raw('w:tcW', [['w:w', '155.80pt'], ['w:type', 'dxa']]);
  const CNF = raw('w:cnfStyle', [['w:val', '100000000000']]);
  it('setting a field drops the raw element of its name', () => {
    const pr = freeze({vAlign: 'center', extra: [CNF, W1]});
    const o = prWith(pr, {tcW: {w: 3000, type: 'dxa'}});
    assert.deepEqual(o, {vAlign: 'center', tcW: {w: 3000, type: 'dxa'},
      extra: [CNF]});
    assert.notEqual(o, pr);
  });
  it('removing a field (undefined) drops it and its raw element', () => {
    const H = raw('w:tblHeader', [['w:val', 'on']]);
    const pr = freeze({gridBefore: 2, extra: [H]});
    assert.deepEqual(prWith(pr, {gridBefore: undefined,
      tblHeader: undefined}), {extra: []});
  });
  it('no raw element of the name: extra is the same array', () => {
    const pr = freeze({extra: [CNF]});
    const o = prWith(pr, {gridSpan: 2, vMerge: 'restart'});
    assert.equal(o.extra, pr.extra);
    assert.deepEqual(o, {extra: [CNF], gridSpan: 2, vMerge: 'restart'});
  });
  it('null or no extra: a plain copy', () => {
    assert.deepEqual(prWith(null, {gridAfter: 1}), {gridAfter: 1});
    assert.deepEqual(prWith({jc: 'left'}, {jc: undefined}), {});
  });
});

/** A Strict 3x3 whose widths and heights the reader keeps raw. */
const STRICT_W = '<w:tcW w:w="155.80pt" w:type="dxa"/>';
const strictDoc = () => open(p(r('x')) + tbl([0, 1, 2].map((i) =>
  tr([0, 1, 2].map((j) => tc(p(r(`s${i}${j}`)), {tcPr: STRICT_W})),
    {trPr: '<w:trHeight w:val="12pt"/>'}))) + p(r('y')),
{strict: true});
/** A layout for the commands that read one: every table's item. */
function fakeL(doc) {
  const byId = new Map();
  for (const t of tables(doc)) {
    byId.set(t.id, {block: t, col: {w: 600},
      rows: t.rows.map(() => ({h: 30}))});
  }
  return {byId};
}

describe('Strict widths: one w:tcW / w:trHeight per element (A1)',
  () => {
    const RUNS = [
      ['insert column right', (d) => TABLE.colsRight(d, car(d, 's00'),
        {L: fakeL(d.doc)})],
      ['insert columns left', (d) => TABLE.colsLeft(d, cells(d, 's00',
        's11'), {L: fakeL(d.doc)})],
      ['distribute columns', (d) => TABLE.distributeCols(d,
        car(d, 's11'))],
      ['distribute rows', (d) => TABLE.distributeRows(d, car(d, 's11'),
        {L: fakeL(d.doc)})],
      ['merge 2x2', (d) => TABLE.mergeCells(d, cells(d, 's00', 's11'))],
      ['split 3 x 2', (d) => splitCellsCmd(d, car(d, 's11'),
        {cols: 3, rows: 2})],
      ['merge then split', (d) => splitCellsCmd(d, cells(d, 's01',
        's12'), {cols: 3, rows: 1})],
      ['rows below', (d) => TABLE.rowsBelow(d, car(d, 's22'))],
      ['delete column', (d) => TABLE.deleteCols(d, car(d, 's11'))],
    ];
    for (const [name, run] of RUNS) {
      it(name, async () => {
        const d = await strictDoc();
        const t0 = tables(d.doc)[0];
        assert.ok(t0.rows[0].cells[0].tcPr.extra.some((n) =>
          n.name === 'w:tcW'), 'the fixture keeps tcW raw');
        assert.ok(run(d), name + ' applied');
        await onceEach(d.doc, name);
      });
    }
    const f = join(CORPUS, 'handoff', '6-roundtrip-strict.docx');
    it('handoff/6-roundtrip-strict.docx: insert, distribute, merge, ' +
      'split', {skip: !existsSync(f) && 'corpus missing'}, async () => {
      const d = new Document(await readDocx(readFileSync(f), {}));
      const t = tables(d.doc).find((x) => x.rows.length > 1 &&
        x.rows[0].cells.length > 1 && x.rows[1].cells.length > 1);
      const first = (r0, k) => {
        const c = tables(d.doc).find((x) => x.id === t.id)
          .rows[r0].cells[k];
        return c.blocks.find((b) => b.type === 'p');
      };
      const at = (r0, k) => S.caret({id: first(r0, k).id, off: 0});
      assert.ok(TABLE.colsRight(d, at(0, 0), {L: fakeL(d.doc)}));
      assert.ok(TABLE.distributeCols(d, at(0, 0)));
      assert.ok(TABLE.mergeCells(d, S.select({id: first(0, 0).id,
        off: 0}, {id: first(1, 1).id, off: 0})));
      assert.ok(splitCellsCmd(d, at(0, 0), {cols: 2, rows: 1}));
      await onceEach(d.doc, 'strict hand-off');
    });
  });

describe('merge keeps bookmark pairs in order (A2)', () => {
  it('the reported edge: start right of the rectangle in row 0, end ' +
    'in a paragraph moved up', async () => {
    const d = await open(p(r('x')) + tbl([
      tr([tc(p(r('a'))), tc(p(r('b'))), tc(p(BS(11) + r('right')))]),
      tr([tc(p(r('c') + BE(11))), tc(p(r('d'))), tc(p(r('e')))])]) +
      p(r('y')));
    assert.equal(order(d.doc), 'start11 end11');
    assert.ok(TABLE.mergeCells(d, cells(d, 'a', 'd')));
    assert.equal(order(d.doc), 'start11 end11');
    const bytes = await onceEach(d.doc, 'edge');
    assert.equal(order(await readDocx(bytes, {})), 'start11 end11');
    d.undo();
    assert.equal(order(d.doc), 'start11 end11');
  });
  it('the common case: start in a lower cell\'s lead, end in its ' +
    'paragraph: the lead goes with the content', async () => {
    const d = await open(p(r('x')) + tbl([
      tr([tc(p(r('a'))), tc(p(r('b')))]),
      tr([tc(p(r('c')), {lead: BS(4)}), tc(p(r('d') + BE(4)))])]) +
      p(r('y')));
    assert.ok(TABLE.mergeCells(d, cells(d, 'a', 'd')));
    assert.equal(order(d.doc), 'start4 end4');
    const t = tables(d.doc)[0];
    assert.equal(t.rows[0].cells[0].lead.length, 1, 'start moved up');
    assert.equal(t.rows[1].cells[0].lead.length, 0);
    await onceEach(d.doc, 'lead');
  });
  it('a start in a left cell of a lower row, end moved up; a pair ' +
    'wholly in the rectangle unchanged', async () => {
    const d = await open(p(r('x')) + tbl([
      tr([tc(p(r('L0'))), tc(p(BS(2) + r('a'))), tc(p(r('b')))]),
      tr([tc(p(BS(3) + r('L1'))), tc(p(r('c') + BE(3))),
        tc(p(r('d') + BE(2)))])]) + p(r('y')));
    assert.equal(order(d.doc), 'start2 start3 end3 end2');
    assert.ok(TABLE.mergeCells(d, cells(d, 'a', 'd')));
    const o = order(d.doc).split(' ');
    for (const id of [2, 3]) {
      assert.ok(o.indexOf('start' + id) < o.indexOf('end' + id),
        order(d.doc));
    }
    await onceEach(d.doc, 'left');
  });
  it('split over a cells shape (merge first) keeps the order too',
    async () => {
      const d = await open(p(r('x')) + tbl([
        tr([tc(p(r('a'))), tc(p(r('b'))), tc(p(BS(5) + r('right')))]),
        tr([tc(p(r('c') + BE(5))), tc(p(r('d'))), tc(p(r('e')))])]) +
        p(r('y')));
      assert.ok(splitCellsCmd(d, cells(d, 'a', 'd'), {cols: 2,
        rows: 1}));
      assert.equal(order(d.doc), 'start5 end5');
      await onceEach(d.doc, 'split');
    });
  it('the model function alone: no pair reversed, nothing lost', () => {
    const mk = (kind, id) => ({kind: 'raw', level: 'p', text: '',
      node: raw('w:bookmark' + kind, [['w:id', String(id)]].concat(
        kind === 'Start' ? [['w:name', 'b' + id]] : []))});
    const sp = newPara(OBJ + 'r', {inlines: {0: mk('Start', 1)}});
    const ep = newPara('c' + OBJ, {inlines: {1: mk('End', 1)}});
    const X = freeze(modelTable([['a', 'b', {blocks: [sp]}],
      [{blocks: [ep]}, 'd', 'e']]));
    reserveIds({sections: [{blocks: [X]}]});
    const t = mergeCells(X, gridOf(X), {r0: 0, r1: 1, c0: 0, c1: 1});
    const doc = {sections: [{blocks: [t]}]};
    assert.equal(order(doc), 'start1 end1');
  });
});

describe('a stray continue is never joined to a merge (A3)', () => {
  it('delete rows: Y under a plain cell stays shown', async () => {
    const d = await open(p() + tbl([
      tr([tc(p(r('A')), {tcPr: VR}), tc(p(r('B')))]),
      tr([tc(p(r('C'))), tc(p(r('D')))]),
      tr([tc(p(r('Y')), {tcPr: VC}), tc(p(r('E')))])]) + p());
    assert.equal(hidden(d, 'Y'), false);
    assert.ok(TABLE.deleteRows(d, car(d, 'C')));
    assert.equal(hidden(d, 'Y'), false);
    assert.equal(tables(d.doc)[0].rows[1].cells[0].tcPr.vMerge,
      'restart');
    await onceEach(d.doc, 'delete rows');
  });
  it('merge over rows: X below the rectangle stays shown', async () => {
    const d = await open(p() + tbl([
      tr([tc(p(r('A'))), tc(p(r('B')))]),
      tr([tc(p(r('C'))), tc(p(r('D')))]),
      tr([tc(p(r('X')), {tcPr: SPAN(2) + VC})])]) + p());
    assert.ok(TABLE.mergeCells(d, cells(d, 'A', 'D')));
    assert.equal(hidden(d, 'X'), false);
    await onceEach(d.doc, 'merge');
  });
  it('split into rows: Y beside the new rows stays shown', async () => {
    const d = await open(p() + tbl([
      tr([tc(p(r('A'))), tc(p(r('N')))]),
      tr([tc(p(r('C'))), tc(p(r('Y')), {tcPr: VC})])]) + p());
    assert.ok(splitCellsCmd(d, car(d, 'A'), {cols: 1, rows: 2}));
    assert.equal(hidden(d, 'Y'), false);
    await onceEach(d.doc, 'split rows');
  });
  it('insert rows, split table, columns: no stray joins', async () => {
    const body = p() + tbl([
      tr([tc(p(r('A'))), tc(p(r('N')), {tcPr: VR}), tc(p(r('K0')))]),
      tr([tc(p(r('C'))), tc(p(r('Q')), {tcPr: VC}), tc(p(r('K1')))]),
      tr([tc(p(r('Z')), {tcPr: VC}), tc(p(r('Y')), {tcPr: VC}),
        tc(p(r('K2')))])]) + p();
    for (const [run, merged] of [
      [(d) => TABLE.rowsAbove(d, car(d, 'C')), true],
      [(d) => TABLE.rowsBelow(d, car(d, 'A')), true],
      // (a split at Y's row restarts its merge there: Y shown)
      [(d) => TABLE.splitTable(d, car(d, 'Z')), false],
      [(d) => TABLE.colsLeft(d, car(d, 'A'), {}), true],
      [(d) => TABLE.deleteCols(d, car(d, 'K0')), true],
    ]) {
      const d = await open(body);
      assert.equal(hidden(d, 'Z'), false);
      assert.ok(run(d));
      assert.equal(hidden(d, 'Z'), false);
      assert.equal(hidden(d, 'Y'), merged, 'a real merge stays');
    }
  });
  it('unstray: strays written restart; none: the same table', () => {
    const X = freeze(modelTable([['a', {blocks: ['b'], tcPr: {vMerge:
      'continue', extra: []}}], [{blocks: ['c'], tcPr: {vMerge:
      'continue', extra: []}}, 'd']]));
    const t = unstray(X);
    assert.deepEqual(t.rows.map((row) => row.cells.map((c) =>
      c.tcPr.vMerge || '-')), [['-', 'restart'], ['restart', '-']]);
    assert.notEqual(t.grid, X.grid, 'a new grid array');
    assert.equal(unstray(t), t);
  });
});

describe('a new row below a merge\'s last row is plain (A4)', () => {
  const body = () => p() + tbl([
    tr([tc(p(r('m')), {tcPr: VR}), tc(p(r('x')))]),
    tr([tc(p(), {tcPr: VC}), tc(p(r('y')))]),
    tr([tc(p(), {tcPr: VC}), tc(p(r('z')))])]) + p();
  it('Tab in the last cell: the new row\'s first cell is shown and ' +
    'typable', async () => {
    const d = await open(body());
    const z = para(d, 'z');
    assert.ok(TABLE.tabRow(d, S.caret({id: z.id, off: 1})));
    const t = tables(d.doc)[0], g = gridOf(t);
    assert.equal(t.rows.length, 4);
    assert.equal(t.rows[3].cells[0].tcPr.vMerge, undefined);
    assert.equal(g.rows[3].cells[0].cont, false);
    assert.equal(g.rows[0].cells[0].rowSpan, 3, 'the merge kept');
  });
  it('Insert row below the last row of the merge: plain; inside the ' +
    'merge it grows', async () => {
    let d = await open(body());
    assert.ok(TABLE.rowsBelow(d, car(d, 'z')));
    let t = tables(d.doc)[0];
    assert.equal(gridOf(t).rows[3].cells[0].cont, false);
    assert.equal(gridOf(t).rows[0].cells[0].rowSpan, 3);
    d = await open(body());
    assert.ok(TABLE.rowsBelow(d, car(d, 'y')));
    t = tables(d.doc)[0];
    assert.equal(gridOf(t).rows[2].cells[0].cont, true);
    assert.equal(gridOf(t).rows[0].cells[0].rowSpan, 4);
    d = await open(body());
    assert.ok(TABLE.rowsAbove(d, car(d, 'y')));
    t = tables(d.doc)[0];
    assert.equal(gridOf(t).rows[0].cells[0].rowSpan, 4);
  });
  it('the model function: below a one-row restart, plain', () => {
    const X = freeze(modelTable([[{blocks: ['m'], tcPr: {vMerge:
      'restart', extra: []}}, 'x']]));
    reserveIds({sections: [{blocks: [X]}]});
    const t = insertRows(X, 0, 0, true);
    assert.equal(t.rows[1].cells[0].tcPr.vMerge, undefined);
  });
});
