// PositionMap: caret rectangles, hit testing, line ends, vertical
// movement and selection rectangles for one laid-out paragraph.
// Measured with a fake: 8 px per UTF-16 unit, 9 px when bold.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {caretRect, hitTest, lineOf, lineStart, lineEnd, vertical,
  selectionRects} from '../../tools/moreapps/!Word/PositionMap';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';

const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>');
const fake = (t, css) => (css.includes('bold') ? 9 : 8) * t.length;
const O = '\uFFFC';
const el = (name) => ({name: 'w:' + name, attrs: [], children: []});
const raw = (n, level = 'p', text) => ({kind: 'raw', level,
  node: el(n), ...(text === undefined ? {} : {text})});
const PY = 100;

let styles;
before(async () => {
  const d = await readDocx(await buildDocx({
    'word/document.xml': documentXml(p(r('x'))),
    'word/styles.xml': STYLES}));
  styles = d.styles;
});

/** A laid-out paragraph {para, y, h, lines, metrics} at y = PY. */
function lay(text, w = 400, opts = {}) {
  const para = newPara(text, opts);
  const metrics = new TextMetrics(fake);
  const l = layoutPara(para, styles, w, metrics, new Map());
  return {para, y: PY, h: l.h, lines: l.lines, metrics};
}
const mid = (pl, i) => PY + pl.lines[i].y + pl.lines[i].h / 2;
const hit = (pl, x, i) => hitTest(pl, x, mid(pl, i));

describe('PositionMap caretRect', () => {
  it('at 0, mid-word and at the end', () => {
    const pl = lay('hello world');
    const ln = pl.lines[0];
    assert.deepEqual(caretRect(pl, 0), {x: 0, y: PY + ln.y, h: ln.h,
      line: 0});
    assert.equal(caretRect(pl, 3).x, 24);
    assert.equal(caretRect(pl, 11).x, 88);
  });
  it('in an empty paragraph', () => {
    const pl = lay('');
    const c = caretRect(pl, 0);
    assert.deepEqual([c.x, c.line], [0, 0]);
    assert.ok(c.h > 0);
  });
  it('a soft-wrap offset has two places, by affinity', () => {
    const pl = lay('aaaa bbbb cccc', 100);
    assert.deepEqual(pl.lines.map((l) => [l.from, l.to]),
      [[0, 10], [10, 14]]);
    const up = caretRect(pl, 10, 'up'), down = caretRect(pl, 10);
    assert.deepEqual([up.x, up.line], [80, 0]);
    assert.deepEqual([down.x, down.line], [0, 1]);
    assert.equal(lineOf(pl, 10, 'up'), 0);
    assert.equal(lineOf(pl, 10, 'down'), 1);
  });
  it('before a line break: the end of that line', () => {
    const pl = lay('ab\ncd');
    assert.deepEqual([caretRect(pl, 2).x, caretRect(pl, 2).line],
      [16, 0]);
    assert.deepEqual([caretRect(pl, 3, 'up').x,
      caretRect(pl, 3, 'up').line], [0, 1]);
    const t = lay('ab\n');
    assert.deepEqual([caretRect(t, 3).x, caretRect(t, 3).line], [0, 1]);
  });
  it('right alignment moves the caret of an empty paragraph', () => {
    const pl = lay('', 400, {pPr: {jc: 'right'}});
    assert.ok(caretRect(pl, 0).x > 300);
  });
});

describe('PositionMap hitTest', () => {
  it('left of the text gives 0, right of a line its end (up)', () => {
    const pl = lay('aaaa bbbb cccc', 100);
    assert.deepEqual(hit(pl, -50, 0), {off: 0, affinity: 'down'});
    assert.deepEqual(hit(pl, 500, 0), {off: 10, affinity: 'up'});
    assert.deepEqual(hit(pl, 500, 1), {off: 14, affinity: 'down'});
    assert.deepEqual(hit(pl, -5, 1), {off: 10, affinity: 'down'});
  });
  it('between two characters: the nearer boundary', () => {
    const pl = lay('abcd');
    assert.equal(hit(pl, 11, 0).off, 1);
    assert.equal(hit(pl, 13, 0).off, 2);
  });
  it('inside an emoji: before or after it, never inside', () => {
    const pl = lay('a\u{1F600}b');
    assert.equal(hit(pl, 14, 0).off, 1);
    assert.equal(hit(pl, 18, 0).off, 3);
    const z = lay('a\u{1F469}\u200D\u{1F4BB}b');      // ZWJ: 5 units
    assert.equal(hit(z, 20, 0).off, 1);
    assert.equal(hit(z, 40, 0).off, 6);
    const c = lay('ae\u0301b');                         // combining
    assert.equal(hit(c, 17, 0).off, 3);
  });
  it('a long cluster split by a run boundary is not entered', () => {
    const t = 'a' + '\u0301'.repeat(100) + 'b';
    const pl = lay(t, 4000, {runs: [
      {start: 0, end: 60, rPr: {extra: []}},
      {start: 60, end: 102, rPr: {b: true, extra: []}}]});
    const bold = pl.lines[0].items.find((i) => i.from === 60);
    assert.ok(bold, 'a bold item starts at 60');
    assert.equal(hit(pl, bold.x + 1, 0).off, 0);
    assert.equal(hit(pl, bold.x + 41 * 9 - 2, 0).off, 101);
  });
  it('inside a tab: the nearer edge', () => {
    const pl = lay('ab\tc');
    assert.equal(hit(pl, 20, 0).off, 2);
    assert.equal(hit(pl, 40, 0).off, 3);
  });
  it('inside a box: the nearer edge', () => {
    const pl = lay(`a${O}b`, 400, {inlines: {1: raw('drawing', 'r')}});
    const box = pl.lines[0].items[1];
    assert.equal(hit(pl, box.x + 2, 0).off, 1);
    assert.equal(hit(pl, box.x + box.w - 2, 0).off, 2);
  });
  it('y above the first line or below the last', () => {
    const pl = lay('aaaa bbbb cccc', 100);
    assert.deepEqual(hitTest(pl, 8, PY - 500), {off: 1,
      affinity: 'down'});
    assert.deepEqual(hitTest(pl, 8, PY + 5000), {off: 11,
      affinity: 'down'});
  });
  it('right of a line ending in a break: before the break', () => {
    const pl = lay('ab\ncd');
    assert.deepEqual(hit(pl, 300, 0), {off: 2, affinity: 'down'});
  });
});

describe('PositionMap wrappers (atomic, across lines)', () => {
  // lines [[0,6],[6,6],[6,7]]: 'aaaa bb cc ', 'dddddd ', 'eeeeeeee.'
  const link = () => lay(`aaaa ${O}.`, 100, {inlines: {5: raw(
    'hyperlink', 'p', 'bb cc dddddd eeeeeeee')}});
  it('the caret after the wrapper is after its last piece', () => {
    const pl = link();
    assert.deepEqual(pl.lines.map((l) => [l.from, l.to]),
      [[0, 6], [6, 6], [6, 7]]);
    for (const aff of ['up', 'down']) {
      const c = caretRect(pl, 6, aff);
      assert.deepEqual([c.x, c.line], [64, 2]);
    }
    assert.deepEqual([caretRect(pl, 5).x, caretRect(pl, 5).line],
      [40, 0]);
  });
  it('a click in a piece gives the nearer edge of that piece', () => {
    const pl = link();
    assert.equal(hit(pl, 42, 0).off, 5);           // 'bb', left
    assert.equal(hit(pl, 54, 0).off, 6);           // 'bb', right
    assert.equal(hit(pl, 10, 1).off, 5);           // 'dddddd', left
    assert.equal(hit(pl, 40, 1).off, 6);           // 'dddddd', right
    assert.equal(hit(pl, 500, 0).off, 6);          // right of line 0
  });
  it('End of the first line stops before the wrapper', () => {
    const pl = link();
    assert.deepEqual(lineEnd(pl, 0, 'down'), {off: 5,
      affinity: 'down'});
  });
  it('a selection of the wrapper covers all its pieces', () => {
    const pl = link();
    const rs = selectionRects(pl, 5, 6);
    assert.deepEqual(rs.map((q) => [q.x, q.w]),
      [[40, 48], [0, 56], [0, 64]]);
    assert.deepEqual(selectionRects(pl, 0, 5).map((q) => [q.x, q.w]),
      [[0, 40]]);
  });
});

describe('PositionMap line start and end', () => {
  it('End excludes a hanging space at a soft wrap', () => {
    const pl = lay('aaaa bbbb   cccc', 100);
    assert.deepEqual(lineEnd(pl, 3, 'down'), {off: 9,
      affinity: 'down'});
    assert.deepEqual(lineEnd(pl, 12, 'up'), {off: 9,
      affinity: 'down'});
    assert.deepEqual(lineStart(pl, 14, 'down'), {off: 12,
      affinity: 'down'});
    assert.deepEqual(lineEnd(pl, 14, 'down'), {off: 16,
      affinity: 'down'});
    assert.deepEqual(lineStart(pl, 3, 'down'), {off: 0,
      affinity: 'down'});
  });
  it('End at a wrap with no space is the end, affinity up', () => {
    const pl = lay('aaaaaaaaa\tbbbbbbbbbb', 100);
    assert.equal(pl.lines.length, 2);
    assert.deepEqual(lineEnd(pl, 0, 'down'), {off: 10,
      affinity: 'up'});
  });
  it('End sits before a line break', () => {
    const pl = lay('ab\ncd');
    assert.deepEqual(lineEnd(pl, 0, 'down'), {off: 2,
      affinity: 'down'});
    assert.deepEqual(lineStart(pl, 4, 'down'), {off: 3,
      affinity: 'down'});
  });
});

describe('PositionMap vertical', () => {
  it('keeps goalX across lines of different widths', () => {
    const pl = lay('aaaaaaaaaa bb cccccccccc', 100);
    assert.deepEqual(pl.lines.map((l) => [l.from, l.to]),
      [[0, 11], [11, 14], [14, 24]]);
    assert.equal(vertical(pl, 8, 'down', -1, 64), null);
    const a = vertical(pl, 8, 'down', 1, 64);
    assert.deepEqual(a, {off: 14, affinity: 'up', line: 1});
    const b = vertical(pl, a.off, a.affinity, 1, 64);
    assert.deepEqual(b, {off: 22, affinity: 'down', line: 2});
    assert.equal(vertical(pl, b.off, b.affinity, 1, 64), null);
    const c = vertical(pl, b.off, b.affinity, -1, 64);
    assert.deepEqual(c, a);
  });
  it('goalX defaults to the caret x', () => {
    const pl = lay('aaaa bbbb cccc', 100);
    assert.deepEqual(vertical(pl, 2, 'down', 1),
      {off: 12, affinity: 'down', line: 1});
  });
  it('skips a line that only holds wrapper pieces', () => {
    const pl = lay(`aaaa ${O}.`, 100, {inlines: {5: raw('hyperlink',
      'p', 'bb cc dddddd eeeeeeee')}});
    const v = vertical(pl, 2, 'down', 1, 50);
    assert.equal(v.line, 2);
    assert.deepEqual(vertical(pl, 6, 'down', -1, 50).line, 0);
  });
  it('lands on a line whose wrapper piece is hit on its left', () => {
    // lines 'aaaa bb cc ', 'dddddd ', 'eeeeeeee.': at x 10 the
    // nearer edge of each piece is offset 5, on line 0
    const pl = lay(`aaaa ${O}.`, 100, {inlines: {5: raw('hyperlink',
      'p', 'bb cc dddddd eeeeeeee')}});
    assert.deepEqual(vertical(pl, 2, 'down', 1, 10),
      {off: 6, affinity: 'down', line: 2});
    const q = lay(`aaaa ${O} zz yy`, 100, {inlines: {5: raw(
      'hyperlink', 'p', 'bb cccccc')}});
    const v = vertical(q, 1, 'down', 1, 5);
    assert.ok(v && v.line === 1 && v.off === 6, JSON.stringify(v));
    const u = vertical(q, 7, 'down', -1, 50);
    assert.ok(u && u.line === 0, JSON.stringify(u));
  });
});

describe('PositionMap selectionRects', () => {
  it('three lines give three rectangles', () => {
    const pl = lay('aaaa bbbb cccc dddd eeee ffff', 100);
    const rs = selectionRects(pl, 2, 25);
    assert.deepEqual(rs, pl.lines.map((l, i) => ({
      x: [16, 0, 0][i], y: PY + l.y, w: [64, 80, 40][i], h: l.h})));
  });
  it('an unseen inline adds no width', () => {
    const pl = lay(`a${O}b`, 400, {inlines: {1: raw('bookmarkStart')}});
    assert.deepEqual(selectionRects(pl, 1, 2), []);
    assert.deepEqual(selectionRects(pl, 0, 3).map((q) => [q.x, q.w]),
      [[0, 16]]);
    assert.deepEqual(selectionRects(pl, 2, 2), []);
  });
  it('a long word is measured, not split per character', () => {
    let calls = 0;
    const para = newPara('a ' + 'x'.repeat(100000) + ' b');
    const metrics = new TextMetrics((t, css) => (calls++,
      fake(t, css)));
    const l = layoutPara(para, styles, 600, metrics, new Map());
    const pl = {para, y: 0, h: l.h, lines: l.lines, metrics};
    calls = 0;
    const t0 = performance.now();
    const h = hitTest(pl, 400000, pl.lines[1].y + 1);
    assert.equal(h.off, 50002);
    assert.equal(caretRect(pl, 50002).x, 400000);
    selectionRects(pl, 10, 60000);
    assert.ok(calls < 200, `${calls} measures`);
    assert.ok(performance.now() - t0 < 2000);
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

/** A random paragraph: words, emoji, runs, tabs, breaks, inlines. */
function generated(seed, w, jc) {
  const rnd = rng(seed), pick = (a) => a[Math.floor(rnd() * a.length)];
  const fmts = [{}, {}, {b: true}, {sz: 40}];
  // justified: also superscript, subscript and highlight
  if (jc) {
    fmts.push({vertAlign: 'superscript'}, {vertAlign: 'subscript',
      highlight: 'yellow'}, {highlight: 'green', b: true});
  }
  let text = '';
  const runs = [], inlines = {};
  let fmt = {}, start = 0;
  const n = 3 + Math.floor(rnd() * 50);
  for (let k = 0; k < n; k++) {
    const c = rnd();
    if (c < 0.45) text += 'abcdefghijklmnop'.slice(0, 1 + rnd() * 12);
    else if (c < 0.52) {
      text += pick(['\u{1F600}', 'e\u0301', '\u{1F469}\u200D\u{1F4BB}',
        'x\u{1F44D}\u{1F3FD}']);
    } else if (c < 0.7) text += ' '.repeat(1 + Math.floor(rnd() * 3));
    else if (c < 0.74) text += '\t';
    else if (c < 0.77) text += '\n';
    else if (c < 0.88) {
      inlines[text.length] = pick([raw('bookmarkStart'),
        raw('hyperlink', 'p', 'link'), raw('drawing', 'r'),
        raw('hyperlink', 'p', 'see the  link here '),
        raw('fldSimple', 'p', ' a field result'),
        raw('hyperlink', 'p', 'a link wider than any line: ' +
          'abcdefghijklmnopqrstuvwxyzabcdefghij klm'),
        raw('noBreakHyphen', 'r'),
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
  const opts = {inlines, pPr: {jc: pick(['left', 'center', 'right'])}};
  if (jc) opts.pPr.jc = jc;
  if (runs.length) {
    opts.runs = runs.map(([s, e, rPr]) => ({start: s, end: e,
      rPr: {...rPr, extra: []}}));
  }
  return lay(text, w, opts);
}

/** Offsets a caret can stand at: see PositionMap's header. */
function stops(pl) {
  const t = pl.para.text, g = new Set(graphemes(t));
  const items = pl.lines.flatMap((l) => l.items);
  return [...g].filter((o) => !items.some((i) => i.shown &&
    i.from < o && o < i.to));
}

describe('PositionMap round trip', () => {
  for (const jc of [undefined, 'both']) {
  it(`hitTest(caretRect(off)) gives off on 500 paragraphs${jc
    ? ' (justified)' : ''}`, () => {
    for (let s = 1; s <= 500; s++) {
      const pl = generated(s, [90, 160, 400][s % 3], jc);
      const items = pl.lines.flatMap((l) => l.items);
      const offs = stops(pl), rnd = rng(s * 7);
      for (let k = 0; k < 30 && offs.length; k++) {
        const off = offs[Math.floor(rnd() * offs.length)];
        for (const aff of ['down', 'up']) {
          const c = caretRect(pl, off, aff);
          const h = hitTest(pl, c.x, c.y + c.h / 2);
          const at = `seed ${s} off ${off} ${aff} -> ${h.off}`;
          assert.deepEqual(caretRect(pl, h.off, h.affinity), c, at);
          if (h.off !== off) {
            const lo = Math.min(off, h.off), hi = Math.max(off, h.off);
            assert.ok(items.every((i) => i.w === 0 || i.to <= lo ||
              i.from >= hi), at);
          }
          assert.ok(g(pl).has(h.off), at);
        }
      }
    }
  });
  }
});
const g = (pl) => new Set(graphemes(pl.para.text));

describe('PositionMap properties', () => {
  it('Up and Down always reach a line that has caret places', () => {
    for (let s = 1; s <= 300; s++) {
      const pl = generated(s, [90, 160, 400][s % 3]);
      const offs = stops(pl), rnd = rng(s * 13), gs = g(pl);
      const at = [];
      for (const o of offs) {
        for (const a of ['down', 'up']) at.push(lineOf(pl, o, a));
      }
      const lo = Math.min(...at), hi = Math.max(...at);
      for (let k = 0; k < 20 && offs.length; k++) {
        const off = offs[Math.floor(rnd() * offs.length)];
        const aff = rnd() < 0.5 ? 'up' : 'down';
        const i = lineOf(pl, off, aff), gx = rnd() * 500 - 50;
        const msg = `seed ${s} off ${off} ${aff} x ${gx}`;
        for (const dir of [1, -1]) {
          const v = vertical(pl, off, aff, dir, gx);
          if (dir > 0 ? i < hi : i > lo) {
            assert.ok(v, msg + ' dir ' + dir);
            assert.ok(dir > 0 ? v.line > i : v.line < i, msg);
            assert.ok(gs.has(v.off), msg);
            assert.equal(lineOf(pl, v.off, v.affinity), v.line, msg);
          } else assert.equal(v, null, msg + ' dir ' + dir);
        }
      }
    }
  });
  it('selection rectangles lie in their lines, in order', () => {
    for (let s = 1; s <= 300; s++) {
      const pl = generated(s, [90, 160, 400][s % 3]);
      const n = pl.para.text.length, rnd = rng(s * 17);
      const items = pl.lines.flatMap((l) => l.items);
      for (let k = 0; k < 20; k++) {
        const a = Math.floor(rnd() * (n + 1));
        const b = Math.floor(rnd() * (n + 1));
        const rs = selectionRects(pl, a, b);
        const msg = `seed ${s} ${a} ${b}`;
        assert.deepEqual(selectionRects(pl, b, a), rs, msg);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const seen = items.some((i) => i.w > 0 && (i.from < i.to
          ? i.from < hi && i.to > lo : lo < i.from && hi >= i.from));
        if (!seen) assert.deepEqual(rs, [], msg);
        let y = -Infinity;
        for (const q of rs) {
          const L = pl.lines.find((l) => PY + l.y === q.y);
          assert.ok(L && q.h === L.h && q.y > y, msg);
          y = q.y;
          const vis = L.items.filter((i) => i.w > 0);
          assert.ok(q.w > 0 && q.x >= vis[0].x - 1e-9 &&
            q.x + q.w <= vis.at(-1).x + vis.at(-1).w + 1e-9, msg);
        }
      }
    }
  });
});
