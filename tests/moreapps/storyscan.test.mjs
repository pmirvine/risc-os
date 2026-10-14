// Ids, Walk, positions and scanners over stories (Batch D P6.3,
// D11): the scanners that must see headers and footers (ids, PicIds,
// ListUsed, BookmarkFind, fonts) do; WordCount, Find and ListNumbers
// stay body-only, as Word.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {reserveIds, nextId, newPara, deepEqual, sameStories}
  from '../../tools/moreapps/!Letters/Model';
import {ids, stories, blocksOf, scanStories}
  from '../../tools/moreapps/!Letters/Walk';
import {storyOf, storyIds} from '../../tools/moreapps/!Letters/StoryPos';
import {findBlock, checkPos} from '../../tools/moreapps/!Letters/EditPos';
import {checkIds} from '../../tools/moreapps/!Letters/OpsUtil';
import {usedDocPrIds} from '../../tools/moreapps/!Letters/PicIds';
import {usedNumIds} from '../../tools/moreapps/!Letters/ListUsed';
import {marks, storyMarks, findBookmark}
  from '../../tools/moreapps/!Letters/BookmarkFind';
import {addBookmark} from '../../tools/moreapps/!Letters/Bookmarks';
import {facts} from '../../tools/moreapps/!Letters/Info';
import {count as wordCount} from '../../tools/moreapps/!Letters/WordCount';
import {count as findCount} from '../../tools/moreapps/!Letters/Find';
import {labels} from '../../tools/moreapps/!Letters/ListNumbers';
import {toggleList} from '../../tools/moreapps/!Letters/ListMake';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {caret} from '../../tools/moreapps/!Letters/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {NUMBERING, STYLES_LIST, item} from './list-fixtures.mjs';
import {withHeaders, freeze} from './story-fixtures.mjs';

const H1 = 'word/header1.xml', F1 = 'word/footer1.xml';
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p>' +
  '</w:tc></w:tr></w:tbl>';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/' +
  'wordprocessingDrawing';
const pic = (id) => `<w:r><w:drawing><wp:inline xmlns:wp="${WP}">` +
  `<wp:extent cx="9525" cy="9525"/><wp:docPr id="${id}" name="P"/>` +
  '</wp:inline></w:drawing></w:r>';
const mark = (id, name, text) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>` + r(text) + `<w:bookmarkEnd w:id="${id}"/>`;
const PARTS = {'word/numbering.xml': NUMBERING,
  'word/styles.xml': STYLES_LIST};
const read = async (body, hdrs, opts = {}) =>
  readDocx(await withHeaders(body, hdrs, {parts: PARTS, ...opts}));
/** doc with story `part`'s blocks replaced (copy-on-write). */
function withBlocks(doc, part, blocks) {
  const st = new Map(doc.stories);
  st.set(part, {...st.get(part), blocks});
  return {...doc, stories: st};
}
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const txt = (zip, name) => new TextDecoder().decode(zip.get(name));

describe('Walk over stories', () => {
  it('stories, blocksOf, scanStories and ids', async () => {
    const doc = freeze(await read(p(r('body')),
      {default: {hdr: p(r('h')) + TBL, ftr: p(r('f'))}}));
    assert.deepEqual(stories(doc).map((s) => s.part), [H1, F1]);
    assert.equal(blocksOf(doc, H1), doc.stories.get(H1).blocks);
    assert.equal(blocksOf(doc, 'word/nope.xml'), null);
    assert.equal(blocksOf(doc, '__proto__'), null);
    assert.equal(blocksOf({sections: []}, H1), null);
    const seen = [];
    scanStories(doc, (b, part) => seen.push([b.type, part]));
    assert.deepEqual(seen, [['p', H1], ['tbl', H1], ['p', H1],
      ['p', F1]]);
    const hb = doc.stories.get(H1).blocks;
    const want = [doc.sections[0].blocks[0].id, hb[0].id, hb[1].id,
      hb[1].rows[0].cells[0].blocks[0].id,
      doc.stories.get(F1).blocks[0].id];
    assert.deepEqual(ids(doc), want);
    assert.deepEqual(stories({sections: []}), []);
    assert.deepEqual(stories({sections: [], stories: 'x'}), []);
  });
});

describe('StoryPos and EditPos.findBlock', () => {
  it('a header paragraph is found with story set', async () => {
    const doc = freeze(await read(p(r('body')),
      {default: {hdr: p(r('h')) + TBL}}));
    const hb = doc.stories.get(H1).blocks;
    const loc = findBlock(doc, hb[0].id);
    assert.equal(loc.story, H1);
    assert.deepEqual(loc.at, [0, 0]);
    assert.equal(loc.b, hb[0]);
    const cell = hb[1].rows[0].cells[0].blocks[0];
    const c = findBlock(doc, cell.id);
    assert.equal(c.story, H1);
    assert.deepEqual(c.at, [0, 1, 0, 0, 0]);
    assert.equal(c.b, cell);
    const body = findBlock(doc, doc.sections[0].blocks[0].id);
    assert.equal(body.story, null);
    assert.deepEqual(body.at, [0, 0]);
    assert.equal(findBlock(doc, 1e12), null);
    assert.equal(storyOf(doc, hb[0].id), H1);
    assert.equal(storyOf(doc, doc.sections[0].blocks[0].id), null);
    assert.equal(storyOf({sections: []}, 1), null);
  });

  it('a position in a story is no position for the body', async () => {
    const doc = await read(p(r('body')), {default: p(r('h'))});
    const id = doc.stories.get(H1).blocks[0].id;
    assert.equal(checkPos(doc, {id, off: 0}), null);
  });

  it('the id map is memoised per stories Map, and follows a new one',
    async () => {
      const doc = await read(p(r('body')), {default: p(r('h'))});
      const m = storyIds(doc);
      assert.equal(storyIds({...doc}), m, 'same Map: same id map');
      const q = newPara('new');
      const doc2 = withBlocks(doc, H1, [q]);
      assert.notEqual(storyIds(doc2), m);
      assert.equal(findBlock(doc2, q.id).story, H1);
      assert.equal(findBlock(doc2, doc.stories.get(H1).blocks[0].id),
        null, 'the old block is gone from the new state');
    });
});

describe('ids reserved and checked over stories', () => {
  it('reserveIds moves past header ids', async () => {
    const doc = await read(p(r('body')), {default: p(r('h'))});
    const big = nextId() + 100000;
    const h = {...doc.stories.get(H1).blocks[0], id: big};
    const doc2 = withBlocks(doc, H1, [h]);
    reserveIds(doc2);
    assert.ok(nextId() > big);
  });

  it('a block put in may not take a header id', async () => {
    const doc = await read(p(r('body')), {default: p(r('h'))});
    const id = doc.stories.get(H1).blocks[0].id;
    const b = {...doc.sections[0].blocks[0], id};
    assert.throws(() => checkIds(doc, [b]), /already in use/);
  });
});

describe('PicIds over stories', () => {
  it('a header picture docPr id is seen through the model',
    async () => {
      const doc = await read(p(r('body')), {default: p(pic(77))});
      assert.ok(usedDocPrIds(doc).ids.has(77));
      const src = await read(p(r('x')), {default: p(pic(88))});
      const doc2 = withBlocks(doc, H1, src.stories.get(H1).blocks);
      const used = usedDocPrIds(doc2);
      assert.ok(used.ids.has(88), 'the model');
      assert.ok(!used.ids.has(77), 'not the stale bytes');
      assert.equal(used.max, 88);
    });

  it('a header part that is no story is still scanned', async () => {
    const doc = await read(p(r('body')),
      {default: p(pic(66)) + '<w:sectPr/>'});
    assert.equal(doc.stories.size, 0);
    assert.ok(usedDocPrIds(doc).ids.has(66));
  });
});

describe('ListUsed over stories', () => {
  it('a numId only in a footer is used (the model, not the bytes)',
    async () => {
      const doc = await read(p(r('body')), {default: {ftr: item('f', 4)}});
      assert.ok(usedNumIds(doc).includes(4));
      const src = await read(p(r('x')), {default: {ftr: item('g', 6)}});
      const doc2 = withBlocks(doc, F1, src.stories.get(F1).blocks);
      const used = usedNumIds(doc2);
      assert.ok(used.includes(6));
      assert.ok(!used.includes(4), 'the stale bytes are not read');
    });

  it('a definition used only in a footer is kept, not reused, and ' +
    'written', async () => {
    const d = new Document(await read(p(r('a')), {default: p(r('h'))}));
    const T = new Typing(d);
    const c = () => caret({id: d.doc.sections[0].blocks[0].id, off: 0});
    toggleList(d, T, c(), {kind: 'bullet'}, null);
    const id = d.doc.sections[0].blocks[0].pPr.numPr.numId;
    toggleList(d, T, c(), {kind: 'bullet'}, null);
    assert.equal(d.doc.sections[0].blocks[0].pPr.numPr, undefined);
    // the footer now names that list: Bullets again takes a new one
    const f = newPara('in the footer', {pPr: {numPr: {numId: id,
      ilvl: 0}}});
    const st = new Map(d.doc.stories);
    st.set(H1, {...st.get(H1), blocks: [f]});
    d.doc = {...d.doc, stories: st};
    toggleList(d, T, c(), {kind: 'bullet'}, null);
    const now = d.doc.sections[0].blocks[0].pPr.numPr.numId;
    assert.notEqual(now, id, 'not reused');
    const bytes = await writeDocx(d.doc, {date: DATE});
    const zip = await readZip(bytes);
    assert.match(txt(zip, 'word/numbering.xml'),
      new RegExp(`<w:num w:numId="${id}"`));
    assert.match(txt(zip, H1), new RegExp(`numId w:val="${id}"`));
    const back = await readDocx(bytes);
    assert.ok(back.numbering.nums.has(id));
    assert.equal(back.stories.get(H1).blocks[0].pPr.numPr.numId, id);
  });
});

describe('BookmarkFind over stories', () => {
  it('a bookmark in a header is found, with its story', async () => {
    const doc = freeze(await read(p(r('body')),
      {default: p(r('x') + mark(50, 'InHead', 'h'))}));
    assert.equal(marks(doc).length, 0, 'marks stays the body\'s');
    const ms = storyMarks(doc);
    assert.deepEqual(ms.map((m) => [m.kind, m.name, m.id, m.story]),
      [['start', 'InHead', '50', H1], ['end', null, '50', H1]]);
    const hp = doc.stories.get(H1).blocks[0];
    assert.deepEqual(findBookmark(doc, 'InHead'),
      {id: hp.id, off: 1, story: H1});
    assert.deepEqual(findBookmark(doc, 'inhead'),
      {id: hp.id, off: 1, story: H1}, 'case ignored');
    assert.equal(findBookmark(doc, 'Nope'), null);
  });

  it('the body\'s bookmark of a name comes first', async () => {
    const doc = await read(p(mark(1, 'Both', 'b')),
      {default: p(mark(2, 'Both', 'h'))});
    const got = findBookmark(doc, 'Both');
    assert.equal(got.id, doc.sections[0].blocks[0].id);
    assert.equal(got.story, undefined);
  });

  it('a new bookmark takes an id past the header\'s', async () => {
    const d = new Document(await read(p(r('body text')),
      {default: p(mark(50, 'InHead', 'h'))}));
    const id = d.doc.sections[0].blocks[0].id;
    const out = addBookmark(d, new Typing(d), caret({id, off: 2}),
      'New');
    assert.ok(!out.error, out.error);
    const m = marks(d.doc).find((x) => x.name === 'New');
    assert.equal(m.id, '51');
  });
});

describe('fonts of stories', () => {
  it('a font only a footer uses is in facts(doc).fonts', async () => {
    const doc = await read(p(r('body')), {default: {ftr: p(r('f',
      '<w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>'))}});
    assert.ok(facts(doc).fonts.includes('Caladea'));
    assert.equal(facts(doc).paragraphs, 1, 'counts stay the body\'s');
  });
});

describe('scanners that stay body-only (as Word)', () => {
  const HDR = item('header words here', 2);
  const mkDoc = () => read(item('body', 2) + item('two', 2),
    {default: {hdr: HDR, ftr: item('footer', 2)}});

  it('WordCount counts the body only', async () => {
    const c = wordCount(await mkDoc());
    assert.equal(c.words, 2);
    assert.equal(c.paras, 2);
  });

  it('Find searches the body only', async () => {
    const doc = await mkDoc();
    assert.equal(findCount(doc, 'header'), 0);
    assert.equal(findCount(doc, 'footer'), 0);
    assert.equal(findCount(doc, 'body'), 1);
  });

  it('ListNumbers numbers the body only', async () => {
    const doc = await mkDoc();
    const m = labels(doc);
    const [a, b] = doc.sections[0].blocks;
    assert.equal(m.size, 2);
    assert.equal(m.get(a.id).text, '1.');
    assert.equal(m.get(b.id).text, '2.');
    for (const s of doc.stories.values())
      for (const x of s.blocks) assert.ok(!m.has(x.id));
  });
});

describe('ModelCheck compares stories', () => {
  it('deepEqual and sameStories see a story difference', async () => {
    const a = await read(p(r('body')), {default: p(r('h'))});
    const b = withBlocks(a, H1, [newPara('other')]);
    assert.ok(!deepEqual(a.stories, b.stories));
    assert.ok(!sameStories(a.stories, b.stories));
    assert.ok(sameStories(a.stories, structuredClone(a.stories)));
    assert.ok(deepEqual(a.stories, structuredClone(a.stories)));
    assert.ok(sameStories(undefined, undefined));
    assert.ok(!sameStories(a.stories, undefined));
    const re = new Map([...a.stories].reverse());
    re.set('word/footer9.xml', a.stories.get(H1));
    assert.ok(!sameStories(a.stories, re));
    assert.ok(!deepEqual(new Map([[1, 2]]), new Map([[1, 3]])));
    assert.ok(!deepEqual(new Map([[1, 2]]), {}));
    assert.ok(!deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
    assert.ok(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  });
});
