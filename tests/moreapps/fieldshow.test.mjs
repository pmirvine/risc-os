// Field results shown computed (Batch D P8.3, D18, PG20, PG21, D37):
// a page-dependent or volatile field shows its value (the stored
// result in the model never changes); the result is ONE token and an
// atomic range for the caret and the keys (Review Focus 3); body page
// fields are laid out again once pagination knows their pages (two
// passes at most); a footer lays out once per distinct value, only
// for the pages painted; NUMPAGES shows the previous count until the
// pagination is done; a keystroke in a paragraph without fields runs
// no field code.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley, boxesOf}
  from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {stats} from '../../tools/moreapps/!Letters/StoryLayout';
import {Document} from '../../tools/moreapps/!Letters/Document';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {deleteBack, deleteForward}
  from '../../tools/moreapps/!Letters/EditDel';
import {typeText, splitPara} from '../../tools/moreapps/!Letters/Edit';
import {fieldText, computedIn, storyKey, countsOf, work}
  from '../../tools/moreapps/!Letters/FieldShow';
import {passOf} from '../../tools/moreapps/!Letters/FieldPass';
import {work as marksWork}
  from '../../tools/moreapps/!Letters/FieldMarks';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 11, 14, 5);
const FX = Object.freeze({now: NOW});
const F1 = 'word/footer1.xml';
const BR = '<w:r><w:br w:type="page"/></w:r>';
const lines = (n) => Array.from({length: n},
  (_, i) => p(r('line ' + i))).join('');
const breaks = (n, tag = 'page') => Array.from({length: n},
  (_, i) => p(r(tag + ' ' + i) + BR)).join('');

/** The texts of a layout's lines, item by item ('|' between). */
const lineTexts = (L) => L.items.flatMap((it) => (it.lines || [])
  .map((l) => l.items.map((x) => x.text).join('|')));
/** The items of L's lines that are computed results. */
const fieldItems = (L) => L.items.flatMap((it) => (it.lines || [])
  .flatMap((l) => l.items.filter((x) => x.field)));

/** doc laid out (fields FX) and paginated: {L, P}. */
function printed(doc, prev, fields = FX, P0) {
  const L = new DocLayout(doc, prev ? prev.metrics : tm(), prev,
    prev ? (fields === FX ? {} : {fields}) : {fields});
  L.layout(800);
  const P = new Pages(printGalley(L), P0);
  L.place = PlacePrint(L, P);
  return {L, P};
}
const footerText = (P, i) => {
  const b = boxesOf(P.G, P.at(i), P).find((x) => x.kind === 'ftr');
  return lineTexts(b.lay.L).join('/');
};

describe('FieldShow: results shown computed (D18)', () => {
  it('a footer PAGE stored 1 shows 3 on page 3; the model holds 1',
    async () => {
      const doc = await docWithFields(breaks(4),
        {default: {ftr: p(r('Page ') + fld(' PAGE ', '1'))}});
      const before = doc.stories.get(F1).blocks[0].text;
      const {P} = printed(doc);
      P.finish();
      assert.equal(P.count, 5);
      assert.equal(footerText(P, 0), 'Page ||||1|');
      assert.equal(footerText(P, 2), 'Page ||||3|');
      const b = boxesOf(P.G, P.at(2), P)[0];
      const [x] = fieldItems(b.lay.L);
      assert.equal(x.text, '3', 'one atomic token');
      assert.equal(x.shown, true);
      assert.deepEqual([x.from, x.to], [8, 9]);
      assert.equal(doc.stories.get(F1).blocks[0].text, before);
      assert.ok(before.includes('1'), 'the stored result kept');
    });

  it('page 12 in lowerRoman: one token, wider than the stored text',
    async () => {
      const doc = await docWithFields(breaks(12),
        {default: {ftr: p(fld(' PAGE \\* roman ', '1'))}});
      const {P} = printed(doc);
      P.finish();
      assert.equal(footerText(P, 11), '|||xii|');
    });

  it('a DATE field shows today (fixed now); without now: stored',
    async () => {
      const doc = await docWithFields(p(r('Today ') +
        fld(' DATE \\@ "d MMMM yyyy" ', 'old date') + r(' ok')) +
        p(r('At ') + fld(' TIME ', '9:00')));
      const L = new DocLayout(doc, tm(), null, {fields: FX});
      L.layout(800);
      assert.equal(lineTexts(L)[0], 'Today ||||11 October 2026|| ok');
      assert.equal(lineTexts(L)[1], 'At ||||14:05|');
      const N = new DocLayout(doc, tm());
      N.layout(800);
      assert.equal(lineTexts(N)[0], 'Today ||||old date|| ok',
        'the stored result, one token');
      assert.equal(fieldItems(N).length, 2);
    });

  it('a new clock (now) re-lays the date and time paragraphs only ' +
    '(P9 fix I2)', async () => {
    const doc = await docWithFields(p(r('Today ') +
      fld(' DATE \\@ "d MMMM yyyy" ', 'old date') + r(' ok')) +
      p(r('At ') + fld(' TIME ', '9:00')) + p(r('plain')));
    const L = new DocLayout(doc, tm(), null, {fields: FX});
    L.layout(800);
    const fx = {now: new Date(2026, 9, 12, 17, 42)};
    const N = new DocLayout(doc, L.metrics, L, {fields: fx});
    N.layout(800);
    assert.deepEqual(lineTexts(N).slice(0, 3), ['Today ||||12 October ' +
      '2026|| ok', 'At ||||17:42|', 'plain']);
    assert.equal(N.items[2].lines, L.items[2].lines, 'plain: adopted');
    const K = new DocLayout(doc, N.metrics, N, {fields: {...fx}});
    K.layout(800);
    assert.equal(K.items[1].lines, N.items[1].lines,
      'the same clock: adopted');
  });

  it('a page field in Draft view (no pages) shows its stored result',
    async () => {
      const doc = await docWithFields(p(r('p ') + fld(' PAGE ', '7')));
      const L = new DocLayout(doc, tm(), null, {fields: FX});
      L.layout(800);
      assert.equal(lineTexts(L)[0], 'p ||||7|');
      assert.equal(fieldText(L, L.items[0].block, 4).text, '7');
      assert.equal(fieldText(L, L.items[0].block, 3), null);
    });

  it('unknown and non-volatile fields show their stored text and ' +
    'stay editable', async () => {
      const doc = await docWithFields(p(r('Dear ') +
        fld(' MERGEFIELD Name ', 'Paul') + r(' and ') +
        fld(' AUTHOR ', 'Ann') + fld(' PAGE ', '1', {lock: true})));
      const d = new Document(doc);
      const L = new DocLayout(d.doc, tm(), null, {fields: FX});
      L.layout(800);
      assert.deepEqual(fieldItems(L), [], 'no computed result');
      const q = d.doc.sections[0].blocks[0];
      assert.deepEqual(computedIn(d.doc, q), []);
      assert.match(lineTexts(L)[0], /Paul/);
      const at = q.text.indexOf('Paul') + 2;
      const out = typeText(d, S.caret({id: q.id, off: at}), 'X');
      assert.notEqual(out, null);
      assert.match(d.doc.sections[0].blocks[0].text, /PaXul/);
    });
});

describe('FieldShow: the caret at the edge (Review Focus 3, PG21)',
  () => {
    // ab{ PAGE }cd: a0 b1 begin2 instr3 sep4 '1'5 '2'6 end7 c8 d9
    let d, id;
    const lay = () => {
      const L = new DocLayout(d.doc, tm(), null, {fields: FX});
      L.layout(800);
      return L;
    };
    const C = (off) => S.caret({id, off});
    const textNow = () => d.doc.sections[0].blocks[0].text;
    before(async () => {
      const doc = await docWithFields(p(r('ab') + fld(' PAGE ', '12') +
        r('cd')));
      d = new Document(doc);
      d.clearHistory();
      id = d.doc.sections[0].blocks[0].id;
    });

    it('Right steps over the computed range in one step, Left back',
      () => {
        const L = lay();
        let s = S.move(C(2), L, 'right');
        assert.equal(s.head.off, 8, 'past the end fldChar');
        s = S.move(s, L, 'right');
        assert.equal(s.head.off, 9);
        s = S.move(C(8), L, 'left');
        assert.equal(s.head.off, 2, 'before the begin fldChar');
        s = S.move(C(5), L, 'right');
        assert.equal(s.head.off, 8);
        const x = S.move(C(2), L, 'right', true);
        assert.deepEqual([x.anchor.off, x.head.off], [2, 8]);
      });

    it('a click in it puts the caret at its nearer edge: before the ' +
      'begin or after the end, never inside (M4)', () => {
        const L = lay(), it = L.items[0];
        const tok = it.lines[0].items.find((x) => x.field);
        const r0 = L.caretRect({id, off: 2}), y = r0.y + r0.h / 2;
        const hit = (x) => L.hitTest(x, y).pos;
        assert.deepEqual(hit(it.x + tok.x + 1), {id, off: 2});
        assert.deepEqual(hit(it.x + tok.x + tok.w - 1), {id, off: 8});
      });

    it('Backspace after it selects it; a second Backspace is refused',
      () => {
        const t0 = textNow(), n = d.undoDepth;
        const s1 = deleteBack(d, C(8));
        assert.deepEqual([s1.anchor.off, s1.head.off], [5, 7]);
        assert.equal(textNow(), t0, 'nothing changed');
        assert.equal(deleteBack(d, s1), null, 'refused (a beep)');
        assert.equal(textNow(), t0);
        assert.equal(d.undoDepth, n, 'no undo step');
        const s2 = deleteForward(d, C(2));
        assert.deepEqual([s2.anchor.off, s2.head.off], [5, 7]);
        assert.equal(deleteBack(d, C(7)).head.off, 7, 'from its end');
      });

    it('typing into it is refused; at its edges it goes outside',
      () => {
        const t0 = textNow();
        const sel = S.select({id, off: 5}, {id, off: 7});
        assert.equal(typeText(d, sel, 'X'), sel, 'refused: sel back');
        assert.equal(splitPara(d, sel), null, 'Enter refused');
        assert.equal(textNow(), t0);
        let out = typeText(d, C(7), 'X');
        assert.equal(textNow(), 'ab' + t0.slice(2, 8) + 'Xcd');
        assert.equal(out.head.off, 9);
        d.undo();
        out = typeText(d, C(5), 'Y');
        assert.equal(textNow(), 'abY' + t0.slice(2));
        d.undo();
        assert.equal(textNow(), t0);
      });

    it('the whole field selected is deleted by Backspace', () => {
      const L = lay();
      const x = S.move(C(2), L, 'right', true);
      const out = deleteBack(d, x);
      assert.equal(textNow(), 'abcd');
      assert.equal(out.head.off, 2);
      d.undo();
    });
  });

describe('FieldPass: body page fields after pagination (PG20)', () => {
  /** A doc whose paragraph n (`PAGE \# pic`, its result `stored`)
   *  is the last line of page 1 when laid out with that result. */
  async function nearEnd(pic, stored = '1') {
    const line = 'x'.repeat(66) + ' ';
    for (let n = 30; n < 90; n++) {
      const doc = await docWithFields(lines(n) + p(r(line) +
        fld(` PAGE \\# "${pic}" `, stored)) + lines(3));
      const {L, P} = printed(doc);
      P.finish();
      const it = L.items[n], next = L.items[n + 1];
      const pa = P.ofPos({id: it.id, off: 0});
      const pb = P.ofPos({id: next.id, off: 0});
      if (it.lines.length === 1 && pa === 0 && pb === 1) {
        return {doc, n, L, P};
      }
    }
    throw new Error('no such document');
  }

  /** Layouts as the window makes them until no pass is due. */
  function settle(doc, L, P) {
    let n = 1;
    for (let fx = passOf(L, P); fx && n < 10; fx = passOf(L, P)) {
      const N = new DocLayout(doc, L.metrics, L, {fields: fx});
      N.layout(800);
      P = new Pages(printGalley(N), P);
      P.finish();
      L = N;
      n++;
    }
    return {n, L, P};
  }

  it('a value as wide as the stored one: one more layout, shown',
    async () => {
    const {doc, n, L, P} = await nearEnd('0', '9');
    assert.match(lineTexts(L)[n], /\|9\|$/, 'stored');
    const s = settle(doc, L, P);
    assert.equal(s.n, 2, 'two layouts');
    assert.match(lineTexts(s.L)[n], /\|1\|$/);
    assert.equal(settle(doc, s.L, s.P).n, 1, 'settled: no more');
    const e = await nearEnd('0');
    assert.equal(settle(e.doc, e.L, e.P).n, 1,
      'stored 1 on page 1: no second layout');
  });

  it('a wider value moves the paragraph to the next page: two ' +
    'passes at most, the third difference left', async () => {
      const {doc, n, L, P} = await nearEnd('0000000000');
      assert.equal(lineTexts(L)[n].endsWith('|1|'), true, 'stored');
      const s = settle(doc, L, P);
      assert.equal(s.n, 2, 'two layouts, no third');
      assert.equal(s.P.ofPos({id: s.L.items[n].id, off: 0}), 1,
        'moved to page 2');
      assert.match(lineTexts(s.L).slice(n, n + 2).join('/'),
        /0000000001/, 'page 1\'s value left (PG20)');
      assert.equal(passOf(s.L, s.P), null);
    });

  it('the next edit starts again; a keystroke in another paragraph ' +
    'adopts its lines and runs no field code', async () => {
      const {doc, L, P} = await nearEnd('0', '9');
      const d = new Document(doc);
      const s = settle(d.doc, L, P);
      assert.equal(s.n, 2);
      const k = 2, m0 = marksWork.paras, w0 = {...work};
      d.apply({op: 'replaceText', block: [0, k], at: 0, del: 0,
        ins: 'x'});
      const t = printed(d.doc, s.L, FX, s.P);
      t.P.finish();
      assert.equal(passOf(t.L, t.P), null);
      assert.equal(marksWork.paras, m0, 'no paragraph scanned');
      assert.deepEqual({...work}, w0, 'no field list, no value');
    });

  it('an edit that moves the field to the next page: a pass is due ' +
    'again (the tries start again; P9.1 fix)', async () => {
      const {doc, n, L, P} = await nearEnd('0', '9');
      const d = new Document(doc);
      const s = settle(d.doc, L, P);
      assert.equal(s.n, 2);
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
        ins: 'word '.repeat(60)});
      const t = printed(d.doc, s.L, FX, s.P);
      t.P.finish();
      const id = t.L.items[n].id;
      assert.equal(t.P.ofPos({id, off: 0}), 1, 'now on page 2');
      const fx = passOf(t.L, t.P);
      assert.ok(fx, 'one more layout due');
      assert.equal(fx.pageOf.get(id).num, 2);
    });
});

describe('FieldShow: stories per page and counts (D13, D7, D37)',
  () => {
    it('1,500 pages with PAGE in the footer: one layout per value, ' +
      'only for the pages painted', async () => {
        const doc = await docWithFields(breaks(1499),
          {default: {ftr: p(r('Page ') + fld(' PAGE ', '1'))}});
        const {L, P} = printed(doc);
        const n0 = stats.laid;
        P.finish();
        assert.equal(P.count, 1500);
        assert.ok(stats.laid - n0 <= 2, `${stats.laid - n0} for heights`);
        const n1 = stats.laid, g = new Proxy({}, {get: (o, k) =>
          (k === 'measureText' ? () => ({width: 1}) : () => {}),
        set: () => true});
        for (const i of [700, 701, 702]) {
          paintPage(P, i, g, {place: L.place});
        }
        assert.equal(stats.laid - n1, 3, 'pages 701, 702, 703');
        paintPage(P, 701, g, {place: L.place});
        assert.equal(stats.laid - n1, 3, 'shared');
        assert.equal(footerText(P, 1499), 'Page ||||1500|');
      });

    it('NUMPAGES shows the previous count until done; the new one ' +
      '< 50 ms after it ends', async () => {
        const ftr = {default: {ftr: p(r('of ') +
          fld(' NUMPAGES ', '1'))}};
        const a = printed(await docWithFields(breaks(2), ftr));
        assert.equal(storyKey(a.L.doc, F1, {now: NOW, page: a.P.at(0),
          pages: countsOf(a.P)}), '\u00011', 'none done: stored');
        a.P.finish();
        assert.equal(footerText(a.P, 0), 'of ||||3|');
        const b = printed(await docWithFields(breaks(40), ftr), null,
          FX, a.P);
        b.P.at(0);
        assert.equal(b.P.done, false, 'still paginating');
        assert.equal(footerText(b.P, 0), 'of ||||3|', 'the old count');
        b.P.finish();
        const t0 = performance.now();
        const shown = footerText(b.P, 0);
        const ms = performance.now() - t0;
        assert.equal(shown, `of ||||${b.P.count}|`);
        assert.ok(b.P.count > 3);
        assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
      });
  });
