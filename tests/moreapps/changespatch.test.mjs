// The Changes pane's rows (Batch F2): ./ChangesPatch rows in
// document order, one per revision (a revision across paragraphs and
// a move's two halves are one row each), filtered by author, the
// empty pane, the rows that cannot be accepted or rejected, what a
// row selects per view, the buttons, and the cost with 10,000
// revisions (linear: a ratio, no absolute ceiling).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {accept} from '../../tools/moreapps/!Letters/RevCmd';
import * as CP from '../../tools/moreapps/!Letters/ChangesPatch';
import {buildDocx, documentXml} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, mark} from './note-fixtures.mjs';
import {shortDate as CPshort}
  from '../../tools/moreapps/!Letters/CommentPatch';

const D = '2024-01-02T03:04:00Z';
const att = (id, au = 'Ann', date = D) => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) +
  (date === null ? '' : ` w:date="${date}"`);
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, tag = 'w:t') => `<w:r><${tag}${sp(t)}>${t}</${tag}>` +
  '</w:r>';
const el = (name, id, inner, au, date) => `<w:${name} ` +
  `${att(id, au, date)}>${inner}</w:${name}>`;
const ins = (id, t, au, date) => el('ins', id, run(t), au, date);
const del = (id, t, au) => el('del', id, run(t, 'w:delText'), au);
const para = (inner) => `<w:p>${inner}</w:p>`;
const mvRange = (side, id, name, inner) =>
  `<w:move${side}RangeStart w:id="${id}" w:name="${name}" ` +
  `w:author="Bo" w:date="${D}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
const mvFrom = (id, t, name = 'move1', rid = 90) => mvRange('From', rid,
  name, el('moveFrom', id, run(t), 'Bo'));
const mvTo = (id, t, name = 'move1', rid = 91) => mvRange('To', rid,
  name, el('moveTo', id, run(t), 'Bo'));

const docOf = async (body) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body)}));
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const shape = (rs) => rs.map((r) => [r.label, r.id, r.author, r.text,
  r.editable]);
/** The text a row selects in doc (view). */
function selText(doc, r, view) {
  const sel = CP.rangeOf(r, view);
  if (!sel) return null;
  const ps = blocks(doc).filter((b) => b.type === 'p');
  const a = ps.findIndex((b) => b.id === sel.anchor.id);
  const z = ps.findIndex((b) => b.id === sel.head.id);
  const parts = [];
  for (let k = a; k <= z; k++) {
    parts.push(ps[k].text.slice(k === a ? sel.anchor.off : 0,
      k === z ? sel.head.off : ps[k].text.length));
  }
  return parts.join('|');
}

describe('ChangesPatch rows', () => {
  it('rows are in document order, filtered by author, and linear',
    async () => {
      const doc = await docOf(para(run('a ') + ins(1, 'new') +
        run(' b ') + del(2, 'old', 'Bo')) +
        para(ins(3, 'third', null)) + para(del(4, 'four')));
      const all = CP.rows(doc, null);
      assert.deepEqual(shape(all), [
        ['Inserted', 1, 'Ann', 'new', true],
        ['Deleted', 2, 'Bo', 'old', true],
        ['Inserted', 3, 'Unknown author', 'third', true],
        ['Deleted', 4, 'Ann', 'four', true]]);
      assert.equal(new Set(all.map((r) => r.key)).size, 4);
      assert.ok(Object.isFrozen(all) && Object.isFrozen(all[0]));
      assert.strictEqual(CP.rows(doc, null), all, 'cached');
      assert.deepEqual(CP.authors(doc), ['Ann', 'Bo',
        'Unknown author']);
      assert.deepEqual(CP.rows(doc, 'Ann').map((r) => r.id), [1, 4]);
      assert.strictEqual(CP.rows(doc, 'Ann'), CP.rows(doc, 'Ann'));
      assert.deepEqual(CP.rows(doc, 'Unknown author').map((r) => r.id),
        [3]);
      assert.deepEqual(CP.rows(doc, 'Nobody'), []);
      for (const f of [undefined, 7, {}, []]) {
        assert.strictEqual(CP.rows(doc, f), all, String(f));
      }
      assert.equal(CP.summary(all),
        '4 changes: 2 inserted, 2 deleted, 0 moved');
      assert.equal(CP.summary(CP.rows(doc, 'Bo')),
        '1 change: 0 inserted, 1 deleted, 0 moved');
      assert.deepEqual(CP.counts(all), {ins: 2, del: 2, move: 0,
        total: 4});
    });

  it('the date as written (Word writes the local clock time with a ' +
    'Z, as comments show it), w16du:dateUtc in local time; the first ' +
    'words cut on code points', async () => {
      const long = 'word '.repeat(40) + '\u{1F600}';
      const U = 'xmlns:w16du="http://schemas.microsoft.com/office/' +
        'word/2023/wordml/word16du" ' +
        'w16du:dateUtc="2024-06-30T23:30:00Z"';
      const doc = await docOf(para(ins(1, long.trim())) +
        para(ins(2, 'x', 'Ann', 'not a date')) +
        para(ins(3, '\u{1F600}'.repeat(80))) +
        para(`<w:ins ${att(4, 'Ann')} ${U}>${run('u')}</w:ins>`));
      const rs = CP.rows(doc, null);
      assert.equal(rs[0].date, '02/01/2024 03:04', 'as written');
      assert.equal(rs[0].date, CPshort(D), 'the comments\' helper');
      const t = new Date(Date.UTC(2024, 5, 30, 23, 30));
      const two = (n) => String(n).padStart(2, '0');
      assert.equal(rs[3].date, `${two(t.getDate())}/` +
        `${two(t.getMonth() + 1)}/${t.getFullYear()} ` +
        `${two(t.getHours())}:${two(t.getMinutes())}`, 'dateUtc');
      assert.equal(rs[1].date, '');
      assert.ok(rs[0].text.endsWith('...'));
      assert.equal(Array.from(rs[0].text).length, CP.CHARS + 3);
      assert.equal(rs[2].text, '\u{1F600}'.repeat(CP.CHARS) + '...');
      assert.ok(rs[2].text.isWellFormed(), 'no half of a pair');
      for (const v of ['2024-13-01T00:00Z', '2024-01-01', null, 5,
        '2024-01-01T25:00:00Z', 'x'.repeat(100)]) {
        assert.equal(CP.dateOf({date: v}), '', String(v));
      }
      assert.equal(CP.dateOf({date: D, rev: {attrs: [['w16du:dateUtc',
        'bad']]}}), '02/01/2024 03:04', 'a bad dateUtc: w:date');
      assert.equal(CP.dateOf(null), '');
    });

  it('the empty pane says so', async () => {
    const doc = await docOf(para(run('plain text')));
    assert.deepEqual(CP.rows(doc, null), []);
    assert.deepEqual(CP.authors(doc), []);
    assert.equal(CP.summary(CP.rows(doc, null)), '');
    assert.equal(CP.emptyText(null),
      'There are no tracked changes in this document.');
    assert.equal(CP.emptyText('Ann'), 'There are no changes by Ann.');
    for (const bad of [null, undefined, {}, {sections: 5}, 'x']) {
      assert.deepEqual(CP.rows(bad, null), [], String(bad));
      assert.deepEqual(CP.authors(bad), []);
    }
  });

  it('a revision across paragraphs is one row; a move is one Moved ' +
    'row with its old and new places', async () => {
    const doc = await docOf(para(run('a') + ins(5, 'one')) +
      para(ins(5, 'two') + run('b')) +
      para(mvFrom(7, 'gone here')) + para(run('x ') +
        mvTo(8, 'gone here')));
    const rs = CP.rows(doc, null);
    assert.deepEqual(rs.map((r) => [r.label, r.text, r.old]), [
      ['Inserted', 'one two', ''],
      ['Moved', 'gone here', 'gone here']]);
    assert.equal(selText(doc, rs[0], 'final'), 'one|two');
    // (the new place in Final and All, the old one in Original)
    const ps = blocks(doc);
    assert.equal(CP.rangeOf(rs[1], 'final').anchor.id, ps[3].id);
    assert.equal(CP.rangeOf(rs[1], 'all').anchor.id, ps[3].id);
    assert.equal(CP.rangeOf(rs[1], 'original').anchor.id, ps[2].id);
    assert.equal(selText(doc, rs[1], 'original'), 'gone here');
    assert.equal(CP.counts(rs).move, 1);
    // two revisions with one id in paragraphs not side by side: two
    const two = await docOf(para(ins(5, 'one')) + para(run('mid')) +
      para(ins(5, 'two')));
    assert.equal(CP.rows(two, null).length, 2);
    // a half with no partner is a Moved row too
    const lone = await docOf(para(mvFrom(7, 'alone')));
    assert.deepEqual(CP.rows(lone, null).map((r) => [r.label, r.text,
      r.old]), [['Moved', 'alone', '']]);
  });

  it('a move half in parts not side by side: the row selects from ' +
    'the first part to the last, Accept takes the pair by a caret ' +
    'and leaves the text between; a lone moved-away half in Final ' +
    'says it is hidden', async () => {
    const two = mvRange('To', 91, 'move1', el('moveTo', 8, run('ab'),
      'Bo') + run(' mid ') + el('moveTo', 8, run('cd'), 'Bo'));
    const doc = await docOf(para(mvFrom(7, 'abcd')) +
      para(run('x ') + two));
    const [r] = CP.rows(doc, null);
    assert.equal(CP.rows(doc, null).length, 1);
    assert.equal(r.text, 'ab cd');
    assert.equal(selText(doc, r, 'final').replaceAll('\ufffc', ''),
      'ab mid cd');
    const act = CP.actOn(r, 'final');
    assert.ok(S.collapsed(act));
    assert.equal(act.anchor.off, r.a.off + 1, 'inside its first part');
    assert.equal(CP.hint(r, 'final'), null);
    assert.equal(CP.hint(r, 'original'), null, 'the old place shown');
    const d = new Document(doc);
    d.markup = 'final';
    const got = accept(d, new Typing(d), act);
    assert.equal(got.resolved, 2, 'both halves');
    assert.deepEqual(CP.rows(d.doc, null), []);
    assert.equal(blocks(d.doc)[1].text.replaceAll('\ufffc', ''),
      'x ab mid cd');
    const lone = await docOf(para(run('a') + mvFrom(7, 'alone')));
    const [l] = CP.rows(lone, null);
    assert.match(CP.hint(l, 'final'), /^Hidden in Final/);
    assert.equal(CP.hint(l, 'all'), null);
    assert.equal(selText(lone, l, 'final').replaceAll('\ufffc', ''),
      'alone');
    assert.ok(!S.collapsed(CP.actOn(l, 'final')), 'hidden: its range');
  });

  it('rows that cannot be accepted or rejected are marked and say ' +
    'why', async () => {
    const link = '<w:hyperlink w:anchor="x">' + ins(6, 'in link') +
      '</w:hyperlink>';
    const doc = await readDocx(await withHeaders(para(run('a') + link +
      ins(2, 'tag')), {default: para(ins(7, 'head'))}));
    const rs = CP.rows(doc, null);
    assert.deepEqual(rs.map((r) => [r.id, r.editable, r.story]),
      [[6, false, false], [2, true, false], [7, false, true]]);
    assert.match(rs[0].note, /Kept as it is/);
    assert.equal(rs[1].note, null);
    assert.match(rs[2].note, /header or footer/);
    assert.equal(CP.rangeOf(rs[2], 'final'), null);
    assert.ok(CP.rangeOf(rs[0], 'final'), 'a raw one in the body is ' +
      'selected');
    const d = new Document(doc);
    assert.match(CP.buttons(d, rs[0]).why.accept, /kept/);
    assert.equal(CP.buttons(d, rs[1]).accept, true);
    assert.equal(CP.buttons(d, rs[1]).why.reject, null);
    assert.match(CP.buttons(d, rs[2]).why.reject, /header/);
    assert.equal(CP.buttons(d, null).why.accept,
      'Choose a change first.');
    const h = facadeOf(d, [...doc.stories.keys()][0]);
    assert.match(CP.buttons(h, rs[1]).why.accept, /header or footer/);
    const n = await noteDoc(para(run('x') + mark(2)),
      {2: para(ins(120, 'note'))});
    const nr = CP.rows(n, null);
    assert.deepEqual(nr.map((r) => [r.id, r.editable]), [[120, false]]);
    assert.match(nr[0].note, /footnote or endnote/);
  });

  it('a deletion in Final is selected whole where it is hidden, the ' +
    'hint says so; Accept on that selection takes it', async () => {
    const doc = await docOf(para(run('ab') + del(2, 'gone') +
      ins(3, 'new')));
    const before = CP.rows(doc, null);
    const [r2, r3] = before;
    assert.equal(selText(doc, r2, 'final'), 'gone');
    assert.match(CP.hint(r2, 'final'), /^Hidden in Final: /);
    assert.equal(CP.hint(r2, 'all'), null);
    assert.equal(CP.hint(r3, 'final'), null);
    assert.match(CP.hint(r3, 'original'), /^Hidden in Original/);
    const d = new Document(doc);
    d.markup = 'final';
    const got = accept(d, new Typing(d), CP.rangeOf(r2, 'final'));
    assert.equal(got.resolved, 1);
    assert.equal(blocks(d.doc)[0].text, 'abnew');
    const after = CP.rows(d.doc, null);
    assert.deepEqual(after.map((r) => r.id), [3]);
    assert.notStrictEqual(after, before, 'made again after the edit');
    assert.equal(CP.keyAt(after, CP.rangeOf(after[0], 'all')),
      after[0].key);
    assert.equal(CP.keyAt(after, S.caret({id: 'nope', off: 0})), null);
    assert.equal(CP.keyAt(after, null), null);
  });

  it('10,000 revisions: rows within the load-robust ratio of 1,000',
    async () => {
      const make = async (n) => {
        let body = '';
        for (let k = 0; k < n; k++) {
          body += para(run('t ') + (k % 2 ? del(k, 'd' + k, 'Bo')
            : ins(k, 'i' + k)));
        }
        return docOf(body);
      };
      const small = await make(1000), big = await make(10000);
      const time = (doc) => {
        const t0 = performance.now();
        const rs = CP.rows(structuredClone2(doc), null);
        return [performance.now() - t0, rs.length];
      };
      const best = (doc) => {
        let m = Infinity, n = 0;
        for (let k = 0; k < 3; k++) {
          const [t, len] = time(doc);
          m = Math.min(m, t);
          n = len;
        }
        return [m, n];
      };
      const [a, na] = best(small), [b, nb] = best(big);
      assert.equal(na, 1000);
      assert.equal(nb, 10000);
      assert.ok(b / Math.max(a, 0.5) < 40,
        `ratio ${(b / a).toFixed(1)} (${a.toFixed(1)} ms, ` +
        `${b.toFixed(1)} ms)`);
      assert.equal(CP.rows(big, 'Bo').length, 5000);
    });
});

/** A copy of doc that no memo knows: new sections and paragraphs. */
function structuredClone2(doc) {
  return {...doc, sections: doc.sections.map((s) => ({...s,
    blocks: s.blocks.map((b) => ({...b}))}))};
}
