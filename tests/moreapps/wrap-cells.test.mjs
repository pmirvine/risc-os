// Text in a table's cell wraps round a float anchored in that cell,
// within the cell (Batch D P12a fix I5): ./WrapWant gives a cell's
// paragraphs parts from the floats anchored in the same cell (their
// places: ./AnchorPlace cellsOn), ./DocStack breaks them with those;
// a float in a cell never wraps the root paragraphs.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {p, r} from './build-docx.mjs';
import {loadStyles} from './word-docs.mjs';
import {M, off, anchorRun, docOf, settle, sigOf, overlaps, text}
  from './wrap-fixtures.mjs';

before(loadStyles);

const tc = (w, inner) => `<w:tc><w:tcPr><w:tcW w:w="${w}" ` +
  'w:type="dxa"/></w:tcPr>' + inner + '</w:tc>';
/** A paragraph, a table of two cells (200 and 400 px), the second
 *  holding a paragraph with a float (run fl) and text, a paragraph. */
const body = (fl, after = text(3), cell = text(4)) => p(r('above')) +
  '<w:tbl>' +
  '<w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid>' +
  '<w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr>' +
  tc(3000, p(r('left'))) + tc(6000, p(fl + r(cell))) +
  '</w:tr></w:tbl>' + p(r(after));

/** The cell paragraph's item. */
const cellPara = (L) => L.items[1].rows[0].cells[1].col.items[0];
/** Each cell paragraph's lines (x, y) as text, for edited == fresh. */
const cellSig = (L) => L.items.filter((x) => x.kind === 'tbl')
  .flatMap((t) => t.rows.flatMap((row) => row.cells.flatMap((c) =>
    c.col.items.filter((x) => x.kind === 'p').map((x) => x.lines.map(
      (l) => [l.from, l.to, Math.round(l.x), Math.round(l.y)].join(':'))
      .join(' ')))));

describe('I5: text in a cell wraps round a float in that cell', () => {
  it('the cell\'s lines beside the float start right of it (its ' +
    'width and distance), those below it at the cell\'s left',
  async () => {
    const {L, P} = settle(await docOf(body(anchorRun({w: 96, ht: 96,
      h: ['column', off(0)], v: ['paragraph', off(0)]}))));
    assert.equal(M.wrapPass(L, P), null);
    const ls = cellPara(L).lines;
    const beside = ls.filter((ln) => ln.y < 96);
    assert.ok(beside.length >= 2, `${beside.length} lines beside`);
    for (const ln of beside) assert.equal(ln.x, 96 + 12, `y ${ln.y}`);
    assert.ok(ls.some((ln) => ln.y >= 96 && ln.x === 0));
    assert.deepEqual(overlaps(L, P), []);
  });

  it('a float in a cell does not wrap the root paragraphs below the ' +
    'table that it reaches', async () => {
    const {L, P} = settle(await docOf(body(anchorRun({w: 300, ht: 300,
      h: ['column', off(0)], v: ['paragraph', off(0)]}), text(8),
    'short')));
    const f = P.floatsOf(P.at(0)).find((x) => x.cell);
    const last = L.items[2];
    const fr = P.framesOf(P.at(0))[0].frags.find((g) => g.id === last.id);
    assert.ok(fr.y + last.lines[0].y < f.y + f.h, 'it reaches it');
    for (const ln of last.lines) assert.equal(ln.x, 0);
    assert.ok(!L.wrap || !L.wrap.keys.has(last.id));
  });

  it('typing in the cell: settled the same as from a fresh open',
    async () => {
      const d = new M.Document(await docOf(body(anchorRun({w: 96,
        ht: 96, h: ['column', off(0)], v: ['paragraph', off(0)]}))));
      let {L, P} = settle(d.doc);
      for (const ins of ['one two three ', text(1) + ' ', 'x']) {
        // (section 0, block 1: the table; row 0, cell 1, block 0)
        d.apply({op: 'replaceText', block: [0, 1, 0, 1, 0], at: 0,
          del: 0, ins});
        ({L, P} = settle(d.doc, {L, P}));
        const fr = settle(d.doc);
        assert.deepEqual(cellSig(L), cellSig(fr.L), ins);
        assert.deepEqual(sigOf(L, P), sigOf(fr.L, fr.P), ins);
        assert.ok(cellPara(L).lines.filter((ln) => ln.y < 96)
          .every((ln) => ln.x === 108), ins);
      }
    });
});
