// ODT import, task 7: pictures, page setup, headers and footers,
// footnotes and endnotes. Inputs are spec-derived fixtures
// (odt-helpers.mjs, from OpenDocument 1.3: part 3, 10.4 draw:frame,
// 10.4.4 draw:image, 16.10 style:page-layout, 16.9 style:master-page,
// 6.3 text:note), not files from an office program. Every Doc read
// round-trips through DocxWrite -> readDocx and goes to emit() for
// the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {refsOf, storyOfRef}
  from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {settingsOf}
  from '../../tools/moreapps/!Letters/SettingsRead';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {makeOdt, NS} from './odt-helpers.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const PNG = pngBytes(4, 2);
const read = (o, opts = {}) => readOdt(makeOdt(o), {date: DATE,
  ...opts});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');

async function roundTrips(doc, what) {
  for (const b of blocks(doc)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('odt-parts-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

const go = async (o, what, opts) => {
  const r = await read(o, opts);
  await roundTrips(r.doc, what);
  return r;
};
const P = (t, extra = '') => `<text:p${extra}>${t}</text:p>`;

/** The drawings (w:drawing inlines) of the doc's paragraphs: their
 *  extents [cx, cy] and docPr. */
function drawings(doc) {
  const out = [];
  for (const p of paras(doc)) {
    for (const x of Object.values(p.inlines || {})) {
      const d = x.kind === 'raw' && x.node;
      if (!d || d.name !== 'w:drawing') continue;
      const kids = d.children[0].children;
      const ext = kids.find((n) => /extent$/.test(n.name));
      const pr = kids.find((n) => /docPr$/.test(n.name));
      const a = (n, k) => (n.attrs.find(([q]) => q === k) || [])[1];
      out.push({cx: Number(a(ext, 'cx')), cy: Number(a(ext, 'cy')),
        name: a(pr, 'name'), alt: a(pr, 'descr')});
    }
  }
  return out;
}

const FRAME = (href, extra = '', size = 'svg:width="2cm" ' +
  'svg:height="1cm"') => `<draw:frame draw:name="F" ${size} ` +
  `text:anchor-type="as-char"${extra}><draw:image xlink:href="${href}"` +
  '/></draw:frame>';

describe('ODT pictures', () => {
  it('an inline PNG reads with its size', async () => {
    const {doc, notes} = await go({content: P('a' + FRAME(
      'Pictures/a.png', '').replace('<draw:image xlink:href="' +
      'Pictures/a.png"/>', '<svg:title>T</svg:title><svg:desc>An ' +
      '<b>a</b> pic</svg:desc><draw:image xlink:href="Pictures/a.png"' +
      '/>') + 'b'), pictures: {'a.png': PNG}}, 'inline png');
    const d = drawings(doc);
    assert.equal(d.length, 1);
    assert.deepEqual([d[0].cx, d[0].cy, d[0].name], [720000, 360000,
      'F']);
    assert.equal(d[0].alt, 'An pic');
    assert.equal(paras(doc)[0].text.length, 3);
    assert.deepEqual(notes, []);
  });

  it('every anchor type reads as an inline picture; a frame between ' +
    'paragraphs gets one of its own', async () => {
    const f = (t) => FRAME('Pictures/a.png', '').replace('as-char', t);
    const {doc} = await go({pictures: {'a.png': PNG}, content:
      P('x' + f('paragraph')) + P('y' + f('page')) +
      P('z' + f('frame')) + f('page') + P('end')}, 'anchors');
    assert.equal(drawings(doc).length, 4);
  });

  it('an inline office:binary-data picture is accepted', async () => {
    const b64 = Buffer.from(PNG).toString('base64').replace(/(.{20})/g,
      '$1\n');
    const {doc} = await go({content: P('<draw:frame svg:width="1cm" ' +
      'svg:height="1cm"><draw:image><office:binary-data>' + b64 +
      '</office:binary-data></draw:image></draw:frame>')}, 'b64');
    assert.equal(drawings(doc).length, 1);
  });

  it('a binary-data claim of 30 MB is not decoded; 100 MB is ' +
    'refused as a part', async () => {
    const mk = (n) => P('<draw:frame svg:width="1cm" ' +
      'svg:height="1cm"><draw:image><office:binary-data>' +
      'A'.repeat(n) + '</office:binary-data></draw:image>' +
      '</draw:frame>');
    const t0 = Date.now();
    const {doc, notes} = await read({content: mk(30e6)});
    assert.equal(drawings(doc).length, 0);
    assert.ok(notes.some((n) => /larger than 16 MB/.test(n)), notes);
    await assert.rejects(read({content: mk(100e6)}), (e) =>
      e.name === 'ImportError');
    assert.ok(Date.now() - t0 < 20000);
  });

  it('an external image href is not fetched and notes', async () => {
    const secret = new Uint8Array(PNG);
    const hrefs = ['http://example.com/a.png', 'https://x/a.png',
      'file:///etc/passwd', 'ftp://h/a.png', '/Pictures/a.png',
      '../a.png', 'Pictures/../../a.png', 'Pictures/%2e%2e/a.png',
      '..\\a.png', 'C:\\a.png', 'Pictures/missing.png', '',
      'data:image/png;base64,AAAA', '#a', 'Pictures/'];
    for (const href of hrefs) {
      const {doc, notes} = await read({content: P(FRAME(href)),
        pictures: {'a.png': PNG}, extra: [['a.png', secret]]});
      assert.equal(drawings(doc).length, 0, href);
      assert.ok(notes.some((n) => /picture/.test(n)), href);
    }
    const ok = await read({content: P(FRAME('./Pictures/my%20a.png')),
      pictures: {'my a.png': PNG}});
    assert.equal(drawings(ok.doc).length, 1);
  });

  it('bytes that are not an image, and unsupported kinds, note and ' +
    'skip', async () => {
    const junk = new Uint8Array(500).fill(7);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3' +
      '.org/2000/svg"/>');
    const {doc, notes} = await go({content: P(FRAME('Pictures/j.png') +
      FRAME('Pictures/s.svg') + FRAME('Pictures/s.svg') +
      ''), pictures: {'j.png': junk, 's.svg': svg}}, 'junk');
    assert.equal(drawings(doc).length, 0);
    assert.ok(notes.some((n) => /SVG/.test(n)), notes);
    assert.equal(notes.filter((n) => /SVG/.test(n)).length, 1);
  });

  it('10,000 frames stop at the picture cap with a note', async () => {
    const t0 = Date.now();
    const {doc, notes} = await read({content: P(FRAME(
      'Pictures/a.png').repeat(10000)), pictures: {'a.png': PNG}});
    assert.equal(drawings(doc).length, 1000);
    assert.ok(notes.some((n) => /more than 1000 pictures/.test(n)));
    assert.ok(Date.now() - t0 < 15000);
  });

  it('a width or height that is garbage, negative, zero or huge ' +
    'still gives a sane picture', async () => {
    const MAX = 22 * 914400;
    for (const w of ['abc', '-5cm', '1e30', '1e30cm', '0cm', '',
      '99999cm', '100%', 'NaN', '5furlongs']) {
      const {doc} = await read({pictures: {'a.png': PNG}, content: P(
        FRAME('Pictures/a.png', '', `svg:width="${w}" ` +
        'svg:height="3cm"'))});
      const [d] = drawings(doc);
      assert.ok(d, w);
      for (const v of [d.cx, d.cy]) {
        assert.ok(v >= 1 && v <= MAX, w + ' ' + v);
      }
    }
    const none = await go({pictures: {'a.png': PNG}, content: P(
      '<draw:frame><draw:image xlink:href="Pictures/a.png"/>' +
      '</draw:frame>')}, 'no size');
    assert.equal(drawings(none.doc).length, 1);
  });

  it('a text box\'s text is read after its paragraph, shapes and ' +
    'objects noted once each', async () => {
    const tb = '<draw:frame svg:width="2cm" svg:height="1cm"><draw:' +
      'text-box><text:p>Inside</text:p></draw:text-box></draw:frame>';
    const {doc, notes} = await go({content: P('a' + tb + tb + '<draw:' +
      'frame><draw:object xlink:href="./Object 1"/></draw:frame><draw:' +
      'custom-shape/><draw:g><draw:rect/></draw:g><draw:line/><draw:' +
      'plugin/>b')}, 'text box');
    assert.deepEqual(paras(doc).map((p) => p.text), ['ab', 'Inside',
      'Inside']);
    assert.equal(notes.filter((n) => /text boxes and drawing shapes is/
      .test(n)).length, 1);
    for (const w of ['object', 'shapes and lines', 'plug']) {
      assert.equal(notes.filter((n) => n.includes(w)).length, 1, w);
    }
  });

  it('text in shapes, groups, nested boxes, cells and between ' +
    'paragraphs (task 9)', async () => {
    const box = (inner) => '<draw:frame><draw:text-box>' + inner +
      '</draw:text-box></draw:frame>';
    const shape = '<draw:custom-shape><svg:title>t</svg:title><text:p>' +
      'S1</text:p><draw:enhanced-geometry/></draw:custom-shape>';
    const list = '<text:list><text:list-item><text:p>L</text:p>' +
      '</text:list-item></text:list>';
    const cell = '<table:table><table:table-column/><table:table-row>' +
      '<table:table-cell>' + P('c' + box(P('C'))) + '</table:table-' +
      'cell></table:table-row></table:table>';
    const {doc, notes} = await go({content: P('a' + shape + '<draw:g>' +
      '<svg:desc>d</svg:desc><draw:rect><text:p>G</text:p></draw:rect>' +
      '</draw:g>b') + box(P('Top') + list) + P('n' + box(P('o' +
      box(P('deep')) + 'p'))) + cell + P('z')}, 'shape text');
    assert.deepEqual(blocks(doc).map((b) => b.type === 'tbl'
      ? 'tbl:' + b.rows[0].cells[0].blocks.map((x) => x.text).join('|')
      : b.text), ['ab', 'S1', 'G', 'Top', 'L', 'n', 'op', 'deep',
      'tbl:c|C', 'z']);
    assert.ok(!notes.some((n) => /unknown|skipped/.test(n)),
      notes.join('; '));
  });

  it('a text box in tracked deleted text is left out', async () => {
    const del = '<text:tracked-changes><text:changed-region text:id=' +
      '"d"><text:deletion><office:change-info><dc:creator>A</dc:' +
      'creator><dc:date>2024-01-01T00:00:00</dc:date></office:change-' +
      'info><text:p>x<draw:frame><draw:text-box><text:p>gone</text:p>' +
      '</draw:text-box></draw:frame></text:p></text:deletion></text:' +
      'changed-region></text:tracked-changes>';
    const {doc, notes} = await go({content: del + P('a<text:change ' +
      'text:change-id="d"/>b')}, 'box deleted');
    assert.deepEqual(paras(doc).map((p) => p.text), ['axb']);
    assert.ok(notes.some((n) => /shapes in deleted text/.test(n)));
  });
});

const LAYOUT = (name, attrs, inner = '') => `<style:page-layout style:` +
  `name="${name}"><style:page-layout-properties ${attrs}>${inner}` +
  '</style:page-layout-properties></style:page-layout>';
const MASTER = (name, layout, inner = '', extra = '') =>
  `<style:master-page style:name="${name}" style:page-layout-name="${
    layout}"${extra}>${inner}</style:master-page>`;
const sty = (layouts, masters) => '<?xml version="1.0"?>' +
  `<office:document-styles ${NS} office:version="1.3"><office:styles/>` +
  `<office:automatic-styles>${layouts}</office:automatic-styles>` +
  `<office:master-styles>${masters}</office:master-styles>` +
  '</office:document-styles>';
const A4 = 'fo:page-width="21cm" fo:page-height="29.7cm" ' +
  'style:print-orientation="portrait" fo:margin-top="2cm" ' +
  'fo:margin-bottom="2cm" fo:margin-left="2.5cm" ' +
  'fo:margin-right="2.5cm"';
const sw = (name, master) => `<style:style style:name="${name}" ` +
  `style:family="paragraph" style:master-page-name="${master}"/>`;

const storyText = (doc, sec, kind, type) => {
  const r = refsOf(doc.sections[sec], docScope(doc).map)[kind];
  return r && r[type] && doc.stories.get(storyOfRef(doc, r[type]))
    .blocks.map((p) => p.text);
};

describe('ODT page setup', () => {
  it('A4 portrait and Letter landscape page layouts', async () => {
    const a4 = await go({styles: sty(LAYOUT('pm1', A4), MASTER('Standard',
      'pm1')), content: P('x')}, 'a4');
    const p = a4.doc.sections[0].props;
    assert.deepEqual([p.pgSz.w, p.pgSz.h], [11906, 16838]);
    assert.deepEqual([p.pgMar.top, p.pgMar.left, p.pgMar.right,
      p.pgMar.bottom], [1134, 1417, 1417, 1134]);
    const lt = await go({styles: sty(LAYOUT('pm1', 'fo:page-width=' +
      '"11in" fo:page-height="8.5in" style:print-orientation=' +
      '"landscape" fo:margin="1in"'), MASTER('Standard', 'pm1')),
    content: P('x')}, 'letter landscape');
    const q = lt.doc.sections[0].props;
    assert.deepEqual([q.pgSz.w, q.pgSz.h, q.pgSz.orient], [15840,
      12240, 'landscape']);
    assert.equal(q.pgMar.left, 1440);
  });

  it('columns and a page number start', async () => {
    const {doc} = await go({content: P('x'), styles: sty(LAYOUT('pm1',
      A4 + ' style:first-page-number="5" style:num-format="i"',
      '<style:columns fo:column-count="3" fo:column-gap="1cm">' +
      '<style:column-sep/></style:columns>'), MASTER('Standard',
      'pm1'))}, 'columns');
    const p = doc.sections[0].props;
    assert.equal(p.cols.num, 3);
    assert.equal(p.cols.space, 567);
    assert.equal(p.cols.sep, true);
    assert.deepEqual(p.pgNumType, {start: 5, fmt: 'lowerRoman'});
  });

  it('a layout of width 0, garbage or huge falls back to the ' +
    'default page with a note', async () => {
    for (const w of ['0cm', 'abc', '-3cm', '1e30', '9999cm', '']) {
      const {doc, notes} = await go({styles: sty(LAYOUT('pm1',
        `fo:page-width="${w}" fo:page-height="29.7cm" ` +
        'fo:margin="50cm"'), MASTER('Standard', 'pm1')),
      content: P('x')}, 'bad layout');
      const p = doc.sections[0].props;
      assert.ok(p.pgSz.w >= 1000 && p.pgSz.w <= 31680, w);
      assert.ok(p.pgMar.left + p.pgMar.right < p.pgSz.w, w);
      assert.ok(notes.some((n) => /page/.test(n)), w);
    }
  });

  it('a master page naming no layout, and none at all, read with ' +
    'the default page', async () => {
    const a = await go({styles: sty('', MASTER('Standard', 'nope')),
      content: P('x')}, 'no layout');
    assert.equal(a.doc.sections.length, 1);
    const b = await go({content: P('x')}, 'no master');
    assert.equal(b.doc.sections.length, 1);
  });

  it('a header and footer on the default page', async () => {
    const {doc, notes} = await go({content: P('Body'), styles: sty(
      LAYOUT('pm1', A4), MASTER('Standard', 'pm1',
        '<style:header><text:p>Head <text:span>one</text:span>' +
        '</text:p></style:header><style:footer><text:p>Foot' +
        '</text:p><text:p>Two</text:p></style:footer>'))}, 'hf');
    assert.deepEqual(storyText(doc, 0, 'hdr', 'default'), ['Head one']);
    assert.deepEqual(storyText(doc, 0, 'ftr', 'default'),
      ['Foot', 'Two']);
    assert.deepEqual(notes, []);
  });

  it('left and first headers: even and title page', async () => {
    const {doc} = await go({content: P('Body'), styles: sty(
      LAYOUT('pm1', A4), MASTER('Standard', 'pm1',
        '<style:header><text:p>R</text:p></style:header>' +
        '<style:header-left><text:p>L</text:p></style:header-left>' +
        '<style:header-first><text:p>F</text:p></style:header-first>' +
        '<style:footer-first><text:p>FF</text:p></style:footer-first>' +
        '<style:footer style:display="false"><text:p>no</text:p>' +
        '</style:footer>'))}, 'hf kinds');
    assert.deepEqual(storyText(doc, 0, 'hdr', 'default'), ['R']);
    assert.deepEqual(storyText(doc, 0, 'hdr', 'even'), ['L']);
    assert.deepEqual(storyText(doc, 0, 'hdr', 'first'), ['F']);
    assert.deepEqual(storyText(doc, 0, 'ftr', 'first'), ['FF']);
    assert.equal(storyText(doc, 0, 'ftr', 'default'), undefined);
    assert.equal(doc.sections[0].props.titlePg, true);
    assert.equal(settingsOf(doc).evenAndOddHeaders, true);
  });

  it('a header holds a table and a picture; deleted-text rules ' +
    'are the builder\'s', async () => {
    const {doc} = await go({pictures: {'a.png': PNG}, content: P('x'),
      styles: sty(LAYOUT('pm1', A4), MASTER('Standard', 'pm1',
        '<style:header><table:table><table:table-column/><table:' +
        'table-row><table:table-cell><text:p>c</text:p></table:' +
        'table-cell></table:table-row></table:table><text:p>' + FRAME(
          'Pictures/a.png') + '</text:p></style:header>'))},
    'header table');
    assert.ok(storyText(doc, 0, 'hdr', 'default'));
  });

  it('a mid-document master page change makes a second section',
    async () => {
      const {doc} = await go({auto: sw('P2', 'Second'), content:
        P('one') + P('two') + P('three', ' text:style-name="P2"') +
        P('four'), styles: sty(LAYOUT('pm1', A4) + LAYOUT('pm2',
          'fo:page-width="29.7cm" fo:page-height="21cm" ' +
          'style:print-orientation="landscape"'),
        MASTER('Standard', 'pm1', '<style:header><text:p>H1' +
          '</text:p></style:header>') + MASTER('Second', 'pm2',
          '<style:header><text:p>H2</text:p></style:header>'))},
      'two sections');
      assert.equal(doc.sections.length, 2);
      assert.deepEqual(doc.sections[0].blocks.map((p) => p.text),
        ['one', 'two']);
      assert.deepEqual(doc.sections[1].blocks.map((p) => p.text),
        ['three', 'four']);
      assert.equal(doc.sections[0].props.pgSz.orient, undefined);
      assert.equal(doc.sections[1].props.pgSz.orient, 'landscape');
      assert.deepEqual(storyText(doc, 0, 'hdr', 'default'), ['H1']);
      assert.deepEqual(storyText(doc, 1, 'hdr', 'default'), ['H2']);
    });

  it('a first paragraph with a master page name starts the first ' +
    'section from it; a table can switch too', async () => {
    const tbl = (st) => '<table:table table:style-name="' + st +
      '"><table:table-column/><table:table-row><table:table-cell>' +
      P('c') + '</table:table-cell></table:table-row></table:table>';
    const {doc} = await go({auto: sw('P2', 'Second') + '<style:style ' +
      'style:name="T2" style:family="table" style:master-page-name=' +
      '"Second"/>', content: P('one', ' text:style-name="P2"') +
      P('two') + tbl('T2'), styles: sty(LAYOUT('pm1', A4) +
      LAYOUT('pm2', 'fo:page-width="10cm" fo:page-height="20cm"'),
      MASTER('Standard', 'pm1') + MASTER('Second', 'pm2'))}, 'first');
    assert.equal(doc.sections.length, 1);
    assert.equal(doc.sections[0].props.pgSz.w, 5669);
    const t = await go({auto: '<style:style style:name="T2" style:' +
      'family="table" style:master-page-name="Second"/>', content:
      P('one') + tbl('T2'), styles: sty(LAYOUT('pm1', A4) + LAYOUT(
        'pm2', 'fo:page-width="10cm" fo:page-height="20cm"'),
      MASTER('Standard', 'pm1') + MASTER('Second', 'pm2'))}, 'tbl');
    assert.equal(t.doc.sections.length, 2);
    assert.equal(t.doc.sections[1].props.pgSz.w, 5669);
  });

  it('master page loops and 1,000 switches stay within the cap',
    async () => {
      const t0 = Date.now();
      const masters = MASTER('A', 'pm1', '', ' style:next-style-name=' +
        '"B"') + MASTER('B', 'pm1', '', ' style:next-style-name="A"') +
        MASTER('C', 'pm1', '', ' style:next-style-name="C"');
      const swi = sw('SA', 'A') + sw('SB', 'B');
      let c = '';
      for (let i = 0; i < 1000; i++) {
        c += P('p' + i, ` text:style-name="${i % 2 ? 'SA' : 'SB'}"`);
      }
      const {doc, notes} = await go({auto: swi, content: c,
        styles: sty(LAYOUT('pm1', A4), masters)}, 'switches');
      assert.ok(doc.sections.length > 1 && doc.sections.length <= 501);
      assert.ok(notes.some((n) => /page layout changes/.test(n)));
      assert.equal(paras(doc).length, 1000);
      assert.ok(Date.now() - t0 < 15000);
    });
});

const NOTE = (cls, body, cite = '1') => `<text:note text:id="n${
  Math.random()}" text:note-class="${cls}"><text:note-citation>${cite}` +
  `</text:note-citation><text:note-body>${body}</text:note-body>` +
  '</text:note>';

describe('ODT notes', () => {
  it('a footnote and an endnote read with their text', async () => {
    const {doc, notes} = await go({content: P('Text' + NOTE('footnote',
      P('The <text:span>note</text:span>.')) + ' more' + NOTE(
      'endnote', P('End.'), 'i'))}, 'notes');
    const fn = [...doc.notes.footnotes.values()].filter((n) =>
      n.type === 'normal');
    const en = [...doc.notes.endnotes.values()].filter((n) =>
      n.type === 'normal');
    assert.equal(fn.length, 1);
    assert.equal(en.length, 1);
    assert.ok(fn[0].blocks[0].text.endsWith('The note.'));
    assert.ok(en[0].blocks[0].text.endsWith('End.'));
    assert.deepEqual(notes, []);
  });

  it('a footnote inside a table cell, and a note body with a ' +
    'table', async () => {
    const cell = (x) => '<table:table><table:table-column/><table:' +
      'table-row><table:table-cell>' + x + '</table:table-cell>' +
      '</table:table-row></table:table>';
    const {doc} = await go({content: cell(P('in' + NOTE('footnote',
      P('cell note')))) + P('b' + NOTE('footnote', P('before') +
      cell(P('inner')) + P('after')))}, 'note table');
    const fn = [...doc.notes.footnotes.values()].filter((n) =>
      n.type === 'normal');
    assert.equal(fn.length, 2);
    assert.ok(fn[1].blocks.some((b) => b.type === 'tbl'));
  });

  it('a note inside a header or another note is skipped with a ' +
    'note', async () => {
    const {doc, notes} = await go({content: P('x' + NOTE('footnote',
      P('outer' + NOTE('footnote', P('inner'))))), styles: sty(LAYOUT(
      'pm1', A4), MASTER('Standard', 'pm1', '<style:header><text:p>' +
      'H' + NOTE('footnote', P('hn')) + '</text:p></style:header>'))},
    'nested notes');
    const fn = [...doc.notes.footnotes.values()].filter((n) =>
      n.type === 'normal');
    assert.equal(fn.length, 1);
    assert.ok(notes.some((n) => /notes inside/.test(n)), notes);
  });

  it('10,000 notes stop at the cap', async () => {
    const t0 = Date.now();
    const {notes} = await read({content: P(NOTE('footnote', P('n'))
      .repeat(10050))});
    assert.ok(notes.some((n) => /more than 10000/.test(n)), notes.join());
    assert.ok(Date.now() - t0 < 20000);
  });

  it('a note with no body or an odd class reads without failing',
    async () => {
      const {doc} = await go({content: P('a<text:note text:note-' +
        'class="footnote"/>b<text:note text:note-class="weird">' +
        '<text:note-body>' + P('w') + '</text:note-body></text:note>' +
        'c' + NOTE('footnote', ''))}, 'odd notes');
      assert.ok(paras(doc)[0].text.startsWith('a'));
    });
});

describe('ODT sections and page styles in tables', () => {
  const sec = (x, a = '') => `<text:section text:name="S"${a}>${x}` +
    '</text:section>';
  const tb = (x) => '<table:table><table:table-column/><table:table-' +
    'row><table:table-cell>' + x + '</table:table-cell></table:table-' +
    'row></table:table>';

  it('a section reads its paragraphs, table, list, picture and ' +
    'nested sections', async () => {
    const list = '<text:list><text:list-item>' + P('item') +
      '</text:list-item></text:list>';
    const {doc, notes} = await go({pictures: {'a.png': PNG}, content:
      P('before') + sec(P('INSIDE') + tb(P('cell')) + list + P(
        FRAME('Pictures/a.png')) + sec(P('deep') + sec(P('deeper')))) +
      P('after')}, 'sections');
    const text = blocks(doc).map((b) => b.type === 'p' ? b.text
      : 'TABLE');
    assert.deepEqual(text.filter((t) => t !== '￼'), ['before',
      'INSIDE', 'TABLE', 'item', 'deep', 'deeper', 'after']);
    assert.equal(drawings(doc).length, 1);
    assert.deepEqual(notes, []);
  });

  it('a hidden section is shown with a note; a section source is ' +
    'not followed', async () => {
    const {doc, notes} = await go({content: sec(P('secret'),
      ' text:display="none"') + sec('<text:section-source ' +
      'xlink:href="file:///etc/passwd" text:section-name="X"/>' +
      P('own'), ' text:protected="true" text:protection-key="k"')},
    'hidden');
    assert.deepEqual(paras(doc).map((p) => p.text), ['secret', 'own']);
    assert.ok(notes.some((n) => /hidden sections are shown/.test(n)));
    assert.ok(notes.some((n) => /not followed/.test(n)));
    assert.equal(notes.length, 2);
  });

  it('a master page name inside a table cell is ignored with one ' +
    'note', async () => {
    const {doc, notes} = await go({auto: sw('P2', 'Second'), content:
      P('one') + tb(P('c1', ' text:style-name="P2"') + P('c2',
        ' text:style-name="P2"')) + P('two'), styles: sty(
      LAYOUT('pm1', A4) + LAYOUT('pm2', 'fo:page-width="10cm" ' +
        'fo:page-height="20cm"'), MASTER('Standard', 'pm1') +
      MASTER('Second', 'pm2'))}, 'master in cell');
    assert.equal(doc.sections.length, 1);
    const t = blocks(doc).filter((b) => b.type === 'tbl');
    assert.equal(t.length, 1);
    assert.deepEqual(t[0].rows[0].cells[0].blocks.map((p) => p.text),
      ['c1', 'c2']);
    assert.deepEqual(notes.filter((n) => /inside a table/.test(n))
      .length, 1);
    assert.equal(notes.length, 1);
  });
});
