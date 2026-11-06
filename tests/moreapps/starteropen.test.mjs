// Choosing a starter (File > New from template > a group): nothing is
// built while the menu is made; picking one calls app.openStarter(id);
// its window is untitled (no path to save to) and its Save name is the
// starter's title. 'riscos' is a stand-in as in templatemenu.test.mjs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const STUB = 'data:text/javascript,' + encodeURIComponent(`
export const Menu = class {constructor(title, items) {
  this.title = title; this.items = items;}};
export const reportError = () => {};
export const vfs = {list: () => [], mkdir() {}, canonical: (p) => p};
export const os = {};
`);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const A = '../../tools/moreapps/!Letters/';
const {templateMenu} = await import(A + 'TemplateMenu');
const {STARTERS, GROUPS, starterOf, openResult, openChecked} =
  await import(A + 'StarterList');
const {fileOf, suggestName, camel} = await import(A + 'SaveState');

const texts = (m) => m.items.map((i) => i.text);

describe('starters in the New from template menu', () => {
  it('no templates: (no templates), the four groups, the folder',
    () => {
      const m = templateMenu({app: {}});
      assert.deepEqual(texts(m), ['(no templates)', 'Letters',
        'Careers', 'Reports', 'Business', 'Open Templates folder']);
      assert.equal(m.items[0].dotted, true);
      assert.equal(m.items[4].dotted, true);
      assert.equal(m.items[1].dotted, undefined);
    });

  it('each group lists its starters in order, with help', () => {
    const m = templateMenu({app: {}});
    for (const g of GROUPS) {
      const sub = m.items.find((i) => i.text === g).submenu();
      assert.equal(sub.title, g);
      const want = STARTERS.filter((s) => s.group === g);
      assert.deepEqual(texts(sub), want.map((s) => s.title));
      assert.deepEqual(sub.items.map((i) => i.help),
        want.map((s) => s.help));
    }
  });

  it('making the menu (and its submenus) builds nothing', () => {
    const saved = STARTERS.map((s) => s.build);
    let built = 0;
    for (const s of STARTERS) s.build = () => { built++; throw new Error('x'); };
    try {
      const m = templateMenu({app: {}});
      for (const g of GROUPS) m.items.find((i) => i.text === g).submenu();
    } finally {
      STARTERS.forEach((s, i) => { s.build = saved[i]; });
    }
    assert.equal(built, 0);
  });

  it('picking a starter calls openStarter with its id only', () => {
    const got = [];
    const m = templateMenu({app: {openStarter: (id) => got.push(id)}});
    for (const g of GROUPS) {
      const sub = m.items.find((i) => i.text === g).submenu();
      sub.items.forEach((i) => i.action());
    }
    for (const g of GROUPS) {
      const ids = STARTERS.filter((s) => s.group === g).map((s) => s.id);
      assert.deepEqual(got.filter((id) => ids.includes(id)), ids);
    }
    assert.equal(got.length, STARTERS.length);
    assert.equal(STARTERS.length, 16);
  });

  it('an action that throws or rejects is contained', () => {
    const m = templateMenu({app: {openStarter: () => {
      throw new Error('x'); }}});
    m.items[1].submenu().items[0].action();
    const m2 = templateMenu({app: {openStarter: () =>
      Promise.reject(new Error('y'))}});
    m2.items[1].submenu().items[0].action();
  });
});

describe('a starter as a document', () => {
  it('all 16 ids resolve; each open is a fresh doc', () => {
    for (const s of STARTERS) assert.equal(starterOf(s.id), s);
    const a = openResult('memo'), b = openResult('memo');
    assert.notEqual(a.doc, b.doc);
    assert.equal(a.imported, 'template');
    assert.equal(openResult('nope'), undefined);
  });

  it('it has no file: path null, nothing imported from', () => {
    assert.deepEqual(fileOf(null, 'template'),
      {path: null, imported: null, importedFrom: null});
  });

  it('the Save name is the title, numbered when taken', () => {
    const dw = {path: null, leaf: 'Untitled',
      suggestedTitle: 'Fax cover sheet'};
    assert.equal(suggestName(dw, 'D'), 'D.FaxCoverSheet');
    const taken = (p) => p === 'D.FaxCoverSheet';
    assert.equal(suggestName(dw, 'D', taken, 'docx'),
      'D.FaxCoverSheet2');
    assert.equal(suggestName({path: null, leaf: 'Untitled 2'}, 'D'),
      'D.Untitled2');
  });
});

describe('names and failures', () => {
  it('every starter title makes a valid CamelCase leaf', () => {
    for (const s of STARTERS) {
      const l = camel(s.title);
      assert.match(l, /^[A-Za-z0-9]+$/, s.title);
    }
    assert.equal(camel('CV (simple)'), 'CVSimple');
    assert.equal(camel('Press release'), 'PressRelease');
    assert.equal(camel('Q\u00d7A \u00f7 notes'), 'QANotes');
    assert.equal(camel('Business letter'), 'BusinessLetter');
  });

  it('openChecked: a throwing build or unknown id is said', () => {
    const say = [];
    const s = starterOf('memo'), keep = s.build;
    s.build = () => { throw new Error('boom'); };
    try {
      assert.equal(openChecked('memo', (m) => say.push(m)), null);
    } finally { s.build = keep; }
    assert.equal(openChecked('nope', (m) => say.push(m)), null);
    assert.equal(say.length, 2);
    assert.match(say[0], /could not be made: boom/);
    assert.match(say[1], /no starter 'nope'/);
    const ok = openChecked('memo', () => assert.fail('said'));
    assert.equal(ok.title, 'Memo');
    assert.equal(ok.imported, 'template');
  });
});
