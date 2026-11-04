// ODT import, task 5: the container (sniff, zip, parts), the
// handler registry, styles and character / paragraph formatting.
// Inputs are spec-derived fixtures (odt-helpers.mjs, written from
// OpenDocument 1.3), not files from an office program. Every Doc
// read must pass the Model checks, write as .docx and read back
// equal (docx-compare), as the RTF reader's do; emit() hands the
// .docx to the real-Word check (word-emit.mjs).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readOdt, sniffOdt, IMPORTER, MAX_NAMED, OTHER_ELEMENTS}
  from '../../tools/moreapps/!Letters/OdtRead';
import * as O from '../../tools/moreapps/!Letters/Open';
import {points, twips, halfPts, pct, hex}
  from '../../tools/moreapps/!Letters/OdtUnits';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {resolvePara, resolveRun}
  from '../../tools/moreapps/!Letters/Styles';
import {writeZip, readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {parsePart, MAX_ELEMENTS, attr, budgetOf}
  from '../../tools/moreapps/!Letters/OdtXml';
import {displayOf} from '../../tools/moreapps/!Letters/OdtStyles';
import {makeOdt, storedZip, TEXT, TEMPLATE} from './odt-helpers.mjs';

const UNITS = ' units of XML (elements plus a quarter of the ' +
  'attributes)';
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const read = (o, opts = {}) => readOdt(makeOdt(o), {date: DATE,
  ...opts});
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
const texts = (doc) => paras(doc).map((p) => p.text);
const runs = (p) => p.runs.map((r) => [p.text.slice(r.start, r.end),
  r.rPr]);
const styleName = (doc, id) => (doc.styles.styles.get(id) || {}).name;
const plain = (rPr) => JSON.parse(JSON.stringify(rPr));

async function roundTrips(doc, what) {
  for (const b of doc.sections.flatMap((s) => s.blocks)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('odt-read-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

const T = (name, tp, family = 'text', more = '') =>
  `<style:style style:name="${name}" style:family="${family}"${more}>` +
  `<style:text-properties ${tp}/></style:style>`;
const P = (name, pp, more = '', tp = '') =>
  `<style:style style:name="${name}" style:family="paragraph"${more}>` +
  `<style:paragraph-properties ${pp}/>` +
  (tp ? `<style:text-properties ${tp}/>` : '') + '</style:style>';
const DEFAULT = '<style:default-style style:family="paragraph">' +
  '<style:paragraph-properties fo:margin-top="0cm" ' +
  'fo:margin-bottom="0cm"/><style:text-properties ' +
  'style:font-name="Liberation Serif" fo:font-size="12pt"/>' +
  '</style:default-style>' +
  P('Standard', '') ;
const FONTS = '<style:font-face style:name="Liberation Serif" ' +
  'svg:font-family="&apos;Liberation Serif&apos;"/>' +
  '<style:font-face style:name="Arial1" svg:font-family="Arial"/>';

describe('ODT: the container', () => {
  it('sniffOdt accepts odt and ott, rejects docx and a zip with a ' +
    'wrong mimetype', async () => {
    assert.equal(sniffOdt(makeOdt({content: ''})), true);
    assert.equal(sniffOdt(makeOdt({content: '', mimetype: TEMPLATE})),
      true);
    const docx = await writeDocx((await read({content:
      '<text:p>x</text:p>'})).doc, {date: DATE});
    assert.equal(sniffOdt(docx), false, 'a .docx');
    assert.equal(sniffOdt(makeOdt({mimetype:
      'application/vnd.oasis.opendocument.spreadsheet'})), false);
    assert.equal(sniffOdt(makeOdt({mimetype: TEXT + ' '})), false);
    assert.equal(sniffOdt(makeOdt({mimetype: null})), false);
    // (not first, but the rest is an ODT package: read; task 9)
    assert.equal(sniffOdt(makeOdt({mimetypeAt: 'last'})), true,
      'mimetype not first');
    // a docx-like zip whose first entry is [Content_Types].xml
    const ct = await writeZip([['[Content_Types].xml', new
      TextEncoder().encode('<Types/>')], ['mimetype', new
      TextEncoder().encode(TEXT)]]);
    assert.equal(sniffOdt(ct), false);
  });

  it('a hostile sniff: nothing, a byte, a cut header, not bytes, ' +
    'a deflated or described mimetype', () => {
    const ok = makeOdt({content: ''});
    for (const b of [new Uint8Array(0), new Uint8Array([0x50]),
      ok.slice(0, 37), ok.slice(0, 60), ok.buffer, [...ok],
      'PK\u0003\u0004mimetype', null, undefined, {length: 100}]) {
      assert.equal(sniffOdt(b), false);
    }
    // (a first header that is not the standard's: the central
    // directory decides, and it has the manifest and content.xml)
    const deflated = ok.slice();
    deflated[8] = 8;
    assert.equal(sniffOdt(deflated), true);
    const described = ok.slice();
    described[6] = 8;
    assert.equal(sniffOdt(described), true);
    assert.equal(sniffOdt(deflated.slice(0, 200)), false);
    // only the first local header is looked at: the rest is garbage
    const head = ok.slice(0, 38 + TEXT.length);
    assert.equal(sniffOdt(head), true);
  });

  it('a file that sniffs but is not a whole ODT is refused as bad',
    async () => {
      const ok = makeOdt({content: ''});
      for (const b of [ok.slice(0, 200), storedZip([['mimetype', TEXT],
        ['styles.xml', '<x/>']])]) {
        await assert.rejects(readOdt(b), (e) => e.name ===
          'ImportError' && e.code === 'bad' && e.format === 'odt');
      }
    });

  it('opens through Open as an ODT import; a .docx stays docx',
    async () => {
      assert.equal(O.IMPORTERS[0], IMPORTER);
      assert.equal(IMPORTER.format, 'odt');
      assert.equal(IMPORTER.label, 'ODT');
      const odt = makeOdt({content: '<text:p>Hello</text:p>'});
      const got = await O.openDoc({readFile: async () => odt},
        'Report/odt');
      assert.equal(got.imported, 'odt');
      assert.equal(got.format, 'docx');
      assert.deepEqual(texts(got.doc), ['Hello']);
      assert.equal(O.openNotice('Report/odt', got), "'Report/odt' " +
        'was opened from an ODT file; it will be saved as a .docx.');
      const docx = await writeDocx(got.doc, {date: DATE});
      const d = await O.openDoc({readFile: async () => docx}, 'x');
      assert.equal(d.imported, undefined);
      assert.equal(d.format, 'docx');
    });
});

describe('ODT: text, styles and formatting', () => {
  it('plain paragraphs and headings read with their text',
    async () => {
      const {doc, notes} = await read({styles: DEFAULT, fonts: FONTS,
        content: '<text:h text:outline-level="1">The  title</text:h>' +
          '<text:p>  One\n  two\tthree </text:p>' +
          '<text:h text:outline-level="2">Part</text:h>' +
          '<text:p text:style-name="Standard">Last</text:p><text:p/>'});
      assert.deepEqual(notes, []);
      assert.deepEqual(texts(doc), ['The title', 'One two three ',
        'Part', 'Last', '']);
      const ps = paras(doc);
      assert.equal(styleName(doc, ps[0].pStyle), 'heading 1');
      assert.equal(styleName(doc, ps[2].pStyle), 'heading 2');
      assert.equal(ps[1].pStyle, undefined, 'Normal');
      assert.equal(ps[3].pStyle, undefined, 'Standard is Normal');
      assert.equal(resolvePara(doc.styles, ps[0]).outlineLvl, 0);
      assert.equal(resolvePara(doc.styles, ps[2]).outlineLvl, 1);
      // (the heading looks like the ODT's: no Word heading look)
      const r = resolveRun(doc.styles, ps[0], ps[0].runs[0]);
      assert.equal(r.sz, 24);
      assert.ok(!r.b);
      assert.equal(r.rFonts.ascii, 'Liberation Serif');
      assert.deepEqual(resolvePara(doc.styles, ps[1]).spacing,
        {before: 0, after: 0, line: 240, lineRule: 'auto'});
      await roundTrips(doc, 'paragraphs and headings');
    });

  it('bold italic underline size colour and font read as rPr',
    async () => {
      const {doc, notes} = await read({styles: DEFAULT, fonts: FONTS,
        auto: T('T1', 'fo:font-weight="bold" fo:font-style="italic" ' +
          'style:text-underline-style="solid" ' +
          'style:text-underline-type="double" fo:font-size="14pt" ' +
          'fo:color="#ff0000" style:font-name="Arial1"') +
          T('T2', 'style:text-line-through-style="solid" ' +
            'style:text-position="super 58%" fo:text-transform=' +
            '"uppercase" fo:background-color="#ffff00"') +
          T('T3', 'fo:font-variant="small-caps" text:display="none" ' +
            'style:text-underline-style="wave" ' +
            'style:text-underline-color="#00ff00" ' +
            'fo:background-color="#123456" fo:font-size="150%"') +
          T('T4', 'style:text-line-through-style="solid" ' +
            'style:text-line-through-type="double" ' +
            'style:text-position="-33% 58%" fo:font-weight="700"'),
        content: '<text:p>a<text:span text:style-name="T1">b' +
          '</text:span><text:span text:style-name="T2">c</text:span>' +
          '<text:span text:style-name="T3">d</text:span>' +
          '<text:span text:style-name="T4">e</text:span></text:p>'});
      assert.deepEqual(notes, []);
      const [p] = paras(doc);
      const rs = runs(p).map(([t, r]) => [t, plain(r)]);
      assert.deepEqual(rs[0], ['a', {extra: []}]);
      assert.deepEqual(rs[1], ['b', {extra: [], b: true, i: true,
        u: 'double', sz: 28, rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
        color: 'FF0000'}]);
      const c = rs[2][1];
      assert.equal(c.strike, true);
      assert.equal(c.vertAlign, 'superscript');
      assert.equal(c.highlight, 'yellow');
      assert.deepEqual(c.extra.map((n) => n.name), ['w:caps']);
      const d = rs[3][1];
      assert.equal(d.sz, 36, '150% of 12 pt');
      assert.deepEqual(d.shd, {val: 'clear', color: 'auto',
        fill: '123456'});
      assert.deepEqual(d.extra.map((n) => [n.name, n.attrs]), [
        ['w:smallCaps', []], ['w:vanish', []],
        ['w:u', [['w:val', 'wave'], ['w:color', '00FF00']]]]);
      const e = rs[4][1];
      assert.equal(e.b, true);
      assert.equal(e.vertAlign, 'subscript');
      assert.equal(e.strike, undefined);
      assert.deepEqual(e.extra.map((n) => n.name), ['w:dstrike']);
      await roundTrips(doc, 'character formatting');
    });

  it('paragraph alignment indents spacing tabs borders and shading ' +
    'read as pPr', async () => {
    const {doc} = await read({styles: DEFAULT, fonts: FONTS,
      auto: '<style:style style:name="P1" style:family="paragraph" ' +
        'style:parent-style-name="Standard"><style:paragraph-' +
        'properties fo:text-align="center" fo:margin-left="1in" ' +
        'fo:margin-right="0.5in" fo:text-indent="-0.25in" ' +
        'fo:margin-top="6pt" fo:margin-bottom="12pt" ' +
        'fo:line-height="150%" fo:keep-with-next="always" ' +
        'fo:keep-together="always" fo:break-before="page" ' +
        'fo:border="0.5pt solid #000000" fo:padding="4pt" ' +
        'fo:border-left="none" fo:background-color="#eeeeee">' +
        '<style:tab-stops><style:tab-stop style:position="1in" ' +
        'style:type="right" style:leader-text="."/>' +
        '<style:tab-stop style:position="2in"/></style:tab-stops>' +
        '</style:paragraph-properties></style:style>' +
        P('P2', 'fo:text-align="justify" fo:line-height="18pt"') +
        P('P3', 'fo:text-align="end" ' +
          'style:line-height-at-least="14pt" ' +
          'fo:margin-left="garbage" ' +
          'fo:margin-top="NaNpt" fo:margin-bottom="1e30pt"'),
      content: '<text:p text:style-name="P1">One</text:p>' +
        '<text:p text:style-name="P2">Two</text:p>' +
        '<text:p text:style-name="P3">Three</text:p>'});
    const [a, b, c] = paras(doc).map((p) => plain(p.pPr));
    const side = {val: 'single', sz: 4, color: '000000', space: 4};
    assert.deepEqual(a, {extra: [], jc: 'center',
      ind: {left: 1440, right: 720, hanging: 360},
      spacing: {before: 120, after: 240, line: 360, lineRule: 'auto'},
      keepNext: true, keepLines: true, pageBreakBefore: true,
      tabs: [{val: 'right', pos: 2880, leader: 'dot'},
        {val: 'left', pos: 4320}],
      pBdr: {top: side, left: {val: 'none'}, bottom: side,
        right: side},
      shd: {val: 'clear', color: 'auto', fill: 'EEEEEE'}});
    assert.deepEqual(b, {extra: [], jc: 'both', spacing: {before: 0,
      after: 0, line: 360, lineRule: 'exact'}});
    assert.deepEqual(c, {extra: [], jc: 'right', spacing: {before: 0,
      after: 0, line: 280, lineRule: 'atLeast'}});
    await roundTrips(doc, 'paragraph formatting');
  });

  it('automatic styles over a named style measure against it',
    async () => {
      const {doc} = await read({fonts: FONTS,
        styles: DEFAULT + P('Body', 'fo:text-align="center" ' +
          'fo:margin-bottom="0.1in"',
          ' style:display-name="Body Odt" ' +
          'style:parent-style-name="Standard"',
          'fo:font-weight="bold"') +
          T('Strong', 'fo:font-style="italic"', 'text',
            ' style:display-name="Strong Odt"'),
        auto: P('P1', 'fo:text-align="center" fo:margin-bottom="0.1in"',
          ' style:parent-style-name="Body"', 'fo:font-weight="bold" ' +
          'fo:color="#0000ff"') +
          P('P2', 'fo:text-align="left"', ' style:parent-style-name=' +
            '"Body"') +
          T('T1', 'fo:font-weight="normal"') +
          T('T2', 'fo:font-style="italic" fo:font-size="12pt"', 'text',
            ' style:parent-style-name="Strong"'),
        content: '<text:p text:style-name="P1">Same<text:span ' +
          'text:style-name="T1"> plain</text:span></text:p>' +
          '<text:p text:style-name="P2">Left<text:span ' +
          'text:style-name="T2"> strong</text:span><text:span ' +
          'text:style-name="Strong"> named</text:span></text:p>' +
          '<text:p text:style-name="Body">Body</text:p>'});
      const [p1, p2, p3] = paras(doc);
      const body = p1.pStyle;
      assert.equal(styleName(doc, body), 'Body Odt');
      const st = doc.styles.styles.get(body);
      assert.equal(st.basedOn, 'Normal');
      assert.equal(st.pPr.jc, 'center');
      assert.equal(st.rPr.b, true);
      assert.deepEqual(plain(p1.pPr), {extra: []},
        'direct = the style: left out');
      assert.deepEqual(runs(p1).map(([t, r]) => [t, plain(r)]), [
        ['Same', {extra: [], color: '0000FF'}],
        [' plain', {extra: [], b: false, color: '0000FF'}]]);
      assert.equal(p2.pStyle, body);
      assert.deepEqual(plain(p2.pPr), {extra: [], jc: 'left'});
      const strong = p2.runs[1].rStyle;
      assert.equal(styleName(doc, strong), 'Strong Odt');
      assert.deepEqual(plain(p2.runs[1].rPr), {extra: []},
        'italic and 12 pt are the style\'s');
      // (the named style's run is the same: one run)
      assert.deepEqual(runs(p2).map(([t]) => t),
        ['Left', ' strong named']);
      assert.equal(p3.pStyle, body);
      assert.deepEqual(plain(p3.runs[0].rPr), {extra: []});
      await roundTrips(doc, 'automatic over named');
    });

  it('a style with parent resolves inheritance and a loop in ' +
    'parents is cut with a note', async () => {
    const {doc, notes} = await read({fonts: FONTS,
      styles: DEFAULT + P('A', '', ' style:parent-style-name=' +
        '"Standard"', 'fo:font-size="20pt"') +
        P('B', 'fo:margin-left="1cm"', ' style:parent-style-name="A"',
          'fo:font-weight="bold"') +
        P('C', '', ' style:parent-style-name="B"',
          'fo:font-size="50%"') +
        P('X', '', ' style:parent-style-name="Y"', 'fo:font-style=' +
          '"italic"') +
        P('Y', '', ' style:parent-style-name="X"',
          'fo:color="#00ff00"'),
      content: '<text:p text:style-name="C">C</text:p>' +
        '<text:p text:style-name="X">X</text:p>'});
    const [c, x] = paras(doc);
    const cs = doc.styles.styles.get(c.pStyle);
    assert.equal(cs.name, 'C');
    assert.equal(styleName(doc, cs.basedOn), 'B');
    assert.equal(cs.rPr.sz, 20, '50% of 20 pt');
    const r = resolveRun(doc.styles, c, c.runs[0]);
    assert.equal(r.b, true);
    assert.equal(r.sz, 20);
    assert.equal(resolvePara(doc.styles, c).ind.left, 567);
    assert.ok(notes.includes('a style that is based on itself: the ' +
      'loop is cut'), notes.join('; '));
    const rx = resolveRun(doc.styles, x, x.runs[0]);
    assert.equal(rx.i, true);
    await roundTrips(doc, 'style inheritance');
  });

  it('unknown elements are skipped with one note per kind',
    async () => {
    const odd = ['text:list', 'table:table', 'text:x0', 'text:x1',
      'text:x2', 'text:x3', 'text:x4'];
    const {doc, notes} = await read({content: '<text:sequence-decls/>' +
      odd.map((n) => `<${n}><text:p>lost</text:p></${n}>`).join('') +
      '<text:list/><text:p>Kept<text:x5 text:name="b"/>' +
      '</text:p>'});
    assert.deepEqual(texts(doc), ['Kept']);
    const named = notes.filter((n) => n.startsWith('unknown element'));
    assert.equal(named.length, MAX_NAMED);
    assert.ok(notes.includes(OTHER_ELEMENTS));
    assert.ok(!notes.some((n) => n.includes('sequence-decls')));
  });
});

describe('ODT: limits', () => {
  it('xml with a DOCTYPE or entities is refused with a note',
    async () => {
      const dtd = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a ' +
        '"aaaa">]><office:document-styles/>';
      const got = await read({styles: dtd,
        content: '<text:p>Still here</text:p>'});
      assert.deepEqual(texts(got.doc), ['Still here']);
      assert.ok(got.notes.some((n) => n.startsWith('styles.xml:') &&
        n.endsWith('its styles are not read')), got.notes.join('; '));
      await assert.rejects(read({content: '<text:p>&a;</text:p>'}),
        (e) => e.name === 'ImportError' && e.code === 'bad' &&
          /entity/.test(e.message));
      const bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a ' +
        '"aaaa"><!ENTITY b "&a;&a;">]><office:document-content/>';
      const odt = makeOdt({content: bomb});
      await assert.rejects(readOdt(odt), (e) => e.code === 'bad');
      await assert.rejects(O.openDoc({readFile: async () => odt}, 'x'),
        (e) => O.describe(e, 'Bomb/odt') === "'Bomb/odt' could not " +
          'be opened: it is not an OpenDocument text file.');
    });

  it('a part over the element cap stops with a note', async () => {
    const many = '<style:style style:name="S" style:family="text"/>'
      .repeat(60);
    const got = await read({styles: many,
      content: '<text:p>Body</text:p>'}, {maxElements: 50});
    assert.deepEqual(texts(got.doc), ['Body']);
    assert.ok(got.notes.includes('styles.xml: more than 50' + UNITS +
      ': its styles are not read'), got.notes.join('; '));
    await assert.rejects(read({content: '<text:p/>'.repeat(60)},
      {maxElements: 50}), (e) => e.code === 'toocomplex' &&
      e.message === 'content.xml: more than 50' + UNITS);
    const deep = '<text:span>'.repeat(300) + '</text:span>'.repeat(300);
    await assert.rejects(read({content: `<text:p>${deep}</text:p>`}),
      (e) => e.code === 'bad' && /nested/.test(e.message));
  });

  it('a part over the default element budget is refused before it ' +
    'is parsed', async () => {
    // (the budget is for the whole file; a part alone over it is
    // refused for itself)
    assert.equal(MAX_ELEMENTS, 1200000);
    // (not well-formed: refused for its count, so never parsed)
    const enc = (s) => new TextEncoder().encode(s);
    const over = enc('<a>'.repeat(MAX_ELEMENTS + 1));
    assert.throws(() => parsePart(over, 'content.xml'), (e) =>
      e.code === 'elements' && e.message ===
        'content.xml: more than 1200000' + UNITS);
    // (at the cap it is parsed: refused for its nesting instead)
    const at = enc('<a>'.repeat(MAX_ELEMENTS));
    assert.throws(() => parsePart(at, 'content.xml'),
      (e) => e.code === 'depth');
    // (attributes weigh a quarter of an element each)
    const attrs = enc('<a' + ' b=""'.repeat(4 * MAX_ELEMENTS) + '/>');
    assert.throws(() => parsePart(attrs, 'content.xml'), (e) =>
      e.code === 'elements');
    assert.throws(() => parsePart(attrs, 'content.xml',
      {budget: budgetOf()}), (e) => e.code === 'elements' &&
      e.message === 'content.xml: more than 1200000' + UNITS);
    await assert.rejects(read({content: '<text:span/>'.repeat(
      MAX_ELEMENTS)}), (e) => e.code === 'toocomplex' &&
      e.message === 'content.xml: more than 1200000' + UNITS);
  });

  it('a damaged content.xml is bad, not toocomplex', async () => {
    await assert.rejects(read({content: '<text:p>unclosed'}),
      (e) => e.code === 'bad' && /^content\.xml: /.test(e.message) &&
      !/units of XML/.test(e.message));
  });

  it('one element budget is shared by all the parts of a file',
    async () => {
      const enc = (s) => new TextEncoder().encode(s);
      const budget = budgetOf(100);
      // (60 elements and 40 attributes: a weight of 70)
      parsePart(enc('<r>' + '<a b="1"/>'.repeat(40) +
        '<c/>'.repeat(19) + '</r>'), 'one.xml', {budget});
      assert.deepEqual(budget, {total: 100, left: 30});
      assert.throws(() => parsePart(enc('<r>' + '<a/>'.repeat(30) +
        '</r>'), 'two.xml', {budget}), (e) => e.code === 'elements' &&
        e.message === 'two.xml: more than 100' + UNITS +
          ' with the parts read before it');
      assert.equal(budget.left, 30);
      parsePart(enc('<r>' + '<a/>'.repeat(29) + '</r>'), 'two.xml',
        {budget});
      assert.equal(budget.left, 0);
      // (content.xml, a weight of about 160, and styles.xml, about 310,
      // each under it, not both: the text is read without its styles)
      const many = '<style:style style:name="S" style:family="text"/>';
      const got = await read({styles: many.repeat(200),
        content: '<text:p>Body</text:p>'.repeat(150)},
      {maxElements: 400});
      assert.equal(texts(got.doc).length, 150);
      assert.ok(got.notes.includes('styles.xml: more than 400' + UNITS +
        ' with the parts read before it: its styles are not read'),
      got.notes.join('; '));
      const alone = await read({styles: many.repeat(200),
        content: '<text:p>Body</text:p>'}, {maxElements: 400});
      assert.ok(!alone.notes.some((n) => /elements/.test(n)),
        alone.notes.join('; '));
    });

  it('a realistic file shares one budget: styles.xml is refused after ' +
    'a large content.xml', async () => {
    // (maxElements 12000 and about 7000 units each: content.xml fits
    // and is read, styles.xml does not fit in what it left)
    const many = '<style:style style:name="S" style:family="text"/>';
    const got = await read({styles: many.repeat(6900),
      content: '<text:p>Body</text:p>'.repeat(6900)},
    {maxElements: 12000});
    assert.equal(texts(got.doc).length, 6900);
    const refusal = got.notes.find((n) => /styles\.xml/.test(n) &&
      /elements/.test(n));
    assert.ok(refusal && refusal.startsWith('styles.xml: ') &&
      refusal.includes(' with the parts read before it'),
    got.notes.join('; '));
    // (the same styles.xml alone, within its own 12000)
    const alone = await read({styles: many.repeat(6900),
      content: '<text:p>Body</text:p>'}, {maxElements: 12000});
    assert.ok(!alone.notes.some((n) => /elements/.test(n)),
      alone.notes.join('; '));
  });

  it('names are fixed in the parsed tree itself', () => {
    const x = parsePart(new TextEncoder().encode('<o:r xmlns:o="urn:' +
      'oasis:names:tc:opendocument:xmlns:text:1.0" o:a="1" b="2">' +
      '<!--c--><?p q?>t<o:s o:a="3"/></o:r>'), 'x');
    assert.equal(x.name, 'text:r');
    assert.equal(attr(x, 'text:a'), '1');
    assert.equal(attr(x, 'b'), '2');
    assert.equal(attr(x, 'xmlns:o'), undefined);
    assert.equal(x.children.length, 2, 'comment and PI left out');
    assert.equal(x.children[1].name, 'text:s');
    assert.equal(displayOf('A_20_B_d800_C'), 'A B_d800_C');
  });

  it('maxParagraphs stops with a note', async () => {
    const content = Array.from({length: 10}, (_, i) =>
      `<text:p>P${i}</text:p>`).join('');
    const {doc, notes} = await read({content}, {maxParagraphs: 3});
    assert.deepEqual(texts(doc), ['P0', 'P1', 'P2']);
    assert.ok(notes.includes('more than 3 paragraphs: the rest is ' +
      'not read'), notes.join('; '));
    await roundTrips(doc, 'paragraph cap');
  });

  it('lengths and values that are garbage are none, never NaN', () => {
    assert.equal(points('2.54cm').toFixed(3), '72.000');
    assert.equal(twips('1in'), 1440);
    assert.equal(halfPts('10.5pt'), 21);
    assert.equal(twips('12px'), 180);
    assert.equal(twips('1pc'), 240);
    for (const g of ['', 'cm', '1', '1e3pt', 'NaNpt', '1.2.3cm',
      '--1cm', '1 cm x', '1e400in', '9'.repeat(50) + 'pt', null, 3,
      '1em', 'Infinitypt']) {
      assert.equal(twips(g), undefined, String(g));
    }
    assert.equal(pct('150%'), 150);
    assert.equal(pct('x%'), undefined);
    assert.equal(hex('#a0B1c2'), 'A0B1C2');
    assert.equal(hex('#a0B1cg'), undefined);
    assert.equal(hex('#\u0010\u0010\u0010\u0010\u0010\u0010'),
      undefined);
  });
});

// Task 9: the package edge cases from the review of task 5
describe('ODT: the package and settings', () => {
  const M = 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';
  const DOCTYPE = '<!DOCTYPE manifest:manifest PUBLIC "-//OpenOffice.' +
    'org//DTD Manifest 1.0//EN" "Manifest.dtd">';
  /** The entries of a built ODT ([name, bytes]), in its order. */
  const parts = async (o) => [...(await readZip(makeOdt(o)))];
  const manifest = (inner) => '<?xml version="1.0" encoding="UTF-8"?>' +
    DOCTYPE + `<manifest:manifest xmlns:manifest="${M}">` +
    '<manifest:file-entry manifest:full-path="/" manifest:media-type="' +
    TEXT + '"/><manifest:file-entry manifest:full-path="content.xml" ' +
    `manifest:media-type="text/xml">${inner}</manifest:file-entry>` +
    '</manifest:manifest>';
  const withManifest = async (m) => storedZip((await parts({content:
    '<text:p>x</text:p>'})).map(([n, b]) => [n,
    n === 'META-INF/manifest.xml' ? m : b]));

  it('a mimetype that is not first, or deflated, is read when the ' +
    'rest is an ODT package', async () => {
      const all = await parts({content: '<text:p>Hi</text:p>'});
      const [mt, ...rest] = all;
      const late = storedZip([...rest, mt]);
      const deflated = storedZip([[mt[0], mt[1], {deflate: true}],
        ...rest]);
      const middle = storedZip([['Configurations2/a.xml', '<a/>'],
        ...rest.slice(0, 2), mt, ...rest.slice(2)]);
      for (const z of [late, deflated, middle]) {
        assert.equal(sniffOdt(z), true);
        assert.deepEqual(texts((await readOdt(z)).doc), ['Hi']);
      }
      // (no manifest, or no content.xml: not an ODT)
      const noMan = storedZip([...rest.filter(([n]) =>
        n !== 'META-INF/manifest.xml'), mt]);
      const noContent = storedZip([...rest.filter(([n]) =>
        n !== 'content.xml'), mt]);
      assert.equal(sniffOdt(noMan), false);
      assert.equal(sniffOdt(noContent), false);
      // (a spreadsheet's mimetype, last or deflated: refused)
      const ods = 'application/vnd.oasis.opendocument.spreadsheet';
      assert.equal(sniffOdt(storedZip([...rest, ['mimetype', ods]])),
        false);
      const dods = storedZip([['mimetype', ods, {deflate: true}],
        ...rest]);
      await assert.rejects(readOdt(dods), (e) => e.name ===
        'ImportError' && e.code === 'bad');
    });

  it('an old manifest with a DOCTYPE: read for encryption only',
    async () => {
      const plainOne = await readOdt(await withManifest(manifest('')));
      assert.deepEqual(texts(plainOne.doc), ['x']);
      assert.ok(!plainOne.notes.some((n) => /manifest/.test(n)),
        plainOne.notes.join('; '));
      const enc = await withManifest(manifest('<manifest:encryption-' +
        'data manifest:checksum-type="SHA1/1K" manifest:checksum="x"/>'));
      let err;
      await assert.rejects(readOdt(enc), (e) => {
        err = e;
        return e.name === 'ImportError' && e.code === 'encrypted';
      });
      assert.equal(O.describe(err, 'Secret'), "'Secret' could not be " +
        'opened: it is password-protected.');
      // (a DOCTYPE with an internal subset is not parsed: still read
      // for the word)
      const bad = manifest('<manifest:encryption-data/>').replace(
        '"Manifest.dtd">', '"Manifest.dtd" [<!ENTITY a "b">]>');
      await assert.rejects(readOdt(await withManifest(bad)), (e) =>
        e.code === 'encrypted');
      const junk = await readOdt(await withManifest('<<not xml'));
      assert.ok(junk.notes.some((n) => /manifest is damaged/.test(n)));
    });

  it('tab stops are from the indent unless settings.xml says not',
    async () => {
      const auto = '<style:style style:name="P1" style:family=' +
        '"paragraph"><style:paragraph-properties fo:margin-left="1in">' +
        '<style:tab-stops><style:tab-stop style:position="1in"/>' +
        '</style:tab-stops></style:paragraph-properties></style:style>';
      const settings = (v) => ['settings.xml', '<?xml version="1.0"?>' +
        '<office:document-settings xmlns:office="urn:oasis:names:tc:' +
        'opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:' +
        'tc:opendocument:xmlns:config:1.0"><office:settings><config:' +
        'config-item-set config:name="ooo:configuration-settings">' +
        '<config:config-item config:name="TabsRelativeToIndent" ' +
        `config:type="boolean">${v}</config:config-item></config:` +
        'config-item-set></office:settings></office:document-settings>'];
      const tabs = async (extra) => {
        const {doc} = await read({auto, extra, content:
          '<text:p text:style-name="P1">a</text:p>'});
        await roundTrips(doc, 'tabs ' + extra.length);
        return paras(doc)[0].pPr.tabs.map((t) => t.pos);
      };
      assert.deepEqual(await tabs([]), [2880]);
      assert.deepEqual(await tabs([settings('true')]), [2880]);
      assert.deepEqual(await tabs([settings('false')]), [1440]);
      assert.deepEqual(await tabs([['settings.xml', '<<junk']]), [2880]);
    });
});

describe('ODT: formatting found in the corpus (task 9)', () => {
  it('letter spacing and character scaling read as w:spacing / w:w',
    async () => {
      const {doc, notes} = await read({auto: T('T1',
        'fo:letter-spacing="0.05cm" style:text-scale="80%"') +
        T('T2', 'fo:letter-spacing="-1pt"') +
        T('T3', 'fo:letter-spacing="normal" style:text-scale="100%"') +
        T('T4', 'fo:letter-spacing="junk" style:text-scale="9000%"'),
      content: '<text:p><text:span text:style-name="T1">a</text:span>' +
        '<text:span text:style-name="T2">b</text:span><text:span ' +
        'text:style-name="T3">c</text:span><text:span text:style-name=' +
        '"T4">d</text:span></text:p>'});
      const ex = runs(paras(doc)[0]).map(([t, r]) => [t, r.extra.map(
        (x) => x.name + '=' + x.attrs[0][1])]);
      assert.deepEqual(ex, [['a', ['w:spacing=28', 'w:w=80']],
        ['b', ['w:spacing=-20']], ['c', []], ['d', ['w:w=600']]]);
      assert.ok(!notes.some((n) => /letter spacing|scaling/.test(n)),
        notes.join('; '));
      await roundTrips(doc, 'letter spacing');
    });
});
