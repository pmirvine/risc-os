// PicRels: a picture's bytes through a relationship list (Batch D, P0.3).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {bytesOf} from '../../tools/moreapps/!Letters/PicRels';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {picDocx, pngBytes} from './pic-fixtures.mjs';
import {wordHf} from './hf-fixtures.mjs';

describe('PicRels', () => {
  it('bytesOf: the picture\'s part, or null', async () => {
    const doc = readDocx(await picDocx(
      {pics: [{embed: 'rId5', bytes: pngBytes(4, 2)}]}));
    const d = await doc;
    assert.equal(bytesOf(d, {embed: 'rId5'}),
      d.parts.get('word/media/image1.png'));
    assert.equal(bytesOf(d, {embed: 'rId99'}), null);
    assert.equal(bytesOf(d, null), null);
    assert.equal(bytesOf(d, {}), null);
  });

  it('bytesOf: another rels list (a story\'s)', async () => {
    const d = await readDocx(await picDocx(
      {pics: [{embed: 'rId5', bytes: pngBytes(4, 2)}]}));
    const own = d.rels.find((r) => r.id === 'rId5');
    const story = [{...own, id: 'rId1'}];
    assert.equal(bytesOf(d, {embed: 'rId1'}, story),
      d.parts.get('word/media/image1.png'));
    assert.equal(bytesOf(d, {embed: 'rId5'}, story), null);
    assert.equal(bytesOf(d, {embed: 'rId5'}, []), null);
  });

  it('bytesOf: a story\'s picture, its target relative to the story ' +
    'part (P7.2)', async () => {
    for (const dir of ['', 'hf/', 'hf/deep/']) {
      const d = await readDocx(await wordHf({dir, pic: pngBytes(4, 2),
        default: {hdr: '<w:p/>'}}));
      const st = d.stories.get('word/' + dir + 'header1.xml');
      assert.ok(st && st.rels, dir);
      const want = d.parts.get('word/media/image1.png');
      assert.ok(want);
      assert.equal(bytesOf(d, {embed: 'rIdP1'}, st), want, dir);
      // the main part's relationships do not hold it
      assert.equal(bytesOf(d, {embed: 'rIdP1'}), null, dir);
      // a story with no .rels: nothing
      assert.equal(bytesOf(d, {embed: 'rIdP1'}, {...st, rels: null}),
        null, dir);
    }
  });
});

describe('partDoc follows the document (P7.3)', () => {
  it('a doc changed in place (Ops do) gives a new view', async () => {
    const {partDoc} = await import('../../tools/moreapps/!Letters/PicRels');
    const st = {part: 'word/header1.xml', rels: [], root: null};
    const doc = {styles: {a: 1}, rels: [], meta: {mainPart: 'm'}};
    const v = partDoc(doc, st);
    assert.equal(partDoc(doc, st), v, 'memoised while nothing changes');
    doc.styles = {a: 2};
    const w = partDoc(doc, st);
    assert.notEqual(w, v);
    assert.equal(w.styles, doc.styles, 'the styles now');
    assert.equal(w.meta.mainPart, 'word/header1.xml');
  });
});
