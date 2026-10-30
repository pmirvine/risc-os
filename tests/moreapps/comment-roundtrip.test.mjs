// Comments (Batch F1): the comments part and its companions
// (commentsExtended, commentsIds, commentsExtensible, people) read
// into doc.comments (CommentRead, CommentExt), written back
// (CommentWrite): untouched parts as their bytes, a changed comment
// rewritten keeping what it does not model, entries for comments we
// do not know kept, a part that cannot be modelled left as bytes,
// odd ids and parents never throwing. Marks stay opaque (Task 3).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readComments, readAllComments, parentOf} from
  '../../tools/moreapps/!Letters/CommentRead';
import {commentsTree, commentsOut, partsOf, readCommentsOf} from
  '../../tools/moreapps/!Letters/CommentWrite';
import {EXT_NS} from '../../tools/moreapps/!Letters/CommentExt';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkComments} from '../../tools/moreapps/!Letters/ModelCheck';
import {emptyDoc, newPara, emptyComments} from
  '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {serialize, parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS, CT_NS,
  STRICT_W_NS, STRICT_R_NS, STRICT_REL} from './build-docx.mjs';
import {freeze} from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {commentFiles} from './comment-oracle.mjs';
import {ALL, SKIP_CORPUS, CORPUS} from './roundtrip-lib.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const NOMAP = new Map();
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const W16CID = 'http://schemas.microsoft.com/office/word/2016/wordml/cid';
const W16CEX = 'http://schemas.microsoft.com/office/word/2018/wordml/cex';
const MS = 'http://schemas.microsoft.com/office/';
const OX = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const RELS = {
  extended: MS + '2011/relationships/commentsExtended',
  ids: MS + '2016/09/relationships/commentsIds',
  extensible: MS + '2018/08/relationships/commentsExtensible',
  people: MS + '2011/relationships/people'};
const NAMES = {comments: 'word/comments.xml',
  extended: 'word/commentsExtended.xml', ids: 'word/commentsIds.xml',
  extensible: 'word/commentsExtensible.xml', people: 'word/people.xml'};

const cm = (attrs, body) => `<w:comment ${attrs}>${body}</w:comment>`;
const pid = (id, runs = '') =>
  `<w:p w14:paraId="${id}" w14:textId="77777777">${runs}</w:p>`;
const commentsXml = (inner, root = 'comments', ns = W_NS) => DECL +
  `<w:${root} xmlns:w="${ns}" xmlns:w14="${W14}" xmlns:r="${R_NS}">` +
  `${inner}</w:${root}>`;
const CM = commentsXml(
  cm('w:id="0" w:author="Ann Smith" w:initials="AS" ' +
    'w:date="2024-01-02T03:04:00Z"',
  pid('00000001', r('first para')) + pid('0000000A', r('one'))) +
  cm('w:id="1" w:author="Bob" w:initials="B" ' +
    'w:date="2024-01-03T00:00:00Z"', pid('0000000B', r('reply'))) +
  cm('w:id="2" w:author="Ann Smith" w:initials="AS"',
    pid('0000000C', r('done one'))));
const cEx = (para, parent, done) => `<w15:commentEx w15:paraId=` +
  `"${para}"${parent ? ` w15:paraIdParent="${parent}"` : ''}` +
  ` w15:done="${done}"/>`;
const extXml = (inner) => DECL +
  `<w15:commentsEx xmlns:w15="${W15}">${inner}</w15:commentsEx>`;
const EXT = extXml(cEx('0000000A', null, 0) +
  cEx('0000000B', '0000000A', 0) + cEx('0000000C', null, 1) +
  cEx('DEADBEEF', null, 0));
const cId = (para, dur) => `<w16cid:commentId w16cid:paraId="${para}"` +
  ` w16cid:durableId="${dur}"/>`;
const IDS = DECL + `<w16cid:commentsIds xmlns:w16cid="${W16CID}">` +
  cId('0000000A', '11111111') + cId('0000000B', '22222222') +
  cId('0000000C', '33333333') + cId('DEADBEEF', '44444444') +
  '</w16cid:commentsIds>';
const cX = (dur) => `<w16cex:commentExtensible w16cex:durableId=` +
  `"${dur}" w16cex:dateUtc="2024-01-02T03:04:00Z"/>`;
const EXB = DECL + `<w16cex:commentsExtensible xmlns:w16cex=` +
  `"${W16CEX}">` + cX('11111111') + cX('22222222') + cX('33333333') +
  cX('44444444') + '</w16cex:commentsExtensible>';
const person = (a) => `<w15:person w15:author="${a}"><w15:presenceInfo` +
  ` w15:providerId="None" w15:userId="${a}"/></w15:person>`;
const PPL = DECL + `<w15:people xmlns:w15="${W15}">` +
  person('Ann Smith') + person('Bob') + person('Nobody') +
  '</w15:people>';
const cs = (id) => `<w:commentRangeStart w:id="${id}"/>`;
const ce = (id) => `<w:commentRangeEnd w:id="${id}"/>` +
  `<w:r><w:commentReference w:id="${id}"/></w:r>`;
const BODY = p(cs(0) + cs(1) + r('text') + ce(0) + ce(1)) +
  p(cs(2) + r('more') + ce(2));

/** A .docx with the given comment parts (null: left out). */
function docx(parts = {}, opts = {}) {
  const all = {comments: CM, extended: EXT, ids: IDS,
    extensible: EXB, people: PPL, ...parts};
  const files = {'word/document.xml': documentXml(opts.body || BODY,
    opts.ns)};
  const rel = opts.strict ? STRICT_REL : REL;
  const docRels = [];
  let k = 1;
  for (const [slot, text] of Object.entries(all)) {
    if (text === null || text === undefined) continue;
    files[NAMES[slot]] = text;
    docRels.push(['rIdC' + k++, slot === 'comments' ? rel('comments')
      : RELS[slot], NAMES[slot].slice(5)]);
  }
  return buildDocx({...files, ...(opts.extra || {})},
    {docRels, strict: opts.strict, contentTypes: opts.contentTypes});
}

const save = (doc) => writeDocx(doc, {date: DATE});
const part = async (bytes, n) => (await readZip(bytes)).get(n);
const text = (c) => c.blocks.map((b) => b.text).join('\n');
/** A Doc with comment `id` changed by `f(comment) -> comment`. */
const withComment = (doc, id, f) => ({...doc, comments: {
  ...doc.comments, map: new Map(doc.comments.map).set(id,
    f(doc.comments.map.get(id)))}});
const parsed = (b) => parseXml(dec(b)).root;
const lintErrors = async (bytes) => lintPackage(await readZip(bytes))
  .problems.filter((x) => x.level === 'error');

describe('reading comments', () => {
  it('reads author, initials, date, text, paraId of the last ' +
    'paragraph', async () => {
    const doc = await readDocx(await docx());
    const c = doc.comments;
    assert.deepEqual(c.order, [0, 1, 2]);
    assert.deepEqual(doc.meta.commentParts, NAMES);
    const a = c.map.get(0);
    assert.equal(a.id, 0);
    assert.equal(a.author, 'Ann Smith');
    assert.equal(a.initials, 'AS');
    assert.equal(a.date, '2024-01-02T03:04:00Z');
    assert.equal(text(a), 'first para\none');
    assert.equal(a.paraId, '0000000A');
    assert.equal(a.node.name, 'w:comment');
    assert.equal(a.rels, null);
    a.orig.forEach((b, i) => assert.equal(b, a.blocks[i]));
    assert.notEqual(a.orig, a.blocks);
    const two = c.map.get(2);
    assert.equal(two.date, null);
    assert.equal(c.root.name, 'w:comments');
    assert.deepEqual(c.raw.comments, []);
    checkComments(c);
  });

  it('reads with readComments alone, and without the companions',
    () => {
      const res = readComments({comments: {part: NAMES.comments,
        bytes: enc(CM)}}, NOMAP, null);
      assert.ok(res);
      assert.deepEqual([...res.map.keys()], [0, 1, 2]);
      assert.equal(res.map.get(1).parent, null);
      assert.equal(res.map.get(2).done, false);
      assert.equal(res.raw.extended, null);
      const none = readComments({}, NOMAP, null);
      assert.equal(none, null);
    });

  it('a comment holds the .rels of its part', () => {
    const rel = enc(DECL + '<Relationships xmlns="http://schemas.' +
      'openxmlformats.org/package/2006/relationships"><Relationship ' +
      'Id="rId1" Type="x" Target="y"/></Relationships>');
    const res = readComments({comments: {part: NAMES.comments,
      bytes: enc(CM)}}, NOMAP, rel,
    {relsPart: 'word/_rels/comments.xml.rels'});
    assert.equal(res.rels.length, 1);
    assert.equal(res.map.get(1).rels, res.rels);
    assert.equal(res.map.get(1).relsPart,
      'word/_rels/comments.xml.rels');
  });

  it('threads replies from commentsExtended paraIdParent and done',
    async () => {
      const doc = await readDocx(await docx());
      const m = doc.comments.map;
      assert.equal(m.get(0).parent, null);
      assert.equal(m.get(1).parent, 0);
      assert.equal(m.get(2).parent, null);
      assert.equal(m.get(0).done, false);
      assert.equal(m.get(2).done, true);
      assert.equal(parentOf(doc, 1), 0);
      assert.equal(parentOf(doc, 0), null);
      assert.equal(parentOf(doc, 99), null);
      assert.equal(doc.comments.raw.extended.items.length, 4);
      assert.equal(doc.comments.raw.people.items.length, 3);
    });

  it('done="true" is done; a reply to a reply keeps its parent',
    async () => {
      const ext = extXml(cEx('0000000A', null, 'true') +
        cEx('0000000B', '0000000A', 0) +
        cEx('0000000C', '0000000B', 0));
      const doc = await readDocx(await docx({extended: ext}));
      assert.equal(doc.comments.map.get(0).done, true);
      assert.equal(doc.comments.map.get(2).parent, 1);
    });
});

describe('a part the reader cannot model stays bytes', () => {
  const read = (xml, opts) => readComments({comments: {
    part: NAMES.comments, bytes: typeof xml === 'string' ? enc(xml)
      : xml}}, NOMAP, null, opts);
  it('is null, never a throw (bad XML, root, caps)', () => {
    assert.equal(read('<w:comments'), null);
    assert.equal(read(new Uint8Array(0)), null);
    assert.equal(read('not xml at all'), null);
    assert.equal(read(commentsXml(cm('w:id="1"', p()), 'footnotes')),
      null);
    assert.equal(read(commentsXml(cm('w:id="1"', p() +
      '<w:sectPr/>'))), null);
    assert.equal(readComments({comments: {part: NAMES.comments,
      bytes: 'text'}}, NOMAP, null), null);
    assert.equal(read(commentsXml(cm('w:id="1"', p()), 'comments',
      'http://example.com/other')), null);
    assert.equal(read(CM, {maxXmlBytes: 20}), null);
    assert.equal(read(CM, {maxElements: 5}), null);
    assert.equal(read(CM, {maxParagraphs: 2}), null);
    assert.equal(readComments(null, NOMAP, null), null);
  });

  for (const [what, xml, opts] of [
    ['bad XML', '<w:comments', undefined],
    ['root not w:comments', commentsXml(cm('w:id="0"', p(r('x'))),
      'hdr'), undefined],
    ['over caps', CM, {maxParagraphs: 3}]]) {
    it('keeps the parts in doc.parts and the marks opaque: ' + what,
      async () => {
        const bytes = await docx({comments: xml});
        const doc = await readDocx(bytes, opts);
        assert.equal(doc.comments.map.size, 0);
        assert.equal(doc.meta.commentParts.comments, undefined);
        assert.ok(doc.parts.has(NAMES.comments));
        const inl = Object.values(doc.sections[0].blocks[0].inlines);
        assert.ok(inl.length > 0);
        assert.ok(inl.every((x) => x.kind === 'raw'));
        const out = await save(doc);
        for (const n of Object.values(NAMES))
          assert.deepEqual(await part(out, n), await part(bytes, n));
      });
  }

  it('a companion that cannot be read stays bytes, the comments ' +
    'are read', async () => {
    const bad = '<w15:commentsEx xmlns:w15="' + W15 + '">';
    const wrong = DECL + `<w15:people xmlns:w15="${W15}"/>`;
    const bytes = await docx({extended: bad, ids: wrong});
    const doc = await readDocx(bytes);
    assert.equal(doc.comments.map.size, 3);
    assert.equal(doc.comments.raw.extended, null);
    assert.equal(doc.comments.raw.ids, null);
    assert.equal(doc.comments.map.get(1).parent, null);
    const out = await save(withComment(doc, 0, (c) => ({...c,
      done: true, blocks: [newPara('x')]})));
    assert.equal(dec(await part(out, NAMES.extended)), bad);
    assert.equal(dec(await part(out, NAMES.ids)), wrong);
  });
});

describe('writing comments', () => {
  it('untouched comment parts are written as read (tree and ' +
    'per-node string)', async () => {
    const bytes = await docx();
    const doc = await readDocx(bytes);
    const out = await save(doc);
    for (const n of Object.values(NAMES))
      assert.deepEqual(await part(out, n), await part(bytes, n), n);
    const got = partsOf(doc);
    for (const k of Object.keys(NAMES))
      assert.ok(got[k] instanceof Uint8Array, k);
    const tree = commentsTree(doc);
    const s = serialize(tree, {decl: null, before: [], after: []});
    const per = [...doc.comments.map.values()].map((c) =>
      serialize(c.node, {decl: null, before: [], after: []})).join('');
    assert.ok(s.includes(per));
    assert.equal(tree.children.length, 3);
    assert.deepEqual(await lintErrors(out), []);
  });

  it('a copy of the Doc with untouched comments writes the bytes',
    async () => {
      const doc = await readDocx(await docx());
      const copy = {...doc, comments: {...doc.comments,
        map: new Map(doc.comments.map), order: [...doc.comments.order]}};
      const out = await save(copy);
      assert.deepEqual(await part(out, NAMES.comments), enc(CM));
      assert.deepEqual(await part(out, NAMES.extended), enc(EXT));
    });

  it('a changed comment is rewritten and keeps unknown attributes ' +
    'and children', async () => {
    const odd = commentsXml(cm('w:id="0" w:author="A" w:rsid="00AB" ' +
      'x:flag="y" xmlns:x="urn:x"', pid('0000000A', r('keep')) +
      '<w:sdt><w:sdtContent/></w:sdt>') +
      cm('w:id="1" w:author="B"', pid('0000000B', r('other'))));
    const doc = await readDocx(await docx({comments: odd}));
    const c = doc.comments.map.get(0);
    assert.equal(c.blocks[1].type, 'opaque');
    const out = await save(withComment(doc, 0, (x) => ({...x,
      author: 'Zed', blocks: [newPara('changed'), x.blocks[1]]})));
    const t = dec(await part(out, NAMES.comments));
    assert.match(t, /<w:comment [^>]*w:rsid="00AB"/);
    assert.match(t, /x:flag="y"/);
    assert.match(t, /w:author="Zed"/);
    assert.match(t, /<w:sdt>/);
    assert.match(t, /changed/);
    assert.ok(!t.includes('keep'));
    const back = await readDocx(out);
    const b0 = back.comments.map.get(0);
    assert.equal(b0.blocks[0].text, 'changed');
    assert.equal(b0.author, 'Zed');
    // the comment's paraId goes on its new last paragraph
    assert.equal(b0.paraId, '0000000A');
    assert.equal(back.comments.map.get(1).blocks[0].text, 'other');
    assert.equal(back.comments.map.get(1).parent, 0);
    assert.deepEqual(await part(out, NAMES.extended), enc(EXT));
    assert.deepEqual(await lintErrors(out), []);
  });

  it('a comment with no node is made; an empty one gets a paragraph',
    async () => {
      const doc = await readDocx(await docx());
      const map = new Map(doc.comments.map);
      map.set(7, {id: 7, author: 'New', initials: 'N',
        date: '2024-05-06T07:08:00Z', blocks: [newPara('new')],
        rels: null, relsPart: null, paraId: '0000ABCD', parent: 0,
        done: false, orig: [], node: null});
      map.set(2, {...map.get(2), blocks: []});
      const comments = {...doc.comments, map,
        order: [...doc.comments.order, 7]};
      checkComments(comments);
      const out = await save({...doc, comments});
      const back = await readDocx(out);
      const n = back.comments.map.get(7);
      assert.equal(n.author, 'New');
      assert.equal(n.initials, 'N');
      assert.equal(n.date, '2024-05-06T07:08:00Z');
      assert.equal(n.paraId, '0000ABCD');
      assert.equal(n.parent, 0);
      assert.equal(back.comments.map.get(2).blocks.length, 1);
      assert.equal(back.comments.map.get(2).paraId, '0000000C');
      assert.deepEqual(await lintErrors(out), []);
    });

  it('entries in extended/ids/extensible/people for unknown comments ' +
    'are kept', async () => {
    const bytes = await docx();
    const doc = await readDocx(bytes);
    // resolve comment 0, drop comment 1 (the reply), keep 2
    const map = new Map(doc.comments.map);
    map.set(0, {...map.get(0), done: true});
    map.delete(1);
    const out = await save({...doc, comments: {...doc.comments, map,
      order: [0, 2]}});
    const ex = dec(await part(out, NAMES.extended));
    assert.match(ex, /w15:paraId="0000000A" w15:done="1"/);
    assert.ok(!ex.includes('0000000B'));
    assert.match(ex, /w15:paraId="0000000C" w15:done="1"/);
    assert.match(ex, /w15:paraId="DEADBEEF" w15:done="0"/);
    const ids = dec(await part(out, NAMES.ids));
    assert.ok(!ids.includes('0000000B'));
    assert.match(ids, /DEADBEEF/);
    assert.match(ids, /0000000A/);
    const exb = dec(await part(out, NAMES.extensible));
    assert.ok(!exb.includes('22222222'));
    assert.match(exb, /44444444/);
    assert.match(exb, /11111111/);
    assert.deepEqual(await part(out, NAMES.people),
      await part(bytes, NAMES.people));
    const back = await readDocx(out);
    assert.equal(back.comments.map.get(0).done, true);
    assert.deepEqual(back.comments.order, [0, 2]);
  });

  it('a new reply and a changed paraId reach commentsExtended and ' +
    'commentsIds', async () => {
    const doc = await readDocx(await docx());
    const map = new Map(doc.comments.map);
    map.set(2, {...map.get(2), parent: 0, paraId: '0000FFFF'});
    map.set(5, {id: 5, author: 'C', initials: 'C', date: null,
      blocks: [newPara('r')], rels: null, relsPart: null,
      paraId: '00005555', parent: 0, done: false, orig: [],
      node: null});
    const out = await save({...doc, comments: {...doc.comments, map,
      order: [0, 1, 2, 5]}});
    const ex = dec(await part(out, NAMES.extended));
    const has = (t, s) => assert.ok(t.includes(s), s);
    has(ex, 'w15:paraId="0000FFFF" w15:paraIdParent="0000000A"');
    has(ex, 'w15:paraId="00005555" w15:paraIdParent="0000000A" ' +
      'w15:done="0"');
    assert.ok(!ex.includes('0000000C'));
    const ids = dec(await part(out, NAMES.ids));
    has(ids, 'w16cid:paraId="0000FFFF" w16cid:durableId="33333333"');
    const back = await readDocx(out);
    assert.equal(back.comments.map.get(2).parent, 0);
    assert.equal(back.comments.map.get(2).paraId, '0000FFFF');
    assert.equal(back.comments.map.get(5).parent, 0);
  });

  it('a reply follows its parent: a changed paraId, a parent gone',
    async () => {
      const doc = await readDocx(await docx());
      // the parent's paraId changes: the reply's entry names the new
      const moved = withComment(doc, 0, (c) => ({...c,
        paraId: '0000FFFF'}));
      const ex = dec(await part(await save(moved), NAMES.extended));
      assert.ok(ex.includes('w15:paraId="0000000B" ' +
        'w15:paraIdParent="0000FFFF"'), ex);
      assert.ok(!ex.includes('"0000000A"'));
      const back = await readDocx(await save(moved));
      assert.equal(back.comments.map.get(1).parent, 0);
      // the parent goes: the reply's entry loses paraIdParent (top
      // level), nothing names a paraId that is not there
      const map = new Map(doc.comments.map);
      map.delete(0);
      const out = await save({...doc, comments: {...doc.comments,
        map, order: [1, 2]}});
      const ex2 = dec(await part(out, NAMES.extended));
      assert.ok(!ex2.includes('0000000A'), ex2);
      assert.ok(ex2.includes('<w15:commentEx w15:paraId="0000000B" ' +
        'w15:done="0"/>'), ex2);
      const back2 = await readDocx(out);
      assert.equal(back2.comments.map.get(1).parent, null);
    });

  it('a rewritten comment holds each paraId once', async () => {
    const doc = await readDocx(await docx());
    const c0 = doc.comments.map.get(0);
    // a paragraph appended after the one holding the paraId, and a
    // copy of a paragraph with the same paraId
    const out = await save(withComment(doc, 0, (c) => ({...c,
      blocks: [...c.blocks, c.blocks[1], newPara('added')]})));
    const t = dec(await part(out, NAMES.comments));
    assert.equal(t.split('w14:paraId="0000000A"').length - 1, 1);
    assert.equal(t.split('w14:paraId="00000001"').length - 1, 1);
    const back = (await readDocx(out)).comments.map.get(0);
    assert.equal(back.paraId, '0000000A');
    assert.equal(back.blocks.length, 4);
    assert.equal(back.blocks[3].text, 'added');
    assert.equal(c0.blocks.length, 2);
    const ids = [];
    parsed(await part(out, NAMES.comments)).children.forEach((n) => {
      if (typeof n !== 'object') return;
      for (const p of n.children || []) {
        const a = (p.attrs || []).find(([k]) => k === 'w14:paraId');
        if (a) ids.push(a[1]);
      }
    });
    assert.equal(new Set(ids).size, ids.length);
  });

  it('never mutates a live Doc', async () => {
    const doc = freeze(await readDocx(await docx()));
    await save(withComment(doc, 0, (c) => ({...c, done: true,
      blocks: [newPara('z')]})));
    await save(doc);
  });

  it('a Doc made elsewhere may omit comments', async () => {
    const d = emptyDoc();
    assert.deepEqual(readCommentsOf({}).map, new Map());
    assert.deepEqual(readCommentsOf(d), emptyComments());
    delete d.comments;
    const out = await save(d);
    assert.ok(out.length > 0);
    checkComments(undefined);
    assert.equal(commentsOut({meta: {}, comments: undefined})
      .parts.size, 0);
    assert.equal(commentsTree({}), null);
    assert.equal(parentOf({}, 1), null);
    assert.equal(parentOf(null, 1), null);
    const p0 = partsOf({meta: {}});
    assert.deepEqual(Object.values(p0), [null, null, null, null, null]);
  });
});

describe('odd ids and parents', () => {
  it('duplicate ids first wins others kept raw', async () => {
    const x = commentsXml(cm('w:id="1" w:author="A"',
      pid('00000001', r('first'))) + cm('w:id="1" w:author="B"',
      pid('00000002', r('second'))) + cm('w:id="2" w:author="C"',
      pid('00000003', r('c'))));
    const bytes = await docx({comments: x, extended: null, ids: null,
      extensible: null, people: null});
    const doc = await readDocx(bytes);
    assert.equal(text(doc.comments.map.get(1)), 'first');
    assert.deepEqual(doc.comments.order, [1, 2]);
    assert.equal(doc.comments.raw.comments.length, 1);
    assert.equal(doc.comments.raw.comments[0].at, 1);
    const out = await save(withComment(doc, 2, (c) => ({...c,
      blocks: [newPara('edit')]})));
    const t = dec(await part(out, NAMES.comments));
    assert.ok(t.indexOf('first') < t.indexOf('second'));
    assert.ok(t.indexOf('second') < t.indexOf('edit'));
    assert.deepEqual(await part(await save(doc), NAMES.comments),
      enc(x));
  });

  it('a reply naming itself or a cycle or a missing parent reads as ' +
    'top level', async () => {
    const x = commentsXml(['A', 'B', 'C', 'D', 'E'].map((k, i) =>
      cm(`w:id="${i}" w:author="${k}"`, pid('0000000' + k,
        r(k)))).join(''));
    const ext = extXml(cEx('0000000A', '0000000A', 0) +
      cEx('0000000B', '0000000C', 0) + cEx('0000000C', '0000000B', 0) +
      cEx('0000000D', '0BADBAD0', 0) + cEx('0000000E', '0000000C', 0));
    const bytes = await docx({comments: x, extended: ext});
    const doc = await readDocx(bytes);
    const m = doc.comments.map;
    assert.equal(m.get(0).parent, null);
    // the cycle B <-> C is broken at its first member: C replies to B
    assert.equal(m.get(1).parent, null);
    assert.equal(m.get(2).parent, 1);
    assert.equal(m.get(3).parent, null);
    assert.equal(m.get(4).parent, 2);
    for (const id of [0, 1, 2, 3, 4]) parentOf(doc, id);
    // untouched: the part keeps its odd entries
    const out = await save(doc);
    assert.deepEqual(await part(out, NAMES.extended), enc(ext));
    // a model made elsewhere with a cycle: parentOf never hangs
    const map = new Map(m);
    map.set(0, {...m.get(0), parent: 1});
    map.set(1, {...m.get(1), parent: 0});
    map.set(3, {...m.get(3), parent: 3});
    map.set(4, {...m.get(4), parent: 77});
    const d2 = {...doc, comments: {...doc.comments, map}};
    assert.equal(parentOf(d2, 0), null);
    assert.equal(parentOf(d2, 1), null);
    assert.equal(parentOf(d2, 3), null);
    assert.equal(parentOf(d2, 4), null);
    // 2 replies to 1, which is in a cycle that does not hold 2
    assert.equal(parentOf(d2, 2), 1);
    const out2 = await save(d2);
    assert.ok(out2.length > 0);
  });

  /** A chain of n comments, each replying to the one before. */
  const chain = (n) => {
    let body = '', ext = '';
    const h = (i) => i.toString(16).padStart(8, '0');
    for (let i = 0; i < n; i++) {
      body += cm(`w:id="${i}" w:author="A"`, pid(h(i)));
      ext += cEx(h(i), i ? h(i - 1) : null, 0);
    }
    return {comments: {part: NAMES.comments,
      bytes: enc(commentsXml(body))},
    extended: {part: NAMES.extended, bytes: enc(extXml(ext))}};
  };
  /** The best of three times of f(), in ms (at least 5). */
  const best = (f) => {
    let t = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      f();
      t = Math.min(t, performance.now() - t0);
    }
    return Math.max(t, 5);
  };
  // linear: about 10 times the time for 10 times the comments; a
  // quadratic walk would be about 100 times
  it('a long chain of replies reads in linear time', () => {
    const small = chain(1000), big = chain(10000);
    const res = readComments(big, NOMAP, null);
    assert.equal(res.map.size, 10000);
    assert.equal(res.map.get(9999).parent, 9998);
    const a = best(() => readComments(small, NOMAP, null));
    const b = best(() => readComments(big, NOMAP, null));
    assert.ok(b / a < 40, `read ${a} ms -> ${b} ms`);
  });

  it('a long chain with every comment changed writes in linear time',
    () => {
      const doc = (parts) => {
        const c = readComments(parts, NOMAP, null);
        const map = new Map([...c.map].map(([id, x]) =>
          [id, {...x, done: true}]));
        return {meta: {commentParts: {comments: NAMES.comments,
          extended: NAMES.extended}}, comments: {...c, map}};
      };
      const small = doc(chain(1000)), big = doc(chain(10000));
      const got = partsOf(big);
      const t = serialize(got.extended, {decl: null, before: [],
        after: []});
      assert.equal((t.match(/w15:done="1"/g) || []).length, 10000);
      assert.equal((t.match(/paraIdParent/g) || []).length, 9999);
      const a = best(() => partsOf(small));
      const b = best(() => partsOf(big));
      assert.ok(b / a < 40, `write ${a} ms -> ${b} ms`);
    });

  it('non-integer ids, __proto__ as an attribute', async () => {
    const bad = ['w:id="x"', '', 'w:id="__proto__"',
      'w:id="99999999999999999999"', 'w:id="1.5"', 'w:id=""',
      'w:id="-"', 'w:id=" 3"'];
    const x = commentsXml(bad.map((a) => cm(a, p(r('t')))).join('') +
      cm('w:id="5" w:author="__proto__" w:initials="constructor"',
        pid('__proto__', r('ok'))) + '<w:other/>');
    const ext = extXml(cEx('__proto__', '__proto__', 1) +
      cEx('constructor', '__proto__', 0) + '<w15:other/>');
    const ppl = DECL + `<w15:people xmlns:w15="${W15}">` +
      person('__proto__') + '</w15:people>';
    const bytes = await docx({comments: x, extended: ext, people: ppl,
      ids: null, extensible: null});
    const doc = await readDocx(bytes);
    assert.deepEqual([...doc.comments.map.keys()], [5]);
    const c = doc.comments.map.get(5);
    assert.equal(c.author, '__proto__');
    assert.equal(c.paraId, '__proto__');
    assert.equal(c.parent, null);
    assert.equal(c.done, true);
    assert.equal(doc.comments.raw.comments.length, bad.length + 1);
    assert.equal(Object.getPrototypeOf(doc.comments.map),
      Map.prototype);
    assert.equal({}.paraId, undefined);
    const out0 = await save(doc);
    assert.deepEqual(await part(out0, NAMES.comments), enc(x));
    const out = await save(withComment(doc, 5, (y) => ({...y,
      done: false, blocks: [newPara('e')]})));
    const t = dec(await part(out, NAMES.comments));
    assert.match(t, /w:id="__proto__"/);
    assert.match(t, /<w:other\/>/);
    assert.equal((t.match(/<w:comment[ >]/g) || []).length,
      bad.length + 1);
    const e = dec(await part(out, NAMES.extended));
    assert.match(e, /<w15:other\/>/);
    assert.match(e, /w15:paraId="constructor"/);
  });
});

describe('Strict documents', () => {
  it('reads Strict comments and writes an untouched one as read, a ' +
    'changed one Strict', async () => {
    const x = commentsXml(cm('w:id="0" w:author="S" w:initials="S"',
      pid('0000000A', r('s'))), 'comments', STRICT_W_NS)
      .replace(R_NS, STRICT_R_NS);
    const ext = extXml(cEx('0000000A', null, 1));
    const bytes = await docx({comments: x, extended: ext, ids: null,
      extensible: null, people: null}, {strict: true,
      ns: {ns: STRICT_W_NS, rNs: STRICT_R_NS}});
    const doc = await readDocx(bytes);
    assert.equal(doc.meta.conformance, 'strict');
    const c = doc.comments.map.get(0);
    assert.equal(text(c), 's');
    assert.equal(c.author, 'S');
    assert.equal(c.paraId, '0000000A');
    assert.equal(c.done, true);
    assert.deepEqual(await part(await save(doc), NAMES.comments),
      enc(x));
    const out = await save(withComment(doc, 0, (y) => ({...y,
      blocks: [newPara('ch')], done: false})));
    const t = dec(await part(out, NAMES.comments));
    assert.ok(t.includes(STRICT_W_NS));
    assert.ok(!t.includes(W_NS));
    assert.match(dec(await part(out, NAMES.extended)),
      /w15:done="0"/);
    const back = await readDocx(out);
    assert.equal(text(back.comments.map.get(0)), 'ch');
    assert.equal(back.comments.map.get(0).paraId, '0000000A');
  });
});

describe('content types', () => {
  const types = async (bytes) => {
    const root = parsed(await part(bytes, '[Content_Types].xml'));
    const out = new Map();
    for (const c of root.children) {
      if (typeof c !== 'object' || c.name !== 'Override') continue;
      const a = new Map(c.attrs);
      out.set(a.get('PartName'), a.get('ContentType'));
    }
    return out;
  };
  it('people.xml and the others keep or get their own type',
    async () => {
      // typed only by the xml Default: the writer gives each its own
      const doc = await readDocx(await docx());
      const t = await types(await save(withComment(doc, 0, (c) => ({
        ...c, done: true}))));
      assert.equal(t.get('/word/people.xml'), OX + 'people+xml');
      assert.equal(t.get('/word/commentsExtended.xml'),
        OX + 'commentsExtended+xml');
      assert.equal(t.get('/word/commentsIds.xml'),
        OX + 'commentsIds+xml');
      assert.equal(t.get('/word/commentsExtensible.xml'),
        OX + 'commentsExtensible+xml');
      assert.equal(t.get('/word/comments.xml'), OX + 'comments+xml');
      // typed by Overrides as Word does: kept as they are
      const ov = Object.entries(NAMES).map(([k, n]) =>
        `<Override PartName="/${n}" ContentType="${OX}` +
        `${k === 'extended' ? 'commentsExtended' : k === 'ids'
          ? 'commentsIds' : k === 'extensible' ? 'commentsExtensible'
            : k}+xml"/>`).join('');
      const ct = DECL + `<Types xmlns="${CT_NS}"><Default Extension=` +
        '"rels" ContentType="application/vnd.openxmlformats-package.' +
        'relationships+xml"/><Default Extension="xml" ContentType=' +
        '"application/xml"/><Override PartName="/word/document.xml" ' +
        `ContentType="${OX}document.main+xml"/>${ov}</Types>`;
      const bytes = await docx({}, {extra: {'[Content_Types].xml': ct}});
      const out = await save(await readDocx(bytes));
      // (a styles part is added: the fixture has none)
      const got = await types(out);
      got.delete('/word/styles.xml');
      assert.deepEqual(got, await types(bytes));
      assert.deepEqual(await lintErrors(out), []);
    });
});

describe('checkComments', () => {
  it('refuses a malformed comments object', () => {
    checkComments(emptyComments());
    assert.throws(() => checkComments(5));
    assert.throws(() => checkComments({map: 3}));
    const c = emptyComments();
    c.map.set(1, {id: 2, blocks: [], orig: []});
    assert.throws(() => checkComments(c));
    const d = emptyComments();
    d.map.set(1, {id: 1, author: '', initials: '', date: null,
      blocks: [], orig: [], paraId: null, parent: null, done: false});
    assert.throws(() => checkComments(d));
    d.order.push(1);
    checkComments(d);
    d.order.push(1);
    assert.throws(() => checkComments(d));
  });
});

const HAVE = existsSync(CORPUS);

describe('the corpus', {skip: HAVE ? false : SKIP_CORPUS}, () => {
  it('the 92 corpus files: open/save leaves the comment parts ' +
    'tree-identical', async () => {
    const files = await commentFiles();
    let docs = 0, comments = 0, replies = 0, resolved = 0,
      rewritten = 0;
    const fails = [];
    for (const {file, path} of files) {
      const bytes = readFileSync(path);
      let doc;
      try {
        doc = await readDocx(bytes);
      } catch (e) {
        fails.push(file + ': ' + e.message.slice(0, 200));
        continue;
      }
      docs++;
      try {
        const cs = doc.comments;
        if (!doc.meta.commentParts.comments)
          fails.push(file + ': comments not modelled');
        comments += cs.map.size;
        for (const c of cs.map.values()) {
          if (c.parent !== null) replies++;
          if (c.done) resolved++;
        }
        const was = await readZip(bytes);
        const now = await readZip(await save(doc));
        for (const n of Object.values(doc.meta.commentParts)) {
          const a = was.get(n), b = now.get(n);
          if (!b || Buffer.compare(Buffer.from(a), Buffer.from(b)))
            fails.push(file + ': ' + n + ' changed');
        }
        // every comment rewritten from its blocks reads back the same
        const map = new Map([...cs.map].map(([id, c]) =>
          [id, {...c, node: null}]));
        const out = await save({...doc, comments: {...cs, map}});
        const back = (await readDocx(out)).comments;
        rewritten += map.size;
        for (const [id, c] of cs.map) {
          const b = back.map.get(id);
          if (!b || text(b) !== text(c) || b.author !== c.author ||
            b.initials !== c.initials || b.date !== c.date ||
            b.paraId !== c.paraId || b.parent !== c.parent ||
            b.done !== c.done) {
            fails.push(file + ': comment ' + id + ' differs');
            break;
          }
        }
        for (const x of await lintErrors(out))
          fails.push(file + ': lint ' + x.rule + ' ' + x.part);
      } catch (e) {
        fails.push(file + ': ' + e.message.slice(0, 200));
      }
    }
    console.log(`# comments corpus${ALL ? '' : ' (sample)'}: ${docs} ` +
      `files, ${comments} comments, ${replies} replies, ${resolved} ` +
      `resolved, ${rewritten} rewritten, ${fails.length} failures`);
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    if (ALL) {
      // the oracle counts 1107 comments and 415 replies: Comment040
      // has two comments with id 0 (the second is kept raw) and a
      // reply to that second one (read as top level)
      assert.equal(docs, 92);
      assert.equal(comments, 1106);
      assert.equal(replies, 414);
      assert.equal(resolved, 82);
    }
  });
});
