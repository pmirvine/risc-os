// Path (block paths) and Walk (one walk of the model for every
// scanner), Batch C1.1.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, emptyDoc, nextId, reserveIds, newTable, newRow,
  newCell} from '../../tools/moreapps/!Word/Model';
import {isPath, depthOf, isTop, sib, tableOf, cellOf, topOf, samePath,
  cmpPath} from '../../tools/moreapps/!Word/Path';
import {blocks, forEachBlock, walkBlocks, loose, ids, blockIds, at,
  mapBlocks, flatText} from '../../tools/moreapps/!Word/Walk';
import {modelTable, freeze, tbl, tr, tc, nestedTable, bigTable,
  TBL_OPAQUE, tblDocx, tableXml} from './tbl-fixtures.mjs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {p, r} from './build-docx.mjs';

const P = (t) => newPara(t);
const docOf = (...bl) => {
  const d = emptyDoc();
  d.sections[0].blocks = bl;
  return d;
};
const mark = (name, id) => ({name: 'w:' + name,
  attrs: [['w:id', String(id)]], children: []});

/** p0, T (2x2, a 1x1 N in cell (1,0) between c10 and c10b), p1. */
function flowDoc() {
  const x = {};
  for (const n of ['p0', 'c00', 'c01', 'c10', 'n00', 'c10b', 'c11',
    'p1']) x[n] = P(n);
  x.N = modelTable([[[x.n00]]]);
  x.T = modelTable([[[x.c00], [x.c01]], [[x.c10, x.N, x.c10b],
    [x.c11]]]);
  x.doc = docOf(x.p0, x.T, x.p1);
  return x;
}

describe('Path', () => {
  it('isPath', () => {
    const of = (n) => Array(n).fill(0);
    for (const n of [2, 5, 26]) assert.equal(isPath(of(n)), true, n);
    for (const n of [0, 1, 3, 4, 29]) assert.equal(isPath(of(n)), false);
    for (const x of [[0, -1], [0, 1.5], ['0', 1], [0, NaN], 'ab',
      null, undefined, {length: 2, 0: 0, 1: 0}, [0, Infinity]]) {
      assert.equal(isPath(x), false, String(x));
    }
  });
  it('depthOf, isTop, sib, topOf, samePath', () => {
    assert.equal(depthOf([0, 1]), 0);
    assert.equal(depthOf([0, 1, 2, 3, 4]), 1);
    assert.equal(isTop([3, 4]), true);
    assert.equal(isTop([0, 1, 0, 0, 0]), false);
    assert.deepEqual(sib([0, 1, 2, 3, 4], 1), [0, 1, 2, 3, 5]);
    assert.deepEqual(sib([0, 4], -1), [0, 3]);
    assert.deepEqual(topOf([2, 5, 0, 1, 3]), [2, 5]);
    assert.equal(samePath([0, 1, 2, 3, 4], [0, 1, 2, 3, 4]), true);
    assert.equal(samePath([0, 1], [0, 1, 0, 0, 0]), false);
    assert.equal(samePath([0, 1], [0, 2]), false);
  });
  it('tableOf and cellOf', () => {
    assert.deepEqual(tableOf([0, 1, 2, 3, 4]), [0, 1]);
    assert.deepEqual(tableOf([0, 1, 2, 3, 4, 5, 6, 7]), [0, 1, 2, 3, 4]);
    assert.throws(() => tableOf([0, 1]), RangeError);
    assert.deepEqual(cellOf([0, 1, 2, 3, 4]), {table: [0, 1], r: 2,
      c: 3});
    assert.deepEqual(cellOf([0, 1, 2, 3, 4, 5, 6, 7]),
      {table: [0, 1, 2, 3, 4], r: 5, c: 6});
    assert.equal(cellOf([0, 1]), null);
  });
  it('cmpPath: flow order, the table before its contents', () => {
    const order = [[0, 1], [0, 1, 0, 0, 0], [0, 1, 0, 1, 0],
      [0, 1, 1, 0, 0], [0, 2], [1, 0]];
    for (let a = 0; a < order.length; a++) {
      for (let b = 0; b < order.length; b++) {
        const c = cmpPath(order[a], order[b]);
        assert.equal(Math.sign(c), Math.sign(a - b), `${a} ${b}`);
      }
    }
  });
});

describe('Walk', () => {
  it('flow order', () => {
    const x = flowDoc();
    const got = [...blocks(x.doc)];
    assert.deepEqual(got.map((e) => e.b), [x.p0, x.T, x.c00, x.c01,
      x.c10, x.N, x.n00, x.c10b, x.c11, x.p1]);
    assert.deepEqual(got.map((e) => e.at), [[0, 0], [0, 1],
      [0, 1, 0, 0, 0], [0, 1, 0, 1, 0], [0, 1, 1, 0, 0],
      [0, 1, 1, 0, 1], [0, 1, 1, 0, 1, 0, 0, 0], [0, 1, 1, 0, 2],
      [0, 1, 1, 1, 0], [0, 2]]);
    assert.deepEqual(got.map((e) => e.depth),
      [0, 0, 1, 1, 1, 1, 2, 1, 1, 0]);
    assert.deepEqual(got.map((e) => e.cell), [null, null,
      {table: [0, 1], r: 0, c: 0}, {table: [0, 1], r: 0, c: 1},
      {table: [0, 1], r: 1, c: 0}, {table: [0, 1], r: 1, c: 0},
      {table: [0, 1, 1, 0, 1], r: 0, c: 0}, {table: [0, 1], r: 1, c: 0},
      {table: [0, 1], r: 1, c: 1}, null]);
    for (const e of got) {
      assert.equal(at(x.doc, e.at), e.b);
      assert.equal(e.depth, depthOf(e.at));
    }
    // flow order agrees with cmpPath
    for (let k = 1; k < got.length; k++) {
      assert.ok(cmpPath(got[k - 1].at, got[k].at) < 0);
    }
  });
  it('sections: every section in order', () => {
    const x = flowDoc();
    const s2 = {props: {extra: []}, blocks: [P('s1')], raw: null};
    x.doc.sections.push(s2);
    const got = [...blocks(x.doc)];
    assert.deepEqual(got.at(-1).at, [1, 0]);
    assert.equal(got.length, 11);
  });
  it('forEachBlock gives the same entries and stops on false', () => {
    const x = flowDoc();
    const seen = [];
    assert.equal(forEachBlock(x.doc, (b, a, depth, cell) => {
      seen.push({b, at: a, depth, cell});
    }), true);
    assert.deepEqual(seen, [...blocks(x.doc)]);
    let n = 0;
    assert.equal(forEachBlock(x.doc, () => ++n < 3), false);
    assert.equal(n, 3);
  });
  it('walkBlocks: a block list without ids, from at0', () => {
    const x = flowDoc();
    const list = [{type: 'p', text: 'a'}, x.N];
    const got = [...walkBlocks(list)];
    assert.deepEqual(got.map((e) => e.at), [[0], [1], [1, 0, 0, 0]]);
    assert.deepEqual([...walkBlocks(list, [3, 4, 0, 0])].map((e) =>
      e.at)[2], [3, 4, 0, 0, 1, 0, 0, 0]);
    assert.deepEqual([...walkBlocks([])], []);
  });
  it('ids at every depth', () => {
    const x = flowDoc();
    const want = [x.p0, x.T, x.c00, x.c01, x.c10, x.N, x.n00, x.c10b,
      x.c11, x.p1].map((b) => b.id);
    assert.deepEqual([...ids(x.doc)], want);
    assert.deepEqual([...blockIds([x.T])], want.slice(1, -1));
    const op = {type: 'opaque', node: {name: 'w:sdt', attrs: [],
      children: []}};
    assert.deepEqual([...ids(docOf(op, x.p0))], [x.p0.id]);
  });
  it('reserveIds moves past an id in a depth-3 cell', () => {
    const deep = {...P('deep'), id: 1e9};
    let t = modelTable([[[deep]]]);
    t = modelTable([[['a', t, 'b']]]);
    t = modelTable([[['c', t, 'd']]]);
    const doc = docOf(P('top'), t);
    assert.ok(nextId() < 1e9);
    reserveIds(doc);
    assert.ok(nextId() > 1e9);
    // a table's own id counts too
    const big = {...modelTable([['x']]), id: 2e9};
    reserveIds(docOf(big));
    assert.ok(nextId() > 2e9);
  });
  it('at: read only, never throws', () => {
    const x = flowDoc();
    assert.equal(at(x.doc, [0, 1, 1, 0, 1, 0, 0, 0]), x.n00);
    for (const bad of [[0, 3], [1, 0], [0, 0, 0, 0, 0], [0, 1, 2, 0, 0],
      [0, 1, 0, 2, 0], [0, 1, 0, 0, 1], [0, 1, 0, 0], [0, -1],
      ['0', 1], null, undefined, 7, [0, 1, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0]]) {
      assert.equal(at(x.doc, bad), null, JSON.stringify(bad));
    }
    assert.equal(at(null, [0, 0]), null);
    assert.equal(at({}, [0, 0]), null);
    assert.equal(at({sections: [{}]}, [0, 0]), null);
    const hostile = docOf({type: 'tbl', rows: [{cells: 'x'}]});
    assert.equal(at(hostile, [0, 0, 0, 0, 0]), null);
  });
  it('loose: the marks between rows and cells in document order', () => {
    const A = mark('bookmarkStart', 1), B = mark('bookmarkEnd', 1),
      C = mark('proofErr', 2), D = mark('permStart', 3),
      E = mark('permEnd', 3);
    const t0 = modelTable([['a', 'b'], ['c']]);
    const r0 = t0.rows[0], r1 = t0.rows[1];
    const t = {...t0, tail: [E], rows: [
      {...r0, lead: [A], tail: [C],
        cells: [r0.cells[0], {...r0.cells[1], lead: [B]}]},
      {...r1, lead: [D]}]};
    assert.deepEqual(loose(t), [
      {node: A, r: 0, where: 'rowLead'},
      {node: B, r: 0, c: 1, where: 'lead'},
      {node: C, r: 0, where: 'rowTail'},
      {node: D, r: 1, where: 'rowLead'},
      {node: E, where: 'tail'}]);
    assert.deepEqual(loose(t0), []);
  });
  it('mapBlocks copies only along the changed paths', () => {
    const q = P('q'), q2 = P('q2'), top = P('top');
    const T = freeze(modelTable([['a', 'b'], ['c', [q, q2]]]));
    const list = [top, T];
    const fn = (x) => (x === q ? {...x, text: 'Q', runs: []} : x);
    const out = mapBlocks(list, fn);
    assert.notEqual(out, list);
    assert.equal(out[0], top);
    const U = out[1];
    assert.notEqual(U, T);
    assert.equal(U.id, T.id);
    assert.equal(U.tblPr, T.tblPr);
    assert.equal(U.rows[0], T.rows[0]);
    assert.notEqual(U.rows[1], T.rows[1]);
    assert.equal(U.rows[1].cells[0], T.rows[1].cells[0]);
    assert.equal(U.rows[1].cells[1].tcPr, T.rows[1].cells[1].tcPr);
    assert.equal(U.rows[1].cells[1].blocks[0].text, 'Q');
    assert.equal(U.rows[1].cells[1].blocks[1], q2);
    // nothing changed: the same array
    assert.equal(mapBlocks(list, (x) => x), list);
    // a change inside a nested table copies both tables on its path
    const N = modelTable([[[q]]]);
    const O = freeze(modelTable([[['x', N, 'z']], ['y']]));
    const o2 = mapBlocks([O], fn)[0];
    assert.notEqual(o2.rows[0].cells[0].blocks[1], N);
    assert.equal(o2.rows[0].cells[0].blocks[0], O.rows[0].cells[0]
      .blocks[0]);
    assert.equal(o2.rows[1], O.rows[1]);
    assert.equal(o2.rows[0].cells[0].blocks[1].rows[0].cells[0]
      .blocks[0].text, 'Q');
  });
  it('mapBlocks leaves Opaque blocks alone', () => {
    const op = {type: 'opaque', node: {name: 'w:sdt', attrs: [],
      children: []}};
    let n = 0;
    const list = [op, P('a')];
    assert.equal(mapBlocks(list, (x) => (n++, x)), list);
    assert.equal(n, 1);
  });
  it('flatText: a line per row, tabs between cells', () => {
    const T = modelTable([['a', ['b', 'c']], ['', 'd']]);
    assert.deepEqual(flatText(T), ['a\tb c', '\td']);
    // nested tables flatten into their cell's text
    const N = modelTable([['x', 'y'], ['z']]);
    const U = modelTable([[['a', N, 'w']]]);
    assert.deepEqual(flatText(U), ['a x y z w']);
    // an empty first paragraph adds no space
    assert.deepEqual(flatText(modelTable([[['', 'b']]])), ['b']);
  });
  it('flatText: tabs and breaks in text as spaces, objects dropped',
    () => {
      const q = newPara('a￼b￼c￼', {inlines: {
        1: {kind: 'tab', level: 'r'},
        3: {kind: 'br', level: 'r', brType: 'textWrapping'},
        5: {kind: 'raw', level: 'r', node: {name: 'w:drawing',
          attrs: [], children: []}}}});
      assert.deepEqual(flatText(modelTable([[[q]]])), ['a b c']);
      const op = {type: 'opaque', node: {name: 'w:sdt', attrs: [],
        children: []}};
      const T = modelTable([[['a', op]]]);
      assert.deepEqual(flatText(T), ['a']);
      assert.deepEqual(flatText(T, (n) => (n === op.node ? 'S' : '')),
        ['a S']);
    });
  it('a large table walks without recursion trouble', () => {
    const T = modelTable(Array.from({length: 2000}, (_, i) =>
      ['r' + i, 'x']));
    let n = 0;
    forEachBlock(docOf(T), () => {
      n++;
    });
    assert.equal(n, 4001);
  });
});

describe('builders', () => {
  it('newCell, newRow, newTable shapes', () => {
    const q = P('q');
    const c = newCell([q]);
    assert.deepEqual(c, {tcPr: {extra: []}, blocks: [q], attrs: [],
      lead: []});
    assert.equal(c.blocks[0], q);
    const rw = newRow([c]);
    assert.deepEqual(rw, {trPr: {extra: []}, cells: [c], attrs: [],
      lead: [], tail: [], tblPrEx: null});
    const t = newTable({grid: [100], rows: [rw]});
    assert.equal(t.type, 'tbl');
    assert.ok(Number.isInteger(t.id) && t.id > q.id);
    assert.deepEqual(t.tblPr, {extra: []});
    assert.deepEqual(t.grid, [100]);
    assert.deepEqual(t.attrs, []);
    assert.deepEqual(t.tail, []);
    assert.deepEqual(t.gridAttrs, []);
    assert.equal(t.rows[0], rw);
    const c2 = newCell([q], {vMerge: 'restart', extra: []});
    assert.equal(c2.tcPr.vMerge, 'restart');
  });
  it('builders refuse what TblCheck refuses', () => {
    assert.throws(() => newCell([]), RangeError);
    assert.throws(() => newCell([{type: 'x'}]), RangeError);
    assert.throws(() => newCell([P('a')], {gridSpan: 0, extra: []}),
      RangeError);
    assert.throws(() => newRow([]), RangeError);
    assert.throws(() => newTable({grid: [], rows: [newRow([newCell(
      [P('a')])])]}), RangeError);
    assert.throws(() => newTable({grid: [1], rows: []}), RangeError);
  });
});

describe('fixtures', () => {
  it('XML tables read (typed, TBL_OPAQUE kept) and are written back',
    async () => {
    const body = tbl([tr([tc(p(r('a'))), tc()], {lead:
      '<w:bookmarkStart w:id="1" w:name="m"/>'}), tr([tc(nestedTable(2) + p())
    ])]) + p() + TBL_OPAQUE + p() + bigTable(3, 2) + p();
    const doc = await readDocx(await tblDocx(body));
    const kinds = doc.sections[0].blocks.map((b) => b.type);
    assert.deepEqual(kinds.filter((k) => k !== 'p'), ['tbl', 'opaque',
      'tbl']);
    const out = await tableXml(doc);
    assert.equal(out.length, 3);
    assert.equal(out[0].children.filter((c) => c.name === 'w:tblGrid')
      .length, 1);
  });
  it('freeze is deep', () => {
    const T = freeze(modelTable([['a']]));
    assert.ok(Object.isFrozen(T.rows[0].cells[0].blocks[0].runs));
  });
});
