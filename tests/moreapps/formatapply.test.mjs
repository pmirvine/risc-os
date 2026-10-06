// FormatApply: the formatting command ids of the keys, the Format
// menu and the toolbar, mapped onto FormatSet; the colour table; the
// font, size, highlight and style lists the menu shows.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as F from '../../tools/moreapps/!Word/Format';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {EMPTY} from '../../tools/moreapps/!Word/Pending';
import {keymap} from '../../tools/moreapps/!Word/Keymap';
import {WIMP_COLOURS} from '../../src/core/palette.js';
import {mk, P, C, SEL, undoable, bold, plain} from './edit-docs.mjs';

const T = (d) => new Typing(d);
const all = (d) => SEL(d, 0, 0, 0, P(d, 0).text.length);
/** Run id over sel: one undo step at most, undo exact. */
const go = (d, id, sel, arg, pending) =>
  undoable(d, () => FA.apply(id, d, T(d), sel, arg, pending));

describe('FormatApply.PALETTE', () => {
  it('is the desktop\'s Wimp palette, as RRGGBB', () => {
    assert.equal(FA.PALETTE.length, 16);
    assert.deepEqual([...FA.PALETTE],
      WIMP_COLOURS.map((c) => c.slice(1).toUpperCase()));
    assert.deepEqual([...FA.PALETTE], ['FFFFFF', 'DDDDDD', 'BBBBBB',
      '999999', '777777', '555555', '333333', '000000', '004499',
      'EEEE00', '00CC00', 'DD0000', 'EEEEBB', '558800', 'FFBB00',
      '00BBFF']);
    assert.ok(Object.isFrozen(FA.PALETTE));
  });
  it('colourValue: palette numbers, auto, RRGGBB; others refused', () => {
    assert.equal(FA.colourValue(11), 'DD0000');
    assert.equal(FA.colourValue(0), 'FFFFFF');
    assert.equal(FA.colourValue('auto'), 'auto');
    assert.equal(FA.colourValue('ff0000'), 'FF0000');
    for (const bad of [16, -1, 1.5, '#ff0000', 'red', null, {}, NaN])
      assert.throws(() => FA.colourValue(bad), RangeError);
  });
});

describe('FormatApply.apply', () => {
  it('every Format row of the Keymap is a format id', () => {
    const ids = ['bold', 'italic', 'underline', 'alignLeft',
      'alignCenter', 'alignRight', 'alignJustify', 'clearFormat',
      'superscript', 'subscript', 'fontBigger', 'fontSmaller',
      'indentMore', 'indentLess'];
    for (const id of ids) {
      assert.equal(keymap.row(id).menu, 'Format', id);
      assert.ok(FA.isFormat(id), id);
    }
    for (const id of ['strike', 'size', 'font', 'color', 'highlight',
      'align', 'style']) assert.ok(FA.isFormat(id), id);
    for (const id of ['undo', 'enter', 'selectAll', 'toString',
      '__proto__', 'constructor', '', null, undefined])
      assert.equal(FA.isFormat(id), false, String(id));
  });
  it('an id that is not a format: undefined, nothing changed', () => {
    const d = mk(['abc']);
    assert.equal(FA.apply('enter', d, T(d), all(d)), undefined);
    assert.equal(FA.apply('toString', d, T(d), all(d)), undefined);
    assert.equal(d.undoDepth, 0);
  });
  it('toggles over a selection: one step each, pending EMPTY', () => {
    const d = mk(['abc']);
    const sel = all(d);
    for (const [id, q, v] of [['bold', 'bold', true],
      ['italic', 'italic', true], ['underline', 'underline', true],
      ['strike', 'strike', true], ['superscript', 'vert', 'superscript'],
      ['subscript', 'vert', 'subscript']]) {
      const out = go(d, id, sel);
      assert.equal(out.sel, sel);
      assert.equal(out.pending, EMPTY);
      assert.equal(F.query(d.doc, sel)[q], v, id);
    }
    assert.equal(d.undoDepth, 6);
    go(d, 'bold', sel);
    assert.equal(F.query(d.doc, sel).bold, false);
  });
  it('a caret: a toggle gives a pending format, no change', () => {
    const d = mk(['abc']);
    const out = FA.apply('bold', d, T(d), C(d, 0, 1), undefined, EMPTY);
    assert.deepEqual(out.pending, {b: true});
    assert.equal(d.undoDepth, 0);
    const back = FA.apply('bold', d, T(d), C(d, 0, 1), undefined,
      out.pending);
    assert.deepEqual(back.pending, {});
  });
  it('alignment ids set jc; align takes the value', () => {
    const d = mk(['abc']);
    const at = C(d, 0, 1);
    for (const [id, v] of [['alignCenter', 'center'],
      ['alignRight', 'right'], ['alignJustify', 'both'],
      ['alignLeft', 'left']]) {
      go(d, id, at);
      assert.equal(F.query(d.doc, at).align, v, id);
    }
    go(d, 'align', at, 'right');
    assert.equal(P(d, 0).pPr.jc, 'right');
    assert.throws(() => FA.apply('align', d, T(d), at, 'middle'),
      RangeError);
  });
  it('size (points), font, color, highlight', () => {
    const d = mk(['abc']);
    const sel = all(d);
    go(d, 'size', sel, 24);
    assert.equal(P(d, 0).runs[0].rPr.sz, 48);
    go(d, 'size', sel, 10.5);
    assert.equal(P(d, 0).runs[0].rPr.sz, 21);
    go(d, 'font', sel, 'Arial');
    assert.deepEqual(P(d, 0).runs[0].rPr.rFonts,
      {ascii: 'Arial', hAnsi: 'Arial'});
    go(d, 'color', sel, 11);
    assert.equal(P(d, 0).runs[0].rPr.color, 'DD0000');
    go(d, 'color', sel, '00ff00');
    assert.equal(P(d, 0).runs[0].rPr.color, '00FF00');
    go(d, 'color', sel, 'auto');
    assert.equal(P(d, 0).runs[0].rPr.color, undefined);
    go(d, 'highlight', sel, 'yellow');
    assert.equal(P(d, 0).runs[0].rPr.highlight, 'yellow');
    go(d, 'highlight', sel, 'none');
    assert.equal(F.query(d.doc, sel).highlight, 'none');
    for (const [id, bad] of [['size', 'big'], ['size', NaN],
      ['font', ''], ['color', 'red'], ['highlight', 'puce']])
      assert.throws(() => FA.apply(id, d, T(d), sel, bad), RangeError,
        id);
  });
  it('fontBigger/fontSmaller step the size; indents by 720', () => {
    const d = mk(['abc']);
    const sel = all(d);
    go(d, 'fontBigger', sel);
    assert.equal(F.query(d.doc, sel).size, 12);
    go(d, 'fontBigger', sel);
    assert.equal(F.query(d.doc, sel).size, 14);
    go(d, 'fontSmaller', sel);
    assert.equal(F.query(d.doc, sel).size, 12);
    go(d, 'indentMore', sel);
    assert.equal(F.query(d.doc, sel).indentLeft, 720);
    go(d, 'indentLess', sel);
    assert.equal(F.query(d.doc, sel).indentLeft, 0);
  });
  it('style applies a paragraph style; clearFormat clears runs', () => {
    const d = mk([['abc', {runs: [{start: 0, end: 3, rPr: bold}]}]]);
    const sel = all(d);
    go(d, 'style', sel, 'Heading1');
    assert.equal(P(d, 0).pStyle, 'Heading1');
    assert.equal(F.query(d.doc, sel).style, 'Heading1');
    go(d, 'clearFormat', sel);
    assert.deepEqual(P(d, 0).runs[0].rPr, plain);
    assert.throws(() => FA.apply('style', d, T(d), sel, 'Nope'),
      RangeError);
  });
});

describe('FormatApply lists', () => {
  it('SIZES: Word\'s list', () => {
    assert.deepEqual([...FA.SIZES], [8, 9, 10, 11, 12, 14, 16, 18, 20,
      22, 24, 26, 28, 36, 48, 72]);
  });
  it('fontList: document, Word, desktop; no repeats (any case)', () => {
    const l = FA.fontList(['Cambria', 'Georgia'],
      ['Homerton', 'Trinity', 'georgia']);
    assert.deepEqual(l.doc, ['Cambria', 'Georgia']);
    assert.deepEqual(l.word, ['Calibri', 'Arial', 'Times New Roman',
      'Courier New']);
    assert.deepEqual(l.desktop, ['Homerton', 'Trinity']);
    const e = FA.fontList(null, undefined);
    assert.equal(e.doc.length, 0);
    assert.equal(e.word.length, 5);
    assert.equal(e.desktop.length, 0);
  });
  it('HIGHLIGHTS: none and Word\'s 16 names, with labels', () => {
    assert.equal(FA.HIGHLIGHTS.length, 17);
    assert.deepEqual(FA.HIGHLIGHTS[0], ['none', 'None']);
    assert.deepEqual(FA.HIGHLIGHTS[1], ['yellow', 'Yellow']);
    assert.ok(FA.HIGHLIGHTS.some(([k, t]) => k === 'darkBlue' &&
      t === 'Dark blue'));
  });
  it('paraStyles: the shown paragraph styles by name', () => {
    const d = mk(['abc']);
    const l = FA.paraStyles(d.doc.styles);
    assert.ok(l.length > 0);
    assert.ok(l.some((s) => s.id === 'Heading1' &&
      /^heading 1$/i.test(s.name)));
    assert.ok(l.every((s) => d.doc.styles.styles.get(s.id).type ===
      'paragraph'));
    const names = l.map((s) => s.name.toLowerCase());
    assert.deepEqual(names, [...names].sort());
    assert.deepEqual(FA.paraStyles(null), []);
  });
});
