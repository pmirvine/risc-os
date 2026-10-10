// Tab stops in the layout (Batch A, A4.1): TabAlign's rules and
// LineLayout with stops: left, centre, right and decimal stops at 1",
// 3" and 6"; decimal with no point, two points, a number wider than
// the room before its stop; leaders; bar stops; cleared style stops;
// Strict start / end; the default stop from settings.xml; negative
// stops and stops past the right margin; a tab inside a hyperlink's
// text; a justified line with a tab; the offsets contract and the
// hitTest(caretRect) round trip on random paragraphs with stops.
// Measured with the fake: 8 px per UTF-16 unit, 9 px when bold.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {startOf, alignedEnd, close, dotIn}
  from '../../tools/moreapps/!Word/TabAlign';
import {caretRect, hitTest} from '../../tools/moreapps/!Word/PositionMap';
import {paint} from '../../tools/moreapps/!Word/DocPaint';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {tm, loadStyles, mkDoc, O, raw, rng} from './word-docs.mjs';
import {buildDocx, documentXml, settingsXml, stylesXml, p, r}
  from './build-docx.mjs';

let styles;
before(async () => { styles = await loadStyles(); });

const T = (val, pos, leader) => ({val, pos,
  ...(leader ? {leader} : {})});
/** Lay out text with direct stops (and other pPr / options). */
function lay(text, tabs, w = 800, o = {}) {
  const pa = newPara(text, {...o, pPr: {...(tabs ? {tabs} : {}),
    ...(o.pPr || {}), extra: []}});
  const l = layoutPara(pa, o.styles || styles, w, tm(), new Map(),
    undefined, o.defPx);
  return {...l, para: pa};
}
const tabsOf = (l) => l.lines.flatMap((ln) => ln.items)
  .filter((i) => i.kind === 'tab');
/** x of the item standing for offset off. */
const xAt = (l, off) => l.lines.flatMap((ln) => ln.items)
  .find((i) => i.from === off && i.to > off).x;

/** Offsets contract (LineLayout's header). */
function check(l, t) {
  const {lines} = l;
  assert.equal(lines[0].from, 0);
  assert.equal(lines.at(-1).to, t.length);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (i + 1 < lines.length) assert.equal(ln.to, lines[i + 1].from);
    let at = ln.from;
    for (const it of ln.items) {
      assert.equal(it.from, at, 'gap-free');
      assert.ok(it.w >= 0 && Number.isFinite(it.x), 'x and w');
      at = it.to;
    }
    assert.equal(at, ln.to);
  }
}

describe('TabAlign', () => {
  const P = (val, pos, x = 10, dot = null) => ({val, pos, x, dot});
  it('startOf: right ends at the stop, centre centred on it', () => {
    assert.equal(startOf(P('right', 100), 50), 60);
    assert.equal(startOf(P('center', 100), 50), 80);
  });
  it('startOf: decimal puts the first point at the stop', () => {
    assert.equal(startOf(P('decimal', 100, 10, 30), 50), 80);
    assert.equal(startOf(P('decimal', 100), 50, 26), 84, 'dot given');
    assert.equal(startOf(P('decimal', 100), 50), 60, 'none: as right');
  });
  it('startOf: null when the segment is wider than the room', () => {
    assert.equal(startOf(P('right', 100), 101), null);
    assert.equal(startOf(P('right', 100), 100), 10, 'just fits');
    assert.equal(startOf(P('center', 100), 190), 10);
    assert.equal(startOf(P('center', 100), 191), null);
    assert.equal(startOf(P('decimal', 100, 10, 101), 120), null);
  });
  it('alignedEnd: where the lined-up segment ends', () => {
    assert.equal(alignedEnd(P('right', 100), 50), 100);
    assert.equal(alignedEnd(P('center', 100), 50), 120);
    assert.equal(alignedEnd(P('right', 100), 150), null);
  });
  it('close: widens the tab, moves the items after it and ink', () => {
    const tab = {x: 10, w: 0}, a = {x: 10, w: 20}, b = {x: 30, w: 10};
    const line = {items: [{x: 0, w: 10}, tab, a, b], ink: 40};
    const dx = close(line, {...P('right', 100), it: tab, idx: 1}, 40);
    assert.equal(dx, 60);
    assert.deepEqual([tab.w, a.x, b.x, line.ink, line.items[0].x],
      [60, 70, 90, 100, 0]);
  });
  it('close: no width when it does not fit (the text right after ' +
    'what comes before)', () => {
    const tab = {x: 10, w: 0};
    const line = {items: [tab, {x: 10, w: 200}], ink: 210};
    assert.equal(close(line, {...P('right', 100), it: tab, idx: 0},
      210), 0);
    assert.deepEqual([tab.w, line.items[1].x], [0, 10]);
  });
  it('close: never narrower than nothing', () => {
    const tab = {x: 10, w: 0};
    const line = {items: [tab], ink: 10};
    assert.equal(close(line, {...P('right', 10), it: tab, idx: 0}, 10),
      0);
    assert.equal(tab.w, 0);
  });
  it('dotIn: the first point of a group; boxes have none', () => {
    const f = {css: '15px x'};
    const g = [[{text: '12', f, kind: 'text'}, 16],
      [{text: '[...]', f, kind: 'box'}, 46],
      [{text: '3.4.5', f, kind: 'text'}, 40]];
    assert.equal(dotIn(g, 100, tm()), 100 + 16 + 46 + 8);
    assert.equal(dotIn(g.slice(0, 2), 0, tm()), null);
  });
});

describe('LineLayout: stops at 1", 3" and 6"', () => {
  it('left', () => {
    for (const [tw, px] of [[1440, 96], [4320, 288], [8640, 576]]) {
      const l = lay('a\tbc', [T('left', tw)]);
      assert.deepEqual([tabsOf(l)[0].x, tabsOf(l)[0].w], [8, px - 8]);
      assert.equal(xAt(l, 2), px);
      check(l, 'a\tbc');
    }
  });
  it('centre: the text after it centred on the stop', () => {
    for (const px of [96, 288, 576]) {
      const l = lay('a\tabcd', [T('center', px * 15)]);
      assert.equal(xAt(l, 2), px - 16);
      assert.equal(tabsOf(l)[0].w, px - 16 - 8);
    }
  });
  it('right: the text after it ends at the stop', () => {
    for (const px of [96, 288, 576]) {
      const l = lay('a\tabcd', [T('right', px * 15)]);
      assert.equal(xAt(l, 2), px - 32);
    }
  });
  it('decimal: the first point at the stop', () => {
    for (const px of [96, 288, 576]) {
      const l = lay('a\t12.50', [T('decimal', px * 15)]);
      assert.equal(xAt(l, 2), px - 16, 'the point at ' + px);
    }
  });
  it('several kinds on one line, each from where the last ended',
    () => {
      const t = 'a\tName\tQty\t12.5\tTotal';
      const l = lay(t, [T('left', 1440), T('center', 4320),
        T('decimal', 6480), T('right', 8640)]);
      assert.deepEqual([xAt(l, 2), xAt(l, 7), xAt(l, 11), xAt(l, 16)],
        [96, 288 - 12, 432 - 16, 576 - 40]);
      const last = l.lines[0].items.at(-1);
      assert.equal(last.x + last.w, 576);
      check(l, t);
    });
});

describe('LineLayout: decimal stops', () => {
  it('no point: as a right stop', () => {
    assert.equal(xAt(lay('a\t1250', [T('decimal', 4320)]), 2), 288 - 32);
  });
  it('two points: the first one at the stop', () => {
    assert.equal(xAt(lay('a\t1.2.3', [T('decimal', 4320)]), 2),
      288 - 8);
  });
  it('the point in a later word of the segment', () => {
    const l = lay('a\tabout 3.5', [T('decimal', 4320)]);
    assert.equal(xAt(l, 2), 288 - 7 * 8);
  });
  it('a number wider than the room before the stop: the tab takes ' +
    'no width (Word)', () => {
    const l = lay('abcdefgh\t123456789.5', [T('decimal', 1440)]);
    const tab = tabsOf(l)[0];
    assert.deepEqual([tab.x, tab.w], [64, 0]);
    assert.equal(xAt(l, 9), 64);
    check(l, 'abcdefgh\t123456789.5');
  });
  it('a right segment that stops fitting as words come: no width',
    () => {
      const l = lay('abcdefgh\tab cdefgh', [T('right', 1440)]);
      assert.equal(xAt(l, 9), 64);
      const last = l.lines[0].items.at(-1);
      assert.equal(last.x + last.w, 64 + 72);
    });
  it('a long right-aligned segment never runs past the margin', () => {
    const t = 'Introduction to the subject\tChapter one is a really ' +
      'long title that goes on 12';
    const l = lay(t, [T('right', 9000)], 600);
    check(l, t);
    assert.ok(l.lines.length >= 2);
    assert.equal(tabsOf(l)[0].w, 0);
    assert.equal(xAt(l, 28), 216, 'right after the text before it');
    for (const ln of l.lines) {
      for (const it of ln.items) {
        if (/\S/.test(it.text)) assert.ok(it.x + it.w <= 600, it.text);
      }
    }
  });
  it('a table of contents: a long title wraps, the page number ' +
    'at the margin', () => {
    const t = 'A chapter title that is long enough to need more ' +
      'than one line of the page, and more\t12';
    const l = lay(t, [T('right', 9000, 'dot')], 600);
    check(l, t);
    assert.ok(l.lines.length === 2);
    const last = l.lines[1].items.at(-1);
    assert.equal(last.text, '12');
    assert.equal(last.x + last.w, 600);
    assert.equal(tabsOf(l)[0].leader, 'dot');
    assert.ok(tabsOf(l)[0].w > 0);
  });
  it('trailing spaces after right / centre text are not lined up',
    () => {
      assert.equal(xAt(lay('a\tabcd  ', [T('right', 4320)]), 2),
        288 - 32);
      assert.equal(xAt(lay('a\tabcd ', [T('center', 4320)]), 2),
        288 - 16);
      const l = lay('a\tab \tc', [T('right', 2880), T('left', 4320)]);
      assert.deepEqual([xAt(l, 2), xAt(l, 6)], [192 - 16, 288]);
    });
});

describe('LineLayout: leaders, bars, cleared stops', () => {
  it('leaders are recorded on the tab item', () => {
    for (const ld of ['dot', 'hyphen', 'underscore', 'heavy',
      'middleDot']) {
      const l = lay('a\tb', [T('right', 4320, ld)]);
      assert.equal(tabsOf(l)[0].leader, ld);
      assert.equal(tabsOf(l)[0].w, 288 - 8 - 8);
    }
    assert.equal(tabsOf(lay('a\tb', [T('left', 4320, 'none')]))[0]
      .leader, undefined);
    assert.equal('leader' in tabsOf(lay('a\tb', null))[0], false);
  });
  it('a bar stop draws a line on every line and stops nothing', () => {
    const l = lay('a\tb ' + 'word '.repeat(60), [T('bar', 1440),
      T('left', 2880)], 400);
    assert.ok(l.lines.length > 2);
    for (const ln of l.lines) assert.deepEqual(ln.bars, [96]);
    assert.equal(xAt(l, 2), 192);
    assert.equal(lay('a\tb', null).lines[0].bars, undefined);
  });
  it('a style stop cleared by the paragraph is not used', async () => {
    const st = await styledTable();
    const l = lay('a\tb', [T('clear', 2880)], 800,
      {styles: st, pStyle: 'Tabbed'});
    assert.equal(xAt(l, 2), 48, 'the default stop');
    const m = lay('a\tb', null, 800, {styles: st, pStyle: 'Tabbed'});
    assert.equal(xAt(m, 2), 192, 'the style stop');
    const n = lay('a\tb\tc', [T('right', 4320)], 800,
      {styles: st, pStyle: 'Tabbed'});
    assert.deepEqual([xAt(n, 2), xAt(n, 4)], [192, 280],
      'style and direct merged');
  });
  it('Strict start and end stops', () => {
    const l = lay('a\tb\tcd', [T('start', 1440), T('end', 4320)]);
    assert.deepEqual([xAt(l, 2), xAt(l, 4)], [96, 288 - 16]);
  });
});

describe('LineLayout: default stops', () => {
  it('720 twips (48 px) by default, 360 from settings', async () => {
    assert.equal(xAt(lay('a\tb', null), 2), 48);
    assert.equal(xAt(lay('a\tb', null, 800, {defPx: 24}), 2), 24);
    const doc = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('a\tb\tc'))),
      'word/styles.xml': stylesXml(''),
      'word/settings.xml': settingsXml(
        '<w:defaultTabStop w:val="360"/>')}));
    const L = new DocLayout(doc, tm());
    L.layout(800);
    const its = L.items[0].lines[0].items;
    assert.deepEqual(its.filter((i) => i.kind !== 'tab')
      .map((i) => i.x), [0, 24, 48]);
  });
  it('counted from the margin, not the left indent', () => {
    const l = lay('a\tb', null, 800, {pPr: {ind: {left: 360}}});
    assert.equal(xAt(l, 0), 24);
    assert.equal(xAt(l, 2), 48);
  });
  it('the hanging indent is a stop on the first line', () => {
    const l = lay('a\tb\tc', null, 800,
      {pPr: {ind: {left: 1080, hanging: 1080}}});
    assert.deepEqual([xAt(l, 2), xAt(l, 4)], [72, 96],
      'default stops before it are not used');
    const m = lay('a\tb', null, 800,
      {pPr: {ind: {left: 540, hanging: 540}}});
    assert.equal(xAt(m, 2), 36);
  });
  it('a glossary: the definition at the hanging indent', () => {
    const ind = {left: 2160, hanging: 2160};
    for (const w of ['Cat', 'Dog', 'Elephant']) {
      const l = lay(w + '\tdefinition of the word', null, 800,
        {pPr: {ind}});
      assert.equal(xAt(l, w.length + 1), 144, w);
    }
    const c = lay('Cat\tdefinition', [T('left', 1440)], 800,
      {pPr: {ind}});
    assert.equal(xAt(c, 4), 96, 'a custom stop before it comes first');
  });
  it('custom stops clear the default ones before them', () => {
    const l = lay('a\tb\tc', [T('left', 2880)]);
    assert.deepEqual([xAt(l, 2), xAt(l, 4)], [192, 240]);
  });
});

describe('LineLayout: hostile positions', () => {
  it('negative stops are passed over', () => {
    const l = lay('a\tb', [T('left', -1440), T('right', -31680)]);
    assert.equal(xAt(l, 2), 48);
  });
  it('a stop past the right margin: at the margin', () => {
    const l = lay('a\tbcd', [T('right', 31680, 'dot')], 400);
    assert.equal(xAt(l, 2), 400 - 24);
    assert.equal(tabsOf(l)[0].leader, 'dot');
    const m = lay('a\tb', [T('left', 31680)], 400);
    assert.equal(tabsOf(m)[0].x + tabsOf(m)[0].w, 400);
    // the text after it wraps normally
    assert.equal(m.lines.length, 2);
    assert.equal(xAt(m, 2), 0);
    check(m, 'a\tb');
  });
  it('a tab past the last default stop goes to the edge', () => {
    const t = 'x'.repeat(49) + '\tb';
    const l = lay(t, null, 400);
    assert.equal(tabsOf(l)[0].x + tabsOf(l)[0].w, 400);
    check(l, t);
  });
  it('256 stops, many tabs: every one at a stop, in order', () => {
    const tabs = Array.from({length: 256}, (_, k) =>
      T(['left', 'right', 'center', 'decimal', 'bar'][k % 5],
        (k + 1) * 30));
    const t = 'a\t'.repeat(300);
    const l = lay(t, tabs, 800);
    check(l, t);
    for (const ln of l.lines) {
      let last = -Infinity;
      for (const it of ln.items) {
        assert.ok(it.x >= last - 1e-9);
        last = it.x + it.w;
      }
    }
  });
});

describe('LineLayout: tabs in other places', () => {
  it('a tab inside a hyperlink\'s text goes to the next stop', () => {
    const t = 'a' + O + 'c';
    const pa = newPara(t, {inlines: {1: raw('hyperlink', 'p', 'x\ty')},
      pPr: {tabs: [T('left', 1440)], extra: []}});
    const l = layoutPara(pa, styles, 800, tm(), new Map());
    const its = l.lines[0].items;
    assert.deepEqual(its.map((i) => [i.kind, i.from, i.to, i.x]), [
      ['text', 0, 1, 0], ['link', 1, 2, 8], ['tab', 2, 2, 16],
      ['link', 2, 2, 96], ['text', 2, 3, 104]]);
    check(l, t);
  });
  it('a justified line with a tab is left alone', () => {
    const t = 'a\tb ' + 'word '.repeat(40);
    const l = lay(t, [T('left', 1440)], 400, {pPr: {jc: 'both'}});
    const ln = l.lines[0];
    assert.ok(ln.wrapped);
    assert.ok(ln.items.every((i) => !i.js));
    const end = l.lines[1];
    assert.ok(end.items.some((i) => i.js > 0), 'the next line spread');
  });
  it('right and centre paragraphs move the lined-up text too', () => {
    const l = lay('a\tbcd', [T('right', 1440)], 400,
      {pPr: {jc: 'right'}});
    assert.equal(xAt(l, 2), 400 - 24);
  });
});

/** A style table with style Tabbed: a left stop at 2". */
async function styledTable() {
  const doc = await readDocx(await buildDocx({
    'word/document.xml': documentXml(p(r('x'))),
    'word/styles.xml': stylesXml(
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Tabbed">' +
      '<w:name w:val="Tabbed"/><w:pPr><w:tabs>' +
      '<w:tab w:val="left" w:pos="2880"/></w:tabs></w:pPr></w:style>')}));
  return doc.styles;
}

/** A random paragraph with random stops (seed s). */
function generated(s) {
  const rnd = rng(s), pick = (a) => a[Math.floor(rnd() * a.length)];
  let text = '';
  const inlines = {};
  const n = 3 + Math.floor(rnd() * 30);
  for (let k = 0; k < n; k++) {
    const c = rnd();
    if (c < 0.4) text += pick(['ab', '12.5', 'x', 'word', '3.14.15']);
    else if (c < 0.6) text += ' ';
    else if (c < 0.85) text += '\t';
    else if (c < 0.9) text += '\n';
    else {
      inlines[text.length] = pick([raw('hyperlink', 'p', 'l\tk'),
        {kind: 'tab', level: 'r'}, raw('bookmarkStart')]);
      text += O;
    }
  }
  const tabs = Array.from({length: Math.floor(rnd() * 8)}, () =>
    T(pick(['left', 'center', 'right', 'decimal', 'bar', 'start',
      'end']), Math.floor(rnd() * 12000) - 1000,
    pick([undefined, 'dot', 'none'])));
  const seen = new Set();
  const uniq = tabs.filter((t) => !seen.has(t.pos) && seen.add(t.pos));
  return newPara(text, {inlines, pPr: {tabs: uniq,
    jc: pick(['left', 'center', 'right', 'both']),
    ind: pick([{}, {left: 360}, {left: 720, hanging: 360}]), extra: []}});
}

/** Offsets a caret can stand at (PositionMap's header). */
function stops(pl) {
  const t = pl.para.text, g = new Set(graphemes(t));
  const items = pl.lines.flatMap((l) => l.items);
  return [...g].filter((o) => !items.some((i) => i.shown &&
    i.from < o && o < i.to));
}

describe('tab stops: offsets and positions on random paragraphs', () => {
  it('300 paragraphs: offsets contract, hitTest(caretRect) round trip',
    () => {
      let led = 0, barred = 0, tabs = 0;
      for (let s = 1; s <= 300; s++) {
        const pa = generated(s);
        const w = [160, 400, 800][s % 3];
        const l = layoutPara(pa, styles, w, tm(), new Map());
        check(l, pa.text);
        const pl = {para: pa, y: 50, h: l.h, lines: l.lines,
          metrics: tm()};
        for (const ln of l.lines) {
          if (ln.bars) barred++;
          for (const it of ln.items) {
            if (it.kind === 'tab') tabs++;
            if (it.leader) led++;
          }
        }
        for (const off of stops(pl)) {
          for (const aff of ['down', 'up']) {
            const c = caretRect(pl, off, aff);
            const h = hitTest(pl, c.x, c.y + c.h / 2);
            assert.deepEqual(caretRect(pl, h.off, h.affinity), c,
              `seed ${s} off ${off} ${aff} -> ${h.off}`);
          }
        }
      }
      assert.ok(tabs > 1000 && led > 100 && barred > 100,
        `${tabs} tabs, ${led} with leaders, ${barred} lines with bars`);
    });
});

describe('tab stops in a whole document', () => {
  it('mkDoc paragraphs with stops lay out under DocLayout', () => {
    const doc = mkDoc([['a\tb', {pPr: {tabs: [T('right', 4320)],
      extra: []}}], 'c\td']);
    const L = new DocLayout(doc, tm());
    L.layout(800);
    assert.equal(L.items[0].lines[0].items.at(-1).x, 288 - 8);
    assert.equal(L.items[1].lines[0].items.at(-1).x, 48);
  });
});

describe('DocPaint: leaders and bar stops', () => {
  function fakeG() {
    const g = {rects: [], texts: [], font: '', fillStyle: '',
      strokeStyle: '', lineWidth: 1, textBaseline: '',
      fillRect: (x, y, w, h) => g.rects.push({x, y, w, h,
        c: g.fillStyle}),
      fillText: (t, x, y) => g.texts.push({t, x, y, font: g.font,
        c: g.fillStyle}),
      strokeRect() {}, measureText: (t) => ({width: t.length * 4}),
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}};
    return g;
  }
  const doc = (tabs, rPr) => mkDoc([['a\tb', {pPr: {tabs, extra: []},
    runs: [{start: 0, end: 3, rPr: {...rPr, extra: []}}]}]]);
  const draw = (d) => {
    const L = new DocLayout(d, tm());
    L.layout(800);
    const g = fakeG();
    paint(L, g, {x0: 0, y0: 0, x1: 2000, y1: 5000});
    return {L, g, tab: L.items[0].lines[0].items[1]};
  };
  it('dots, hyphens, middle dots: whole characters in the tab, in ' +
    'its colour and font', () => {
    for (const [ld, ch] of [['dot', '.'], ['hyphen', '-'],
      ['middleDot', '\u00b7']]) {
      const {L, g, tab} = draw(doc([T('right', 4320, ld)],
        {color: 'FF0000'}));
      const t = g.texts.find((x) => x.t[0] === ch);
      assert.ok(t, ld);
      const k = Math.ceil(tab.x / 4);
      assert.equal(t.t, ch.repeat(Math.floor((tab.x + tab.w) / 4) - k));
      assert.equal(t.x, L.left + 4 * k, 'on the grid');
      assert.equal(t.c, '#FF0000');
      assert.equal(t.font, tab.f.css);
      assert.ok(t.x >= L.left + tab.x &&
        t.x + t.t.length * 4 <= L.left + tab.x + tab.w + 1e-9);
    }
  });
  it('dot leaders of lines whose tabs start at different places ' +
    'line up', () => {
    const d = mkDoc([['a\tb', {pPr: {tabs: [T('right', 4320, 'dot')],
      extra: []}}], ['abc\tb', {pPr: {tabs: [T('right', 4320, 'dot')],
      extra: []}}], ['abcdefg\tb', {pPr: {tabs: [T('right', 4320,
      'dot')], extra: []}}]]);
    const L = new DocLayout(d, tm());
    L.layout(800);
    const g = fakeG();
    paint(L, g, {x0: 0, y0: 0, x1: 2000, y1: 5000});
    const dots = g.texts.filter((x) => x.t[0] === '.');
    assert.equal(dots.length, 3);
    const ends = dots.map((x) => x.x + x.t.length * 4);
    for (const x of dots) assert.equal((x.x - L.left) % 4, 0);
    assert.equal(new Set(ends).size, 1, 'they end at one place');
  });
  it('underscore and heavy: a line under the tab, heavy twice as ' +
    'thick', () => {
    const u = draw(doc([T('left', 4320, 'underscore')]));
    const h = draw(doc([T('left', 4320, 'heavy')]));
    const line = (r) => r.g.rects.find((x) => Math.abs(x.w - r.tab.w) <
      1e-9 && x.x === r.L.left + r.tab.x);
    assert.ok(line(u) && line(h));
    assert.equal(line(h).h, 2 * line(u).h);
  });
  it('no leader: nothing drawn in the tab', () => {
    const {g} = draw(doc([T('left', 4320)]));
    assert.deepEqual(g.texts.map((x) => x.t), ['a', 'b']);
  });
  it('a bar stop: a 1 px black line the height of each line', () => {
    const {L, g} = draw(doc([T('bar', 1440)]));
    const it0 = L.items[0], ln = it0.lines[0];
    const bar = g.rects.filter((x) => x.w === 1 &&
      x.x === Math.round(L.left + 96));
    assert.equal(bar.length, 1);
    assert.equal(bar[0].c, '#000000');
    assert.equal(bar[0].h, Math.round(ln.h));
  });
});
