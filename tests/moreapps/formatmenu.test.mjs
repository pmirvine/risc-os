// The style items of the Format menu and of the toolbar's style menu
// (./FormatMenu, ./StyleMenu): Update <style> to match selection
// (the caret paragraph's style named, cut at 40 characters; shaded
// with no paragraph style to change, outside the body's text, or with
// no selection) and Clear all formatting (no key; Clear formatting
// keeps Ctrl+Space). ('riscos' replaced by a stand-in Menu: no menu
// is opened; the menus themselves are checked in word-format.mjs.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createStyle} from '../../tools/moreapps/!Letters/StyleCmd';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {mk, C} from './edit-docs.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const Menu = class {constructor(t, i) {this.title = t;' +
  ' this.items = i;}};' +
  'export const wimp = {beep() {}, menus: {}, setCaret() {},' +
  ' width: 2000};' +
  'export const reportError = () => {};' +
  'export const TextArea = class {}, vfs = {}, choices = {},' +
  ' textWidth = () => 0, saveAs = () => {}, query = () => {},' +
  ' infoBox = () => {}, os = {}, Window = class {}, task = {};');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const L = '../../tools/moreapps/!Letters/';
const {formatMenu} = await import(L + 'FormatMenu');
const {styleMenu} = await import(L + 'StyleMenu');

/** A view over d with the caret at sel (null: no selection). */
function view(d, sel) {
  const calls = [];
  return {d, sel, calls, L: null, painter: null, win: {task: {}},
    query: () => ({style: 'Normal', charStyle: ''}),
    format: (id, arg) => calls.push([id, arg])};
}
const val = (x) => (typeof x === 'function' ? x() : x);
const find = (m, re) => m.items.find((i) => re.test(val(i.text)));
const UPDATE = /^Update .* to match selection$/;

describe('Format menu: Update <style> to match selection', () => {
  it('names the caret paragraph\'s style and runs styleUpdate', () => {
    const d = mk([['abcd', {pStyle: 'Heading2'}], 'ef']);
    const v = view(d, C(d, 0, 1));
    const it1 = find(formatMenu(v), UPDATE);
    assert.ok(it1, 'the item is there');
    assert.equal(val(it1.text), 'Update Heading 2 to match selection');
    assert.equal(!!it1.shaded(), false);
    it1.action();
    assert.deepEqual(v.calls, [['styleUpdate', undefined]]);
    v.sel = C(d, 1, 0);
    assert.equal(val(it1.text), 'Update Normal to match selection');
  });
  it('shaded: no selection, a missing style, no style table', () => {
    const d = mk([['abcd', {pStyle: 'Nope'}]]);
    const v = view(d, C(d, 0, 0));
    const it1 = find(formatMenu(v), UPDATE);
    assert.equal(!!it1.shaded(), true);
    assert.equal(val(it1.text), 'Update style to match selection');
    const e = mk(['ab']);
    assert.equal(!!find(formatMenu(view(e, null)), UPDATE).shaded(),
      true);
    const n = mk(['ab'], {styles: false});
    assert.equal(!!find(formatMenu(view(n, C(n, 0, 0))), UPDATE)
      .shaded(), true);
    // a position outside the body's paragraphs (a header's, a
    // deleted one's)
    assert.equal(!!find(formatMenu(view(e, {anchor: {id: 9999, off: 0},
      head: {id: 9999, off: 0}})), UPDATE).shaded(), true);
  });
  it('a long style name is cut at 40 characters', () => {
    const long = 'A very long style name that goes on and on and on';
    const d = mk([]);
    const r = createStyle(d.doc.styles, {type: 'paragraph',
      name: long});
    d.doc.styles = r.table;
    d.doc.sections[0].blocks = [newPara('ab', {pStyle: r.id})];
    const it1 = find(formatMenu(view(d, C(d, 0, 0))), UPDATE);
    assert.equal(val(it1.text), 'Update ' + long.slice(0, 40) +
      '... to match selection');
  });
});

describe('Format menu: Clear all formatting', () => {
  it('after Clear formatting, no key; runs clearAll', () => {
    const d = mk(['ab']);
    const v = view(d, C(d, 0, 0));
    const m = formatMenu(v);
    const texts = m.items.map((i) => val(i.text));
    const k = texts.indexOf('Clear formatting');
    assert.ok(k >= 0);
    assert.equal(texts[k + 1], 'Clear all formatting');
    assert.equal(m.items[k].key, 'Ctrl+Space');
    const all = m.items[k + 1];
    assert.equal(all.key, undefined);
    assert.equal(!!all.shaded(), false);
    assert.ok(all.help);
    all.action();
    assert.deepEqual(v.calls, [['clearAll', undefined]]);
    v.sel = null;
    assert.equal(!!all.shaded(), true);
  });
});

describe('Format menu: Document defaults...', () => {
  it('after Styles..., runs defaults(); shaded without it or a ' +
    'selection', () => {
    const d = mk(['ab']);
    const v = view(d, C(d, 0, 0));
    let n = 0;
    const m = formatMenu(v, {styles: () => {}, defaults: () => n++});
    const texts = m.items.map((i) => val(i.text));
    const k = texts.indexOf('Document defaults...');
    assert.equal(texts[k - 1], 'Styles...');
    const it1 = m.items[k];
    assert.equal(!!it1.shaded(), false);
    assert.equal(it1.dotted, true);
    assert.equal(!!m.items[k - 1].dotted, false);
    assert.ok(it1.help);
    it1.action();
    assert.equal(n, 1);
    v.sel = null;
    assert.equal(!!it1.shaded(), true);
    const bare = formatMenu(view(d, C(d, 0, 0)));
    const it2 = bare.items.find((i) => val(i.text) ===
      'Document defaults...');
    assert.equal(!!it2.shaded(), true);
    it2.action();
  });
});

describe('the toolbar style menu: Update <style> to match selection',
  () => {
    it('before More styles..., shaded as in the Format menu', () => {
      const d = mk([['abcd', {pStyle: 'Heading2'}]]);
      const v = view(d, C(d, 0, 0));
      const m = styleMenu(v);
      const n = m.items.length;
      assert.equal(val(m.items[n - 1].text), 'More styles...');
      const it1 = m.items[n - 2];
      assert.equal(val(it1.text), 'Update Heading 2 to match selection');
      assert.equal(!!it1.shaded(), false);
      assert.equal(m.items[n - 3].dotted, true);
      it1.action();
      assert.deepEqual(v.calls, [['styleUpdate', undefined]]);
      v.sel = null;
      assert.equal(!!it1.shaded(), true);
    });
  });
