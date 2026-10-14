// Field codes and field shading (Batch D P8.4, D18; R2): View > Field
// codes shows `{ CODE }` in place of a field (one token, display
// only: the model unchanged), headers and footers too; View > Field
// shading paints #d8d8d8 behind a field's result never, when the
// selection is in the field (the default) or always; Shift+F9 is the
// key of Field codes and F9 stays Redo.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley, boxesOf}
  from '../../tools/moreapps/!Letters/PageHF';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPara} from '../../tools/moreapps/!Letters/ItemPaint';
import {codesIn, codeAt, inCode, MAX_CODE}
  from '../../tools/moreapps/!Letters/FieldCodes';
import {shadeOf, modeOf, MODES, DEFAULT, SHADE}
  from '../../tools/moreapps/!Letters/FieldShade';
import {keymap, WINDOW} from '../../tools/moreapps/!Letters/Keymap';
import {keyCode} from '../../src/core/input.js';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, fldSimple, begin, end, sep, instr, docWithFields}
  from './field-fixtures.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 11, 14, 5);
const F1 = 'word/footer1.xml';
const BR = '<w:r><w:br w:type="page"/></w:r>';
const breaks = (n) => Array.from({length: n},
  (_, i) => p(r('page ' + i) + BR)).join('');
const lineTexts = (L) => L.items.flatMap((it) => (it.lines || [])
  .map((l) => l.items.map((x) => x.text).join('|')));
const fieldItems = (L) => L.items.flatMap((it) => (it.lines || [])
  .flatMap((l) => l.items.filter((x) => x.field)));
const laid = (doc, fields) => {
  const L = new DocLayout(doc, tm(), null, {fields});
  L.layout(800);
  return L;
};
const para = (doc, k = 0) => doc.sections[0].blocks[k];

describe('FieldCodes: the code shown for a field (D18)', () => {
  it('a PAGE field: { PAGE }, the whole field one range', async () => {
    const doc = await docWithFields(p(r('Page ') + fld(' PAGE ', '1') +
      r(' here')));
    const [c] = codesIn(doc, para(doc));
    assert.equal(c.text, '{ PAGE }');
    assert.equal(c.from, c.b);
    assert.equal(c.to, c.e + 1);
    assert.equal(para(doc).text[c.b], '￼');
    assert.equal(codeAt(doc, para(doc), c.b), c);
    assert.equal(codeAt(doc, para(doc), c.b + 1), null);
    assert.ok(inCode(doc, para(doc), c.e));
    assert.ok(!inCode(doc, para(doc), c.e + 1));
  });

  it('nested: the inner field as its own code, its result left out',
    async () => {
      const doc = await docWithFields(p(fld(' IF {} = 1 "a" "b" ', 'b',
        {nested: fld(' PAGE ', '1')})));
      const cs = codesIn(doc, para(doc));
      assert.equal(cs.length, 1, 'the outer field only');
      assert.equal(cs[0].text, '{ IF { PAGE } = 1 "a" "b" }');
    });

  it('a fldSimple, an unknown field, a field with no result',
    async () => {
      const doc = await docWithFields(p(fldSimple(' NUMPAGES ', '3') +
        r(' and ') + fld(' REF bm \\h ', 'x') + fld(' TC "t" ', null)));
      const cs = codesIn(doc, para(doc));
      assert.deepEqual(cs.map((c) => c.text),
        ['{ NUMPAGES }', '{ REF bm \\h }', '{ TC "t" }']);
      assert.equal(cs[0].to, cs[0].from + 1);
    });

  it('a field spanning paragraphs shows as without the codes',
    async () => {
      const doc = await docWithFields(p(begin() + instr(' PAGE ') +
        sep() + r('1')) + p(r('2') + end()));
      assert.equal(codesIn(doc, para(doc, 0)).length, 0);
      assert.equal(codesIn(doc, para(doc, 1)).length, 0);
    });

  it('a code longer than MAX_CODE is cut', async () => {
    const doc = await docWithFields(p(fld(' QUOTE "' +
      'x'.repeat(MAX_CODE * 2) + '" ', 'x')));
    const [c] = codesIn(doc, para(doc));
    assert.ok(c.text.length <= MAX_CODE + 5);
    assert.ok(c.text.endsWith('...}'));
  });

  it('hostile: no doc, no paragraph, absurd values', () => {
    for (const v of [null, undefined, 0, -1, 1e9, NaN, '__proto__', {}]) {
      assert.deepEqual(codesIn(v, v), []);
      assert.equal(codeAt({}, v, 0), null);
    }
  });
});

describe('Field codes in a layout (D18: display only)', () => {
  it('Draft: { PAGE } one token in place of the result; model kept',
    async () => {
      const doc = await docWithFields(p(r('Page ') + fld(' PAGE ', '1') +
        r(' here')));
      const text = para(doc).text;
      const L = laid(doc, {now: NOW, codes: true});
      const [x] = fieldItems(L);
      assert.equal(x.text, '{ PAGE }');
      assert.equal(x.from, x.field.b);
      assert.equal(x.to, x.field.e + 1);
      assert.ok(!lineTexts(L)[0].includes('|1|'));
      assert.equal(para(doc).text, text);
      const N = laid(doc, {now: NOW});
      assert.equal(fieldItems(N)[0].text, '1', 'without: the result');
    });

  it('an unknown field shows its code too, as one token', async () => {
    const doc = await docWithFields(p(fld(' REF bm ', 'text of bm')));
    const L = laid(doc, {now: NOW, codes: true});
    assert.equal(lineTexts(L)[0], '{ REF bm }');
    assert.equal(fieldItems(L).length, 1);
  });

  it('a footer PAGE shows { PAGE } on every page in Print layout',
    async () => {
      const doc = await docWithFields(breaks(2),
        {default: {ftr: p(r('Page ') + fld(' PAGE ', '1'))}});
      const foot = (codes) => {
        const L = laid(doc, {now: NOW, codes});
        const P = new Pages(printGalley(L));
        L.place = PlacePrint(L, P);
        P.finish();
        return Array.from({length: P.count}, (_, i) => lineTexts(
          boxesOf(P.G, P.at(i), P).find((y) => y.kind === 'ftr').lay.L)
          .join('/'));
      };
      const before = foot(false);
      assert.ok(before.every((t) => !t.includes('{')), 'results first');
      const codes = foot(true);
      assert.ok(codes.every((t) => t.includes('{ PAGE }')), codes);
      assert.ok(foot(false).every((t, i) => t === before[i]), 'back');
      assert.ok(doc.stories.get(F1).blocks[0].text.includes('1'));
    });
});

describe('FieldShade: the ranges shaded (D18)', () => {
  const ctx = async (mode, codes) => {
    const doc = await docWithFields(p(r('Page ') + fld(' PAGE ', '1') +
      r(' here ') + fldSimple(' NUMPAGES ', '3')));
    const shade = {mode, sel: null};
    const L = laid(doc, {now: NOW, codes, shade});
    return {doc, L, P: para(doc), shade};
  };
  const caret = (P, off) => ({anchor: {id: P.id, off},
    head: {id: P.id, off}});

  it('modes: never, selected (default), always; anything else default',
    () => {
      assert.deepEqual(MODES, ['never', 'selected', 'always']);
      assert.equal(DEFAULT, 'selected');
      assert.equal(SHADE, '#d8d8d8');
      for (const v of [undefined, null, '', 'Always', '__proto__', 1e9,
        -1, NaN, {}]) assert.equal(modeOf(v), 'selected');
      for (const m of MODES) assert.equal(modeOf(m), m);
    });

  it('always: every result; never: none', async () => {
    const a = await ctx('always');
    const rs = shadeOf(a.L, a.P);
    assert.equal(rs.length, 2);
    assert.equal(a.P.text.slice(rs[0].from, rs[0].to), '1');
    const n = await ctx('never');
    assert.deepEqual(shadeOf(n.L, n.P), []);
  });

  it('selected: only a field the caret is at or in', async () => {
    const s = await ctx('selected');
    assert.deepEqual(shadeOf(s.L, s.P), [], 'no selection');
    s.shade.sel = caret(s.P, 1);
    assert.deepEqual(shadeOf(s.L, s.P), [], 'the caret elsewhere');
    const [pg] = shadeOf({...s.L, fields: {shade: {mode: 'always'}}},
      s.P);
    s.shade.sel = caret(s.P, pg.e + 1);
    assert.deepEqual(shadeOf(s.L, s.P).map((x) => x.from), [pg.from]);
    s.shade.sel = caret(s.P, pg.b);
    assert.equal(shadeOf(s.L, s.P).length, 1, 'just before it');
    s.shade.sel = {anchor: {id: s.P.id, off: 0},
      head: {id: s.P.id, off: s.P.text.length}};
    assert.equal(shadeOf(s.L, s.P).length, 2, 'a range over both');
    s.shade.sel = caret({id: -5}, pg.b);
    assert.deepEqual(shadeOf(s.L, s.P), [], 'another paragraph');
  });

  it('with the codes shown: the whole field is shaded', async () => {
    const a = await ctx('always', true);
    const rs = shadeOf(a.L, a.P);
    assert.equal(rs.length, 2);
    assert.equal(rs[0].from, rs[0].b);
    assert.equal(rs[0].to, rs[0].e + 1);
  });

  it('a paragraph without fields: none, no field code run', async () => {
    const doc = await docWithFields(p(r('plain')));
    const L = laid(doc, {shade: {mode: 'always'}});
    assert.deepEqual(shadeOf(L, para(doc)), []);
    assert.deepEqual(shadeOf(null, null), []);
  });
});

describe('ItemPaint draws the shading (D18)', () => {
  /** The fill rectangles painted for paragraph item 0 of L. */
  const fills = (L) => {
    const got = [];
    const g = {fillStyle: '', font: '', save() {}, restore() {},
      beginPath() {}, rect() {}, clip() {}, strokeRect() {},
      fillText() {}, measureText: () => ({width: 5}),
      fillRect(x, y, w, h) { got.push([this.fillStyle, x, w]); }};
    paintPara(L, g, L.items[0], {x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4});
    return got.filter(([c]) => c === SHADE);
  };
  const doc = () => docWithFields(p(r('Page ') + fld(' PAGE ', '1') +
    r(' here')));

  it('always: one #d8d8d8 box the width of the result', async () => {
    const d = await doc();
    const L = laid(d, {now: NOW, shade: {mode: 'always'}});
    const [x] = fieldItems(L);
    const f = fills(L);
    assert.equal(f.length, 1);
    assert.ok(Math.abs(f[0][2] - x.w) <= 2, JSON.stringify([f, x.w]));
  });

  it('never, or selected with the caret elsewhere: none', async () => {
    const d = await doc();
    assert.equal(fills(laid(d, {now: NOW, shade: {mode: 'never'}}))
      .length, 0);
    assert.equal(fills(laid(d, {now: NOW, shade: {mode: 'selected',
      sel: {anchor: {id: para(d).id, off: 0},
        head: {id: para(d).id, off: 0}}}})).length, 0);
  });
});

describe('Keys: Shift+F9 Field codes, F9 still Redo (R2)', () => {
  const ev = (key, shift) => {
    const k = keyCode({key, shiftKey: shift, ctrlKey: false,
      altKey: false});
    return {code: k.code, key, shift, ctrl: false, alt: false};
  };
  it('Shift+F9 -> fieldCodes (by name and by code 0x199)', () => {
    assert.equal(ev('F9', true).code, 0x199);
    assert.equal(keymap.lookup(ev('F9', true)), 'fieldCodes');
    assert.equal(keymap.lookup({code: 0x199}), 'fieldCodes');
    assert.equal(keymap.labelFor('fieldCodes'), 'Shift+F9');
    assert.ok(WINDOW.has('fieldCodes'));
  });
  it('F9 is still Redo; Ctrl+F9 has no row', () => {
    assert.equal(keymap.lookup(ev('F9', false)), 'redo');
    assert.equal(keymap.lookup({code: 0x1A9}), null);
  });
});
