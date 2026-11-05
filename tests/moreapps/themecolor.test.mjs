// Theme colour on text (theme editing, task 5): the format op
// themeColor writes a raw w:color (w:val the RGB it shows, w:themeColor,
// w:themeTint / w:themeShade) with no rPr.color, as Word's own
// theme-coloured runs are kept; color replaces it and it replaces
// color; the caret's pending format, table cells and header stories
// behave alike; the menus' query, the screen (./Fmt), RTF, HTML and
// PDF output resolve it through the document's theme, also after the
// scheme changes.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import {query} from '../../tools/moreapps/!Letters/Format';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {forTyping, styleFor} from '../../tools/moreapps/!Letters/Pending';
import {typeText} from '../../tools/moreapps/!Letters/Edit';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {fileLoader} from '../../tools/moreapps/!Letters/PdfFiles';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {COLOR_SCHEMES} from '../../tools/moreapps/!Letters/ThemePresets';
import {colorOf} from '../../tools/moreapps/!Letters/ThemeRead';
import {addStyle} from '../../tools/moreapps/!Letters/Styles';
import {mk, P, C, SEL, undoable, S} from './edit-docs.mjs';
import {write} from './roundtrip-lib.mjs';
import {tm, loadStyles} from './word-docs.mjs';
import {modelTable} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {readPdf} from './pdf-read.mjs';
import {emit} from './word-emit.mjs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

before(loadStyles);

const T = (d) => new Typing(d);
const all = (d, k = 0) => SEL(d, k, 0, k, P(d, k).text.length);
const go = (d, id, sel, arg, pending) =>
  undoable(d, () => FA.apply(id, d, T(d), sel, arg, pending));
const L40 = {themeColor: 'accent1', themeTint: '99'};
// (./ThemeRead's HSL rule; Word itself writes 8EAADB here)
const V = colorOf(null, L40);
const OFFICE = COLOR_SCHEMES.find((s) => s.name === 'Office 2013 - 2022');
const PAPER = COLOR_SCHEMES.find((s) => s.name === 'Paper');
const colours = (rPr) => (rPr.extra || []).filter((n) =>
  n && n.name === 'w:color');
const rawAttrs = (rPr) => {
  const c = colours(rPr);
  assert.equal(c.length, 1, 'one raw w:color');
  return Object.fromEntries(c[0].attrs);
};
const run0 = (b) => b.runs[0].rPr;
const themeOf = (d) => d.doc.styles.theme;
const findPara = (doc, t) => {
  let out = null;
  forEachBlock(doc, (b) => {
    if (b.type === 'p' && b.text === t) { out = b; return false; }
    return true;
  });
  assert.ok(out, t);
  return out;
};

describe('themeColor on a selection', () => {
  it('writes the raw node, no rPr.color; one undo step, exact', () => {
    const d = mk(['abc']);
    go(d, 'themeColor', all(d), L40);
    const rPr = run0(P(d, 0));
    assert.equal(rPr.color, undefined);
    assert.deepEqual(rawAttrs(rPr), {'w:val': V,
      'w:themeColor': 'accent1', 'w:themeTint': '99'});
    assert.equal(query(d.doc, all(d)).color, V);
    go(d, 'themeColor', all(d), {themeColor: 'text2', themeShade: 'bf'});
    assert.deepEqual(rawAttrs(run0(P(d, 0))), {'w:val': colorOf(
      themeOf(d), {themeColor: 'text2', themeShade: 'BF'}),
    'w:themeColor': 'text2', 'w:themeShade': 'BF'});
    go(d, 'themeColor', all(d), {themeColor: 'accent6'});
    assert.deepEqual(rawAttrs(run0(P(d, 0))), {'w:val': '70AD47',
      'w:themeColor': 'accent6'});
  });
  it('color after themeColor drops the node, and vice versa', () => {
    const d = mk(['abc']);
    go(d, 'themeColor', all(d), L40);
    go(d, 'color', all(d), 'FF0000');
    assert.equal(run0(P(d, 0)).color, 'FF0000');
    assert.equal(colours(run0(P(d, 0))).length, 0);
    go(d, 'themeColor', all(d), L40);
    assert.equal(run0(P(d, 0)).color, undefined);
    assert.equal(colours(run0(P(d, 0))).length, 1);
    go(d, 'color', all(d), 'auto');
    assert.equal(run0(P(d, 0)).color, undefined);
    assert.equal(colours(run0(P(d, 0))).length, 0);
    assert.equal(query(d.doc, all(d)).color, 'auto');
    go(d, 'themeColor', all(d), L40);
    go(d, 'clearFormat', all(d));
    assert.equal(colours(run0(P(d, 0))).length, 0);
  });
  it('bad arguments: RangeError, nothing changed', () => {
    const d = mk(['abc']);
    for (const bad of [null, 'accent1', {themeColor: 'puce'},
      {themeColor: 'none'}, {themeColor: 'accent1', themeTint: 'xyz'},
      {themeColor: 'accent1', themeTint: '33', themeShade: 'BF'},
      {themeColor: 'accent1', extra: 1}]) {
      assert.throws(() => FA.apply('themeColor', d, T(d), all(d), bad),
        RangeError, JSON.stringify(bad));
    }
    assert.equal(d.undoDepth, 0);
  });
  it('part of a run: only that part themed', () => {
    const d = mk(['abcdef']);
    go(d, 'themeColor', SEL(d, 0, 2, 0, 4), L40);
    const rs = P(d, 0).runs;
    assert.equal(rs.length, 3);
    assert.equal(colours(rs[0].rPr).length, 0);
    assert.equal(colours(rs[1].rPr).length, 1);
    assert.equal(colours(rs[2].rPr).length, 0);
  });
  it('mixed selection: query null; all alike: the colour', () => {
    const d = mk(['abcdef']);
    go(d, 'themeColor', SEL(d, 0, 0, 0, 3), L40);
    go(d, 'color', SEL(d, 0, 3, 0, 6), V);
    // the same RGB, one themed and one literal: alike for the menu
    assert.equal(query(d.doc, all(d)).color, V);
    go(d, 'themeColor', SEL(d, 0, 3, 0, 6), {themeColor: 'accent2'});
    assert.equal(query(d.doc, all(d)).color, null);
    go(d, 'themeColor', all(d), {themeColor: 'accent2'});
    assert.equal(query(d.doc, all(d)).color, 'ED7D31');
  });
  it('a run in a heading: its own theme colour, not the style\'s', () => {
    const d = mk([['Head', {pStyle: 'Heading1'}]]);
    const before = query(d.doc, all(d)).color;
    assert.equal(before, colorOf(themeOf(d),
      {themeColor: 'accent1', themeShade: 'BF'}));
    go(d, 'themeColor', all(d), {themeColor: 'accent2'});
    assert.equal(query(d.doc, all(d)).color, 'ED7D31');
    const f = runFmt(d.doc.styles, P(d, 0), P(d, 0).runs[0]);
    assert.equal(f.colour, '#ED7D31');
    go(d, 'color', all(d), '123456');
    assert.equal(query(d.doc, all(d)).color, '123456');
  });
});

describe('no empty undo steps; colours over styles', () => {
  it('the same swatch again changes nothing, as color does', () => {
    const d = mk(['abc']);
    go(d, 'themeColor', all(d), L40);
    assert.equal(d.undoDepth, 1);
    go(d, 'themeColor', all(d), L40);
    assert.equal(d.undoDepth, 1, 'no second step');
    go(d, 'themeColor', all(d), {themeColor: 'accent1',
      themeTint: '99'});
    assert.equal(d.undoDepth, 1);
    go(d, 'themeColor', all(d), {themeColor: 'accent2'});
    assert.equal(d.undoDepth, 2, 'a different one is a change');
  });
  it('the same swatch at a caret in a themed run: no step', () => {
    const d = mk(['abc']);
    go(d, 'themeColor', all(d), L40);
    const n = d.undoDepth;
    const got = FA.apply('themeColor', d, T(d), C(d, 0, 1), L40);
    assert.equal(d.undoDepth, n);
    assert.equal(query(d.doc, C(d, 0, 1), got.pending).color, V);
    typeText(d, C(d, 0, 1), 'X', {rPr: forTyping(got.pending)});
    const rs = P(d, 0).runs;
    assert.equal(rs.length, 1, 'typed text joins the themed run');
    assert.equal(rawAttrs(rs[0].rPr)['w:themeColor'], 'accent1');
  });
  it('a literal colour in the style beneath a themed run', () => {
    const d = mk([['abc', {pStyle: 'Red'}]]);
    addStyle(d.doc.styles, {id: 'Red', type: 'paragraph', name: 'Red',
      pPr: {extra: []}, rPr: {color: 'FF0000', extra: []}, extra: [],
      raw: null});
    assert.equal(query(d.doc, all(d)).color, 'FF0000');
    go(d, 'themeColor', all(d), {themeColor: 'accent2'});
    assert.equal(query(d.doc, all(d)).color, 'ED7D31');
    const f = runFmt(d.doc.styles, P(d, 0), P(d, 0).runs[0]);
    assert.equal(f.colour, '#ED7D31');
  });
  it('w:color auto on a run in a theme-coloured heading: black', () => {
    const d = mk([['Head', {pStyle: 'Heading1', runs: [{start: 0,
      end: 4, rPr: {color: 'auto', extra: []}}]}]]);
    assert.equal(query(d.doc, all(d)).color, 'auto');
    const f = runFmt(d.doc.styles, P(d, 0), P(d, 0).runs[0]);
    assert.equal(f.colour, '#000000');
  });
});

describe('themeColor at a caret (pending)', () => {
  it('typed text gets the node; color then replaces it', () => {
    const d = mk(['ab']);
    const c = C(d, 0, 1);
    const got = FA.apply('themeColor', d, T(d), c, L40);
    assert.equal(d.undoDepth, 0, 'no document change');
    assert.equal(query(d.doc, c, got.pending).color, V);
    let sel = typeText(d, c, 'X', {rPr: forTyping(got.pending),
      rStyle: styleFor(got.pending)});
    const x = P(d, 0).runs.find((q) => q.start === 1);
    assert.equal(x.end, 2);
    assert.equal(x.rPr.color, undefined);
    assert.deepEqual(rawAttrs(x.rPr), {'w:val': V,
      'w:themeColor': 'accent1', 'w:themeTint': '99'});
    const g2 = FA.apply('color', d, T(d), sel, 'FF0000', got.pending);
    assert.equal(query(d.doc, sel, g2.pending).color, 'FF0000');
    sel = typeText(d, sel, 'Y', {rPr: forTyping(g2.pending)});
    const y = P(d, 0).runs.find((q) => q.start === 2);
    assert.equal(y.rPr.color, 'FF0000');
    assert.equal(colours(y.rPr).length, 0);
    const g3 = FA.apply('themeColor', d, T(d), sel,
      {themeColor: 'accent2'}, g2.pending);
    typeText(d, sel, 'Z', {rPr: forTyping(g3.pending)});
    const z = P(d, 0).runs.find((q) => q.start === 3);
    assert.equal(z.rPr.color, undefined);
    assert.equal(rawAttrs(z.rPr)['w:themeColor'], 'accent2');
  });
});

describe('themeColor in a table cell and a header story', () => {
  it('a cell run: as in the body', () => {
    const d = mk(['x', modelTable([['a1', 'b1'], ['a2', 'b2']]), 'y']);
    const b = findPara(d.doc, 'b1');
    const sel = S.select({id: b.id, off: 0}, {id: b.id, off: 2});
    go(d, 'themeColor', sel, L40);
    const nb = findPara(d.doc, 'b1');
    assert.deepEqual(rawAttrs(run0(nb)), {'w:val': V,
      'w:themeColor': 'accent1', 'w:themeTint': '99'});
    assert.equal(query(d.doc, sel).color, V);
    assert.equal(colours(run0(findPara(d.doc, 'a1'))).length, 0);
    go(d, 'color', sel, '00FF00');
    assert.equal(colours(run0(findPara(d.doc, 'b1'))).length, 0);
  });
  it('a header run: as in the body, one undo step', async () => {
    const H = 'word/header1.xml';
    const d = new Document(await readDocx(await withHeaders(
      p(r('body')), {default: {hdr: p(r('Head'))}})));
    const f = facadeOf(d, H, 0);
    const h0 = d.doc.stories.get(H).blocks[0];
    const sel = S.select({id: h0.id, off: 0}, {id: h0.id, off: 4});
    const before = structuredClone(d.doc.stories.get(H).blocks);
    FA.apply('themeColor', f, new Typing(f), sel, L40);
    assert.equal(d.undoDepth, 1);
    const rPr = run0(d.doc.stories.get(H).blocks[0]);
    assert.equal(rPr.color, undefined);
    assert.equal(rawAttrs(rPr)['w:themeColor'], 'accent1');
    assert.equal(query(f.doc, sel).color, V);
    const z = await readZip(await write(d.doc));
    assert.match(new TextDecoder().decode(z.get(H)), new RegExp(
      '<w:color w:val="' + V + '" w:themeColor="accent1" ' +
      'w:themeTint="99"/>'));
    d.undo();
    assert.deepEqual(d.doc.stories.get(H).blocks, before);
  });
});

describe('saving, and the scheme changing', () => {
  it('DocxWrite -> DocxRead keeps the node; Word opens it', async () => {
    const d = mk(['themed', 'literal']);
    go(d, 'themeColor', all(d, 0), L40);
    go(d, 'color', all(d, 1), V);
    const bytes = await write(d.doc);
    emit('theme-colour-run', bytes);
    const back = await readDocx(bytes);
    const rPr = back.sections[0].blocks[0].runs[0].rPr;
    assert.equal(rPr.color, undefined);
    assert.deepEqual(rawAttrs(rPr), {'w:val': V,
      'w:themeColor': 'accent1', 'w:themeTint': '99'});
    assert.equal(back.sections[0].blocks[1].runs[0].rPr.color, V);
  });
  it('a new scheme: the themed run follows, a literal one does not',
    () => {
      const d = mk(['themed', 'literal']);
      go(d, 'themeColor', all(d, 0), L40);
      go(d, 'color', all(d, 1), V);
      assert.deepEqual(TD.setColors(d, PAPER), {ok: true});
      const want = colorOf(themeOf(d), L40);
      assert.notEqual(want, V);
      assert.equal(query(d.doc, all(d, 0)).color, want);
      assert.equal(query(d.doc, all(d, 1)).color, V);
      const f0 = runFmt(d.doc.styles, P(d, 0), P(d, 0).runs[0]);
      const f1 = runFmt(d.doc.styles, P(d, 1), P(d, 1).runs[0]);
      assert.equal(f0.colour, '#' + want);
      assert.equal(f1.colour, '#' + V);
      // Paper's accent1 lightened 40%
      assert.equal(PAPER.slots.accent1, 'A5B592');
      assert.deepEqual(TD.setColors(d, OFFICE), {ok: true});
      assert.equal(query(d.doc, all(d, 0)).color, V);
      d.undo();
      assert.equal(query(d.doc, all(d, 0)).color, want);
    });
});

/** 'RRGGBB' -> RTF colour table entry. */
const rtfEntry = (hex) => {
  const [a, b, c] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2),
    16));
  return `\\red${a}\\green${b}\\blue${c};`;
};
/** The colour table index of hex in rtf, then \cfN must be used. */
function rtfUses(rtf, hex) {
  const tbl = /\{\\colortbl;([^}]*)\}/.exec(rtf);
  assert.ok(tbl, 'a colour table');
  const entries = tbl[1].split(';').filter(Boolean).map((e) => e + ';');
  const i = entries.indexOf(rtfEntry(hex));
  if (i < 0) return false;
  return new RegExp('\\\\cf' + (i + 1) + '(?![0-9])').test(rtf);
}

describe('RTF, HTML and PDF output resolve the theme', () => {
  const themed = () => {
    const d = mk(['themed', 'literal']);
    go(d, 'themeColor', all(d, 0), L40);
    go(d, 'color', all(d, 1), '123456');
    return d;
  };
  it('RTF', () => {
    const d = themed();
    let rtf = new TextDecoder('latin1').decode(writeRtf(d.doc).bytes);
    assert.ok(rtfUses(rtf, V), 'themed run');
    assert.ok(rtfUses(rtf, '123456'), 'literal run');
    TD.setColors(d, PAPER);
    const want = colorOf(themeOf(d), L40);
    rtf = new TextDecoder('latin1').decode(writeRtf(d.doc).bytes);
    assert.ok(rtfUses(rtf, want), 'themed run after the scheme change');
    assert.ok(rtfUses(rtf, '123456'));
  });
  it('HTML', () => {
    const d = themed();
    const sel = SEL(d, 0, 0, 1, 7);
    assert.match(toHtml(d.doc, slice(d.doc, sel)), new RegExp('color:#' + V));
    TD.setColors(d, PAPER);
    const want = colorOf(themeOf(d), L40);
    const h = toHtml(d.doc, slice(d.doc, sel));
    assert.match(h, new RegExp('color:#' + want));
    assert.match(h, /color:#123456/);
  });
  it('PDF', async () => {
    const d = themed();
    TD.setColors(d, PAPER);
    const want = colorOf(themeOf(d), L40);
    const content = await pdfContent(d);
    const rgs = [...content.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)]
      .map((m) => [1, 2, 3].map((k) => Math.round(Number(m[k]) * 255)));
    const near = (hex) => {
      const v = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return rgs.some((c) => c.every((x, i) => Math.abs(x - v[i]) <= 1));
    };
    assert.ok(near(want), 'themed run in ' + JSON.stringify(rgs));
    assert.ok(near('123456'), 'literal run');
    assert.ok(!near(V), 'not the old scheme\'s colour');
  });
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');

/** The first page's content stream of d exported as a PDF. */
async function pdfContent(d) {
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
  const res = await exportPdf(dw, {loader, raf: (cb) => setImmediate(cb),
    now: () => new Date(Date.UTC(2026, 10, 5))});
  return readPdf(res.bytes).pages[0].content;
}
