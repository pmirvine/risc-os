// Theme editing over the corpus and the output paths (theme editing,
// task 9).
//
// - every corpus file with a theme part (git-ignored, optional: one
//   file in ten, every one with WORD_EDIT_CORPUS=1 and
//   NODE_OPTIONS=--max-old-space-size=4096): every colour scheme and
//   every font pair set in turn, the file written and read again: the
//   theme reads as the preset, the body text and the styles are as
//   before, the format scheme and every other theme child are kept;
//   counts are printed;
// - a document with a Heading 1 after setFonts / setColors: the
//   screen (Fmt), RTF, HTML and PDF export and print layout use the
//   edited theme's fonts and colours;
// - the files Word is asked to open (emit(); node
//   tools/word-open-check.mjs --emitted): one per kind of edit, a
//   themed-coloured run, a custom theme with a Latin-1 scheme name.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {fileLoader} from '../../tools/moreapps/!Letters/PdfFiles';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {runFmt, fontName} from '../../tools/moreapps/!Letters/Fmt';
import {resolveRun} from '../../tools/moreapps/!Letters/Styles';
import {query} from '../../tools/moreapps/!Letters/Format';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {COLOR_SCHEMES, FONT_PAIRS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import {parse, colorOf} from '../../tools/moreapps/!Letters/ThemeRead';
import {THEME_PART} from '../../tools/moreapps/!Letters/OpsTheme';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {mk, P, SEL} from './edit-docs.mjs';
import {write, corpusFiles, nameOf, hash, ALL, SKIP_CORPUS, EXPECTED}
  from './roundtrip-lib.mjs';
import {tm, loadStyles} from './word-docs.mjs';
import {readPdf} from './pdf-read.mjs';
import {emit} from './word-emit.mjs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';

before(loadStyles);

const dec = (b) => new TextDecoder().decode(b);
const local = (n) => String(n).split(':').pop();
const SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2',
  'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

// ------------------------------------------------------------ corpus

/** Paragraph texts of every section, then the styles without theme. */
function facts(doc) {
  const out = [];
  forEachBlock(doc, (b) => {
    if (b.type === 'p') out.push(b.text);
    return true;
  });
  const {theme, ...styles} = doc.styles || {};
  return {text: out, styles};
}

/** The theme's children other than the edited parts, serialised. */
function others(bytes) {
  const root = parseXml(dec(bytes)).root;
  const els = root.children.find((c) => c.name &&
    local(c.name) === 'themeElements');
  const keep = (c) => c.name && !['clrScheme'].includes(local(c.name));
  const fonts = (c) => (local(c.name) === 'fontScheme'
    ? {...c, children: c.children.filter((k) => k.name &&
      !['majorFont', 'minorFont'].includes(local(k.name)))} : c);
  return {
    rest: root.children.filter((c) => c !== els).map((c) =>
      (c.name ? serialize(c) : String(c))),
    els: els.children.filter(keep).map((c) => (c.name ?
      serialize(fonts(c)) : String(c))),
    fonts: els.children.filter((c) => c.name &&
      local(c.name) === 'fontScheme').flatMap((c) => c.children.filter(
      (k) => k.name && ['majorFont', 'minorFont'].includes(
        local(k.name)))).map((k) => k.children.filter((x) => x.name &&
        local(x.name) !== 'latin').map((x) => serialize(x))),
  };
}

const files = corpusFiles();
const stats = {files: 0, themed: 0, edits: 0, refused: 0, noTheme: 0};

describe('theme editing over the corpus', {
  skip: files.length ? false : SKIP_CORPUS}, () => {
  it('every scheme and font pair: reads back, rest unchanged',
    async () => {
      const bad = [];
      for (const f of files) {
        const name = nameOf(f);
        let doc;
        try {
          doc = await readDocx(new Uint8Array(fs.readFileSync(f)));
        } catch (e) {
          if (e instanceof DocxError) { stats.refused++; continue; }
          throw e;
        }
        stats.files++;
        const bytes0 = doc.parts instanceof Map &&
          doc.parts.get(THEME_PART);
        if (!bytes0) { stats.noTheme++; continue; }
        stats.themed++;
        const d = new Document(doc);
        // (what a plain write and read gives: a file with no styles
        // part gets the built-in ones)
        const want = facts(await readDocx(await write(doc)));
        const keep = others(bytes0);
        const edits = [...COLOR_SCHEMES.map((s) => ['colors', s]),
          ...FONT_PAIRS.map((s) => ['fonts', s])];
        // a different start for each file, so the sample varies
        const turn = hash(name) % edits.length;
        edits.push(...edits.splice(0, turn));
        let colors = null, fonts = null, n = 0;
        for (const [kind, p] of edits) {
          const r = kind === 'colors' ? TD.setColors(d, p)
            : TD.setFonts(d, p);
          if (!r.ok) { bad.push(`${name}: ${kind} ${p.name} ` +
            JSON.stringify(r)); break; }
          stats.edits++;
          if (kind === 'colors') colors = p; else fonts = p;
          // written and read again after some of them (every one is
          // too slow for the big files); always after the last
          if (++n % 12 !== 0 && n !== edits.length) continue;
          const back = await readDocx(await write(d.doc));
          const t = parse(back.parts.get(THEME_PART));
          if (colors) {
            for (const k of SLOTS) {
              if (t.colors.get(k) !== colors.slots[k]) {
                bad.push(`${name}: ${colors.name} ${k}`);
              }
            }
          }
          if (fonts && (t.major !== fonts.major ||
              t.minor !== fonts.minor)) {
            bad.push(`${name}: ${fonts.name} fonts`);
          }
          const got = facts(back);
          try {
            assert.deepEqual(got.text, want.text);
            assert.deepEqual(got.styles, want.styles);
          } catch (e) {
            bad.push(`${name}: text or styles changed`);
          }
          try {
            assert.deepEqual(others(back.parts.get(THEME_PART)), keep);
          } catch (e) {
            bad.push(`${name}: theme children changed`);
          }
        }
      }
      console.log('theme corpus:', JSON.stringify(stats),
        ALL ? '(every file)' : '(one file in ten)');
      assert.deepEqual(bad.slice(0, 10), []);
    });
});

// ------------------------------------------------------------ output

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const PAIR = FONT_PAIRS.find((f) => f.name === 'Arial-Times New Roman');
const PAPER = COLOR_SCHEMES.find((s) => s.name === 'Paper');
// (the body's default font follows the theme's minor font, as in
// Word's own documents)
const heading = () => {
  const d = mk([['Heading text', {pStyle: 'Heading1'}], 'Body text']);
  d.doc.styles.docDefaults.rPr = {sz: 22, szCs: 22, extra: [
    {name: 'w:rFonts', attrs: [['w:asciiTheme', 'minorHAnsi'],
      ['w:hAnsiTheme', 'minorHAnsi']], children: []}]};
  return d;
};
/** The font name (./Fmt fontName) of paragraph k's first run. */
const fontOfPara = (d, k) => fontName(resolveRun(d.doc.styles, P(d, k),
  P(d, k).runs[0]), d.doc.styles.theme);
const all = (d, k = 0) => SEL(d, k, 0, k, P(d, k).text.length);

/** The PDF bytes of d exported from print layout. */
async function pdfOf(d) {
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
  return (await exportPdf(dw, {loader, raf: (cb) => setImmediate(cb),
    now: () => new Date(Date.UTC(2026, 10, 5))})).bytes;
}
const baseFonts = (bytes) => [...new Set([...new TextDecoder('latin1')
  .decode(bytes).matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)]
  .map((m) => m[1].replace(/^[A-Z]{6}\+/, '')))].sort();

describe('output paths use the edited theme', () => {
  it('the screen: both fonts follow the pair', () => {
    const d = heading();
    const was = [fontOfPara(d, 0), fontOfPara(d, 1)];
    assert.deepEqual(TD.setFonts(d, PAIR), {ok: true});
    assert.equal(fontOfPara(d, 0), 'Arial');
    assert.equal(fontOfPara(d, 1), 'Times New Roman');
    assert.equal(query(d.doc, all(d)).family, 'Arial');
    assert.equal(query(d.doc, all(d, 1)).family, 'Times New Roman');
    assert.notEqual(was[0], 'Arial');
    assert.notEqual(was[1], 'Times New Roman');
  });
  it('RTF: the font table names the new fonts', () => {
    const d = heading();
    TD.setFonts(d, PAIR);
    const rtf = new TextDecoder('latin1').decode(writeRtf(d.doc).bytes);
    const tbl = /\{\\fonttbl(.*?)\}\s*\{?\\colortbl/s.exec(rtf);
    assert.ok(tbl, 'a font table');
    assert.match(tbl[1], /Arial/);
    assert.match(tbl[1], /Times New Roman/);
    assert.doesNotMatch(tbl[1], /Calibri/);
  });
  it('RTF and HTML: the heading colour follows the scheme', () => {
    const d = heading();
    const col = (s) => colorOf(s, {themeColor: 'accent1',
      themeShade: 'BF'});
    const was = col(d.doc.styles.theme);
    TD.setColors(d, PAPER);
    const want = col(d.doc.styles.theme);
    assert.notEqual(want, was);
    const f = runFmt(d.doc.styles, P(d, 0), P(d, 0).runs[0]);
    assert.equal(f.colour, '#' + want);
    const rtf = new TextDecoder('latin1').decode(writeRtf(d.doc).bytes);
    const tbl = /\{\\colortbl;([^}]*)\}/.exec(rtf)[1];
    const [a, b, c] = [0, 2, 4].map((i) => parseInt(want.slice(i, i + 2),
      16));
    assert.ok(tbl.includes(`\\red${a}\\green${b}\\blue${c};`), tbl);
    const html = toHtml(d.doc, slice(d.doc, SEL(d, 0, 0, 1, 9)));
    assert.match(html, new RegExp('color:#' + want, 'i'));
    assert.doesNotMatch(html, new RegExp('color:#' + was, 'i'));
  });
  it('HTML: the font names', () => {
    const d = heading();
    TD.setFonts(d, PAIR);
    const html = toHtml(d.doc, slice(d.doc, SEL(d, 0, 0, 1, 9)));
    assert.match(html, /font-family:&#39;Arial&#39;/);
    assert.doesNotMatch(html, /Calibri/);
  });
  it('PDF from print layout: other fonts after setFonts', async () => {
    const d = heading();
    const was = baseFonts(await pdfOf(d));
    TD.setFonts(d, PAIR);
    const now = baseFonts(await pdfOf(d));
    assert.ok(now.length > 0 && was.length > 0, 'fonts found');
    assert.notDeepEqual(now, was);
    // (Arial and Times New Roman are drawn in their metric twins)
    assert.deepEqual(now, ['LiberationSans', 'LiberationSerif']);
    assert.ok(!now.some((n) => /Carlito/.test(n)));
    assert.ok(readPdf(await pdfOf(d)).pages.length >= 1);
  });
});

// ------------------------------------------------------------ Word

describe('files for real Word (WORD_EMIT)', () => {
  const doc = () => {
    const d = mk([['Heading one', {pStyle: 'Heading1'}],
      ['Heading two', {pStyle: 'Heading2'}], 'Body text, themed',
      'Body text, literal']);
    FA.apply('themeColor', d, new Typing(d), all(d, 2),
      {themeColor: 'accent2', themeTint: '99'});
    FA.apply('color', d, new Typing(d), all(d, 3), '123456');
    return d;
  };
  const out = async (name, d) => {
    const bytes = await write(d.doc);
    emit(name, bytes);
    // (the part reads back as written)
    const back = await readDocx(bytes);
    assert.deepEqual(back.styles.theme, d.doc.styles.theme);
    return bytes;
  };
  it('a font pair, a colour scheme, both, reset', async () => {
    const d = doc();
    TD.setFonts(d, PAIR);
    await out('theme9-fonts', d);
    TD.setColors(d, PAPER);
    await out('theme9-fonts-colours', d);
    TD.reset(d);
    await out('theme9-reset', d);
    const e = doc();
    TD.setColors(e, COLOR_SCHEMES[COLOR_SCHEMES.length - 1]);
    await out('theme9-colours-last', e);
  });
  it('a custom theme with a Latin-1 scheme name and fonts', async () => {
    const d = doc();
    const slots = {...TD.colorsOf(d).slots, accent1: '1F7A5C',
      accent2: 'C0392B'};
    assert.deepEqual(TD.setColors(d, {name: 'Café à la crème',
      slots}), {ok: true});
    assert.deepEqual(TD.setFonts(d, {major: 'Constantia',
      minor: 'Gill Sans MT'}), {ok: true});
    const bytes = await out('theme9-custom-latin1', d);
    const z = await readZip(bytes);
    assert.match(dec(z.get(THEME_PART)), /Café à la crème/);
  });
  it('a document without a theme part gets one', async () => {
    const d = doc();
    d.doc.parts.delete(THEME_PART);
    d.doc.rels = d.doc.rels.filter((r) => r.target !== 'theme/theme1.xml');
    delete d.doc.styles.theme;
    assert.deepEqual(TD.setFonts(d, PAIR), {ok: true});
    await out('theme9-absent-part-added', d);
  });
});
