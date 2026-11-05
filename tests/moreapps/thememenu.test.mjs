// ThemeMenu: Design / Format > Theme, the Fonts and Colours lists.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {COLOR_SCHEMES, FONT_PAIRS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';

const errors = [];
globalThis.__themeErrors = errors;
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const Menu = class {constructor(title, items) {' +
  'this.title = title; this.items = items;}};' +
  'export const reportError = (m) => globalThis.__themeErrors' +
  '.push(m);');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {themeMenu} =
  await import('../../tools/moreapps/!Letters/ThemeMenu');

const mk = (extra = {}) => ({d: new Document(newDoc()),
  view: {...extra}});
const sub = (m, t) => m.items.find((i) => i.text === t).submenu();
const texts = (m) => m.items.map((i) => i.text);
const ticked = (m) => m.items.filter((i) => i.ticked()).map((i) => i.text);

describe('ThemeMenu', () => {
  it('has the five items and the full lists', () => {
    const m = themeMenu(mk(), {});
    assert.equal(m.title, 'Theme');
    assert.deepEqual(texts(m), ['Fonts', 'Colours',
      'Customize fonts...', 'Customize colours...',
      'Reset to Office theme']);
    assert.equal(sub(m, 'Fonts').items.length, FONT_PAIRS.length);
    assert.equal(sub(m, 'Colours').items.length, COLOR_SCHEMES.length);
  });
  it('ticks the current preset, none for Custom', () => {
    const dw = mk(), m = themeMenu(dw, {});
    assert.equal(ticked(sub(m, 'Fonts')).length, 1);
    assert.equal(ticked(sub(m, 'Colours')).length, 1);
    TD.setFonts(dw.d, {major: 'Zapf Q', minor: 'Zapf Q'});
    assert.deepEqual(ticked(sub(m, 'Fonts')), []);
    const p = FONT_PAIRS.find((f) => f.name === 'Garamond');
    sub(m, 'Fonts').items.find((i) => i.text === 'Garamond').action();
    assert.deepEqual(ticked(sub(m, 'Fonts')), ['Garamond']);
    assert.equal(dw.d.doc.styles.theme.major, p.major);
  });
  it('a pick changes the theme and undo restores it', () => {
    const dw = mk(), d = dw.d, m = themeMenu(dw, {});
    const before = d.doc.styles.theme;
    const s = COLOR_SCHEMES.find((c) => c.name === 'Paper');
    sub(m, 'Colours').items.find((i) => i.text === 'Paper').action();
    assert.equal(d.doc.styles.theme.colors.get('accent1'),
      s.slots.accent1);
    d.undo();
    assert.deepEqual(d.doc.styles.theme, before);
  });
  it('Reset restores the Office values', () => {
    const dw = mk(), d = dw.d, m = themeMenu(dw, {});
    const office = d.doc.styles.theme;
    sub(m, 'Colours').items[5].action();
    sub(m, 'Fonts').items[5].action();
    assert.notDeepEqual(d.doc.styles.theme, office);
    m.items[4].action();
    assert.deepEqual(d.doc.styles.theme.colors, office.colors);
    assert.equal(d.doc.styles.theme.major, office.major);
  });
  it('Customize items call the boxes; shaded without them', () => {
    const calls = [];
    const m = themeMenu(mk(), {fontsBox: () => calls.push('f'),
      colorsBox: () => calls.push('c')});
    m.items[2].action(); m.items[3].action();
    assert.deepEqual(calls, ['f', 'c']);
    const n = themeMenu(mk(), {});
    assert.ok(n.items[2].shaded() && n.items[3].shaded());
  });
  it('shades everything when read-only', () => {
    const m = themeMenu(mk({readOnly: true}), {fontsBox() {},
      colorsBox() {}});
    for (const i of m.items) assert.ok(i.shaded(), i.text);
    for (const i of sub(m, 'Fonts').items) assert.ok(i.shaded());
  });
  it('a refused edit is reported and changes nothing', () => {
    const dw = mk(), d = dw.d, m = themeMenu(dw, {});
    d.doc.parts.set('word/theme/theme1.xml',
      new TextEncoder().encode('<x/>'));
    const n = d.undoDepth;
    sub(m, 'Fonts').items[3].action();
    assert.equal(errors.length, 1);
    assert.equal(d.undoDepth, n);
  });
});
