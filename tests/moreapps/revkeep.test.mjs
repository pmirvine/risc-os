// Revision ops and keep rules (Batch F2): ./OpsRevs setRev (tag or
// untag a range of one paragraph, its inverse giving back the old
// tags run by run), ./RevMarks (the revisions in document order,
// their move pairs, the one at a place, the next free id) and
// ./RevKeep through ./Document: a move half whose partner a step took
// becomes a plain insertion or deletion in that step, and a revision
// whose text was taken leaves no tag behind on the marks it held.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {Document} from '../../tools/moreapps/!Letters/Document';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {deepEqual} from '../../tools/moreapps/!Letters/DeepEqual';
import {list, at as revAt, nextId, stats}
  from '../../tools/moreapps/!Letters/RevMarks';
import {dropped} from '../../tools/moreapps/!Letters/RevKeep';
import {taggable} from '../../tools/moreapps/!Letters/OpsRevs';
import {buildDocx, documentXml} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {noteDoc, mark} from './note-fixtures.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const D = '2024-01-02T03:04:00Z';
const att = (id, au = 'Ann') => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) + ` w:date="${D}"`;
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, rPr = '', tag = 'w:t') =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<${tag}${sp(t)}>${t}` +
  `</${tag}></w:r>`;
const dRun = (t) => run(t, '', 'w:delText');
const el = (name, id, inner, au) => `<w:${name} ${att(id, au)}>` +
  `${inner}</w:${name}>`;
const ins = (id, inner, au) => el('ins', id, inner, au);
const del = (id, inner, au) => el('del', id, inner, au);
const para = (inner) => `<w:p>${inner}</w:p>`;
const range = (side, id, name, inner) =>
  `<w:move${side}RangeStart w:id="${id}" w:name="${name}" ` +
  `w:author="Bo" w:date="${D}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
const mvFrom = (id, t, name = 'move1', rid = 90) => range('From', rid,
  name, el('moveFrom', id, run(t), 'Bo'));
const mvTo = (id, t, name = 'move1', rid = 91) => range('To', rid,
  name, el('moveTo', id, run(t), 'Bo'));

const docOf = async (body) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body)}));
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const write = (doc) => writeDocx(doc, {date: DATE});
const tags = (p) => p.runs.map((r) => (r.rev ? r.rev.kind + r.rev.id
  : '-'));
const brief = (doc) => list(doc).map((e) => [e.kind, e.id, e.text,
  e.move === undefined ? null : e.move]);
const sel = (p, a, b) => S.select({id: p.id, off: a}, {id: p.id,
  off: b});
const valid = (doc) => scan(doc, (b) => checkBlock(b));

/** The text of every w:p of the main part, as written. */
async function mainXml(doc) {
  const {readZip} = await import('../../tools/moreapps/!WimpLib/Zip');
  const z = await readZip(await write(doc));
  return new TextDecoder().decode(z.get('word/document.xml'));
}

const REV = (id, kind = 'ins', author = 'Me') => ({id, kind, author,
  date: D, attrs: [], extra: []});

describe('setRev', () => {
  it('setRev tags and untags a range and its inverse restores byte ' +
    'for byte', async () => {
    const doc = await docOf(para(run('plain ', '<w:b/>') +
      run('text') + ins(4, run(' was new'))));
    const bytes0 = await write(doc);
    const p0 = blocks(doc)[0];
    assert.deepEqual(tags(p0), ['-', '-', 'ins4']);
    // tag across two runs of different formatting
    const inv = apply(doc, {op: 'setRev', at: [0, 0], from: 3, to: 8,
      rev: REV(9)});
    const p1 = blocks(doc)[0];
    assert.notEqual(p1, p0, 'copy on write');
    assert.deepEqual(tags(p0), ['-', '-', 'ins4'], 'old untouched');
    assert.deepEqual(tags(p1), ['-', 'ins9', 'ins9', '-', 'ins4']);
    assert.deepEqual(p1.runs.map((r) => [r.start, r.end]),
      [[0, 3], [3, 6], [6, 8], [8, 10], [10, 18]]);
    valid(doc);
    assert.equal(inv.op, 'setRev');
    assert.ok(Array.isArray(inv.revs), 'run by run');
    const back = await readDocx(await write(doc));
    assert.deepEqual(tags(blocks(back)[0]), tags(p1));
    apply(doc, inv);
    assert.ok(deepEqual(blocks(doc)[0], p0));
    assert.deepEqual(await write(doc), bytes0, 'byte for byte');

    // untag part of a revision read from the file, then put it back
    const inv2 = apply(doc, {op: 'setRev', at: [0, 0], from: 12,
      to: 15, rev: null});
    assert.deepEqual(tags(blocks(doc)[0]), ['-', '-', 'ins4', '-',
      'ins4']);
    assert.equal(blocks(doc)[0].runs[2].rev, p0.runs[2].rev,
      'the tag kept is the very one read');
    apply(doc, inv2);
    assert.deepEqual(await write(doc), bytes0);

    // through a Document: undo and redo
    const d = new Document(doc);
    d.apply({op: 'setRev', at: [0, 0], from: 0, to: 18, rev: REV(9,
      'del')});
    assert.deepEqual(tags(blocks(d.doc)[0]), ['del9', 'del9']);
    assert.match(await mainXml(d.doc), /<w:delText>/);
    d.undo();
    assert.deepEqual(await write(d.doc), bytes0);
    d.redo();
    assert.deepEqual(tags(blocks(d.doc)[0]), ['del9', 'del9']);
  });

  it('refused, nothing changed: an empty or bad range, a bad tag, ' +
    'content a revision cannot hold', async () => {
    const link = '<w:hyperlink w:anchor="x">' + run('link') +
      '</w:hyperlink>';
    const fld = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText>PAGE</w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const doc = await docOf(para(run('ab') + link + run('cd') + fld +
      '<w:bookmarkStart w:id="1" w:name="b"/>' + run('ef') +
      '<w:bookmarkEnd w:id="1"/><w:r><w:tab/></w:r>'));
    const p = blocks(doc)[0];
    const bad = [
      {from: 1, to: 1, rev: REV(1)}, {from: 2, to: 1, rev: REV(1)},
      {from: 0, to: 99, rev: REV(1)},
      {from: 0, to: 1, rev: {id: -1, kind: 'ins', attrs: [],
        extra: []}},
      {from: 0, to: 1, rev: {...REV(1), kind: 'fmt'}},
      {from: 0, to: 3, rev: REV(1)},            // the link
      {from: 4, to: 6, rev: REV(1)},            // a field
    ];
    for (const o of bad) {
      assert.throws(() => apply(doc, {op: 'setRev', at: [0, 0], ...o}),
        RangeError, JSON.stringify(o));
      assert.equal(blocks(doc)[0], p);
    }
    assert.throws(() => apply(doc, {op: 'setRev', at: [0, 5], from: 0,
      to: 1, rev: REV(1)}), RangeError);
    // a bookmark, text and a tab can be tagged; anything untagged
    const k = p.text.indexOf('ef') - 1;
    assert.ok(taggable(p, k, p.text.length));
    assert.ok(!taggable(p, 0, 3));
    apply(doc, {op: 'setRev', at: [0, 0], from: k, to: p.text.length,
      rev: REV(3)});
    const back = await readDocx(await write(doc));
    assert.ok(deepEqual(tags(blocks(back)[0]), tags(blocks(doc)[0])));
    apply(doc, {op: 'setRev', at: [0, 0], from: 0, to: p.text.length,
      rev: null});
    assert.ok(blocks(doc)[0].runs.every((r) => !r.rev));
  });

  it('works in a header (story) and its inverse carries the story',
    async () => {
      const doc = await readDocx(await withHeaders(para(run('body')),
        {default: para(run('head'))}));
      const part = [...doc.stories.keys()][0];
      const inv = apply(doc, {op: 'setRev', at: [0, 0], from: 0, to: 2,
        rev: REV(5), story: part});
      assert.equal(inv.story, part);
      assert.deepEqual(tags(doc.stories.get(part).blocks[0]),
        ['ins5', '-']);
      apply(doc, inv);
      assert.deepEqual(tags(doc.stories.get(part).blocks[0]), ['-']);
    });
});

describe('RevMarks', () => {
  it('list is in document order and memoised', async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
      '<w:tr><w:tc>' + para(del(3, dRun('cell'))) +
      '</w:tc></w:tr></w:tbl>';
    const link = '<w:hyperlink w:anchor="x">' + ins(6, run('in link')) +
      '</w:hyperlink>';
    const body = para(run('a') + ins(1, run('one'), null) + run('b') +
      del(2, dRun('two'))) + tbl +
      para(mvFrom(4, 'moved') + link) + para(mvTo(5, 'moved'));
    const doc = await readDocx(await withHeaders(body,
      {default: para(ins(7, run('head')))}));
    const got = list(doc);
    assert.deepEqual(got.map((e) => [e.kind, e.id, e.text,
      e.editable]), [
      ['ins', 1, 'one', true], ['del', 2, 'two', true],
      ['del', 3, 'cell', true], ['mvFrom', 4, 'moved', true],
      ['ins', 6, 'in link', false], ['mvTo', 5, 'moved', true],
      ['ins', 7, 'head', false]]);
    assert.equal(got[0].author, 'Unknown author');
    assert.equal(got[0].rev.author, undefined, 'the tag untouched');
    assert.equal(got[1].author, 'Ann');
    assert.equal(got[1].date, D);
    assert.deepEqual(got[0].where, {block: [0, 0], from: 1, to: 4});
    assert.deepEqual(got[2].where.block, [0, 1, 0, 0, 0]);
    assert.equal(got[3].move, 5);
    assert.equal(got[5].move, 4);
    assert.equal(got[4].move, undefined);
    assert.ok(got[6].where.story);
    // memoised: the very array while the Doc is the same
    const n = stats.paras;
    assert.equal(list(doc), got);
    assert.equal(stats.paras, n);
    // at: the revision at a place in the body
    assert.equal(revAt(doc, {block: [0, 0], off: 2}), got[0]);
    assert.equal(revAt(doc, {block: [0, 0], off: 0}), null);
    assert.equal(revAt(doc, {block: [0, 1, 0, 0, 0], off: 1}), got[2]);
    // an op: a new list, only the changed paragraph read again
    const d = new Document(doc);
    d.apply({op: 'replaceText', block: [0, 0], at: 2, del: 1,
      ins: ''});
    const now = list(d.doc);
    assert.notEqual(now, got);
    assert.equal(now[0].text, 'oe');
    assert.equal(stats.paras, n + 1);
  });

  it('a move without its other half, a duplicate name, hostile ' +
    'values: listed, never thrown', async () => {
    const body = para(mvFrom(1, 'alone', 'lost')) +
      para(mvTo(2, 'x', 'twice', 80) + mvTo(3, 'y', 'twice', 81)) +
      para(mvFrom(4, 'z', 'twice', 82)) +
      para('<w:moveFrom w:id="9" w:author="A">' + run('no range') +
        '</w:moveFrom>');
    const doc = await docOf(body);
    const got = list(doc);
    assert.deepEqual(got.map((e) => [e.kind, e.id, e.move]), [
      ['mvFrom', 1, undefined], ['mvTo', 2, 4], ['mvTo', 3, 4],
      ['mvFrom', 4, 2], ['mvFrom', 9, undefined]]);
    assert.deepEqual(list({}), []);
    assert.deepEqual(list(null), []);
    const odd = {sections: [{blocks: [null, {type: 'p'}, {type: 'tbl'},
      {type: 'opaque'}, {type: 'p', text: 5, runs: [{rev: {id: 1,
        kind: 'ins'}}], inlines: null}]}], stories: 5, notes: 7};
    assert.equal(list(odd).length, 1);
    assert.equal(nextId(odd), 2);
    // a drawing's path a:moveTo is no move; a w:ins in a link is
    const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const pic = '<w:r><w:drawing><a:graphic xmlns:a="' + A + '">' +
      '<a:moveTo><a:pt x="0" y="0"/></a:moveTo></a:graphic>' +
      '</w:drawing></w:r>';
    assert.deepEqual(list(await docOf(para(run('x') + pic))), []);
    assert.equal(revAt(null, {block: [0, 0], off: 0}), null);
  });

  it('nextId is past every revision id: tags, raw revisions, ' +
    'headers, notes, formatting changes', async () => {
    const link = '<w:hyperlink w:anchor="x">' + ins(40, run('l')) +
      '</w:hyperlink>';
    const fmt = '<w:r><w:rPr><w:b/><w:rPrChange w:id="55" ' +
      'w:author="A"><w:rPr/></w:rPrChange></w:rPr><w:t>f</w:t></w:r>';
    const body = para(ins(3, run('a')) + link + fmt);
    assert.equal(nextId(await docOf(body)), 56);
    assert.equal(nextId(await docOf(para(ins(3, run('a'))))), 4);
    assert.equal(nextId(await docOf(para(run('a')))), 0);
    const h = await readDocx(await withHeaders(body,
      {default: para(del(77, dRun('h')))}));
    assert.equal(nextId(h), 78);
    const n = await noteDoc(para(run('x') + mark(2)),
      {2: para(ins(120, run('note')))});
    assert.equal(nextId(n), 121);
    assert.equal(list(n).at(-1).editable, false);
    // an id past the largest cannot be given
    assert.equal(nextId(await docOf(para(ins(2147483647, run('a'))))),
      null);
  });

  it('10000 revisions list within the load-robust ratio', async () => {
    const many = async (n) => docOf(Array.from({length: n / 10},
      (_, j) => para(Array.from({length: 10}, (__, k) => {
        const id = j * 10 + k;
        return k % 2 ? del(id, dRun('x' + id)) : ins(id, run('y' + id));
      }).join(''))).join(''));
    const small = await many(1000), big = await many(10000);
    const best = (f) => {
      let t = Infinity;
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now();
        f();
        t = Math.min(t, performance.now() - t0);
      }
      return Math.max(t, 2);
    };
    // a fresh shallow Doc each time, so the memo is not what is timed
    const fresh = (doc) => () => list({...doc});
    assert.equal(list(big).length, 10000);
    const a = best(fresh(small)), b = best(fresh(big));
    assert.ok(b / a < 40, `${a} ms -> ${b} ms`);
    const c = best(() => nextId({...big}));
    assert.ok(c / Math.max(a, 2) < 400, `nextId ${c} ms`);
  });
});

describe('RevKeep', () => {
  const moved = () => docOf(para(run('Start ') + mvFrom(1, 'moved')) +
    para(run('End ') + mvTo(2, 'moved')));

  it('a move half losing its partner becomes plain ins or del',
    async () => {
      // the new place taken: the old place becomes a deletion
      const d = new Document(await moved());
      const bytes0 = await write(d.doc);
      assert.deepEqual(brief(d.doc), [['mvFrom', 1, 'moved', 2],
        ['mvTo', 2, 'moved', 1]]);
      const q = blocks(d.doc)[1];
      const k = q.text.indexOf('moved');
      assert.ok(deleteSelection(d, sel(q, k, k + 5)));
      assert.deepEqual(brief(d.doc), [['del', 1, 'moved', null]]);
      valid(d.doc);
      const xml = await mainXml(d.doc);
      assert.match(xml, /<w:del w:id="1" w:author="Bo"[^>]*>/);
      assert.doesNotMatch(xml, /<w:moveFrom /);
      d.undo();
      assert.deepEqual(await write(d.doc), bytes0, 'one undo: both');
      d.redo();
      assert.deepEqual(brief(d.doc), [['del', 1, 'moved', null]]);

      // the old place taken (an op: the keys step over it): the new
      // place becomes an insertion
      const e = new Document(await moved());
      const p = blocks(e.doc)[0];
      e.apply({op: 'replaceText', block: [0, 0],
        at: p.text.indexOf('moved'), del: 5, ins: ''});
      assert.deepEqual(brief(e.doc), [['ins', 2, 'moved', null]]);
      assert.match(await mainXml(e.doc), /<w:ins w:id="2"/);
      e.undo();
      assert.deepEqual(brief(e.doc), [['mvFrom', 1, 'moved', 2],
        ['mvTo', 2, 'moved', 1]]);

      // part of a half taken: still a move
      const f = new Document(await moved());
      const r = blocks(f.doc)[1];
      const j = r.text.indexOf('moved');
      assert.ok(deleteSelection(f, sel(r, j, j + 2)));
      assert.deepEqual(brief(f.doc), [['mvFrom', 1, 'moved', 2],
        ['mvTo', 2, 'ved', 1]]);

      // a move never paired is left as it is; nothing for a step that
      // took no revision
      const g = new Document(await docOf(para(run('x ') +
        mvFrom(1, 'alone', 'lost')) + para(run('abc'))));
      assert.ok(deleteSelection(g, sel(blocks(g.doc)[1], 0, 1)));
      assert.deepEqual(brief(g.doc), [['mvFrom', 1, 'alone', null]]);
      assert.equal(dropped(g.doc, [{op: 'replaceText', block: [0, 1],
        at: 0, del: 0, ins: 'a'}]), null);
    });

  it('removing text inside a revision shrinks it and removing all ' +
    'of it removes the revision', async () => {
    const d = new Document(await docOf(para(run('Keep ') +
      ins(5, run('hello') + '<w:bookmarkStart w:id="0" w:name="bm"/>' +
        run(' world')) + run(' end') + '<w:bookmarkEnd w:id="0"/>')));
    const p = blocks(d.doc)[0];
    assert.ok(deleteSelection(d, sel(p, 6, 9)));
    assert.deepEqual(brief(d.doc), [['ins', 5, 'ho world', null]]);
    assert.deepEqual(list(d.doc)[0].where, {block: [0, 0], from: 5,
      to: 14});
    // all of its text: the bookmark start is kept (its end is not
    // taken), untagged; no w:ins left
    const q = blocks(d.doc)[0];
    assert.ok(deleteSelection(d, sel(q, 5, 14)));
    assert.deepEqual(brief(d.doc), []);
    const back = blocks(d.doc)[0];
    assert.ok(back.runs.every((r) => !r.rev));
    valid(d.doc);
    const xml = await mainXml(d.doc);
    assert.doesNotMatch(xml, /<w:ins /);
    assert.match(xml, /<w:bookmarkStart /);
    d.undo();
    assert.deepEqual(brief(d.doc), [['ins', 5, 'ho world', null]]);
    d.undo();
    assert.deepEqual(brief(d.doc), [['ins', 5, 'hello world', null]]);

    // the text on both sides of a tagged mark taken in one step: the
    // mark is left tagged by the ops, and untagged in that step
    const bytes0 = await write(d.doc);
    d.group(() => {
      d.apply({op: 'replaceText', block: [0, 0], at: 11, del: 6,
        ins: ''});
      d.apply({op: 'replaceText', block: [0, 0], at: 5, del: 5,
        ins: ''});
    });
    assert.equal(blocks(d.doc)[0].text, 'Keep \ufffc end\ufffc');
    assert.deepEqual(brief(d.doc), []);
    assert.doesNotMatch(await mainXml(d.doc), /<w:ins /);
    valid(d.doc);
    d.undo();
    assert.deepEqual(await write(d.doc), bytes0, 'one undo: both');
  });

  it('a step that takes no tagged text costs no walk', async () => {
    const d = new Document(await moved());
    const n = stats.lists;
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 1,
      ins: 'Z'});
    assert.equal(stats.lists, n);
    assert.equal(dropped(d.doc, null), null);
    assert.equal(dropped({}, [{op: 'compound'}]), null);
  });
});

describe('new paragraphs', () => {
  it('a tagged paragraph made in code lists and writes', async () => {
    const doc = await docOf(para(run('x')));
    const p = newPara('typed', {runs: [{start: 0, end: 5,
      rPr: {extra: []}, rev: REV(7)}]});
    apply(doc, {op: 'insertBlock', at: [0, 1], block: p});
    assert.deepEqual(brief(doc), [['ins', 7, 'typed', null]]);
    assert.equal(nextId(doc), 8);
  });
});

describe('the caret after undo and redo', () => {
  it('a setRev decides only when no other op does', async () => {
    const {lastLeaf, stepEnd} =
      await import('../../tools/moreapps/!Letters/EditStep');
    const rt = {op: 'replaceText', block: [0, 0], at: 1, del: 0,
      ins: 'x'};
    const sr = {op: 'setRev', at: [0, 1], from: 0, to: 2, rev: null};
    assert.equal(lastLeaf([rt, sr]), rt);
    assert.equal(lastLeaf([{op: 'compound', ops: [rt, sr]}]), rt);
    assert.equal(lastLeaf([sr]), sr);
    const doc = await docOf(para(run('abc')));
    assert.deepEqual(stepEnd(doc, [{...sr, at: [0, 0]}], null),
      {id: blocks(doc)[0].id, off: 2});
  });
});
