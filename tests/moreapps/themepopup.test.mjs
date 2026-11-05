// The colour popup's current theme cell (theme editing, task 9): the
// query's colorRef reaches the popup from Format > Colour > More
// colours... (and the toolbar's A), in header mode the theme comes
// from the real document, and a theme in a part other than
// theme1.xml is refused, not orphaned. ('riscos' and the popup are
// stand-ins that record what they are given.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {query} from '../../tools/moreapps/!Letters/Format';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {relType} from '../../tools/moreapps/!Letters/WriteParts';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {withHeaders} from './story-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {mk, SEL, P, undoable} from './edit-docs.mjs';

globalThis.__popups = [];
const RISCOS = 'data:text/javascript,' + encodeURIComponent(
  'export const Menu = class {constructor(t, i) {this.title = t;' +
  'this.items = i;}};' +
  'export const wimp = {}, os = {}, vfs = {}, TextArea = class {},' +
  'choices = {}, infoBox = () => {}, query = () => {},' +
  'reportError = () => {}, saveAs = () => {}, textWidth = () => 0;');
const POP = 'data:text/javascript,' + encodeURIComponent(
  'export const colourPopup = (o) => {globalThis.__popups.push(o);' +
  'return o;};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: RISCOS, shortCircuit: true};
    if (spec === 'wimplib/Ui/ColourPopup') {
      return {url: POP, shortCircuit: true};
    }
    return next(spec, ctx);
  },
});
const FM = await import('../../tools/moreapps/!Letters/FormatMenu')
  .catch((e) => e);

const all = (d) => SEL(d, 0, 0, 0, P(d, 0).text.length);
const go = (d, id, sel, arg) =>
  undoable(d, () => FA.apply(id, d, new Typing(d), sel, arg));
const LIGHT = {themeColor: 'accent1', themeTint: '99'};
const same = (a, b) => !!a && !!b && a.themeColor === b.themeColor &&
  a.themeTint === b.themeTint && a.themeShade === b.themeShade;

describe('colorRef in the format query', () => {
  it('a themed run gives its reference, a literal one null', () => {
    const d = mk(['abc']);
    assert.equal(query(d.doc, all(d)).colorRef, null);
    go(d, 'themeColor', all(d), LIGHT);
    assert.deepEqual(query(d.doc, all(d)).colorRef, LIGHT);
    go(d, 'themeColor', all(d), {themeColor: 'text2'});
    assert.deepEqual(query(d.doc, all(d)).colorRef,
      {themeColor: 'text2'});
    go(d, 'color', all(d), 'FF0000');
    assert.equal(query(d.doc, all(d)).colorRef, null);
  });
  it('mixed themed and literal runs: null', () => {
    const d = mk(['abcdef']);
    go(d, 'themeColor', SEL(d, 0, 0, 0, 3), LIGHT);
    assert.equal(query(d.doc, all(d)).colorRef, null);
    go(d, 'themeColor', all(d), LIGHT);
    assert.deepEqual(query(d.doc, all(d)).colorRef, LIGHT);
  });
});

describe('More colours... marks the current theme cell', () => {
  const popupFor = (d, hdr) => {
    assert.ok(FM.colourMenu, FM instanceof Error ? FM.message : '');
    const v = {d, real: d, sel: all(d), win: {task: {}},
      query: () => query(d.doc, all(d)),
      format() {}};
    if (hdr) v.d = {doc: {styles: {}}};
    const m = FM.colourMenu(v);
    globalThis.__popups.length = 0;
    m.items.find((i) => i.text === 'More colours...').submenu();
    return globalThis.__popups[0];
  };
  it('a themed run marks exactly its cell; a literal one none', () => {
    const d = mk(['abc']);
    go(d, 'themeColor', all(d), LIGHT);
    let o = popupFor(d);
    assert.deepEqual(o.currentRef, LIGHT);
    const cells = o.theme.grid.flat().filter((t) =>
      same(t.ref, o.currentRef));
    assert.equal(cells.length, 1);
    assert.equal(cells[0].rgb, o.current);
    go(d, 'color', all(d), cells[0].rgb);
    o = popupFor(d);
    assert.equal(o.currentRef, null);
    assert.equal(o.current, cells[0].rgb);
  });
  it('header mode: the theme is the real document\'s', () => {
    const d = mk(['abc']);
    TD.setColors(d, {name: 'Custom', slots: {...TD.colorsOf(d).slots,
      accent1: '123456'}});
    const o = popupFor(d, true);
    const a1 = o.theme.grid.flat().find((t) =>
      t.ref && t.ref.themeColor === 'accent1' && !t.ref.themeTint &&
      !t.ref.themeShade);
    assert.equal(a1.rgb, '123456');
  });
});

describe('a real header facade', () => {
  it('shows the real document\'s theme, before and after an edit',
    async () => {
      const d = new Document(await readDocx(await withHeaders(
        p(r('body')), {default: {hdr: p(r('Head'))}})));
      const f = facadeOf(d, 'word/header1.xml', 0);
      assert.equal(f.doc.styles.theme, d.doc.styles.theme);
      TD.setFonts(d, {major: 'Garamond', minor: 'Garamond'});
      assert.equal(f.doc.styles.theme.major, 'Garamond');
      assert.equal(f.doc.styles.theme, d.doc.styles.theme);
    });
});

describe('a theme in another part', () => {
  it('is refused, nothing added', () => {
    const doc = newDoc();
    doc.parts.delete('word/theme/theme1.xml');
    doc.parts.set('word/theme/theme2.xml', new Uint8Array([1]));
    doc.rels = doc.rels.filter((r) => r.target !== 'theme/theme1.xml');
    doc.rels.push({id: 'rId99', type: relType('theme'),
      target: 'theme/theme2.xml', attrs: []});
    delete doc.styles.theme;
    const d = new Document(doc), keys = [...d.doc.parts.keys()];
    for (const r of [TD.setFonts(d, {major: 'Garamond',
      minor: 'Garamond'}), TD.reset(d)]) {
      assert.match(r.refused, /theme1\.xml/);
    }
    assert.deepEqual([...d.doc.parts.keys()], keys);
    assert.equal(d.undoDepth, 0);
  });
});

describe('a theme relationship target in other spellings', () => {
  for (const target of ['/word/theme/theme1.xml', 'theme/theme1.xml',
    'word/theme/theme1.xml']) {
    it(target + ' is the theme1.xml part: edited, no second rel',
      () => {
        const doc = newDoc();
        doc.parts.delete('word/theme/theme1.xml');
        doc.rels = doc.rels.filter((r) => r.type !== relType('theme'));
        doc.rels.push({id: 'rId77', type: relType('theme'), target,
          attrs: []});
        delete doc.styles.theme;
        const d = new Document(doc);
        assert.deepEqual(TD.setFonts(d, {major: 'Garamond',
          minor: 'Georgia'}), {ok: true});
        assert.equal(d.doc.rels.filter((r) =>
          r.type === relType('theme')).length, 1);
        assert.ok(d.doc.parts.has('word/theme/theme1.xml'));
        d.undo();
        assert.ok(!d.doc.parts.has('word/theme/theme1.xml'));
      });
  }
});
