// List labels on the screen (deliverable 5, task 3): the level's
// indents (style < numbering level < direct ind), the label in the
// hanging space with its suffix (tab, space, nothing) and lvlJc, its
// format, alignment and justification, and the label kept out of the
// offsets, the caret, hit testing and selection. Measured with the
// fake: 8 px per UTF-16 unit, 9 px when bold.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {newStyleTable, addStyle, setDefault}
  from '../../tools/moreapps/!Word/Styles';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {mk, blocks} from './edit-docs.mjs';
import {tm, loadStyles} from './word-docs.mjs';

let styles;
before(async () => { styles = await loadStyles(); });

/** Level ilvl: decimal '%n.', indent left 1440 (96 px) per level,
 *  hanging 720 (48 px). */
const lv = (ilvl, o = {}) => ({ilvl, numFmt: 'decimal',
  lvlText: `%${ilvl + 1}.`, start: 1,
  pPr: {ind: {left: 1440 * (ilvl + 1), hanging: 720}}, ...o});
const N = (levels) => ({abstractNumId: 1, levels,
  overrides: new Map()});
const nums = (level0 = {}) => new Map([[1, N([lv(0, level0), lv(1),
  lv(2)])]]);
const docOf = (paras, ns = nums(), st = styles) => ({
  sections: [{props: {extra: []}, blocks: paras, raw: null}],
  styles: st, numbering: {raw: null, nums: ns}, parts: new Map(),
  rels: [], meta: {}, rawSettings: null});
/** A list paragraph at ilvl k of numId 1; o: newPara options. */
const li = (text, k = 0, o = {}) => newPara(text, {...o, pPr: {
  ...(o.pPr || {}), numPr: {numId: 1, ilvl: k}}});
/** Lay out a document; its items. */
function lay(doc, w = 800, opts) {
  const L = new DocLayout(doc, tm(), undefined, opts);
  L.layout(w);
  return L;
}
const first = (L, k = 0) => L.items[k].lines[0];
const textX = (ln) => ln.items.length ? ln.items[0].x : ln.x;

/** Offsets invariants: lines[0].from 0, gap-free, label not text. */
function check(it) {
  const {lines} = it, t = it.block.text;
  assert.equal(lines[0].from, 0);
  assert.equal(lines.at(-1).to, t.length);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (i + 1 < lines.length) assert.equal(ln.to, lines[i + 1].from);
    let at = ln.from;
    for (const x of ln.items) {
      assert.equal(x.from, at);
      assert.ok(!x.label, 'no label item');
      at = x.to;
    }
    assert.equal(at, ln.to);
    if (i > 0) assert.equal(ln.label, undefined, 'label on line 0');
  }
}

describe('list display: indents', () => {
  it('a list paragraph takes the level\'s left and hanging', () => {
    const L = lay(docOf([li('ab')]));
    const ln = first(L);
    assert.equal(ln.label.text, '1.');
    assert.equal(ln.label.x, 48);
    assert.equal(ln.label.w, 16);
    assert.equal(ln.x, 96);
    assert.equal(textX(ln), 96);
    const pf = paraFmt(styles, L.items[0].block, {left: 1440,
      hanging: 720});
    assert.equal(pf.left, 96);
    assert.equal(pf.first, -48);
    check(L.items[0]);
  });
  it('a direct left indent wins, the level\'s hanging stays', () => {
    const L = lay(docOf([li('ab', 0, {pPr: {ind: {left: 2880}}})]));
    const ln = first(L);
    assert.equal(ln.label.x, 144);
    assert.equal(ln.x, 192);
  });
  it('a direct firstLine replaces the level\'s hanging (one value)',
    () => {
      const L = lay(docOf([li('ab', 0, {pPr: {ind: {firstLine: 0}}})]));
      const ln = first(L);
      assert.equal(ln.label.x, 96);
      // the label ends past the indent: the next 48 px stop
      assert.equal(ln.x, 144);
    });
  it('the level indent wins over the style\'s; a style-numbered '
    + 'heading takes it', () => {
    const st = newStyleTable();
    addStyle(st, {id: 'Normal', type: 'paragraph', name: 'Normal',
      pPr: {ind: {left: 4320, firstLine: 360}, extra: []}});
    setDefault(st, 'paragraph', 'Normal');
    addStyle(st, {id: 'H1', type: 'paragraph', name: 'heading 1',
      basedOn: 'Normal', pPr: {numPr: {numId: 1}, ind: {left: 0},
        extra: []}});
    const ns = new Map([[1, N([lv(0, {pStyle: 'H1'})])]]);
    const L = lay(docOf([li('ab'), newPara('ab', {pStyle: 'H1'})], ns,
      st));
    for (const k of [0, 1]) {
      assert.equal(first(L, k).label.x, 48, 'item ' + k);
      assert.equal(first(L, k).x, 96);
    }
  });
  it('the level indent overrides per attribute, as Word merges w:ind',
    () => {
      // Normal: left 2880 (192 px), hanging 360 (24 px)
      const st = newStyleTable();
      addStyle(st, {id: 'Normal', type: 'paragraph', name: 'Normal',
        pPr: {ind: {left: 2880, hanging: 360}, extra: []}});
      setDefault(st, 'paragraph', 'Normal');
      const at = (ind, pPr) => {
        const o = ind === undefined ? {} : {pPr: {ind}};
        const L = lay(docOf([li('ab', 0, pPr ? {pPr} : {})],
          new Map([[1, N([lv(0, {pPr: o.pPr})])]]), st));
        const ln = first(L);
        return [ln.label.x, ln.x];
      };
      // left only: the style's hanging stays
      assert.deepEqual(at({left: 1440}), [72, 96]);
      // hanging only: the style's left stays
      assert.deepEqual(at({hanging: 720}), [144, 192]);
      // both
      assert.deepEqual(at({left: 1440, hanging: 720}), [48, 96]);
      // firstLine only: replaces the style's hanging, left stays
      assert.deepEqual(at({firstLine: 0}), [192, 240]);
      // neither: the style's indents as they are; and direct over it
      assert.deepEqual(at(undefined), [168, 192]);
      assert.deepEqual(at({}), [168, 192]);
      assert.deepEqual(at(undefined, {ind: {left: 720}}), [24, 48]);
      assert.deepEqual(at({left: 1440}, {ind: {hanging: 0}}),
        [96, 144]);
    });
  it('a paragraph with no label keeps its own indents', () => {
    const L = lay(docOf([newPara('ab')]));
    assert.equal(first(L).label, undefined);
    assert.equal(first(L).x, 0);
  });
});

describe('list display: the label and its suffix', () => {
  it('tab: the text at left when the label fits', () => {
    assert.equal(first(lay(docOf([li('ab')]))).x, 96);
  });
  it('tab: a label wider than the hanging space -> the next 48 px '
    + 'stop after it', () => {
    const L = lay(docOf([li('ab')], nums({lvlText: 'Article %1:'})));
    const ln = first(L);
    assert.equal(ln.label.w, 80);
    assert.equal(ln.label.x, 48);
    assert.equal(ln.x, 144);                 // ends at 128 -> 144
    const L2 = lay(docOf([li('ab')], nums({lvlText: 'Art %1.:'})));
    assert.equal(first(L2).x, 144);          // ends at 104 -> 144
    const L3 = lay(docOf([li('ab')], nums({lvlText: 'Art %1:'})));
    assert.equal(first(L3).x, 96);           // ends at 96: fits
  });
  it('space: one space width after the label', () => {
    const ln = first(lay(docOf([li('ab')], nums({suff: 'space'}))));
    assert.equal(ln.x, 48 + 16 + 8);
  });
  it('nothing: the text right after the label', () => {
    const ln = first(lay(docOf([li('ab')], nums({suff: 'nothing'}))));
    assert.equal(ln.x, 64);
    assert.equal(textX(ln), 64);
  });
  it('lvlJc right and center place the label in the hanging space',
    () => {
      const r = first(lay(docOf([li('ab')], nums({lvlJc: 'right'}))));
      assert.equal(r.label.x, 80);
      assert.equal(r.x, 96);
      const c = first(lay(docOf([li('ab')], nums({lvlJc: 'center'}))));
      assert.equal(c.label.x, 64);
      // wider than the space: from its start, the text pushed on
      const w = first(lay(docOf([li('ab')], nums({lvlJc: 'right',
        lvlText: 'Article %1:'}))));
      assert.equal(w.label.x, 48);
      assert.equal(w.x, 144);
    });
  it('numFmt none: no label text, the text still at the indent', () => {
    const ln = first(lay(docOf([li('ab')], nums({numFmt: 'none'}))));
    assert.equal(ln.label.text, '');
    assert.equal(ln.x, 96);
  });
});

describe('list display: alignment, justification, wrapping', () => {
  const TEXT = 'word '.repeat(40).trim();
  it('centred and right-aligned: label and text move together', () => {
    for (const jc of ['center', 'right']) {
      const L = lay(docOf([li('ab', 0, {pPr: {jc}})]));
      const ln = first(L), room = L.textW - 112;
      const dx = jc === 'center' ? room / 2 : room;
      assert.ok(Math.abs(ln.label.x - (48 + dx)) < 1e-9, jc);
      assert.ok(Math.abs(textX(ln) - ln.label.x - 48) < 1e-9, jc);
      assert.equal(ln.x, textX(ln));
    }
  });
  it('an empty right-aligned list paragraph: the caret at the right',
    () => {
      const L = lay(docOf([li('', 0, {pPr: {jc: 'right'}})]));
      const ln = first(L);
      assert.ok(Math.abs(ln.x - L.textW) < 1e-9);
      assert.ok(Math.abs(ln.label.x - (L.textW - 48)) < 1e-9);
    });
  it('justified: the text spreads, the label is not stretched', () => {
    const L = lay(docOf([li(TEXT, 0, {pPr: {jc: 'both'}})]));
    const it0 = L.items[0], ln = it0.lines[0];
    assert.ok(it0.lines.length > 1);
    assert.equal(ln.label.x, 48);
    assert.equal(ln.label.w, 16);
    assert.equal(textX(ln), 96);
    const vis = ln.items.filter((x) => /\S/.test(x.text));
    const end = vis.at(-1).x + vis.at(-1).w;
    assert.ok(Math.abs(end - L.textW) < 1e-6, String(end));
    check(it0);
  });
  it('a wrapped list paragraph: later lines start at left', () => {
    const L = lay(docOf([li(TEXT)]));
    const {lines} = L.items[0];
    assert.ok(lines.length > 1);
    for (const ln of lines.slice(1)) {
      assert.equal(ln.x, 96);
      assert.equal(ln.items[0].x, 96);
    }
    check(L.items[0]);
  });
  it('an empty list paragraph still shows its label', () => {
    const L = lay(docOf([li('a'), li(''), li('b')]));
    const ln = first(L, 1);
    assert.equal(ln.label.text, '2.');
    assert.equal(ln.x, 96);
    const id = L.items[1].id;
    assert.equal(L.caretRect({id, off: 0}).x, L.left + 96);
    check(L.items[1]);
  });
});

describe('list display: the label\'s format', () => {
  it('from the level\'s rPr: bold, colour, size; the line grows', () => {
    const L = lay(docOf([li('ab')], nums({rPr: {b: true,
      color: 'FF0000', sz: 40, extra: []}})));
    const ln = first(L);
    assert.equal(ln.label.f.bold, true);
    assert.equal(ln.label.f.colour, '#FF0000');
    assert.equal(ln.label.w, 18);
    assert.ok(ln.label.f.px > 26 && ln.h >= ln.label.f.px * 1.25);
  });
  it('a large label on an EMPTY list paragraph: the line holds it',
    () => {
      const L = lay(docOf([li('')], nums({rPr: {sz: 80, extra: []}})));
      const ln = first(L);
      assert.ok(ln.label.f.px > 53, String(ln.label.f.px));
      assert.ok(ln.h >= ln.label.f.px * 1.25 - 1e-9, String(ln.h));
      assert.ok(ln.base > ln.label.f.px * 0.9);
    });
  it('else the paragraph\'s first run; the level\'s over it', () => {
    const run = {i: true, color: '00FF00', u: 'single', extra: []};
    const a = first(lay(docOf([li('ab', 0, {rPr: run})])));
    assert.equal(a.label.f.italic, true);
    assert.equal(a.label.f.colour, '#00FF00');
    assert.equal(a.label.f.under, false, 'not the run\'s underline');
    const b = first(lay(docOf([li('ab', 0, {rPr: run})],
      nums({rPr: {color: 'FF0000', extra: []}}))));
    assert.equal(b.label.f.italic, true);
    assert.equal(b.label.f.colour, '#FF0000');
  });
  it('a bullet: the glyph in the paragraph font, DejaVu Sans after',
    () => {
      const L = lay(docOf([li('ab')], nums({numFmt: 'bullet',
        lvlText: '', rPr: {rFonts: {ascii: 'Symbol',
          hAnsi: 'Symbol'}, extra: []}})));
      const lb = first(L).label;
      assert.equal(lb.text, '•');
      assert.equal(lb.bullet, true);
      assert.ok(!lb.f.css.includes('Symbol'), lb.f.css);
      assert.ok(/"DejaVu Sans", sans-serif$/.test(lb.f.css), lb.f.css);
      assert.ok(lb.f.css.startsWith('14.67px "Carlito"'), lb.f.css);
    });
});

describe('list display: caret, clicks and selection', () => {
  const doc = () => docOf([li('alpha beta'), li('gamma'), li('')]);
  it('the caret at offset 0 is at the text, not the label', () => {
    const L = lay(doc());
    for (const it of L.items) {
      assert.equal(L.caretRect({id: it.id, off: 0}).x, L.left + 96);
      check(it);
    }
  });
  it('a click on the label, or left of it, gives offset 0', () => {
    const L = lay(doc());
    for (const it of L.items) {
      const ln = it.lines[0], y = it.y + ln.y + ln.h / 2;
      for (const x of [ln.label.x + 2, ln.label.x + ln.label.w - 1,
        0, ln.x - 1]) {
        const h = L.hitTest(L.left + x, y);
        assert.deepEqual(h.pos, {id: it.id, off: 0}, 'x ' + x);
      }
    }
  });
  it('selection rectangles start at the text', () => {
    const L = lay(doc());
    const a = {id: L.items[0].id, off: 0};
    const b = {id: L.items[2].id, off: 0};
    const rs = L.selectionRects(S.select(a, b));
    for (const it of L.items.slice(0, 2)) {
      const r = rs.find((q) => q.y === it.y + it.lines[0].y);
      assert.equal(r.x, L.left + 96);
    }
    assert.ok(rs.every((r) => r.x >= L.left + 96));
  });
  it('a toolbar inset moves everything down, nothing else', () => {
    const a = lay(doc()), b = lay(doc(), 800, {top: 50});
    for (let i = 0; i < a.items.length; i++) {
      assert.ok(Math.abs(b.items[i].y - a.items[i].y - 50) < 1e-9);
      assert.equal(JSON.stringify(b.items[i].lines),
        JSON.stringify(a.items[i].lines));
    }
  });
});

describe('list display: layoutPara and reuse', () => {
  it('layoutPara takes the label; without one, as before', () => {
    const d = docOf([li('ab')]);
    const lab = labels(d).get(d.sections[0].blocks[0].id);
    const p = d.sections[0].blocks[0];
    const l = layoutPara(p, styles, 400, tm(), new Map(), lab);
    assert.equal(l.lines[0].label.text, '1.');
    const n = layoutPara(p, styles, 400, tm(), new Map());
    assert.equal(n.lines[0].label, undefined);
    assert.equal(n.lines[0].x, 0);
  });
  it('a paragraph whose label changes is laid out again', () => {
    const d = mk(['one', 'two', 'three'].map((t) => [t,
      {pPr: {numPr: {numId: 1, ilvl: 0}}}]));
    d.doc.numbering = {raw: null, nums: nums()};
    const t = new Typing(d);
    const m = tm();
    const L = new DocLayout(d.doc, m);
    L.layout(800);
    const last = blocks(d)[2];
    assert.equal(L.byId.get(last.id).lines[0].label.text, '3.');
    const end = {id: blocks(d)[0].id, off: 3};
    t.command(() => E.splitPara(d, S.caret(end)));
    assert.equal(blocks(d)[3], last, 'the same paragraph object');
    const L2 = new DocLayout(d.doc, m, L);
    L2.layout(800);
    assert.equal(L2.byId.get(last.id).lines[0].label.text, '4.');
    // an unchanged label keeps the lines
    const L3 = new DocLayout(d.doc, m, L2);
    L3.layout(800);
    assert.equal(L3.byId.get(last.id).lines, L2.byId.get(last.id).lines);
  });
  it('a level change elsewhere relays out the followers', () => {
    const d = mk(['a', 'b', 'c'].map((t) => [t,
      {pPr: {numPr: {numId: 1, ilvl: 0}}}]));
    d.doc.numbering = {raw: null, nums: nums()};
    const m = tm();
    const L = new DocLayout(d.doc, m);
    L.layout(800);
    d.atomic(() => d.apply({op: 'setProps', block: [0, 1],
      pPr: {numPr: {numId: 1, ilvl: 1}}}));
    const L2 = new DocLayout(d.doc, m, L);
    L2.layout(800);
    const c = blocks(d)[2];
    assert.equal(L2.byId.get(c.id).lines[0].label.text, '2.');
    assert.equal(L2.byId.get(blocks(d)[1].id).lines[0].label.x,
      144);
  });
  it('50,000 list paragraphs: laid out, then again after an edit',
    () => {
      const ps = [];
      for (let i = 0; i < 50000; i++) ps.push(li('item ' + i, i % 3));
      const d = docOf(ps);
      const m = tm();
      let t0 = performance.now();
      const L = new DocLayout(d, m);
      L.layout(800);
      const full = performance.now() - t0;
      t0 = performance.now();
      const L2 = new DocLayout(d, m, L);
      L2.layout(800);
      const again = performance.now() - t0;
      assert.equal(L2.items[49999].lines, L.items[49999].lines);
      assert.ok(full < 4000, `full ${full} ms`);
      assert.ok(again < 1000, `again ${again} ms`);
    });
});
