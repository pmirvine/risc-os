// A field's whole result replaced by blocks (Batch E3): FieldPut
// planBlocks and FieldCmd updateWithBlocks, for a table of contents
// whose result is many paragraphs. Word's shape: the first entry's
// paragraph holds begin, instruction, separate and the first entry;
// the later entries are paragraphs; the last paragraph holds only
// the end. Kept: what lies before the separate and after the end,
// the attributes of both paragraphs, bookmarks outside; removed: the
// old result with every field, bookmark and note mark in it.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {planBlocks, planOf}
  from '../../tools/moreapps/!Letters/FieldPut';
import {updateWithBlocks} from '../../tools/moreapps/!Letters/FieldCmd';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {newPara, emptyDoc, deepEqual, OBJ}
  from '../../tools/moreapps/!Letters/Model';
import {ids} from '../../tools/moreapps/!Letters/Walk';
import {numbers} from '../../tools/moreapps/!Letters/NoteNumbers';
import {of as bookmarkIndex}
  from '../../tools/moreapps/!Letters/BookmarkIndex';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {loadStyles} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {fld, begin, sep, end, instr, fldSimple, docWithFields}
  from './field-fixtures.mjs';
import {noteDoc, mark, noteP} from './note-fixtures.mjs';

before(loadStyles);

const H = 'word/header1.xml';
const CODE = ' TOC \\o "1-3" \\h \\z \\u ';
const sty = (s) => `<w:pStyle w:val="${s}"/>`;
/** Paragraph XML with attributes on w:p. */
const pa = (attrs, runs, pPr = '') => `<w:p ${attrs}>` +
  (pPr ? `<w:pPr>${pPr}</w:pPr>` : '') + runs + '</w:p>';
const bm = (id, name) =>
  `<w:bookmarkStart w:id="${id}" w:name="${name}"/>`;
const bme = (id) => `<w:bookmarkEnd w:id="${id}"/>`;

/** Word's TOC: A (begin, code, separate, entry 1), entries 2..n, B
 *  (only the end, or `tail` after it). */
function tocXml(n, o = {}) {
  const ent = o.entry || ((k) => r('Old ' + k));
  let x = pa('w:rsidR="00AA0001"', begin(o) + instr(CODE) + sep() +
    ent(1), sty(o.aStyle || 'OldA'));
  for (let k = 2; k <= n; k++) x += p(ent(k), sty('TOC2'));
  x += pa('w:rsidR="00BB0002"', end() + (o.tail || ''), sty('OldB'));
  return x;
}
const body = (n, o) => p(r('Before')) + tocXml(n, o) + p(r('After'));
const entries = (n) => Array.from({length: n}, (_, k) =>
  newPara('Entry ' + (k + 1), {pStyle: 'TOC' + (k % 2 + 1)}));
const blocks = (doc) => doc.sections[0].blocks;
/** A block's text with field marks named. */
function show(b) {
  if (b.type !== 'p') return '[' + b.type + ']';
  let s = '';
  for (let k = 0; k < b.text.length; k++) {
    const c = b.text[k];
    if (c !== OBJ) {
      s += c;
      continue;
    }
    const n = b.inlines[k].node || {};
    const nm = String(n.name || b.inlines[k].kind).split(':').pop();
    const t = (n.attrs || []).find((a) => /fldCharType/.test(a[0]));
    s += '{' + (t ? t[1] : nm) + '}';
  }
  return s;
}
const texts = (doc) => blocks(doc).map(show);
const HEAD = '{begin}{instrText}{separate}';
const tocField = (doc, story) => scan(doc, story)
  .find((f) => /TOC/.test(f.instr));
const noDupIds = (doc) => {
  const all = ids(doc);
  assert.equal(new Set(all).size, all.length, 'ids unique');
};

describe('planBlocks: Word TOC shape', () => {
  it('3 entries replaced by 5: A and B keep ids, extraP', async () => {
    const d = new Document(await docWithFields(body(3)));
    const old = blocks(d.doc).slice();
    const [A, B] = [old[1], old[4]];
    const f = tocField(d.doc);
    assert.ok(updateWithBlocks(d, f, entries(5)));
    assert.deepEqual(texts(d.doc), ['Before', HEAD + 'Entry 1',
      'Entry 2', 'Entry 3', 'Entry 4', 'Entry 5', '{end}', 'After']);
    const bs = blocks(d.doc);
    assert.equal(bs[1].id, A.id);
    assert.equal(bs[1].pStyle, 'TOC1');
    assert.deepEqual(bs[1].extraP, A.extraP);
    assert.equal(bs[6].id, B.id);
    assert.equal(bs[6].pStyle, 'OldB');
    assert.deepEqual(bs[6].extraP, B.extraP);
    assert.deepEqual(bs.slice(2, 6).map((b) => b.pStyle),
      ['TOC2', 'TOC1', 'TOC2', 'TOC1']);
    noDupIds(d.doc);
    const g = tocField(d.doc);
    assert.equal(g.begin.id, A.id);
    assert.equal(g.sep.id, A.id);
    assert.equal(g.end.id, B.id);
    assert.equal(g.instr, CODE);
    assert.equal(d.undoDepth, 1);
    const after = structuredClone(bs);
    d.undo();
    // undo: the very paragraph objects back (restoreBlock and
    // removeBlocks inverses hold the live objects)
    blocks(d.doc).forEach((b, k) => assert.equal(b, old[k]));
    d.redo();
    assert.ok(deepEqual(blocks(d.doc), after));
  });

  it('3 entries replaced by 1, and by none', async () => {
    const d = new Document(await docWithFields(body(3)));
    const [A, B] = [blocks(d.doc)[1], blocks(d.doc)[4]];
    updateWithBlocks(d, tocField(d.doc), entries(1));
    assert.deepEqual(texts(d.doc),
      ['Before', HEAD + 'Entry 1', '{end}', 'After']);
    assert.equal(blocks(d.doc)[2].id, B.id);
    updateWithBlocks(d, tocField(d.doc), []);
    // no blocks: A and B stay, each with its id, pPr and extraP
    assert.deepEqual(texts(d.doc),
      ['Before', HEAD, '{end}', 'After']);
    const [a, b] = [blocks(d.doc)[1], blocks(d.doc)[2]];
    assert.equal(a.id, A.id);
    assert.equal(a.pStyle, 'TOC1');
    assert.deepEqual(a.extraP, A.extraP);
    assert.equal(b.id, B.id);
    assert.equal(b.pStyle, 'OldB');
    assert.deepEqual(b.extraP, B.extraP);
    assert.equal(tocField(d.doc).end.id, B.id);
  });

  it('none with last take: joined into A', async () => {
    const d = new Document(await docWithFields(body(3)));
    const A = blocks(d.doc)[1];
    updateWithBlocks(d, tocField(d.doc), [], {last: 'take'});
    assert.deepEqual(texts(d.doc),
      ['Before', HEAD + '{end}', 'After']);
    const a = blocks(d.doc)[1];
    assert.equal(a.id, A.id);
    assert.equal(a.pStyle, 'OldA');
    assert.deepEqual(a.extraP, A.extraP);
    assert.equal(tocField(d.doc).end.id, A.id);
  });

  it('none on the first update keeps A\'s own pPr', async () => {
    const d = new Document(await docWithFields(body(3)));
    updateWithBlocks(d, tocField(d.doc), []);
    assert.equal(blocks(d.doc)[1].pStyle, 'OldA');
  });

  it('first keep: A keeps its pPr, blocks follow', async () => {
    const d = new Document(await docWithFields(body(2)));
    updateWithBlocks(d, tocField(d.doc), entries(2), {first: 'keep'});
    assert.deepEqual(texts(d.doc), ['Before', HEAD, 'Entry 1',
      'Entry 2', '{end}', 'After']);
    assert.equal(blocks(d.doc)[1].pStyle, 'OldA');
  });

  it('last take: the last block joins B before its end', async () => {
    const d = new Document(await docWithFields(body(2)));
    const B = blocks(d.doc)[3];
    updateWithBlocks(d, tocField(d.doc), entries(3), {last: 'take'});
    assert.deepEqual(texts(d.doc), ['Before', HEAD + 'Entry 1',
      'Entry 2', 'Entry 3{end}', 'After']);
    const b = blocks(d.doc)[3];
    assert.equal(b.id, B.id);
    assert.equal(b.pStyle, 'TOC1');
    assert.deepEqual(b.extraP, B.extraP);
  });

  it('one block taken by both ends: one paragraph', async () => {
    const d = new Document(await docWithFields(body(3)));
    updateWithBlocks(d, tocField(d.doc), entries(1), {last: 'take'});
    assert.deepEqual(texts(d.doc),
      ['Before', HEAD + 'Entry 1{end}', 'After']);
  });

  it('a second update with the same blocks: no step', async () => {
    const d = new Document(await docWithFields(body(3)));
    const sel = {anchor: {id: blocks(d.doc)[0].id, off: 0},
      head: {id: blocks(d.doc)[0].id, off: 0}};
    updateWithBlocks(d, tocField(d.doc), entries(3));
    assert.equal(d.undoDepth, 1);
    const plan = planBlocks(d.doc, tocField(d.doc), entries(3));
    assert.equal(plan.same, true);
    assert.equal(updateWithBlocks(d, tocField(d.doc), entries(3), {},
      sel), sel);
    assert.equal(d.undoDepth, 1);
  });

  it('B\'s tail after the end is kept, another field too', async () => {
    const d = new Document(await docWithFields(body(2,
      {tail: r(' page ') + fld('PAGE', '7')})));
    updateWithBlocks(d, tocField(d.doc), entries(3));
    assert.deepEqual(texts(d.doc).slice(4), [
      '{end} page {begin}{instrText}{separate}7{end}', 'After']);
    const fs = scan(d.doc);
    assert.equal(fs.length, 2);
    assert.equal(fs[1].instr, 'PAGE');
  });

  it('nested fields in the old result go with it', async () => {
    const ent = (k) => r('Old ' + k + '\t') +
      fld(' PAGEREF _Toc' + k + ' \\h ', String(k));
    const d = new Document(await docWithFields(body(3, {entry: ent})));
    assert.equal(tocField(d.doc).children.length, 3);
    assert.equal(scan(d.doc).length, 4);
    updateWithBlocks(d, tocField(d.doc), entries(2));
    assert.equal(scan(d.doc).length, 1);
    assert.equal(tocField(d.doc).children.length, 0);
  });

  it('extraP of A and B kept; caller blocks get new ids', async () => {
    const d = new Document(await docWithFields(body(3)));
    const bs = entries(3);
    bs[1].id = blocks(d.doc)[0].id;          // a clash: renumbered
    updateWithBlocks(d, tocField(d.doc), bs);
    noDupIds(d.doc);
    assert.notEqual(blocks(d.doc)[2].id, blocks(d.doc)[0].id);
  });

  it('a table among the blocks', async () => {
    const d = new Document(await docWithFields(body(1)));
    const t = blocks(await docWithFields(tbl([tr([tc(p(r('c')))])]) +
      p()))[0];
    updateWithBlocks(d, tocField(d.doc), [entries(1)[0], t]);
    assert.deepEqual(texts(d.doc), ['Before', HEAD + 'Entry 1',
      '[tbl]', '{end}', 'After']);
    noDupIds(d.doc);
  });
});

describe('planBlocks: one paragraph (begin and end together)', () => {
  const one = () => docWithFields(pa('w:rsidR="00CC0003"',
    r('See ') + fld(CODE, 'old') + r(' tail'), sty('Body')));

  it('blocks split it; the tail a new paragraph', async () => {
    const d = new Document(await one());
    const P = blocks(d.doc)[0];
    updateWithBlocks(d, tocField(d.doc), entries(2));
    assert.deepEqual(texts(d.doc), ['See ' + HEAD + 'Entry 1',
      'Entry 2', '{end} tail']);
    const bs = blocks(d.doc);
    assert.equal(bs[0].id, P.id);
    assert.deepEqual(bs[0].extraP, P.extraP);
    assert.equal(bs[0].pStyle, 'TOC1');
    assert.notEqual(bs[2].id, P.id);
    assert.equal(bs[2].pStyle, 'Body');
    assert.deepEqual(bs[2].extraP, []);
    noDupIds(d.doc);
  });

  it('no blocks: the result emptied in place', async () => {
    const d = new Document(await one());
    updateWithBlocks(d, tocField(d.doc), []);
    assert.deepEqual(texts(d.doc), ['See ' + HEAD + '{end} tail']);
    assert.equal(blocks(d.doc)[0].pStyle, 'Body');
  });

  it('one block taken by both ends stays inline', async () => {
    const d = new Document(await one());
    updateWithBlocks(d, tocField(d.doc), entries(1), {last: 'take'});
    assert.deepEqual(texts(d.doc),
      ['See ' + HEAD + 'Entry 1{end} tail']);
  });
});

describe('planBlocks: containers', () => {
  it('a TOC in a table cell', async () => {
    const d = new Document(await docWithFields(
      tbl([tr([tc([tocXml(3)]), tc(p(r('x')))])]) + p(r('After'))));
    const f = tocField(d.doc);
    assert.equal(f.sep.at.length, 5);
    assert.ok(updateWithBlocks(d, f, entries(4)));
    const cell = blocks(d.doc)[0].rows[0].cells[0];
    assert.deepEqual(cell.blocks.map(show), [HEAD + 'Entry 1',
      'Entry 2', 'Entry 3', 'Entry 4', '{end}']);
    noDupIds(d.doc);
    d.undo();
    assert.deepEqual(blocks(d.doc)[0].rows[0].cells[0].blocks.map(show),
      [HEAD + 'Old 1', 'Old 2', 'Old 3', '{end}']);
    updateWithBlocks(d, tocField(d.doc), []);
    assert.deepEqual(blocks(d.doc)[0].rows[0].cells[0].blocks.map(show),
      [HEAD, '{end}']);
  });

  it('begin and end in different containers: refused', async () => {
    const doc = await docWithFields(p(begin() + instr(CODE) + sep() +
      r('x')) + tbl([tr([tc(p(r('y') + end()))])]) + p());
    const f = tocField(doc);
    assert.ok(f, 'scan pairs them across the table');
    assert.equal(planBlocks(doc, f, entries(1)), null);
  });

  it('a header story (a facade, paths [0, i])', async () => {
    const d = new Document(await docWithFields(p(r('body')),
      {default: {hdr: tocXml(2)}}));
    const fa = facadeOf(d, H, 0);
    const f = tocField(fa.doc);
    assert.deepEqual(f.sep.at, [0, 0]);
    assert.ok(updateWithBlocks(fa, f, entries(3)));
    assert.deepEqual(d.doc.stories.get(H).blocks.map(show),
      [HEAD + 'Entry 1', 'Entry 2', 'Entry 3', '{end}']);
    noDupIds(d.doc);
    assert.deepEqual(texts(d.doc), ['body']);
    d.undo();
    assert.deepEqual(d.doc.stories.get(H).blocks.map(show),
      [HEAD + 'Old 1', 'Old 2', '{end}']);
  });

  it('a TOC in a content control (w:sdt) is not a field', async () => {
    const doc = await docWithFields('<w:sdt><w:sdtPr><w:docPartObj>' +
      '<w:docPartGallery w:val="Table of Contents"/></w:docPartObj>' +
      '</w:sdtPr><w:sdtContent>' + tocXml(2) +
      '</w:sdtContent></w:sdt>' + p(r('After')));
    assert.equal(blocks(doc)[0].type, 'opaque');
    assert.equal(scan(doc).length, 0);
  });

  it('inside an open atomic: one step with the rest', async () => {
    const d = new Document(await docWithFields(body(3)));
    d.atomic(() => {
      updateWithBlocks(d, tocField(d.doc), entries(2));
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
        ins: 'X'});
    });
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(texts(d.doc).slice(0, 2),
      ['XBefore', HEAD + 'Entry 1']);
  });
});

describe('planBlocks: bookmarks and notes', () => {
  it('inside removed, spanning kept, halves moved out', async () => {
    const ent = (k) => k === 1 ? bme(3) + r('Old 1') + bm(4, 'half2')
      : k === 2 ? bm(2, 'inner') + r('Old 2') + bme(2) : r('Old ' + k);
    const d = new Document(await docWithFields(
      p(bm(1, 'whole') + bm(3, 'half1') + r('Before')) +
      tocXml(3, {entry: ent}) + p(r('After') + bme(1) + bme(4))));
    updateWithBlocks(d, tocField(d.doc), entries(2));
    assert.deepEqual(texts(d.doc), [
      '{bookmarkStart}{bookmarkStart}Before',
      HEAD + '{bookmarkEnd}Entry 1', 'Entry 2',
      '{bookmarkStart}{end}', 'After{bookmarkEnd}{bookmarkEnd}']);
    const idOf = (b, k) => b.inlines[k].node.attrs
      .find((a) => /id$/.test(a[0]))[1];
    const bs = blocks(d.doc);
    assert.equal(idOf(bs[1], 3), '3');   // half1's end: at the start
    assert.equal(idOf(bs[3], 0), '4');   // half2's start: at the end
    assert.ok(!JSON.stringify(bs).includes('inner'));
  });

  it('a note mark in the old result: its note goes', async () => {
    const ent = (k) => r('Old ' + k) + (k === 2 ? mark(1) : '');
    const d = new Document(await noteDoc(tocXml(3, {entry: ent}) +
      p(r('later') + mark(2)), {1: noteP('one'), 2: noteP('two')}));
    assert.equal(numbers(d.doc).footnotes.get(2), '2');
    updateWithBlocks(d, tocField(d.doc), entries(2));
    assert.ok(!d.doc.notes.footnotes.has(1));
    assert.ok(d.doc.notes.footnotes.has(2));
    assert.equal(numbers(d.doc).footnotes.get(2), '1');
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.ok(d.doc.notes.footnotes.has(1));
    assert.equal(numbers(d.doc).footnotes.get(2), '2');
  });
});

describe('planBlocks: the caret', () => {
  it('inside to the result start; after by the tail', async () => {
    const doc = await docWithFields(body(3,
      {tail: r(' xy')}));
    const [A, mid, B, after] = [1, 2, 4, 5].map((k) => blocks(doc)[k]);
    const plan = planBlocks(doc, tocField(doc), entries(5));
    assert.deepEqual(plan.map({id: A.id, off: 1}), {id: A.id, off: 1});
    assert.deepEqual(plan.map({id: A.id, off: 5}), {id: A.id, off: 3});
    assert.deepEqual(plan.map({id: mid.id, off: 2}),
      {id: A.id, off: 3});
    assert.deepEqual(plan.map({id: B.id, off: 0}), {id: B.id, off: 0});
    assert.deepEqual(plan.map({id: B.id, off: 2}), {id: B.id, off: 2});
    assert.deepEqual(plan.map({id: after.id, off: 3}),
      {id: after.id, off: 3});
  });

  it('a selection moved by updateWithBlocks; tail of one para',
    async () => {
      const d = new Document(await docWithFields(
        p(r('See ') + fld(CODE, 'old') + r(' tail'))));
      const P = blocks(d.doc)[0];
      const e = P.text.indexOf('tail');
      const sel = {anchor: {id: P.id, off: 8},
        head: {id: P.id, off: e}};
      const out = updateWithBlocks(d, tocField(d.doc), entries(2), {},
        sel);
      const T = blocks(d.doc)[2];
      assert.deepEqual(out.anchor, {id: P.id, off: 7});
      assert.deepEqual(out.head, {id: T.id, off: 2});
    });
});

describe('planBlocks: refused', () => {
  it('a locked field', async () => {
    const doc = await docWithFields(body(2, {lock: true}));
    assert.equal(planBlocks(doc, tocField(doc), entries(1)), null);
  });

  it('a fldSimple, a field with no separate', async () => {
    const doc = await docWithFields(p(fldSimple('TOC', 'x')) +
      p(fld('TOC', null)));
    const fs = scan(doc);
    assert.equal(fs.length, 2);
    for (const f of fs) assert.equal(planBlocks(doc, f, []), null);
  });

  it('marks out of order, stale marks, bad blocks', async () => {
    const doc = await docWithFields(body(3));
    const f = tocField(doc);
    assert.equal(planBlocks(doc, {...f, sep: f.end, end: f.sep}, []),
      null);
    assert.equal(planBlocks(doc, {...f, begin: f.end}, []), null);
    assert.equal(planBlocks(doc, {...f, end: {...f.end, id: -5}}, []),
      null);
    assert.equal(planBlocks(doc, {...f, sep: {...f.sep, off: 1}}, []),
      null);
    assert.equal(planBlocks(doc, f, 'no'), null);
    assert.equal(planBlocks(doc, f, [{type: 'x'}]), null);
    assert.equal(planBlocks(doc, null, []), null);
    assert.equal(planBlocks(emptyDoc(), f, []), null);
    const d = new Document(doc);
    assert.equal(updateWithBlocks(d, {...f, lock: true}, []), null);
    assert.equal(d.undoDepth, 0);
  });

  it('planOf unchanged: still refuses an object result', async () => {
    const ent = (k) => r('Old ' + k) + fld('PAGE', '1');
    const doc = await docWithFields(body(2, {entry: ent}));
    assert.equal(planOf(doc, tocField(doc), 'x'), null);
  });
});

describe('planBlocks: hostile and cost', () => {
  const bigDoc = (n) => {
    const doc = emptyDoc();
    const mk = (t, inl) => newPara(t, {inlines: inl});
    const fc = (type) => ({kind: 'raw', level: 'r', node:
      {name: 'w:fldChar', attrs: [['w:fldCharType', type]],
        children: []}});
    const ins = {kind: 'raw', level: 'r', node: {name: 'w:instrText',
      attrs: [], children: [' TOC ']}};
    const bs = [mk(OBJ + OBJ + OBJ + 'x', {0: fc('begin'), 1: ins,
      2: fc('separate')})];
    for (let k = 0; k < n; k++) bs.push(mk('entry ' + k));
    bs.push(mk(OBJ, {0: fc('end')}));
    doc.sections[0].blocks = bs;
    return doc;
  };
  const time = (n) => {
    let best = Infinity;
    for (let k = 0; k < 5; k++) {
      const d = new Document(bigDoc(n));
      const f = tocField(d.doc);
      const t0 = performance.now();
      updateWithBlocks(d, f, entries(3));
      best = Math.min(best, performance.now() - t0);
      assert.equal(blocks(d.doc).length, 4);
    }
    return best;
  };

  it('10,000 paragraphs replaced by 3: linear', () => {
    // two size ratios of 4 each: linear about 4, quadratic 16
    const a = time(2500), b = time(10000), c = time(40000);
    const msg = `2,500: ${a} ms, 10,000: ${b} ms, 40,000: ${c} ms`;
    assert.ok(c < b * 9 && b < Math.max(a, 0.05) * 9, msg);
    if (process.env.WORD_PERF === '1') assert.ok(b < 100, msg);
  });
});

describe('planBlocks: hostile blocks', () => {
  const deepTbl = (n) => {
    let b = newPara('x');
    for (let k = 0; k < n; k++) {
      b = {type: 'tbl', id: 1e6 + k, tblPr: {extra: []}, grid: [100],
        rows: [{trPr: {extra: []}, cells: [{tcPr: {extra: []},
          blocks: [b, newPara('y')], attrs: [], lead: []}], attrs: [],
          lead: [], tail: [], tblPrEx: null}], attrs: [], tail: [],
        gridAttrs: []};
    }
    return b;
  };
  const bad = {
    'a table with an empty row': [{type: 'tbl', rows: [{}]}],
    'a table with a null row': [{type: 'tbl', rows: [null]}],
    'a cell with no blocks': [{type: 'tbl', rows: [{cells: [{}]}]}],
    'a first paragraph with no runs': [{type: 'p', text: 'abc'}],
    'bad runs and inlines': [{type: 'p', text: 'a' + OBJ, runs: null,
      inlines: null}],
    'a middle paragraph with no extraP': [newPara('a'),
      {type: 'p', id: 5, text: 'b', runs: [], inlines: {}, pPr:
        {extra: []}}, newPara('c')],
    'a null entry': [newPara('a'), null],
    'a string entry': ['p'],
    'tables 50 deep': [newPara('a'), deepTbl(50)],
  };
  for (const [name, bs] of Object.entries(bad)) {
    it(name + ': refused, nothing thrown or changed', async () => {
      const d = new Document(await docWithFields(body(2)));
      const was = structuredClone(blocks(d.doc));
      const f = tocField(d.doc);
      assert.equal(planBlocks(d.doc, f, bs), null);
      assert.equal(planBlocks(d.doc, f, bs, {last: 'take'}), null);
      assert.equal(updateWithBlocks(d, f, bs), null);
      assert.equal(updateWithBlocks(d, f, bs, {last: 'take'}), null);
      assert.ok(deepEqual(blocks(d.doc), was));
      assert.equal(d.undoDepth, 0);
    });
  }

  it('non-array blocks refused', async () => {
    const d = new Document(await docWithFields(body(2)));
    for (const bs of [null, undefined, 'x', {length: 1}, 7]) {
      assert.equal(updateWithBlocks(d, tocField(d.doc), bs), null);
    }
    assert.equal(d.undoDepth, 0);
  });

  it('tables 8 deep (the model\'s limit) accepted', async () => {
    const d = new Document(await docWithFields(body(2)));
    assert.ok(updateWithBlocks(d, tocField(d.doc),
      [newPara('a'), deepTbl(8)]));
    noDupIds(d.doc);
  });

  it('blocks sharing an id: renumbered, accepted', async () => {
    const d = new Document(await docWithFields(body(2)));
    const bs = entries(3);
    bs[2].id = bs[1].id;
    assert.ok(updateWithBlocks(d, tocField(d.doc), bs));
    noDupIds(d.doc);
  });

  it('an op refusing: null, rolled back (safety net)', async () => {
    const d = new Document(await docWithFields(body(2)));
    const was = structuredClone(blocks(d.doc));
    const real = d.apply.bind(d);
    let n = 0;
    d.apply = (op, o) => {
      if (++n === 2) throw new RangeError('refused');
      return real(op, o);
    };
    assert.equal(updateWithBlocks(d, tocField(d.doc), entries(2)),
      null);
    assert.ok(deepEqual(blocks(d.doc), was));
    assert.equal(d.undoDepth, 0);
  });
});

describe('planBlocks: bookmark pairs never broken', () => {
  const hl = (inner) =>
    `<w:hyperlink w:anchor="_Toc1">${inner}</w:hyperlink>`;
  const T1 = (inner) => '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol ' +
    `w:w="100"/></w:tblGrid><w:tr><w:tc><w:tcPr/>${inner}</w:tc>` +
    '</w:tr></w:tbl>';
  const dec = new TextDecoder();
  /** The written document.xml's bookmark ids: {starts, ends}. */
  async function written(doc) {
    const x = dec.decode((await readZip(await writeDocx(doc)))
      .get('word/document.xml'));
    const ids = (k) => [...x.matchAll(new RegExp('bookmark' + k +
      '[^>]*w:id="(\\d+)"', 'g'))].map((m) => m[1]).sort();
    return {starts: ids('Start'), ends: ids('End')};
  }
  const names = (doc) => bookmarkIndex(doc).list.map((e) => e.name)
    .sort();
  async function check(xml, want, then = () => {}) {
    const d = new Document(await docWithFields(xml));
    const before = names(d.doc);
    assert.ok(updateWithBlocks(d, tocField(d.doc), entries(2)));
    const w = await written(d.doc);
    assert.deepEqual(w.starts, w.ends, 'paired in the XML');
    assert.deepEqual(names(d.doc), want);
    then(d);
    d.undo();
    assert.deepEqual(names(d.doc), before);
  }
  const field = (res, tail = '') => p(begin() + instr(CODE) + sep() +
    res) + p(r('Old 2')) + p(end() + tail) + p(r('After'));

  it('(a) start before the begin, end in a link of the result',
    () => check(p(bm(1, 'span1') + begin() + instr(CODE) + sep() +
      hl(r('Old 1') + bme(1))) + p(r('Old 2')) + p(end()), ['span1'],
    (d) => assert.equal(show(blocks(d.doc)[0]),
      '{bookmarkStart}' + HEAD + '{bookmarkEnd}Entry 1')));

  it('(b) start in a link of the result, end after the field',
    () => check(field(hl(bm(2, 'span2') + r('Old 1')),
      r('tail') + bme(2)), ['span2']));

  it('(c) start in a removed table, end after the field', async () => {
    const d = new Document(await docWithFields(p(begin() +
      instr(CODE) + sep() + r('Old 1')) + T1(p(bm(4, 'span4') +
      r('c'))) + p(end() + bme(4)) + p(r('After'))));
    assert.equal(blocks(d.doc)[1].type, 'tbl');
    updateWithBlocks(d, tocField(d.doc), entries(2));
    const w = await written(d.doc);
    assert.deepEqual(w.starts, ['4']);
    assert.deepEqual(w.ends, ['4']);
    assert.deepEqual(names(d.doc), ['span4']);
    assert.deepEqual(texts(d.doc).slice(2),
      ['{bookmarkStart}{end}{bookmarkEnd}', 'After']);
  });

  it('both halves in a link of the result: removed together',
    () => check(field(hl(bm(3, '_TocX') + r('Old 1') + bme(3))), [],
      (d) => assert.ok(!JSON.stringify(blocks(d.doc))
        .includes('_TocX'))));

  it('spanning the whole field: kept as it is', () => check(
    p(bm(5, 'all') + r('Before')) + field(hl(r('Old 1')),
      bme(5)), ['all']));
});

describe('planBlocks: a caret in a removed table', () => {
  it('maps to the start of the result', async () => {
    const doc = await docWithFields(p(begin() + instr(CODE) + sep() +
      r('Old 1')) + tbl([tr([tc(p(r('cell')))])]) + p(end()) + p());
    const A = blocks(doc)[0];
    const c = blocks(doc)[1].rows[0].cells[0].blocks[0];
    const plan = planBlocks(doc, tocField(doc), entries(2));
    assert.deepEqual(plan.map({id: c.id, off: 2}), {id: A.id, off: 3});
    assert.deepEqual(plan.map({id: blocks(doc)[1].id, off: 0}),
      {id: A.id, off: 3});
  });
});
