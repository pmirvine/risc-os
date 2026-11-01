// Tracked changes accepted and rejected (Batch F2): ./RevCmd accept
// and reject (the revision at the caret, or those in a selection,
// one straddling an edge split), Accept All, Reject All and by
// author, moves resolved as a pair, refusals outside the body, and
// next / previous change per markup view. Each command is one undo
// step, none when nothing changes.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {list} from '../../tools/moreapps/!Letters/RevMarks';
import {marks as cmtMarks}
  from '../../tools/moreapps/!Letters/CommentMarks';
import {accept, reject, acceptAll, rejectAll, resolveAuthor, next,
  prev, whyNot, commandWhy, Refused}
  from '../../tools/moreapps/!Letters/RevCmd';
import {buildDocx, documentXml} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, mark} from './note-fixtures.mjs';
import {commentDoc, range} from './comment-fixtures.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const D = '2024-01-02T03:04:00Z';
const att = (id, au = 'Ann') => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) + ` w:date="${D}"`;
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, tag = 'w:t') => `<w:r><${tag}${sp(t)}>${t}</${tag}>` +
  '</w:r>';
const dRun = (t) => run(t, 'w:delText');
const el = (name, id, inner, au) => `<w:${name} ${att(id, au)}>` +
  `${inner}</w:${name}>`;
const ins = (id, t, au) => el('ins', id, run(t), au);
const del = (id, t, au) => el('del', id, dRun(t), au);
const para = (inner) => `<w:p>${inner}</w:p>`;
const mvRange = (side, id, name, inner) =>
  `<w:move${side}RangeStart w:id="${id}" w:name="${name}" ` +
  `w:author="Bo" w:date="${D}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
const mvFrom = (id, t, name = 'move1', rid = 90) => mvRange('From', rid,
  name, el('moveFrom', id, run(t), 'Bo'));
const mvTo = (id, t, name = 'move1', rid = 91) => mvRange('To', rid,
  name, el('moveTo', id, run(t), 'Bo'));
const bmS = (id) => `<w:bookmarkStart w:id="${id}" w:name="b${id}"/>`;
const bmE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;

const docOf = async (body) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body)}));
/** A Document of body, shown in All Markup (a caret then meets
 *  deleted text too; the view tests set their own). */
async function docOn(body) {
  const d = new Document(await docOf(body));
  d.markup = 'all';
  return d;
}
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const P = (d, i = 0) => blocks(d.doc)[i];
const write = (doc) => writeDocx(doc, {date: DATE});
const tags = (p) => p.runs.map((r) => (r.rev ? r.rev.kind + r.rev.id
  : '-'));
/** The text of p, U+FFFC marks left out, tagged stretches in
 *  brackets: [ins1:new]. */
function shown(p) {
  let out = '';
  for (const r of p.runs) {
    const t = p.text.slice(r.start, r.end).replaceAll('￼', '');
    if (!t) continue;
    out += r.rev ? `[${r.rev.kind}${r.rev.id}:${t}]` : t;
  }
  return out;
}
const pos = (p, off) => ({id: p.id, off});
const sel = (p, a, b, q = p) => S.select(pos(p, a), pos(q, b));
const car = (p, off) => S.caret(pos(p, off));
const valid = (doc) => scan(doc, (b) => checkBlock(b));
const textOf = (d) => blocks(d.doc).filter((b) => b.type === 'p')
  .map(shown);
const throwsRefused = (fn, re) => assert.throws(fn, (e) =>
  e instanceof Refused && e instanceof RangeError &&
  (!re || re.test(e.message)));

describe('RevCmd: accept and reject at the caret', () => {
  it('accept insertion keeps text and drops tag; reject insertion ' +
    'removes text; accept deletion removes text; reject deletion ' +
    'keeps text and drops tag', async () => {
    const body = para(run('a ') + ins(1, 'new') + run(' b ') +
      del(2, 'old') + run(' c'));
    const cases = [
      [accept, 3, 'a new b [del2:old] c', {ins: 1}],
      [reject, 3, 'a  b [del2:old] c', {ins: 1}],
      [accept, 10, 'a [ins1:new] b  c', {del: 2}],
      [reject, 10, 'a [ins1:new] b old c', {del: 2}],
    ];
    for (const [cmd, off, want] of cases) {
      const d = await docOn(body);
      const t = new Typing(d);
      assert.equal(shown(P(d)), 'a [ins1:new] b [del2:old] c');
      const n0 = d.undoDepth;
      const got = cmd(d, t, car(P(d), off));
      assert.equal(shown(P(d)), want, cmd.name + ' at ' + off);
      assert.equal(got.resolved, 1);
      assert.equal(got.skipped, 0);
      assert.equal(d.undoDepth, n0 + 1, 'one undo step');
      assert.ok(S.collapsed(got.sel));
      valid(d.doc);
      const back = await readDocx(await write(d.doc));
      assert.equal(shown(blocks(back)[0]), want, 'reads back so');
    }
  });

  it('a caret where two revisions meet takes the one ending there; ' +
    'a caret by no revision changes nothing (no step)', async () => {
    const d = await docOn(para(run('x') + ins(1, 'ab') + del(2, 'cd') +
      run('y')));
    assert.equal(accept(d, null, car(P(d), 3)).resolved, 1);
    assert.equal(shown(P(d)), 'xab[del2:cd]y', 'ins1 ends at 3');
    const d2 = await docOn(para(run('x') + ins(1, 'ab') + run('yz')));
    assert.equal(accept(d2, null, car(P(d2), 1)).resolved, 1,
      'the start of a revision holds it');
    const n0 = d2.undoDepth;
    const got = accept(d2, null, car(P(d2), 4));
    assert.deepEqual([got.resolved, got.skipped], [0, 0]);
    assert.equal(d2.undoDepth, n0, 'no step');
    assert.equal(whyNot(d2, car(P(d2), 4)),
      'There is no tracked change here.');
    assert.equal(whyNot(d, car(P(d), 4)), null);
  });

  it('a caret passes over the text the view hides', async () => {
    const body = para(run('ab') + del(2, 'gone') + ins(3, 'new'));
    // "abgonenew": del [2, 6), ins [6, 9); Final shows "abnew"
    let d = await docOn(body);
    d.markup = 'final';
    accept(d, null, car(P(d), 6));
    assert.equal(shown(P(d)), 'ab[del2:gone]new', 'final: ins3');
    d = await docOn(body);
    d.markup = 'final';
    assert.equal(accept(d, null, car(P(d), 2)).resolved, 1);
    assert.equal(shown(P(d)), 'ab[del2:gone]new', 'not the hidden');
    d = await docOn(body);
    d.markup = 'all';
    accept(d, null, car(P(d), 6));
    assert.equal(shown(P(d)), 'ab[ins3:new]', 'all: the one ending');
    d = await docOn(body);
    d.markup = 'original';
    accept(d, null, car(P(d), 6));
    assert.equal(shown(P(d)), 'ab[ins3:new]', 'original: del2');
    d = await docOn(body);
    d.markup = 'original';
    reject(d, null, car(P(d), 9));
    assert.equal(shown(P(d)), 'abgone[ins3:new]',
      'original: the insertion hidden, the deletion before it');
  });

  it('a caret resolves a revision across paragraphs whole, counted ' +
    'once', async () => {
    const body = para(run('x') + ins(1, 'one')) + para(ins(1, 'two') +
      run('y')) + para(ins(1, 'three'));
    for (const [i, off] of [[0, 2], [1, 1]]) {
      const d = await docOn(body);
      const got = reject(d, null, car(P(d, i), off));
      assert.deepEqual(textOf(d), ['x', 'y', '[ins1:three]'],
        'the third is not joined to it: "y" between');
      assert.equal(got.resolved, 1);
      assert.equal(d.undoDepth, 1);
    }
  });

  it('undo restores text and tags together; redo resolves again',
    async () => {
      const body = para(run('a ') + ins(1, 'new') + bmS(5) +
        run(' b ') +
        del(2, 'old') + bmE(5) + run(' c'));
      const doc = await docOf(body);
      const bytes0 = await write(doc);
      const d = new Document(doc);
      const t = new Typing(d);
      reject(d, t, sel(P(d), 0, P(d).text.length));
      assert.equal(shown(P(d)), 'a  b old c');
      const after = await write(d.doc);
      d.undo();
      assert.deepEqual(await write(d.doc), bytes0, 'byte for byte');
      d.redo();
      assert.deepEqual(await write(d.doc), after);
    });
});

describe('RevCmd: a selection', () => {
  it('a selection edge splits a revision and only the inside is ' +
    'resolved', async () => {
    const body = para(run('a ') + ins(1, 'abcdef') + run(' b ') +
      del(2, 'ghijkl') + run(' c'));
    // "a abcdef b ghijkl c": ins [2, 8), del [11, 17)
    let d = await docOn(body);
    let got = accept(d, null, sel(P(d), 5, 14));
    assert.equal(shown(P(d)), 'a [ins1:abc]def b [del2:jkl] c');
    assert.equal(got.resolved, 2);
    valid(d.doc);
    d = await docOn(body);
    got = reject(d, null, sel(P(d), 14, 5));
    assert.equal(shown(P(d)), 'a [ins1:abc] b ghi[del2:jkl] c',
      'backwards selection too');
    // what is outside keeps its very tag object
    d = await docOn(body);
    const rev = P(d).runs[1].rev;
    accept(d, null, sel(P(d), 3, 4));
    assert.equal(shown(P(d)),
      'a [ins1:a]b[ins1:cdef] b [del2:ghijkl] c');
    assert.equal(P(d).runs[1].rev, rev);
    assert.equal(P(d).runs[3].rev, rev);
  });

  it('across paragraphs and table cells, the parts inside only',
    async () => {
      const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
        '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
        '<w:tr><w:tc>' + para(del(3, 'cell')) +
        '</w:tc></w:tr></w:tbl>';
      const body = para(run('one ') + ins(1, 'two')) + tbl +
        para(ins(4, 'four') + run(' five'));
      const d = await docOn(body);
      const ps = blocks(d.doc);
      // from inside "two" to the start of the last paragraph's "four"
      accept(d, null, sel(ps[0], 5, 2, ps[2]));
      const out = blocks(d.doc);
      assert.equal(shown(out[0]), 'one [ins1:t]wo');
      assert.equal(shown(out[1].rows[0].cells[0].blocks[0]), '',
        'the cell is kept, its deleted text gone');
      assert.equal(out[1].rows[0].cells[0].blocks.length, 1);
      assert.equal(shown(out[2]), 'fo[ins4:ur] five');
      valid(d.doc);
      // a selection from a table's edge to after it takes its cells
      const d2 = await docOn(body);
      const t = blocks(d2.doc)[1];
      reject(d2, null, S.select({id: t.id, off: 0},
        {id: t.id, off: 1}));
      assert.equal(shown(blocks(d2.doc)[1].rows[0].cells[0].blocks[0]),
        'cell');
      assert.equal(shown(blocks(d2.doc)[0]), 'one [ins1:two]');
    });

  it('a selection in Final that covers hidden deleted text includes ' +
    'it; a removal that empties a paragraph keeps the paragraph',
    async () => {
      const d = await docOn(para(run('ab') + del(2, 'gone') +
        run('cd')) +
        para(ins(3, 'all of it')));
      d.markup = 'final';
      accept(d, null, sel(P(d), 1, 7));
      assert.equal(shown(P(d)), 'abcd');
      reject(d, null, car(P(d, 1), 2));
      assert.equal(blocks(d.doc).length, 2);
      assert.equal(P(d, 1).text, '');
      valid(d.doc);
    });

  it('comments, bookmarks and notes in removed text stay paired, as ' +
    'a deleted selection keeps them', async () => {
      // a bookmark starting in the insertion and ending after it, and
      // one wholly inside it
      const body = para(run('a ') + `<w:ins ${att(1)}>` + run('xy') +
        bmS(7) + run('zz') + bmS(8) + run('q') + bmE(8) + '</w:ins>' +
        run(' b') + bmE(7));
      const d = await docOn(body);
      const d2 = await docOn(body);
      reject(d, null, car(P(d), 3));
      deleteSelection(d2, sel(P(d2), 2, P(d2).text.indexOf(' b')));
      assert.equal(P(d).text, P(d2).text);
      assert.deepEqual(Object.values(P(d).inlines).map((x) => x.node &&
        x.node.name), Object.values(P(d2).inlines).map((x) => x.node &&
        x.node.name));
      assert.ok(P(d).runs.every((r) => !r.rev), 'no tag left on marks');
      valid(d.doc);
      // a comment wholly inside a deletion goes with its text
      const cmtBody = para(run('k ') + `<w:del ${att(2)}>` +
        range(0, dRun('gone')) + '</w:del>' + run(' m'));
      const cd = new Document(await commentDoc(cmtBody, {0: 'note'}));
      cd.markup = 'all';
      assert.equal(list(cd.doc).length, 1);
      assert.equal(cd.doc.comments.map.size, 1);
      accept(cd, null, car(P(cd), 3));
      assert.equal(shown(P(cd)), 'k  m');
      assert.equal(cmtMarks(cd.doc).size, 0);
      assert.equal(cd.doc.comments.map.size, 0, 'the comment goes too');
      valid(cd.doc);
    });
});

describe('RevCmd: moves', () => {
  const body = para(run('a ') + mvFrom(4, 'moved') + run(' b')) +
    para(run('c ') + mvTo(5, 'moved'));
  it('a move resolves as a pair from either half', async () => {
    for (const [cmd, which, want] of [
      [accept, 0, ['a  b', 'c moved']],
      [accept, 1, ['a  b', 'c moved']],
      [reject, 0, ['a moved b', 'c ']],
      [reject, 1, ['a moved b', 'c ']],
    ]) {
      const d = await docOn(body);
      const p = P(d, which);
      const got = cmd(d, null, car(p, 3));
      assert.deepEqual(textOf(d), want, cmd.name + ' from ' + which);
      assert.equal(got.resolved, 2);
      assert.equal(list(d.doc).length, 0);
      valid(d.doc);
      const back = await readDocx(await write(d.doc));
      assert.deepEqual(blocks(back).map(shown), want);
      d.undo();
      assert.deepEqual(textOf(d), ['a [mvFrom4:moved] b',
        'c [mvTo5:moved]']);
    }
  });

  it('a selection over part of a half leaves the move (skipped); ' +
    'one over a whole half resolves the pair; a half with no ' +
    'partner resolves alone', async () => {
    const want0 = ['a [mvFrom4:moved] b', 'c [mvTo5:moved]'];
    const d = await docOn(body);
    throwsRefused(() => accept(d, null, sel(P(d), 3, 4)),
      /part of a moved text/);
    assert.match(whyNot(d, sel(P(d), 3, 4)), /part of a moved/);
    assert.deepEqual(textOf(d), want0, 'part of a half: untouched');
    assert.equal(d.undoDepth, 0);
    let got;
    // with an insertion beside it: that resolved, the move skipped
    const d1 = await docOn(para(run('a ') + mvFrom(4, 'moved') +
      ins(7, 'x')) + para(run('c ') + mvTo(5, 'moved')));
    got = accept(d1, null, sel(P(d1), 5, P(d1).text.length));
    assert.deepEqual(textOf(d1), ['a [mvFrom4:moved]x',
      'c [mvTo5:moved]']);
    assert.deepEqual([got.resolved, got.skipped], [1, 2]);
    // the whole old place selected: the pair, the new place too
    const d3 = await docOn(body);
    const p3 = P(d3), m3 = p3.text.indexOf('moved');
    got = reject(d3, null, sel(p3, m3, m3 + 5));
    assert.deepEqual(textOf(d3), ['a moved b', 'c ']);
    assert.deepEqual([got.resolved, got.skipped], [2, 0]);
    const d2 = await docOn(para(run('a ') + mvFrom(4, 'lone') +
      run(' b')) + para(mvTo(6, 'other', 'move2')));
    reject(d2, null, car(P(d2), 3));
    assert.deepEqual(textOf(d2), ['a lone b', '[mvTo6:other]']);
    accept(d2, null, car(P(d2, 1), 1));
    assert.deepEqual(textOf(d2), ['a lone b', 'other']);
  });
});

describe('RevCmd: all and by author', () => {
  const body = para(run('a ') + ins(1, 'ann1') + del(2, 'bo2', 'Bo') +
    ins(3, 'none3', null)) + para(del(4, 'ann4') + run('x') +
    ins(5, 'bo5', 'Bo'));
  it('accept all, reject all and by author', async () => {
    let d = await docOn(body);
    let got = acceptAll(d, new Typing(d));
    assert.deepEqual(textOf(d), ['a ann1none3', 'xbo5']);
    assert.deepEqual([got.resolved, got.skipped], [5, 0]);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(list(d.doc).length, 5);
    d = await docOn(body);
    rejectAll(d, null);
    assert.deepEqual(textOf(d), ['a bo2', 'ann4x']);
    d = await docOn(body);
    got = resolveAuthor(d, null, 'Bo', true);
    assert.equal(got.resolved, 2);
    assert.deepEqual(textOf(d), ['a [ins1:ann1][ins3:none3]',
      '[del4:ann4]xbo5']);
    got = resolveAuthor(d, null, 'Unknown author', false);
    assert.equal(got.resolved, 1, 'a revision with no author');
    assert.deepEqual(textOf(d), ['a [ins1:ann1]', '[del4:ann4]xbo5']);
    const n0 = d.undoDepth;
    got = resolveAuthor(d, null, 'Nobody', true);
    assert.deepEqual([got.resolved, got.skipped], [0, 0]);
    assert.equal(d.undoDepth, n0, 'nothing: no step');
    throwsRefused(() => resolveAuthor(d, null, 5, true));
    // nothing at all
    const e = await docOn(para(run('plain')));
    assert.deepEqual(acceptAll(e, null), {resolved: 0, skipped: 0});
    assert.equal(e.undoDepth, 0);
  });

  it('hostile: duplicate ids, missing author and date, and 10,000 ' +
    'revisions accepted within a load-robust ratio', async () => {
    const dup = para(ins(1, 'a') + run('-') + ins(1, 'b') +
      `<w:del w:id="1"><w:r><w:delText>c</w:delText></w:r></w:del>`);
    const d = await docOn(dup);
    reject(d, null, car(P(d), 0));
    // (the w:del with id 1 and other attributes stays raw)
    assert.equal(shown(P(d)), '-[ins1:b]', 'one stretch only');
    assert.equal(list(d.doc).length, 2);
    assert.deepEqual(acceptAll(d, null), {resolved: 1, skipped: 1});
    assert.equal(shown(P(d)), '-b');
    assert.equal(list(d.doc)[0].kind, 'del', 'the raw one kept');
    // no author and no date: kept as a revision, resolved as any
    const bare = await docOn(para(run('k') +
      '<w:ins w:id="9"><w:r><w:t>z</w:t></w:r></w:ins>' +
      '<w:del w:id="10"><w:r><w:delText>q</w:delText></w:r></w:del>'));
    assert.equal(shown(P(bare)), 'k[ins9:z][del10:q]');
    assert.equal(list(bare.doc)[0].author, 'Unknown author');
    reject(bare, null, car(P(bare), 2));
    assert.equal(shown(P(bare)), 'k[del10:q]');
    assert.equal(resolveAuthor(bare, null, 'Unknown author', false)
      .resolved, 1);
    assert.equal(shown(P(bare)), 'kq');
    valid(d.doc);

    const many = async (n) => docOn(Array.from({length: n / 10},
      (_, j) => para(Array.from({length: 10}, (__, k) => {
        const id = j * 10 + k;
        return k % 2 ? del(id, 'x' + id) : ins(id, 'y' + id);
      }).join(''))).join(''));
    const time = async (n) => {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const doc = await many(n);
        const t0 = performance.now();
        const got = acceptAll(doc, null);
        best = Math.min(best, performance.now() - t0);
        assert.equal(got.resolved, n);
      }
      return Math.max(best, 2);
    };
    const small = await time(1000), big = await time(10000);
    assert.ok(big / small < 40, `ratio ${(big / small).toFixed(1)} ` +
      `(${small.toFixed(1)} ms, ${big.toFixed(1)} ms)`);
  });
});

describe('RevCmd: marks in many removed revisions', () => {
  const cmS = (id) => `<w:commentRangeStart w:id="${id}"/>`;
  const cmE = (id) => `<w:commentRangeEnd w:id="${id}"/>`;
  /** n revisions (kind's), 10 to a paragraph, each holding the start
   *  of a bookmark and of a comment range that end after it. */
  const many = (n, kind) => docOn(Array.from({length: n / 10},
    (_, j) => para(Array.from({length: 10}, (__, k) => {
      const id = j * 10 + k, t = 'x' + id;
      const inner = (kind === 'del' ? dRun(t) : run(t)) + bmS(id) +
        cmS(id);
      return el(kind, 5000 + id, inner) + run('-') + bmE(id) + cmE(id);
    }).join(''))).join(''));
  /** The best of three times of cmd over many(n, kind). */
  async function time(n, kind, cmd) {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const d = await many(n, kind);
      const t0 = performance.now();
      const got = cmd(d, null);
      best = Math.min(best, performance.now() - t0);
      assert.equal(got.resolved, n);
      if (k === 0 && n === 1000) {
        const p = P(d);
        assert.equal(p.text.split('\ufffc').length - 1, 40,
          'every mark kept');
        valid(d.doc);
      }
    }
    return Math.max(best, 2);
  }
  for (const [name, kind, cmd] of [['Accept All', 'del', acceptAll],
    ['Reject All', 'ins', rejectAll]]) {
    it(`${name} keeps each pair and is linear (4,000 within 8x of ` +
      '1,000, best of three; WORD_PERF=1 for the time)', async () => {
      const small = await time(1000, kind, cmd);
      const big = await time(4000, kind, cmd);
      assert.ok(big / small < 8, `ratio ${(big / small).toFixed(1)} ` +
        `(${small.toFixed(1)} ms, ${big.toFixed(1)} ms)`);
      if (process.env.WORD_PERF === '1') {
        assert.ok(big < 1000, big.toFixed(1) + ' ms');
      }
    });
  }
});

describe('RevCmd: refusals', () => {
  it('a revision in a header or note is refused; all skips and ' +
    'counts it', async () => {
    const doc = await readDocx(await withHeaders(para(ins(1, 'body')),
      {default: para(ins(7, 'head'))}));
    const d = new Document(doc);
    const h = facadeOf(d, [...doc.stories.keys()][0]);
    const hb = h.doc.sections[0].blocks[0];
    throwsRefused(() => accept(h, null, car(hb, 1)), /header/);
    assert.match(whyNot(h, car(hb, 1)), /header or footer/);
    throwsRefused(() => acceptAll(h, null));
    assert.equal(next(h, car(hb, 0)), null);
    const got = acceptAll(d, null);
    assert.deepEqual([got.resolved, got.skipped], [1, 1]);
    assert.equal(shown(P(d)), 'body');
    assert.match(commandWhy(d, {kind: 'ins', id: 7}, 'accept'),
      /header, footer or note/);
    assert.equal(commandWhy(d, {kind: 'ins', id: 9}, 'reject'),
      'That change is no longer in the document.');
    assert.throws(() => commandWhy(d, {kind: 'ins', id: 7}, 'x'),
      RangeError);

    const n = new Document(await noteDoc(para(run('x') + mark(2)),
      {2: para(ins(120, 'note'))}));
    const f = facadeOf(n, {note: {kind: 'footnote', id: 2}});
    const nb = f.doc.sections[0].blocks[0];
    throwsRefused(() => reject(f, null, car(nb, 1)), /note/);
    assert.deepEqual(acceptAll(n, null), {resolved: 0, skipped: 1});
    assert.equal(n.undoDepth, 0);
  });

  it('a revision kept raw in the body (in a link) is refused at the ' +
    'caret, skipped in a selection with others', async () => {
    const link = '<w:hyperlink w:anchor="x">' + ins(6, 'in link') +
      '</w:hyperlink>';
    const d = await docOn(para(run('a') + link + run('b') +
      ins(2, 'tag')));
    throwsRefused(() => accept(d, null, car(P(d), 1)), /kept/);
    assert.match(whyNot(d, car(P(d), 1)), /kept/);
    assert.match(commandWhy(d, {kind: 'ins', id: 6}, 'accept'), /kept/);
    assert.equal(commandWhy(d, {kind: 'ins', id: 2}, 'accept'), null);
    const got = accept(d, null, sel(P(d), 0, P(d).text.length));
    assert.deepEqual([got.resolved, got.skipped], [1, 1]);
    assert.equal(list(d.doc).length, 1);
    // bad selections
    throwsRefused(() => accept(d, null, null));
    throwsRefused(() => reject(d, null, car({id: 99999}, 0)));
    assert.equal(whyNot(d, null), 'There is no caret in the text.');
  });
});

describe('RevCmd: next and previous', () => {
  const body = para(ins(1, 'one') + run(' ') + del(2, 'two') +
    run(' ') + ins(3, 'three')) + para(run('x ') + del(4, 'four')) +
    para(ins(5, 'fi')) + para(ins(5, 've') + run(' end'));
  const rng = (d, s) => {
    const ps = blocks(d.doc);
    const i = ps.findIndex((b) => b.id === s.anchor.id);
    const j = ps.findIndex((b) => b.id === s.head.id);
    return [i, s.anchor.off, j, s.head.off];
  };
  it('next and previous do not wrap (null at the ends) and skip ' +
    'hidden text per view',
    async () => {
      const d = await docOn(body);
      const walk = (opts) => {
        const out = [];
        for (let s = next(d, car(P(d), 0), opts); s && out.length < 20;
          s = next(d, s, opts)) out.push(rng(d, s));
        return out;
      };
      assert.deepEqual(walk({view: 'all'}), [[0, 0, 0, 3], [0, 4, 0, 7],
        [0, 8, 0, 13], [1, 2, 1, 6], [2, 0, 3, 2]],
      'all: every one; ins5 across two paragraphs is one');
      assert.deepEqual(walk(), [[0, 0, 0, 3], [0, 8, 0, 13],
        [2, 0, 3, 2]], 'final (the default) skips deletions');
      assert.deepEqual(walk({view: 'original'}), [[0, 4, 0, 7],
        [1, 2, 1, 6]], 'original skips insertions');
      // no wrap: null past the last and before the first
      const last = P(d, 3);
      assert.equal(next(d, car(last, 6)), null);
      assert.equal(prev(d, car(P(d), 0)), null);
      // previous from the end, all
      const back = [];
      for (let s = prev(d, car(last, 6), {view: 'all'}); s &&
        back.length < 20; s = prev(d, s, {view: 'all'}))
        back.push(rng(d, s));
      assert.deepEqual(back, [[2, 0, 3, 2], [1, 2, 1, 6], [0, 8, 0, 13],
        [0, 4, 0, 7], [0, 0, 0, 3]]);
      // a caret inside one: next is the one after, previous the one
      // before; a caret where one starts: next is that one
      assert.deepEqual(rng(d, next(d, car(P(d), 1))), [0, 8, 0, 13]);
      assert.deepEqual(rng(d, prev(d, car(P(d), 10), {view: 'all'})),
        [0, 4, 0, 7]);
      assert.deepEqual(rng(d, next(d, car(P(d), 8))), [0, 8, 0, 13]);
      // no from: the first; nothing to find in a plain document
      assert.deepEqual(rng(d, next(d, null)), [0, 0, 0, 3]);
      const e = await docOn(para(run('plain')));
      assert.equal(next(e, car(P(e), 0)), null);
      assert.equal(prev(e, car(P(e), 0)), null);
    });
});
