// BreakMarks: page and column breaks on the screen: the 'pb' token,
// the rule that ends its line (to the line's end, at least 90 px,
// wrapping first when less is left), the offsets contract, caret and
// hit testing on the rule, and what selection lights.
// Measured with a fake: 8 px per UTF-16 unit, 9 px when bold.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {tokens} from '../../tools/moreapps/!Word/LineTokens';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {caretRect, hitTest, lineEnd, lineStart, selectionRects}
  from '../../tools/moreapps/!Word/PositionMap';
import {isPageBreak, breakLabel, ruleFit, rulePaint, ruleLit,
  MIN_RULE, LIT} from '../../tools/moreapps/!Word/BreakMarks';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import * as S from '../../tools/moreapps/!Word/Selection';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';

const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>');
const fake = (t, css) => (css.includes('bold') ? 9 : 8) * t.length;
const O = '￼';
const PB = {kind: 'br', level: 'r', brType: 'page'};
const CB = {kind: 'br', level: 'r', brType: 'column'};
const PY = 100;

let styles;
before(async () => {
  const d = await readDocx(await buildDocx({
    'word/document.xml': documentXml(p(r('x'))),
    'word/styles.xml': STYLES}));
  styles = d.styles;
});

/** text with a page break at each U+FFFC (or the inlines given). */
function lay(text, w = 400, inl) {
  const inlines = {};
  for (let i = 0; i < text.length; i++) {
    if (text[i] === O) inlines[i] = (inl && inl[i]) || PB;
  }
  const para = newPara(text, {inlines});
  const metrics = new TextMetrics(fake);
  const l = layoutPara(para, styles, w, metrics, new Map());
  return {para, y: PY, h: l.h, lines: l.lines, metrics};
}
const rules = (pl) => pl.lines.flatMap((l) => l.items)
  .filter((x) => x.kind === 'pagebreak');

/** The offsets contract of ./LineLayout. */
function contract(pl) {
  const {lines} = pl, n = pl.para.text.length;
  assert.equal(lines[0].from, 0);
  assert.equal(lines.at(-1).to, n);
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length) assert.equal(lines[i].to, lines[i + 1].from);
    let at = lines[i].from;
    for (const it of lines[i].items) {
      assert.equal(it.from, at, 'gap-free');
      at = it.to;
    }
    assert.equal(at, lines[i].to);
  }
}

/** hitTest(caretRect(off)) gives off back, every offset, both ways. */
function roundTrip(pl) {
  for (let off = 0; off <= pl.para.text.length; off++) {
    for (const aff of ['down', 'up']) {
      const c = caretRect(pl, off, aff);
      const h = hitTest(pl, c.x, c.y + c.h / 2);
      assert.equal(h.off, off, `offset ${off} ${aff}`);
    }
  }
}

describe('BreakMarks: which inlines, labels', () => {
  it('page and column breaks; nothing else', () => {
    assert.equal(isPageBreak(PB), true);
    assert.equal(isPageBreak(CB), true);
    for (const x of [null, undefined, 7, 'br', {kind: 'br'},
      {kind: 'br', brType: 'textWrapping'}, {kind: 'raw', brType: 'page'},
      {kind: 'br', brType: '__proto__'}, {kind: 'br', brType: 'Page'},
      {kind: 'br', brType: {}}]) {
      assert.equal(isPageBreak(x), false, JSON.stringify(x));
      assert.equal(breakLabel(x), '');
    }
    assert.equal(breakLabel(PB), 'Page break');
    assert.equal(breakLabel(CB), 'Column break');
  });
  it("a typed br is a 'pb' token; a plain one a line break", () => {
    const para = newPara(`a${O}${O}${O}`, {inlines: {1: PB, 2: CB,
      3: {kind: 'br', level: 'r', brType: 'textWrapping'}}});
    const ts = tokens(para, styles, new Map());
    assert.deepEqual(ts.map((t) => [t.t, t.kind, t.from, t.to,
      t.shown, t.label]), [['w', 'text', 0, 1, false, undefined],
      ['pb', 'pagebreak', 1, 2, true, 'Page break'],
      ['pb', 'pagebreak', 2, 3, true, 'Column break'],
      ['nl', 'break', 3, 4, true, undefined]]);
  });
  it('ruleFit: to the end, at least 90 px, wrapping first', () => {
    assert.deepEqual(ruleFit(10, 400, true), {wrap: false, w: 390});
    assert.deepEqual(ruleFit(310, 400, true), {wrap: false, w: 90});
    assert.deepEqual(ruleFit(311, 400, true), {wrap: true, w: 90});
    assert.deepEqual(ruleFit(0, 50, false), {wrap: false, w: 90});
    assert.equal(MIN_RULE, 90);
  });
  it('rulePaint: dots either side of the label; no room, no label', () => {
    const g = rulePaint({x: 100, w: 300}, 60);
    assert.equal(g.label, 220);
    assert.deepEqual(g.dots, [[100, 214], [286, 400]]);
    const n = rulePaint({x: 0, w: 90}, 100);
    assert.equal(n.label, null);
    assert.deepEqual(n.dots, [[0, 90]]);
    assert.deepEqual(ruleLit({x: 5, w: 300}), [5, 5 + LIT]);
    assert.deepEqual(ruleLit({x: 5, w: 4}), [5, 9]);
  });
});

describe('BreakMarks: the rule in a laid-out paragraph', () => {
  it('at the end: one line, the rule to the end, no line after', () => {
    const pl = lay(`abc${O}`);
    assert.equal(pl.lines.length, 1);
    const [ln] = pl.lines;
    assert.equal(ln.endsWithBreak, true);
    const [rule] = rules(pl);
    assert.deepEqual([rule.x, rule.w, rule.from, rule.to, rule.shown,
      rule.text, rule.label], [24, 376, 3, 4, true, '', 'Page break']);
    contract(pl);
    roundTrip(pl);
  });
  it('mid-paragraph: it ends its line; the text goes on below', () => {
    const pl = lay(`ab${O}cd`);
    assert.deepEqual(pl.lines.map((l) => [l.from, l.to,
      l.endsWithBreak]), [[0, 3, true], [3, 5, false]]);
    assert.equal(rules(pl)[0].w, 400 - 16);
    contract(pl);
    roundTrip(pl);
  });
  it('alone in its paragraph: the whole line', () => {
    const pl = lay(O);
    assert.equal(pl.lines.length, 1);
    assert.deepEqual([rules(pl)[0].x, rules(pl)[0].w], [0, 400]);
    contract(pl);
    roundTrip(pl);
  });
  it('less than 90 px left: the rule wraps to a line of its own', () => {
    // 40 units = 320 px: 80 px left
    const pl = lay('x'.repeat(40) + O + 'z');
    assert.equal(pl.lines.length, 3);
    assert.deepEqual(pl.lines.map((l) => [l.from, l.to, l.wrapped,
      l.endsWithBreak]), [[0, 40, true, false], [40, 41, false, true],
      [41, 42, false, false]]);
    assert.deepEqual([rules(pl)[0].x, rules(pl)[0].w], [0, 400]);
    contract(pl);
    roundTrip(pl);
    // exactly 90 left: stays
    const q = lay('x'.repeat(30) + 'y'.repeat(9) + O, 402);
    assert.equal(q.lines.length, 1);
    assert.equal(rules(q)[0].w, 90);
  });
  it('a page narrower than 90 px: 90 px all the same', () => {
    const pl = lay(O, 30);
    assert.equal(rules(pl)[0].w, MIN_RULE);
    contract(pl);
  });
  it('two breaks, a column break, a line break, a bookmark', () => {
    const bm = {kind: 'raw', level: 'p', node: {name: 'w:bookmarkStart',
      attrs: [], children: []}};
    const pl = lay(`a${O}${O}b\nc${O}${O}`, 400, {1: PB, 2: CB, 6: PB,
      7: bm});
    assert.deepEqual(rules(pl).map((x) => x.label),
      ['Page break', 'Column break', 'Page break']);
    // (the bookmark after the last break stays on its line)
    assert.deepEqual(pl.lines.map((l) => [l.from, l.to,
      l.endsWithBreak]), [[0, 2, true], [2, 3, true], [3, 5, true],
      [5, 8, true]]);
    contract(pl);
    // (a zero-width bookmark shares its place: no round trip there)
  });
  it('centred and right-aligned text: the rule stays in the line', () => {
    for (const jc of ['center', 'right', 'both']) {
      const para = newPara(`abc${O}`, {inlines: {3: PB},
        pPr: {jc, extra: []}});
      const l = layoutPara(para, styles, 400, new TextMetrics(fake),
        new Map());
      const rule = l.lines[0].items[1];
      assert.ok(rule.x + rule.w <= 400.01, jc);
      assert.equal(l.lines[0].items[0].x, 0, jc);
    }
  });
  it('the rule is never painted with a highlight colour', () => {
    const para = newPara(`a${O}`, {inlines: {1: PB},
      runs: [{start: 0, end: 2, rPr: {highlight: 'yellow',
        extra: []}}]});
    const l = layoutPara(para, styles, 400, new TextMetrics(fake),
      new Map());
    assert.ok(l.lines[0].items[0].hl);
    assert.equal(l.lines[0].items[1].hl, null);
  });
});

describe('BreakMarks: caret, clicks and selection on the rule', () => {
  it('the caret before and after the rule; End and Home', () => {
    const pl = lay(`abc${O}`);
    assert.deepEqual([caretRect(pl, 3).x, caretRect(pl, 4).x], [24, 400]);
    assert.deepEqual(lineEnd(pl, 0), {off: 4, affinity: 'down'});
    assert.deepEqual(lineStart(pl, 4), {off: 0, affinity: 'down'});
    const mid = lay(`ab${O}cd`);
    assert.deepEqual(lineEnd(mid, 0), {off: 2, affinity: 'down'});
  });
  it('a click on the rule: its nearer edge', () => {
    const pl = lay(`abc${O}`);
    const y = PY + pl.lines[0].h / 2;
    assert.equal(hitTest(pl, 30, y).off, 3);
    assert.equal(hitTest(pl, 200, y).off, 3);
    assert.equal(hitTest(pl, 220, y).off, 4);
    assert.equal(hitTest(pl, 999, y).off, 4);
    const mid = lay(`ab${O}cd`);
    const h = hitTest(mid, 390, PY + mid.lines[0].h / 2);
    assert.deepEqual(h, {off: 3, affinity: 'down'});
    assert.equal(caretRect(mid, 3).line, 1);
  });
  it('selected: only its first 8 px are lit', () => {
    const pl = lay(`abc${O}`);
    const rs = selectionRects(pl, 0, 4);
    assert.deepEqual(rs.map((x) => [x.x, x.w]), [[0, 24 + LIT]]);
    assert.deepEqual(selectionRects(pl, 3, 4).map((x) => [x.x, x.w]),
      [[24, LIT]]);
  });
});

describe('BreakMarks: in a document layout', () => {
  /** A DocLayout over paragraphs (strings, U+FFFC a page break). */
  function doc(texts) {
    const blocks = texts.map((t) => {
      const inlines = {};
      for (let i = 0; i < t.length; i++) if (t[i] === O) inlines[i] = PB;
      return newPara(t, {inlines});
    });
    const d = {sections: [{props: {extra: []}, blocks}], styles,
      numbering: null};
    const L = new DocLayout(d, new TextMetrics(fake));
    L.layout(800);
    return {d, L, blocks};
  }
  it('Right and Left pass the break in one press each', () => {
    const {L, blocks} = doc([`ab${O}`, 'cd']);
    const id = blocks[0].id;
    let s = S.caret({id, off: 2});
    s = S.move(s, L, 'right');
    assert.deepEqual([s.head.id, s.head.off], [id, 3]);
    s = S.move(s, L, 'right');
    assert.deepEqual([s.head.id, s.head.off], [blocks[1].id, 0]);
    s = S.move(s, L, 'left');
    s = S.move(s, L, 'left');
    assert.deepEqual([s.head.id, s.head.off], [id, 2]);
  });
  it('the paragraph-mark stub after a break stays in the column', () => {
    const {L, blocks} = doc([`ab${O}`, 'cd', `${O}`, '']);
    const rs = L.selectionRects(S.select({id: blocks[0].id, off: 0},
      {id: blocks[3].id, off: 0}));
    assert.ok(rs.length >= 4);
    for (const r of rs) {
      assert.ok(r.x + r.w <= L.left + L.textW + 1e-9, JSON.stringify(r));
    }
    // the stub after "cd" is where its text ends, as before
    const it1 = L.items[1];
    assert.ok(rs.some((r) => r.y === it1.y && r.w === 6 &&
      r.x === L.left + 16));
  });
  it('hitTest(caretRect) round trip over the document', () => {
    const {L, blocks} = doc([`ab${O}cd`, O, `x${O}`, '']);
    for (const b of blocks) {
      for (let off = 0; off <= b.text.length; off++) {
        const c = L.caretRect({id: b.id, off});
        const h = L.hitTest(c.x, c.y + c.h / 2);
        assert.deepEqual([h.pos.id, h.pos.off], [b.id, off]);
      }
    }
  });
});
