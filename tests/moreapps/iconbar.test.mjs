// IconBar: the icon bar icon's menu is New, New from template >,
// Recent >, Info >, Quit; New from template is the same menu as
// File > New from template (./TemplateMenu), its picks going to the
// app (openTemplate, openStarter). 'riscos', ./Quit and ./RecentFiles
// are stand-ins.
import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const s = globalThis.__ibStub = {files: [], quits: 0};
const STUB = 'data:text/javascript,' + encodeURIComponent(`
const s = globalThis.__ibStub;
export const Menu = class {constructor(title, items) {
  this.title = title; this.items = items;}};
export const infoBox = () => ({info: true});
export const reportError = () => {};
export const vfs = {list: () => s.files, mkdir() {},
  canonical: (p) => p};
export const os = {};
`);
const QUIT = 'data:text/javascript,' + encodeURIComponent(`
export const quit = () => { globalThis.__ibStub.quits++; };
`);
const RECENT = 'data:text/javascript,' + encodeURIComponent(`
export const recentItem = () => ({text: 'Recent', shaded: true});
`);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    if (spec === './Quit') return {url: QUIT, shortCircuit: true};
    if (spec === './RecentFiles') {
      return {url: RECENT, shortCircuit: true};
    }
    return next(spec, ctx);
  },
});
const A = '../../tools/moreapps/!Letters/';
const {addIcon} = await import(A + 'IconBar');
const {templateMenu} = await import(A + 'TemplateMenu');
const {TEMPLATE_TYPE} = await import(A + 'Open');
const TD = 'Choices:LettersTemplates';

const texts = (m) => m.items.map((i) => i.text);
const mkApp = () => {
  const app = {opened: [], starters: [], made: 0,
    newDoc() { app.made++; },
    openTemplate(p) { app.opened.push(p); },
    openStarter(id) { app.starters.push(id); },
    task: {addIconbarIcon: (o) => o}};
  return app;
};

beforeEach(() => { s.files = []; s.quits = 0; });

describe('IconBar menu', () => {
  it('New, New from template, Recent, Info, Quit', () => {
    const m = addIcon(mkApp()).menu();
    assert.equal(m.title, 'Letters');
    assert.deepEqual(texts(m), ['New', 'New from template', 'Recent',
      'Info', 'Quit']);
    assert.match(m.items[1].help, /template/);
    assert.equal(typeof m.items[1].submenu, 'function');
  });

  it('its New from template is File > New from template', () => {
    const app = mkApp();
    const sub = addIcon(app).menu().items[1].submenu();
    const file = templateMenu({app});
    assert.equal(sub.title, 'New from template');
    assert.deepEqual(texts(sub), texts(file));
    assert.deepEqual(texts(sub), ['(no templates)', 'Letters',
      'Careers', 'Reports', 'Business', 'Open Templates folder']);
    assert.equal(sub.items[0].shaded, true);
  });

  it('a template and a starter open through the app', () => {
    s.files = [{name: 'Memo/dotx', type: 'file',
      filetype: TEMPLATE_TYPE, path: TD + '.Memo/dotx'}];
    const app = mkApp();
    const sub = addIcon(app).menu().items[1].submenu();
    assert.equal(sub.items[0].text, 'Memo');
    sub.items[0].action();
    assert.deepEqual(app.opened, [TD + '.Memo/dotx']);
    const letters = sub.items.find((i) => i.text === 'Letters')
      .submenu();
    letters.items.find((i) => i.text === 'Business letter').action();
    assert.deepEqual(app.starters, ['business-letter']);
    assert.equal(app.made, 0);
  });

  it('the templates folder is read again each time it is opened',
    () => {
      const item = addIcon(mkApp()).menu().items[1];
      assert.equal(item.submenu().items[0].text, '(no templates)');
      s.files = [{name: 'Memo/dotx', type: 'file',
        filetype: TEMPLATE_TYPE, path: TD + '.Memo/dotx'}];
      assert.equal(item.submenu().items[0].text, 'Memo');
      s.files = [];
      assert.equal(item.submenu().items[0].text, '(no templates)');
    });

  it('New and Quit still work', () => {
    const app = mkApp();
    const m = addIcon(app).menu();
    m.items[0].action();
    m.items[4].action();
    assert.equal(app.made, 1);
    assert.equal(s.quits, 1);
  });
});
