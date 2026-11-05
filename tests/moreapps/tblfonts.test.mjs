// A typed font in a table style, a table style's condition or a
// character style chain beats the theme font a lower layer gives
// (theme document defaults, a parent style): on the screen, in RTF
// and in a PDF. (Fonts are replaced slot by slot: ./StyleFonts.)
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {fileLoader} from '../../tools/moreapps/!Letters/PdfFiles';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {fontName} from '../../tools/moreapps/!Letters/Fmt';
import {resolveRun} from '../../tools/moreapps/!Letters/Styles';
import {viewOf} from '../../tools/moreapps/!Letters/TblStyle';
import {lookOf, layerOf, stylesFor}
  from '../../tools/moreapps/!Letters/TblCond';
import {tblDocx, tbl, tr, tc} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {tm, loadStyles} from './word-docs.mjs';
import {emit} from './word-emit.mjs';
import {write} from './roundtrip-lib.mjs';

before(loadStyles);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const rf = (a) => `<w:rFonts w:ascii="${a}" w:hAnsi="${a}"/>`;
const THEMED = '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts ' +
  'w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" ' +
  'w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi"/>' +
  '</w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>';
const TS = '<w:style w:type="table" w:styleId="TS">' +
  '<w:name w:val="TS"/>' +
  `<w:rPr>${rf('Times New Roman')}</w:rPr>` +
  '<w:tblStylePr w:type="firstRow"><w:rPr>' + rf('Arial') +
  '</w:rPr></w:tblStylePr></w:style>';
const CHARS = '<w:style w:type="character" w:styleId="C1"><w:name ' +
  'w:val="C1"/><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" ' +
  'w:hAnsiTheme="majorHAnsi"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="C2"><w:name w:val="C2"/>' +
  `<w:basedOn w:val="C1"/><w:rPr>${rf('Arial')}</w:rPr></w:style>`;
const table = (rows) => tbl(rows, {tblPr: '<w:tblStyle w:val="TS"/>' +
  '<w:tblLook w:val="0420"/>'});
const cell = (t) => tc(p(r(t)));
const BODY = table([tr([cell('head one'), cell('head two')]),
  tr([cell('body one'), cell('body two')])]) +
  p(r('chained', '<w:rStyle w:val="C2"/>'));
const open = async () => new Document(await readDocx(await tblDocx(BODY,
  {styles: THEMED + TS + CHARS})));

/** The font name of cell (row, col)'s text as the layout derives it. */
function cellFont(d, row, col) {
  const t = d.doc.sections[0].blocks.find((b) => b.type === 'tbl');
  const view = viewOf(d.doc.styles, 'TS'), look = lookOf(t.tblPr);
  const layer = layerOf(view, look, row, col, 2, 2);
  const s = stylesFor(d.doc.styles, layer, false);
  const para = t.rows[row].cells[col].blocks[0];
  return fontName(resolveRun(s, para, para.runs[0]), s.theme);
}

describe('typed fonts over theme fonts', () => {
  it('a table style\'s font over theme document defaults (screen)',
    async () => {
      const d = await open();
      assert.equal(cellFont(d, 1, 0), 'Times New Roman');
      assert.equal(cellFont(d, 1, 1), 'Times New Roman');
    });
  it('a table style\'s firstRow condition font', async () => {
    const d = await open();
    assert.equal(cellFont(d, 0, 0), 'Arial');
    assert.equal(cellFont(d, 0, 1), 'Arial');
  });
  it('a character style chain: typed Arial over majorHAnsi',
    async () => {
    const d = await open();
    const para = d.doc.sections[0].blocks.at(-1);
    assert.equal(fontName(resolveRun(d.doc.styles, para, para.runs[0]),
      d.doc.styles.theme), 'Arial');
  });
  it('RTF: the chained character style names Arial, not its parent\'s',
    async () => {
      // (RTF does not write a table style's fonts: LOST.tableStyles;
      // this guards the style sheet's chain, ./RtfWriteStyles)
      const d = await open();
      const rtf = new TextDecoder('latin1')
        .decode(writeRtf(d.doc).bytes);
      const tblf = /\{\\fonttbl(.*?)\}\s*\{\\colortbl/s.exec(rtf)[1];
      const cs = /\{\\\*\\cs\d+[^}]*C2;\}/.exec(rtf);
      assert.ok(cs, 'C2 in the style sheet');
      const f = /\\f(\d+)/.exec(cs[0]);
      assert.ok(f, cs[0]);
      assert.match(tblf, new RegExp('\\{\\\\f' + f[1] + '[^;]*Arial;'));
    });
  it('PDF: the cells are drawn in the table style\'s fonts',
    async () => {
    const d = await open();
    const loader = fileLoader({dir: 'F', base: 'none',
      readBytes: async (name) => new Uint8Array(fs.readFileSync(
        path.join(FONTS, name.slice(2)))),
      fetchBytes: async () => null});
    const L = new DocLayout(d.doc, tm(), null, {floats: true,
      markup: 'final', pics: {get: () => ({state: 'pending'})}});
    L.layout(800);
    const pages = new Pages(printGalley(L));
    L.place = PlacePrint(L, pages);
    L.layout(800);
    pages.finish();
    d.markup = 'final';
    const dw = {d, doc: d.doc, L, pages, viewName: 'print',
      get markup() { return d.markup; },
      fields: {now: new Date(Date.UTC(2026, 0, 1)),
        shade: {mode: 'always'}}};
    const res = await exportPdf(dw, {loader,
      raf: (cb) => setImmediate(cb),
      now: () => new Date(Date.UTC(2026, 10, 5))});
    const names = [...new Set([...new TextDecoder('latin1')
      .decode(res.bytes).matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)]
      .map((m) => m[1].replace(/^[A-Z]{6}\+/, '')))].sort();
    assert.ok(names.includes('LiberationSerif'), names.join());
    assert.ok(names.includes('LiberationSans'), names.join());
    assert.ok(!names.some((n) => /Carlito/.test(n) && names.length < 3),
      names.join());
  });
  it('Word opens the file (WORD_EMIT)', async () => {
    const d = await open();
    emit('table-style-font', await write(d.doc));
  });
});
