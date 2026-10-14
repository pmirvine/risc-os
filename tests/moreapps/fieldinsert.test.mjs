// Insert > Page number, Date, Time and the Field box (Batch D P9.2,
// D19, PG23): insertFieldCmd puts in a complex field as Word writes
// it (begin, ONE instrText " CODE " with xml:space="preserve",
// separate, the result, end, in the caret's run format) and fills
// its result at once, in one undo step; an unknown name is put in
// with an empty result; editCodeCmd replaces a field's instrText
// inlines by one and updates the result; a field whose code holds
// another field is refused (PG23), and so is a field put in another
// field's code. FieldNames builds the codes the box offers.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {insertFieldCmd, editCodeCmd}
  from '../../tools/moreapps/!Letters/FieldCmd';
import {codeText, codeWhy, fieldFor, CODE_MAX}
  from '../../tools/moreapps/!Letters/FieldMake';
import {NAMES, formatsOf, codeOf, CODES}
  from '../../tools/moreapps/!Letters/FieldNames';
import {REGISTRY} from '../../tools/moreapps/!Letters/Fields';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {deepEqual, sameStories} from '../../tools/moreapps/!Letters/Model';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, fldSimple, docWithFields} from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 11, 14, 5);
const F1 = 'word/footer1.xml';
const BR = '<w:r><w:br w:type="page"/></w:r>';
const breaks = (n) => Array.from({length: n},
  (_, i) => p(r('page ' + i) + BR)).join('');
const caret = (pos) => ({anchor: pos, head: pos});
const hash = (s) => s.replace(/￼/g, '#');

function opened(doc) {
  const d = new Document(doc);
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L));
  L.place = PlacePrint(L, P);
  return {d, L, P, t: new Typing(d)};
}
const ctxOf = (o, more = {}) => ({now: NOW, meta: {creator: 'Paul'},
  pages: {finish: () => o.P.finish()}, ...more});
const snap = (doc) => ({sections: doc.sections.map((x) => ({...x,
  blocks: x.blocks.slice()})), stories: doc.stories});
function undoneTo(d, s) {
  d.undo();
  assert.ok(deepEqual(d.doc.sections, s.sections), 'body undone');
  assert.ok(sameStories(d.doc.stories, s.stories), 'stories undone');
}
const body = (d, i) => d.doc.sections[0].blocks[i];
const docXml = async (doc) => new TextDecoder().decode(
  (await readZip(await writeDocx(doc))).get('word/document.xml'));

describe('insertFieldCmd (D19)', () => {
  it('PAGE on page 3: Word\'s XML shape, filled at once, one step',
    async () => {
      const doc = await docWithFields(breaks(2) +
        p(r('Page ', '<w:b/>') + r('x')));
      const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
      const id = body(o.d, 2).id;
      const out = o.t.command(() => insertFieldCmd(o.d,
        caret({id, off: 5}), 'PAGE \\* MERGEFORMAT', ctxOf(o)));
      assert.ok(out, 'put in');
      const q = body(o.d, 2);
      assert.equal(hash(q.text), 'Page ###3#x');
      assert.deepEqual(out.head, {id, off: 10}, 'caret after the end');
      assert.equal(o.d.undoDepth, n0 + 1, 'one undo step');
      const [f] = scan(o.d.doc);
      assert.equal(f.instr, ' PAGE \\* MERGEFORMAT ');
      assert.ok(q.runs.filter((x) => x.start < 10 && x.end > 5)
        .every((x) => x.rPr.b), 'all in the caret\'s run format (bold)');
      const xml = await docXml(o.d.doc);
      // (the writer writes a run's inlines in its w:r, as for every
      // field it writes: one w:r of the caret's format holds them)
      assert.ok(xml.includes('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space=' +
        '"preserve">Page </w:t><w:fldChar w:fldCharType="begin"/>' +
        '<w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT ' +
        '</w:instrText><w:fldChar w:fldCharType="separate"/><w:t>3</w:t>' +
        '<w:fldChar w:fldCharType="end"/></w:r>'), xml);
      await lintAfter(o.d.doc, 'PAGE put in');
      const back = await readDocx(await writeDocx(o.d.doc));
      assert.equal(scan(back)[0].instr, ' PAGE \\* MERGEFORMAT ');
      undoneTo(o.d, s0);
    });

  it('DATE and TIME with pictures; NUMPAGES after the last page',
    async () => {
      const doc = await docWithFields(p(r('a')) + breaks(3));
      const o = opened(doc), id = body(o.d, 0).id;
      let sel = caret({id, off: 1});
      for (const c of [CODES.date, CODES.time, CODES.pages]) {
        sel = o.t.command(() => insertFieldCmd(o.d, sel, c, ctxOf(o)));
      }
      assert.equal(hash(body(o.d, 0).text),
        'a###11/10/2026####14:05####4#');
      assert.deepEqual(scan(o.d.doc).map((f) => f.instr), [
        ' DATE \\@ "dd/MM/yyyy" \\* MERGEFORMAT ',
        ' TIME \\@ "HH:mm" \\* MERGEFORMAT ',
        ' NUMPAGES \\* MERGEFORMAT ']);
    });

  it('an unknown name: put in with an empty result', async () => {
    const doc = await docWithFields(p(r('ab')));
    const o = opened(doc), id = body(o.d, 0).id;
    const out = insertFieldCmd(o.d, caret({id, off: 1}),
      '  FOO bar  ', ctxOf(o));
    assert.deepEqual(out.head, {id, off: 5});
    assert.equal(hash(body(o.d, 0).text), 'a####b');
    const [f] = scan(o.d.doc);
    assert.equal(f.instr, ' FOO bar ');
    assert.ok(f.sep, 'with its separate');
    await lintAfter(o.d.doc, 'FOO');
  });

  it('a selection is replaced by the field', async () => {
    const doc = await docWithFields(p(r('one two three')));
    const o = opened(doc), id = body(o.d, 0).id, n0 = o.d.undoDepth;
    const out = o.t.command(() => insertFieldCmd(o.d,
      {anchor: {id, off: 4}, head: {id, off: 7}}, CODES.page,
      ctxOf(o)));
    assert.equal(hash(body(o.d, 0).text), 'one ###1# three');
    assert.deepEqual(out.head, {id, off: 9});
    assert.equal(o.d.undoDepth, n0 + 1, 'one step for both');
  });

  it('refused: empty or bad codes, a caret in another field\'s code',
    async () => {
      const doc = await docWithFields(p(r('a') + fld(' IF 1 = 1 ', 'x')));
      const o = opened(doc), s0 = snap(doc), id = body(o.d, 0).id;
      const n0 = o.d.undoDepth;
      for (const c of ['', '   ', 'A\tB', 'X\nY', 'x'.repeat(CODE_MAX + 1),
        'a￼b', null, 7]) {
        assert.equal(insertFieldCmd(o.d, caret({id, off: 0}), c,
          ctxOf(o)), null, JSON.stringify(c));
      }
      assert.ok(codeText('x'.repeat(CODE_MAX)), 'at the cap');
      // the Field box's message for each (P9 fix M3)
      assert.equal(codeWhy('PAGE'), '');
      assert.equal(codeWhy('x'.repeat(CODE_MAX)), '');
      assert.match(codeWhy(''), /^Type a field code/);
      assert.match(codeWhy('   '), /^Type a field code/);
      assert.match(codeWhy(null), /^Type a field code/);
      assert.match(codeWhy('x'.repeat(CODE_MAX + 1)),
        new RegExp(`at most ${CODE_MAX} characters`));
      for (const c of ['A\tB', 'X\nY', 'a￼b']) {
        assert.match(codeWhy(c), /tab, a line end or a picture/);
      }
      // offsets: a=0 begin=1 instr=2 sep=3 x=4 end=5
      for (const off of [2, 3]) {
        assert.equal(o.t.command(() => insertFieldCmd(o.d,
          caret({id, off}), 'PAGE', ctxOf(o))), null, 'in the code ' + off);
      }
      assert.equal(o.d.undoDepth, n0, 'no step');
      assert.ok(deepEqual(o.d.doc.sections, s0.sections), 'unchanged');
      assert.ok(insertFieldCmd(o.d, caret({id, off: 4}), 'PAGE',
        ctxOf(o)), 'in an unknown field\'s result: allowed (Word)');
    });

  it('in a footer through the facade: the mode\'s page', async () => {
    const doc = await docWithFields(breaks(3),
      {default: {ftr: p(r('Foot '))}});
    const o = opened(doc), s0 = snap(doc);
    const fa = facadeOf(o.d, F1, 0);
    const id = fa.doc.sections[0].blocks[0].id;
    const out = o.t.command(() => insertFieldCmd(fa,
      caret({id, off: 5}), CODES.page, ctxOf(o, {page: o.P.at(1)})));
    assert.ok(out);
    assert.equal(hash(o.d.doc.stories.get(F1).blocks[0].text),
      'Foot ###2#');
    assert.ok(deepEqual(o.d.doc.sections, s0.sections), 'body untouched');
    await lintAfter(o.d.doc, 'footer field');
    undoneTo(o.d, s0);
  });
});

describe('editCodeCmd (D19, PG23)', () => {
  it('a DATE field\'s code made \\@ "yyyy": one instrText, updated',
    async () => {
      const doc = await docWithFields(p(r('d ') +
        fld(' DATE ', '01/01/2000') + r(' z')));
      const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
      const id = body(o.d, 0).id;
      const [f0] = scan(o.d.doc);
      const sel = {anchor: {id, off: f0.begin.off},
        head: {id, off: f0.end.off + 1}};
      assert.equal(fieldFor(o.d.doc, sel), f0, 'the whole field');
      const out = o.t.command(() => editCodeCmd(o.d, sel,
        'DATE \\@ "yyyy"', ctxOf(o)));
      assert.ok(out);
      const [f] = scan(o.d.doc);
      assert.equal(f.instr, ' DATE \\@ "yyyy" ');
      assert.equal(hash(body(o.d, 0).text), 'd ###2026# z');
      assert.deepEqual(out.head, {id, off: f.end.off + 1});
      assert.equal(o.d.undoDepth, n0 + 1, 'one step');
      const xml = await docXml(o.d.doc);
      assert.match(xml, /<w:instrText xml:space="preserve"> DATE \\@ "yyyy" <\/w:instrText>/);
      await lintAfter(o.d.doc, 'code edited');
      undoneTo(o.d, s0);
    });

  it('fieldFor: a caret in the code or the whole field selected; ' +
    'not a part of its result (P9 fix M1)', async () => {
    const doc = await docWithFields(p(r('See ') +
      fld(' REF bm1 \\h ', 'Section two') + r(' end')));
    const id = doc.sections[0].blocks[0].id;
    const at = (a, b = a) => fieldFor(doc, {anchor: {id, off: a},
      head: {id, off: b}});
    // 'See ###Section two#': begin 4, instr 5, sep 6, result 7..17,
    // end 18
    const [f] = scan(doc);
    assert.equal(at(5), f, 'the caret in the code');
    assert.equal(at(6), f, 'the caret at the code\'s end');
    assert.equal(at(4, 19), f, 'the whole field');
    assert.equal(at(19, 4), f, 'the whole field, backwards');
    for (const [a, b] of [[4], [7], [9], [18], [19], [9, 13], [7, 18],
      [5, 19], [4, 18], [3, 19], [4, 20]]) {
      assert.equal(at(a, b), null, `${a}..${b}`);
    }
  });

  it('several instrText runs become one; a caret in the code',
    async () => {
      const doc = await docWithFields(p(fld(' MERGEFIELD ', 'old') +
        r(' z')));
      // split the instruction in two runs by hand
      const two = await docWithFields(p('<w:r><w:fldChar w:fldCharType=' +
        '"begin"/></w:r><w:r><w:instrText xml:space="preserve"> AUT' +
        '</w:instrText></w:r><w:r><w:instrText>HOR </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>x' +
        '</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'));
      const o = opened(two), id = body(o.d, 0).id;
      assert.equal(scan(o.d.doc)[0].instr, ' AUTHOR ');
      const out = editCodeCmd(o.d, caret({id, off: 2}), 'AUTHOR \\* Upper',
        ctxOf(o));
      assert.ok(out);
      assert.equal(hash(body(o.d, 0).text), '###PAUL#');
      assert.equal(scan(o.d.doc)[0].instr, ' AUTHOR \\* Upper ');
      // an unknown name: the code changed, the stored result kept
      const q = opened(doc), qid = body(q.d, 0).id;
      assert.equal(editCodeCmd(q.d, caret({id: qid, off: 4}),
        'MERGEFIELD Name', ctxOf(q)), null, 'a caret in its result');
      assert.ok(editCodeCmd(q.d, caret({id: qid, off: 2}),
        'MERGEFIELD Name', ctxOf(q)));
      assert.equal(hash(body(q.d, 0).text), '###old# z');
      assert.equal(scan(q.d.doc)[0].instr, ' MERGEFIELD Name ');
    });

  it('a fldSimple: w:instr changed in a new node', async () => {
    const doc = await docWithFields(p(r('p ') +
      fldSimple(' AUTHOR ', 'x')));
    const o = opened(doc), id = body(o.d, 0).id;
    const [f0] = scan(o.d.doc);
    assert.equal(fieldFor(o.d.doc, caret({id, off: 2})), null,
      'a caret before it: not in it');
    const out = editCodeCmd(o.d, {anchor: {id, off: 2},
      head: {id, off: 3}}, 'AUTHOR \\* Upper', ctxOf(o));
    assert.ok(out);
    const [f] = scan(o.d.doc);
    assert.notEqual(f.simple.node, f0.simple.node);
    assert.equal(f.instr, ' AUTHOR \\* Upper ');
    assert.equal(body(o.d, 0).inlines[2].text, 'PAUL');
    await lintAfter(o.d.doc, 'fldSimple code');
  });

  it('nested: a code holding another field is refused (PG23)',
    async () => {
      const doc = await docWithFields(p(fld('IF {} = 1 "a" "b"', 'b',
        {nested: fld(' PAGE ', '1')})));
      const o = opened(doc), s0 = snap(doc), n0 = o.d.undoDepth;
      const id = body(o.d, 0).id, [f] = scan(o.d.doc);
      const sel = {anchor: {id, off: f.begin.off},
        head: {id, off: f.end.off + 1}};
      assert.equal(o.t.command(() => editCodeCmd(o.d, sel,
        'IF 1 = 1 "a" "b"', ctxOf(o))), null);
      assert.equal(o.d.undoDepth, n0);
      assert.ok(deepEqual(o.d.doc.sections, s0.sections));
    });

  it('refused: no field, a bad code; the same code: no step',
    async () => {
      const doc = await docWithFields(p(r('ab') + fld(' AUTHOR ', 'Paul')));
      const o = opened(doc), id = body(o.d, 0).id, n0 = o.d.undoDepth;
      assert.equal(editCodeCmd(o.d, caret({id, off: 1}), 'PAGE',
        ctxOf(o)), null, 'no field');
      assert.equal(editCodeCmd(o.d, caret({id, off: 4}), ' ',
        ctxOf(o)), null, 'empty');
      const out = o.t.command(() => editCodeCmd(o.d, caret({id, off: 4}),
        'AUTHOR', ctxOf(o)));
      assert.ok(out, 'not refused');
      assert.equal(o.d.undoDepth, n0, 'no step');
    });
});

describe('FieldNames: the box\'s names, formats and codes', () => {
  it('every name offered has an evaluator', () => {
    assert.equal(NAMES.length, 12);
    for (const n of NAMES) assert.ok(REGISTRY.has(n), n);
  });

  it('codes as Word\'s Field box writes them', () => {
    assert.equal(codeOf('PAGE'), 'PAGE \\* MERGEFORMAT');
    assert.equal(codeOf('PAGE', 'roman'), 'PAGE \\* roman \\* MERGEFORMAT');
    assert.equal(codeOf('DATE', 'd MMMM yyyy'),
      'DATE \\@ "d MMMM yyyy" \\* MERGEFORMAT');
    assert.equal(codeOf('AUTHOR', 'upper'),
      'AUTHOR \\* Upper \\* MERGEFORMAT');
    assert.equal(codeOf('AUTHOR', 'roman'), 'AUTHOR \\* MERGEFORMAT',
      'a format of another kind: none');
    assert.equal(codeOf(''), '');
    assert.equal(codeOf('__proto__'), '__proto__ \\* MERGEFORMAT');
    assert.deepEqual(formatsOf('__proto__').map((x) => x.id), ['none']);
    assert.deepEqual(formatsOf('FOO').map((x) => x.id), ['none']);
    assert.equal(formatsOf('TIME')[0].id, 'none');
  });
});
