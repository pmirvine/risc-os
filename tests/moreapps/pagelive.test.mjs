// The real-font oracle's in-page scoring (pagelive.mjs, final fix B
// F2-I3) gives the same starts as the Node oracle's rule
// (pagestarts.mjs ourStarts, placesOf): column starts are counted
// in both, so the two oracles keep ONE rule (P5.1, R10).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {p, r} from './build-docx.mjs';
import {wordStarts, lineBase, ourStarts, placesOf, causeOf,
  scoreStarts} from './pagestarts.mjs';
import {liveStarts} from './pagelive.mjs';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {docLayout} from './page-fixtures.mjs';

const LRPB = '<w:r><w:lastRenderedPageBreak/><w:t>x</w:t></w:r>';
const COLS2 = '<w:sectPr><w:cols w:num="2" w:space="720"/>' +
  '</w:sectPr>';
const TBL = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
  'w:w="2000"/></w:tblGrid><w:tr><w:tc>' + inner +
  '</w:tc></w:tr></w:tbl>';
// the function as the page gets it: its source, closing over nothing
const inPage = (0, eval)('(' + liveStarts.toString() + ')');

/** Both rules over one document. */
async function both(body) {
  const {L, G, doc} = await docLayout(body);
  const P = new Pages(G).finish(), base = lineBase(L.items);
  const node = {ours: ourStarts(P, L.items, base)
    .map((s) => ({line: s.line})),
  word: placesOf(G, base, wordStarts(doc))
    .map((w) => ({line: w.line, cause: w.cause}))};
  return {P, node, live: inPage(L, P, doc, causeOf, ourStarts)};
}

describe('liveStarts: the in-page oracle keeps the Node rule', () => {
  it('counts each column\'s start, as ourStarts does', async () => {
    const paras = Array.from({length: 120}, (_, i) =>
      p(r('paragraph ' + i + ' of the two columns') +
        (i % 9 === 4 ? LRPB : ''))).join('');
    const {P, node, live} = await both(paras + COLS2);
    assert.ok(P.list.some((pg) => pg.cols && pg.cols.length > 1),
      'the fixture has pages of columns');
    assert.ok(node.ours.length > P.count - 1, 'column starts');
    assert.deepEqual(live.ours, node.ours);
    assert.deepEqual(live.word, node.word);
    assert.equal(live.pages, P.count);
    assert.deepEqual(scoreStarts(live.ours, live.word),
      scoreStarts(node.ours, node.word));
  });

  it('a page break, page break before, a cell, no columns',
    async () => {
      const {node, live} = await both(p(r('one')) +
        p(r('ab') + '<w:r><w:br w:type="page"/></w:r>' + r('cd')) +
        TBL(p(r('c') + LRPB)) + p(r('two'), '<w:pageBreakBefore/>'));
      assert.equal(node.ours.length, 2);
      assert.deepEqual(live.ours, node.ours);
      assert.deepEqual(live.word, node.word);
    });
});
