// The final whole-branch review's model fixes (Batch C final fix
// wave, group 1). Bookmarks: Table > Delete > Table, and deleting
// every row or every column, keep a pair whose other end is outside
// the table (final-1 I1, as a range delete does); a deletion from
// one table's cell into a later table's cell never writes a pair end
// before start (I2: typing, Enter and Insert table over it too);
// Table to text with a separator keeps a cell's paragraphs together,
// so the text and the marks stay in file order (M2). Tables never
// touch: Insert table and Text to table right after an Opaque table
// put an empty paragraph between (I3, D27). Each command one undo
// step, undo exact.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {TABLE} from '../../tools/moreapps/!Word/TblCmdCols';
import {deleteSelection} from '../../tools/moreapps/!Word/EditDel';
import {typeText, splitPara} from '../../tools/moreapps/!Word/Edit';
import {insertTable} from '../../tools/moreapps/!Word/TblInsert';
import {textToTableCmd, tableToTextCmd}
  from '../../tools/moreapps/!Word/TblConvertCmd';
import {pairs} from '../../tools/moreapps/!Word/BookmarkFind';
import {forEachBlock} from '../../tools/moreapps/!Word/Walk';
import {endsCell} from '../../tools/moreapps/!Word/TblCheck';
import * as S from '../../tools/moreapps/!Word/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, TBL_OPAQUE, modelTable, freeze}
  from './tbl-fixtures.mjs';
import {tableToText} from '../../tools/moreapps/!Word/TblToText';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {undoable} from './edit-docs.mjs';

const BS = (n) => `<w:bookmarkStart w:id="${n}" w:name="b${n}"/>`;
const BE = (n) => `<w:bookmarkEnd w:id="${n}"/>`;
const open = async (body) => new Document(await readDocx(
  await tblDocx(body)));
const back = async (d) => readDocx(await writeDocx(d.doc));

/** Every pair whole and start before end, in doc. */
function sound(doc, what) {
  const ps = pairs(doc), ms = ps.marks;
  for (const q of ps) {
    assert.ok(q.end, `${what}: ${q.name} has its end`);
    const a = ms.indexOf(q.start), z = ms.indexOf(q.end);
    assert.ok(a >= 0 && z > a, `${what}: ${q.name} start before end`);
  }
  const ends = ms.filter((m) => m.kind === 'end').length;
  const starts = ms.filter((m) => m.kind === 'start').length;
  assert.equal(ends, starts, `${what}: no orphan mark`);
  return ms.length;
}

const tables = (d) => {
  const out = [];
  forEachBlock(d.doc, (b) => { if (b.type === 'tbl') out.push(b); });
  return out;
};
const paraOf = (d, text) => {
  let o = null;
  forEachBlock(d.doc, (b) => {
    if (b.type === 'p' && b.text.replace(/￼/g, '') === text) o = b;
  });
  return o;
};

describe('I1: removing a whole table keeps a pair across its edge',
  () => {
    const BODIES = [
      ['end in the table', p(BS(7) + r('top')) +
        tbl([tr([tc(p(r('x') + BE(7))), tc(p(r('y')))])]) +
        p(r('after'))],
      ['start in the table', p(r('top')) +
        tbl([tr([tc(p(BS(7) + r('x'))), tc(p(r('y')))])]) +
        p(r('after') + BE(7))],
      ['a pair wholly inside goes', p(r('top')) +
        tbl([tr([tc(p(BS(7) + r('x') + BE(7))), tc(p(r('y')))])]) +
        p(r('after'))],
    ];
    for (const [what, body] of BODIES) {
      for (const how of ['deleteTable', 'deleteRows', 'deleteCols']) {
        it(`${what}: Table > Delete > ${how}`, async () => {
          const d = await open(body);
          const [t] = tables(d);
          const c = t.rows[0].cells;
          const rect = S.select({id: c[0].blocks[0].id, off: 0},
            {id: c[1].blocks[0].id, off: 1});
          const sel = how === 'deleteTable'
            ? S.caret({id: paraOf(d, 'x').id, off: 0}) : rect;
          const out = undoable(d, () => TABLE[how](d, sel));
          assert.ok(out, 'applied');
          assert.equal(tables(d).length, 0, 'the table went');
          const n = sound(d.doc, how);
          assert.equal(n, what.startsWith('a pair') ? 0 : 2,
            'the pair kept when its other end stays');
          sound(await back(d), how + ' written');
        });
      }
    }
  });

describe('I2: a deletion from one table into a later one', () => {
  // table A: one cell holding only a start; table B: its first cell
  // begins with the end (final-1 zz-repro2)
  const body = p(r('word')) + tbl([tr([tc(p(BS(0)))])]) + p() +
    tbl([tr([tc(p(BE(0))), tc(p())]), tr([tc(p()), tc(p())])]) +
    p(r(' a'));
  const CMDS = {
    delete: (d, s) => deleteSelection(d, s),
    type: (d, s) => typeText(d, s, 'Z'),
    enter: (d, s) => splitPara(d, s),
    insertTable: (d, s) => insertTable(d, s, {rows: 1, cols: 2}),
  };
  for (const [how, cmd] of Object.entries(CMDS)) {
    it(`${how}: the pair is never written end before start`,
      async () => {
        const d = await open(body);
        const [A, B] = tables(d);
        const a = A.rows[0].cells[0].blocks[0];
        const b = B.rows[0].cells[0].blocks[0];
        undoable(d, () => cmd(d, S.select({id: a.id, off: 1},
          {id: b.id, off: 0})));
        assert.equal(sound(d.doc, how), 2, 'the pair kept');
        sound(await back(d), how + ' written');
      });
  }
  it('the same from the far side: a start in B, its end after it',
    async () => {
      const d = await open(p(r('w')) + tbl([tr([tc(p(r('k'))),
        tc(p(r('m')))]), tr([tc(p(r('n') + BS(3))), tc(p(r('o')))])]) +
        p() + tbl([tr([tc(p(r('q'))), tc(p(r('s') + BE(3)))])]) +
        p(r('z')));
      const [A, B] = tables(d);
      const a = A.rows[1].cells[0].blocks[0];
      const b = B.rows[0].cells[0].blocks[0];
      undoable(d, () => deleteSelection(d, S.select(
        {id: a.id, off: 2}, {id: b.id, off: 1})));
      sound(d.doc, 'far side');
      sound(await back(d), 'far side written');
    });
});

describe('I3: nothing new touches an Opaque table', () => {
  const touching = (d) => {
    let n = 0;
    for (const s of d.doc.sections) {
      s.blocks.forEach((b, i) => {
        if (i && endsCell(b) && endsCell(s.blocks[i - 1])) n++;
      });
    }
    return n;
  };
  for (const how of ['insertTable', 'toTable']) {
    it(`${how} at the paragraph after an Opaque table`, async () => {
      const d = await open(p(r('x')) + TBL_OPAQUE + p(r('after')));
      const bl = d.doc.sections[0].blocks;
      assert.equal(bl[1].type, 'opaque', 'the fixture stays Opaque');
      const tgt = bl[2];
      undoable(d, () => (how === 'insertTable'
        ? insertTable(d, S.caret({id: tgt.id, off: 0}),
          {rows: 1, cols: 2})
        : textToTableCmd(d, S.select({id: tgt.id, off: 0},
          {id: tgt.id, off: tgt.text.length}), {sep: 'tab'})));
      assert.equal(touching(d), 0, 'an empty paragraph between');
      assert.ok(tables(d).length >= 1, 'a table was made');
    });
  }
});

describe('M2: Table to text keeps a cell\'s paragraphs together', () => {
  for (const sep of ['tab', 'comma', 'para']) {
    it(`${sep}: the text and a pair in file order`, async () => {
      const d = await open(p(r('x')) + tbl([tr([
        tc(p(r('a1')) + p(r('a2') + BS(1) + r('A'))),
        tc(p(r('b') + BE(1)))])]) + p(r('y')));
      const t = d.doc.sections[0].blocks[1];
      undoable(d, () => tableToTextCmd(d, S.caret(
        {id: t.rows[0].cells[1].blocks[0].id, off: 0}), {sep}));
      const txt = d.doc.sections[0].blocks.map((b) => b.text
        .replace(/￼/g, ''));
      const ch = {tab: '\t', comma: ','}[sep];
      assert.deepEqual(txt, sep === 'para'
        ? ['x', 'a1', 'a2A', 'b', 'y']
        : ['x', 'a1', 'a2A' + ch + 'b', 'y']);
      assert.equal(sound(d.doc, sep), 2);
    });
  }
});

describe('M2: the pure rule, nested tables and several paragraphs', () => {
  const P = (t) => newPara(t);
  it('a row in file order', () => {
    const inner = modelTable([['x', 'y']]);
    const t = freeze(modelTable([[[P('a1'), P('a2')], 'b',
      [P('c1'), inner, P('c2')]], ['d', 'e', 'f']]));
    assert.deepEqual(tableToText(t, {sep: 'tab'}).map((b) => b.text),
      ['a1', 'a2\tb\tc1', 'x\ty', 'c2', 'd\te\tf']);
    assert.deepEqual(tableToText(t, {sep: 'para'}).map((b) => b.text),
      ['a1', 'a2', 'b', 'c1', 'x', 'y', 'c2', 'd', 'e', 'f']);
  });
});
