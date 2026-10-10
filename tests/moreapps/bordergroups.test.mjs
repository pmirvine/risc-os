// Paragraph borders and shading, character shading, on the screen
// (Batch A, A5.1): BorderResolve (side by side and whole-element
// resolution through the styles, raw themed elements read best
// effort, the drawn edge and the shading colour), BorderGroups (which
// paragraphs share a box: equal sides and indents, a kept block,
// a section break or a page break before between them, nil / none,
// shadow, shading only; the pads as gaps; between), BorderPaint (the
// geometry of a box and its painting: shading under the text, edges
// over it, character shading under the highlight), the reuse key
// (a neighbour changed), the Format query, and that a box is never
// text.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {paraBorders, runShade, shadeCss, edgeOf}
  from '../../tools/moreapps/!Word/BorderResolve';
import {boxInfo, borderDeco, boxMark}
  from '../../tools/moreapps/!Word/BorderGroups';
import {geometry, edge} from '../../tools/moreapps/!Word/BorderPaint';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {DECORATORS} from '../../tools/moreapps/!Word/DocStack';
import {paint} from '../../tools/moreapps/!Word/DocPaint';
import {runFmt, paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {addStyle, newStyleTable} from '../../tools/moreapps/!Word/Styles';
import {query} from '../../tools/moreapps/!Word/Format';
import {GAP} from '../../tools/moreapps/!Word/FlowDeco';
import {BAND} from '../../tools/moreapps/!Word/SectDeco';
import {W} from '../../tools/moreapps/!Word/Ns';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p as px, r as rx, STRICT_W_NS,
  STRICT_R_NS} from './build-docx.mjs';
import {mk, box, SEL, C} from './edit-docs.mjs';
import {tm} from './word-docs.mjs';

const M = tm();
const laid = (d, prev, opts) => {
  const L = new DocLayout(d.doc, M, prev, opts);
  L.layout(900);
  return L;
};
const S = (val = 'single', sz = 4, space = 1, color = 'auto') =>
  ({val, sz, space, color});
const BOX = (o = {}) => ({top: S(), left: S(), bottom: S(), right: S(),
  ...o});
const P = (text, pPr = {}, opts = {}) => [text, {...opts,
  pPr: {...pPr, extra: pPr.extra || []}}];
const marks = (L) => L.items.map(boxMark);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ~ ${b}`);
const rawEl = (name, attrs, children = []) => ({name, attrs, children});

describe('BorderResolve: edges and shading colours', () => {
  it('edgeOf: widths, spaces, colours, styles; nil and none', () => {
    assert.deepEqual(edgeOf(S()), {style: 'single', sz: 4, lw: 1, t: 1,
      space: 1, color: '#000000', shadow: false});
    // widths 0 and 96 eighths: clamped 2..96 (at least one pixel)
    assert.equal(edgeOf(S('single', 0)).lw, 1);
    assert.equal(edgeOf(S('single', 96)).lw, 16);
    assert.equal(edgeOf(S('single', 9999)).lw, 16);
    assert.equal(edgeOf({val: 'single'}).lw, 1);
    assert.deepEqual(edgeOf(S('double', 12)), {style: 'double', sz: 12,
      lw: 2,
      t: 6, space: 1, color: '#000000', shadow: false});
    assert.equal(edgeOf(S('single', 4, 31)).space, 41);
    assert.equal(edgeOf(S('single', 4, 500)).space, 41);
    assert.equal(edgeOf(S('single', 4, 0, 'FF0000')).color, '#ff0000');
    for (const v of ['dotted', 'dashed', 'thick']) {
      assert.equal(edgeOf(S(v)).style, v);
    }
    assert.equal(edgeOf(S('wave')).style, 'single');
    assert.equal(edgeOf(S('threeDEmboss')).style, 'single');
    assert.equal(edgeOf({...S(), shadow: true}).shadow, true);
    for (const bad of [S('nil'), S('none'), {}, null, {val: 7},
      {val: '__proto__x!'}, {val: ''}]) {
      assert.equal(edgeOf(bad), null, JSON.stringify(bad));
    }
  });
  it('shadeCss: clear, solid, percentages, other patterns, nil', () => {
    assert.equal(shadeCss({val: 'clear', color: 'auto', fill: 'FFFF00'}),
      '#ffff00');
    assert.equal(shadeCss({val: 'clear', fill: 'auto'}), null);
    assert.equal(shadeCss({val: 'clear'}), null);
    assert.equal(shadeCss({val: 'solid', color: '00FF00'}), '#00ff00');
    assert.equal(shadeCss({val: 'solid', color: 'auto'}), '#000000');
    assert.equal(shadeCss({val: 'pct25', color: '000000',
      fill: 'FFFFFF'}), '#bfbfbf');
    assert.equal(shadeCss({val: 'pct50', color: 'auto'}), '#808080');
    assert.equal(shadeCss({val: 'pct100', color: 'FF0000'}), '#ff0000');
    assert.equal(shadeCss({val: 'horzStripe', color: '000000',
      fill: 'FFFFFF'}), '#808080');
    assert.equal(shadeCss({val: 'nil', fill: 'FF0000'}), null);
    assert.equal(shadeCss(null), null);
    assert.equal(shadeCss({}), null);
  });
});

describe('BorderResolve: what is in force', () => {
  it('sides one by one through the style, each side whole', () => {
    const d = mk(['x']);
    const st = d.doc.styles;
    addStyle(st, {id: 'Boxed', type: 'paragraph', name: 'Boxed', pPr: {
      pBdr: {top: S('single', 4, 1, 'FF0000'), left: S('double')},
      shd: {val: 'clear', fill: 'FF0000'}, extra: []}});
    const para = {...d.doc.sections[0].blocks[0], pStyle: 'Boxed',
      pPr: {pBdr: {top: {val: 'single', sz: 8}}, shd: {val: 'clear',
        color: 'auto'}, extra: []}};
    const r = paraBorders(st, para);
    // the direct top replaces the style's whole: no red, no space
    assert.deepEqual(r.pBdr.top, {val: 'single', sz: 8});
    assert.deepEqual(r.pBdr.left, S('double'));
    // the shading whole: the style's fill does not show through
    assert.deepEqual(r.shd, {val: 'clear', color: 'auto'});
    assert.equal(shadeCss(r.shd), null);
    // the style alone
    const s2 = paraBorders(st, {...para, pPr: {extra: []}});
    assert.equal(shadeCss(s2.shd), '#ff0000');
    assert.equal(s2.pBdr.top.color, 'FF0000');
    // nothing at all
    assert.deepEqual(paraBorders(st, d.doc.sections[0].blocks[0]),
      {pBdr: {}, shd: null});
    assert.deepEqual(paraBorders(null, para).pBdr.top, {val: 'single',
      sz: 8});
  });
  it('a raw themed w:pBdr and w:shd are read best effort; a foreign ' +
    'one is not', () => {
    const d = mk(['x']);
    const pBdr = rawEl('w:pBdr', [], [
      rawEl('w:top', [['w:val', 'single'], ['w:sz', '12'],
        ['w:space', '2'], ['w:color', '4472C4'],
        ['w:themeColor', 'accent1']]),
      rawEl('w:bottom', [['w:val', 'single'], ['w:sz', 'huge'],
        ['w14:foo', '1']]),
      rawEl('w:left', [['w:sz', '4']]),
      rawEl('x:right', [['w:val', 'single']])]);
    const shd = rawEl('w:shd', [['w:val', 'clear'], ['w:color', 'auto'],
      ['w:fill', 'D9D9D9'], ['w:themeFill', 'background1'],
      ['w:themeFillShade', 'D9']]);
    const foreign = rawEl('x:shd', [['xmlns:x', 'urn:x'],
      ['x:val', 'solid']]);
    const para = {...d.doc.sections[0].blocks[0],
      pPr: {extra: [pBdr, shd]}};
    const r = paraBorders(d.doc.styles, para);
    assert.deepEqual(r.pBdr.top, {val: 'single', sz: 12, space: 2,
      color: '4472C4'});
    assert.deepEqual(r.pBdr.bottom, {val: 'single'});
    assert.equal(r.pBdr.left, undefined, 'no val: no side');
    assert.equal(r.pBdr.right, undefined, 'not a w: element');
    assert.equal(shadeCss(r.shd), '#d9d9d9');
    const f = paraBorders(d.doc.styles, {...para,
      pPr: {extra: [foreign]}});
    assert.equal(f.shd, null);
    // a w:pBdr whose own xmlns:w is another namespace is not ours
    const rebound = rawEl('w:pBdr', [['xmlns:w', 'urn:other']],
      [rawEl('w:top', [['w:val', 'single']])]);
    assert.deepEqual(paraBorders(d.doc.styles, {...para,
      pPr: {extra: [rebound]}}).pBdr, {});
    // __proto__ named things are inert
    const evil = rawEl('w:pBdr', [], [rawEl('w:__proto__',
      [['w:val', 'single']])]);
    const e = paraBorders(d.doc.styles, {...para, pPr: {extra: [evil]}});
    assert.deepEqual(Object.keys(e.pBdr), []);
    assert.equal(({}).val, undefined);
    assert.ok(W.length > 10);
  });
  it('runShade: defaults, paragraph style, character style, the run',
    () => {
      const d = mk(['x']);
      const st = d.doc.styles;
      addStyle(st, {id: 'PS', type: 'paragraph', name: 'PS', rPr: {
        shd: {val: 'clear', fill: '00FF00'}, extra: []}});
      addStyle(st, {id: 'CS', type: 'character', name: 'CS', rPr: {
        shd: {val: 'clear', fill: '0000FF'}, extra: []}});
      const p = {...d.doc.sections[0].blocks[0], pStyle: 'PS'};
      assert.equal(shadeCss(runShade(st, p, {rPr: {extra: []}})),
        '#00ff00');
      assert.equal(shadeCss(runShade(st, p, {rStyle: 'CS',
        rPr: {extra: []}})), '#0000ff');
      assert.equal(shadeCss(runShade(st, p, {rStyle: 'CS', rPr: {
        shd: {val: 'nil'}, extra: []}})), null);
      assert.equal(runShade(newStyleTable(), {pPr: {}}, {}), null);
      // the screen's run format
      const f = runFmt(st, p, {rStyle: 'CS', rPr: {extra: []}},
        new Map());
      assert.equal(f.shade, '#0000ff');
      assert.equal(runFmt(st, d.doc.sections[0].blocks[0],
        {rPr: {extra: []}}, null).shade, null);
    });
});

describe('BorderGroups: one box or several', () => {
  it('a boxed paragraph: its four edges, the pads as gaps', () => {
    const d = mk(['above', P('boxed', {pBdr: BOX({top:
      S('single', 12, 4)})}), 'below']);
    const L = laid(d), [a, b, c] = L.items;
    const m = boxMark(b);
    assert.ok(m && !boxMark(a) && !boxMark(c));
    assert.equal(m.joinAbove, false);
    assert.equal(m.joinBelow, false);
    // top: 12 eighths = 2 px, 4 pt = 5 px
    assert.equal(m.padTop, 5 + 2);
    assert.equal(m.padBottom, 1 + 1);
    assert.equal(b.gapAbove, 7);
    assert.equal(b.gapBelow, 2);
    assert.equal(b.y, a.y + a.h + 7);
    assert.equal(c.y, b.y + b.h + 2);
    assert.ok(m.top && m.bottom && m.left && m.right && !m.between);
    assert.equal(m.inL, 0);
    assert.equal(m.inR, L.textW);
    assert.equal(m.fill, null);
    assert.equal(b.block.text, 'boxed', 'never text');
  });
  it('two paragraphs alike: one box, between drawn when set', () => {
    const bdr = BOX({between: S('single', 4, 2)});
    const d = mk([P('one', {pBdr: bdr}), P('two', {pBdr: bdr}),
      P('three', {pBdr: bdr})]);
    const [m0, m1, m2] = marks(laid(d));
    assert.ok(m0.top && !m0.bottom && !m0.between && m0.joinBelow &&
      !m0.joinAbove);
    assert.ok(!m1.top && !m1.bottom && m1.between && m1.joinAbove &&
      m1.joinBelow);
    assert.ok(!m2.top && m2.bottom && m2.between && m2.joinAbove &&
      !m2.joinBelow);
    assert.equal(m1.padTop, 3 + 1);
    assert.equal(m0.padBottom, 0);
    // no between: nothing between them, no gap
    const e = mk([P('one', {pBdr: BOX()}), P('two', {pBdr: BOX()})]);
    const [n0, n1] = marks(laid(e));
    assert.ok(n0.joinBelow && n1.joinAbove && !n1.between);
    assert.equal(n1.padTop, 0);
  });
  it('different sides, widths, colours, styles or shadow: separate boxes',
    () => {
      const diffs = [BOX({top: undefined}), BOX({left: S('single', 8)}),
        BOX({right: S('single', 4, 1, 'FF0000')}),
        BOX({bottom: S('double')}), BOX({top: {...S(), shadow: true}}),
        BOX({left: S('single', 4, 3)}),
        // the definitions, not the look: drawn alike, still apart
        BOX({top: S('wave')}), BOX({top: S('single', 0)}),
        BOX({top: S('single', 4, 1, '000000')}),
        BOX({top: {...S(), frame: true}}), BOX({between: S()}),
        BOX({bar: S()}), BOX({top: S('nil')})];
      for (const other of diffs) {
        const d = mk([P('one', {pBdr: BOX()}), P('two', {pBdr: other})]);
        const [a, b] = marks(laid(d));
        assert.ok(!a.joinBelow && !b.joinAbove, JSON.stringify(other));
        assert.ok(a.bottom, 'the first closes its box');
      }
    });
  it('one box only for equal definitions (nil, none, bar, between ' +
    'included); nil and none and bar are not drawn', () => {
    const d = mk([P('one', {pBdr: {left: S(), top: S('nil')}}),
      P('two', {pBdr: {left: S(), top: S('none')}}),
      P('three', {pBdr: {left: S(), top: S('none'), bar: S()}}),
      P('four', {pBdr: {left: S(), top: S('none'), bar: S()}})]);
    const [a, b, c, e1] = marks(laid(d));
    assert.ok(!a.joinBelow && !b.joinAbove && !a.top && !b.top);
    assert.ok(!b.joinBelow && !c.joinAbove);
    assert.ok(c.joinBelow && e1.joinAbove, 'the same bar: one box');
    // sz 0 and 2 draw alike but are not the same border
    const z = mk([P('a', {pBdr: {left: S('single', 0)}}),
      P('b', {pBdr: {left: S('single', 2)}})]);
    const [z0, z1] = marks(laid(z));
    assert.equal(z0.left.lw, z1.left.lw);
    assert.ok(!z0.joinBelow && !z1.joinAbove);
    // only nil sides: nothing at all
    const e = mk([P('one', {pBdr: {top: S('nil'), bottom: S('none')}})]);
    assert.equal(marks(laid(e))[0], null);
  });
  it('different indents: separate boxes; the box in the indent area',
    () => {
      const d = mk([P('one', {pBdr: BOX(), ind: {left: 720}}),
        P('two', {pBdr: BOX(), ind: {left: 1440}}),
        P('three', {pBdr: BOX(), ind: {left: 1440, right: 1440}}),
        P('four', {pBdr: BOX(), ind: {left: 1440, hanging: 360}})]);
      const L = laid(d);
      const ms = marks(L);
      assert.ok(ms.every((m) => !m.joinAbove && !m.joinBelow));
      assert.equal(ms[0].inL, 48);
      assert.equal(ms[2].inR, L.textW - 96);
      // a hanging indent: the box takes in the first line
      assert.equal(ms[3].inL, 96 - 24);
      // the same indents: one box
      const e = mk([P('a', {pBdr: BOX(), ind: {left: 720}}),
        P('b', {pBdr: BOX(), ind: {left: 720}})]);
      assert.ok(marks(laid(e))[0].joinBelow);
      // the same left and right indents, another first line: one box
      // (each keeps its own inner left edge)
      const f = mk([P('a', {pBdr: BOX(), ind: {left: 720}}),
        P('b', {pBdr: BOX(), ind: {left: 720, hanging: 360}})]);
      const [f0, f1] = marks(laid(f));
      assert.ok(f0.joinBelow && f1.joinAbove);
      assert.equal(f1.inL, 24);
    });
  it('a kept block, a section break or a page break before between ' +
    'them breaks the box', () => {
    const d = mk([P('one', {pBdr: BOX()}), box(), P('two', {pBdr: BOX()})]);
    const ms = marks(laid(d));
    assert.equal(ms[1], null);
    assert.ok(!ms[0].joinBelow && !ms[2].joinAbove);
    // a section break: the first section ends with 'one'
    const e = mk([P('one', {pBdr: BOX()}), P('two', {pBdr: BOX()})]);
    const [s0] = e.doc.sections;
    e.doc.sections = [{...s0, blocks: [s0.blocks[0]]},
      {...s0, blocks: [s0.blocks[1]]}];
    const L = laid(e);
    const [a, b] = marks(L);
    assert.ok(!a.joinBelow && !b.joinAbove && a.bottom && b.top);
    // the band is under the bottom border
    const band = L.items[0].marks.find((x) => x.kind === 'section');
    assert.equal(band.dy, a.padBottom);
    assert.equal(L.items[0].gapBelow, a.padBottom + BAND);
    // page break before: the rule above the top border's gap
    const f = mk([P('one', {pBdr: BOX()}), P('two', {pBdr: BOX(),
      pageBreakBefore: true})]);
    const K = laid(f);
    const [x, y] = marks(K);
    assert.ok(!x.joinBelow && !y.joinAbove && y.top);
    const flow = K.items[1].marks.find((q) => q.kind === 'flow');
    assert.equal(flow.dy, -GAP - y.padTop);
    assert.equal(K.items[1].gapAbove, GAP + y.padTop);
  });
  it('shading only: one box only with the same fill', () => {
    const Y = {val: 'clear', fill: 'FFFF00'};
    const d = mk([P('a', {shd: Y}), P('b', {shd: Y}),
      P('c', {shd: {val: 'clear', fill: '00FF00'}}), 'd',
      P('e', {shd: Y, pBdr: BOX()})]);
    const ms = marks(laid(d));
    assert.ok(ms[0].joinBelow && ms[1].joinAbove);
    assert.ok(!ms[1].joinBelow && !ms[2].joinAbove);
    assert.equal(ms[3], null);
    assert.equal(ms[2].fill, '#00ff00');
    assert.ok(!ms[4].joinAbove);
    assert.equal(ms[0].padTop + ms[0].padBottom, 0);
  });
  it('hostile: widths 0 and 96, space beyond 31, odd values', () => {
    const d = mk([P('a', {pBdr: BOX({top: S('single', 0, 0)})}),
      P('b', {pBdr: BOX({top: S('double', 96, 31)})})]);
    const [a, b] = marks(laid(d));
    assert.equal(a.top.t, 1);
    assert.equal(a.padTop, 1);
    assert.equal(b.top.t, 48);
    assert.equal(b.padTop, 41 + 48);
  });
  it('boxInfo is kept per paragraph object and styles object', () => {
    const d = mk([P('a', {pBdr: BOX()}), 'b']);
    const [pa, pb] = d.doc.sections[0].blocks;
    const st = d.doc.styles;
    const i1 = boxInfo(st, pa);
    assert.equal(boxInfo(st, pa), i1);
    assert.equal(boxInfo(st, pb), null);
    // worked out again for new styles; one object for one look
    const st2 = {...st, docDefaults: {...st.docDefaults, pPr: {
      ...st.docDefaults.pPr, ind: {left: 360}}}};
    assert.equal(boxInfo(st2, pa).inL, 24);
    assert.equal(boxInfo({...st}, pa), i1);
    const pc = {...pa, id: 'other'};
    assert.equal(boxInfo(st, pc), i1);
    // a level indent by value
    const j = boxInfo(st, pa, {left: 720, hanging: 360});
    assert.equal(j.inL, 24);
    assert.equal(boxInfo(st, pa, {left: 720, hanging: 360}), j);
    assert.ok(Object.isFrozen(i1) && Object.isFrozen(i1.sides));
  });
  it('the box\'s indents are the screen\'s (./Fmt paraFmt), through ' +
    'defaults, styles, the level and the paragraph', () => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ind = () => {
      const o = {};
      for (const k of ['left', 'right', 'firstLine', 'hanging']) {
        if (r() < 0.4) o[k] = Math.floor(r() * 3000) - 500;
      }
      return o;
    };
    for (let n = 0; n < 300; n++) {
      const d = mk(['x']);
      const st = d.doc.styles;
      st.docDefaults = {...st.docDefaults, pPr: {extra: [],
        ind: ind()}};
      addStyle(st, {id: 'Base', type: 'paragraph', name: 'Base',
        pPr: {ind: ind(), extra: []}});
      addStyle(st, {id: 'Ind', type: 'paragraph', name: 'Ind',
        basedOn: 'Base', pPr: {ind: ind(), extra: []}});
      const para = {...d.doc.sections[0].blocks[0], pStyle: 'Ind',
        pPr: {ind: ind(), pBdr: BOX(), extra: []}};
      const lvl = r() < 0.5 ? undefined : ind();
      const pf = paraFmt(st, para, lvl);
      const i = boxInfo(st, para, lvl);
      assert.equal(i.left, pf.left, `left ${n}`);
      assert.equal(i.inL, pf.left + Math.min(0, pf.first), `inL ${n}`);
      assert.equal(i.right, pf.right, `right ${n}`);
    }
  });
  it('a list paragraph: its level indent counts', () => {
    const d = mk([P('a', {pBdr: BOX(), numPr: {numId: 1, ilvl: 0}})]);
    d.doc.numbering = {raw: null, nums: new Map([[1, {abstractNumId: 1,
      levels: [{ilvl: 0, numFmt: 'decimal', lvlText: '%1.', start: 1,
        suff: 'tab', pPr: {ind: {left: 720, hanging: 360}}}],
      overrides: new Map()}]])};
    const m = marks(laid(d))[0];
    assert.equal(m.inL, 24);
  });
});

describe('BorderGroups: the reuse key', () => {
  it('a neighbour changed: both neighbours asked again, others kept',
    () => {
      const bdr = BOX();
      const d = mk([P('a', {pBdr: bdr}), P('b', {pBdr: bdr}),
        P('c', {pBdr: bdr}), P('d', {pBdr: bdr}), 'e']);
      const A = laid(d);
      const before = A.items.map((i) => i.deco);
      // c loses its borders: b now ends the box, d starts one
      d.apply({op: 'setProps', block: [0, 2], pPr: {pBdr: null}});
      const B = laid(d, A);
      const after = B.items.map((i) => i.deco);
      assert.equal(after[0], before[0]);
      assert.notEqual(after[1], before[1]);
      assert.notEqual(after[3], before[3]);
      assert.equal(after[4], before[4]);
      const ms = marks(B);
      assert.ok(ms[1].bottom && !ms[1].joinBelow && ms[2] === null &&
        ms[3].top && !ms[3].joinAbove);
      const full = laid(d);
      assert.deepEqual(B.items.map((i) => [i.y, i.gapAbove, i.gapBelow,
        JSON.stringify(i.marks)]), full.items.map((i) => [i.y, i.gapAbove,
        i.gapBelow, JSON.stringify(i.marks)]));
    });
  it('keyOf: the neighbours\' lines; null once the result has no box',
    () => {
      const d = mk([P('a', {pBdr: BOX()}), 'b', box()]);
      const L = laid(d);
      const [a, b, c] = L.items;
      assert.deepEqual(borderDeco.keyOf(a, L), [null, b.lines]);
      assert.equal(borderDeco.keyOf(b, L), null);
      assert.equal(borderDeco.keyOf(c, L), null);
      assert.ok(DECORATORS.includes(borderDeco));
      // typing in b again: a is asked again, nothing else is stale
      const L2 = laid(d, L);
      assert.equal(L2.items[0].deco, a.deco);
      assert.equal(L2.items[1].deco, b.deco);
    });
});

describe('BorderPaint: where things go', () => {
  const left = 100;
  it('one box: edges round the text, the shading inside them', () => {
    const d = mk([P('x', {pBdr: BOX({top: S('single', 12, 4),
      left: S('double', 6, 2)}), shd: {val: 'clear', fill: 'FFFF00'}})]);
    const L = laid(d), it = L.items[0], m = boxMark(it);
    const g = geometry(m, it, null, left);
    const tTop = it.y + it.lines[0].y;
    const last = it.lines[it.lines.length - 1];
    const tBot = it.y + last.y + last.h;
    const by = Object.fromEntries(g.edges.map((e) => [e.side, e]));
    assert.equal(by.top.y, tTop - 5 - 2);
    assert.equal(by.top.h, 2);
    assert.equal(by.bottom.y, tBot + 1);
    // left: double 1 px lines (3 px), 2 pt (3 px) from the text
    assert.equal(by.left.x, left + 0 - 3 - 3);
    assert.equal(by.left.w, 3);
    assert.equal(by.right.x, left + m.inR + 1);
    assert.equal(by.left.y, by.top.y);
    assert.equal(by.left.y + by.left.h, tBot + 1 + 1);
    assert.equal(by.top.x, by.left.x);
    assert.equal(by.top.x + by.top.w, by.right.x + 1);
    assert.deepEqual(g.fill, {x: left - 3, y: tTop - 5,
      w: m.inR + 1 + 3, h: tBot + 1 - (tTop - 5), colour: '#ffff00'});
  });
  it('shading without borders: the text lines only, not the space ' +
    'before or after', () => {
    const d = mk([P('x', {shd: {val: 'solid', color: '00FF00'},
      spacing: {before: 240, after: 240}})]);
    const L = laid(d), it = L.items[0];
    const g = geometry(boxMark(it), it, null, 0);
    assert.equal(g.edges.length, 0);
    near(g.fill.y, it.y + 16);
    near(g.fill.y + g.fill.h, it.y + it.h - 16);
    assert.equal(g.fill.x, 0);
    assert.equal(g.fill.w, L.textW);
  });
  it('a shared box: the shading and the sides run on between them',
    () => {
      const bdr = BOX({between: S()});
      const Y = {val: 'clear', fill: 'FFFF00'};
      const d = mk([P('one', {pBdr: bdr, shd: Y, spacing: {after: 240}}),
        P('two', {pBdr: bdr, shd: Y, spacing: {before: 240}})]);
      const L = laid(d), [a, b] = L.items;
      const ga = geometry(boxMark(a), a, null, 0);
      const gb = geometry(boxMark(b), b, a, 0);
      const endA = a.y + a.h + a.gapBelow;
      assert.equal(ga.fill.y + ga.fill.h, endA);
      assert.equal(gb.fill.y, endA);
      const la = ga.edges.find((e) => e.side === 'left');
      const lb = gb.edges.find((e) => e.side === 'left');
      assert.equal(la.y + la.h, lb.y);
      assert.deepEqual(gb.edges.map((e) => e.side).sort(),
        ['between', 'bottom', 'left', 'right']);
      const bt = gb.edges.find((e) => e.side === 'between');
      assert.equal(bt.y, b.y + b.lines[0].y - 1 - 1);
    });
  function fakeG() {
    const g = {ops: [], font: '', fillStyle: '', strokeStyle: '',
      lineWidth: 1, textBaseline: '',
      fillRect(x, y, w, h) { g.ops.push(['rect', g.fillStyle, x, y, w, h]); },
      fillText(t) { g.ops.push(['text', g.fillStyle, t]); },
      strokeRect() {}, measureText: (t) => ({width: t.length * 6}),
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}};
    return g;
  }
  it('painted: shading first, then the text, the edges last; character ' +
    'shading under the highlight', () => {
    const d = mk([P('boxed', {pBdr: BOX({top: S('single', 4, 0,
      'FF0000')}), shd: {val: 'clear', fill: 'FFFF00'}}),
    ['shaded', {rPr: {shd: {val: 'clear', fill: '00FFFF'},
      highlight: 'green', extra: []}}]]);
    const L = laid(d);
    const g = fakeG();
    paint(L, g, {x0: 0, y0: 0, x1: 2000, y1: 5000});
    const iFill = g.ops.findIndex((o) => o[1] === '#ffff00');
    const iText = g.ops.findIndex((o) => o[0] === 'text' &&
      o[2] === 'boxed');
    const iTop = g.ops.findIndex((o) => o[1] === '#ff0000');
    assert.ok(iFill >= 0 && iFill < iText && iText < iTop,
      JSON.stringify([iFill, iText, iTop]));
    const iSh = g.ops.findIndex((o) => o[1] === '#00ffff');
    const iHl = g.ops.findIndex((o) => o[1] === '#00ff00');
    const iT2 = g.ops.findIndex((o) => o[0] === 'text' &&
      o[2] === 'shaded');
    assert.ok(iSh >= 0 && iSh < iHl && iHl < iT2);
    // the character shading: the item's full line height
    const it = L.items[1], ln = it.lines[0];
    const r = g.ops[iSh];
    assert.equal(r[3], Math.round(it.y + ln.y));
    assert.equal(r[5], Math.round(it.y + ln.y + ln.h) - r[3]);
  });
  it('a rect holding only the bottom border\'s gap still draws it',
    () => {
      const d = mk([P('a', {pBdr: {bottom: S('single', 24, 10,
        'FF0000')}}), 'b']);
      const L = laid(d), a = L.items[0];
      const y0 = a.y + a.h + 2, y1 = a.y + a.h + a.gapBelow;
      assert.ok(a.gapBelow > 10);
      const g = fakeG();
      paint(L, g, {x0: 0, y0, x1: 2000, y1});
      assert.ok(g.ops.some((o) => o[1] === '#ff0000'));
    });
  it('edge: dotted and dashed along, a side cut to rect, double two bars',
    () => {
      const g = fakeG();
      edge(g, {side: 'top', style: 'dotted', lw: 1, colour: '#000000',
        x: 0, y: 5, w: 10, h: 1});
      assert.deepEqual(g.ops.map((o) => o[2]), [0, 2, 4, 6, 8]);
      g.ops = [];
      edge(g, {side: 'top', style: 'dashed', lw: 1, colour: '#000000',
        x: 0, y: 5, w: 12, h: 1});
      assert.deepEqual(g.ops.map((o) => [o[2], o[4]]), [[0, 3], [5, 3],
        [10, 2]]);
      g.ops = [];
      edge(g, {side: 'left', style: 'single', lw: 2, colour: '#000000',
        x: 0, y: 0, w: 2, h: 1e6}, {y0: 100, y1: 200});
      assert.deepEqual(g.ops[0].slice(2), [0, 99, 2, 102]);
      g.ops = [];
      edge(g, {side: 'left', style: 'dotted', lw: 1, colour: '#000000',
        x: 0, y: 0, w: 1, h: 1e7}, {y0: 5e6, y1: 5e6 + 10});
      assert.ok(g.ops.length < 10, 'only the dots in rect');
      g.ops = [];
      edge(g, {side: 'bottom', style: 'double', lw: 2, colour: '#000000',
        x: 0, y: 10, w: 50, h: 6});
      assert.deepEqual(g.ops.map((o) => o[3]), [10, 14]);
    });
});

describe('Format.query: borders and shading', () => {
  it('borders, paraShade, charShade; mixed null', () => {
    const d = mk([P('a', {pBdr: BOX({top: S('nil')}), shd: {val: 'clear',
      fill: 'FFFF00'}}), ['b', {rPr: {shd: {val: 'solid',
      color: 'FF0000'}, extra: []}}]]);
    const q = query(d.doc, SEL(d, 0, 0, 0, 1));
    assert.deepEqual(Object.keys(q.borders).sort(), ['bottom', 'left',
      'right']);
    assert.deepEqual(q.paraShade, {val: 'clear', fill: 'FFFF00'});
    assert.equal(q.charShade, 'none');
    const q1 = query(d.doc, SEL(d, 1, 0, 1, 1));
    assert.deepEqual(q1.charShade, {val: 'solid', color: 'FF0000'});
    assert.equal(q1.paraShade, 'none');
    assert.deepEqual(q1.borders, {});
    const both = query(d.doc, SEL(d, 0, 0, 1, 1));
    assert.equal(both.charShade, null);
    assert.equal(both.paraShade, null);
    assert.equal(both.borders, null);
    // a caret: the run it is in
    assert.deepEqual(query(d.doc, C(d, 1, 1)).charShade, {val: 'solid',
      color: 'FF0000'});
  });
});

describe('BorderGroups: never text', () => {
  it('clicks in the gaps are the paragraph\'s; the text is unchanged',
    () => {
      const d = mk([P('boxed', {pBdr: BOX({top: S('single', 48, 20),
        bottom: S('single', 48, 20)})}), 'next']);
      const L = laid(d), [a, b] = L.items;
      const above = L.hitTest(L.left + 2, a.y - 3);
      assert.deepEqual(above.pos, {id: a.id, off: 0});
      // the gap below is the bottom border's: still this paragraph
      const below = L.hitTest(L.left + 2, a.y + a.h + 3);
      assert.equal(below.pos.id, a.id);
      assert.equal(L.hitTest(L.left + 2, b.y + 2).pos.id, b.id);
      assert.equal(a.block.text, 'boxed');
      const r = L.selectionRects(SEL(d, 0, 0, 0, 5));
      assert.ok(r.every((x) => x.y >= a.y && x.y + x.h <= a.y + a.h));
    });
});

describe('BorderResolve: Strict start and end sides', () => {
  it('w:start / w:end are drawn as left / right, the file is kept',
    async () => {
      const side = (n) => `<w:${n} w:val="single" w:sz="12" ` +
        'w:space="4" w:color="FF0000"/>';
      const bdr = `<w:pBdr>${side('top')}${side('start')}` +
        `${side('bottom')}${side('end')}</w:pBdr>`;
      const z = await buildDocx({'word/document.xml': documentXml(
        px(rx('strict box'), bdr) + px(rx('after')), {ns: STRICT_W_NS,
          rNs: STRICT_R_NS, rootAttrs: ' w:conformance="strict"'})},
      {strict: true});
      const doc = await readDocx(z);
      const [a] = doc.sections[0].blocks;
      const r = paraBorders(doc.styles, a);
      assert.deepEqual(Object.keys(r.pBdr).sort(), ['bottom', 'left',
        'right', 'top']);
      assert.equal(r.pBdr.left.color, 'FF0000');
      const L = new DocLayout(doc, M);
      L.layout(900);
      const m = boxMark(L.items[0]);
      assert.ok(m.left && m.right && m.top && m.bottom);
      assert.equal(m.left.lw, 2);
      // nothing rewritten: the w:pBdr comes back as it was
      const out = await readZip(await writeDocx(doc, {date: new Date(0)}));
      const xml = new TextDecoder().decode(out.get('word/document.xml'));
      assert.ok(xml.includes(bdr), xml.slice(0, 600));
      // a model field with start / end (as a raw side would read)
      const q = paraBorders(null, {pPr: {extra: [], pBdr: {top: S()}}});
      assert.deepEqual(Object.keys(q.pBdr), ['top']);
    });
  it('left wins over start in one element (the first given)', () => {
    const el = (n, c) => rawEl('w:' + n, [['w:val', 'single'],
      ['w:color', c]]);
    const n = rawEl('w:pBdr', [], [el('left', '00FF00'),
      el('start', 'FF0000'), el('end', '0000FF')]);
    const r = paraBorders(null, {pPr: {extra: [n]}});
    assert.equal(r.pBdr.left.color, '00FF00');
    assert.equal(r.pBdr.right.color, '0000FF');
  });
});

describe('BorderGroups: clicks in a bottom border\'s gap', () => {
  it('stay in the paragraph above, also at a section\'s end', () => {
    const d = mk([P('one', {pBdr: {bottom: S('single', 48, 20)}}),
      'two']);
    const [s0] = d.doc.sections;
    d.doc.sections = [{...s0, blocks: [s0.blocks[0]]},
      {...s0, blocks: [s0.blocks[1]]}];
    const L = laid(d), [a, b] = L.items;
    const m = boxMark(a);
    assert.ok(m.padBottom > 20);
    const end = a.y + a.h;
    for (const dy of [1, m.padBottom / 2, m.padBottom - 0.5]) {
      const h = L.hitTest(L.left + 10, end + dy);
      assert.equal(h.pos.id, a.id, `pad +${dy}`);
    }
    // the band begins after the pad, and is still the end of a
    const band = a.marks.find((x) => x.kind === 'section');
    assert.equal(band.dy, m.padBottom);
    const inBand = L.hitTest(L.left + 10, end + m.padBottom + 2);
    assert.deepEqual(inBand.pos, {id: a.id, off: 3});
    assert.equal(L.hitTest(L.left + 10, b.y + 2).pos.id, b.id);
  });
});
