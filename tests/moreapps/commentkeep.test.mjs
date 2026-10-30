// A comment goes with its marks (Batch F1): ./OpsComments (addComment,
// addComments, removeComments, setComment and their inverses) and
// ./CommentKeep through ./Document: a step that takes the last
// modelled mark of a comment from the body removes the comment (and
// its replies) in that same step, undo bringing both back; range
// halves kept paired by the bookmarks' rule (./BookmarkKeep), so a
// deletion never leaves half a range; a comment some opaque mark
// still names, an orphan and a mark naming no comment are left as
// they are. Every deleting command is run for real.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {OBJ, newPara} from '../../tools/moreapps/!Letters/Model';
import {checkComments, checkBlock}
  from '../../tools/moreapps/!Letters/ModelCheck';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {replaceOne, replaceAll}
  from '../../tools/moreapps/!Letters/Find';
import {TABLE} from '../../tools/moreapps/!Letters/TblCmdCols';
import {moveCmd} from '../../tools/moreapps/!Letters/OutlineCmd';
import {updateWithBlocks} from '../../tools/moreapps/!Letters/FieldCmd';
import {scan as fieldScan}
  from '../../tools/moreapps/!Letters/FieldScan';
import {marks} from '../../tools/moreapps/!Letters/CommentMarks';
import {dropped} from '../../tools/moreapps/!Letters/CommentKeep';
import {newComment, partRels}
  from '../../tools/moreapps/!Letters/OpsComments';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {rangeMarks} from '../../tools/moreapps/!Letters/BookmarkMarks';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {begin, sep, end, instr} from './field-fixtures.mjs';
import {commentDoc, commentParts, cs, ce, cr, range}
  from './comment-fixtures.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const para = (d, k = 0) => d.doc.sections[0].blocks[k];
const at = (b, off) => ({id: b.id, off});
const span = (a, b) => S.select(a, b);
const cmap = (d) => d.doc.comments.map;
const has = (d, ...ids) => ids.every((id) => cmap(d).has(id));
const setup = async (body, comments, opts) => {
  const d = new Document(await commentDoc(body, comments, opts));
  return {d, t: new Typing(d)};
};
const TBL = (rows) => '<w:tbl><w:tblPr><w:tblW w:w="0" ' +
  'w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/>' +
  '<w:gridCol w:w="2000"/></w:tblGrid>' + rows.map((cells) =>
  '<w:tr>' + cells.map((c) => `<w:tc>${c}</w:tc>`).join('') +
  '</w:tr>').join('') + '</w:tbl>';

/** The model is valid; every comment's range is whole or gone (its
 *  range marks counted where they are: modelled, or a table's own
 *  marks); a comment of ids is there exactly when a mark of it is
 *  (but those of `skip`: opaque marks, orphans). */
function whole(d, ids, skip = new Set()) {
  scan(d.doc, (b) => checkBlock(b));
  checkComments(d.doc.comments);
  const n = new Map();
  for (const x of rangeMarks(d.doc)) {
    if (x.ns !== 'c') continue;
    const e = n.get(x.id) || {start: 0, end: 0};
    e[x.kind]++;
    n.set(x.id, e);
  }
  for (const [id, e] of n) {
    assert.equal(e.start > 0, e.end > 0, 'comment ' + id +
      ' half a range');
  }
  const m = marks(d.doc);
  for (const id of ids) {
    if (skip.has(id)) continue;
    assert.equal(cmap(d).has(id), m.has(id) || n.has(String(id)),
      'comment ' + id);
  }
}

describe('OpsComments', () => {
  const two = () => setup(p(range(1, r('a')) + range(2, r('b'))),
    {1: 'one', 2: 'two', 3: 'three'});

  it('removeComments: the comments gone, undo gives the very ones ' +
    'back in their order; redo', async () => {
    const {d} = await two();
    const c0 = d.doc.comments, was = new Map(c0.map);
    d.apply({op: 'removeComments', ids: [3, 1]});
    assert.deepEqual([...cmap(d).keys()], [2]);
    assert.deepEqual(d.doc.comments.order, [2]);
    assert.notEqual(d.doc.comments, c0, 'copy on write');
    assert.deepEqual([...c0.map.keys()], [1, 2, 3], 'old untouched');
    checkComments(d.doc.comments);
    d.undo();
    assert.deepEqual(d.doc.comments.order, [1, 2, 3]);
    for (const [id, c] of was) assert.equal(cmap(d).get(id), c);
    d.redo();
    assert.deepEqual([...cmap(d).keys()], [2]);
  });

  it('addComment at the end or at a place; its inverse; written ' +
    'and read back', async () => {
    const {d} = await two();
    const c = newComment(d.doc, 9, [newPara('new')], {author: 'Zed',
      initials: 'Z', date: '2024-01-01T00:00:00Z'});
    assert.equal(c.rels, partRels(d.doc));
    d.apply({op: 'addComment', id: 9, comment: c, at: 1});
    assert.deepEqual(d.doc.comments.order, [1, 9, 2, 3]);
    assert.equal(cmap(d).get(9), c);
    checkComments(d.doc.comments);
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    assert.equal(back.comments.map.get(9).author, 'Zed');
    assert.deepEqual(back.comments.order, [1, 9, 2, 3]);
    d.undo();
    assert.deepEqual(d.doc.comments.order, [1, 2, 3]);
  });

  it('setComment: fields set, the very old one back on undo',
    async () => {
      const {d} = await two();
      const old = cmap(d).get(2);
      d.apply({op: 'setComment', id: 2, done: true, author: 'Bo'});
      const now = cmap(d).get(2);
      assert.deepEqual([now.done, now.author, now.node, now.orig],
        [true, 'Bo', old.node, old.orig]);
      d.undo();
      assert.equal(cmap(d).get(2), old);
      d.apply({op: 'setComment', id: 2, blocks: [newPara('changed')]});
      const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
      assert.equal(back.comments.map.get(2).blocks[0].text, 'changed');
    });

  it('refused, nothing changed', async () => {
    const {d} = await two();
    const c0 = d.doc.comments;
    const c = newComment(d.doc, 9, [newPara('x')]);
    const bad = [
      {op: 'addComment', id: 1, comment: {...c, id: 1}},
      {op: 'addComment', id: 9, comment: {...c, id: 8}},
      {op: 'addComment', id: '9', comment: c},
      {op: 'addComment', id: 9, comment: c, at: 7},
      {op: 'addComment', id: 9, comment: {...c, rels: []}},
      {op: 'addComment', id: 9, comment: {...c, done: 'yes'}},
      {op: 'addComment', id: 9, comment: {...c, blocks: [{...para(d),
        type: 'p'}]}},
      {op: 'removeComments', ids: []},
      {op: 'removeComments', ids: [4]},
      {op: 'removeComments', ids: [1, 1]},
      {op: 'removeComments', ids: '1'},
      {op: 'setComment', id: 4, done: true},
      {op: 'setComment', id: 1},
      {op: 'setComment', id: 1, colour: 'red'},
      {op: 'setComment', id: 1, done: 1},
      {op: 'setComment', id: 1, parent: 1},
      {op: 'setComment', id: 1, comment: {...c, id: 2}},
      {op: 'removeComments', ids: [1], story: 'word/header1.xml'},
      {op: 'addComment', id: -1, comment: {...c, id: -1}},
      {op: 'addComment', id: 2 ** 31, comment: {...c, id: 2 ** 31}},
    ];
    for (const op of bad) {
      assert.throws(() => d.apply(op), RangeError, JSON.stringify(op)
        .slice(0, 80));
      assert.equal(d.doc.comments, c0);
    }
  });

  it('a document whose comments part is not modelled takes no ' +
    'comment', async () => {
    const d = new Document(await commentDoc(p(r('x')), {}));
    d.doc.meta = {...d.doc.meta, commentParts: {}};
    const c = newComment(d.doc, 1, [newPara('x')]);
    assert.throws(() => d.apply({op: 'addComment', id: 1, comment: c}),
      /comments part/);
  });
});

describe('deleting marks takes their comments in the same step', () => {
  it('never half a range: every deletion in a paragraph, undone',
    async () => {
      // a b [S c d E R] e f
      const {d} = await setup(p(r('ab') + range(1, r('cd')) + r('ef')),
        {1: 'one'});
      const n = para(d).text.length;
      for (let a = 0; a < n; a++) {
        for (let z = a + 1; z <= n; z++) {
          const b = para(d), depth = d.undoDepth;
          if (!deleteSelection(d, span(at(b, a), at(b, z)))) continue;
          assert.equal(d.undoDepth, depth + 1, 'one step');
          whole(d, [1]);
          d.undo();
          assert.ok(has(d, 1));
          assert.equal(marks(d.doc).get(1).start.off, 2);
        }
      }
    });

  it('a paragraph, a row, a column and a table holding a range: ' +
    'removed in that step; undo gives both back', async () => {
      const {d} = await setup(p(r('x')) + p(range(1, r('in'))) +
        TBL([[p(range(2, r('a'))), p(r('b'))],
          [p(range(3, r('c'))), p(range(4, r('d')))]]) + p(r('y')),
      {1: 'one', 2: 'two', 3: 'three', 4: 'four'});
      const depth = d.undoDepth;
      deleteSelection(d, span(at(para(d, 0), 1), at(para(d, 2), 0)));
      assert.ok(!has(d, 1));
      assert.equal(d.undoDepth, depth + 1);
      d.undo();
      assert.ok(has(d, 1));
      whole(d, [1, 2, 3, 4]);
      const t = para(d, 2);
      TABLE.deleteRows(d, S.caret(at(t.rows[1].cells[0].blocks[0], 0)));
      assert.deepEqual([...cmap(d).keys()], [1, 2]);
      whole(d, [1, 2, 3, 4]);
      d.undo();
      TABLE.deleteCols(d, S.caret(at(para(d, 2).rows[0].cells[0]
        .blocks[0], 0)));
      assert.deepEqual([...cmap(d).keys()], [1, 4]);
      d.undo();
      TABLE.deleteTable(d, S.caret(at(para(d, 2).rows[0].cells[0]
        .blocks[0], 0)));
      assert.deepEqual([...cmap(d).keys()], [1]);
      d.undo();
      assert.deepEqual([...cmap(d).keys()], [1, 2, 3, 4]);
      whole(d, [1, 2, 3, 4]);
    });

  it('a row deleted with a range\'s start in it: the start moves ' +
    'to the caret, the comment stays', async () => {
      const {d} = await setup(TBL([[p(r('a')), p(r('b'))],
        [p(cs(1) + r('c')), p(r('d'))]]) + p(r('e') + ce(1) + cr(1)),
      {1: 'one'});
      TABLE.deleteRows(d, S.caret(at(para(d).rows[1].cells[0]
        .blocks[0], 1)));
      assert.ok(has(d, 1));
      whole(d, [1]);
    });

  it('a range moved in one step (cut and put back) keeps its comment',
    async () => {
      const {d} = await setup(p(range(1, r('ab')) + r('c')),
        {1: 'one'});
      const b = para(d), xs = [0, 3, 4].map((k) => b.inlines[k]);
      d.atomic(() => {
        d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 5,
          ins: ''});
        d.apply({op: 'replaceText', block: [0, 0], at: 1, del: 0,
          ins: OBJ + 'ab' + OBJ + OBJ, inlines: {0: xs[0], 3: xs[1],
            4: xs[2]}});
      });
      assert.ok(has(d, 1));
      assert.equal(para(d).text, 'c' + OBJ + 'ab' + OBJ + OBJ);
      d.apply({op: 'setProps', block: [0, 0], pPr: {jc: 'center',
        extra: []}});
      assert.ok(has(d, 1));
    });

  it('a reply goes with its removed parent; undo brings both',
    async () => {
      const {d} = await setup(p(range(1, r('a'))) + p(range(2,
        r('b'))) + p(range(3, r('c'))), {1: 'parent', 2: {text: 'reply',
        parent: 1}, 3: {text: 'reply to reply', parent: 2},
      4: {text: 'other'}});
      assert.equal(cmap(d).get(3).parent, 2);
      const b = para(d);
      deleteSelection(d, span(at(b, 0), at(b, b.text.length)));
      assert.deepEqual([...cmap(d).keys()], [4]);
      checkComments(d.doc.comments);
      d.undo();
      assert.deepEqual([...cmap(d).keys()], [1, 2, 3, 4]);
    });

  it('typing, Backspace, Delete and Enter over marks', async () => {
    const {d, t} = await setup(p(range(1, r('ab'))) + p(r('x') +
      cr(2) + r('y')) + p(range(3, r('cd'))), {1: 'one', 2: 'point',
      3: 'three'});
    t.type(span(at(para(d, 0), 0), at(para(d, 0), 5)), 'z');
    assert.ok(!has(d, 1));
    assert.equal(para(d, 0).text, 'z');
    const p1 = para(d, 1);
    deleteSelection(d, span(at(p1, 1), at(p1, 2)));
    assert.ok(!has(d, 2), 'a selection over the reference took it');
    d.undo();
    assert.ok(has(d, 2));
    const c = para(d, 2);
    run('enter', d, t, span(at(c, 0), at(c, c.text.length)));
    assert.ok(!has(d, 3), 'Enter over the range');
    d.undo();
    d.undo();
    d.undo();
    assert.ok(has(d, 1, 2, 3));
    whole(d, [1, 2, 3]);
  });

  it('a point comment: Backspace and Delete step over its ' +
    'reference, the comment stays', async () => {
    const {d, t} = await setup(p(r('xy') + cr(2) + r('zw')),
      {2: 'point'});
    run('backspace', d, t, S.caret(at(para(d), 3)));
    assert.equal(para(d).text, 'x' + OBJ + 'zw');
    assert.ok(has(d, 2));
    run('delete', d, t, S.caret(at(para(d), 1)));
    assert.equal(para(d).text, 'x' + OBJ + 'w');
    assert.ok(has(d, 2));
    run('backspace', d, t, S.caret(at(para(d), 1)));
    run('delete', d, t, S.caret(at(para(d), 0)));
    assert.ok(has(d, 2), 'the reference alone is left');
    assert.equal(marks(d.doc).get(2).ref.off, 0);
    whole(d, [2]);
  });

  it('Find and Replace never replaces across a mark; Outline moves ' +
    'keep ranges whole', async () => {
    const {d} = await setup(p(r('a') + cs(1) + r('a')) + p(r('b')) +
      p(r('a') + ce(1) + cr(1)) + p(r('c')), {1: 'one'});
    assert.equal(replaceOne(d, {at: [0, 0], from: 0, to: 3}, 'x'),
      null);
    replaceAll(d, 'a', 'Q');
    assert.equal(para(d, 0).text, 'Q' + OBJ + 'Q');
    assert.ok(has(d, 1));
    moveCmd(d, S.caret(at(para(d, 3), 0)), -1, null);
    assert.deepEqual(d.doc.sections[0].blocks.map((b) => b.text[0]),
      ['Q', 'b', 'c', 'Q']);
    whole(d, [1]);
    // the start's paragraph moves with its whole range: here the
    // whole document, so it cannot go down
    assert.equal(moveCmd(d, S.caret(at(para(d, 0), 0)), 1, null), null);
    moveCmd(d, S.caret(at(para(d, 2), 0)), -1, null);
    whole(d, [1]);
    assert.ok(has(d, 1));
  });

  it('a field result replaced (a table of contents): a half in it is ' +
    'kept paired, its comment kept (the E3 limit closed)', async () => {
    const body = p(begin() + instr(' TOC \\o "1-3" ') + sep() +
      r('Old 1') + cs(1) + r('x')) + p(r('Old 2') + cs(2) + r('in') +
      ce(2) + cr(2)) + p(end()) + p(r('After') + ce(1) + cr(1));
    const {d} = await setup(body, {1: 'one', 2: 'inside'});
    const f = fieldScan(d.doc).find((x) => /TOC/.test(x.instr));
    updateWithBlocks(d, f, [newPara('Entry 1')]);
    assert.ok(has(d, 1), 'the range that ends outside is kept');
    assert.ok(!has(d, 2), 'the one wholly inside goes');
    whole(d, [1, 2]);
    d.undo();
    assert.ok(has(d, 1, 2));
  });
});

describe('what keeps a comment', () => {
  it('an opaque mark still naming it (a header, a link)', async () => {
    const c = commentParts({1: 'one', 2: 'two'});
    const d = new Document(await readDocx(await withHeaders(
      p(range(1, r('a'))) + p(cs(2) + r('b') + ce(2) +
        '<w:hyperlink w:anchor="x">' + cr(2) + '</w:hyperlink>') +
      p(r('z')), {default: p(cr(1))}, c)));
    for (const k of [0, 1]) {
      const b = para(d, k);
      deleteSelection(d, span(at(b, 0), at(b, b.text.length)));
    }
    assert.ok(has(d, 1), 'the header still names 1');
    // the link (kept whole) was deleted with 2's range: nothing names
    // it any more
    assert.ok(!has(d, 2));
    whole(d, [1, 2], new Set([1]));
  });

  it('an orphan, a mark naming no comment, a second mark of it',
    async () => {
      const {d, t} = await setup(p(range(1, r('a')) + range(1, r('b')) +
        range(7, r('c'))), {1: 'one', 5: 'orphan'});
      const b = para(d);
      deleteSelection(d, span(at(b, 0), at(b, 5)));
      assert.ok(has(d, 1), 'still marked');
      const b2 = para(d);
      deleteSelection(d, span(at(b2, 0), at(b2, b2.text.length)));
      assert.ok(!has(d, 1));
      assert.ok(has(d, 5), 'the orphan stays');
      d.undo();
      run('backspace', d, t, S.caret(at(para(d), para(d).text.length)));
      assert.ok(marks(d.doc).has(7), 'a mark naming nothing is kept');
      whole(d, [1, 5], new Set([5]));
    });

  it('no comments, or nothing taken: no work, null', async () => {
    const {d} = await setup(p(range(1, r('a'))), {1: 'one'});
    assert.equal(dropped(d.doc, []), null);
    assert.equal(dropped(d.doc, [{op: 'spliceText', block: [0, 0],
      at: 0, del: 0, content: {text: 'x', runs: [], inlines: {}}}]),
    null);
    assert.equal(dropped({sections: []}, [{op: 'compound'}]), null);
  });
});

describe('raw comment ranges (the comments part unreadable)', () => {
  it('a lone raw half is kept only while its partner survives',
    async () => {
      const {d} = await setup(p(r('a') + cs(1) + r('bc')) +
        p(r('d') + ce(1) + r('e') + cs(2) + r('f')), {},
      {parts: {'word/comments.xml': '<w:comments'}});
      assert.equal(d.doc.comments.map.size, 0);
      assert.equal(para(d, 0).inlines[1].kind, 'raw');
      const b = para(d, 0);
      deleteSelection(d, span(at(b, 0), at(b, 3)));
      assert.equal(para(d, 0).text, OBJ + 'c', 'the start kept');
      assert.equal(para(d, 0).inlines[0].kind, 'raw');
      const b1 = para(d, 1);
      deleteSelection(d, span(at(b1, 2), at(b1, b1.text.length)));
      assert.equal(para(d, 1).text, 'd' + OBJ, 'the lone start gone');
    });
});

describe('hostile', () => {
  it('an end before its start, a start with no end, duplicates: ' +
    'nothing throws, the model stays valid', async () => {
    const {d, t} = await setup(p(ce(1) + r('ab') + cs(1) + cr(1)) +
      p(cs(2) + r('cd') + cs(2)) + p(range(3, r('e')) + range(3,
        r('f'))), {1: 'one', 2: 'two', 3: 'three'});
    for (let k = 0; k < 3; k++) {
      const b = para(d, k);
      if (!b) break;
      deleteSelection(d, span(at(b, 1), at(b, b.text.length - 1)));
      run('backspace', d, t, S.caret(at(para(d, k), 1)));
      scan(d.doc, (x) => checkBlock(x));
      checkComments(d.doc.comments);
    }
    while (d.canUndo) d.undo();
    assert.ok(has(d, 1, 2, 3));
  });

  it('10,000 comments deleted at once: linear', async () => {
    const time = async (n) => {
      let body = '';
      const cm = {};
      for (let k = 0; k < n; k++) {
        body += range(k, r('x'));
        cm[k] = 'c';
      }
      const {d} = await setup(p(body) + p(r('end')), cm);
      const b = para(d);
      const t0 = performance.now();
      deleteSelection(d, span(at(b, 0), at(b, b.text.length)));
      const ms = performance.now() - t0;
      assert.equal(cmap(d).size, 0);
      d.undo();
      assert.equal(cmap(d).size, n);
      return ms;
    };
    await time(200);
    const a = await time(1000), b = await time(10000);
    assert.ok(b / Math.max(a, 1) < 20, 'ratio ' + (b / a).toFixed(1));
  });
});
