// TemplateMenu: File > New from template (the Templates folder's
// files as items, chunks of 40 with More..., Open Templates folder).
// 'riscos' is a stand-in: a vfs listing, an os.cli recording.
import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const s = globalThis.__tmStub = {files: [], listFails: false,
  mkdirs: [], mkdirFails: false, cli: [], errors: [], hasCli: true};
const STUB = 'data:text/javascript,' + encodeURIComponent(`
const s = globalThis.__tmStub;
export const Menu = class {constructor(title, items) {
  this.title = title; this.items = items;}};
export const reportError = (m) => s.errors.push(m);
export const vfs = {
  list(d) { if (s.listFails) throw new Error('no'); return s.files; },
  mkdir(d) { if (s.mkdirFails) throw new Error('read-only');
    s.mkdirs.push(d); },
  canonical: (p) => 'ADFS::HardDisc4.$.!Boot.Choices.LettersTemplates'};
export const os = {get cli() { return s.hasCli ? {run: (c) => {
  s.cli.push(c); return Promise.resolve(); }} : undefined; }};
`);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {templateMenu, labelOf} =
  await import('../../tools/moreapps/!Letters/TemplateMenu');
const {TEMPLATE_TYPE} =
  await import('../../tools/moreapps/!Letters/Open');
const TD = 'Choices:LettersTemplates';

const file = (name, filetype = TEMPLATE_TYPE) => ({name, filetype,
  type: 'file', path: `${TD}.${name}`});
const mk = () => {
  const opened = [];
  return {opened, app: {openTemplate: (p) => { opened.push(p); }}};
};
const texts = (m) => m.items.map((i) => i.text);
const val = (v) => (typeof v === 'function' ? v() : v);

beforeEach(() => {
  Object.assign(s, {files: [], listFails: false, mkdirs: [],
    mkdirFails: false, cli: [], errors: [], hasCli: true});
});

describe('TemplateMenu', () => {
  it('empty folder: a shaded (no templates), then the folder item',
    () => {
      const m = templateMenu(mk());
      assert.equal(m.title, 'New from template');
      assert.deepEqual(texts(m), ['(no templates)',
        'Open Templates folder']);
      assert.equal(val(m.items[0].shaded), true);
      assert.equal(m.items[0].dotted, true);
    });

  it('a folder that cannot be read is the same as empty', () => {
    s.listFails = true;
    assert.deepEqual(texts(templateMenu(mk())), ['(no templates)',
      'Open Templates folder']);
  });

  it('three templates, sorted, with help; others are not listed',
    () => {
      s.files = [file('Memo/dotx'), file('Report/dotx'),
        file('Letter/dotx'), file('Notes', 0xFFF),
        {name: 'Sub', type: 'dir', path: TD + '.Sub'}];
      const m = templateMenu(mk());
      assert.deepEqual(texts(m), ['Letter', 'Memo', 'Report',
        'Open Templates folder']);
      assert.equal(m.items[0].help,
        'Make a new document from this template.');
      assert.equal(m.items[2].dotted, true);
    });

  it('picking opens that path through the app', () => {
    s.files = [file('B/dotx'), file('A/dotx')];
    const dw = mk();
    const m = templateMenu(dw);
    m.items[1].action();
    assert.deepEqual(dw.opened, [TD + '.B/dotx']);
  });

  it('100 templates: 40 + More (40, then 20)', () => {
    s.files = Array.from({length: 100}, (_, i) =>
      file(`T${String(i).padStart(3, '0')}/dotx`));
    const m = templateMenu(mk());
    assert.equal(m.items.length, 42);       // 40, More, folder
    assert.equal(m.items[40].text, 'More...');
    const m2 = m.items[40].submenu();
    assert.equal(m2.items.length, 41);
    assert.equal(m2.items[0].text, 'T040');
    assert.equal(m2.items[40].text, 'More...');
    const m3 = m2.items[40].submenu();
    assert.equal(m3.items.length, 20);
    assert.equal(m3.items[19].text, 'T099');
    assert.equal(m3.items.some((i) => i.text === 'More...'), false);
  });

  it('exactly 40 templates: no More...; 41: More... with one', () => {
    const mkFiles = (n) => Array.from({length: n}, (_, i) =>
      file(`T${String(i).padStart(3, '0')}/dotx`));
    s.files = mkFiles(40);
    const m = templateMenu(mk());
    assert.equal(m.items.length, 41);       // 40, folder
    assert.equal(m.items.some((i) => i.text === 'More...'), false);
    assert.equal(m.items[39].text, 'T039');
    s.files = mkFiles(41);
    const m41 = templateMenu(mk());
    assert.equal(m41.items.length, 42);     // 40, More, folder
    assert.equal(m41.items[40].text, 'More...');
    const more = m41.items[40].submenu();
    assert.deepEqual(texts(more), ['T040']);
  });

  it('over 200 templates: the last submenu says only 200 are shown',
    () => {
      s.files = Array.from({length: 250}, (_, i) =>
        file(`T${String(i).padStart(3, '0')}/dotx`));
      let m = templateMenu(mk());
      let last = null;
      for (let n = 0; n < 4; n++) {
        assert.equal(m.items.some((i) => /only the first/.test(i.text)),
          false);
        m = m.items.find((i) => i.text === 'More...').submenu();
      }
      last = m.items;
      assert.equal(last.length, 41);
      assert.equal(last[39].text, 'T199');
      assert.equal(last[40].text, '(only the first 200 are shown)');
      assert.equal(val(last[40].shaded), true);
      assert.equal(last.some((i) => i.text === 'More...'), false);
      // exactly 200: nothing is left out, so no note
      s.files = s.files.slice(0, 200);
      m = templateMenu(mk());
      for (let n = 0; n < 4; n++)
        m = m.items.find((i) => i.text === 'More...').submenu();
      assert.equal(m.items.length, 40);
    });

  it('long and odd names show as clean text of a fixed length', () => {
    const long = 'x'.repeat(400) + '/dotx';
    assert.equal(labelOf(long).length, 48);
    assert.ok(labelOf(long).endsWith('...'));
    assert.equal(labelOf('a\x00b\x1b<&>/dotx'), 'a?b?<&>');
    assert.equal(labelOf(''), '?');
    s.files = [file(long), file('a\x01b/dotx')];
    const m = templateMenu(mk());
    assert.equal(m.items.length, 3);
  });

  it('is rebuilt on each opening', () => {
    s.files = [file('One/dotx')];
    assert.deepEqual(texts(templateMenu(mk())).slice(0, 1), ['One']);
    s.files.push(file('Two/dotx'));
    assert.deepEqual(texts(templateMenu(mk())).slice(0, 2),
      ['One', 'Two']);
  });

  it('Open Templates folder: makes the folder, asks the Filer', () => {
    const m = templateMenu(mk());
    const it = m.items[m.items.length - 1];
    assert.equal(val(it.shaded), false);
    it.action();
    assert.deepEqual(s.mkdirs, [TD]);
    assert.deepEqual(s.cli, ['Filer_OpenDir ' +
      'ADFS::HardDisc4.$.!Boot.Choices.LettersTemplates']);
    assert.deepEqual(s.errors, []);
  });

  it('Open Templates folder: shaded without a CLI; a folder that ' +
    'cannot be made is reported and the Filer not asked', () => {
    s.hasCli = false;
    let m = templateMenu(mk());
    assert.equal(val(m.items[m.items.length - 1].shaded), true);
    s.hasCli = true;
    s.mkdirFails = true;
    m = templateMenu(mk());
    m.items[m.items.length - 1].action();
    assert.equal(s.cli.length, 0);
    assert.match(s.errors[0], /Templates folder could not be made/);
  });
});
