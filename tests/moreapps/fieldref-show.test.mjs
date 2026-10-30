// What is DRAWN computed (Batch E3): only page-dependent or volatile
// fields; REF, NOTEREF, SEQ, PAGEREF and a body STYLEREF keep their
// stored result on screen (nothing recomputes on open) and change on
// Update only. A STYLEREF in a header or footer is drawn computed for
// each page (Word refreshes them as it lays the pages out) when the
// page carries its span (./FieldShow pageOn: the first and last body
// paragraph on it); with no span, or no value, its stored result is
// drawn as it was read (its runs, not one token).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley, boxesOf}
  from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {computedIn, pageOn}
  from '../../tools/moreapps/!Letters/FieldShow';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {updateCmd} from '../../tools/moreapps/!Letters/FieldCmd';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {evaluate, REGISTRY}
  from '../../tools/moreapps/!Letters/Fields';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';

before(loadStyles);
const FX = {now: new Date(2026, 9, 11, 14, 5)};
const H1 = '<w:pStyle w:val="Heading1"/>';
const lineTexts = (L) => L.items.flatMap((it) => (it.lines || [])
  .map((l) => l.items.map((x) => x.text).join('|')));

describe('the registry: which entries are drawn computed', () => {
  it('PAGE NUMPAGES SECTIONPAGES SECTION DATE TIME, and STYLEREF ' +
    'in a story only', async () => {
    const drawn = (story) => [...REGISTRY].filter(([, e]) =>
      e.shown !== false && (story || e.shown !== 'story') &&
      (e.pageDependent || e.volatile)).map(([k]) => k).sort();
    assert.deepEqual(drawn(false), ['DATE', 'NUMPAGES', 'PAGE',
      'SECTION', 'SECTIONPAGES', 'TIME']);
    assert.deepEqual(drawn(true), ['DATE', 'NUMPAGES', 'PAGE',
      'SECTION', 'SECTIONPAGES', 'STYLEREF', 'TIME']);
    assert.equal(REGISTRY.get('STYLEREF').pageDependent, true);
    assert.equal(REGISTRY.get('STYLEREF').shown, 'story');
    assert.equal(REGISTRY.get('PAGEREF').shown, false);
  });

  it('a paragraph with each registered field: only the six are ' +
    'shown computed', async () => {
    const codes = [...REGISTRY.keys()].map((k) => ` ${k} x `);
    const doc = await docWithFields(codes.map((c) =>
      p(fld(c, 'old'))).join(''));
    const shownNames = [];
    forEachBlock(doc, (b) => {
      if (b.type === 'p' && computedIn(doc, b).length)
        shownNames.push(b.text.length);
      return true;
    });
    assert.equal(shownNames.length, 6);
  });
});

describe('body STYLEREF is drawn stored, Update gives the new text', () => {
  it('Heading 1 New, STYLEREF stored Old', async () => {
    const doc = await docWithFields(p(r('New heading'), H1) +
      p(fld(' STYLEREF 1 ', 'Old heading')) +
      p(fld(' REF nothere ', 'stored ref')));
    const L = new DocLayout(doc, tm(), null, {fields: FX});
    L.layout(800);
    const ls = lineTexts(L);
    assert.ok(ls[1].includes('Old heading'), ls.join('/'));
    assert.ok(!ls[1].includes('New'), ls.join('/'));
    const f = scan(doc).find((x) => /STYLEREF/.test(x.instr));
    assert.equal(evaluate({doc}, f), 'New heading');
  });

  it('a footer STYLEREF on a page with its span: computed',
    async () => {
      const doc = await docWithFields(p(r('New heading'), H1),
        {default: {ftr: p(fld(' STYLEREF 1 ', 'Old head'))}});
      const L = new DocLayout(doc, tm(), null, {fields: FX});
      L.layout(800);
      const P = new Pages(printGalley(L));
      L.place = PlacePrint(L, P);
      const b = boxesOf(P.G, P.at(0), P).find((x) => x.kind === 'ftr');
      const t = lineTexts(b.lay.L).join('/');
      assert.ok(t.includes('New heading') && !t.includes('Old'), t);
    });

  it('REF and NOTEREF are drawn stored too', async () => {
    const doc = await docWithFields(
      p('<w:bookmarkStart w:id="1" w:name="b"/>' + r('fresh') +
        '<w:bookmarkEnd w:id="1"/>') +
      p(fld(' REF b ', 'stale')));
    const L = new DocLayout(doc, tm(), null, {fields: FX});
    L.layout(800);
    const t = lineTexts(L).join('/');
    assert.ok(t.includes('stale'), t);
    const f = scan(doc).find((x) => /REF/.test(x.instr));
    assert.equal(evaluate({doc}, f), 'fresh');
  });
});

const BR = '<w:r><w:br w:type="page"/></w:r>';
const F1 = 'word/footer1.xml';
/** doc laid out and paginated: {L, P} (fields FX, all done). */
function paged(doc, fields = FX) {
  const L = new DocLayout(doc, tm(), null, {fields});
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  L.place = PlacePrint(L, P);
  return {L, P};
}
/** The tokens of story kind on page i (the box's layout). */
const boxOf = (o, i, kind = 'ftr') => boxesOf(o.P.G, o.P.at(i), o.P)
  .find((x) => x.kind === kind);
const tokensOf = (L) => L.items.flatMap((it) => (it.lines || [])
  .flatMap((l) => l.items));

describe('pageOn: the span of a page', () => {
  it('first and last body paragraph, one continued counts',
    async () => {
    const long = r(Array.from({length: 1500}, () => 'word').join(' '));
    const doc = await docWithFields(p(r('A')) + p(long) +
      p(r('B')) + p(r('C') + BR) + p(r('D')));
    const o = paged(doc);
    const ids = doc.sections[0].blocks.map((b) => b.id);
    const spans = o.P.list.map((pg) => pageOn(pg).span);
    assert.deepEqual(spans[0], {first: ids[0], last: ids[1]});
    assert.ok(o.P.list.length >= 3, 'the long paragraph splits');
    // the page after the first starts inside the long paragraph
    assert.equal(spans[1].first, ids[1]);
    assert.equal(spans[spans.length - 1].last, ids[4]);
    const v = pageOn(o.P.list[0]);
    assert.ok(Object.isFrozen(v) && Object.isFrozen(v.span));
    assert.equal(pageOn(o.P.list[0]), v, 'memoised');
    assert.equal(v.num, 1);
    assert.equal(v.fmt, 'decimal');
  });

  it('a table: its paragraphs; a page of notes only: none',
    async () => {
      const doc = await docWithFields(tbl([tr([tc(p(r('c1'))),
        tc(p(r('c2')))])]) + p(r('after')));
      const o = paged(doc);
      const t = doc.sections[0].blocks[0];
      assert.deepEqual(pageOn(o.P.list[0]).span, {
        first: t.rows[0].cells[0].blocks[0].id,
        last: doc.sections[0].blocks[1].id});
      assert.equal(pageOn({num: 1, s: 0, fmt: 'decimal'}).span, null,
        'a page of no Pages');
    });
});

describe('STYLEREF in a header or footer, page by page', () => {
  const docOf = (ftr) => docWithFields(p(r('Alpha'), H1) +
    p(r('one') + BR) + p(r('Beta'), H1) + p(r('two')),
  {default: {ftr}});

  it('each page shows the first heading on it', async () => {
    const o = paged(await docOf(p(fld(' STYLEREF 1 ', 'Old head'))));
    assert.equal(o.P.list.length, 2);
    const t0 = lineTexts(boxOf(o, 0).lay.L).join('/');
    const t1 = lineTexts(boxOf(o, 1).lay.L).join('/');
    assert.ok(t0.includes('Alpha') && !t0.includes('Old'), t0);
    assert.ok(t1.includes('Beta') && !t1.includes('Old'), t1);
    const tok = tokensOf(boxOf(o, 1).lay.L).find((x) => x.field);
    assert.ok(tok && tok.text === 'Beta', 'one computed token');
  });

  it('no value (a bad switch) or no page: the stored runs as read',
    async () => {
      const two = fld(' STYLEREF 1 \\z ', null).replace(
        /<w:r><w:fldChar w:fldCharType="end"\/><\/w:r>$/, '') +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        r('Old ', '<w:b/>') + r('head') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      const o = paged(await docOf(p(two)));
      const toks = tokensOf(boxOf(o, 0).lay.L);
      assert.ok(!toks.some((x) => x.field), 'no computed token');
      assert.ok(toks.filter((x) => /Old|head/.test(x.text)).length >= 2,
        'the two runs');
      // the heights' layout (no page) draws the stored runs as well
      const q = paged(await docOf(p(fld(' STYLEREF 1 ', 'Old head'))));
      const plain = q.P.G.layoutOf(q.P.at(0).footer, 0);
      assert.ok(!tokensOf(plain.L).some((x) => x.field));
      assert.ok(lineTexts(plain.L).join('/').includes('Old head'));
    });

  it('a body STYLEREF stays stored with spans in the context',
    async () => {
      const doc = await docWithFields(p(r('New'), H1) +
        p(fld(' STYLEREF 1 ', 'Old')));
      const o = paged(doc);
      const ids = doc.sections[0].blocks.map((b) => b.id);
      const pageOf = new Map(ids.map((id) => [id,
        pageOn(o.P.list[0])]));
      const L = new DocLayout(doc, tm(), o.L, {fields: {...FX, pageOf,
        pages: {list: [{s: 0}]}}});
      L.layout(800);
      assert.ok(lineTexts(L).join('/').includes('Old'));
      assert.equal(computedIn(doc, doc.sections[0].blocks[1]).length,
        0, 'no show in the body');
    });

  it('Update field in the footer takes the mode page\'s heading',
    async () => {
      const doc = await docOf(p(fld(' STYLEREF 1 ', 'Old head')));
      const d = new Document(doc), t = new Typing(d);
      const o = paged(doc);
      const fa = facadeOf(d, F1, 0);
      const id = fa.doc.sections[0].blocks[0].id;
      const at = {id, off: 0};
      const out = t.command(() => updateCmd(fa, {anchor: at, head: at},
        {now: FX.now, page: pageOn(o.P.at(1)), pages: {finish: () =>
          o.P}}));
      assert.ok(out);
      const q = d.doc.stories.get(F1).blocks[0], f = scan(d.doc, F1)[0];
      assert.equal(q.text.slice(f.sep.off + 1, f.end.off), 'Beta');
    });
});
