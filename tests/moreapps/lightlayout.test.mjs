// Calibri Light in layout: a new document's Title and Heading 1 are
// drawn in the bundled Letters Light, whose advances are Calibri
// Light's (lightfont-widths.json) and whose line metrics are Carlito
// Regular's; bold Calibri Light has no Light face and is drawn in
// Carlito Bold. Measured through the engine's own path: Fmt.runFmt's
// format, LineLayout with the real fonts' advances (pdf-docs metrics,
// opentype.js over the bundled files, as PDF export measures).
//
// The wrap (b): PG37 (pg-36-metrics.docx, the long Calibri Light
// paragraph) has no answer from Word in the corpus (the hand-off's
// "if time allows" questions were not answered), so the expected
// breaks are derived from lightfont-widths.json: a greedy fill of the
// A4 text column (11906 - 2 x 1440 twips) with Calibri Light's own
// advances, a line breaking before the first word that would end past
// the column (trailing spaces hang, as in Word).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import * as FM from '../../tools/moreapps/!Letters/FontMetrics';
import {newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {layoutPara} from '../../tools/moreapps/!Letters/LineLayout';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {metrics, fontPath, bundled, windowOf} from './pdf-docs.mjs';
import {emit} from './word-emit.mjs';

const DIR = new URL('../../tools/moreapps/!Letters/Fonts/',
  import.meta.url);
const bytes = (leaf) => new Uint8Array(readFileSync(new URL(leaf, DIR)));
const WIDTHS = JSON.parse(readFileSync(
  new URL('./lightfont-widths.json', import.meta.url), 'utf8'));
const TWIP = 1 / 15;                        // px (96 dpi)
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps,
  `${what}: ${a} not within ${eps} of ${b}`);

/** Calibri Light's advance of text at px (widths per 1000 em). */
const lightWidth = (text, px, face = 'regular') => [...text].reduce(
  (s, c) => {
    const w = WIDTHS[face][c.codePointAt(0)];
    assert.ok(w !== undefined, `no width for ${c}`);
    return s + w * px / 1000;
  }, 0);

let styles, tm;
before(() => {
  // the faces as FontLoad registers them (bold Letters Light: the
  // bytes of Carlito Bold under the Letters Light name)
  FM.register('Letters Light', false, false,
    bytes('LettersLight-Regular'));
  FM.register('Letters Light', false, true, bytes('LettersLight-Italic'));
  FM.register('Letters Light', true, false, bytes('Carlito-Bold'));
  FM.register('Carlito', false, false, bytes('Carlito-Regular'));
  FM.register('Carlito', true, false, bytes('Carlito-Bold'));
  styles = newDoc({}).styles;
  tm = metrics();
});

const fmtOf = (p, k = 0) => runFmt(styles, p, p.runs[k]);
const lineWidth = (ln) => ln.items.reduce((s, it) => s + it.w, 0);

describe('Calibri Light: Letters Light widths', () => {
  it('a new document\'s Title and Heading 1 are Letters Light', () => {
    for (const id of ['Title', 'Heading1']) {
      const f = fmtOf(newPara('Heading One', {pStyle: id}));
      assert.equal(f.family, 'Letters Light', id);
      assert.match(fontPath(f.css), /LettersLight-Regular$/, id);
    }
  });
  it('"Heading One" in Heading 1 is as wide as Calibri Light\'s ' +
    'advances', () => {
    const p = newPara('Heading One', {pStyle: 'Heading1'});
    const f = fmtOf(p);
    near(f.px, 16 * 4 / 3, 0.01, 'Heading 1 is 16 pt');
    const want = lightWidth('Heading One', f.px);
    near(tm.width('Heading One', f.css), want, 1e-6, 'measured');
    const ln = layoutPara(p, styles, 2000, tm, new Map()).lines[0];
    near(lineWidth(ln), want, 1e-6, 'laid out');
    // not Carlito's (the old stand-in): Calibri Light is narrower
    const carlito = tm.width('Heading One', f.css.replace(
      '"Letters Light"', '"Carlito"'));
    assert.ok(carlito - want > 1, `Carlito ${carlito}, Light ${want}`);
  });
  it('"Heading One" in Title: the advances (its -0.5 pt character ' +
    'spacing is not laid out: Fmt does not model w:spacing)', () => {
    const p = newPara('Heading One', {pStyle: 'Title'});
    const f = fmtOf(p);
    near(f.px, 28 * 4 / 3, 0.01, 'Title is 28 pt');
    const want = lightWidth('Heading One', f.px);
    near(tm.width('Heading One', f.css), want, 1e-6, 'measured');
    const ln = layoutPara(p, styles, 2000, tm, new Map()).lines[0];
    near(lineWidth(ln), want, 1e-6, 'laid out');
  });
  const corpus = new URL('./corpus/handoff/pg-36-metrics.docx',
    import.meta.url);
  it('the PG37 paragraph is the one in pg-36-metrics.docx',
    {skip: !existsSync(corpus) && 'pg-36-metrics.docx is not here (the '
      + 'hand-off corpus is local)'},
    async () => {
      // the hand-off file has this very paragraph in Calibri Light
      const d = await readDocx(readFileSync(corpus));
      const ps = d.sections.flatMap((s) => s.blocks);
      assert.ok(ps.some((b) => b.text === pg37Text()),
        'in pg-36-metrics.docx');
    });
  it('the PG37 paragraph wraps where Calibri Light\'s widths do',
    async () => {
      const t = pg37Text();
      const p = newPara(t, {rPr: {sz: 22, rFonts: {ascii: 'Calibri Light',
        hAnsi: 'Calibri Light'}, extra: []}});
      const f = fmtOf(p);
      assert.equal(f.family, 'Letters Light');
      const col = (11906 - 2 * 1440) * TWIP;
      const L = layoutPara(p, styles, col, tm, new Map());
      const want = greedy(t, f.px, col);
      assert.deepEqual(L.lines.map((ln) => ln.from), want.map((x) => x[0]));
      // not where Carlito's (the old stand-in's) widths break it: the
      // narrower (about 1 %) Light lines hold more, so some breaks
      // come later and none earlier
      const c = newPara(t, {rPr: {sz: 22, extra: []}});
      assert.equal(fmtOf(c).family, 'Carlito');
      const LC = layoutPara(c, styles, col, tm, new Map());
      const n = Math.min(L.lines.length, LC.lines.length);
      let later = 0;
      for (let i = 0; i < n; i++) {
        assert.ok(L.lines[i].from >= LC.lines[i].from, `line ${i + 1}`);
        if (L.lines[i].from > LC.lines[i].from) later++;
      }
      assert.ok(later > 0, 'some Light line starts later than Carlito\'s');
    });
});

describe('Calibri Light: line height and bold', () => {
  it('a Calibri Light line is as high as a Calibri line', () => {
    // (single spacing: Normal's own is 259/240 of the line)
    const pPr = {spacing: {line: 240, lineRule: 'auto'}, extra: []};
    for (const sz of [22, 32, 56]) {
      const light = newPara('Heading One', {pPr, rPr: {sz, rFonts: {ascii:
        'Calibri Light'}, extra: []}});
      const body = newPara('Heading One', {pPr, rPr: {sz, extra: []}});
      assert.equal(fmtOf(light).family, 'Letters Light');
      assert.equal(fmtOf(body).family, 'Carlito');
      const a = layoutPara(light, styles, 2000, tm, new Map()).lines[0];
      const b = layoutPara(body, styles, 2000, tm, new Map()).lines[0];
      near(a.h, b.h, TWIP, `h at ${sz / 2} pt`);
      near(a.base, b.base, TWIP, `base at ${sz / 2} pt`);
      // (the fonts' own ratios, not NAT_M's 1.25)
      near(b.h, sz / 2 * 4 / 3 * 1.2207, 0.01, `Carlito h ${sz / 2} pt`);
    }
  });
  it('bold Calibri Light is drawn and measured in Carlito Bold', () => {
    const p = newPara('Heading One', {pStyle: 'Heading1', runs: [{start:
      0, end: 11, rPr: {b: true, extra: []}}]});
    const f = fmtOf(p);
    assert.equal(f.family, 'Letters Light');
    assert.ok(f.css.startsWith('bold '), f.css);
    assert.match(fontPath(f.css), /Carlito-Bold$/);
    const bold = tm.width('Heading One', f.css.replace(
      '"Letters Light"', '"Carlito"'));
    const ln = layoutPara(p, styles, 2000, tm, new Map()).lines[0];
    near(lineWidth(ln), bold, 1e-6, 'Carlito Bold width');
    assert.ok(bold > lightWidth('Heading One', f.px) + 1, 'not Light');
    // its height is Carlito Bold's, as a bold Calibri line's
    const cb = newPara('Heading One', {runs: [{start: 0, end: 11, rPr:
      {b: true, sz: 32, extra: []}}]});
    const lb = layoutPara(cb, styles, 2000, tm, new Map()).lines[0];
    near(ln.h, lb.h, TWIP, 'bold h');
  });
});

/** A new document: Title, Heading 1, a bold Heading 1, body text. */
function headings() {
  const d = newDoc({date: DATE});
  const blocks = [newPara('Calibri Light Title', {pStyle: 'Title'}),
    newPara('Heading One', {pStyle: 'Heading1'}),
    newPara('Bold Heading', {pStyle: 'Heading1', runs: [{start: 0,
      end: 12, rPr: {b: true, extra: []}}]}),
    newPara('Body text in Calibri.')];
  d.sections[0].blocks = blocks;
  return d;
}
const DATE = new Date(Date.UTC(2026, 10, 6));
const baseFonts = (bytes) => [...new Set([...new TextDecoder('latin1')
  .decode(bytes).matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)]
  .map((m) => m[1].replace(/^[A-Z]{6}\+/, '')))].sort();

describe('Calibri Light: PDF and Word', () => {
  it('PDF: headings embed a Letters Light subset, bold Carlito Bold',
    async () => {
      const doc = headings();
      const res = await exportPdf(windowOf(doc, tm), {loader: bundled(),
        raf: (cb) => setImmediate(cb), now: () => DATE});
      const names = baseFonts(res.bytes);
      assert.ok(names.some((n) => n.includes('LettersLight')),
        names.join());
      assert.ok(!names.some((n) => /Lato/i.test(n)), names.join());
      assert.ok(names.some((n) => /^Carlito-?Bold$/.test(n)),
        names.join());
      // every BaseFont is a subset (a six-letter tag)
      const tagged = [...new TextDecoder('latin1').decode(res.bytes)
        .matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)].map((m) => m[1])
        .filter((n) => /LettersLight/.test(n));
      assert.ok(tagged.length && tagged.every((n) => /^[A-Z]{6}\+/.test(n)),
        tagged.join());
      // the file's whole text never names Lato (name tables included)
      assert.doesNotMatch(new TextDecoder('latin1').decode(res.bytes),
        /\/(FontName|BaseFont)\s*\/[A-Z+]*Lato/);
    });
  it('Word opens Title and Heading 1 in Calibri Light (WORD_EMIT)',
    async () => {
      const bytes = await writeDocx(headings(), {date: DATE});
      const back = await readDocx(bytes);
      const ids = back.sections[0].blocks.map((b) => b.pStyle);
      assert.deepEqual(ids.slice(0, 3), ['Title', 'Heading1', 'Heading1']);
      assert.equal(back.styles.theme.major, 'Calibri Light');
      emit('calibri-light-headings', bytes);
    });
});

// The PG37 paragraph: handoff-pages-a.mjs text(400, 77) (copied: the
// generator does not export it, and the corpus file is git-ignored).
const WORDS = ('the a of and to in is was for on that with as by it at ' +
  'from this which be or an are have were not but had his they ' +
  'page line paragraph section break widow orphan heading table ' +
  'printer column margin gutter number footer header figure ' +
  'document library harbour meadow lantern copper northern quietly ' +
  'gathered measured compared river window garden evening morning ' +
  'station letters seventeen thousand careful simple ordinary').split(' ');
function pg37Text(n = 400, s = 77) {
  let x = s * 2654435761 % 4294967296;
  const out = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    let w = WORDS[x % WORDS.length];
    if (i === 0 || out[out.length - 1].endsWith('.')) {
      w = w[0].toUpperCase() + w.slice(1);
    }
    out.push(w + ((x >> 8) % 11 === 0 && i < n - 1 ? '.' : ''));
  }
  return out.join(' ') + '.';
}

/** [[from, to]] of the lines a greedy fill makes, by the widths JSON. */
function greedy(t, px, col) {
  const lines = [];
  let from = 0, x = 0;
  const re = /(\S+)(\s*)/g;
  let m;
  while ((m = re.exec(t))) {
    const w = lightWidth(m[1], px), sp = lightWidth(m[2], px);
    if (x > 0 && x + w > col) {
      lines.push([from, m.index]);
      from = m.index;
      x = 0;
    }
    x += w + sp;
  }
  lines.push([from, t.length]);
  return lines;
}
