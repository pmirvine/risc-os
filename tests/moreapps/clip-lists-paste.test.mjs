// Lists, borders, shading and tab stops pasted from one !Word
// document into another (question L6, the owner's ruling: keep them,
// as Word does): the target gets new numbering definitions copied
// from the source's (./ClipNums, ./NumCopy) in the paste's one undo
// step; the pasted items show the source's labels; consecutive items
// of one source list share one new list; a target list is never
// joined; Strict and Transitional documents each get their own
// spelling; undo and redo give the target's numbering part back
// exactly; the written document is valid and reads back the same.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {lintPackage} from './lint-package.mjs';
import {write, schema} from './roundtrip-lib.mjs';
import {mk, P, C, SEL, blocks, texts} from './edit-docs.mjs';
import {p, r} from './build-docx.mjs';
import {item} from './list-fixtures.mjs';
import {sourceDocx, strictDocx, open, copyPaste, labelTexts, state}
  from './clip-lists-docs.mjs';

const {xsd, note} = schema();
const numIds = (d) => blocks(d).map((b) => (b.type === 'p' &&
  b.pPr.numPr ? b.pPr.numPr.numId : null));
/** The whole source but its last paragraph's text. */
const all = (s) => SEL(s, 0, 0, blocks(s).length - 1, 0);
const kids = (d) => d.doc.numbering.raw.children.filter((c) =>
  typeof c === 'object');
const names = (d) => kids(d).map((c) => c.name);
const dec = new TextDecoder();

/** Write, lint, check the schema, read back; the parts' texts. */
async function written(d) {
  const bytes = await write(d.doc);
  const z = await readZip(bytes);
  const errs = lintPackage(z).problems.filter((q) => q.level === 'error');
  assert.deepEqual(errs, [], 'package errors');
  const main = d.doc.meta.mainPart, numPart = d.doc.meta.numberingPart;
  if (xsd && d.doc.meta.conformance !== 'strict') {
    for (const n of [main, numPart]) {
      assert.deepEqual([...xsd.errors(z.get(n))], [], n + ' schema');
    }
  }
  const back = new (await import('../../tools/moreapps/!Word/Document'))
    .Document(await readDocx(bytes));
  assert.deepEqual(labelTexts(back), labelTexts(d), 'labels read back');
  assert.deepEqual(texts(back), texts(d));
  return {back, num: dec.decode(z.get(numPart)),
    main: dec.decode(z.get(main))};
}

describe('L6: a list pasted into a document without one', () => {
  it('makes the lists, labels as in the source, one undo step',
    async () => {
      const src = await open(await sourceDocx());
      const want = labelTexts(src).slice(0, 8);
      assert.deepEqual(want.slice(0, 6), ['1.', 'a.', '2.', '5.', '6.',
        null]);
      assert.ok(want[6] && want[7] && want[6] !== want[7], 'bullets');
      const dst = mk(['']);
      const before = state(dst);
      assert.equal(dst.doc.numbering, null);
      copyPaste(src, all(src), dst, C(dst, 0, 0));
      assert.equal(dst.undoDepth, 1, 'one undo step');
      // (a tab inline arrives as a tab character, as before)
      assert.deepEqual(texts(dst), [...texts(src).slice(0, 8), '']
        .map((t) => t.replace(/\ufffc/g, '\t')));
      assert.deepEqual(labelTexts(dst), [...want, null]);
      const ids = numIds(dst);
      // one new num per source list; consecutive items share it
      assert.deepEqual(ids, [1, 1, 1, 2, 2, null, 3, 3, null]);
      // numIds 2 and 3 shared an abstract: so do their copies
      assert.deepEqual(names(dst), ['w:abstractNum', 'w:abstractNum',
        'w:num', 'w:num', 'w:num']);
      const after = state(dst);
      dst.undo();
      assert.deepEqual(state(dst), before, 'undo: numbering, rels, meta');
      dst.redo();
      assert.deepEqual(state(dst), after, 'redo');
      const {num} = await written(dst);
      assert.match(num, /w:startOverride w:val="5"/);
    });
  it('borders, shading, tab stops, indents and alignment come too',
    async () => {
      const src = await open(await sourceDocx());
      const dst = mk(['']);
      copyPaste(src, all(src), dst, C(dst, 0, 0));
      const q = P(dst, 5).pPr, s = P(src, 5).pPr;
      for (const k of ['pBdr', 'shd', 'tabs', 'ind', 'jc'])
        assert.deepEqual(q[k], s[k], k);
      assert.ok(q.pBdr.left && q.shd.fill === 'FFFF00');
      const {main} = await written(dst);
      assert.match(main, /<w:pBdr><w:top [^>]*\/><w:left w:val="double"/);
      assert.match(main, /<w:tab w:val="right" w:leader="dot"/);
    });
  it('the new definitions: fresh nsid, no source style, the source ' +
    'levels', async () => {
      const src = await open(await sourceDocx());
      const dst = mk(['']);
      copyPaste(src, all(src), dst, C(dst, 0, 0));
      const [a0, a1] = kids(dst);
      const nsid = (a) => a.children[0];
      assert.equal(nsid(a0).name, 'w:nsid');
      assert.notEqual(nsid(a0).attrs[0][1], nsid(a1).attrs[0][1]);
      assert.equal(a0.children.filter((c) => c.name === 'w:lvl').length,
        9);
      const num = dst.doc.numbering.nums.get(1);
      assert.equal(num.levels[1].numFmt, 'lowerLetter');
    });
});

describe('L6: only whole paragraphs bring their formatting (review 2)',
  () => {
    it('a last item selected to its text\'s end takes the target ' +
      'paragraph\'s properties; one item\'s text alone is text', async () => {
      const src = await open(await sourceDocx());
      const dst = mk(['']);
      copyPaste(src, SEL(src, 0, 0, 2, 3), dst, C(dst, 0, 0));
      assert.deepEqual(labelTexts(dst), ['1.', 'a.', null]);
      const one = mk(['']);
      copyPaste(src, SEL(src, 0, 0, 0, 3), one, C(one, 0, 0));
      assert.deepEqual(labelTexts(one), [null]);
      assert.equal(one.doc.numbering, null);
      const box = mk(['']);
      copyPaste(src, SEL(src, 5, 0, 5, 5), box, C(box, 0, 0));
      assert.equal(P(box, 0).pPr.pBdr, undefined, 'text only');
    });
  });

describe('L6: into a document with lists of its own', () => {
  it('a new list, never joined to the target\'s; old nodes kept',
    async () => {
      const dst = await open(await sourceDocx({paras: [item('t1', 2),
        item('t2', 2), p('')]}));
      const old = kids(dst), before = state(dst);
      const src = await open(await sourceDocx());
      copyPaste(src, SEL(src, 0, 0, 3, 0), dst, C(dst, 2, 0));
      assert.deepEqual(texts(dst), ['t1', 't2', 'One', 'One a', 'Two',
        '']);
      // the target's list goes 1. 2., the pasted one starts at 1.
      assert.deepEqual(labelTexts(dst), ['1.', '2.', '1.', 'a.', '2.',
        null]);
      const ids = numIds(dst);
      assert.ok(ids[2] > 7 && ids[2] === ids[3] && ids[3] === ids[4]);
      const now = kids(dst);
      let at = 0;
      for (const c of old) {
        while (now[at] !== c) at++;
        assert.ok(at < now.length, 'an old node changed or lost');
      }
      assert.equal(now.length, old.length + 2);
      dst.undo();
      assert.deepEqual(state(dst), before);
      await written((dst.redo(), dst));
    });
  it('pasted in the middle of a target item: the text joins that item',
    async () => {
      const dst = await open(await sourceDocx({paras: [item('t1', 2)]}));
      const n = kids(dst).length;
      const src = await open(await sourceDocx());
      copyPaste(src, SEL(src, 0, 0, 0, 3), dst, C(dst, 0, 1));
      assert.deepEqual(texts(dst), ['tOne1']);
      assert.deepEqual(numIds(dst), [2]);
      assert.equal(kids(dst).length, n, 'nothing added');
    });
  it('the same copy pasted twice: two new lists', async () => {
    const src = await open(await sourceDocx());
    const dst = mk(['', '']);
    copyPaste(src, SEL(src, 0, 0, 1, 0), dst, C(dst, 0, 0));
    copyPaste(src, SEL(src, 0, 0, 1, 0), dst, C(dst, 2, 0));
    assert.deepEqual(numIds(dst), [1, null, 2, null]);
    assert.deepEqual(labelTexts(dst), ['1.', null, '1.', null]);
  });
});

describe('L6: Strict and Transitional', () => {
  it('Transitional source, Strict target: start / end', async () => {
    const src = await open(await sourceDocx());
    const dst = await open(await strictDocx(p('')));
    assert.equal(dst.doc.meta.conformance, 'strict');
    copyPaste(src, all(src), dst, C(dst, 0, 0));
    const lvl = kids(dst)[0].children.find((c) => c.name === 'w:lvl');
    const s = JSON.stringify(lvl);
    assert.ok(s.includes('"w:start","720"') && !s.includes('w:left'), s);
    assert.ok(s.includes('"w:lvlJc"') && s.includes('"start"'));
    assert.equal(P(dst, 5).pPr.jc, 'end');
    assert.equal(P(dst, 5).pPr.tabs[0].val, 'start');
    const {num, main} = await written(dst);
    assert.ok(!/w:left|"left"|"right"/.test(num + main), 'Strict names');
    assert.match(num, /purl\.oclc\.org/);
  });
  it('Strict source, Transitional target: left / right', async () => {
    const src = await open(await sourceDocx({strict: true}));
    assert.equal(src.doc.meta.conformance, 'strict');
    const dst = mk(['']);
    copyPaste(src, all(src), dst, C(dst, 0, 0));
    assert.deepEqual(labelTexts(dst).slice(0, 5), ['1.', 'a.', '2.',
      '5.', '6.']);
    assert.equal(P(dst, 5).pPr.jc, 'right');
    assert.equal(P(dst, 5).pPr.tabs[0].val, 'left');
    const {num, main} = await written(dst);
    assert.ok(!/w:start=|"start"/.test(num), num.slice(0, 400));
    assert.match(main, /<w:left w:val="double"/);
  });
});

describe('L6: the HTML and same-document routes are unchanged', () => {
  it('within the document the items stay in their own list', async () => {
    const src = await open(await sourceDocx());
    const before = kids(src).length;
    const {pasteBlocks} = await import(
      '../../tools/moreapps/!Word/ClipPaste');
    const {slice} = await import('../../tools/moreapps/!Word/ClipSlice');
    pasteBlocks(src, C(src, 8, 0), slice(src.doc, SEL(src, 0, 0, 1, 0))
      .blocks, {sameDoc: true});
    assert.equal(kids(src).length, before);
    assert.equal(P(src, 8).pPr.numPr.numId, 2);
  });
  if (!xsd) it('schema checks skipped: ' + note, () => {});
});
