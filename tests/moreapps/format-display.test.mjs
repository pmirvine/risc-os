// The display of formatting: highlight colours (./Highlight), the
// run format of superscript, subscript and colours (./Fmt), and in
// ./LineLayout baseline shifts, line heights and justified lines,
// with the caret geometry of ./PositionMap on justified text.
// Measured with a fake: 8 px per UTF-16 unit, 9 px when bold.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {runFmt} from '../../tools/moreapps/!Word/Fmt';
import {HIGHLIGHT, highlightCss}
  from '../../tools/moreapps/!Word/Highlight';
import {HIGHLIGHTS} from '../../tools/moreapps/!Word/FormatCheck';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {caretRect, hitTest, lineOf, selectionRects}
  from '../../tools/moreapps/!Word/PositionMap';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {layoutPara as oldLayout} from './old-render.mjs';
import {loadStyles, fake, tm, O, raw, rng} from './word-docs.mjs';

let styles;
before(async () => { styles = await loadStyles(); });

const rp = (o = {}) => ({...o, extra: []});
/** A paragraph of text in runs [[start, end, rPr]], pPr fields. */
function mk(text, runs, pPr = {}, inlines = {}) {
  const opts = {pPr: rp(pPr), inlines};
  if (runs) {
    opts.runs = runs.map(([start, end, r]) => ({start, end,
      rPr: rp(r)}));
  }
  return newPara(text, opts);
}
const fmt = (r) => runFmt(styles, mk('x'), {start: 0, end: 1,
  rPr: rp(r)}, new Map());
const lay = (pa, w = 400, m = tm()) =>
  layoutPara(pa, styles, w, m, new Map());
const right = (ln) => {
  const ink = ln.items.filter((i) => /\S/.test(i.text));
  const z = ink[ink.length - 1];
  // (merged items may end in spaces: the fake is the same per unit)
  return z.x + z.w * z.text.trimEnd().length / z.text.length;
};
const BASE = 14.67;                      // 11 pt at 96 dpi

describe('Highlight', () => {
  it('maps every Word highlight name to its CSS colour', () => {
    const want = {yellow: '#ffff00', green: '#00ff00',
      cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff',
      red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080',
      darkGreen: '#008000', darkMagenta: '#800080',
      darkRed: '#800000', darkYellow: '#808000',
      darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000',
      white: '#ffffff'};
    for (const [k, v] of Object.entries(want)) {
      assert.equal(highlightCss(k), v, k);
    }
    // FormatCheck accepts exactly these names (from ./Highlight)
    assert.deepEqual([...HIGHLIGHTS].sort(), Object.keys(want).sort());
    assert.deepEqual(Object.keys(HIGHLIGHT).sort(),
      Object.keys(want).sort());
  });
  it('none, unknown and non-strings are no highlight', () => {
    for (const v of ['none', 'pink', '', undefined, null, 3,
      'constructor', '__proto__', 'toString']) {
      assert.equal(highlightCss(v), null, String(v));
    }
  });
});

describe('Fmt: highlight, super/subscript, colour', () => {
  it('a run with a highlight has its CSS colour, else null', () => {
    assert.equal(fmt({highlight: 'yellow'}).highlight, '#ffff00');
    assert.equal(fmt({highlight: 'none'}).highlight, null);
    assert.equal(fmt({}).highlight, null);
  });
  it('superscript: 0.65 of the size, raised 0.35 of the base', () => {
    const f = fmt({vertAlign: 'superscript'});
    assert.equal(f.vert, 'sup');
    assert.equal(f.px, 9.54);            // 14.67 * 0.65
    assert.equal(f.dy, -5.13);           // -14.67 * 0.35
    assert.match(f.css, /^9\.54px /);
  });
  it('subscript: 0.65 of the size, lowered 0.15 of the base', () => {
    const f = fmt({vertAlign: 'subscript'});
    assert.equal(f.vert, 'sub');
    assert.equal(f.px, 9.54);
    assert.equal(f.dy, 2.2);             // 14.67 * 0.15
  });
  it('baseline, absent or unknown: full size, no shift', () => {
    for (const v of ['baseline', undefined, 'sideways']) {
      const f = fmt(v ? {vertAlign: v} : {});
      assert.equal(f.vert, null);
      assert.equal(f.dy, 0);
      assert.equal(f.px, BASE);
    }
  });
  it('the shift follows the run size (20 pt superscript)', () => {
    const f = fmt({sz: 40, vertAlign: 'superscript'});
    assert.equal(f.px, 17.34);           // 26.67 * 0.65
    assert.equal(f.dy, -9.33);           // 26.67 * 0.35
  });
  it('auto, theme and bad colours are black; 6 hex as given', () => {
    assert.equal(fmt({color: 'auto'}).colour, '#000000');
    assert.equal(fmt({color: 'red'}).colour, '#000000');
    assert.equal(fmt({color: 'FF00'}).colour, '#000000');
    assert.equal(fmt({}).colour, '#000000');
    assert.equal(fmt({color: 'FF0000'}).colour, '#FF0000');
    const theme = {extra: [{name: 'w:color', attrs:
      [['w:val', '1F3864'], ['w:themeColor', 'accent1']],
    children: []}]};
    assert.equal(runFmt(styles, mk('x'), {start: 0, end: 1,
      rPr: theme}, new Map()).colour, '#000000');
  });
  it('the format cache tells the new properties apart', () => {
    const cache = new Map(), pa = mk('x');
    const run = (r) => ({start: 0, end: 1, rPr: rp(r)});
    const a = runFmt(styles, pa, run({highlight: 'red'}), cache);
    const b = runFmt(styles, pa, run({highlight: 'blue'}), cache);
    const c = runFmt(styles, pa, run({vertAlign: 'subscript'}), cache);
    assert.notEqual(a, b);
    assert.equal(b.highlight, '#0000ff');
    assert.equal(c.vert, 'sub');
    assert.equal(runFmt(styles, pa, run({highlight: 'red'}), cache), a);
  });
});

describe('LineLayout: highlight and baseline shift', () => {
  it('items carry hl and dy', () => {
    const l = lay(mk('ab cd', [[0, 2, {highlight: 'yellow'}],
      [2, 3, {}], [3, 5, {vertAlign: 'superscript'}]]));
    const its = l.lines[0].items;
    assert.equal(its[0].hl, '#ffff00');
    assert.equal(its[0].dy, 0);
    assert.equal(its.at(-1).hl, null);
    assert.equal(its.at(-1).dy, -5.13);
    assert.equal(its.at(-1).f.px, 9.54);
  });
  it('a superscript line is higher; its text stays inside', () => {
    const plain = lay(mk('ab cd')).lines[0];
    const sup = lay(mk('ab cd', [[0, 3, {}],
      [3, 5, {vertAlign: 'superscript'}]])).lines[0];
    assert.equal(plain.h, BASE * 1.25);   // ordinary lines unchanged
    assert.ok(sup.h > plain.h, `${sup.h} > ${plain.h}`);
    const it = sup.items.at(-1);
    assert.ok(sup.base + it.dy - it.f.px * 0.98 >= -0.01);
    assert.ok(sup.base - plain.base > 0);
  });
  it('a line of only superscript is not lower than plain', () => {
    const plain = lay(mk('ab cd')).lines[0];
    const mixed = lay(mk('ab cd', [[0, 3, {}],
      [3, 5, {vertAlign: 'superscript'}]])).lines[0];
    for (const v of ['superscript', 'subscript']) {
      const only = lay(mk('ab cd', [[0, 5, {vertAlign: v}]])).lines[0];
      assert.ok(only.h >= plain.h, `${v} ${only.h} >= ${plain.h}`);
      assert.ok(only.base >= plain.base - 1e-9, v);
    }
    const sup = lay(mk('ab cd', [[0, 5, {vertAlign: 'superscript'}]]));
    assert.equal(sup.lines[0].h, mixed.h);
  });
  it('an empty paragraph whose mark is sup/sub is as high as plain',
    () => {
      const plain = lay(mk('')).lines[0];
      for (const v of ['superscript', 'subscript']) {
        const pa = {type: 'p', id: 1, text: '', inlines: {},
          pPr: rp(), extraP: [], runs: [{start: 0, end: 0,
            rPr: rp({vertAlign: v})}]};
        const ln = lay(pa).lines[0];
        assert.deepEqual([ln.h, ln.base], [plain.h, plain.base], v);
      }
    });
  it('a subscript line keeps room below its text', () => {
    const sub = lay(mk('ab cd', [[0, 3, {}],
      [3, 5, {vertAlign: 'subscript'}]])).lines[0];
    const it = sub.items.at(-1);
    assert.ok(sub.base + it.dy + it.f.px * 0.27 <= sub.h + 0.01);
  });
  it('a line of highlighted text is as high as plain text', () => {
    const a = lay(mk('ab cd', [[0, 5, {highlight: 'green'}]]));
    assert.deepEqual(a.lines.map((x) => [x.h, x.base]),
      lay(mk('ab cd')).lines.map((x) => [x.h, x.base]));
  });
});

const J = {jc: 'both'};
const SIX = 'aaaa bbbb cccc dddd eeee ffff';

describe('LineLayout: justified lines', () => {
  it('a wrapped line fills the text width (within 0.01 px)', () => {
    const l = lay(mk(SIX, null, J), 100);
    assert.equal(l.lines.length, 3);
    for (const ln of l.lines.slice(0, 2)) {
      assert.ok(Math.abs(right(ln) - 100) < 0.01, `${right(ln)}`);
      assert.equal(ln.items[0].x, 0);
    }
  });
  it('the free width goes to the spaces between words', () => {
    const l = lay(mk('aa bb cc dddddddddd', null, J), 100);
    const ln = l.lines[0];             // 'aa bb cc ' natural 64
    assert.deepEqual(ln.items.map((i) => i.text),
      ['aa', ' ', 'bb', ' ', 'cc', ' ']);
    // 36 px over the 2 inner spaces; the hanging one stays natural
    assert.deepEqual(ln.items.map((i) => [i.x, i.w]),
      [[0, 16], [16, 26], [42, 16], [58, 26], [84, 16], [100, 8]]);
  });
  it('the last line is not stretched', () => {
    const l = lay(mk(SIX, null, J), 100);
    const left = lay(mk(SIX), 100);
    assert.deepEqual(l.lines[2].items.map((i) => [i.x, i.w]),
      [[0, 32], [32, 8], [40, 32]]);
    assert.equal(right(left.lines[2]), right(l.lines[2]));
  });
  it('a line ending with a break is not stretched', () => {
    const l = lay(mk('aa bb\ncc dd ee ff gg hh ii', null, J), 100);
    assert.ok(l.lines[0].endsWithBreak);
    assert.equal(right(l.lines[0]), 40);
    assert.ok(Math.abs(right(l.lines[1]) - 100) < 0.01);
  });
  it('a line holding one word is not stretched', () => {
    const l = lay(mk('aaaaaaaa bbbbbbbbbbbbbbbb c', null, J), 100);
    assert.equal(right(l.lines[0]), 64);
    assert.equal(right(l.lines[1]), 128);   // overflows: left alone
  });
  it('several spaces between words each take a share', () => {
    const l = lay(mk('aa   bb cc dddddddddddd', null, J), 100);
    const sp = l.lines[0].items.filter((i) => i.text === ' ');
    assert.equal(sp.length, 5);
    assert.ok(Math.abs(right(l.lines[0]) - 100) < 0.01);
    const w = sp.slice(0, 4).map((i) => i.w);
    for (const v of w) assert.ok(Math.abs(v - w[0]) < 1e-9);
  });
  it('a line with a tab or a [...] box is left alone', () => {
    const t = lay(mk('aa\tbb cc dd ee ff gg', null, J), 100);
    assert.equal(right(t.lines[0]), 88);
    const b = lay(mk(`aa ${O} cc dd ee ff gg`, null, J,
      {3: raw('drawing', 'r')}), 100);
    assert.equal(right(b.lines[0]), right(lay(mk(`aa ${O} cc dd ee`,
      null, {}, {3: raw('drawing', 'r')}), 100).lines[0]));
    assert.ok(right(b.lines[0]) < 99);
  });
  it('distribute and other values stay left', () => {
    for (const jc of ['distribute', 'left', 'start']) {
      const l = lay(mk(SIX, null, {jc}), 100);
      assert.equal(right(l.lines[0]), 72, jc);
    }
  });
  it('unseen zero-width items stay zero wide', () => {
    const pa = mk(`aa ${O}bb cc dd ee ff gg`, null, J,
      {3: raw('bookmarkStart')});
    const l = lay(pa, 100);
    const z = l.lines[0].items.find((i) => i.from === 3);
    assert.equal(z.w, 0);
    assert.equal(z.text, '');
    assert.ok(Math.abs(right(l.lines[0]) - 100) < 0.01);
  });
  it('keeps offsets gap-free and covering', () => {
    const rnd = rng(5);
    for (let s = 0; s < 200; s++) {
      let t = '';
      const n = 3 + Math.floor(rnd() * 40);
      for (let k = 0; k < n; k++) {
        const c = rnd();
        t += c < 0.6 ? 'abcdefgh'.slice(0, 1 + rnd() * 8)
          : c < 0.9 ? ' '.repeat(1 + rnd() * 3) : c < 0.95 ? '\n'
            : '\t';
      }
      const l = lay(mk(t, null, J), 60 + Math.floor(rnd() * 200));
      assert.equal(l.lines[0].from, 0);
      assert.equal(l.lines.at(-1).to, t.length);
      for (let i = 0; i < l.lines.length; i++) {
        const ln = l.lines[i];
        if (i + 1 < l.lines.length) {
          assert.equal(ln.to, l.lines[i + 1].from);
        }
        let at = ln.from, x = -Infinity;
        for (const it of ln.items) {
          assert.equal(it.from, at);
          if (!it.shown) assert.equal(it.text, t.slice(it.from, it.to));
          assert.ok(it.x >= x - 1e-9, 'items in x order');
          x = it.x + it.w;
          at = it.to;
        }
        assert.equal(at, ln.to);
      }
    }
  });
  it('jc left lays out as the old renderer did, highlighted', () => {
    const rnd = rng(9);
    for (let s = 0; s < 100; s++) {
      let t = '';
      while (t.length < 80) t += 'abcdefg'.slice(0, 1 + rnd() * 7) + ' ';
      const pa = mk(t, [[0, 20, {highlight: 'yellow'}],
        [20, t.length, {b: true}]]);
      const a = oldLayout(pa, styles, 150, fake, new Map());
      const b = lay(pa, 150);
      assert.deepEqual(b.lines.map((ln) => ln.items.map((i) =>
        [i.text, i.x, i.w])), a.lines.map((ln) => ln.items.map((i) =>
        [i.text, i.x, i.w])));
      assert.equal(b.h, a.h);
    }
  });
});

describe('PositionMap on justified text', () => {
  const plOf = (para, w) => {
    const metrics = new TextMetrics(fake);
    const l = layoutPara(para, styles, w, metrics, new Map());
    return {para, y: 0, h: l.h, lines: l.lines, metrics};
  };
  const pl = (text, w) => plOf(mk(text, null, J), w);
  const plainPl = (rnd) => {
    let t = '';
    while (t.length < 120) {
      t += 'abcdefghij'.slice(0, 1 + rnd() * 10) +
        ' '.repeat(1 + rnd() * 2);
    }
    return pl(t, 90 + Math.floor(rnd() * 100));
  };
  // justified words in runs of mixed formats: bold, size, superscript,
  // subscript, highlight; emoji and combining accents (no tabs)
  const FM = [{}, {b: true}, {sz: 30}, {vertAlign: 'superscript'},
    {vertAlign: 'subscript', highlight: 'yellow'}, {highlight: 'green'}];
  const WORDS = ['abc', 'de', '\u{1F600}x', 'e\u0301te', 'fghij',
    'k\u{1F44D}\u{1F3FD}', 'lmnopq'];
  const fancy = (rnd, w) => {
    let t = '';
    const runs = [];
    while (t.length < 120) {
      const word = WORDS[Math.floor(rnd() * WORDS.length)] +
        ' '.repeat(1 + rnd() * 2);
      runs.push([t.length, t.length + word.length,
        FM[Math.floor(rnd() * FM.length)]]);
      t += word;
    }
    return plOf(mk(t, runs, J), w);
  };
  it('carets follow the stretched items', () => {
    const p = pl('aa bb cc dddddddddd', 100);
    assert.equal(caretRect(p, 3).x, 42);
    assert.equal(caretRect(p, 4).x, 50);
    assert.equal(caretRect(p, 6).x, 84);
  });
  it('a click in a stretched space gives its nearer edge', () => {
    const p = pl('aa bb cc dddddddddd', 100);
    const y = p.lines[0].h / 2;
    assert.equal(hitTest(p, 20, y).off, 2);    // space 16..42
    assert.equal(hitTest(p, 28, y).off, 2);    // left of its middle
    assert.equal(hitTest(p, 30, y).off, 3);
    assert.equal(hitTest(p, 37, y).off, 3);
  });
  it('a selection ends where the caret is, in widened spaces', () => {
    const p = pl('aa bb cc dddddddddd', 100);
    const r = (a, b) => selectionRects(p, a, b).map((q) => [q.x, q.w]);
    assert.deepEqual(r(0, 3), [[0, 42]]);
    assert.deepEqual(r(2, 3), [[16, 26]]);
    assert.deepEqual(r(3, 5), [[42, 16]]);
    // the whole line: from its start to its last item's end
    assert.deepEqual(r(0, 9), [[0, 108]]);
  });
  it('selection edges equal the carets (random formats, emoji)', () => {
    const rnd = rng(23);
    for (let s = 0; s < 60; s++) {
      const p = fancy(rnd, 90 + Math.floor(rnd() * 100));
      const gs = graphemes(p.para.text);
      p.lines.forEach((L, i) => {
        const offs = gs.filter((o) => o >= L.from && o <= L.to);
        for (const a of offs) {
          if (lineOf(p, a, 'down') !== i) continue;
          for (const b of offs) {
            if (b <= a || lineOf(p, b, 'up') !== i) continue;
            const at = `seed ${s} line ${i} [${a}, ${b})`;
            const q = selectionRects(p, a, b)
              .filter((x) => x.y === L.y);
            assert.equal(q.length, 1, at);
            assert.ok(Math.abs(q[0].x - caretRect(p, a, 'down').x)
              < 1e-9, at + ' start');
            assert.ok(Math.abs(q[0].x + q[0].w -
              caretRect(p, b, 'up').x) < 1e-9, at + ' end');
          }
        }
        if (L.wrapped && L.items.length) {
          const q = selectionRects(p, L.from, L.to)
            .filter((x) => x.y === L.y)[0];
          const z = L.items.at(-1);
          assert.ok(Math.abs(q.x - L.items[0].x) < 1e-9);
          assert.ok(Math.abs(q.x + q.w - (z.x + z.w)) < 1e-9);
        }
      });
    }
  });
  it('hitTest(caretRect(off)) gives off at every boundary (mixed formats)', () => {
    const rnd = rng(11);
    for (let s = 0; s < 100; s++) {
      const p = s % 2 ? fancy(rnd, 90 + Math.floor(rnd() * 100))
        : plainPl(rnd);
      for (const off of graphemes(p.para.text)) {
        for (const aff of ['down', 'up']) {
          const c = caretRect(p, off, aff);
          const h = hitTest(p, c.x, c.y + c.h / 2);
          assert.deepEqual(caretRect(p, h.off, h.affinity), c,
            `seed ${s} off ${off} ${aff}`);
        }
      }
    }
  });
});

describe('Justification speed', () => {
  it('a 100,000-character justified paragraph in linear time', () => {
    let t = '';
    for (let i = 0; t.length < 100000; i++) t += 'word' + (i % 97) + ' ';
    const t0 = performance.now();
    const l = lay(mk(t, null, J), 600);
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `${ms} ms`);
    assert.ok(l.lines.length > 100);
    assert.ok(Math.abs(right(l.lines[0]) - 600) < 0.01);
  });
  it('a line with 5000 spaces between two words', () => {
    const t = 'aa' + ' '.repeat(5000) + 'bb cc';
    const t0 = performance.now();
    const l = lay(mk(t, null, J), 100);
    assert.ok(performance.now() - t0 < 1000);
    assert.equal(l.lines.at(-1).to, t.length);
  });
});
