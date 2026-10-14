// Fields (Batch D P8.2, D17): the registry of evaluators and
// evaluate(ctx, f). Page fields from real Pages (a lowerRoman
// section starting at 2, two sections), DATE and TIME from an
// injected now (PG18's dd/MM/yyyy when there is no \@), document
// properties from docProps/core.xml (read-only, tolerant), FILENAME
// from the RISC OS path, NUMWORDS from WordCount; every name without
// an evaluator (PAGEREF, TOC, MERGEFIELD, INCLUDETEXT, DDE...) and a
// locked field give null: never evaluated.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {REGISTRY, evaluate} from '../../tools/moreapps/!Letters/Fields';
import {coreOf, CORE_MAX_BYTES, CORE_MAX_ELEMENTS, CORE_MAX_TEXT}
  from '../../tools/moreapps/!Letters/FieldDates';
import {scan} from '../../tools/moreapps/!Letters/FieldScan';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {buildDocx, documentXml, p, r, REL}
  from './build-docx.mjs';
import {docLayout} from './page-fixtures.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';
import {mkDoc, para} from './word-docs.mjs';
import {freeze} from './story-fixtures.mjs';

const NOW = new Date(2026, 9, 11, 14, 5, 9);
const F = (instr, o = {}) => ({instr, lock: false, ...o});
const P_ = (t, pPr = '') => `<w:p>${pPr ? '<w:pPr>' + pPr +
  '</w:pPr>' : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
const PBB = '<w:pageBreakBefore/>';
const SECT = (inner = '') => `<w:sectPr>${inner}</w:sectPr>`;
const ROMAN2 = '<w:pgNumType w:fmt="lowerRoman" w:start="2"/>';

const PKG = 'http://schemas.openxmlformats.org/package/2006/' +
  'metadata/core-properties';
const coreXml = (inner) => '<?xml version="1.0" encoding="UTF-8" ' +
  `standalone="yes"?>\n<cp:coreProperties xmlns:cp="${PKG}" ` +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:dcterms="http://purl.org/dc/terms/" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + inner +
  '</cp:coreProperties>';
const CORE = coreXml('<dc:title>Annual &amp; report</dc:title>' +
  '<dc:subject>Sales</dc:subject><dc:creator>Ann Smith</dc:creator>' +
  '<cp:keywords>one, two</cp:keywords>' +
  '<cp:lastModifiedBy>Bob Jones</cp:lastModifiedBy>' +
  '<cp:lastPrinted>2026-01-02T03:04:00Z</cp:lastPrinted>' +
  '<dcterms:created xsi:type="dcterms:W3CDTF">2025-12-25T10:00:00Z' +
  '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' +
  '2026-03-04T05:06:00Z</dcterms:modified>');

const withCore = async (core, opts = {}) => freeze(await readDocx(
  await buildDocx({'word/document.xml': documentXml(p(r('x'))),
    [opts.name || 'docProps/core.xml']: core}, opts)));
const ev = (ctx, instr, o) => evaluate(ctx, F(instr, o));
const local = (iso) => {
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/` +
    `${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
};

/** Paginated: {doc, P} (finished). */
async function paged(body) {
  const {G, doc} = await docLayout(body);
  return {doc, P: new Pages(G).finish()};
}

describe('Fields: the registry (D17)', () => {
  it('holds Batch D\'s names with their flags', () => {
    assert.deepEqual([...REGISTRY.keys()].sort(), ['AUTHOR',
      'CREATEDATE', 'DATE', 'FILENAME', 'KEYWORDS', 'LASTSAVEDBY',
      'NUMPAGES', 'NUMWORDS', 'PAGE', 'PRINTDATE', 'SAVEDATE',
      'SECTION', 'SECTIONPAGES', 'SUBJECT', 'TIME', 'TITLE']);
    const page = ['PAGE', 'NUMPAGES', 'SECTIONPAGES', 'SECTION'];
    for (const [name, e] of REGISTRY) {
      assert.equal(typeof e.eval, 'function', name);
      assert.equal(e.pageDependent, page.includes(name), name);
      assert.equal(e.volatile, ['DATE', 'TIME'].includes(name), name);
    }
  });

  it('no evaluator, never evaluated: PAGEREF TOC MERGEFIELD ' +
    'INCLUDETEXT DDE and the rest give null', () => {
    const ctx = {doc: mkDoc([para('x')]), now: NOW, path: 'a.b'};
    for (const instr of [' PAGEREF _Toc1 \\h ', ' TOC \\o "1-3" ',
      ' MERGEFIELD Name ', ' INCLUDETEXT "c:\\\\x.doc" ',
      ' DDE Excel "S" ', ' DDEAUTO a b ', ' REF x ', ' SEQ Fig ',
      ' IF 1 = 1 "a" "b" ', ' = 1 + 2 ', ' HYPERLINK "x" ',
      ' INCLUDEPICTURE "x" ', ' MACROBUTTON x ', ' __proto__ ',
      ' constructor ', ' toString ', '', '   ', ' "PAGE" ']) {
      assert.equal(ev(ctx, instr), null, instr);
    }
  });

  it('a locked field gives null', () => {
    const ctx = {doc: mkDoc([para('x')]), now: NOW};
    assert.equal(ev(ctx, ' DATE '), '11/10/2026');
    assert.equal(ev(ctx, ' DATE ', {lock: true}), null);
  });

  it('odd contexts and fields give null, never throw', () => {
    for (const [ctx, f] of [[null, F(' DATE ')],
      [{now: NOW}, null], [{now: NOW}, {}], [{now: NOW}, F(42)],
      [{now: 'today'}, F(' DATE ')], [{now: new Date(NaN)},
        F(' DATE ')], [{}, F(' PAGE ')], [{}, F(' NUMPAGES ')],
      [{page: {}}, F(' PAGE ')], [{}, F(' AUTHOR ')],
      [{doc: {}}, F(' NUMWORDS ')], [{}, F(' FILENAME ')],
      [{path: ''}, F(' FILENAME ')]]) {
      assert.equal(evaluate(ctx, f), null, JSON.stringify(f));
    }
  });
});

describe('Fields: page fields', () => {
  const FOUR = P_('a') + P_('b', PBB) + P_('c', PBB) + P_('d', PBB) +
    SECT(ROMAN2);

  it('PAGE on page 4 of a lowerRoman section starting at 2: v',
    async () => {
      const {doc, P} = await paged(FOUR);
      assert.equal(P.count, 4);
      const ctx = (i) => ({doc, pages: P, page: P.at(i), now: NOW});
      assert.equal(ev(ctx(3), ' PAGE '), 'v');
      assert.equal(ev(ctx(0), ' PAGE \\* MERGEFORMAT '), 'ii');
      assert.equal(ev(ctx(3), ' PAGE \\* Arabic '), '5');
      assert.equal(ev(ctx(3), ' PAGE \\* ROMAN '), 'V');
      assert.equal(ev(ctx(3), ' PAGE \\* Upper '), 'V');
      assert.equal(ev(ctx(3), ' PAGE \\* Ordinal '), '5th');
      assert.equal(ev(ctx(3), ' PAGE \\# "00" '), '05');
      assert.equal(ev(ctx(3), ' NUMPAGES '), '4');
      assert.equal(ev(ctx(3), ' NUMPAGES \\* roman '), 'iv');
      assert.equal(ev(ctx(3), ' SECTIONPAGES '), '4');
      assert.equal(ev(ctx(3), ' SECTION '), '1');
    });

  it('two sections: SECTIONPAGES and SECTION are the page\'s',
    async () => {
      const {doc, P} = await paged(P_('a') + P_('b', PBB +
        SECT('<w:type w:val="nextPage"/>')) + P_('c') + P_('d', PBB) +
        P_('e', PBB));
      assert.equal(P.count, 5);
      const ctx = (i) => ({doc, pages: P, page: P.at(i), now: NOW});
      assert.deepEqual([0, 1, 2, 4].map((i) => [ev(ctx(i), 'PAGE'),
        ev(ctx(i), 'SECTIONPAGES'), ev(ctx(i), 'SECTION'),
        ev(ctx(i), 'NUMPAGES')]), [['1', '2', '1', '5'],
        ['2', '2', '1', '5'], ['3', '3', '2', '5'],
        ['5', '3', '2', '5']]);
    });

  it('no pages (Draft): page fields give null; SECTION from ' +
    'ctx.section', () => {
    const ctx = {doc: mkDoc([para('x')]), now: NOW, section: 2};
    for (const n of ['PAGE', 'NUMPAGES', 'SECTIONPAGES']) {
      assert.equal(ev(ctx, n), null, n);
    }
    assert.equal(ev(ctx, 'SECTION'), '3');
    assert.equal(ev({...ctx, section: -1}, 'SECTION'), null);
    assert.equal(ev({...ctx, section: 1.5}, 'SECTION'), null);
  });
});

describe('Fields: dates and times', () => {
  const ctx = {doc: mkDoc([para('x')]), now: NOW};

  it('DATE without \\@: dd/MM/yyyy (PG18); with \\@ its picture',
    () => {
      assert.equal(ev(ctx, ' DATE '), '11/10/2026');
      assert.equal(ev(ctx, ' DATE \\@ "dddd d MMMM yyyy" '),
        'Sunday 11 October 2026');
      assert.equal(ev(ctx, ' DATE \\@ "d MMMM" \\* Upper '),
        '11 OCTOBER');
      assert.equal(ev(ctx, ' DATE \\@ "d \'of\' MMMM" '),
        '11 of October');
      assert.equal(ev(ctx, ' DATE \\@ "\'bad" '), null);
      assert.equal(ev(ctx, ' DATE \\@ '), '11/10/2026');
    });

  it('TIME: HH:mm by default and with \\@', () => {
    assert.equal(ev(ctx, ' TIME '), '14:05');
    assert.equal(ev(ctx, ' TIME \\@ "HH:mm" '), '14:05');
    assert.equal(ev(ctx, ' TIME \\@ "h:mm am/pm" '), '2:05 pm');
  });

  it('a field found by FieldScan evaluates the same', async () => {
    const doc = await docWithFields(p(r('Today ') +
      fld(' DATE \\@ "d MMM yyyy" \\* MERGEFORMAT ', 'old')));
    const [f] = scan(doc);
    assert.equal(evaluate({doc, now: NOW}, f), '11 Oct 2026');
  });

  it('CREATEDATE, SAVEDATE, PRINTDATE from core.xml', async () => {
    const doc = await withCore(CORE);
    const c = {doc, now: NOW};
    assert.equal(ev(c, 'CREATEDATE'), local('2025-12-25T10:00:00Z'));
    assert.equal(ev(c, 'SAVEDATE'), local('2026-03-04T05:06:00Z'));
    assert.equal(ev(c, 'PRINTDATE'), local('2026-01-02T03:04:00Z'));
    assert.equal(ev(c, 'CREATEDATE \\@ "yyyy"'), '2025');
  });

  it('a date core.xml does not have: null (the stored result)',
    async () => {
      const doc = await withCore(coreXml('<dc:creator>A</dc:creator>' +
        '<dcterms:created>not a date</dcterms:created>'));
      for (const n of ['CREATEDATE', 'SAVEDATE', 'PRINTDATE']) {
        assert.equal(ev({doc, now: NOW}, n), null, n);
      }
    });
});

describe('Fields: document properties (core.xml)', () => {
  it('AUTHOR, TITLE, SUBJECT, KEYWORDS, LASTSAVEDBY', async () => {
    const doc = await withCore(CORE);
    const c = {doc, now: NOW};
    assert.equal(ev(c, 'AUTHOR'), 'Ann Smith');
    assert.equal(ev(c, 'AUTHOR \\* Upper'), 'ANN SMITH');
    assert.equal(ev(c, 'TITLE'), 'Annual & report');
    assert.equal(ev(c, 'SUBJECT'), 'Sales');
    assert.equal(ev(c, 'KEYWORDS'), 'one, two');
    assert.equal(ev(c, 'LASTSAVEDBY'), 'Bob Jones');
  });

  it('a property field with a new value (Word would set it): null',
    async () => {
      const doc = await withCore(CORE);
      assert.equal(ev({doc}, 'AUTHOR "Someone Else"'), null);
      assert.equal(ev({doc}, 'TITLE New'), null);
    });

  it('missing core.xml: \'\'', async () => {
    const doc = freeze(await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x')))})));
    assert.equal(doc.parts.has('docProps/core.xml'), false);
    for (const n of ['AUTHOR', 'TITLE', 'SUBJECT', 'KEYWORDS',
      'LASTSAVEDBY']) {
      assert.equal(ev({doc}, n), '', n);
    }
    assert.equal(ev({doc: mkDoc([para('x')])}, 'AUTHOR'), '');
  });

  it('core.xml found through the package relationship', async () => {
    const doc = await withCore(CORE, {name: 'meta/props.xml',
      pkgRels: [['rId1', REL('officeDocument'), 'word/document.xml'],
        ['rId2', PKG.replace('metadata/', 'relationships/metadata/'),
          '/meta/props.xml']]});
    assert.equal(ev({doc}, 'AUTHOR'), 'Ann Smith');
  });

  it('ctx.meta, when given, is used in place of core.xml',
    async () => {
      const doc = await withCore(CORE);
      assert.equal(ev({doc, meta: {creator: 'Me'}}, 'AUTHOR'), 'Me');
      assert.equal(ev({doc, meta: {}}, 'TITLE'), '');
    });

  it('read-only: the bytes and the doc are unchanged; memoised',
    async () => {
      const doc = await withCore(CORE);
      const before = new Uint8Array(doc.parts.get('docProps/core.xml'));
      assert.equal(coreOf(doc), coreOf(doc));
      assert.ok(Object.isFrozen(coreOf(doc)));
      assert.deepEqual(doc.parts.get('docProps/core.xml'), before);
    });

  it('hostile core.xml: tolerated, never thrown', async () => {
    const big = coreXml('<dc:creator>' + 'a'.repeat(CORE_MAX_BYTES) +
      '</dc:creator>');
    const many = coreXml('<dc:creator>Z</dc:creator>' +
      '<x/>'.repeat(CORE_MAX_ELEMENTS + 1));
    const deep = coreXml('<a>'.repeat(300) + '</a>'.repeat(300));
    for (const bad of ['not xml <', coreXml('<dc:creator>A'), big,
      many, deep, new Uint8Array([0xff, 0xfe, 0x00]), '']) {
      const doc = await withCore(bad);
      assert.equal(ev({doc}, 'AUTHOR'), '');
      assert.equal(ev({doc}, 'CREATEDATE'), null);
    }
    const ok = await withCore(coreXml('<dc:creator>Z</dc:creator>' +
      '<x/>'.repeat(CORE_MAX_ELEMENTS - 10)));
    assert.equal(ev({doc: ok}, 'AUTHOR'), 'Z');
    const long = await withCore(coreXml('<dc:creator>' +
      'b'.repeat(CORE_MAX_TEXT + 1) + '</dc:creator>'));
    assert.equal(ev({doc: long}, 'AUTHOR'), 'b'.repeat(CORE_MAX_TEXT));
    const odd = {sections: [], parts: new Map([['docProps/core.xml',
      'a string']]), meta: {packageRels: [null, {type: 5}]}};
    assert.equal(ev({doc: odd}, 'AUTHOR'), '');
  });
});

describe('Fields: FILENAME and NUMWORDS', () => {
  const doc = mkDoc([para('one two  three'), para(''),
    para('four\u00a0five six')]);
  const path = 'ADFS::HardDisc4.$.Documents.Letter/docx';

  it('FILENAME: the leaf; \\p: the RISC OS path', () => {
    assert.equal(ev({doc, path}, 'FILENAME'), 'Letter/docx');
    assert.equal(ev({doc, path}, 'FILENAME \\p'), path);
    assert.equal(ev({doc, path}, 'FILENAME \\* Upper'), 'LETTER/DOCX');
    assert.equal(ev({doc, path: 'Mem::Leaf'}, 'FILENAME'), 'Leaf');
    assert.equal(ev({doc, path: 'Leaf'}, 'FILENAME'), 'Leaf');
    assert.equal(ev({doc, path: 5}, 'FILENAME'), null);
  });

  it('NUMWORDS: WordCount\'s words of the document', () => {
    assert.equal(ev({doc}, 'NUMWORDS'), '5');
    assert.equal(ev({doc}, 'NUMWORDS \\* roman'), 'v');
    assert.equal(ev({doc}, 'NUMWORDS \\# "0 \'words\'"'), '5 words');
  });
});
