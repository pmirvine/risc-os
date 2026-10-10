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
import {write} from './roundtrip-lib.mjs';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {setPara} from '../../tools/moreapps/!Word/FormatSet';

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
      'indentMore', 'indentLess', 'lineSingle', 'lineDouble', 'line15',
      'spaceBefore12'];
    for (const id of ids) {
      assert.equal(keymap.row(id).menu, 'Format', id);
      assert.ok(FA.isFormat(id), id);
    }
    for (const id of ['strike', 'size', 'font', 'color', 'highlight',
      'align', 'style', 'lineSpacing', 'spaceBefore', 'spaceAfter'])
      assert.ok(FA.isFormat(id), id);
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

describe('FormatApply line spacing and space before / after', () => {
  const sp = (d, k = 0) => P(d, k).pPr.spacing;
  const q = (d, sel) => F.query(d.doc, sel);
  it('LINE_FACTORS: Word\'s six, as 240ths 240..720', () => {
    assert.deepEqual([...FA.LINE_FACTORS], [1, 1.15, 1.5, 2, 2.5, 3]);
    assert.ok(Object.isFrozen(FA.LINE_FACTORS));
    const d = mk(['abc']);
    const at = C(d, 0, 1);
    const want = [240, 276, 360, 480, 600, 720];
    FA.LINE_FACTORS.forEach((f, i) => {
      go(d, 'lineSpacing', at, f);
      assert.deepEqual(q(d, at).lineSpacing, {line: want[i],
        rule: 'auto'}, String(f));
      // line and lineRule always written together
      assert.deepEqual(sp(d), {line: want[i], lineRule: 'auto'});
    });
  });
  it('the keys\' ids: single, double, 1.5', () => {
    const d = mk(['a', 'b']);
    const sel = SEL(d, 0, 0, 1, 1);
    for (const [id, line] of [['lineDouble', 480], ['line15', 360],
      ['lineSingle', 240]]) {
      go(d, id, sel);
      assert.deepEqual(q(d, sel).lineSpacing, {line, rule: 'auto'});
      assert.equal(sp(d, 1).line, line);
    }
  });
  it('{line, lineRule}: exact and at least, clamped; refused', () => {
    const d = mk(['abc']);
    const at = C(d, 0, 0);
    go(d, 'lineSpacing', at, {line: 300, lineRule: 'exact'});
    assert.deepEqual(sp(d), {line: 300, lineRule: 'exact'});
    go(d, 'lineSpacing', at, {line: 1e9, lineRule: 'atLeast'});
    assert.deepEqual(sp(d), {line: 31680, lineRule: 'atLeast'});
    // the style's line with another rule: both written
    go(d, 'lineSpacing', at, {line: 259, lineRule: 'exact'});
    assert.deepEqual(sp(d), {line: 259, lineRule: 'exact'});
    go(d, 'lineSpacing', at, {line: 0, lineRule: 'exact'});
    assert.deepEqual(sp(d), {line: 0, lineRule: 'exact'});
    // back to auto: the rule is written with the line
    go(d, 'lineSpacing', at, {line: 259});
    assert.deepEqual(q(d, at).lineSpacing, {line: 259, rule: 'auto'});
    const n = d.undoDepth;
    for (const bad of [7, 0, -1, NaN, '2', null, {}, {line: '2'},
      {line: 240, lineRule: 'multiple'}, {line: 240, x: 1}])
      assert.throws(() => FA.apply('lineSpacing', d, T(d), at, bad),
        RangeError, JSON.stringify(bad));
    assert.equal(d.undoDepth, n);
  });
  it('spaceBefore / spaceAfter: twips; null back to the style', () => {
    const d = mk(['abc']);
    const at = C(d, 0, 0);
    go(d, 'spaceBefore', at, 240);
    go(d, 'spaceAfter', at, 0);
    assert.equal(q(d, at).spaceBefore, 240);
    assert.equal(q(d, at).spaceAfter, 0);
    go(d, 'spaceAfter', at, null);
    assert.equal(q(d, at).spaceAfter, 160);
    go(d, 'spaceBefore', at, 0);
    assert.equal(sp(d), undefined);
    for (const [id, bad] of [['spaceBefore', '12'],
      ['spaceAfter', NaN], ['spaceBefore', {}]])
      assert.throws(() => FA.apply(id, d, T(d), at, bad), RangeError);
  });
  it('spaceBefore12 (Ctrl+0): 0 <-> 12 pt; mixed goes to 0', () => {
    const d = mk(['a', 'b']);
    const sel = SEL(d, 0, 0, 1, 1);
    go(d, 'spaceBefore12', sel);
    assert.equal(q(d, sel).spaceBefore, 240);
    go(d, 'spaceBefore12', sel);
    assert.equal(q(d, sel).spaceBefore, 0);
    assert.equal(sp(d), undefined);
    go(d, 'spaceBefore', C(d, 0, 0), 120);
    go(d, 'spaceBefore12', sel);
    assert.equal(q(d, sel).spaceBefore, 0, 'mixed: off');
    // a caret: its paragraph
    go(d, 'spaceBefore12', C(d, 1, 0));
    assert.equal(P(d, 1).pPr.spacing.before, 240);
    assert.equal(P(d, 0).pPr.spacing, undefined);
  });
  it('a command that changes nothing makes no undo step', () => {
    const d = mk(['abc']);
    const at = C(d, 0, 0);
    go(d, 'lineSpacing', at, {line: 259});
    go(d, 'spaceBefore', at, 0);
    assert.equal(d.undoDepth, 0);
    go(d, 'lineDouble', at);
    const n = d.undoDepth;
    go(d, 'lineDouble', at);
    assert.equal(d.undoDepth, n);
  });
  it('the style\'s rule is never relied on: style exact 300, set ' +
    'exact 400 writes both', () => {
    const d = mk([['abc', {pStyle: 'Exact'}]]);
    d.doc.styles.styles.set('Exact', {id: 'Exact', type: 'paragraph',
      name: 'Exact', basedOn: 'Normal', pPr: {spacing: {line: 300,
        lineRule: 'exact'}, extra: []}, rPr: {extra: []}, extra: [],
      raw: null});
    const at = C(d, 0, 0);
    go(d, 'lineSpacing', at, {line: 400, lineRule: 'exact'});
    assert.deepEqual(sp(d), {line: 400, lineRule: 'exact'});
    // the style's own value: nothing written
    go(d, 'lineSpacing', at, {line: 300, lineRule: 'exact'});
    assert.equal(sp(d), undefined);
    // line given alone: written with the rule in force
    undoable(d, () => setPara(d, T(d), at, {spacing: {line: 360}}));
    assert.deepEqual(sp(d), {line: 360, lineRule: 'exact'});
  });
});

describe('FormatPara: a raw w:spacing patched in place', () => {
  const node = (attrs) => ({name: 'w:spacing', attrs, children: []});
  const AUTO = () => node([['w:before', '100'],
    ['w:beforeAutospacing', '1'], ['w:after', '100'],
    ['w:afterAutospacing', '1']]);
  const rawOf = (d, k = 0) => P(d, k).pPr.extra
    .filter((n) => n.name === 'w:spacing');
  const sp = (d, k = 0) => P(d, k).pPr.spacing;
  it('line spacing: before, after and their autospacing kept', () => {
    const r0 = AUTO();
    const d = mk([['abc', {pPr: {extra: [r0]}}]]);
    const at = C(d, 0, 0);
    // other commands leave it alone
    go(d, 'alignCenter', at);
    go(d, 'italic', SEL(d, 0, 0, 0, 3));
    FS_setFlag(d, {keepNext: true});
    assert.deepEqual(rawOf(d), [r0]);
    go(d, 'lineDouble', at);
    assert.deepEqual(rawOf(d)[0].attrs, [['w:before', '100'],
      ['w:beforeAutospacing', '1'], ['w:after', '100'],
      ['w:afterAutospacing', '1'], ['w:line', '480'],
      ['w:lineRule', 'auto']]);
    assert.equal(sp(d), undefined);
    // shown and queried: the line, and Auto (14 pt) before and after
    const q = F.query(d.doc, at);
    assert.deepEqual(q.lineSpacing, {line: 480, rule: 'auto'});
    assert.equal(q.spaceBefore, 280);
    // again: the same, no step
    const n = d.undoDepth;
    go(d, 'lineDouble', at);
    assert.equal(d.undoDepth, n);
    // and back to the style's line: line and lineRule removed
    go(d, 'lineSpacing', at, {line: 259});
    assert.deepEqual(rawOf(d), [r0]);
  });
  it('setting before drops beforeAutospacing and beforeLines only; ' +
    'all understood: the model field', () => {
    const d = mk([['abc', {pPr: {extra: [AUTO()]}}]]);
    const at = C(d, 0, 0);
    go(d, 'spaceBefore', at, 240);
    assert.deepEqual(rawOf(d)[0].attrs, [['w:before', '240'],
      ['w:after', '100'], ['w:afterAutospacing', '1']]);
    go(d, 'spaceAfter', at, 0);
    assert.deepEqual(rawOf(d), []);
    assert.deepEqual(sp(d), {before: 240, after: 0});
    const e = mk([['abc', {pPr: {extra: [node([['w:beforeLines', '100'],
      ['w:before', '120'], ['w:afterLines', '50']])]}}]]);
    go(e, 'spaceBefore', C(e, 0, 0), 0);
    assert.deepEqual(rawOf(e)[0].attrs, [['w:afterLines', '50']]);
    const f = mk([['abc', {pPr: {extra: [node([['w:beforeLines', '100']])]}}]]);
    go(f, 'spaceBefore12', C(f, 0, 0));
    assert.deepEqual(rawOf(f), []);
    assert.deepEqual(sp(f), {before: 240});
  });
  it('unknown attributes stay; another namespace stays raw', () => {
    const d = mk([['abc', {pPr: {extra: [node([['w:line', '240'],
      ['w14:foo', '1'], ['w:lineRule', 'exact']])]}}]]);
    go(d, 'lineDouble', C(d, 0, 0));
    assert.deepEqual(rawOf(d)[0].attrs, [['w:line', '480'],
      ['w14:foo', '1'], ['w:lineRule', 'auto']]);
    // removing the whole spacing (clear) still drops it
    undoable(d, () => setPara(d, T(d), C(d, 0, 0), {spacing: null}));
    assert.deepEqual(rawOf(d), []);
  });
  it('only WordprocessingML\'s spacing: another namespace\'s ' +
    'element or attributes never read, changed or converted', async () => {
    const X = 'urn:example:foreign';
    const foreign = {name: 'x:spacing', attrs: [['xmlns:x', X],
      ['x:before', '900'], ['x:line', '720']], children: []};
    // a w:spacing whose own xmlns:w is not WordprocessingML
    const rebound = {name: 'w:spacing', attrs: [['xmlns:w', X],
      ['w:before', '900']], children: []};
    for (const odd of [foreign, rebound]) {
      const keep = structuredClone(odd);
      const d = mk([['abc', {pPr: {extra: [odd]}}]]);
      const at = C(d, 0, 0);
      const q = F.query(d.doc, at);
      assert.equal(q.spaceBefore, 0, 'not displayed');
      assert.deepEqual(q.lineSpacing, {line: 259, rule: 'auto'});
      go(d, 'lineDouble', at);
      go(d, 'spaceBefore12', at);
      // the model field written; the foreign element kept as it was
      assert.deepEqual(sp(d), {before: 240, line: 480,
        lineRule: 'auto'});
      assert.deepEqual(P(d, 0).pPr.extra, [keep]);
      const bytes = await write(d.doc);
      const xml = new TextDecoder().decode((await readZip(bytes))
        .get('word/document.xml'));
      assert.ok(xml.includes(odd === foreign
        ? '<x:spacing xmlns:x="urn:example:foreign" x:before="900" x:line="720"/>'
        : '<w:spacing xmlns:w="urn:example:foreign" w:before="900"/>'),
      'written as it was');
    }
    // foreign attributes on a real w:spacing: not read, kept
    const d = mk([['abc', {pPr: {extra: [node([['w:after', '0'],
      ['w:afterAutospacing', '1'], ['x:before', '900'],
      ['xmlns:x', X]])]}}]]);
    assert.equal(F.query(d.doc, C(d, 0, 0)).spaceBefore, 0);
    go(d, 'spaceAfter', C(d, 0, 0), 120);
    assert.deepEqual(rawOf(d)[0].attrs, [['w:after', '120'],
      ['x:before', '900'], ['xmlns:x', X]]);
  });
  it('written and read back: the autospacing kept', async () => {
    const d = mk([['abc', {pPr: {extra: [AUTO()]}}]]);
    FA.apply('lineDouble', d, T(d), C(d, 0, 0));
    const bytes = await write(d.doc);
    const xml = new TextDecoder().decode((await readZip(bytes))
      .get('word/document.xml'));
    assert.match(xml, /<w:spacing w:before="100" w:beforeAutospacing="1" w:after="100" w:afterAutospacing="1" w:line="480" w:lineRule="auto"\/>/);
    const back = await readDocx(bytes);
    const n = back.sections[0].blocks[0].pPr.extra
      .find((x) => x.name === 'w:spacing');
    assert.deepEqual(n.attrs, rawOf(d)[0].attrs);
  });
});

const FS_setFlag = (d, patch) => undoable(d, () =>
  setPara(d, T(d), C(d, 0, 0), patch));

describe('FormatPara: the flow flags and spacing really written', () => {
  it('flags: written when they differ from the style, else removed',
    () => {
      const d = mk([['a', {pStyle: 'Heading1'}], 'b']);
      const sel = SEL(d, 0, 0, 1, 1);
      // Heading 1 has keepNext and keepLines already
      FS_setFlag(d, {keepNext: true});
      undoable(d, () => setPara(d, T(d), sel, {keepNext: true,
        contextualSpacing: true, widowControl: true,
        pageBreakBefore: true, keepLines: false}));
      const [h, b] = [P(d, 0).pPr, P(d, 1).pPr];
      assert.equal(h.keepNext, undefined, 'the style gives it');
      assert.equal(h.keepLines, false, 'against the style');
      assert.equal(b.keepNext, true);
      assert.equal(b.keepLines, undefined, 'false is the default');
      for (const k of ['contextualSpacing', 'pageBreakBefore']) {
        assert.equal(h[k], true, k);
        assert.equal(b[k], true, k);
      }
      // widowControl: on by default (Word), so on is not written...
      assert.equal(b.widowControl, undefined);
      assert.equal(F.query(d.doc, sel).widowControl, true);
      // ...and off is
      undoable(d, () => setPara(d, T(d), sel, {contextualSpacing: null,
        widowControl: false, pageBreakBefore: null}));
      assert.equal(P(d, 1).pPr.contextualSpacing, undefined);
      assert.equal(P(d, 1).pPr.widowControl, false);
      assert.equal(F.query(d.doc, sel).widowControl, false);
      assert.equal(P(d, 1).pPr.pageBreakBefore, undefined);
      undoable(d, () => setPara(d, T(d), sel, {widowControl: true}));
      assert.equal(P(d, 1).pPr.widowControl, undefined);
      // a style that turns it off: on is written
      const w = mk([['x', {pStyle: 'NoWidow'}]]);
      w.doc.styles.styles.set('NoWidow', {id: 'NoWidow',
        type: 'paragraph', name: 'NoWidow', basedOn: 'Normal',
        pPr: {widowControl: false, extra: []}, rPr: {extra: []},
        extra: [], raw: null});
      assert.equal(F.query(w.doc, C(w, 0, 0)).widowControl, false);
      FS_setFlag(w, {widowControl: true});
      assert.equal(P(w, 0).pPr.widowControl, true);
      // List Paragraph's contextualSpacing switched off directly
      const e = mk([['x', {pStyle: 'ListParagraph'}]]);
      FS_setFlag(e, {contextualSpacing: false});
      assert.equal(P(e, 0).pPr.contextualSpacing, false);
      assert.equal(F.query(e.doc, C(e, 0, 0)).contextual, false);
    });
  it('end to end: written to the file and read back', async () => {
    const d = mk(['one', 'two', ['three', {pStyle: 'ListParagraph'}]]);
    const sel = SEL(d, 0, 0, 1, 1);
    FA.apply('lineDouble', d, T(d), sel);
    FA.apply('spaceBefore12', d, T(d), sel);
    FA.apply('lineSpacing', d, T(d), C(d, 2, 0),
      {line: 300, lineRule: 'exact'});
    setPara(d, T(d), sel, {keepNext: true, keepLines: true,
      widowControl: false, pageBreakBefore: true,
      contextualSpacing: true});
    const bytes = await write(d.doc);
    const xml = new TextDecoder().decode((await readZip(bytes))
      .get('word/document.xml'));
    for (const tag of ['<w:keepNext/>', '<w:keepLines/>',
      '<w:widowControl w:val="0"/>', '<w:pageBreakBefore/>',
      '<w:contextualSpacing/>', 'w:line="480" w:lineRule="auto"',
      'w:before="240"', 'w:line="300" w:lineRule="exact"'])
      assert.ok(xml.includes(tag), tag);
    const back = await readDocx(bytes);
    const bs = back.sections[0].blocks;
    for (const k of [0, 1]) {
      const pp = bs[k].pPr;
      assert.deepEqual(pp.spacing, {before: 240, line: 480,
        lineRule: 'auto'});
      for (const f of ['keepNext', 'keepLines', 'pageBreakBefore',
        'contextualSpacing'])
        assert.equal(pp[f], true, f);
      assert.equal(pp.widowControl, false);
    }
    assert.deepEqual(bs[2].pPr.spacing, {line: 300, lineRule: 'exact'});
    // the styles part: List Paragraph's contextualSpacing (Word's)
    const sx = new TextDecoder().decode((await readZip(bytes))
      .get('word/styles.xml'));
    assert.match(sx, /w:styleId="ListParagraph"[^]*?<w:contextualSpacing\/>[^]*?<\/w:style>/);
    assert.equal(back.styles.styles.get('ListParagraph').pPr
      .contextualSpacing, true);
  });
});
