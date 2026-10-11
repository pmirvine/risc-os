// A cell never ends with a table (C3 fix wave, review C3b I2): Word
// reads a w:tc whose last block is not a w:p as an unreadable file.
// The backstop: TblCheck refuses a cell whose last block is a table
// (typed, or kept: a w:tbl element), so no op, restore or write can
// make one; removeBlock / removeBlocks / insertBlock / insertBlocks
// in a cell refuse to leave one, nothing changed; a cell ending with
// another kept block (a content control: 52 such cells in the corpus)
// is still valid.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {checkTable, endsCell} from '../../tools/moreapps/!Word/TblCheck';
import {checkBlock, newPara, newCell, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {findBlock} from '../../tools/moreapps/!Word/EditPos';
import {mk} from './edit-docs.mjs';
import {modelTable} from './tbl-fixtures.mjs';

const N = () => modelTable([['n1']]);
const kept = (name) => ({type: 'opaque', node: {name, attrs: [],
  children: []}});
/** Table t with cell (0,0)'s blocks replaced by bs (no check). */
const withCell = (t, bs) => ({...t, rows: [{...t.rows[0],
  cells: [{...t.rows[0].cells[0], blocks: bs}]}]});

describe('TblCheck: a cell must not end with a table', () => {
  it('a typed table or a kept w:tbl last in a cell: refused', () => {
    const t = modelTable([['a']]);
    for (const last of [N(), kept('w:tbl')]) {
      assert.throws(() => checkBlock(withCell(t, [newPara('x'), last])),
        /end with a paragraph/);
      assert.throws(() => checkTable(withCell(t, [last]),
        {block: () => {}, props: () => {}}, 1), /end with a paragraph/);
    }
    assert.throws(() => newCell([newPara('x'), N()]),
      /end with a paragraph/);
  });
  it('a table followed by a paragraph, or a content control last: ' +
    'valid', () => {
    const t = modelTable([['a']]);
    checkBlock(withCell(t, [newPara('x'), N(), newPara('')]));
    checkBlock(withCell(t, [newPara('x'), kept('w:sdt')]));
    assert.equal(endsCell(N()), true);
    assert.equal(endsCell(kept('w:tbl')), true);
    assert.equal(endsCell(kept('w:sdt')), false);
    assert.equal(endsCell(newPara('')), false);
    assert.equal(endsCell(null), false);
  });
});

describe('ops in a cell never leave it ending with a table', () => {
  /** p0, [[a, N, z]], p2: the doc and the path of z. */
  function setup() {
    const d = mk(['p0', modelTable([[['a', N(), 'z']]]), 'p2']);
    const t = d.doc.sections[0].blocks[1];
    const z = t.rows[0].cells[0].blocks[2];
    return {doc: d.doc, z: findBlock(d.doc, z.id).at};
  }
  const same = (doc, f) => {
    const before = structuredClone(doc.sections);
    assert.throws(f, /end with a paragraph/);
    assert.ok(deepEqual(doc.sections, before), 'nothing changed');
  };
  it('removeBlock / removeBlocks of the paragraph after the table', () => {
    const {doc, z} = setup();
    same(doc, () => apply(doc, {op: 'removeBlock', at: z}));
    same(doc, () => apply(doc, {op: 'removeBlocks', at: z, count: 1}));
    // the table and the paragraph together: the cell ends with 'a'
    const two = [...z.slice(0, -1), 1];
    const inv = apply(doc, {op: 'removeBlocks', at: two, count: 2});
    assert.equal(inv.op, 'insertBlocks');
    apply(doc, inv);
  });
  it('insertBlock / insertBlocks of a table at the cell\'s end', () => {
    const {doc, z} = setup();
    const end = [...z.slice(0, -1), 3];
    same(doc, () => apply(doc, {op: 'insertBlock', at: end,
      block: N()}));
    same(doc, () => apply(doc, {op: 'insertBlocks', at: end,
      blocks: [newPara('q'), N()]}));
    // before the last paragraph: fine, and undone exactly
    const before = structuredClone(doc.sections);
    const inv = apply(doc, {op: 'insertBlock', at: z, block: N()});
    apply(doc, inv);
    assert.ok(deepEqual(doc.sections, before));
  });
  it('a restoreBlock of a table whose cell ends with a table: refused',
    () => {
      const {doc} = setup();
      const t = doc.sections[0].blocks[1];
      same(doc, () => apply(doc, {op: 'restoreBlock', block: [0, 1],
        snapshot: withCell(t, t.rows[0].cells[0].blocks.slice(0, 2))}));
    });
});
