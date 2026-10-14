// A header's facade sees the body as it is now (Batch D final fix A,
// F1-I3): the ops change the body's section and block arrays IN PLACE
// (./OpsPath own), so ./StoryFacade keys its view (Facade.doc) and its
// "body as one story" (the stories the whole-document scanners walk:
// ./PicIds, bookmarks, ./ListUsed, fonts) by the doc's ./DocVersion as
// well. A picture put in the body after the facade's view was built,
// then one in the header: distinct wp:docPr ids in the saved parts; a
// bookmark the same; the section's props after an in-place
// setSection are the view's (M2).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {insert as insertPic}
  from '../../tools/moreapps/!Letters/InsertPicture';
import {addBookmark} from '../../tools/moreapps/!Letters/Bookmarks';
import {usedDocPrIds} from '../../tools/moreapps/!Letters/PicIds';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';

const H = 'word/header1.xml';
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const dec = (b) => new TextDecoder().decode(b);
const ids = (xml, re) => [...xml.matchAll(re)].map((m) => m[1]);

describe('the facade sees the body as it is now (F1-I3)', () => {
  let opened;
  before(async () => {
    opened = await readDocx(await withHeaders(p(r('body one')) +
      p(r('body two')), {default: {hdr: p(r('Head'))}}));
  });
  const fresh = () => new Document(structuredClone(opened));

  it('a picture in the body, then one in the header: distinct docPr ' +
    'ids', async () => {
    const d = fresh(), f = facadeOf(d, H, 0);
    assert.ok(f.doc, 'the view built first');
    const b0 = d.doc.sections[0].blocks[0];
    insertPic(d, S.caret({id: b0.id, off: 0}), {bytes: pngBytes(4, 2)});
    assert.deepEqual([...usedDocPrIds(f.doc).ids], [1],
      'the facade sees the body\'s picture');
    const h0 = d.doc.stories.get(H).blocks[0];
    insertPic(f, S.caret({id: h0.id, off: 0}), {bytes: pngBytes(4, 2)});
    const z = await readZip(await writeDocx(d.doc, {date: DATE}));
    const re = /<wp:docPr id="(\d+)"/g;
    const body = ids(dec(z.get('word/document.xml')), re);
    const head = ids(dec(z.get(H)), re);
    assert.equal(body.length, 1);
    assert.equal(head.length, 1);
    assert.notEqual(body[0], head[0]);
  });

  it('a bookmark in the body, then one in the header: distinct ids',
    async () => {
      const d = fresh(), f = facadeOf(d, H, 0);
      assert.ok(f.doc);
      const b0 = d.doc.sections[0].blocks[0];
      const a = addBookmark(d, new Typing(d), S.select({id: b0.id,
        off: 0}, {id: b0.id, off: 4}), 'one');
      assert.ok(a && !a.error, 'body bookmark');
      const h0 = d.doc.stories.get(H).blocks[0];
      const c = addBookmark(f, new Typing(f), S.select({id: h0.id,
        off: 0}, {id: h0.id, off: 2}), 'two');
      assert.ok(c && !c.error, 'header bookmark');
      const z = await readZip(await writeDocx(d.doc, {date: DATE}));
      const re = /<w:bookmarkStart[^>]* w:id="(\d+)"/g;
      const body = ids(dec(z.get('word/document.xml')), re);
      const head = ids(dec(z.get(H)), re);
      assert.equal(body.length, 1);
      assert.equal(head.length, 1);
      assert.notEqual(body[0], head[0]);
    });

  it('the section\'s props after an in-place setSection (M2)', () => {
    const d = fresh(), f = facadeOf(d, H, 0);
    assert.ok(f.doc);
    const s = d.doc.sections[0];
    d.apply({op: 'setSection', at: 0, raw: s.raw,
      props: {...s.props, titlePg: true}});
    assert.equal(f.doc.sections[0].props.titlePg, true);
  });
});
