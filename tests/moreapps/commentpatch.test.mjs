// The Comments pane's rows and buttons (Batch F1): ./CommentPatch
// rows (threads in the order their marks come in the text, replies
// indented under their thread's first comment, resolved rows, orphans
// after, cycles and hostile parents never looping, the filter, the
// date and the first lines; cached per Doc; linear for 10,000
// comments and a 10,000-deep reply chain), patch (the pane's values
// to a command's options, round trip through the commands and a
// save), the refill after an undo, the buttons shaded in step with
// the commands' refusals (./CommentCmd commandWhy), the range a row
// selects, and the selection kept across a delete.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as CP from '../../tools/moreapps/!Letters/CommentPatch';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {addComment, editComment, replyTo, setResolved, deleteComment,
  commandWhy} from '../../tools/moreapps/!Letters/CommentCmd';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {commentDoc, commentParts, range, cs, ce, cr}
  from './comment-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';

const WHEN = new Date(2026, 9, 30, 10, 20, 5);
const ANN = {author: 'Ann Example', initials: 'AE', date: WHEN};
const para = (d, i = 0) => d.doc.sections[0].blocks[i];
const at = (b, off) => ({id: b.id, off});
const setup = async (doc) => {
  const d = new Document(await doc);
  return {d, t: new Typing(d)};
};
const shape = (rows) => rows.map((x) => [x.id, x.depth, x.resolved]);

// 1 (Ann) with replies 2 and 3 (3 answers 2), 4 resolved (Bob), 5
// an orphan (no marks), 6 a free one marked before the thread
const THREAD = () => commentDoc(p(range(6, r('six')) + r(' ') +
  range(1, r('a')) + range(2, r('b')) + range(3, r('c')) + r(' ') +
  range(4, r('d'))), {1: 'question', 2: {text: 'answer', parent: 1,
  author: 'Bob'}, 3: {text: 'again', parent: 2}, 4: {text: 'done',
  author: 'Bob', done: true}, 5: 'nowhere', 6: 'six'});

describe('CommentPatch rows', () => {
  it('threads in the order of their marks in the text, replies ' +
    'under their first comment (a reply to a reply too), orphans ' +
    'after', async () => {
    const doc = await THREAD();
    const rows = CP.rows(doc, 'all');
    assert.deepEqual(shape(rows), [[6, 0, false], [1, 0, false],
      [2, 1, false], [3, 1, false], [4, 0, true], [5, 0, false]]);
    const one = rows[1];
    assert.equal(one.author, 'Ann');
    assert.equal(one.initials, 'A');
    assert.deepEqual(one.lines, ['question']);
    assert.equal(one.root, 1);
    assert.equal(one.marked, true);
    assert.equal(rows[3].root, 1, 'a reply to a reply: its thread');
    assert.equal(rows[2].author, 'Bob');
    assert.equal(rows[5].marked, false, 'the orphan');
  });

  it('the Unresolved filter leaves out resolved comments; an ' +
    'unknown filter is All', async () => {
    const doc = await THREAD();
    assert.deepEqual(CP.rows(doc, 'unresolved').map((x) => x.id),
      [6, 1, 2, 3, 5]);
    assert.deepEqual(CP.rows(doc, 'bogus').map((x) => x.id),
      CP.rows(doc, 'all').map((x) => x.id));
    assert.deepEqual(CP.FILTERS.map((f) => f.id), ['all',
      'unresolved']);
  });

  it('Unresolved: a reply still open under a resolved first comment ' +
    'is not indented (its thread is left out)', async () => {
    const doc = await commentDoc(p(range(1, r('a')) + range(2,
      r('b')) + r(' ') + range(3, r('c'))), {1: {text: 'q',
      done: true}, 2: {text: 'open', parent: 1}, 3: 'free'});
    assert.deepEqual(shape(CP.rows(doc, 'all')), [[1, 0, true],
      [2, 1, false], [3, 0, false]]);
    assert.deepEqual(shape(CP.rows(doc, 'unresolved')), [[2, 0, false],
      [3, 0, false]]);
  });

  it('no comments: no rows, and the empty text says so', async () => {
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('plain')))}));
    assert.deepEqual(CP.rows(doc, 'all'), []);
    assert.match(CP.emptyText('all'), /no comments/);
    assert.match(CP.emptyText('unresolved'), /no unresolved/);
    assert.deepEqual(CP.rows({}, 'all'), []);
    assert.deepEqual(CP.rows(null, 'all'), []);
  });

  it('a parent cycle and hostile parents never loop: every comment ' +
    'listed once', async () => {
    const doc = await THREAD();
    const map = new Map(doc.comments.map);
    const set = (id, parent) => map.set(id, {...map.get(id), parent});
    set(1, 3);                       // 1 -> 3 -> 2 -> 1
    set(6, 6);                       // itself
    set(5, 99);                      // missing
    set(4, '__proto__');
    const bad = {...doc, comments: {...doc.comments, map}};
    const rows = CP.rows(bad, 'all');
    assert.deepEqual(rows.map((x) => x.id).sort(), [1, 2, 3, 4, 5, 6]);
    for (const x of rows) assert.ok(x.depth === 0 || x.depth === 1);
    assert.equal(rows.filter((x) => x.depth === 0 &&
      [1, 2, 3].includes(x.id)).length, 1, 'one thread of 1, 2, 3');
  });

  it('the date local and short, as written; the first two lines, ' +
    'long ones cut', async () => {
    assert.equal(CP.shortDate('2026-10-30T10:20:00Z'),
      '30/10/2026 10:20');
    assert.equal(CP.shortDate('2026-01-02T03:04:59.123'),
      '02/01/2026 03:04');
    for (const x of [null, undefined, '', 'yesterday', 7, {},
      '2026-1-2T3:4', '2026-13-40T99:99:00Z'.slice(0, 5)])
      assert.equal(CP.shortDate(x), '', String(x));
    const long = 'x'.repeat(500);
    const {d, t} = await setup(commentDoc(p(r('Hello world')), {}));
    const b = para(d);
    const out = addComment(d, t, S.select(at(b, 0), at(b, 5)),
      {text: '\nfirst\n' + long + '\nthird', ...ANN});
    const row = CP.rows(d.doc, 'all').find((x) => x.id === out.id);
    assert.equal(row.date, '30/10/2026 10:20');
    assert.equal(row.author, 'Ann Example');
    assert.equal(row.initials, 'AE');
    assert.equal(row.lines.length, 2);
    assert.equal(row.lines[0], 'first');
    assert.equal(row.lines[1], 'x'.repeat(CP.CHARS) + '...');
  });

  it('a 1 MB comment: its row is short', async () => {
    const doc = await commentDoc(p(range(1, r('a'))),
      {1: 'y'.repeat(1 << 20)});
    const [row] = CP.rows(doc, 'all');
    assert.ok(row.lines[0].length <= CP.CHARS + 3);
  });

  it('cached per Doc: the same rows until the comments or their ' +
    'marks change', async () => {
    const {d, t} = await setup(THREAD());
    const a = CP.rows(d.doc, 'all');
    assert.equal(CP.rows(d.doc, 'all'), a, 'the same array');
    assert.ok(Object.isFrozen(a));
    setResolved(d, t, 6, true);
    const b = CP.rows(d.doc, 'all');
    assert.notEqual(b, a);
    assert.equal(b[0].resolved, true);
  });

  it('linear: 10,000 comments and a 10,000-deep reply chain ' +
    '(1,000 vs 10,000)', async () => {
    const flat = async (n) => {
      let body = '';
      const cm = {};
      for (let k = 0; k < n; k += 5) {
        let s = '';
        for (let j = k; j < k + 5; j++) {
          s += range(j, r('w')) + r(' ');
          cm[j] = {text: 'c' + j, author: 'A' + (j % 7)};
        }
        body += p(s);
      }
      return commentDoc(body, cm);
    };
    const chain = async (n) => {
      const cm = {0: 'root'};
      for (let j = 1; j < n; j++) cm[j] = {text: 'r', parent: j - 1};
      return commentDoc(p(range(0, r('w'))), cm);
    };
    const time = (doc) => {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        // (a fresh Doc object: nothing cached)
        const x = {...doc, comments: {...doc.comments}};
        const t0 = performance.now();
        CP.rows(x, 'all');
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    for (const make of [flat, chain]) {
      const a = await make(1000), b = await make(10000);
      assert.equal(CP.rows(b, 'all').length, 10000);
      const ta = time(a), tb = time(b);
      assert.ok(tb / Math.max(ta, 1) < 30, make.name + ' ' +
        (tb / ta).toFixed(1));
    }
    const deep = CP.rows(await chain(10000), 'all');
    assert.equal(deep.filter((x) => x.depth === 1).length, 9999);
    assert.ok(deep.every((x) => x.root === 0));
  });
});

describe('CommentPatch patch', () => {
  const ROW = {id: 4, root: 1};
  it('add and reply: the text, the author and initials; edit: the ' +
    'text', () => {
    assert.deepEqual(CP.patch({mode: 'add', text: 'Hi', name: 'Ann',
      initials: 'A'}, null), {opts: {text: 'Hi', author: 'Ann',
      initials: 'A'}});
    assert.deepEqual(CP.patch({mode: 'reply', text: 'Yes\nno',
      name: ' Bob  B ', initials: 'B'}, ROW), {opts: {text: 'Yes\nno',
      author: 'Bob B', initials: 'B'}});
    assert.deepEqual(CP.patch({mode: 'edit', text: 'New'}, ROW),
      {opts: {text: 'New'}});
  });
  it('refused: no text, text that is not a string, no comment ' +
    'chosen, an unknown mode; no name or initials asks', () => {
    assert.match(CP.patch({mode: 'add', text: '  \n ', name: 'A',
      initials: 'A'}, null).error, /Type/);
    assert.match(CP.patch({mode: 'edit', text: 3}, ROW).error, /Type/);
    assert.match(CP.patch({mode: 'reply', text: 'x', name: 'A',
      initials: 'A'}, null).error, /Choose a comment/);
    assert.match(CP.patch({mode: 'edit', text: 'x'}, null).error,
      /Choose a comment/);
    assert.ok(CP.patch({mode: 'zap', text: 'x'}, ROW).error);
    assert.ok(CP.patch(null, ROW).error);
    assert.deepEqual(CP.patch({mode: 'add', text: 'x', name: '',
      initials: 'A'}, null), {needsAuthor: true});
    assert.deepEqual(CP.patch({mode: 'reply', text: 'x', name: 'A'},
      ROW), {needsAuthor: true});
  });

  it('round trip: the pane\'s values through the commands, saved ' +
    'and read back, give the same rows', async () => {
    const {d, t} = await setup(commentDoc(p(r('Hello world')), {}));
    const b = para(d);
    const vals = {name: 'Ann Example', initials: 'AE'};
    const a = CP.patch({mode: 'add', text: 'Look', ...vals}, null);
    const made = addComment(d, t, S.select(at(b, 6), at(b, 11)),
      {...a.opts, date: WHEN});
    let row = CP.rows(d.doc, 'all')[0];
    const rp = CP.patch({mode: 'reply', text: 'Seen', name: 'Bob',
      initials: 'B'}, row);
    const rep = replyTo(d, t, row.id, {...rp.opts, date: WHEN});
    row = CP.rows(d.doc, 'all')[0];
    assert.equal(editComment(d, t, row.id, CP.patch({mode: 'edit',
      text: 'Look here'}, row).opts), true);
    assert.equal(setResolved(d, t, made.id, true), true);
    const rows = CP.rows(d.doc, 'all');
    assert.deepEqual(rows.map((x) => [x.id, x.depth, x.author,
      x.initials, x.date, x.lines, x.resolved]), [
      [made.id, 0, 'Ann Example', 'AE', '30/10/2026 10:20',
        ['Look here'], true],
      [rep.id, 1, 'Bob', 'B', '30/10/2026 10:20', ['Seen'], true]]);
    const back = await readDocx(await writeDocx(d.doc,
      {date: new Date(0)}));
    assert.deepEqual(CP.rows(back, 'all').map((x) => [x.id, x.depth,
      x.author, x.initials, x.date, x.lines, x.resolved]),
    rows.map((x) => [x.id, x.depth, x.author, x.initials, x.date,
      x.lines, x.resolved]));
  });

  it('refilled after an undo: the rows as before, the reply gone ' +
    '(liveId null), redo brings it back', async () => {
    const {d, t} = await setup(THREAD());
    const before = CP.rows(d.doc, 'all');
    const out = replyTo(d, t, 6, {text: 'more', ...ANN});
    assert.equal(CP.liveId(d.doc, out.id), out.id);
    assert.equal(CP.rows(d.doc, 'all').length, before.length + 1);
    d.undo();
    assert.deepEqual(CP.rows(d.doc, 'all'), before);
    assert.equal(CP.liveId(d.doc, out.id), null);
    d.redo();
    assert.equal(CP.liveId(d.doc, out.id), out.id);
    for (const x of [null, undefined, -1, 1.5, '6', {}, 2 ** 31])
      assert.equal(CP.liveId(d.doc, x), null);
  });
});

describe('CommentPatch buttons: in step with the commands', () => {
  const CMDS = {
    edit: (d, t, id) => editComment(d, t, id, {text: 'zz'}),
    reply: (d, t, id) => replyTo(d, t, id, {text: 'zz', ...ANN}),
    resolve: (d, t, id) => setResolved(d, t, id,
      !d.doc.comments.map.get(id).done),
    del: (d, t, id) => deleteComment(d, t, id),
  };
  const WHY = {edit: 'edit', reply: 'reply', resolve: 'resolve',
    del: 'delete'};
  const OPAQUE = async () => {
    const parts = commentParts({1: 'parent', 2: {text: 'reply',
      parent: 1}, 3: 'free'});
    return readDocx(await withHeaders(p(range(1, r('a')) + r(' ') +
      range(3, r('b'))), {default: p(range(2, r('Head')))},
    {parts: parts.parts, docRels: parts.docRels}));
  };

  it('each button live exactly when its command does it', async () => {
    for (const make of [THREAD, OPAQUE]) {
      const ids = CP.rows(await make(), 'all').map((x) => x.id);
      for (const id of ids) {
        for (const [k, run] of Object.entries(CMDS)) {
          const {d, t} = await setup(make());
          const row = CP.rows(d.doc, 'all').find((x) => x.id === id);
          const bs = CP.buttons(d, row);
          const why = commandWhy(d, id, WHY[k]);
          assert.equal(bs[k], why === null, `${id} ${k}`);
          assert.equal(bs.why[k], why);
          const depth = d.undoDepth;
          const got = run(d, t, id);
          assert.equal(got !== null, why === null,
            `${make.name} ${id} ${k}: ${why}`);
          if (why !== null) assert.equal(d.undoDepth, depth);
        }
      }
    }
  });

  it('the reasons: an orphan cannot be answered; a thread marked in ' +
    'a header is kept; Resolve reads Reopen on a resolved one',
  async () => {
    const {d} = await setup(THREAD());
    const rows = CP.rows(d.doc, 'all');
    const orphan = CP.buttons(d, rows.find((x) => x.id === 5));
    assert.equal(orphan.reply, false);
    assert.match(orphan.why.reply, /no mark in the text/);
    assert.equal(orphan.edit && orphan.resolve && orphan.del, true);
    assert.equal(CP.buttons(d, rows.find((x) => x.id === 4))
      .resolveText, 'Reopen');
    assert.equal(CP.buttons(d, rows[0]).resolveText, 'Resolve');
    const none = CP.buttons(d, null);
    assert.deepEqual([none.edit, none.reply, none.resolve, none.del],
      [false, false, false, false]);
    const {d: o} = await setup(OPAQUE());
    const kept = CP.buttons(o, CP.rows(o.doc, 'all').find((x) =>
      x.id === 1));
    assert.deepEqual([kept.edit, kept.reply, kept.resolve, kept.del],
      [false, false, false, false]);
    assert.match(kept.why.edit, /header, footer, note/);
  });

  it('in a header or footer (the facade): every button shaded, the ' +
    'reason the commands give', async () => {
    const parts = commentParts({1: 'body one'});
    const doc = await readDocx(await withHeaders(p(range(1, r('a'))),
      {default: p(r('Head'))}, {parts: parts.parts,
      docRels: parts.docRels}));
    const d = new Document(doc);
    const f = facadeOf(d, [...doc.stories.keys()][0]);
    const row = CP.rows(d.doc, 'all')[0];
    const bs = CP.buttons(f, row);
    assert.deepEqual([bs.edit, bs.reply, bs.resolve, bs.del],
      [false, false, false, false]);
    assert.match(bs.why.edit, /header or footer/);
  });
});

describe('CommentPatch rangeOf and holdSel', () => {
  it('a range: from after its start to its end; a point: a caret ' +
    'at its reference; a reply with no marks: its thread\'s; an ' +
    'orphan: none', async () => {
    const doc = await commentDoc(p(r('Alpha ') + range(1, r('beta')) +
      r(' here') + cr(2) + r(' x') + cs(3)) + p(r('two') + ce(3) +
      cr(3)), {1: 'q', 2: 'point', 3: 'across', 4: {text: 'reply',
      parent: 1}, 5: 'orphan'});
    const [b0, b1] = doc.sections[0].blocks;
    const k = (b, kind, id) => Number(Object.keys(b.inlines).find((j) =>
      b.inlines[j].kind === kind && b.inlines[j].id === id));
    assert.deepEqual(CP.rangeOf(doc, 1), S.select(at(b0,
      k(b0, 'cmtStart', 1) + 1), at(b0, k(b0, 'cmtEnd', 1))));
    assert.deepEqual(CP.rangeOf(doc, 2), S.caret(at(b0,
      k(b0, 'cmtRef', 2))));
    assert.deepEqual(CP.rangeOf(doc, 3), S.select(at(b0,
      k(b0, 'cmtStart', 3) + 1), at(b1, k(b1, 'cmtEnd', 3))));
    assert.deepEqual(CP.rangeOf(doc, 4), CP.rangeOf(doc, 1));
    assert.equal(CP.rangeOf(doc, 5), null);
    assert.equal(CP.rangeOf(doc, 77), null);
    assert.equal(CP.rangeOf(doc, '__proto__'), null);
  });

  it('holdSel: the selection after a delete, moved back over the ' +
    'marks that went', async () => {
    const {d, t} = await setup(commentDoc(p(r('Alpha ') +
      range(1, r('beta')) + r(' gamma') + cs(9)), {1: 'q'}));
    const b = para(d);
    const end = b.text.length;
    const sel = S.select(at(b, 2), at(b, end - 2));
    const hold = CP.holdSel(d.doc, sel);
    assert.equal(deleteComment(d, t, 1), true);
    const nb = para(d);
    assert.equal(nb.text, 'Alpha beta gamma' + OBJ);
    // (the mark 9 names no comment: it stays, and so does its place)
    assert.deepEqual(hold(d.doc), S.select(at(nb, 2), at(nb, end - 5)));
    assert.equal(CP.holdSel(d.doc, null)(d.doc), null);
  });
});
