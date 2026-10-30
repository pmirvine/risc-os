// Comments on the clipboard (Batch F1): a copy or cut carries, by
// value, the comments whose marks it holds whole (start, end and
// reference: ./ClipSlice comments, ./ClipComments commentsOf); a
// paste makes a NEW comment for each, with a fresh id
// (./CommentParts nextCommentId) and a fresh w14:paraId, in the
// same undo step as its marks; replies keep their parent (the new
// one); the comments part is made when the target has none; a
// partial range, HTML and plain text bring no mark; a paste into a
// header or a note drops the marks; hostile payloads never throw.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {clean} from '../../tools/moreapps/!Letters/ClipClean';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {ClipStore, MARK, LIMITS}
  from '../../tools/moreapps/!Letters/ClipStore';
import {MAX_NAME} from '../../tools/moreapps/!Letters/ClipComments';
import {pick} from '../../tools/moreapps/!Letters/ClipPick';
import {cutSelection, pasteBlocks, pastePlain}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {checkComments} from '../../tools/moreapps/!Letters/ModelCheck';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {paraMarks} from '../../tools/moreapps/!Letters/CommentMarks';
import {parentsOf} from '../../tools/moreapps/!Letters/CommentRead';
import {partState, takenIds}
  from '../../tools/moreapps/!Letters/CommentParts';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, p, r, REL, W_NS}
  from './build-docx.mjs';
import {commentDoc, range, cs, ce, cr} from './comment-fixtures.mjs';
import {R_NS} from './build-docx.mjs';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {parseHtml} from './html-fake.mjs';
import {schemaChecker, corpusRun, SKIP_CORPUS}
  from './roundtrip-lib.mjs';
import {commentFiles} from './comment-oracle.mjs';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const para = (d, i = 0) => d.doc.sections[0].blocks[i];
const at = (b, off) => ({id: b.id, off});
const span = (a, b) => S.select(a, b);
const cmap = (d) => d.doc.comments.map;
const cmt = (d, id) => cmap(d).get(id);
const textOf = (c) => c.blocks.map((b) => b.text.split(OBJ).join(''))
  .join('|');
const dec = new TextDecoder();

/** The body's comment marks in order: [kind, id]. */
function bodyMarks(d) {
  const out = [];
  scan(d.doc, (b) => {
    if (b.type !== 'p') return;
    for (const m of paraMarks(b)) out.push([m.kind, m.id]);
  });
  return out;
}

/** Every comment of the body has its three marks, every mark a
 *  comment; the model checks; no parent cycle. */
function whole(d) {
  const seen = new Map();
  for (const [k, id] of bodyMarks(d)) {
    if (!seen.has(id)) seen.set(id, new Set());
    assert.ok(!seen.get(id).has(k), 'two ' + k + ' of ' + id);
    seen.get(id).add(k);
  }
  for (const [id, ks] of seen) {
    assert.ok(cmap(d).has(id), 'a mark names no comment: ' + id);
    assert.ok(ks.has('cmtRef'), 'no reference for ' + id);
    assert.equal(ks.has('cmtStart'), ks.has('cmtEnd'),
      'a half range for ' + id);
  }
  checkComments(d.doc.comments);
  const ps = parentsOf(d.doc);
  for (const id of ps.keys()) {
    let x = id;
    for (let k = 0; k <= ps.size + 1 && ps.has(x); k++) x = ps.get(x);
    assert.ok(!ps.has(x), 'a parent cycle from ' + id);
  }
}

/** pasteBlocks' options for slice s. */
const optsOf = (s, sameDoc, extra = {}) => ({sameDoc,
  styleNames: s.styleNames, styles: s.styles, lists: s.lists,
  pics: s.pics, picScope: s.picScope, notes: s.notes,
  comments: s.comments, ...extra});

const setup = async (doc) => ({d: new Document(await doc)});

/** "a[bc]d" (comment 1 'one' on bc) / "xy": offsets a0 s1 b2 c3 e4
 *  r5 d6. */
const one = () => commentDoc(p(r('a') + range(1, r('bc')) + r('d')) +
  p(r('xy')), {1: {text: 'one', author: 'Ann'}});

/** Comment 1 with reply 2 inside it: a0 s1 s2' b3 c4 e2' e1 r1 r2'
 *  d9. */
const thread = () => commentDoc(p(r('a') + cs(1) + cs(2) + r('bc') +
  ce(2) + ce(1) + cr(1) + cr(2) + r('d')) + p(r('xy')),
{1: {text: 'one', author: 'Ann'}, 2: {text: 'two', author: 'Bob',
  parent: 1}});

/** The saved package read back, and its lint errors. */
async function saved(d) {
  const bytes = await writeDocx(d.doc, {date: new Date(0)});
  const z = await readZip(bytes);
  const errors = lintPackage(z).problems.filter((q) =>
    q.level === 'error').map((q) => q.rule + ' ' + q.detail);
  const xml = (n) => (z.get(n) ? dec.decode(z.get(n)) : null);
  return {back: await readDocx(bytes), errors, xml};
}

describe('the slice carries comments', () => {
  it('no mark: no comments key (as before)', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d, 1), 0), at(para(d, 1), 2)));
    assert.ok(!('comments' in s));
  });

  it('a whole range: the comment by value, its text nowhere in plain',
    async () => {
      const {d} = await setup(one());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
      assert.deepEqual(s.comments.map((e) => e.id), [1]);
      assert.equal(s.comments[0].comment, cmt(d, 1));
      assert.equal(s.plain, 'abcd');
    });

  it('a partial range (start, not end or reference): nothing carried',
    async () => {
      const {d} = await setup(one());
      for (const [a, z] of [[0, 3], [2, 7], [0, 5]]) {
        const s = slice(d.doc, span(at(para(d), a), at(para(d), z)));
        assert.ok(!('comments' in s), a + '..' + z);
      }
    });

  it('a thread: parent and reply, in order', async () => {
    const {d} = await setup(thread());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 10)));
    assert.deepEqual(s.comments.map((e) => e.id), [1, 2]);
  });
});

describe('copy and paste in the same document', () => {
  it('a NEW comment (fresh id, paraId), marks remapped, one step',
    async () => {
      const {d} = await setup(one());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
      const taken = takenIds(d.doc);
      const before = d.doc, depth = d.undoDepth;
      pasteBlocks(d, S.caret(at(para(d, 1), 2)), s.blocks,
        optsOf(s, true));
      assert.equal(d.undoDepth, depth + 1, 'one step');
      assert.equal(para(d, 1).text, 'xya' + OBJ + 'bc' + OBJ + OBJ +
        'd');
      assert.deepEqual([...cmap(d).keys()], [1, 2]);
      const c = cmt(d, 2), o = cmt(d, 1);
      assert.equal(textOf(c), 'one');
      assert.equal(c.author, o.author);
      assert.equal(c.initials, o.initials);
      assert.equal(c.date, o.date);
      assert.equal(c.done, false);
      assert.equal(c.parent, null);
      assert.match(c.paraId, /^[0-9A-F]{8}$/);
      assert.ok(!taken.has(c.paraId), 'paraId fresh');
      assert.notEqual(c.blocks[0].id, o.blocks[0].id);
      assert.deepEqual(bodyMarks(d), [['cmtStart', 1], ['cmtEnd', 1],
        ['cmtRef', 1], ['cmtStart', 2], ['cmtEnd', 2], ['cmtRef', 2]]);
      whole(d);
      d.undo();
      assert.equal(d.doc.sections, before.sections);
      assert.equal(d.doc.comments, before.comments);
    });

  it('paste twice: two comments, distinct ids', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    for (let k = 0; k < 2; k++) {
      pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
        optsOf(s, true));
    }
    assert.deepEqual([...cmap(d).keys()], [1, 2, 3]);
    assert.notEqual(cmt(d, 2).paraId, cmt(d, 3).paraId);
    whole(d);
  });

  it('a thread: the reply keeps its (new) parent; saved and read ' +
    'back', async () => {
    const {d} = await setup(thread());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 10)));
    pasteBlocks(d, S.caret(at(para(d, 1), 2)), s.blocks,
      optsOf(s, true));
    assert.deepEqual([...cmap(d).keys()], [1, 2, 3, 4]);
    assert.equal(cmt(d, 4).parent, 3);
    assert.equal(cmt(d, 3).parent, null);
    assert.equal(textOf(cmt(d, 4)), 'two');
    assert.equal(cmt(d, 4).author, 'Bob');
    whole(d);
    const {back, errors, xml} = await saved(d);
    assert.deepEqual(errors, []);
    assert.equal(back.comments.map.get(4).parent, 3);
    assert.equal(back.comments.map.get(2).parent, 1);
    assert.match(xml('word/commentsExtended.xml'),
      new RegExp('paraId="' + cmt(d, 4).paraId + '" w15:paraIdParent=' +
        '"' + cmt(d, 3).paraId + '"'));
  });

  it('a reply copied without its parent: top level', async () => {
    const {d} = await setup(thread());
    // s2' .. r2' (not s1)
    const s = slice(d.doc, span(at(para(d), 2), at(para(d), 9)));
    assert.deepEqual(s.comments.map((e) => e.id), [2]);
    pasteBlocks(d, S.caret(at(para(d, 1), 2)), s.blocks,
      optsOf(s, true));
    assert.equal(cmt(d, 3).parent, null);
    assert.equal(textOf(cmt(d, 3)), 'two');
    whole(d);
  });

  it('resolved comments stay resolved', async () => {
    const {d} = await setup(commentDoc(p(range(5, r('bc'))) + p(r('x')),
      {5: {text: 'done', done: true}}));
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 5)));
    pasteBlocks(d, S.caret(at(para(d, 1), 1)), s.blocks,
      optsOf(s, true));
    assert.equal(cmt(d, 6).done, true);
    whole(d);
    const {back, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.equal(back.comments.map.get(6).done, true);
  });

  it('formatting in a comment\'s text is kept', async () => {
    const {d} = await setup(one());
    const c = cmt(d, 1);
    const b = c.blocks[0];
    const fmt = {...b, runs: b.runs.map((u) => ({...u, rPr: {...u.rPr,
      b: true}}))};
    d.apply({op: 'setComment', id: 1, blocks: [fmt]});
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
      optsOf(s, true));
    assert.ok(cmt(d, 2).blocks[0].runs.every((u) => u.rPr.b === true));
  });

  it('a partial range: stray marks dropped, the text kept',
    async () => {
      const {d} = await setup(one());
      const full = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 3)));
      // even with the comment offered: a lone start never goes in
      pasteBlocks(d, S.caret(at(para(d, 1), 2)), s.blocks,
        optsOf(s, true, {comments: full.comments}));
      assert.equal(para(d, 1).text, 'xyab');
      assert.deepEqual([...cmap(d).keys()], [1]);
      whole(d);
    });
});

describe('cut and paste', () => {
  it('a move keeps the comment (a new id); undo, undo', async () => {
    const {d} = await setup(one());
    const got = cutSelection(d, span(at(para(d), 0), at(para(d), 7)));
    assert.equal(cmap(d).size, 0, 'the cut took the comment');
    const mid = d.doc, depth = d.undoDepth;
    pasteBlocks(d, S.caret(at(para(d, 1), 2)), got.slice.blocks,
      optsOf(got.slice, true));
    assert.equal(d.undoDepth, depth + 1);
    assert.deepEqual([...cmap(d).keys()], [2]);
    assert.equal(textOf(cmt(d, 2)), 'one');
    assert.equal(cmt(d, 2).author, 'Ann');
    assert.equal(para(d, 1).text, 'xya' + OBJ + 'bc' + OBJ + OBJ + 'd');
    whole(d);
    d.undo();
    assert.equal(d.doc.comments, mid.comments);
    assert.equal(d.doc.sections, mid.sections);
    d.undo();
    assert.deepEqual([...cmap(d).keys()], [1]);
    assert.equal(para(d).text, 'a' + OBJ + 'bc' + OBJ + OBJ + 'd');
    whole(d);
    d.redo();
    d.redo();
    assert.deepEqual([...cmap(d).keys()], [2]);
    whole(d);
  });

  it('a thread moved: both kept, the reply under the new parent',
    async () => {
      const {d} = await setup(thread());
      const got = cutSelection(d, span(at(para(d), 0),
        at(para(d), 10)));
      assert.equal(cmap(d).size, 0);
      pasteBlocks(d, S.caret(at(para(d, 1), 0)), got.slice.blocks,
        optsOf(got.slice, true));
      assert.deepEqual([...cmap(d).keys()], [3, 4]);
      assert.equal(cmt(d, 4).parent, 3);
      whole(d);
    });

  it('pasted over a selection with a comment: that one goes, in ' +
    'the same step', async () => {
    const {d} = await setup(commentDoc(p(r('a') + range(1, r('bc')) +
      r('d')) + p(range(2, r('xy'))), {1: 'one', 2: 'two'}));
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    const depth = d.undoDepth;
    pasteBlocks(d, span(at(para(d, 1), 0), at(para(d, 1), 5)),
      s.blocks, optsOf(s, true));
    assert.equal(d.undoDepth, depth + 1);
    assert.deepEqual([...cmap(d).keys()], [1, 3]);
    assert.equal(textOf(cmt(d, 3)), 'one');
    whole(d);
    d.undo();
    assert.deepEqual([...cmap(d).keys()], [1, 2]);
    whole(d);
  });
});

describe('across documents', () => {
  it('through the store, into a document with no comments part: ' +
    'made in the same step; saved and read back', async () => {
    const {d: src} = await setup(thread());
    const s = slice(src.doc, span(at(para(src), 0), at(para(src), 10)));
    const store = new ClipStore();
    const token = store.put(s, 1);
    const got = pick({text: s.plain, html: MARK + token + '-->'},
      {store, docKey: 2});
    assert.equal(got.route, 'exact');
    assert.equal(got.opts.comments, s.comments);
    const {d} = await setup(readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('plain')))})));
    assert.equal(partState(d.doc, 'comments'), 'missing');
    const depth = d.undoDepth;
    pasteBlocks(d, S.caret(at(para(d), 5)), got.blocks, got.opts);
    assert.equal(d.undoDepth, depth + 1);
    assert.equal(partState(d.doc, 'comments'), 'known');
    assert.deepEqual([...cmap(d).keys()], [0, 1]);
    assert.equal(cmt(d, 1).parent, 0);
    assert.equal(textOf(cmt(d, 0)), 'one');
    whole(d);
    const {back, errors} = await saved(d);
    assert.deepEqual(errors, []);
    assert.equal(back.comments.map.get(1).parent, 0);
    assert.equal(back.comments.map.get(0).author, 'Ann');
    // the source untouched
    assert.deepEqual([...cmap(src).keys()], [1, 2]);
    d.undo();
    assert.equal(partState(d.doc, 'comments'), 'missing');
    assert.equal(para(d).text, 'plain');
  });

  it('a cut in one, a paste in another', async () => {
    const {d: src} = await setup(one());
    const got = cutSelection(src, span(at(para(src), 0),
      at(para(src), 7)));
    const {d} = await setup(commentDoc(p(range(4, r('mine'))),
      {4: 'mine'}));
    pasteBlocks(d, S.caret(at(para(d), 0)), got.slice.blocks,
      optsOf(got.slice, false));
    assert.deepEqual([...cmap(d).keys()], [4, 5]);
    assert.equal(textOf(cmt(d, 5)), 'one');
    whole(d);
  });

  it('the comment styles by Word\'s name, made in the target',
    async () => {
      const st = stylesXml('<w:style w:type="character" ' +
        'w:styleId="CR"><w:name w:val="annotation reference"/>' +
        '</w:style><w:style w:type="paragraph" w:styleId="CT">' +
        '<w:name w:val="annotation text"/></w:style>');
      const body = p(cs(1) + r('bc') + ce(1) + '<w:r><w:rPr>' +
        '<w:rStyle w:val="CR"/></w:rPr><w:commentReference ' +
        'w:id="1"/></w:r>');
      const {d: src} = await setup(commentDoc(body, {1: 'one'},
        {parts: {'word/styles.xml': st}}));
      const s = slice(src.doc, span(at(para(src), 0),
        at(para(src), 5)));
      const {d} = await setup(readDocx(await buildDocx({
        'word/document.xml': documentXml(p(r('plain'))),
        'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
          'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
          '</w:style>')})));
      pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks,
        optsOf(s, false));
      const run = para(d).runs.find((u) => u.start === 4);
      assert.equal(run.rStyle, 'CommentReference');
      whole(d);
    });
});

describe('what is not carried', () => {
  it('HTML and plain text: no marks, no comment text', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    const html = toHtml(d.doc, s);
    assert.ok(!/one|Ann/.test(html.replace(/<!--word-clip:[^>]*-->/,
      '')), 'no comment in the HTML');
    assert.ok(!/one|Ann/.test(s.plain));
    const r1 = pick({text: s.plain, html}, {parseHtml});
    assert.equal(r1.route, 'html');
    pasteBlocks(d, S.caret(at(para(d, 1), 0)), r1.blocks, r1.opts);
    pastePlain(d, S.caret(at(para(d, 1), 0)), s.plain);
    assert.equal(para(d, 1).text.slice(0, 8), 'abcdabcd');
    assert.deepEqual([...cmap(d).keys()], [1]);
    assert.equal(bodyMarks(d).length, 3);
    whole(d);
  });

  it('a stash of blocks with no comments: marks dropped', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
      optsOf(s, true, {comments: undefined}));
    assert.equal(para(d, 1).text, 'abcdxy');
    assert.deepEqual([...cmap(d).keys()], [1]);
    whole(d);
  });

  it('into a header: no marks (report), the text pasted', async () => {
    const {d: src} = await setup(one());
    const s = slice(src.doc, span(at(para(src), 0), at(para(src), 7)));
    const doc = await readDocx(await withHeaders(p(r('body')),
      {default: p(r('Head'))}));
    const d = new Document(doc);
    const h = facadeOf(d, [...doc.stories.keys()][0]);
    const hb = h.doc.sections[0].blocks[0];
    const report = {};
    pasteBlocks(h, S.caret(at(hb, 4)), s.blocks,
      optsOf(s, false, {report}));
    assert.equal(report.comments, 'story');
    assert.equal(h.doc.sections[0].blocks[0].text, 'Headabcd');
    assert.equal(partState(d.doc, 'comments'), 'missing');
  });

  it('into a note: no marks (report), the text pasted', async () => {
    const {d} = await setup(noteDoc(p(r('t') + mark(1)),
      {1: noteP('one')}));
    assert.equal(partState(d.doc, 'comments'), 'missing');
    const {d: src} = await setup(one());
    const s = slice(src.doc, span(at(para(src), 0), at(para(src), 7)));
    const f = facadeOf(d, {note: {kind: 'footnote', id: 1}});
    const nb = f.doc.sections[0].blocks[0];
    const report = {};
    pasteBlocks(f, S.caret(at(nb, nb.text.length)), s.blocks,
      optsOf(s, false, {report}));
    assert.equal(report.comments, 'story');
    assert.ok(d.doc.notes.footnotes.get(1).blocks[0].text
      .endsWith('abcd'));
    assert.equal(partState(d.doc, 'comments'), 'missing');
  });

  it('a target whose comments part is kept as bytes: marks dropped',
    async () => {
      const {d: src} = await setup(one());
      const s = slice(src.doc, span(at(para(src), 0),
        at(para(src), 7)));
      const parts = {'word/document.xml': documentXml(p(r('t'))),
        'word/comments.xml': '<w:comments xmlns:w="' + W_NS +
          '"><w:comment w:id="1"><broken'};
      const d = new Document(await readDocx(await buildDocx(parts,
        {docRels: [['rIdC1', REL('comments'), 'comments.xml']]})));
      assert.equal(partState(d.doc, 'comments'), 'unknown');
      const report = {};
      pasteBlocks(d, S.caret(at(para(d), 1)), s.blocks,
        optsOf(s, false, {report}));
      assert.equal(report.comments, 'unknown');
      assert.equal(para(d).text, 'tabcd');
      assert.equal(partState(d.doc, 'comments'), 'unknown');
    });
});

describe('ClipClean and the marks', () => {
  it('kept only for a paste (cmtMarks), never in a note\'s or ' +
    'comment\'s blocks', async () => {
    const {d} = await setup(one());
    const bs = [para(d)];
    const n = (list) => list[0].text.split(OBJ).length - 1;
    assert.equal(n(clean(bs, d.doc, {sameDoc: true})), 0);
    assert.equal(n(clean(bs, d.doc, {})), 0);
    assert.equal(n(clean(bs, d.doc, {sameDoc: true, cmtMarks: true})),
      3);
    assert.equal(n(clean(bs, d.doc, {cmtMarks: true})), 3);
    for (const k of ['inNote', 'inComment']) {
      assert.equal(n(clean(bs, d.doc, {sameDoc: true, cmtMarks: true,
        [k]: true})), 0, k);
    }
  });
});

describe('in tables', () => {
  it('a comment in a cell is carried with its row', async () => {
    const cell = (x) => '<w:tc><w:tcPr><w:tcW w:w="2000" ' +
      'w:type="dxa"/></w:tcPr>' + x + '</w:tc>';
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
      '</w:tblGrid><w:tr>' + cell(p(range(3, r('in')))) +
      '</w:tr></w:tbl>';
    const {d} = await setup(commentDoc(p(r('a')) + tbl + p(r('z')),
      {3: 'cell'}));
    const z = d.doc.sections[0].blocks[2];
    const s = slice(d.doc, span(at(para(d), 0), at(z, 1)));
    assert.deepEqual(s.comments.map((e) => e.id), [3]);
    pasteBlocks(d, S.caret(at(z, 1)), s.blocks, optsOf(s, true));
    assert.deepEqual([...cmap(d).keys()], [3, 4]);
    assert.equal(textOf(cmt(d, 4)), 'cell');
    whole(d);
  });
});

describe('hostile payloads', () => {
  it('blocks with two references of one comment: not carried',
    async () => {
      const {d} = await setup(one());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
      const b = s.blocks[0];
      const twice = [b, {...b}];
      pasteBlocks(d, S.caret(at(para(d, 1), 0)), twice,
        optsOf(s, true));
      assert.deepEqual([...cmap(d).keys()], [1]);
      assert.equal(bodyMarks(d).length, 3);
      whole(d);
    });

  it('bad entries, bad ids, bad comments: ignored, never throw',
    async () => {
      const {d} = await setup(one());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
      const c = s.comments[0].comment;
      const bad = [null, 5, 'x', {}, [1, c], {id: '1', comment: c},
        {id: 1.5, comment: c}, {id: -1, comment: c},
        {id: 2 ** 31, comment: c}, {id: '__proto__', comment: c},
        {id: 1, comment: null}, {id: 1, comment: [c]},
        {id: 1, comment: {...c, blocks: 'no'}},
        {id: 1, comment: {...c, author: 5}},
        {id: 1, comment: {...c, date: {}}},
        {id: 1, comment: {...c, blocks: [{type: 'p', text: 'x',
          runs: 'bad', inlines: {}, pPr: {extra: []}}]}}];
      for (const e of bad) {
        const before = d.doc.comments;
        pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
          optsOf(s, true, {comments: [e]}));
        whole(d);
        // the bad entry was ignored: nothing new, or a sound comment
        for (const [id, x] of cmap(d)) {
          if (before.map.has(id)) continue;
          assert.equal(textOf(x), 'one');
        }
      }
      pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
        optsOf(s, true, {comments: {__proto__: null, length: 1}}));
      whole(d);
    });

  it('duplicate ids: the first entry is the one', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    const c = s.comments[0].comment;
    pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
      optsOf(s, true, {comments: [{id: 1, comment: c},
        {id: 1, comment: {...c, author: 'Eve'}}]}));
    assert.deepEqual([...cmap(d).keys()], [1, 2]);
    assert.equal(cmt(d, 2).author, 'Ann');
    whole(d);
  });

  it('a parent cycle is broken, a parent not carried dropped',
    async () => {
      const {d} = await setup(thread());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 10)));
      const [a, b] = s.comments;
      for (const list of [
        [{id: 1, comment: {...a.comment, parent: 2}}, b],
        [{id: 1, comment: {...a.comment, parent: 1}},
          {id: 2, comment: {...b.comment, parent: 2}}],
        [{id: 1, comment: {...a.comment, parent: 77}},
          {id: 2, comment: {...b.comment, parent: 'x'}}]]) {
        pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
          optsOf(s, true, {comments: list}));
        whole(d);
      }
    });

  it('a huge payload: only the marked comments cost', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    const c = s.comments[0].comment;
    const time = (list) => {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
          optsOf(s, true, {comments: list}));
        best = Math.min(best, performance.now() - t0);
        d.undo();
      }
      return best;
    };
    const huge = [{id: 1, comment: c}];
    for (let i = 2; i < 200000; i++) huge.push({id: i, comment: c});
    const small = time([{id: 1, comment: c}]);
    const big = time(huge);
    console.log(`# huge payload: ${big.toFixed(1)} ms, one ` +
      `${small.toFixed(1)} ms`);
    // (a linear look at 200,000 entries, nothing more)
    assert.ok(big < small * 50 + 200, big + ' ms vs ' + small);
    assert.deepEqual([...cmap(d).keys()], [1]);
  });
});

describe('cost', () => {
  const big = (n, marked) => {
    let body = '';
    const cm = {};
    for (let i = 1; i <= n; i++) {
      body += p(r('line ') + (marked ? range(i, r('w' + i))
        : r('w' + i)));
      if (marked) cm[i] = 'c ' + i;
    }
    return commentDoc(body, cm);
  };
  const time = async (marked, n) => {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const {d} = await setup(big(n, marked));
      const bs = d.doc.sections[0].blocks;
      const last = bs[bs.length - 1];
      const t0 = performance.now();
      const s = slice(d.doc, span(at(bs[0], 0),
        at(last, last.text.length)));
      pasteBlocks(d, S.caret(at(last, last.text.length)), s.blocks,
        optsOf(s, true));
      best = Math.min(best, performance.now() - t0);
      if (marked) assert.equal(cmap(d).size, 2 * n);
    }
    return best;
  };

  it('1,000 comments: copy and paste near the cost of plain text',
    async () => {
      const plain = await time(false, 1000);
      const marked = await time(true, 1000);
      const ratio = marked / plain;
      console.log(`# 1,000 comments: ${marked.toFixed(1)} ms, plain ` +
        `${plain.toFixed(1)} ms, ratio ${ratio.toFixed(2)}`);
      assert.ok(ratio < 25, 'ratio ' + ratio.toFixed(2));
    });
});

describe('a lost comment said, pictures and links, caps', () => {
  /** "a[bc]d[ef]" whose two comments both have id 0 (a damaged file,
   *  as corpus Comment040). */
  const dup = () => commentDoc(p(r('a') + range(0, r('bc')) + r('d') +
    range(0, r('ef'))), {0: 'one'}, {parts: {'word/comments.xml':
    '<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="' +
    W_NS + '" xmlns:r="' + R_NS + '"><w:comment w:id="0" ' +
    'w:author="Ann" w:initials="A"><w:p><w:r><w:t>one</w:t></w:r>' +
    '</w:p></w:comment><w:comment w:id="0" w:author="Bob" ' +
    'w:initials="B"><w:p><w:r><w:t>two</w:t></w:r></w:p>' +
    '</w:comment></w:comments>'}});

  it('two comments with one id: the slice says so; a cut takes ' +
    'the text, undo gives the comment back', async () => {
    const {d} = await setup(dup());
    assert.ok(cmap(d).has(0));
    const b = para(d), n = b.text.length;
    const half = slice(d.doc, span(at(b, 0), at(b, 3)));
    assert.ok(!('commentsLost' in half), 'a half is no loss');
    const got = cutSelection(d, span(at(b, 0), at(b, n)));
    assert.equal(got.slice.commentsLost, 'dup');
    assert.ok(!('comments' in got.slice));
    assert.equal(para(d).text, '');
    assert.ok(!cmap(d).has(0), 'the cut took it');
    d.undo();
    assert.ok(cmap(d).has(0));
    assert.equal(para(d).text.length, n);
  });

  it('no lost key for a sound slice', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    assert.ok(!('commentsLost' in s));
  });

  it('a picture or link in a comment pasted into another document: ' +
    'report.lost; in the same document: no', async () => {
    const {d: src} = await setup(one());
    const s = slice(src.doc, span(at(para(src), 0), at(para(src), 7)));
    const c = s.comments[0].comment, b = c.blocks[0];
    const k = b.text.length;
    const linked = {...b, text: b.text + OBJ,
      runs: [...b.runs, {start: k, end: k + 1, rPr: {extra: []}}],
      inlines: {...b.inlines, [k]: {kind: 'raw', level: 'r',
        node: {name: 'w:object', attrs: [['r:id', 'rId9']],
          children: []}}}};
    const comments = [{id: 1, comment: {...c, blocks: [linked]}}];
    const {d} = await setup(readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('plain')))})));
    const report = {};
    pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks,
      optsOf(s, false, {comments, report}));
    assert.equal(report.lost, true);
    assert.equal(cmap(d).size, 1);
    const same = {};
    pasteBlocks(src, S.caret(at(para(src, 1), 0)), s.blocks,
      optsOf(s, true, {comments, report: same}));
    assert.ok(!same.lost);
    // a comment with no picture or link: nothing said
    const none = {};
    pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks,
      optsOf(s, false, {report: none}));
    assert.ok(!none.lost);
  });

  it('the store counts the comments\' text in its cap', async () => {
    const {d} = await setup(one());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
    const store = new ClipStore();
    assert.ok(store.put(s, 1));
    const big = 'x'.repeat(LIMITS.text);
    const fat = {type: 'p', text: big, runs: [{start: 0,
      end: big.length, rPr: {extra: []}}], inlines: {},
    pPr: {extra: []}};
    const over = {...s, comments: [{id: 1, comment: {...s.comments[0]
      .comment, blocks: [fat]}}]};
    assert.equal(store.put(over, 1), null);
    for (const bad of [null, 5, {comment: null}, {comment: {blocks:
      'x'}}]) assert.ok(store.put({...s, comments: [bad]}, 1));
    assert.ok(store.put({...s, comments: 'x'}, 1));
  });

  it('a long author and initials: cut at MAX_NAME code points',
    async () => {
      const {d} = await setup(one());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 7)));
      const c = s.comments[0].comment;
      const author = 'x'.repeat(MAX_NAME - 1) + '\u{1F600}' + 'y'
        .repeat(100000);
      const initials = 'I'.repeat(MAX_NAME + 5);
      pasteBlocks(d, S.caret(at(para(d, 1), 0)), s.blocks,
        optsOf(s, true, {comments: [{id: 1, comment: {...c, author,
          initials}}]}));
      const x = cmt(d, 2);
      assert.equal([...x.author].length, MAX_NAME);
      assert.ok(x.author.endsWith('\u{1F600}'));
      assert.equal(x.initials, 'I'.repeat(MAX_NAME));
      whole(d);
      const {errors} = await saved(d);
      assert.deepEqual(errors, []);
    });
});

const HAVE = existsSync(fileURLToPath(new URL('./corpus',
  import.meta.url)));
describe('the corpus: the first section copied and pasted at its end',
  {skip: HAVE ? false : SKIP_CORPUS}, () => {
  it('lint clean, xsd of the main part, undo gives the bytes',
    async () => {
      const files = (await commentFiles()).map((f) => f.path);
      const xsd = schemaChecker();
      await corpusRun(files, (d) => {
        const bs = d.doc.sections[0].blocks.filter((x) =>
          x.type === 'p');
        if (bs.length < 1) return {counts: {pasted: 0}};
        const a = bs[0], z = bs[bs.length - 1];
        const s = slice(d.doc, span(at(a, 0), at(z, z.text.length)));
        if (!s) return {counts: {pasted: 0}};
        const n0 = cmap(d).size;
        pasteBlocks(d, S.caret(at(z, z.text.length)), s.blocks,
          optsOf(s, true));
        const n = cmap(d).size - n0;
        assert.equal(n, (s.comments || []).length, 'every one carried');
        return {counts: {pasted: n, carried: (s.comments ||
          []).length}};
      }, typeof xsd === 'string' ? null : xsd,
      typeof xsd === 'string' ? xsd : '', 'commentclip');
    });
});
