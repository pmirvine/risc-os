// The comment facts helpers (Batch F1): the synthetic cases always,
// the corpus ones only when tests/moreapps/corpus is there.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {buildDocx, documentXml, p, r, W_NS} from './build-docx.mjs';
import {commentFiles, factsOf, sumFacts} from './comment-oracle.mjs';
import {CORPUS, ALL, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {existsSync} from 'node:fs';

const HAVE = existsSync(CORPUS);
const MSW = 'http://schemas.microsoft.com/office/word/2012/wordml';
const cs = (id) => `<w:commentRangeStart w:id="${id}"/>`;
const ce = (id) => `<w:commentRangeEnd w:id="${id}"/>` +
  `<w:r><w:commentReference w:id="${id}"/></w:r>`;
const cm = (...ids) => `<w:comments xmlns:w="${W_NS}">` + ids.map(
  (i) => `<w:comment w:id="${i}" w:author="A"><w:p w14:paraId="P${i}"` +
  ' xmlns:w14="x"><w:r><w:t>c</w:t></w:r></w:p></w:comment>').join('') +
  '</w:comments>';
const ext = (...rows) => `<w15:commentsEx xmlns:w15="${MSW}">` +
  rows.map(([id, par, done]) => `<w15:commentEx w15:paraId="P${id}"` +
    (par ? ` w15:paraIdParent="P${par}"` : '') +
    ` w15:done="${done}"/>`).join('') + '</w15:commentsEx>';

describe('comment facts', () => {
  it('commentFiles finds the corpus files and is empty without ' +
    'the corpus', {skip: HAVE ? false : SKIP_CORPUS}, async () => {
    const list = await commentFiles();
    assert.ok(list.length > 0);
    assert.ok(list.every((x) => x.file && x.path &&
      !/^handoff\//.test(x.file)));
  });

  it('factsOf counts replies, resolved and ranges crossing ' +
    'paragraphs', async () => {
    const a = await buildDocx({
      'word/document.xml': documentXml(
        p(cs(0) + r('a')) + p(r('b') + ce(0)) +
        p(cs(1) + ce(1)) + p(r('x') + ce(7))),
      'word/comments.xml': cm(0, 1, 2),
      'word/commentsExtended.xml': ext([0, 0, 0], [1, 0, 1],
        [2, 0, 0])});
    const f = await factsOf(a);
    assert.equal(f.comments, 3);
    assert.equal(f.multiPara, 1);
    assert.equal(f.emptyRange, 1);
    assert.equal(f.resolved, 1);
    assert.equal(f.replies, 0);
    assert.equal(f.orphans, 1);
    assert.equal(f.dangling, 1);
    assert.equal(f.extendedPart, true);
    assert.equal(f.idsPart, false);
    assert.equal(f.peoplePart, false);
  });

  it('factsOf sees replies, tables and opaque marks', async () => {
    const tbl = '<w:tbl><w:tr><w:tc>' + p(cs(0) + r('a') + ce(0)) +
      '</w:tc></w:tr></w:tbl>';
    const sdt = '<w:sdt><w:sdtContent>' + p(cs(1) + ce(1)) +
      '</w:sdtContent></w:sdt>';
    const b = await buildDocx({
      'word/document.xml': documentXml(tbl + sdt + p('')),
      'word/comments.xml': cm(0, 1),
      'word/commentsExtended.xml': ext([0, 0, 0], [1, 0, 0]
        ).replace('P1" w15:done="0"', 'P1" w15:paraIdParent="P0"' +
        ' w15:done="true"'),
      'word/people.xml': '<w15:people xmlns:w15="' + MSW + '"/>'});
    const f = await factsOf(b);
    assert.equal(f.inTable, 1);
    assert.equal(f.opaque, 1);
    assert.equal(f.replies, 1);
    assert.equal(f.resolved, 1);
    assert.equal(f.peoplePart, true);
    assert.equal(sumFacts([f, f]).comments, 4);
  });

  it('factsOf on a real corpus file', {skip: HAVE ? false :
    SKIP_CORPUS}, async () => {
    const list = await commentFiles();
    const f = await factsOf(list[0].path);
    assert.ok(f.comments > 0);
  });

  it('the pinned corpus counts', {skip: ALL && HAVE ? false :
    'WORD_EDIT_CORPUS=1 and the corpus'}, async () => {
    const list = await commentFiles();
    const facts = [];
    for (const x of list) facts.push(await factsOf(x.path));
    const t = sumFacts(facts);
    // measured floors (92 files, 1107 comments); the corpus only
    // grows, and none has a mark in a header, note, box or control
    const floors = {files: 92, comments: 1107, replies: 415,
      resolved: 82, multiPara: 29, inTable: 62, extendedPart: 61,
      idsPart: 3, extensiblePart: 2, peoplePart: 26};
    for (const [k, v] of Object.entries(floors))
      assert.ok(t[k] >= v, `${k}: ${t[k]} < ${v}`);
    assert.equal(t.emptyRange, 0);
    assert.equal(t.opaque, 0);
    assert.ok(t.orphans >= 9 && t.dangling >= 2);
  });
});
