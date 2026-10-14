// PageInfo (Batch D P3.4, D30): the info line's text at the caret.
// Print layout: "Page 3 of 12" (the caret's page of the pages worked
// out, "..." after the count while pagination is still going on),
// and " (Section 2)" when the document has more than one section;
// Draft: "Section 2" for several sections, else nothing.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {docLayout} from './page-fixtures.mjs';
import {pageInfo} from '../../tools/moreapps/!Letters/PageInfo';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import * as S from '../../tools/moreapps/!Letters/Selection';

const P_ = (t, pPr = '') => `<w:p>${pPr ? '<w:pPr>' + pPr +
  '</w:pPr>' : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
const PBB = '<w:pageBreakBefore/>';
const THREE = P_('one') + P_('two', PBB) + P_('three', PBB);
const SECT = '<w:sectPr><w:type w:val="nextPage"/></w:sectPr>';
const TWO_SECTS = P_('one') + P_('two', SECT) + P_('three') +
  P_('four', PBB);
const TABLE = P_('before') + '<w:tbl><w:tblPr/><w:tblGrid>' +
  '<w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr/>' +
  P_('cell') + '</w:tc></w:tr></w:tbl>' + P_('after', SECT) +
  P_('last');

/** Body laid out, Print layout: {L, P}. */
async function printed(body) {
  const {L, G} = await docLayout(body);
  const P = new Pages(G);
  L.place = PlacePrint(L, P);
  return {L, P};
}
const at = (L, k, off = 0) => S.caret({id: L.items[k].id, off});

describe('PageInfo (P3.4)', () => {
  it('Print layout: the caret\'s page of the count, "..." while ' +
    'pages are still to be worked out', async () => {
    const {L, P} = await printed(THREE);
    assert.equal(pageInfo(L, at(L, 0)), 'Page 1 of 2...');
    assert.equal(P.done, false);
    P.finish();
    assert.equal(pageInfo(L, at(L, 0)), 'Page 1 of 3');
    assert.equal(pageInfo(L, at(L, 1, 2)), 'Page 2 of 3');
    assert.equal(pageInfo(L, at(L, 2, 5)), 'Page 3 of 3');
  });

  it('the caret\'s page is worked out when it is not yet', async () => {
    const {L, P} = await printed(THREE);
    assert.equal(P.count, 0);
    assert.equal(pageInfo(L, at(L, 2)), 'Page 3 of 3');
    assert.equal(P.done, true);
  });

  it('several sections: the caret\'s section after the page',
    async () => {
      const {L, P} = await printed(TWO_SECTS);
      P.finish();
      assert.equal(pageInfo(L, at(L, 0)), 'Page 1 of 3 (Section 1)');
      assert.equal(pageInfo(L, at(L, 2)), 'Page 2 of 3 (Section 2)');
      assert.equal(pageInfo(L, at(L, 3)), 'Page 3 of 3 (Section 2)');
    });

  it('Draft: the section when there are several, else nothing',
    async () => {
      const one = (await docLayout(THREE)).L;
      assert.equal(pageInfo(one, at(one, 2)), '');
      const two = (await docLayout(TWO_SECTS)).L;
      assert.equal(pageInfo(two, at(two, 0)), 'Section 1');
      assert.equal(pageInfo(two, at(two, 3)), 'Section 2');
    });

  it('a caret in a table\'s cell: its table\'s page and section',
    async () => {
      const {L, P} = await printed(TABLE);
      P.finish();
      const tbl = L.items.find((it) => it.kind === 'tbl');
      const cell = tbl.rows[0].cells[0].col.items[0];
      assert.equal(cell.s ?? null, null);
      assert.equal(pageInfo(L, S.caret({id: cell.id, off: 2})),
        'Page 1 of 2 (Section 1)');
    });

  it('no selection, a position not in the layout: nothing',
    async () => {
      const {L} = await printed(THREE);
      assert.equal(pageInfo(L, null), '');
      assert.equal(pageInfo(L, S.caret({id: 'nope', off: 0})), '');
      assert.equal(pageInfo(L, {head: null}), '');
    });
});
