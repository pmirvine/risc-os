// FontMetrics (Batch D, D35, PG36): the bundled fonts' own line
// metrics, read from the TrueType bytes (head, hhea, OS/2), and the
// ratios a line's height is taken from; hostile input gives null,
// never a throw. Then the ratios in use: ./Fmt carries them per run
// format, ./LineLayout takes the tallest run's, ./FontLoad registers
// each face it reads.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import * as FM from '../../tools/moreapps/!Letters/FontMetrics';
import {NAT_M} from '../../tools/moreapps/!Letters/ParaSpace';
import {fontFiles} from '../../tools/moreapps/!Letters/FontMap';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {layoutPara} from '../../tools/moreapps/!Letters/LineLayout';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {loadStyles, tm} from './word-docs.mjs';

const DIR = new URL('../../tools/moreapps/!Letters/Fonts/',
  import.meta.url);
const bytesOf = (leaf) => {
  const u = new URL(leaf, DIR);
  return existsSync(u) ? new Uint8Array(readFileSync(u)) : null;
};
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps,
  `${what}: ${a} not within ${eps} of ${b}`);
const ratios = (m) => ({nat: (m.winAsc + m.winDesc) / m.upm,
  desc: m.winDesc / m.upm});

describe('FontMetrics.parseMetrics: the bundled files', () => {
  for (const leaf of fontFiles()) {
    it(leaf, (t) => {
      const b = bytesOf(leaf);
      if (!b) { t.skip(`${leaf} is not on the disc`); return; }
      const m = FM.parseMetrics(b);
      assert.ok(m, 'parsed');
      for (const k of ['upm', 'winAsc', 'winDesc', 'hheaAsc',
        'hheaDesc', 'lineGap']) {
        assert.ok(Number.isInteger(m[k]), `${k} ${m[k]}`);
      }
      const r = ratios(m);
      assert.ok(r.nat >= 1.05 && r.nat <= 1.35, `nat ${r.nat}`);
    });
  }
  // D35's figures are Word's on Windows (Calibri 1.22, Cambria 1.17,
  // Arial 1.15, Times 1.15, Courier New 1.13), and Word's line height
  // is the aim (controller ruling on P1.1). Pinned: the file's raw
  // (usWinAscent + usWinDescent) / upm, and the nat ratiosOf uses:
  //   Liberation Sans (1854 + 434) / 2048 = 1.117 and Liberation
  //     Serif (1825 + 443) / 2048 = 1.107; with the hhea lineGap (67,
  //     87) as Word's external leading both are 1.1499;
  //   Caladea (1050 + 250) / 1000 = 1.30: it copies Cambria's widths,
  //     not its heights, so WORD_NAT gives Cambria's 1.17.
  // (Carlito is registered as 'Test Carlito': the last test wants
  // Carlito itself not registered at first.)
  const D35 = [['Carlito-Regular', 'Test Carlito', 1.2207, 1.2207],
    ['Caladea-Regular', 'Caladea', 1.30, 1.17],
    ['LiberationSans-Regular', 'Liberation Sans', 1.1172, 1.1499],
    ['LiberationSerif-Regular', 'Liberation Serif', 1.1074, 1.1499],
    ['LiberationMono-Regular', 'Liberation Mono', 1.1328, 1.1328]];
  for (const [leaf, family, raw, used] of D35) {
    it(`${leaf}: file ${raw}, used ${used}`, (t) => {
      const b = bytesOf(leaf);
      if (!b) { t.skip(`${leaf} is not on the disc`); return; }
      const m = FM.parseMetrics(b);
      near(ratios(m).nat, raw, 0.0001, leaf + ' file');
      FM.register(family, false, false, b);
      const r = FM.ratiosOf(family, false, false);
      near(r.nat, used, 0.0001, leaf + ' used');
      // desc: the file's, scaled with nat for a WORD_NAT family
      const own = m.winDesc / m.upm;
      near(r.desc, FM.WORD_NAT.has(family) ? own * used / raw : own,
        1e-9, leaf + ' desc');
    });
  }
  it('WORD_NAT: Caladea only', () => {
    assert.deepEqual([...FM.WORD_NAT], [['Caladea', 1.17]]);
  });
  it('takes an ArrayBuffer and a view inside a larger buffer', (t) => {
    const b = bytesOf('Carlito-Regular');
    if (!b) { t.skip('no Carlito'); return; }
    const want = FM.parseMetrics(b);
    assert.deepEqual(FM.parseMetrics(b.buffer.slice(b.byteOffset,
      b.byteOffset + b.byteLength)), want);
    const big = new Uint8Array(b.length + 100);
    big.set(b, 50);
    assert.deepEqual(FM.parseMetrics(big.subarray(50, 50 + b.length)),
      want);
  });
});

/** A minimal font: head, hhea, OS/2 (n tables, the rest padding). */
function font({n = 3, upm = 2048, winAsc = 1900, winDesc = 500,
  offPast = false, gap = 0} = {}) {
  const at = 12 + 16 * n, len = at + 54 + 36 + 78;
  const b = new Uint8Array(len), v = new DataView(b.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, n);
  const tags = ['head', 'hhea', 'OS/2'], sizes = [54, 36, 78];
  let o = at;
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i, tag = i < 3 ? tags[i] : 'xx' + i % 100;
    for (let k = 0; k < 4; k++) b[r + k] = (tag + '  ').charCodeAt(k);
    v.setUint32(r + 8, i < 3 ? o : 0);
    v.setUint32(r + 12, i < 3 ? sizes[i] : 0);
    if (i < 3) o += sizes[i];
  }
  const head = at, hhea = at + 54, os2 = at + 90;
  v.setUint16(head + 18, upm);
  v.setInt16(hhea + 4, winAsc);
  v.setInt16(hhea + 6, -winDesc);
  v.setInt16(hhea + 8, gap);
  v.setUint16(os2 + 74, winAsc);
  v.setUint16(os2 + 76, winDesc);
  if (offPast) v.setUint32(12 + 16 * 2 + 8, len - 10);
  return b;
}

describe('FontMetrics.parseMetrics: hostile', () => {
  it('a minimal font parses', () => {
    assert.deepEqual(FM.parseMetrics(font()), {upm: 2048, winAsc: 1900,
      winDesc: 500, hheaAsc: 1900, hheaDesc: -500, lineGap: 0});
  });
  it('64 tables: parsed; 65: null', () => {
    assert.ok(FM.parseMetrics(font({n: 64})));
    assert.equal(FM.parseMetrics(font({n: 65})), null);
  });
  it('a table past the end, upm out of range, empty, junk: null', () => {
    assert.equal(FM.parseMetrics(font({offPast: true})), null);
    for (const upm of [0, 15, 16385, 65535]) {
      assert.equal(FM.parseMetrics(font({upm})), null, 'upm ' + upm);
    }
    assert.ok(FM.parseMetrics(font({upm: 16})));
    assert.ok(FM.parseMetrics(font({upm: 16384})));
    assert.equal(FM.parseMetrics(new Uint8Array(0)), null);
    assert.equal(FM.parseMetrics(font().subarray(0, 40)), null);
    for (const v of [null, undefined, 0, -1, 1e9, NaN, '', 'abc', {},
      [], {__proto__: null}, Object.create(null)]) {
      assert.equal(FM.parseMetrics(v), null, typeof v);
    }
  });
  it('a 1 MB random buffer: null, no throw', () => {
    const b = new Uint8Array(1 << 20);
    let s = 12345;
    for (let i = 0; i < b.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      b[i] = s >>> 24;
    }
    assert.equal(FM.parseMetrics(b), null);
  });
  it('winAscent + winDescent 0: null (no line)', () => {
    assert.equal(FM.parseMetrics(font({winAsc: 0, winDesc: 0})), null);
  });
});

describe('FontMetrics.register and ratiosOf', () => {
  it('a family never registered: NAT_M', () => {
    assert.deepEqual(FM.ratiosOf('Unknown', false, false), NAT_M);
    assert.deepEqual(NAT_M, {nat: 1.25, desc: 0.27});
    assert.equal(FM.ratiosOf('__proto__', true, true), NAT_M);
    assert.equal(FM.ratiosOf(undefined), NAT_M);
  });
  it('bold for bold; the regular face for a missing italic', () => {
    assert.ok(FM.register('Test A', false, false, font({upm: 1000,
      winAsc: 900, winDesc: 300})));
    assert.ok(FM.register('Test A', true, false, font({upm: 1000,
      winAsc: 800, winDesc: 200})));
    near(FM.ratiosOf('Test A', false, false).nat, 1.2, 1e-9, 'reg');
    near(FM.ratiosOf('Test A', false, false).desc, 0.3, 1e-9, 'desc');
    near(FM.ratiosOf('Test A', true, false).nat, 1.0, 1e-9, 'bold');
    near(FM.ratiosOf('Test A', false, true).nat, 1.2, 1e-9, 'italic');
    // bold italic not registered: the regular face (not the bold)
    near(FM.ratiosOf('Test A', true, true).nat, 1.2, 1e-9, 'bi');
    // the same object each time (a run format keeps it)
    assert.equal(FM.ratiosOf('Test A', true, false),
      FM.ratiosOf('Test A', true, false));
  });
  it('only an italic face: the family has no regular, so NAT_M', () => {
    FM.register('Test B', false, true, font({upm: 1000, winAsc: 900,
      winDesc: 300}));
    near(FM.ratiosOf('Test B', false, true).nat, 1.2, 1e-9, 'italic');
    assert.equal(FM.ratiosOf('Test B', false, false), NAT_M);
  });
  it('a positive lineGap adds to nat; a negative one does not', () => {
    FM.register('Test G', false, false, font({upm: 1000, winAsc: 800,
      winDesc: 200, gap: 150}));
    near(FM.ratiosOf('Test G').nat, 1.15, 1e-9, 'gap');
    near(FM.ratiosOf('Test G').desc, 0.2, 1e-9, 'desc');
    FM.register('Test H', false, false, font({upm: 1000, winAsc: 800,
      winDesc: 200, gap: -150}));
    near(FM.ratiosOf('Test H').nat, 1.0, 1e-9, 'negative gap');
  });
  it('bytes that do not parse register nothing', () => {
    assert.equal(FM.register('Test C', false, false,
      new Uint8Array(10)), null);
    assert.equal(FM.ratiosOf('Test C', false, false), NAT_M);
  });
});

describe('the ratios in use', () => {
  it('Fmt: fm per run format; LineLayout: the tallest run\'s', async (t) => {
    const b = bytesOf('Carlito-Regular'), c = bytesOf(
      'LiberationMono-Regular');
    if (!b || !c) { t.skip('no fonts'); return; }
    const styles = await loadStyles();
    const plain = newPara('hello world');
    // not registered yet in this file: NAT_M
    assert.equal(runFmt(styles, plain, plain.runs[0]).fm, NAT_M);
    FM.register('Carlito', false, false, b);
    FM.register('Liberation Mono', false, false, c);
    const f = runFmt(styles, plain, plain.runs[0]);
    assert.equal(f.family, 'Carlito');
    assert.equal(f.fm, FM.ratiosOf('Carlito', false, false));
    const L = layoutPara(plain, styles, 600, tm(), new Map());
    const ln = L.lines[0], m = f.fm;
    near(ln.h, f.px * m.nat, 1e-9, 'h');
    near(ln.base, f.px * m.nat - f.px * m.desc, 1e-9, 'base');
    // a larger Courier New run sets the line's ratios
    const p2 = newPara('ab', {runs: [{start: 0, end: 1, rPr:
      {extra: []}}, {start: 1, end: 2, rPr: {sz: 40, rFonts:
      {ascii: 'Courier New'}, extra: []}}]});
    const ln2 = layoutPara(p2, styles, 600, tm(), new Map()).lines[0];
    const mono = FM.ratiosOf('Liberation Mono', false, false);
    near(ln2.h, 26.67 * mono.nat, 1e-9, 'mono h');   // (20 pt)
    assert.equal('m' in ln2, false, 'no scratch field left');
  });
});

describe('mixed fonts on one line (P1 fix M2)', () => {
  // Word: the line is as high as the largest ascent over all its runs
  // plus the largest descent, each from its own font's ratios
  it('a taller-ascent run beside a deeper-descent run', async () => {
    const styles = await loadStyles();
    FM.register('Liberation Sans', false, false, font({upm: 1000,
      winAsc: 1000, winDesc: 100}));
    FM.register('Liberation Serif', false, false, font({upm: 1000,
      winAsc: 700, winDesc: 400}));
    const run = (a, b, sz, face) => ({start: a, end: b, rPr: {sz,
      rFonts: {ascii: face}, extra: []}});
    const para = newPara('ab', {runs: [run(0, 1, 24, 'Arial'),
      run(1, 2, 22, 'Times New Roman')]});
    const fa = runFmt(styles, para, para.runs[0]);
    const fb = runFmt(styles, para, para.runs[1]);
    assert.equal(fa.family, 'Liberation Sans');
    assert.equal(fb.family, 'Liberation Serif');
    const asc = Math.max(fa.px * (fa.fm.nat - fa.fm.desc),
      fb.px * (fb.fm.nat - fb.fm.desc));
    const desc = Math.max(fa.px * fa.fm.desc, fb.px * fb.fm.desc);
    const ln = layoutPara(para, styles, 600, tm(), new Map()).lines[0];
    near(ln.h, asc + desc, 1e-9, 'h');
    near(ln.base, asc, 1e-9, 'base');
    // (the largest run's font alone was short: 16 px * 1.1)
    assert.ok(ln.h > fa.px * fa.fm.nat + 3, `h ${ln.h}`);
    // either order on the line
    const rev = newPara('ab', {runs: [run(0, 1, 22, 'Times New Roman'),
      run(1, 2, 24, 'Arial')]});
    const ln2 = layoutPara(rev, styles, 600, tm(), new Map()).lines[0];
    near(ln2.h, asc + desc, 1e-9, 'h reversed');
    // line spacing 2 (auto 480): twice the natural height
    const dbl = newPara('ab', {runs: para.runs, pPr: {spacing:
      {line: 480, lineRule: 'auto'}, extra: []}});
    const ln3 = layoutPara(dbl, styles, 600, tm(), new Map()).lines[0];
    near(ln3.h, 2 * (asc + desc), 1e-9, 'double');
    near(ln3.h - ln3.base, desc, 1e-9, 'double base');
    // exactly 10 pt: clipped, the rule unchanged
    const ex = newPara('ab', {runs: para.runs, pPr: {spacing:
      {line: 200, lineRule: 'exact'}, extra: []}});
    const ln4 = layoutPara(ex, styles, 600, tm(), new Map()).lines[0];
    near(ln4.h, 200 / 15, 1e-9, 'exact');
    assert.equal(ln4.clip, true);
  });
  it('one font: exactly as before (its own ratios, no new object)',
    async () => {
      const styles = await loadStyles();
      const para = newPara('a b', {runs: [{start: 0, end: 3, rPr:
        {sz: 24, rFonts: {ascii: 'Arial'}, extra: []}}]});
      const f = runFmt(styles, para, para.runs[0]);
      const ln = layoutPara(para, styles, 600, tm(), new Map())
        .lines[0];
      assert.equal(ln.h, f.px * f.fm.nat);
      assert.equal(ln.base, f.px * f.fm.nat - f.px * f.fm.desc);
    });
});
