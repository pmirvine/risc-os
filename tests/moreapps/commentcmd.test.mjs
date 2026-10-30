// Comments put in, edited, answered, resolved and deleted (Batch F1):
// ./CommentCmd (addComment, editComment, replyTo, setResolved,
// deleteComment, deleteAllIn: one undo step each, none when nothing
// changes; the refusals), ./CommentParts (the comments part and
// commentsExtended made on first use, with their relationship and
// content type; fresh w14:paraId values) and ./CommentOpts (the user
// name and initials in Choices:Letters). Every command's SAVED XML
// is asserted (comments.xml and the companions' entries), and saved
// packages are linted (and the comments part checked against
// wml.xsd when xmllint and the schemas are there).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {checkComments} from '../../tools/moreapps/!Letters/ModelCheck';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {marks} from '../../tools/moreapps/!Letters/CommentMarks';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {apply as applyOp} from '../../tools/moreapps/!Letters/Ops';
import {addComment, editComment, replyTo, setResolved, deleteComment,
  deleteAllIn, whyNot, textOf, isLossy, localDate, cleanName, MAX_NAME}
  from '../../tools/moreapps/!Letters/CommentCmd';
import {ensure, partState, freshParaId, takenIds, nextCommentId,
  Refused}
  from '../../tools/moreapps/!Letters/CommentParts';
import {lintPackage} from './lint-package.mjs';
import {schemaChecker, extKey, roundTrip, corpusRun, SKIP_CORPUS}
  from './roundtrip-lib.mjs';
import {commentFiles} from './comment-oracle.mjs';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildDocx, documentXml, p, r, REL, W_NS, STRICT_W_NS,
  STRICT_R_NS} from './build-docx.mjs';
import {commentDoc, commentBytes, range, cs, ce, cr}
  from './comment-fixtures.mjs';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const W16CID = 'http://schemas.microsoft.com/office/word/2016/' +
  'wordml/cid';
const W16CEX = 'http://schemas.microsoft.com/office/word/2018/' +
  'wordml/cex';
const MSR = 'http://schemas.microsoft.com/office/';
const EXT_REL = MSR + '2011/relationships/commentsExtended';
const WML = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const WHEN = new Date(2026, 9, 30, 10, 20, 5);
const LOCAL = '2026-10-30T10:20:00Z';
const UTC = new Date(Date.UTC(WHEN.getUTCFullYear(), WHEN.getUTCMonth(),
  WHEN.getUTCDate(), WHEN.getUTCHours(), WHEN.getUTCMinutes()))
  .toISOString().replace('.000Z', 'Z');
const ANN = {author: 'Ann Example', initials: 'AE', date: WHEN};
const BOB = {author: 'Bob', initials: 'B', date: WHEN};

const para = (d, i = 0) => d.doc.sections[0].blocks[i];
const at = (b, off) => ({id: b.id, off});
const cmt = (d, id) => d.doc.comments.map.get(id);
const dec = new TextDecoder();
const ANNOT = '<w:r><w:rPr><w:rStyle w:val="CommentReference"/>' +
  '</w:rPr><w:annotationRef/></w:r>';
const PPR = '<w:pPr><w:pStyle w:val="CommentText"/></w:pPr>';
const REF = (id) => '<w:r><w:rPr><w:rStyle w:val="CommentReference"/>' +
  `</w:rPr><w:commentReference w:id="${id}"/></w:r>`;

const setup = async (doc) => {
  const d = new Document(await doc);
  return {d, t: new Typing(d)};
};
const plain = async (body, opts = {}) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body), ...(opts.parts || {})},
  opts.build || {}));

/** The saved package: its parts' text, and its lint errors. */
async function saved(d) {
  const z = await readZip(await writeDocx(d.doc, {date: new Date(0)}));
  const xml = (n) => (z.get(n) ? dec.decode(z.get(n)) : null);
  const errors = lintPackage(z).problems.filter((q) =>
    q.level === 'error').map((q) => q.rule + ' ' + q.detail);
  return {z, xml, errors};
}

/** comments.xml of the saved package against wml.xsd (Microsoft
 *  extension attributes passed over), or 'skipped'. */
const XSD = schemaChecker();
function xsdOf(bytes) {
  if (typeof XSD === 'string') return 'skipped';
  // (markup compatibility is read before the schema applies)
  return [...XSD.errors(bytes)].filter((m) => !extKey(m) &&
    !m.includes('markup-compatibility'));
}

/** The w:comment element of id in comments.xml text. */
function commentXml(xml, id) {
  const m = new RegExp(`<w:comment w:id="${id}"[^>]*>.*?</w:comment>`)
    .exec(xml);
  return m ? m[0] : null;
}

/** The step count, the doc object: unchanged by a refusal. */
function refused(d, fn) {
  const v = d.doc, depth = d.undoDepth;
  assert.equal(fn(), null);
  assert.equal(d.doc, v, 'nothing changed');
  assert.equal(d.undoDepth, depth, 'no step');
}

const world = async () => {
  const {d, t} = await setup(plain(p(r('Hello world'))));
  const b = para(d);
  return {d, t, sel: S.select(at(b, 6), at(b, 11))};
};

describe('addComment', () => {
  it('the first comment makes the comments part, its relationship ' +
    'and content type, in one step; the saved XML is Word\'s',
  async () => {
    const {d, t, sel} = await world();
    assert.equal(partState(d.doc, 'comments'), 'missing');
    const depth = d.undoDepth;
    const out = addComment(d, t, sel, {text: 'Check', ...ANN});
    assert.equal(out.id, 0);
    assert.equal(d.undoDepth, depth + 1, 'one step');
    assert.equal(partState(d.doc, 'comments'), 'known');
    const b = para(d);
    assert.equal(b.text, 'Hello ' + OBJ + 'world' + OBJ + OBJ);
    assert.deepEqual([6, 12, 13].map((k) => b.inlines[k].kind),
      ['cmtStart', 'cmtEnd', 'cmtRef']);
    assert.deepEqual(out.sel, S.select(at(b, 7), at(b, 12)));
    const c = cmt(d, 0);
    assert.match(c.paraId, /^[0-7][0-9A-F]{7}$/);
    assert.notEqual(c.paraId, '00000000');
    assert.equal(c.author, 'Ann Example');
    assert.equal(c.initials, 'AE');
    assert.equal(c.date, LOCAL);
    assert.equal(c.parent, null);
    assert.equal(c.done, false);
    checkComments(d.doc.comments);
    const {xml, errors, z} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(xml('word/document.xml').includes(
      '<w:commentRangeStart w:id="0"/><w:r><w:t>world</w:t></w:r>' +
      '<w:commentRangeEnd w:id="0"/>' + REF(0)),
    xml('word/document.xml'));
    const cx = xml('word/comments.xml');
    assert.ok(cx.startsWith(DECL));
    assert.equal(commentXml(cx, 0), '<w:comment w:id="0" ' +
      'w:author="Ann Example" w:date="' + LOCAL + '" w:initials="AE">' +
      `<w:p w14:paraId="${c.paraId}">${PPR}${ANNOT}` +
      '<w:r><w:t>Check</w:t></w:r></w:p></w:comment>');
    assert.ok(cx.includes(`xmlns:w14="${W14}"`));
    assert.ok(cx.includes('mc:Ignorable="w14"'));
    const rels = xml('word/_rels/document.xml.rels');
    assert.match(rels, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/comments" Target="comments\.xml"/);
    assert.ok(xml('[Content_Types].xml').includes(
      `<Override PartName="/word/comments.xml" ContentType="${WML}` +
      'comments+xml"/>'));
    assert.equal(xml('word/commentsExtended.xml'), null,
      'no commentsExtended: nothing needs it');
    const st = xml('word/styles.xml');
    for (const id of ['CommentText', 'CommentReference',
      'CommentTextChar']) assert.ok(st.includes(`w:styleId="${id}"`), id);
    assert.ok(st.includes('<w:name w:val="annotation text"/>'));
    const x = xsdOf(z.get('word/comments.xml'));
    assert.ok(x === 'skipped' || !x.length, String(x));
    // read back: the same comment
    const back = await readDocx(await writeDocx(d.doc));
    const bc = back.comments.map.get(0);
    assert.equal(bc.paraId, c.paraId);
    assert.equal(textOf(bc), 'Check');
    assert.equal(back.sections[0].blocks[0].inlines[13].kind, 'cmtRef');
  });

  it('undo takes the part, relationship, styles and marks away; ' +
    'redo puts them back', async () => {
    const {d, t, sel} = await world();
    const rels0 = d.doc.rels, st0 = d.doc.styles;
    addComment(d, t, sel, {text: 'Check', ...ANN});
    d.undo();
    assert.equal(partState(d.doc, 'comments'), 'missing');
    assert.equal(para(d).text, 'Hello world');
    assert.equal(d.doc.rels, rels0);
    assert.equal(d.doc.styles, st0);
    const {xml, errors} = await saved(d);
    assert.equal(xml('word/comments.xml'), null);
    assert.deepEqual(errors, []);
    d.redo();
    assert.equal(cmt(d, 0).author, 'Ann Example');
    assert.ok((await saved(d)).xml('word/comments.xml'));
  });

  it('a caret: the three marks together, the caret after them',
    async () => {
      const {d, t} = await setup(plain(p(r('ab'))));
      const out = addComment(d, t, S.caret(at(para(d), 1)),
        {text: '', ...ANN});
      const b = para(d);
      assert.equal(b.text, 'a' + OBJ + OBJ + OBJ + 'b');
      assert.deepEqual(out.sel, S.caret(at(b, 4)));
      const {xml} = await saved(d);
      assert.ok(xml('word/document.xml').includes(
        '<w:commentRangeStart w:id="0"/><w:commentRangeEnd w:id="0"/>' +
        REF(0)));
      // an empty comment: the paragraph holds its mark only (Word's)
      assert.equal(commentXml(xml('word/comments.xml'), 0),
        '<w:comment w:id="0" w:author="Ann Example" w:date="' + LOCAL +
        '" w:initials="AE"><w:p w14:paraId="' + cmt(d, 0).paraId +
        `">${PPR}${ANNOT}</w:p></w:comment>`);
    });

  it('a range across paragraphs; lines make paragraphs; a tab stays',
    async () => {
      const {d, t} = await setup(plain(p(r('one')) + p(r('two'))));
      const a = para(d, 0), b = para(d, 1);
      addComment(d, t, S.select(at(a, 1), at(b, 2)),
        {text: 'first\r\nsec\tond\nthird', ...ANN});
      assert.equal(para(d, 0).text, 'o' + OBJ + 'ne');
      assert.equal(para(d, 1).text, 'tw' + OBJ + OBJ + 'o');
      const c = cmt(d, 0);
      assert.equal(c.blocks.length, 3);
      assert.equal(textOf(c), 'first\nsec\tond\nthird');
      const cx = commentXml((await saved(d)).xml('word/comments.xml'), 0);
      assert.ok(cx.includes(`<w:p>${PPR}${ANNOT}<w:r><w:t>first</w:t>` +
        `</w:r></w:p><w:p>${PPR}<w:r><w:t>sec</w:t><w:tab/><w:t>ond` +
        `</w:t></w:r></w:p><w:p w14:paraId="${c.paraId}">${PPR}<w:r>` +
        '<w:t>third</w:t></w:r></w:p>'), cx);
    });

  it('a second comment takes the next id; an id is never used twice ' +
    'in a session, not even after an undo', async () => {
    const {d, t, sel} = await world();
    assert.equal(addComment(d, t, sel, {text: 'a', ...ANN}).id, 0);
    d.undo();
    const b = para(d);
    assert.equal(addComment(d, t, S.select(at(b, 0), at(b, 5)),
      {text: 'b', ...ANN}).id, 1);
    const b2 = para(d);
    assert.equal(addComment(d, t, S.caret(at(b2, 9)),
      {text: 'c', ...ANN}).id, 2);
    assert.notEqual(cmt(d, 1).paraId, cmt(d, 2).paraId);
    assert.deepEqual((await saved(d)).errors, []);
  });

  it('a document with comments: the next id is past every comment, ' +
    'odd node and mark (even one naming none)', async () => {
    const body = p(r('x') + range(4, r('y')) + cs(9) + ce(9) + r('z'));
    const {d, t} = await setup(commentDoc(body, {4: 'four'}));
    assert.equal(nextCommentId(d), 10);
    const out = addComment(d, t, S.caret(at(para(d), 0)),
      {text: 'new', ...ANN});
    assert.equal(out.id, 10);
    const cx = (await saved(d)).xml('word/comments.xml');
    assert.ok(commentXml(cx, 4).includes('four'), 'the old one as read');
    assert.ok(commentXml(cx, 10));
  });

  it('a document whose comments part exists: entries go to the ' +
    'companions there (extended, ids, extensible, people)', async () => {
    const ext = DECL + `<w15:commentsEx xmlns:w15="${W15}">` +
      '<w15:commentEx w15:paraId="00000002" w15:done="0"/>' +
      '</w15:commentsEx>';
    const ids = DECL + `<w16cid:commentsIds xmlns:w16cid="${W16CID}">` +
      '<w16cid:commentId w16cid:paraId="00000002" ' +
      'w16cid:durableId="11111111"/></w16cid:commentsIds>';
    const exb = DECL + '<w16cex:commentsExtensible ' +
      `xmlns:w16cex="${W16CEX}"><w16cex:commentExtensible ` +
      'w16cex:durableId="11111111" w16cex:dateUtc="2020-01-01T00:00:00Z"' +
      '/></w16cex:commentsExtensible>';
    const ppl = DECL + `<w15:people xmlns:w15="${W15}"><w15:person ` +
      'w15:author="Ann"><w15:presenceInfo w15:providerId="None" ' +
      'w15:userId="Ann"/></w15:person></w15:people>';
    const bytes = await commentBytes(p(range(1, r('a')) + r('b')),
      {1: 'one'}, {parts: {'word/commentsExtended.xml': ext,
        'word/commentsIds.xml': ids, 'word/commentsExtensible.xml': exb,
        'word/people.xml': ppl}, docRels: [
        ['rX1', EXT_REL, 'commentsExtended.xml'],
        ['rX2', MSR + '2016/09/relationships/commentsIds',
          'commentsIds.xml'],
        ['rX3', MSR + '2018/08/relationships/commentsExtensible',
          'commentsExtensible.xml'],
        ['rX4', MSR + '2011/relationships/people', 'people.xml']]});
    const {d, t} = await setup(readDocx(bytes));
    assert.deepEqual(Object.keys(d.doc.meta.commentParts).sort(),
      ['comments', 'extended', 'extensible', 'ids', 'people']);
    const b = para(d);
    const out = addComment(d, t, S.caret(at(b, b.text.length)),
      {text: 'two', ...BOB});
    const c = cmt(d, out.id);
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    const pid = c.paraId;
    assert.ok(xml('word/commentsExtended.xml').endsWith(
      '<w15:commentEx w15:paraId="00000002" w15:done="0"/>' +
      `<w15:commentEx w15:paraId="${pid}" w15:done="0"/>` +
      '</w15:commentsEx>'), xml('word/commentsExtended.xml'));
    const durable = c.durableId;
    assert.match(durable, /^[0-7][0-9A-F]{7}$/);
    assert.notEqual(durable, '11111111');
    assert.ok(xml('word/commentsIds.xml').endsWith(
      `<w16cid:commentId w16cid:paraId="${pid}" ` +
      `w16cid:durableId="${durable}"/></w16cid:commentsIds>`));
    assert.ok(xml('word/commentsExtensible.xml').endsWith(
      `<w16cex:commentExtensible w16cex:durableId="${durable}" ` +
      `w16cex:dateUtc="${UTC}"/></w16cex:commentsExtensible>`),
    xml('word/commentsExtensible.xml'));
    assert.ok(xml('word/people.xml').endsWith('<w15:person ' +
      'w15:author="Bob"><w15:presenceInfo w15:providerId="None" ' +
      'w15:userId="Bob"/></w15:person></w15:people>'),
    xml('word/people.xml'));
    // a second comment by an author people.xml has: no new person
    addComment(d, t, S.caret(at(para(d), 0)), {text: 'x', ...BOB});
    const again = (await saved(d)).xml('word/people.xml');
    assert.equal(again.split('w15:author="Bob"').length, 2);
    // undo all: every companion is its very bytes again
    while (d.undo());
    const z0 = await readZip(bytes), z1 = (await saved(d)).z;
    for (const n of ['word/commentsExtended.xml', 'word/commentsIds.xml',
      'word/commentsExtensible.xml', 'word/people.xml',
      'word/comments.xml'])
      assert.deepEqual(z1.get(n), z0.get(n), n);
  });

  it('a Strict document: the Strict relationship type', async () => {
    const doc = readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('ab')), {ns: STRICT_W_NS, rNs: STRICT_R_NS})},
    {strict: true}));
    const {d, t} = await setup(doc);
    assert.equal(d.doc.meta.conformance, 'strict');
    addComment(d, t, S.caret(at(para(d), 1)), {text: 'x', ...ANN});
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(xml('word/_rels/document.xml.rels').includes(
      'Type="http://purl.oclc.org/ooxml/officeDocument/relationships/' +
      'comments"'));
    assert.ok(xml('word/comments.xml').includes(STRICT_W_NS));
    const back = await readDocx(await writeDocx(d.doc));
    assert.equal(textOf(back.comments.map.get(0)), 'x');
  });

  it('a comment in a table cell, and a range from a cell to after ' +
    'the table', async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr>' +
      '<w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
    const {d, t} = await setup(plain(tbl + p(r('after'))));
    const cell = para(d, 0).rows[0].cells[0].blocks[0];
    addComment(d, t, S.select(at(cell, 1), at(cell, 3)),
      {text: 'in', ...ANN});
    const cell2 = para(d, 0).rows[0].cells[0].blocks[0];
    const after = para(d, 1);
    addComment(d, t, S.select(at(cell2, 0), at(after, 2)),
      {text: 'out', ...ANN});
    const m = marks(d.doc);
    assert.ok(m.get(0).start && m.get(0).end && m.get(0).ref);
    assert.ok(m.get(1).start && m.get(1).end && m.get(1).ref);
    assert.deepEqual((await saved(d)).errors, []);
  });

  it('markup characters and lone surrogates in text and author',
    async () => {
      const {d, t, sel} = await world();
      addComment(d, t, sel, {text: 'a <b> & "c" \uD800 \u0001￼ z',
        author: 'A & <B> "C"', initials: '<&>', date: WHEN});
      const c = cmt(d, 0);
      assert.equal(textOf(c), 'a <b> & "c" �  z');
      const {xml, errors} = await saved(d);
      assert.deepEqual(errors, []);
      const cx = xml('word/comments.xml');
      assert.ok(cx.includes('w:author="A &amp; &lt;B&gt; &quot;C&quot;"'),
        cx);
      assert.ok(cx.includes('a &lt;b&gt; &amp; "c" �  z'));
      const back = await readDocx(await writeDocx(d.doc));
      const bc = back.comments.map.get(0);
      assert.equal(bc.author, 'A & <B> "C"');
      assert.equal(bc.initials, '<&>');
      assert.equal(textOf(bc), 'a <b> & "c" �  z');
    });

  it('a 1 MB comment', async () => {
    const {d, t, sel} = await world();
    const big = 'x'.repeat(1 << 20);
    const t0 = Date.now();
    addComment(d, t, sel, {text: big, ...ANN});
    const back = await readDocx(await writeDocx(d.doc));
    assert.equal(textOf(back.comments.map.get(0)).length, 1 << 20);
    assert.ok(Date.now() - t0 < 20000);
  });

  it('no author or initials: asks for them, changes nothing',
    async () => {
      const {d, t, sel} = await world();
      for (const who of [{author: '', initials: 'A'},
        {author: 'Ann', initials: ''}, {author: '  ', initials: 'A'},
        {initials: 'A'}, {author: 'Ann'}, {author: 3, initials: 'A'}]) {
        const v = d.doc, depth = d.undoDepth;
        assert.deepEqual(addComment(d, t, sel, {text: 'x', ...who}),
          {needsAuthor: true});
        assert.equal(d.doc, v);
        assert.equal(d.undoDepth, depth);
      }
    });
});

describe('refused (null, nothing changed)', () => {
  it('in a header or footer, in a note', async () => {
    const doc = await readDocx(await withHeaders(p(r('body')),
      {default: p(r('Head'))}));
    const d = new Document(doc);
    const f = facadeOf(d, [...doc.stories.keys()][0]);
    const hb = f.doc.sections[0].blocks[0];
    assert.match(String(whyNot(f, S.caret(at(hb, 1)))), /header/);
    refused(f, () => addComment(f, new Typing(f), S.caret(at(hb, 1)),
      {text: 'x', ...ANN}));
    const {d: d2} = await setup(noteDoc(p(r('a') + mark(1)),
      {1: noteP('one')}));
    const g = facadeOf(d2, {note: {kind: 'footnote', id: 1}});
    const nb = g.doc.sections[0].blocks[0];
    assert.match(String(whyNot(g, S.caret(at(nb, 2)))), /note/);
    refused(g, () => addComment(g, new Typing(g), S.caret(at(nb, 2)),
      {text: 'x', ...ANN}));
  });

  it('inside a field code or a computed result', async () => {
    const fld = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r>' +
      '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1' +
      '</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const {d, t} = await setup(plain(p(r('ab') + fld + r('cd'))));
    const b = para(d);
    // offsets: a b [begin]2 [instr]3 [sep]4 1 [end]6 c d
    for (const k of [3, 4, 5, 6]) {
      assert.match(String(whyNot(d, S.caret(at(b, k)))), /field/,
        'off ' + k);
      refused(d, () => addComment(d, t, S.caret(at(b, k)),
        {text: 'x', ...ANN}));
    }
    refused(d, () => addComment(d, t, S.select(at(b, 0), at(b, 4)),
      {text: 'x', ...ANN}));
    // before the field and after it: fine; a range over the whole one
    assert.equal(whyNot(d, S.caret(at(b, 2))), null);
    assert.equal(whyNot(d, S.select(at(b, 2), at(b, 7))), null);
  });

  it('on a table edge, a kept block (a text box, a content control)',
    async () => {
      const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
        '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr>' +
        '<w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>';
      const sdt = '<w:sdt><w:sdtPr/><w:sdtContent>' + p(r('in')) +
        '</w:sdtContent></w:sdt>';
      const {d, t} = await setup(plain(tbl + sdt + p(r('after'))));
      assert.equal(para(d, 1).type, 'opaque');
      for (const sel of [S.caret({id: para(d, 0).id, off: 0}),
        S.select(at(para(d, 2), 0), {id: para(d, 0).id, off: 1})]) {
        assert.match(String(whyNot(d, sel)), /text/);
        refused(d, () => addComment(d, t, sel, {text: 'x', ...ANN}));
      }
    });

  it('a comments part kept as bytes (it could not be read)',
    async () => {
      const bytes = await buildDocx({'word/document.xml':
        documentXml(p(r('a'))), 'word/comments.xml':
        `<w:comments xmlns:w="${W_NS}"><w:comment w:id="1"><broken`},
      {docRels: [['rC', REL('comments'), 'comments.xml']]});
      const {d, t} = await setup(readDocx(bytes));
      assert.equal(partState(d.doc, 'comments'), 'unknown');
      assert.match(String(whyNot(d, S.caret(at(para(d), 0)))),
        /could not be read/);
      refused(d, () => addComment(d, t, S.caret(at(para(d), 0)),
        {text: 'x', ...ANN}));
      assert.throws(() => ensure(d, ['comments']), RangeError);
    });

  it('no selection, a selection not in the document', async () => {
    const {d, t} = await world();
    refused(d, () => addComment(d, t, null, {text: 'x', ...ANN}));
    refused(d, () => addComment(d, t, S.caret({id: 999999, off: 0}),
      {text: 'x', ...ANN}));
  });

  it('the commands on a comment marked only in a header: kept, not ' +
    'editable', async () => {
    const parts = (await import('./comment-fixtures.mjs'))
      .commentParts({3: 'in head'});
    const bytes = await withHeaders(p(r('body')),
      {default: p(range(3, r('Head')))}, {parts: parts.parts,
      docRels: parts.docRels});
    const {d, t} = await setup(readDocx(bytes));
    assert.ok(cmt(d, 3), 'read');
    refused(d, () => editComment(d, t, 3, {text: 'x'}));
    refused(d, () => replyTo(d, t, 3, {text: 'x', ...ANN}));
    refused(d, () => setResolved(d, t, 3, true));
    refused(d, () => deleteComment(d, t, 3));
  });

  it('hostile ids', async () => {
    const {d, t} = await setup(commentDoc(p(range(0, r('a'))),
      {0: 'zero'}));
    for (const id of [-1, 1.5, 2 ** 31, NaN, '0', '__proto__', null,
      undefined, {}, [0], 7]) {
      refused(d, () => editComment(d, t, id, {text: 'x'}));
      refused(d, () => replyTo(d, t, id, {text: 'x', ...ANN}));
      refused(d, () => setResolved(d, t, id, true));
      refused(d, () => deleteComment(d, t, id));
    }
    refused(d, () => setResolved(d, t, 0, 'yes'));
    refused(d, () => editComment(d, t, 0, {text: 3}));
    refused(d, () => editComment(d, t, 0, null));
  });
});

describe('editComment', () => {
  it('plain text replaced: the saved comment, one step; the same ' +
    'text: no step', async () => {
    const {d, t, sel} = await world();
    addComment(d, t, sel, {text: 'Check', ...ANN});
    const pid = cmt(d, 0).paraId, depth = d.undoDepth;
    assert.equal(editComment(d, t, 0, {text: 'Check'}), true);
    assert.equal(d.undoDepth, depth, 'nothing changed: no step');
    assert.equal(editComment(d, t, 0, {text: 'New\nlines'}), true);
    assert.equal(d.undoDepth, depth + 1);
    const c = cmt(d, 0);
    assert.equal(c.paraId, pid, 'the paraId stays');
    assert.equal(c.author, 'Ann Example');
    const cx = commentXml((await saved(d)).xml('word/comments.xml'), 0);
    assert.equal(cx, '<w:comment w:id="0" w:author="Ann Example" ' +
      `w:date="${LOCAL}" w:initials="AE"><w:p>${PPR}${ANNOT}<w:r><w:t>` +
      `New</w:t></w:r></w:p><w:p w14:paraId="${pid}">${PPR}<w:r><w:t>` +
      'lines</w:t></w:r></w:p></w:comment>');
    d.undo();
    assert.equal(textOf(cmt(d, 0)), 'Check');
  });

  it('a read comment: its paragraph properties kept while the count ' +
    'of paragraphs stays', async () => {
    const cx = DECL + `<w:comments xmlns:w="${W_NS}" xmlns:w14=` +
      `"${W14}"><w:comment w:id="0" w:author="Zed" w:initials="Z">` +
      '<w:p w14:paraId="0000AAAA"><w:pPr><w:pStyle w:val="CommentText"' +
      '/><w:jc w:val="center"/></w:pPr>' + ANNOT + '<w:r><w:t>old' +
      '</w:t></w:r></w:p></w:comment></w:comments>';
    const {d, t} = await setup(commentDoc(p(range(0, r('a'))), {},
      {parts: {'word/comments.xml': cx}}));
    assert.equal(isLossy(cmt(d, 0)), false);
    editComment(d, t, 0, {text: 'new'});
    const out = commentXml((await saved(d)).xml('word/comments.xml'), 0);
    assert.equal(out, '<w:comment w:id="0" w:author="Zed" ' +
      'w:initials="Z"><w:p w14:paraId="0000AAAA"><w:pPr><w:pStyle ' +
      'w:val="CommentText"/><w:jc w:val="center"/></w:pPr>' + ANNOT +
      '<w:r><w:t>new</w:t></w:r></w:p></w:comment>');
    editComment(d, t, 0, {text: 'two\nparas'});
    const two = commentXml((await saved(d)).xml('word/comments.xml'), 0);
    assert.ok(!two.includes('w:jc'), 'a new count: Word\'s plain style');
  });

  it('formatting, a link, a field or a picture: {lossy} first, ' +
    'written only when confirmed', async () => {
    const kinds = {
      bold: '<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>',
      link: '<w:hyperlink w:anchor="x"><w:r><w:t>link</w:t></w:r>' +
        '</w:hyperlink>',
      field: '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r>' +
        '</w:fldSimple>',
      picture: '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.' +
        'openxmlformats.org/drawingml/2006/wordprocessingDrawing"/>' +
        '</w:drawing></w:r>',
    };
    for (const [name, inner] of Object.entries(kinds)) {
      const cx = DECL + `<w:comments xmlns:w="${W_NS}" xmlns:w14=` +
        `"${W14}"><w:comment w:id="0" w:author="Z" w:initials="Z">` +
        `<w:p w14:paraId="0000AAAA">${inner}</w:p></w:comment>` +
        '</w:comments>';
      const {d, t} = await setup(commentDoc(p(range(0, r('a'))), {},
        {parts: {'word/comments.xml': cx}}));
      assert.equal(isLossy(cmt(d, 0)), true, name);
      const v = d.doc, depth = d.undoDepth;
      assert.deepEqual(editComment(d, t, 0, {text: 'plain'}),
        {lossy: true}, name);
      assert.equal(d.doc, v);
      assert.equal(d.undoDepth, depth);
      assert.equal(editComment(d, t, 0, {text: 'plain',
        confirmed: true}), true, name);
      assert.equal(textOf(cmt(d, 0)), 'plain');
      const {xml, errors} = await saved(d);
      assert.deepEqual(errors, [], name);
      assert.ok(commentXml(xml('word/comments.xml'), 0)
        .includes('<w:t>plain</w:t>'), name);
    }
  });

  it('resolving a formatted comment does not touch its text',
    async () => {
      const cx = DECL + `<w:comments xmlns:w="${W_NS}" xmlns:w14=` +
        `"${W14}"><w:comment w:id="0" w:author="Z" w:initials="Z">` +
        '<w:p w14:paraId="0000AAAA"><w:r><w:rPr><w:b/></w:rPr><w:t>b' +
        '</w:t></w:r></w:p></w:comment></w:comments>';
      const bytes = await commentBytes(p(range(0, r('a'))), {},
        {parts: {'word/comments.xml': cx}});
      const {d, t} = await setup(readDocx(bytes));
      setResolved(d, t, 0, true);
      const {xml, z} = await saved(d);
      assert.deepEqual(z.get('word/comments.xml'),
        (await readZip(bytes)).get('word/comments.xml'),
        'comments.xml its very bytes');
      assert.ok(xml('word/commentsExtended.xml').includes(
        '<w15:commentEx w15:paraId="0000AAAA" w15:done="1"/>'));
    });
});

describe('replyTo', () => {
  it('marks inside the parent\'s range, the reference after the ' +
    'parent\'s; commentsExtended made with the thread', async () => {
    const {d, t, sel} = await world();
    addComment(d, t, sel, {text: 'Check', ...ANN});
    const depth = d.undoDepth;
    const out = replyTo(d, t, 0, {text: 'Done', ...BOB});
    assert.equal(out.id, 1);
    assert.equal(d.undoDepth, depth + 1, 'one step');
    const b = para(d);
    // Hello [s0][s1]world[e1][e0][r0][r1]
    const k = (i) => [b.inlines[i].kind, b.inlines[i].id];
    assert.deepEqual([6, 7, 13, 14, 15, 16].map(k), [['cmtStart', 0],
      ['cmtStart', 1], ['cmtEnd', 1], ['cmtEnd', 0], ['cmtRef', 0],
      ['cmtRef', 1]]);
    const c0 = cmt(d, 0), c1 = cmt(d, 1);
    assert.equal(c1.parent, 0);
    assert.equal(partState(d.doc, 'extended'), 'known');
    const {xml, errors, z} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(xml('word/document.xml').includes(
      '<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>' +
      '<w:r><w:t>world</w:t></w:r><w:commentRangeEnd w:id="1"/>' +
      '<w:commentRangeEnd w:id="0"/><w:r><w:rPr><w:rStyle ' +
      'w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/>' +
      '<w:commentReference w:id="1"/></w:r>'), 'the two references ' +
      'share a run (the same format: one run in the model)');
    const ex = xml('word/commentsExtended.xml');
    assert.ok(ex.startsWith(DECL));
    assert.ok(ex.includes(`<w15:commentsEx xmlns:mc="http://schemas.` +
      `openxmlformats.org/markup-compatibility/2006" xmlns:w15="${W15}" ` +
      'mc:Ignorable="w15">'), ex);
    assert.ok(ex.endsWith(`<w15:commentEx w15:paraId="${c0.paraId}" ` +
      `w15:done="0"/><w15:commentEx w15:paraId="${c1.paraId}" ` +
      `w15:paraIdParent="${c0.paraId}" w15:done="0"/>` +
      '</w15:commentsEx>'), ex);
    assert.ok(xml('word/_rels/document.xml.rels').includes(
      `Type="${EXT_REL}" Target="commentsExtended.xml"`));
    assert.ok(xml('[Content_Types].xml').includes(
      '<Override PartName="/word/commentsExtended.xml" ContentType="' +
      WML + 'commentsExtended+xml"/>'));
    assert.ok(z.get('word/comments.xml'));
    const back = await readDocx(await writeDocx(d.doc));
    assert.equal(back.comments.map.get(1).parent, 0);
    d.undo();
    assert.equal(partState(d.doc, 'extended'), 'missing');
    assert.equal(cmt(d, 1), undefined);
    assert.equal((await saved(d)).xml('word/commentsExtended.xml'), null);
  });

  it('a second reply; a reply to a reply joins the thread\'s first ' +
    'comment', async () => {
    const {d, t, sel} = await world();
    addComment(d, t, sel, {text: 'a', ...ANN});
    replyTo(d, t, 0, {text: 'b', ...BOB});
    const out = replyTo(d, t, 1, {text: 'c', ...ANN});
    assert.equal(cmt(d, out.id).parent, 0);
    const m = marks(d.doc).get(out.id);
    assert.ok(m.start && m.end && m.ref);
    const ref0 = marks(d.doc).get(0).ref;
    assert.equal(m.ref.off, ref0.off + 1, 'right after the parent\'s');
    assert.deepEqual((await saved(d)).errors, []);
  });

  it('a parent read without a paraId gets one; a point comment\'s ' +
    'reply', async () => {
    const cx = DECL + `<w:comments xmlns:w="${W_NS}"><w:comment ` +
      'w:id="5" w:author="Z" w:initials="Z"><w:p><w:r><w:t>old</w:t>' +
      '</w:r></w:p></w:comment></w:comments>';
    const {d, t} = await setup(commentDoc(p(r('a') + cs(5) + ce(5) +
      cr(5)), {}, {parts: {'word/comments.xml': cx}}));
    assert.equal(cmt(d, 5).paraId, null);
    const out = replyTo(d, t, 5, {text: 'r', ...ANN});
    assert.match(cmt(d, 5).paraId, /^[0-7][0-9A-F]{7}$/);
    assert.equal(out.id, 6);
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(xml('word/document.xml').includes(
      '<w:commentRangeStart w:id="5"/><w:commentRangeStart w:id="6"/>' +
      '<w:commentRangeEnd w:id="6"/><w:commentRangeEnd w:id="5"/>'));
    assert.ok(xml('word/comments.xml').includes(
      `w14:paraId="${cmt(d, 5).paraId}"`));
  });

  it('refused: a parent with no reference in the body; no author ' +
    'asks', async () => {
    const {d, t} = await setup(commentDoc(p(r('a')), {2: 'orphan'}));
    refused(d, () => replyTo(d, t, 2, {text: 'x', ...ANN}));
    const w = await world();
    addComment(w.d, w.t, w.sel, {text: 'a', ...ANN});
    assert.deepEqual(replyTo(w.d, w.t, 0, {text: 'x', author: ''}),
      {needsAuthor: true});
  });
});

describe('setResolved', () => {
  it('resolving a parent resolves its replies; reopening reopens ' +
    'the parent only; a reply alone', async () => {
    const {d, t, sel} = await world();
    addComment(d, t, sel, {text: 'a', ...ANN});
    replyTo(d, t, 0, {text: 'b', ...BOB});
    replyTo(d, t, 0, {text: 'c', ...BOB});
    const depth = d.undoDepth;
    assert.equal(setResolved(d, t, 0, true), true);
    assert.equal(d.undoDepth, depth + 1);
    assert.deepEqual([0, 1, 2].map((i) => cmt(d, i).done),
      [true, true, true]);
    const ex = (await saved(d)).xml('word/commentsExtended.xml');
    for (const i of [0, 1, 2]) {
      assert.ok(new RegExp(`w15:paraId="${cmt(d, i).paraId}"[^>]*` +
        'w15:done="1"').test(ex), String(i));
    }
    assert.equal(setResolved(d, t, 0, true), true);
    assert.equal(d.undoDepth, depth + 1, 'already: no step');
    setResolved(d, t, 0, false);
    assert.deepEqual([0, 1, 2].map((i) => cmt(d, i).done),
      [false, true, true]);
    setResolved(d, t, 1, false);
    setResolved(d, t, 2, false);
    setResolved(d, t, 1, true);
    assert.deepEqual([0, 1, 2].map((i) => cmt(d, i).done),
      [false, true, false]);
    d.undo();
    assert.equal(cmt(d, 1).done, false);
    assert.deepEqual((await saved(d)).errors, []);
  });

  it('the first resolve in a document with no commentsExtended ' +
    'makes it', async () => {
    const {d, t} = await setup(commentDoc(p(range(0, r('a'))),
      {0: 'zero'}));
    assert.equal(partState(d.doc, 'extended'), 'missing');
    setResolved(d, t, 0, true);
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(xml('word/commentsExtended.xml').includes(
      '<w15:commentEx w15:paraId="00000001" w15:done="1"/>'));
    // the comments part itself is untouched
    assert.ok(xml('word/comments.xml').includes('w14:paraId="00000001"'));
  });

  it('a commentsExtended that could not be read: refused', async () => {
    const {d, t} = await setup(commentDoc(p(range(0, r('a'))),
      {0: 'zero'}, {parts: {'word/commentsExtended.xml': '<bad'},
      docRels: [['rX', EXT_REL, 'commentsExtended.xml']]}));
    assert.equal(partState(d.doc, 'extended'), 'unknown');
    refused(d, () => setResolved(d, t, 0, true));
    refused(d, () => replyTo(d, t, 0, {text: 'x', ...ANN}));
  });
});

describe('deleteComment and deleteAllIn', () => {
  it('the marks and the comment go, the text stays; its replies go ' +
    'too; one step', async () => {
    const {d, t, sel} = await world();
    addComment(d, t, sel, {text: 'a', ...ANN});
    replyTo(d, t, 0, {text: 'b', ...BOB});
    const depth = d.undoDepth;
    assert.equal(deleteComment(d, t, 0), true);
    assert.equal(d.undoDepth, depth + 1);
    assert.equal(para(d).text, 'Hello world');
    assert.equal(d.doc.comments.map.size, 0);
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(!xml('word/comments.xml').includes('<w:comment '));
    assert.ok(!xml('word/commentsExtended.xml').includes('commentEx '));
    d.undo();
    assert.equal(d.doc.comments.map.size, 2);
    assert.equal(marks(d.doc).size, 2);
  });

  it('a reply alone: its marks and itself; the parent stays',
    async () => {
      const {d, t, sel} = await world();
      addComment(d, t, sel, {text: 'a', ...ANN});
      replyTo(d, t, 0, {text: 'b', ...BOB});
      deleteComment(d, t, 1);
      assert.deepEqual([...d.doc.comments.map.keys()], [0]);
      assert.deepEqual([...marks(d.doc).keys()], [0]);
      const ex = (await saved(d)).xml('word/commentsExtended.xml');
      assert.ok(!ex.includes('paraIdParent'));
    });

  it('an orphan (no marks) is deleted; a read comment\'s marks and ' +
    'text', async () => {
    const {d, t} = await setup(commentDoc(p(r('x') + range(3, r('y'))),
      {3: 'three', 8: 'orphan'}));
    deleteComment(d, t, 8);
    deleteComment(d, t, 3);
    assert.equal(para(d).text, 'xy');
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(!xml('word/comments.xml').includes('<w:comment '));
  });

  it('deleteAllIn: the comments whose text the selection holds, ' +
    'with replies; others stay; one step; none: 0, no step',
  async () => {
    const {d, t} = await setup(plain(p(r('one two three'))));
    const b = para(d);
    addComment(d, t, S.select(at(b, 0), at(b, 3)), {text: '1', ...ANN});
    let b2 = para(d);
    addComment(d, t, S.select(at(b2, b2.text.length - 5),
      at(b2, b2.text.length)), {text: '2', ...ANN});
    replyTo(d, t, 0, {text: '1r', ...BOB});
    b2 = para(d);
    const depth = d.undoDepth;
    // (S0 S1 one E1 E0 R0 R1: the text of 0 is 1..5, all selected)
    assert.equal(deleteAllIn(d, t, S.select(at(b2, 0), at(b2, 6))), 2);
    assert.equal(d.undoDepth, depth + 1);
    assert.deepEqual([...d.doc.comments.map.keys()], [1]);
    b2 = para(d);
    assert.equal(deleteAllIn(d, t, S.select(at(b2, 0), at(b2, 3))), 0);
    assert.equal(d.undoDepth, depth + 1);
    assert.equal(deleteAllIn(d, t, S.select(at(b2, 0),
      at(b2, b2.text.length))), 1);
    assert.equal(para(d).text, 'one two three');
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.ok(!xml('word/comments.xml').includes('<w:comment '));
    assert.ok(!xml('word/document.xml').includes('comment'));
  });

  it('deleteAllIn on a selection: a comment that only touches its ' +
    'edges stays; one inside goes; a caret in a range takes it',
  async () => {
    const mk = () => setup(commentDoc(p(r('Alpha ') +
      range(1, r('beta')) + r(' gamma ') + cs(2) + ce(2) + cr(2) +
      r(' delta')), {1: 'one', 2: 'point'}));
    const offs = (b, kind, id) => Number(Object.keys(b.inlines)
      .find((k) => b.inlines[k].kind === kind &&
        b.inlines[k].id === id));
    {
      // (from the end mark of 1 on: 1 ends where it starts)
      const {d, t} = await mk();
      const b = para(d), e1 = offs(b, 'cmtEnd', 1);
      assert.equal(deleteAllIn(d, t, S.select(at(b, e1),
        at(b, e1 + 6))), 0);
      // (the text of 1, 'beta', exactly: inside)
      const s1 = offs(b, 'cmtStart', 1);
      assert.equal(deleteAllIn(d, t, S.select(at(b, s1 + 1),
        at(b, e1))), 1);
    }
    {
      // (a selection ending just before the point's marks, or
      // starting just after them: touching; around them: inside)
      const {d, t} = await mk();
      const b = para(d), s2 = offs(b, 'cmtStart', 2);
      const r2 = offs(b, 'cmtRef', 2);
      assert.equal(deleteAllIn(d, t, S.select(at(b, s2 - 3),
        at(b, s2))), 0);
      assert.equal(deleteAllIn(d, t, S.select(at(b, r2 + 1),
        at(b, r2 + 4))), 0);
      assert.equal(deleteAllIn(d, t, S.select(at(b, s2 - 1),
        at(b, r2 + 2))), 1);
      assert.deepEqual([...d.doc.comments.map.keys()], [1]);
    }
    {
      const {d, t} = await mk();
      const b = para(d), s1 = offs(b, 'cmtStart', 1);
      assert.equal(deleteAllIn(d, t, S.caret(at(b, s1 + 2))), 1);
    }
  });

  it('deleteAllIn after one: the saved part holds the others; in a ' +
    'header: 0', async () => {
    const {d, t} = await setup(commentDoc(p(range(1, r('a')) + r(' ') +
      range(2, r('b'))), {1: 'one', 2: 'two'}));
    const b = para(d);
    assert.equal(deleteAllIn(d, t, S.caret(at(b, 1))), 1);
    const cx = (await saved(d)).xml('word/comments.xml');
    assert.equal(commentXml(cx, 1), null);
    assert.ok(commentXml(cx, 2).includes('two'));
    const doc = await readDocx(await withHeaders(p(r('body')),
      {default: p(r('Head'))}));
    const d2 = new Document(doc);
    const f = facadeOf(d2, [...doc.stories.keys()][0]);
    const hb = f.doc.sections[0].blocks[0];
    assert.equal(deleteAllIn(f, new Typing(f), S.caret(at(hb, 0))), 0);
  });
});

describe('CommentParts', () => {
  it('ensure: nothing when the parts are there; extended needs ' +
    'comments', async () => {
    const {d} = await setup(commentDoc(p(range(0, r('a'))), {0: 'z'}));
    const depth = d.undoDepth;
    assert.equal(ensure(d, ['comments']), false);
    assert.equal(d.undoDepth, depth);
    const {d: d2} = await world();
    assert.equal(ensure(d2, ['comments', 'extended']), true);
    assert.equal(d2.undoDepth, 1, 'one step for both');
    assert.equal(partState(d2.doc, 'extended'), 'known');
    d2.undo();
    assert.equal(partState(d2.doc, 'comments'), 'missing');
    assert.throws(() => ensure(d2, ['bogus']), RangeError);
  });

  it('a part name taken: the next free one', async () => {
    const {d, t} = await setup(plain(p(r('ab')), {parts:
      {'word/comments.xml': '<x/>'}}));
    addComment(d, t, S.caret(at(para(d), 1)), {text: 'x', ...ANN});
    assert.equal(d.doc.meta.commentParts.comments, 'word/comments2.xml');
    const {xml, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.equal(xml('word/comments.xml'), '<x/>');
    assert.ok(xml('word/comments2.xml').includes('<w:comment '));
  });

  it('freshParaId: 8 hex digits under 80000000, never one in use ' +
    '(body, headers, notes, comments, companions, bytes)', async () => {
    const hdr = p(r('h')).replace('<w:p>', '<w:p w14:paraId="00000003"' +
      ` xmlns:w14="${W14}">`);
    const body = p(r('b')).replace('<w:p>', '<w:p w14:paraId="00000004"' +
      ` xmlns:w14="${W14}">`);
    const bytes = await withHeaders(body, {default: hdr});
    const doc = await readDocx(bytes);
    const taken = takenIds(doc);
    assert.ok(taken.has('00000003') && taken.has('00000004'));
    const seq = [3, 4, 3, 0, 0x80000000, 5];
    let k = 0;
    const rand = () => seq[k++] / 0x100000000;
    // (3, 4 taken; 0 and 80000000 never given)
    assert.equal(freshParaId(doc, {rand}), '00000005');
    // a part kept as bytes: its ids and comment marks count too
    const glos = '<w:glossaryDocument xmlns:w="' + W_NS + '"><w:p ' +
      'w14:paraId="0000000a" w14:textId="0000000B"><w:commentReference' +
      ' w:id="77"/></w:p></w:glossaryDocument>';
    const doc2 = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('x'))), 'word/glossary/document.xml': glos}));
    assert.ok(takenIds(doc2).has('0000000A'));
    assert.ok(takenIds(doc2).has('0000000B'));
    assert.equal(nextCommentId(new Document(doc2)), 78);
    for (let i = 0; i < 200; i++) {
      const v = freshParaId(doc);
      assert.match(v, /^[0-7][0-9A-F]{7}$/);
      assert.notEqual(v, '00000000');
    }
  });
});

describe('CommentOpts', async () => {
  const disc = new Map();
  globalThis.__cmtChoiceStub = {
    vfs: {
      exists: (q) => disc.has(q),
      async readText(q) { return disc.get(q); },
      readFileSync(q) {
        return Uint8Array.from(disc.get(q), (c) => c.charCodeAt(0));
      },
    },
    choices: {write(name, value) {
      disc.set('Choices:' + name, JSON.stringify(value));
    }},
  };
  const STUB = 'data:text/javascript,' + encodeURIComponent(
    'const s = globalThis.__cmtChoiceStub;' +
    'export const vfs = s.vfs, choices = s.choices;');
  registerHooks({resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  }});
  const opts = await import('../../tools/moreapps/!Letters/CommentOpts');
  const {loadChoices} =
    await import('../../tools/moreapps/!Letters/WordChoices');

  it('read: empty without a choice; write keeps the other keys',
    async () => {
      disc.set('Choices:Letters', JSON.stringify({recent: ['x']}));
      const app = {};
      await loadChoices(app);
      assert.deepEqual(opts.read(app), {name: '', initials: ''});
      await opts.write(app, {name: ' Ann  Example ', initials: 'AE'});
      assert.deepEqual(opts.read(app), {name: 'Ann Example',
        initials: 'AE'});
      const f = JSON.parse(disc.get('Choices:Letters'));
      assert.deepEqual(f.recent, ['x']);
      assert.equal(f[opts.KEYS.name], 'Ann Example');
      assert.equal(f[opts.KEYS.initials], 'AE');
    });

  it('hostile choices read as text, cleaned and capped', async () => {
    const app = {choices: {[opts.KEYS.name]: {x: 1},
      [opts.KEYS.initials]: 'a\nb\u0001' + 'c'.repeat(1000)}};
    const got = opts.read(app);
    assert.equal(got.name, '');
    const emo = 'a'.repeat(opts.MAX) + '\u{1F600}';
    const app2 = {choices: {[opts.KEYS.name]: emo}};
    assert.equal(opts.read(app2).name, cleanName(emo));
    assert.equal(got.initials, ('a b' + 'c'.repeat(1000)).slice(0,
      opts.MAX));
  });
});

describe('localDate', () => {
  it('local time as Word writes w:date, minutes only', () => {
    assert.equal(localDate(WHEN), LOCAL);
    assert.equal(localDate(new Date(2001, 0, 2, 3, 4, 59)),
      '2001-01-02T03:04:00Z');
  });
});

describe('round trip (lint, xsd of the main part, undo to the bytes)',
  () => {
  it('add, reply, resolve, edit, delete on a document with comments',
    async () => {
      const xsd = schemaChecker();
      const bytes = await commentBytes(p(r('one ') + range(0, r('two')) +
        r(' three')) + p(r('four five')), {0: 'zero'});
      await roundTrip(bytes, 'commentcmd', 1, (d) => {
        const t = new Typing(d);
        const b = d.doc.sections[0].blocks[1];
        const a = addComment(d, t, S.select(at(b, 0), at(b, 4)),
          {text: 'new', ...ANN});
        assert.ok(a);
        assert.ok(replyTo(d, t, 0, {text: 'reply', ...BOB}));
        assert.ok(setResolved(d, t, 0, true));
        assert.equal(editComment(d, t, a.id, {text: 'edited'}), true);
        assert.equal(deleteComment(d, t, a.id), true);
        return {};
      }, {xsd: typeof xsd === 'string' ? null : xsd});
    });

  it('the first comment of a plain document', async () => {
    const bytes = await buildDocx({'word/document.xml':
      documentXml(p(r('alpha beta')))});
    await roundTrip(bytes, 'commentcmd plain', 2, (d) => {
      const t = new Typing(d);
      const b = d.doc.sections[0].blocks[0];
      assert.ok(addComment(d, t, S.select(at(b, 0), at(b, 5)),
        {text: 'x', ...ANN}));
      assert.ok(replyTo(d, t, 0, {text: 'y', ...BOB}));
      return {};
    });
  });
});

describe('ops', () => {
  it('setCommentsPart refuses a part there already, a bad value',
    async () => {
      const {d} = await setup(commentDoc(p(range(0, r('a'))), {0: 'z'}));
      const doc = d.doc;
      assert.throws(() => applyOp(doc, {op: 'setCommentsPart',
        kind: 'comments', value: {part: 'word/c9.xml', root: {name:
          'w:comments', attrs: []}, prolog: null}}), RangeError);
      assert.throws(() => applyOp(doc, {op: 'setCommentsPart',
        kind: 'comments', value: null}), RangeError, 'read from the file');
      assert.throws(() => applyOp(doc, {op: 'setCommentsPart',
        kind: '__proto__', value: null}), RangeError);
    });
});

describe('fix round 1', () => {
  it('a part with 50,000 comment mark tags lacking ids is scanned ' +
    'in linear time; a tag past its cap: no id is given', async () => {
    const tag = '<w:commentReference w:x="1"/>';
    const time = async (n) => {
      const glos = '<w:glossaryDocument xmlns:w="' + W_NS + '"><w:p>' +
        tag.repeat(n) + '<w:commentReference w:id="5"/></w:p>' +
        '</w:glossaryDocument>';
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('x'))), 'word/glossary/document.xml': glos}));
      const d = new Document(doc);
      const t0 = performance.now();
      assert.equal(nextCommentId(d), 6);
      return performance.now() - t0;
    };
    const best = async (n) => Math.min(await time(n), await time(n),
      await time(n));
    const a = await best(1000), b = await best(50000);
    // (linear: about 50; the unbounded search was about 2,500)
    assert.ok(b / Math.max(a, 0.05) < 400, 'ratio ' + (b / a));
    // a mark tag that runs on past 4096 characters without its end:
    // its id cannot be known, so no new id is given out
    const open = '<w:glossaryDocument xmlns:w="' + W_NS + '"><w:p>' +
      '<w:commentReference ' + 'w:x="1" '.repeat(1000) +
      '</w:p></w:glossaryDocument>';
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('ab'))), 'word/glossary/document.xml': open}));
    const {d, t} = await setup(doc);
    assert.equal(nextCommentId(d), null);
    assert.match(String(whyNot(d, S.caret(at(para(d), 1)))), /free/);
    refused(d, () => addComment(d, t, S.caret(at(para(d), 1)),
      {text: 'x', ...ANN}));
  });

  it('ONE RULE: a thread with a reply marked in a header is refused ' +
    'by every command; deleteAllIn leaves it whole', async () => {
    const {commentParts} = await import('./comment-fixtures.mjs');
    const parts = commentParts({1: 'parent', 2: {text: 'reply',
      parent: 1}, 3: 'free'});
    const bytes = await withHeaders(p(range(1, r('a')) + r(' ') +
      range(3, r('b'))), {default: p(range(2, r('Head')))},
    {parts: parts.parts, docRels: parts.docRels});
    const {d, t} = await setup(readDocx(bytes));
    assert.equal(cmt(d, 2).parent, 1);
    for (const id of [1, 2]) {
      refused(d, () => setResolved(d, t, id, true));
      refused(d, () => deleteComment(d, t, id));
      refused(d, () => replyTo(d, t, id, {text: 'x', ...ANN}));
      refused(d, () => editComment(d, t, id, {text: 'x'}));
    }
    const b = para(d);
    const n = deleteAllIn(d, t, S.select(at(b, 0), at(b,
      b.text.length)));
    assert.equal(n, 1, 'the free comment only');
    assert.deepEqual([...d.doc.comments.map.keys()].sort(), [1, 2]);
    assert.ok(marks(d.doc).get(1).start, 'the parent\'s marks stay');
  });

  it('a ModelCheck failure inside a command is thrown, not taken ' +
    'for a refusal; the document is as it was', async () => {
    class Bad extends Document {
      apply(op, o) {
        if (op.op === 'addComment')
          return super.apply({...op, comment: {...op.comment,
            done: 'x'}}, o);
        return super.apply(op, o);
      }
    }
    const doc = await plain(p(r('Hello world')));
    const d = new Bad(doc), t = new Typing(d);
    const v = d.doc, depth = d.undoDepth, b = para(d);
    assert.throws(() => addComment(d, t, S.select(at(b, 0), at(b, 5)),
      {text: 'x', ...ANN}), RangeError);
    assert.equal(d.undoDepth, depth);
    assert.equal(partState(d.doc, 'comments'), 'missing');
    assert.equal(para(d).text, 'Hello world');
    assert.deepEqual(d.doc.rels, v.rels);
    assert.equal(d.doc.styles, v.styles);
  });

  it('names cut by code point; CommentOpts and the commands keep a ' +
    'name the same way', async () => {
    const emoji = '\u{1F600}';
    const a = 'a'.repeat(MAX_NAME - 1) + emoji + 'b';
    assert.equal(cleanName(a), 'a'.repeat(MAX_NAME - 1) + emoji);
    const c = 'a'.repeat(MAX_NAME) + emoji;
    assert.equal(cleanName(c), 'a'.repeat(MAX_NAME));
    const odd = 'x'.repeat(MAX_NAME - 1) + emoji;
    assert.ok(cleanName(odd).isWellFormed());
    assert.equal(cleanName(' A \t b\n\nc  '), 'A b c');
    const {d, t, sel} = await world();
    addComment(d, t, sel, {text: 'x', author: a, initials: ' A\tB ',
      date: WHEN});
    assert.equal(cmt(d, 0).author, cleanName(a));
    assert.equal(cmt(d, 0).initials, 'A B');
    assert.ok(cmt(d, 0).author.isWellFormed());
  });
});

describe('fix round 2: hostile documents refuse, never throw', () => {
  const full = (base, extra = {}) => {
    const parts = {'word/document.xml': documentXml(p(r('ab')))};
    for (let k = 1; k <= 1000; k++)
      parts['word/' + base + (k > 1 ? k : '') + '.xml'] = '<x/>';
    return {...parts, ...extra};
  };

  it('no free comments part name: addComment gives null, nothing ' +
    'changed', async () => {
    const {d, t} = await setup(readDocx(await buildDocx(
      full('comments'))));
    refused(d, () => addComment(d, t, S.caret(at(para(d), 1)),
      {text: 'x', ...ANN}));
    assert.equal(partState(d.doc, 'comments'), 'missing');
    assert.throws(() => ensure(d, ['comments']), Refused);
  });

  it('no free commentsExtended name: replyTo and setResolved give ' +
    'null, nothing changed', async () => {
    const c = (await import('./comment-fixtures.mjs'))
      .commentParts({0: 'zero'});
    const all = full('commentsExtended', {...c.parts,
      'word/document.xml': documentXml(p(range(0, r('a'))))});
    const {d, t} = await setup(readDocx(await buildDocx(all,
      {docRels: c.docRels})));
    assert.ok(cmt(d, 0));
    refused(d, () => setResolved(d, t, 0, true));
    refused(d, () => replyTo(d, t, 0, {text: 'x', ...ANN}));
    assert.equal(partState(d.doc, 'extended'), 'missing');
  });

  it('a part kept as bytes: ensure raises Refused (a RangeError)',
    async () => {
      const {d} = await setup(commentDoc(p(range(0, r('a'))),
        {0: 'zero'}, {parts: {'word/commentsExtended.xml': '<bad'},
        docRels: [['rX', EXT_REL, 'commentsExtended.xml']]}));
      const v = d.doc, depth = d.undoDepth;
      assert.throws(() => ensure(d, ['extended']), Refused);
      assert.equal(d.doc, v);
      assert.equal(d.undoDepth, depth);
      // a bad kind is the caller's error: a plain RangeError
      assert.throws(() => ensure(d, ['bogus']), (e) =>
        e instanceof RangeError && !(e instanceof Refused));
    });

  it('mark ids in parts kept as bytes: read with zeros and + ' +
    'skipped, every id attribute counted; unreadable ones give no ' +
    'new id (fail closed)', async () => {
    const next = async (marks) => {
      const glos = '<w:glossaryDocument xmlns:w="' + W_NS + '"><w:p>' +
        marks + '</w:p></w:glossaryDocument>';
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('x'))), 'word/glossary/document.xml': glos}));
      return nextCommentId(new Document(doc));
    };
    const ref = (v) => `<w:commentReference w:id="${v}"/>`;
    assert.equal(await next(ref('007')), 8);
    assert.equal(await next(ref('0000000000007')), 8);
    assert.equal(await next(ref('+7')), 8);
    assert.equal(await next(ref('0')), 1);
    assert.equal(await next(ref('2147483646')), 2147483647);
    // two id attributes: both taken
    assert.equal(await next('<w:commentRangeStart w:id="3" x:id="9"/>'),
      10);
    // ignored on purpose: no digit, or negative
    assert.equal(await next(ref('abc') + ref('-1')), 0);
    // unreadable: no new id at all
    for (const bad of [ref('12345678901234'), ref('7x'), ref(' 7'),
      ref('1e3'), '<w:commentReference w:id="7/>',
      '<w:commentReference w:id="7></w:commentReference>'])
      assert.equal(await next(bad), null, bad);
  });
});

const HAVE = existsSync(fileURLToPath(new URL('./corpus', import.meta.url)));
describe('the corpus: comments added, answered, resolved and deleted',
  {skip: HAVE ? false : SKIP_CORPUS}, () => {
  it('lint clean, xsd of the main part, undo gives the bytes',
    async () => {
      const files = (await commentFiles()).map((f) => f.path);
      const xsd = schemaChecker();
      await corpusRun(files, (d) => {
        const t = new Typing(d);
        let cmds = 0;
        const b = d.doc.sections[0].blocks.find((x) => x.type === 'p');
        if (b && addComment(d, t, S.caret(at(b, 0)), {text: 'new',
          ...ANN})) cmds++;
        const ids = [...d.doc.comments.map.keys()];
        for (const id of ids.slice(0, 2)) {
          const rp = replyTo(d, t, id, {text: 'reply', ...BOB});
          if (rp && rp.id !== undefined) cmds++;
          if (setResolved(d, t, id, true)) cmds++;
          if (editComment(d, t, id, {text: 'edited',
            confirmed: true}) === true) cmds++;
        }
        if (ids.length && deleteComment(d, t, ids[ids.length - 1]))
          cmds++;
        return {counts: {cmds}};
      }, typeof xsd === 'string' ? null : xsd,
      typeof xsd === 'string' ? xsd : '', 'commentcmd');
    });
});
