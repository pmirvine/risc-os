// StyleMenu: the style list of the toolbar popup and Format > Style.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newStyleTable, addStyle}
  from '../../tools/moreapps/!Letters/Styles';
import {ensureBuiltins}
  from '../../tools/moreapps/!Letters/StylesBuiltin';
import {gallery} from '../../tools/moreapps/!Letters/StyleList';
import {registerHooks} from 'node:module';
import {emptyDoc} from '../../tools/moreapps/!Letters/Model';

// ('riscos' replaced by a stand-in Menu; the format menu itself,
// which needs the desktop, is checked in word-toolbar.mjs)
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const Menu = class {constructor(title, items) {' +
  'this.title = title; this.items = items;}};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {styleMenu, shownStyle} =
  await import('../../tools/moreapps/!Letters/StyleMenu');

const rp = (o) => ({extra: [], ...o});
const sty = (id, o = {}) => ({id, type: 'paragraph', name: id,
  pPr: rp(), rPr: rp(), extra: [], raw: null, ...o});

function fake(extra = [], style = 'Normal', charStyle = '') {
  const doc = emptyDoc();
  const t = ensureBuiltins(newStyleTable());
  for (const s of extra) addStyle(t, s);
  doc.styles = t;
  const calls = [];
  return {d: {doc}, sel: {}, calls,
    query: () => ({style, charStyle}),
    format: (id, arg) => calls.push([id, arg])};
}
const texts = (m) => m.items.map((i) => i.text);

describe('StyleMenu', () => {
  it('lists the gallery, not hidden styles, then More styles...', () => {
    const v = fake([
      sty('Quiet', {qFormat: true, semiHidden: true, uiPriority: 90}),
      sty('Secret', {semiHidden: true}),
      sty('Loud', {type: 'character', qFormat: true, uiPriority: 2}),
    ]);
    const m = styleMenu(v);
    const names = texts(m);
    const want = gallery(v.d.doc).map((e) => e.name);
    assert.deepEqual(names.slice(0, want.length), want);
    assert.ok(names.includes('Loud'));
    assert.ok(!names.includes('Secret'));
    assert.equal(names[names.length - 1], 'More styles...');
  });
  it('ticks the caret paragraph style, or the character style', () => {
    const v = fake([sty('Loud', {type: 'character', qFormat: true})],
      'Heading1');
    const t = (m) => m.items.filter((i) => i.ticked && i.ticked())
      .map((i) => i.text);
    assert.deepEqual(t(styleMenu(v)), ['Heading 1']);
    const w = fake([sty('Loud', {type: 'character', qFormat: true})],
      'Normal', 'Loud');
    assert.deepEqual(t(styleMenu(w)), ['Loud']);
  });
  it('picking runs view.format("style", id)', () => {
    const v = fake();
    const it1 = styleMenu(v).items.find((i) => i.text === 'Heading 1');
    it1.action();
    assert.deepEqual(v.calls, [['style', 'Heading1']]);
  });
  it('More styles... is shaded without a callback, calls it', () => {
    const v = fake();
    const more = (m) => m.items[m.items.length - 1];
    assert.equal(!!more(styleMenu(v)).shaded(), true);
    let n = 0;
    const m = styleMenu(v, {more: () => n++});
    assert.equal(!!more(m).shaded(), false);
    more(m).action();
    assert.equal(n, 1);
  });
  it('shows Word\'s name for a stored built-in name', () => {
    const v = fake();
    const names = texts(styleMenu(v));
    assert.ok(names.includes('Heading 1'), names.join());
    assert.ok(!names.includes('heading 1'));
    assert.equal(v.d.doc.styles.styles.get('Heading1').name, 'heading 1');
  });
  it('shownStyle: the character style, else the paragraph', () => {
    assert.equal(shownStyle({style: 'Normal', charStyle: ''}), 'Normal');
    assert.equal(shownStyle({style: 'Normal', charStyle: 'X'}), 'X');
    assert.equal(shownStyle({style: 'Normal', charStyle: null}),
      'Normal');
    assert.equal(shownStyle(null), '');
  });
});
