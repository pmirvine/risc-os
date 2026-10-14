// A range across paragraphs in a header or footer (Batch D P8 fix
// I4): typing over it, deleting it, Enter over it work in a story as
// in the body (they threw RangeError 'at N out of range': the range
// code read the facade's doc from before its own ops, and a story's
// doc is a new view after every op). Paragraphs, a field among them,
// and a table in the header (rows of it taken whole, a range across
// paragraphs of one cell). Undo gives the story back.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {select} from '../../tools/moreapps/!Letters/Selection';
import {typeText, splitPara}
  from '../../tools/moreapps/!Letters/Edit';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {forEachIn} from '../../tools/moreapps/!Letters/Walk';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {loadStyles} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {fld} from './field-fixtures.mjs';

before(loadStyles);
const cell = (x) => '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>' +
  `</w:tcPr>${x}</w:tc>`;
const row = (a, b) => `<w:tr>${cell(a)}${cell(b)}</w:tr>`;
const TBL = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/>' +
  '</w:tblGrid>' + row(p(r('c1')) + p(r('c2')) + p(r('c3')), p(r('d'))) +
  row(p(r('e')), p(r('f'))) + '</w:tbl>';
const PLAIN = p(r('abcdef')) + p(r('ghijkl')) + p(r('mnopqr'));
const FIELD = p(r('ab') + fld(' PAGE ', '1') + r('cd')) + p(r('ghijkl')) +
  p(r('mnopqr'));
const WITH_TBL = p(r('abcdef')) + TBL + p(r('mnopqr'));

/** The paragraphs of doc in flow order (cells too). */
function paras(doc) {
  const out = [];
  forEachIn(doc.sections.flatMap((s) => s.blocks), [0], (b) => {
    if (b && b.type === 'p') out.push(b);
    return true;
  });
  return out;
}

/** d (the body) or its story `where`, with `xml` as its blocks. */
async function target(where, xml) {
  const hdrs = {default: where === 'body' ? {hdr: p(r('y'))}
    : where === 'hdr' ? {hdr: xml} : {ftr: xml}};
  const doc = await readDocx(await withHeaders(
    where === 'body' ? xml : p(r('x')), hdrs));
  const d = new Document(doc);
  const part = where === 'hdr' ? 'word/header1.xml' : 'word/footer1.xml';
  return {d, t: where === 'body' ? d : facadeOf(d, part, 0)};
}

const texts = (t) => paras(t.doc).map((b) => b.text.replace(/￼/g,
  '#'));

/** Command cmd over [ps[a] off x, ps[b] off y) in each place: the same
 *  texts as in the body, no throw, undo gives the story back. */
async function same(xml, [a, x], [b, y], cmd) {
  const got = {};
  for (const where of ['body', 'hdr', 'ftr']) {
    const {d, t} = await target(where, xml);
    const was = t.doc.sections[0].blocks, ps = paras(t.doc);
    const sel = select({id: ps[a].id, off: x}, {id: ps[b].id, off: y});
    cmd(t, sel);
    got[where] = texts(t);
    while (d.canUndo) d.undo();
    assert.ok(deepEqual(t.doc.sections[0].blocks, was), where + ' undo');
  }
  assert.deepEqual(got.hdr, got.body);
  assert.deepEqual(got.ftr, got.body);
  return got.body;
}

describe('a range across paragraphs in a story (I4)', () => {
  it('typing over it', async () => {
    assert.deepEqual(await same(PLAIN, [0, 1], [2, 3],
      (t, s) => typeText(t, s, 'Z')), ['aZpqr']);
  });
  it('typing over it, a field in the first paragraph', async () => {
    assert.deepEqual(await same(FIELD, [0, 8], [2, 3],
      (t, s) => typeText(t, s, 'Z')), ['ab###1#cZpqr']);
  });
  it('typing over it, keyed (coalesced) as the keys type', async () => {
    assert.deepEqual(await same(PLAIN, [0, 1], [1, 3],
      (t, s) => typeText(t, s, 'Z', {key: 'typing'})),
    ['aZjkl', 'mnopqr']);
  });
  it('deleting it and Enter over it', async () => {
    assert.deepEqual(await same(PLAIN, [0, 2], [2, 1],
      (t, s) => deleteSelection(t, s)), ['abnopqr']);
    assert.deepEqual(await same(PLAIN, [0, 2], [1, 1],
      (t, s) => splitPara(t, s)), ['ab', 'hijkl', 'mnopqr']);
  });
  it('across paragraphs of one table cell', async () => {
    assert.deepEqual(await same(WITH_TBL, [1, 1], [3, 1],
      (t, s) => typeText(t, s, 'Z')),
    ['abcdef', 'cZ3', 'd', 'e', 'f', 'mnopqr']);
  });
  it('from a paragraph over a whole table', async () => {
    assert.deepEqual(await same(WITH_TBL, [0, 2], [7, 2],
      (t, s) => typeText(t, s, 'Z')), ['abZopqr']);
  });
});
