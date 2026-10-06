// LineLayout: one paragraph broken into lines whose items keep the
// model offsets (UTF-16 indices into Para.text) they stand for.
// Measured with a fake: 8 px per UTF-16 unit, 9 px when bold.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {layoutPara as oldLayout} from './old-render.mjs';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';

const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>');
const fake = (t, css) => (css.includes('bold') ? 9 : 8) * t.length;
const tm = () => new TextMetrics(fake);
const O = '￼';
const el = (name) => ({name: 'w:' + name, attrs: [], children: []});
const PLAIN = {extra: []};
const BOLD = {b: true, extra: []};
const BIG = {sz: 40, extra: []};

let styles;
before(async () => {
  const d = await readDocx(await buildDocx({
    'word/document.xml': documentXml(p(r('x'))),
    'word/styles.xml': STYLES}));
  styles = d.styles;
});

/** A paragraph: runs as [[start, end, rPr]...], inlines by offset. */
function para(text, {runs, inlines = {}, pPr = {extra: []}} = {}) {
  return {type: 'p', id: 1, text, inlines, pPr, extraP: [],
    runs: (runs || (text ? [[0, text.length, PLAIN]] : []))
      .map(([start, end, rPr]) => ({start, end, rPr}))};
}
const lay = (pa, w = 400, m = tm()) =>
  layoutPara(pa, styles, w, m, new Map());
const texts = (l) => l.lines.map((x) => x.items.map((i) => i.text)
  .join(''));
const inPair = (t, o) => o > 0 && o < t.length &&
  /[\uD800-\uDBFF]/.test(t[o - 1]) && /[\uDC00-\uDFFF]/.test(t[o]);

/** The offset invariants of the brief, for any paragraph. */
function check(l, pa) {
  const {lines} = l, t = pa.text;
  assert.ok(lines.length >= 1);
  assert.equal(lines[0].from, 0);
  assert.equal(lines.at(-1).to, t.length);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (i + 1 < lines.length) assert.equal(ln.to, lines[i + 1].from);
    assert.ok(!inPair(t, ln.from), `line ${i} starts in a pair`);
    let at = ln.from;
    for (const it of ln.items) {
      assert.equal(it.from, at, `items of line ${i} are gap-free`);
      assert.ok(it.to >= it.from);
      assert.ok(!inPair(t, it.to), 'item ends inside a pair');
      if (!it.shown) {
        assert.equal(it.text, t.slice(it.from, it.to));
      }
      at = it.to;
    }
    assert.equal(at, ln.to, `items cover line ${i}`);
  }
}

describe('LineLayout offsets', () => {
  it('plain text over 3 wrapped lines covers [0,len)', () => {
    const pa = para('aaaa bbbb cccc dddd eeee ffff');
    const l = lay(pa, 100);
    assert.deepEqual(texts(l), ['aaaa bbbb ', 'cccc dddd ', 'eeee ffff']);
    assert.deepEqual(l.lines.map((x) => [x.from, x.to]),
      [[0, 10], [10, 20], [20, 29]]);
    assert.deepEqual(l.lines.map((x) => x.wrapped), [true, true, false]);
    assert.deepEqual(l.lines.map((x) => x.endsWithBreak),
      [false, false, false]);
    check(l, pa);
  });
  it('a word longer than the line overflows on its own line', () => {
    const long = 'x'.repeat(30);
    const pa = para(`ab ${long} cd`);
    const l = lay(pa, 100);
    assert.deepEqual(texts(l), ['ab ', long + ' ', 'cd']);
    assert.deepEqual(l.lines.map((x) => [x.from, x.to]),
      [[0, 3], [3, 34], [34, 36]]);
    assert.equal(l.lines[1].items[0].w, 248);
    check(l, pa);
  });
  it('a trailing space hangs in the line it ends', () => {
    const pa = para('aaaa bbbb   cccc', {pPr: {jc: 'right', extra: []}});
    const l = lay(pa, 100);
    assert.deepEqual(texts(l), ['aaaa bbbb   ', 'cccc']);
    assert.equal(l.lines[0].to, 12);
    assert.equal(l.lines[1].from, 12);
    // aligned on 'bbbb' (ends at 72): the spaces hang past the edge
    const [it] = l.lines[0].items;
    assert.deepEqual([it.text, it.x, it.w], ['aaaa bbbb   ', 28, 96]);
    check(l, pa);
  });
  it('a run boundary inside a word gives two adjacent items', () => {
    const pa = para('hello', {runs: [[0, 3, PLAIN], [3, 5, BOLD]]});
    const its = lay(pa).lines[0].items;
    assert.deepEqual(its.map((i) => [i.text, i.from, i.to, i.x, i.w]),
      [['hel', 0, 3, 0, 24], ['lo', 3, 5, 24, 18]]);
    assert.match(its[1].f.css, /bold/);
    check(lay(pa), pa);
  });
  it('a hyperlink shows its text, stands for one offset', () => {
    const pa = para(`see ${O}.`, {inlines: {4: {kind: 'raw', level: 'p',
      node: el('hyperlink'), text: 'here'}}});
    const its = lay(pa).lines[0].items;
    const link = its.find((i) => i.kind === 'link');
    assert.equal(link.text, 'here');
    assert.equal(link.shown, true);
    assert.deepEqual([link.from, link.to, link.w], [4, 5, 32]);
    assert.equal(its.find((i) => i.text === '.').from, 5);
    check(lay(pa), pa);
  });
  it('a long link wraps word by word, offsets gap-free', () => {
    const pa = para(`aaaa ${O}.`, {inlines: {5: {kind: 'raw',
      level: 'p', node: el('hyperlink'), text: 'bb cc dddddd eeeeeeee'}}});
    const l = lay(pa, 100);
    assert.deepEqual(texts(l), ['aaaa bb cc ', 'dddddd ', 'eeeeeeee.']);
    assert.deepEqual(l.lines.map((x) => [x.from, x.to]),
      [[0, 6], [6, 6], [6, 7]]);
    const second = l.lines[1].items[0];
    assert.deepEqual([second.text, second.from, second.to, second.shown,
      second.kind], ['dddddd', 6, 6, true, 'link']);
    assert.equal(l.lines[2].items.at(-1).from, 6);
    check(l, pa);
  });
  it('an unseen inline is a zero-width item with its offset', () => {
    const pa = para(`a${O}b`, {inlines: {1: {kind: 'raw', level: 'p',
      node: el('bookmarkStart'), text: ''}}});
    const its = lay(pa).lines[0].items;
    assert.deepEqual(its.map((i) => [i.text, i.from, i.to, i.w]),
      [['a', 0, 1, 8], ['', 1, 2, 0], ['b', 2, 3, 8]]);
    assert.equal(its[1].shown, true);
    assert.equal(its[2].x, 8);
    check(lay(pa), pa);
  });
  it('a [...] box is kind box at [i,i+1)', () => {
    const pa = para(`a${O}`, {inlines: {1: {kind: 'raw', level: 'r',
      node: el('drawing')}}});
    const box = lay(pa).lines[0].items[1];
    assert.deepEqual([box.kind, box.text, box.from, box.to, box.shown],
      ['box', '[...]', 1, 2, true]);
    check(lay(pa), pa);
  });
  it('a line break ends its line and belongs to it', () => {
    const pa = para(`ab\ncd${O}e`, {inlines: {5: {kind: 'br',
      level: 'r', node: el('br'), brType: 'page'}}});
    const l = lay(pa);
    assert.deepEqual(texts(l), ['ab', 'cd', 'e']);
    assert.deepEqual(l.lines.map((x) => [x.from, x.to]),
      [[0, 3], [3, 6], [6, 7]]);
    assert.deepEqual(l.lines.map((x) => x.endsWithBreak),
      [true, true, false]);
    assert.deepEqual(l.lines.map((x) => x.wrapped), [false, false, false]);
    check(l, pa);
  });
  it('spaces after a break keep their offsets (drawn as before)', () => {
    const pa = para('ab\n  cd');
    const l = lay(pa);
    assert.deepEqual(texts(l), ['ab', 'cd']);
    assert.equal(l.lines[1].from, 3);
    check(l, pa);
  });
  it('a tab item runs to the next 48 px stop', () => {
    const pa = para('ab\tc');
    const its = lay(pa).lines[0].items;
    const tab = its.find((i) => i.kind === 'tab');
    assert.deepEqual([tab.from, tab.to, tab.x, tab.w], [2, 3, 16, 32]);
    const c = its.find((i) => i.text === 'c');
    assert.deepEqual([c.from, c.x], [3, 48]);
    check(lay(pa), pa);
  });
  it('never splits a surrogate pair between items or lines', () => {
    const e = '\u{1F600}';
    const pa = para(`a${e}b ${e.repeat(20)}`,
      {runs: [[0, 2, PLAIN], [2, 6, BOLD], [6, 25, PLAIN]]});
    for (const w of [40, 100, 400]) check(lay(pa, w), pa);
    const its = lay(pa).lines[0].items;
    assert.equal(its[0].text, 'a' + e);
  });
  it('an empty paragraph has one line from=to=0', () => {
    const l = lay(para(''));
    assert.equal(l.lines.length, 1);
    const [ln] = l.lines;
    assert.deepEqual([ln.from, ln.to, ln.items.length], [0, 0, 0]);
    assert.ok(ln.h > 0);
    const big = lay(para('', {runs: [[0, 0, BIG]]}));
    assert.ok(big.lines[0].h > ln.h, 'sized from the mark format');
  });
  it('centre and right move items, not offsets', () => {
    const t = 'aaaa bbbb cccc dddd';
    const at = (jc) => lay(para(t, {pPr: {jc, extra: []}}), 100);
    const [L, C, R] = ['left', 'center', 'right'].map(at);
    const offs = (l) => l.lines.map((x) => x.items.map((i) =>
      [i.from, i.to]));
    assert.deepEqual(offs(C), offs(L));
    assert.deepEqual(offs(R), offs(L));
    assert.equal(L.lines[0].items[0].x, 0);
    assert.equal(R.lines[0].items[0].x, 28);
    assert.equal(C.lines[0].items[0].x, 14);
  });
});

describe('LineLayout speed', () => {
  it('lays out 10,000 characters quickly', () => {
    let t = '';
    for (let i = 0; t.length < 10000; i++) t += 'word' + (i % 97) + ' ';
    const pa = para(t), t0 = performance.now();
    const l = lay(pa, 600);
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `${ms} ms`);
    check(l, pa);
  });
  it('a 100,000-character word in linear time', () => {
    let calls = 0;
    const m = new TextMetrics((t, css) => (calls += t.length,
      fake(t, css)));
    const pa = para('a ' + 'x'.repeat(100000) + ' b');
    const t0 = performance.now();
    const l = lay(pa, 600, m);
    assert.ok(performance.now() - t0 < 2000);
    assert.ok(calls < 300000, `measured ${calls} units`);
    assert.equal(l.lines.length, 3);
    check(l, pa);
  });
});

/** A small seeded random generator (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A corpus-like paragraph: words, runs, tabs, breaks, inlines. */
function generated(seed) {
  const rnd = rng(seed), pick = (a) => a[Math.floor(rnd() * a.length)];
  const fmts = [PLAIN, PLAIN, BOLD, BIG, {i: true, extra: []}];
  const raw = (n, level = 'p', text) => ({kind: 'raw', level,
    node: el(n), ...(text === undefined ? {} : {text})});
  let text = '';
  const runs = [], inlines = {};
  const n = 5 + Math.floor(rnd() * 60);
  let fmt = PLAIN, start = 0;
  for (let k = 0; k < n; k++) {
    const c = rnd();
    if (c < 0.55) {
      text += 'abcdefghijklmnop'.slice(0, 1 + Math.floor(rnd() * 12));
    } else if (c < 0.75) text += ' '.repeat(1 + Math.floor(rnd() * 3));
    else if (c < 0.79) text += '\t';
    else if (c < 0.82) text += '\n';
    else if (c < 0.9) {
      inlines[text.length] = pick([raw('bookmarkStart'),
        raw('proofErr'), raw('hyperlink', 'p', 'link'),
        raw('ins', 'p', 'ins'), raw('drawing', 'r'),
        raw('hyperlink', 'p', 'see the  link here '),
        raw('fldSimple', 'p', ' a field result'),
        raw('hyperlink', 'p', 'a link wider than any line: ' +
          'abcdefghijklmnopqrstuvwxyzabcdefghij klm'),
        raw('noBreakHyphen', 'r'), raw('softHyphen', 'r'),
        {kind: 'br', level: 'r', node: el('br')},
        {kind: 'tab', level: 'r', node: el('tab')}]);
      text += O;
    } else {
      if (text.length > start) runs.push([start, text.length, fmt]);
      start = text.length;
      fmt = pick(fmts);
    }
  }
  if (text.length > start) runs.push([start, text.length, fmt]);
  return para(text, {runs, pPr: {jc: pick(['left', 'center',
    'right']), ind: {left: pick([0, 0, 360]), firstLine: pick([0, 720])},
    extra: []}});
}

/** Each line as its drawn characters at their x positions. */
function glyphs(l) {
  return l.lines.map((ln) => ({y: ln.y, h: ln.h, base: ln.base,
    g: ln.items.filter((i) => i.text).flatMap((i) => {
      if (i.kind === 'box') return [[i.text, i.x]];
      const per = i.w / i.text.length;
      return [...i.text].map((ch, k) => [ch, +(i.x + k * per)
        .toFixed(6)]);
    })}));
}

describe('LineLayout breaks lines as the stub did', () => {
  it('the same lines on 200 generated paragraphs', () => {
    for (let s = 1; s <= 200; s++) {
      const pa = generated(s);
      for (const w of [120, 300]) {
        const a = oldLayout(pa, styles, w, fake, new Map());
        const b = lay(pa, w);
        assert.deepEqual(texts(b), texts(a), `seed ${s} width ${w}`);
        assert.deepEqual(glyphs(b), glyphs(a), `seed ${s} width ${w}`);
        assert.equal(b.h, a.h);
        check(b, pa);
      }
    }
  });
});

describe('LineLayout justified (jc both)', () => {
  it('keeps the offset invariants on 200 generated paragraphs', () => {
    for (let s = 1; s <= 200; s++) {
      const g = generated(s);
      const pa = {...g, pPr: {...g.pPr, jc: 'both'}};
      for (const w of [120, 300]) {
        const l = lay(pa, w);
        check(l, pa);
        for (const ln of l.lines) {
          for (const it of ln.items) {
            assert.ok(it.w >= 0 && Number.isFinite(it.x));
            if (it.text === '' && it.kind !== 'tab') {
              assert.equal(it.w, 0, `seed ${s}: unseen stay 0 wide`);
            }
          }
        }
      }
    }
  });
});
