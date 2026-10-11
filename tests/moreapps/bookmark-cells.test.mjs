// Bookmarks kept when cells are overwritten (a table pasted over a
// cell rectangle, ./ClipPasteTbl) or cleared (Delete or Backspace
// over cells, ./RangeTbl): a mark whose partner is outside the cells
// goes back, a START at the start of the first cell, an END at the
// end of the last (./BookmarkKeep putAround, C6 fix B3), so a pair is
// never reversed. Each case is checked in the model (start before
// end in flow order) and in the written document.xml.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {deleteSelection, deleteBack}
  from '../../tools/moreapps/!Word/EditDel';
import {marks} from '../../tools/moreapps/!Word/BookmarkFind';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {cmpPath} from '../../tools/moreapps/!Word/Path';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import * as S from '../../tools/moreapps/!Word/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx} from './tbl-fixtures.mjs';
import {undoable} from './edit-docs.mjs';
import {write} from './roundtrip-lib.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';

const open = async (bytes) => new Document(await readDocx(bytes));
const tops = (d) => d.doc.sections.flatMap((s) => s.blocks);
const cellP = (t, row, c) => t.rows[row].cells[c].blocks[0];
const selOf = (a, o1, b, o2) => S.select({id: blockId(a), off: o1},
  {id: blockId(b), off: o2});
const BS = (n) => `<w:bookmarkStart w:id="${n}" w:name="bm${n}"/>`;
const BE = (n) => `<w:bookmarkEnd w:id="${n}"/>`;

/** A 3 x 4 table; marks: {'r,c': xml before the cell's text}. */
async function grid(marksAt) {
  const rows = [0, 1, 2].map((i) => tr([0, 1, 2, 3].map((j) =>
    tc(p((marksAt[`${i},${j}`] || '') + r(`c${i}${j}`))))));
  return open(await tblDocx(p(r('before')) + tbl(rows) + p(r('after'))));
}

/** A 3 x 2 table in another document, sliced as a cell rectangle. */
async function source() {
  const src = await open(await tblDocx(p(r('s')) + tbl([0, 1, 2].map(
    (i) => tr([tc(p(r(`n${i}0`))), tc(p(r(`n${i}1`)))]))) + p(r('e'))));
  const T = tops(src)[1];
  return slice(src.doc, selOf(cellP(T, 0, 0), 0, cellP(T, 2, 1), 3));
}

/** [[id, start before end]] from the model's marks in flow order. */
function order(doc) {
  const ms = marks(doc);
  const ids = [...new Set(ms.map((m) => m.id))];
  return ids.map((id) => {
    const s = ms.find((m) => m.id === id && m.kind === 'start');
    const e = ms.find((m) => m.id === id && m.kind === 'end');
    const c = s && e ? cmpPath(s.at, e.at) || (s.off ?? 0) -
      (e.off ?? 0) : NaN;
    return [id, !!s && !!e && c <= 0];
  });
}

/** The written document.xml: start offset < end offset per id. */
async function xmlOrder(d, ids) {
  const bytes = await write(d.doc);
  const xml = new TextDecoder().decode((await readZip(bytes))
    .get('word/document.xml'));
  assertSameDoc(await readDocx(bytes), expectedBack(d.doc));
  return ids.map((n) => {
    const s = xml.indexOf(`w:bookmarkStart w:id="${n}"`);
    const e = xml.indexOf(`w:bookmarkEnd w:id="${n}"`);
    return [n, s >= 0 && e >= 0 && s < e];
  });
}

const CASES = [
  ['a start in (1,0), its end in (1,3)', {'1,0': BS(1), '1,3': BE(1)}],
  ['an end in (1,0), its start in (0,3)', {'0,3': BS(2), '1,0': BE(2)}],
  ['both cases at once', {'1,0': BS(1) + BE(2), '1,3': BE(1),
    '0,3': BS(2)}],
];
const idsOf = (m) => [...new Set(Object.values(m).join('')
  .match(/w:id="(\d+)"/g).map((x) => x.slice(6, -1)))];

describe('bookmark pairs and cells overwritten or cleared', () => {
  for (const [what, m] of CASES) {
    it(`paste of a 3x2 table over (0,0)..(2,1): ${what}`, async () => {
      const s = await source();
      const d = await grid(m);
      const T = tops(d)[1];
      undoable(d, () => pasteBlocks(d, selOf(cellP(T, 0, 0), 0,
        cellP(T, 2, 1), 3), s.blocks, {sameDoc: false,
        styleNames: s.styleNames, lists: s.lists, pics: s.pics,
        picScope: s.picScope, styles: s.styles}));
      const t = tops(d)[1];
      assert.equal(cellP(t, 0, 0).text.replace(/￼/g, ''), 'n00');
      assert.ok(order(d.doc).every(([, ok]) => ok), JSON.stringify(
        order(d.doc)));
      assert.deepEqual(await xmlOrder(d, idsOf(m)), idsOf(m).map(
        (n) => [n, true]));
    });

    for (const [key, fn] of [['Delete', deleteSelection],
      ['Backspace', deleteBack]]) {
      it(`${key} over (0,0)..(2,1): ${what}`, async () => {
        const d = await grid(m);
        const T = tops(d)[1];
        undoable(d, () => fn(d, selOf(cellP(T, 0, 0), 0, cellP(T, 2, 1),
          3)));
        assert.ok(order(d.doc).every(([, ok]) => ok), JSON.stringify(
          order(d.doc)));
        assert.deepEqual(await xmlOrder(d, idsOf(m)), idsOf(m).map(
          (n) => [n, true]));
      });
    }
  }

  it('a pair wholly in the cells goes with them; marks stay once',
    async () => {
      const d = await grid({'0,0': BS(3), '1,1': BE(3), '1,0': BS(4),
        '2,3': BE(4)});
      const T = tops(d)[1];
      undoable(d, () => deleteSelection(d, selOf(cellP(T, 0, 0), 0,
        cellP(T, 2, 1), 3)));
      const ms = marks(d.doc).map((x) => x.kind + x.id);
      assert.deepEqual(ms.sort(), ['end4', 'start4']);
      assert.deepEqual(order(d.doc), [['4', true]]);
    });
});
