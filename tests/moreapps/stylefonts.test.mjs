// Fonts of a run's layers are replaced slot by slot (./StyleFonts):
// a later layer's raw w:rFonts naming only the complex-script or east
// Asian slot leaves the Latin font of the layer below; a layer
// naming asciiTheme replaces a literal ascii; a heading of a Word-
// made file follows the heading font.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {resolveRun, addStyle, newStyleTable}
  from '../../tools/moreapps/!Letters/Styles';
import {fontName} from '../../tools/moreapps/!Letters/Fmt';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';
import {themeBytes} from '../../tools/moreapps/!Letters/ThemeDefault';
import {mk, P} from './edit-docs.mjs';
import {loadStyles} from './word-docs.mjs';
import {before} from 'node:test';

before(loadStyles);

const raw = (...attrs) => ({name: 'w:rFonts', attrs, children: []});
const theme = {...parse(themeBytes()), major: 'Garamond',
  minor: 'Georgia'};
const table = (normalRPr, defaultsExtra = []) => {
  const t = newStyleTable();
  t.theme = theme;
  t.docDefaults.rPr = {extra: defaultsExtra};
  addStyle(t, {id: 'Normal', type: 'paragraph', name: 'Normal',
    default: true, pPr: {extra: []}, rPr: normalRPr, extra: [],
    raw: null});
  return t;
};
const fontOf = (t, runRPr) => {
  const para = {pStyle: 'Normal', runs: [], text: 'x'};
  return fontName(resolveRun(t, para, {rPr: runRPr}), t.theme);
};
const ARIAL = {rFonts: {ascii: 'Arial', hAnsi: 'Arial'}, extra: []};

describe('fonts replaced slot by slot', () => {
  it('a cstheme-only run keeps the style\'s Arial', () => {
    const t = table(ARIAL);
    assert.equal(fontOf(t, {extra: [raw(['w:cstheme', 'minorBidi'])]}),
      'Arial');
  });
  it('an eastAsiaTheme-only run keeps the style\'s Arial', () => {
    const t = table(ARIAL);
    assert.equal(fontOf(t, {extra: [raw(
      ['w:eastAsiaTheme', 'minorHAnsi'])]}), 'Arial');
  });
  it('the same over theme document defaults: the theme font', () => {
    const t = table({extra: []}, [raw(['w:asciiTheme', 'minorHAnsi'],
      ['w:hAnsiTheme', 'minorHAnsi'])]);
    assert.equal(fontOf(t, {extra: [raw(['w:cstheme', 'minorBidi'])]}),
      'Georgia');
  });
  it('a run naming asciiTheme replaces the style\'s ascii', () => {
    const t = table(ARIAL);
    assert.equal(fontOf(t, {extra: [raw(
      ['w:asciiTheme', 'majorHAnsi'])]}), 'Garamond');
  });
  it('a literal ascii in a run replaces a theme one below', () => {
    const t = table({extra: [raw(['w:asciiTheme', 'majorHAnsi'])]});
    assert.equal(fontOf(t, {rFonts: {ascii: 'Verdana'}, extra: []}),
      'Verdana');
  });
  it('a heading style over theme defaults follows the heading font',
    () => {
      const t = table({extra: [raw(['w:asciiTheme', 'majorHAnsi'],
        ['w:hAnsiTheme', 'majorHAnsi'])]}, [raw(
        ['w:asciiTheme', 'minorHAnsi'], ['w:hAnsiTheme', 'minorHAnsi'],
        ['w:cstheme', 'minorBidi'])]);
      assert.equal(fontOf(t, {extra: []}), 'Garamond');
    });
  it('a new document\'s heading and body follow the pair', () => {
    const d = mk([['H', {pStyle: 'Heading1'}], 'b']);
    const f = (k) => fontName(resolveRun(d.doc.styles, P(d, k),
      P(d, k).runs[0]), d.doc.styles.theme);
    assert.notEqual(f(0), f(1));
  });
});
