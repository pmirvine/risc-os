// Save as template (task 4): the Save as box's third choice writes a
// COPY of the document as a Word template (.dotx, file type &A83)
// and changes nothing in the window, also when the write fails or the
// Templates folder cannot be made; the RTF question is not asked for
// it; TemplateDir makes and lists the folder. ('riscos' and the
// boxes replaced by stand-ins as ./saveasbox.test.mjs does; the real
// writers make the bytes.)
import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Emitter} from '../../src/core/util.js';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara, OBJ} from '../../tools/moreapps/!Letters/Model';
import {LOST} from '../../tools/moreapps/!Letters/RtfLost';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {el} from '../../tools/moreapps/!WimpLib/Xml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');

// ------------------------------------------------------- stand-ins

const s = globalThis.__sabStub = {notes: [], files: new Map(),
  questions: [], answer: 'Cancel', dialogs: [], saves: [], menus: [],
  carets: 0, dirs: [], mkdirFails: null, writeFails: null};

/** The menu tree: one level, a window in it. */
const M = s.M = {isOpen: false, owner: null, top: null,
  open(w, x, y, o) {
    M.close();
    s.menus.push({w, x, y, o});
    Object.assign(w, {x, y, isOpen: true, _menuDbox: true});
    M.isOpen = true;
    M.top = w;
    if (w.emit) w.emit('menuopen', {});
  },
  close() {
    const w = M.top;
    M.top = null;
    M.isOpen = false;
    if (!w) return;
    w._menuDbox = false;
    w.isOpen = false;
    if (w.emit) w.emit('closed', {});
  }};

/** A core saveAs box: OK (press) saves as the core's does. */
s.saveAs = (o) => {
  const w = new Emitter();
  const name = {text: o.filename};
  Object.assign(w, {opts: o, isOpen: false, filetype: o.filetype,
    centred: 0, icons: [{}, name], filename: () => name.text,
    setFilename: (n) => { name.text = n; },
    setFiletype: (t) => { w.filetype = t; },
    bringToFront() {},
    openCentred() { w.isOpen = true; w.centred++; },
    close() { w.isOpen = false; w.emit('closed', {}); },
    delete() { w.isOpen = false; w.emit('deleted'); }});
  w.done = Promise.resolve();
  w.on('click', (ev) => {
    if (ev.icon !== w.icons[0]) return;
    w.done = (async () => {
      try {
        await o.save(name.text);
        if (M.top === w) M.close();
        w.close();
        if (o.onSaved) o.onSaved(name.text, {});
      } catch (e) {
        s.notes.push({m: e.message, o: {}});
      }
    })();
  });
  /** OK with path in the name. */
  w.press = (p) => {
    if (p !== undefined) name.text = p;
    w.emit('click', {icon: w.icons[0], button: 'select'});
    return w.done;
  };
  s.saves.push(w);
  return w;
};

/** Ui/Dialog: one box per task and key; press as a bottom button. */
const reg = new Map();
s.dialog = (o) => {
  const old = reg.get(o.key);
  if (old && !old.gone) return old;
  const vals = new Map();
  const h = {button: [], change: [], close: []};
  const win = new Emitter();
  let closed = true;
  const emit = (t, ev) => {
    let keep = false;
    for (const fn of h[t].slice()) if (fn(ev) === false) keep = true;
    return keep;
  };
  const ended = () => {
    if (closed) return;
    closed = true;
    emit('close', {});
  };
  win.on('closed', () => ended());
  const api = {opts: o, win, gone: false, opened: 0,
    get isOpen() { return win.isOpen; },
    get: (n) => vals.get(n),
    set(n, v) { vals.set(n, v); },
    shade() {}, focus() {},
    values: () => Object.fromEntries(vals),
    on(t, fn) { h[t].push(fn); },
    open() { win.isOpen = true; closed = false; api.opened++; },
    close() { win.isOpen = false; ended(); },
    delete() {
      if (api.gone) return;
      api.gone = true;
      if (M.top === win) M.close();
      win.isOpen = false;
      ended();
      reg.delete(o.key);
      win.emit('deleted');
    },
    /** A bottom button (the box deleted unless kept). */
    press(name) {
      if (api.gone) return;
      if (!emit('button', {name, values: api.values()})) api.delete();
    },
    /** The user picks a radio of group. */
    change(n, v) {
      vals.set(n, v);
      emit('change', {name: n, value: v});
    },
    /** The labels' texts, joined by spaces. */
    text: () => o.rows.flat().filter((c) => c.kind === 'label')
      .map((c) => c.text).join(' ')};
  win.isOpen = false;
  win.delete = () => api.delete();
  win.bringToFront = () => {};
  win.on('menuopen', () => { closed = false; });
  reg.set(o.key, api);
  s.dialogs.push(api);
  return api;
};

/** Every name a module under tools/moreapps imports from 'riscos'
 *  (as ./pdfbox.test.mjs finds them). */
function riscosNames() {
  const names = new Set();
  const dir = path.join(ROOT, 'tools/moreapps');
  for (const e of fs.readdirSync(dir, {recursive: true,
    withFileTypes: true})) {
    if (!e.isFile() || e.name.endsWith('.png')) continue;
    const src = fs.readFileSync(path.join(e.parentPath, e.name),
      'latin1');
    for (const m of src.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*'riscos'/g)) {
      for (const n of m[1].split(',')) {
        const k = n.trim().split(/\s+as\s+/)[0];
        if (k) names.add(k);
      }
    }
  }
  return names;
}
const OWN = new Set(['Menu', 'wimp', 'reportError', 'saveAs', 'vfs']);
const RISCOS = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__sabStub;' +
  'export class Menu {constructor(t, i) {this.title = t;' +
  ' this.items = i;}}' +
  'export const wimp = {beep() {}, menus: s.M,' +
  ' setCaret() { s.carets++; }, width: 2000, height: 1600};' +
  'export const reportError = (m, o) => { s.notes.push({m, o}); };' +
  'export const saveAs = (o) => s.saveAs(o);' +
  'export const vfs = {exists: (p) => s.files.has(p),' +
  ' leaf: (p) => p.slice(p.lastIndexOf(".") + 1),' +
  ' stat: (p) => (s.files.has(p) ? {} : null), canonical: (p) => p,' +
  ' mkdir(p) { if (s.mkdirFails) throw new Error(s.mkdirFails);' +
  ' s.dirs.push(p); return p; },' +
  ' list: (p) => { if (!s.dirs.includes(p)) throw new Error("no");' +
  ' return []; },' +
  ' readFile: async (p) => s.files.get(p).bytes,' +
  ' writeFile(p, b, o) { if (s.writeFails) throw new Error(' +
  's.writeFails); s.files.set(p, {bytes: b, ...o});' +
  ' return p; }};' +
  [...riscosNames()].filter((n) => !OWN.has(n))
    .map((n) => `export const ${n} = new Proxy(function () {}, ` +
      '{get: () => () => {}, apply: () => undefined});').join(''));
const DIALOG = 'data:text/javascript,' + encodeURIComponent(
  'export const dialog = (o) => globalThis.__sabStub.dialog(o);');
const QUERY = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__sabStub;' +
  'export const saveQuery = (o) => { s.questions.push(o);' +
  ' const p = Promise.resolve(s.answer); p.win = null; return p; };');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: RISCOS, shortCircuit: true};
  if (spec === 'wimplib/Ui/Dialog') {
    return {url: DIALOG, shortCircuit: true};
  }
  if (spec === 'wimplib/Ui/SaveQuery') {
    return {url: QUERY, shortCircuit: true};
  }
  return next(spec, ctx);
}});

const L = '../../tools/moreapps/!Letters/';
const SAB = await import(L + 'SaveAsBox');
const LB = await import(L + 'LostBox');
const DS = await import(L + 'DocSave');
const TD = await import(L + 'TemplateDir');
const SS = await import(L + 'SaveState');
const {readDocx} = await import(L + 'DocxRead');
const {isTemplate} = await import(L + 'Template');
const {openDoc, TEMPLATE_TYPE} = await import(L + 'Open');
const {windowMenu} = await import(L + 'WinMenu');
const {emit} = await import('./word-emit.mjs');

// ---------------------------------------------------------- fixtures

const DIR = 'ADFS::HardDisc4.$';
const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const latin1 = (b) => Buffer.from(b).toString('latin1');
const tick = () => new Promise((r) => setTimeout(r, 0));
const texts = (doc) => doc.sections.flatMap((x) => x.blocks)
  .filter((b) => b.type === 'p').map((b) => b.text);

/** A plain document: nothing RTF loses. */
function plainDoc(text = 'Hello.') {
  const d = newDoc({date: DATE});
  d.sections[0].blocks = [newPara(text)];
  return d;
}

/** A document holding a text box and an embedded object. */
function lostDoc() {
  const tag = el('w:smartTag', null, el('w:r', null,
    el('w:drawing', null, el('wps:txbx'))));
  const run = el('w:r', [['w:foo', '1']], el('w:object'));
  const d = newDoc({date: DATE});
  d.sections[0].blocks = [newPara('a' + OBJ + 'b' + OBJ + 'c',
    {inlines: {1: {kind: 'raw', level: 'p', node: tag, text: ''},
      3: {kind: 'raw', level: 'p', node: run, text: ''}}})];
  return d;
}
const LOST_TEXT = "2 items can't be stored in RTF: text boxes (1), " +
  'embedded objects (1).';

let keys = 0;
/** A window enough for the boxes (no desktop). */
function windowOf(doc, p, format = 'docx', app) {
  app = app || {task: {name: 'Letters', onMessage() {
    return () => {};
  }}, docs: new Map(), keyOf: (q) => String(q).toLowerCase(),
  rekey() {}, recent: [], noteRecent() {}};
  const dw = {app, path: p, leaf: p ? p.slice(p.lastIndexOf('.') + 1)
    : 'Untitled', doc, d: new Document(doc), format,
  boxes: new Map(), closed: false, docKey: ++keys,
  get isUntitled() { return !this.path; },
  view: {comp: null, hasFocus: false, mac: false, hdr: null,
    caretRect: () => null, focus() {}, d: null},
  win: {x: 100, y: 200, workToScreen: (x, y) => ({x, y})},
  viewName: 'draft', markup: 'final', retitled: 0,
  retitle() { this.retitled++; },
  saveBytes(f) { return DS.bytesOf(this, f); }};
  dw.view.d = dw.d;
  app.docs.set(app.keyOf(p || 'untitled' + keys), dw);
  return dw;
}
const close = (dw) => {
  dw.closed = true;
  for (const b of [...dw.boxes.values()]) b.delete();
};
/** The Save as box opened from the window menu, as the menu does. */
function fromMenu(dw) {
  const it = windowMenu(dw).items.find((i) => i.text === 'Save as');
  const win = it.submenu();
  M.open(win, 300, 400, {task: dw.app.task});
  return s.dialogs.find((d) => d.win === win);
}
const lostBoxes = () => s.dialogs.filter((d) => !d.gone &&
  d.opts.title === 'Save as RTF');
const saveBoxOf = (dw) => dw.boxes.get('saveas');

beforeEach(() => {
  M.close();
  s.notes = [];
  s.files = new Map();
  s.questions = [];
  s.answer = 'Cancel';
  s.menus = [];
});

// ---------------------------------------------------------- tests

beforeEach(() => {
  M.close();
  s.notes = [];
  s.files = new Map();
  s.questions = [];
  s.answer = 'Cancel';
  s.menus = [];
  s.dirs = [];
  s.mkdirFails = null;
  s.writeFails = null;
});

const snap = (dw) => ({name: dw.leaf, path: dw.path,
  format: dw.format, dirty: dw.d.dirty, from: dw.importedFrom,
  doc: structuredClone(dw.doc.sections.map((x) => x.blocks))});
const TPLDIR = TD.templatesDir();

describe('TemplateDir', () => {
  const fake = (over) => ({mkdir() { return 'x'; }, ...over});
  it('ensureDir creates, and a second call is fine', () => {
    const calls = [];
    const v = fake({mkdir: (p, o) => { calls.push([p, o]); }});
    assert.deepEqual(TD.ensureDir(v), {ok: true});
    assert.deepEqual(TD.ensureDir(v), {ok: true});
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], TPLDIR);
    assert.equal(calls[0][1].parents, true);
  });
  it('a failure is returned, never thrown', () => {
    const r = TD.ensureDir(fake({mkdir() { throw new Error('read-only');
    }}));
    assert.deepEqual(r, {error: 'read-only'});
    assert.ok(TD.ensureDir({}).error);   // (a stub with no mkdir)
  });
  it('the folder is not under the Choices file', () => {
    assert.ok(!TPLDIR.toLowerCase().startsWith('choices:letters.'));
  });
  it('list: templates only, sorted by leaf, capped, missing = []',
    () => {
      const f = (name, filetype, type = 'file') => ({name, filetype,
        type, path: `${TPLDIR}.${name}`});
      const v = {list: () => [f('b', TEMPLATE_TYPE),
        f('A', TEMPLATE_TYPE), f('x', 0xA7E), f('dir', 0, 'dir'),
        f('c', TEMPLATE_TYPE)]};
      assert.deepEqual(TD.list(v).map((i) => i.leaf),
        ['A', 'b', 'c']);
      assert.equal(TD.list(v)[0].path, `${TPLDIR}.A`);
      const many = {list: () => Array.from({length: 500}, (_, i) =>
        f('t' + String(i).padStart(3, '0'), TEMPLATE_TYPE))};
      assert.equal(TD.list(many).length, 200);
      assert.equal(TD.list(many).more, 300);
      assert.equal(TD.list(v).more, 0);
      assert.deepEqual(TD.list({list() { throw new Error('x'); }}), []);
      assert.deepEqual(TD.list({list: () => null}), []);
    });
});

describe('Save as: the third choice', () => {
  it('three radios; the default is the window\'s format', () => {
    const a = windowOf(plainDoc(), DIR + '.A/docx', 'docx');
    const b = windowOf(plainDoc(), DIR + '.B/rtf', 'rtf');
    const rows = (d) => d.opts.rows.filter((c) => c.kind === 'radio')
      .map((c) => [c.name, c.text]);
    const da = SAB.saveAsBox(a), db = SAB.saveAsBox(b);
    assert.deepEqual(rows(da), [['docx', 'Word document (.docx)'],
      ['rtf', 'Rich Text (.rtf)'], ['template', 'Word template (.dotx)']]);
    assert.equal(da.get('format'), 'docx');
    assert.equal(db.get('format'), 'rtf');
  });

  it('Continue: the template Save box in the Templates folder, ' +
    'with the type; the window unchanged; no RTF question', async () => {
    const a = windowOf(lostDoc(), DIR + '.Report/docx');
    const before = snap(a);
    const d = SAB.saveAsBox(a);
    d.set('format', 'template');
    d.press('Continue');
    await tick();
    const b = a.boxes.get('template');
    assert.ok(b.isOpen);
    assert.equal(b.filetype, TEMPLATE_TYPE);
    assert.equal(b.filename(), TPLDIR + '.Report/dotx');
    assert.deepEqual(s.dirs, [TPLDIR]);
    assert.equal(lostBoxes().length, 0);
    assert.equal(a.boxes.get('saveas'), undefined);
    await b.press();
    assert.deepEqual(snap(a), before);
    assert.equal(a.format, 'docx');
    const f = s.files.get(TPLDIR + '.Report/dotx');
    assert.equal(f.filetype, TEMPLATE_TYPE);
    assert.equal(s.notes.length, 0);
  });

  it('the file is a template that reopens as an untitled copy with ' +
    'the same text', async () => {
    const a = windowOf(plainDoc('Dear Sir.'), DIR + '.Report/docx');
    await DS.saveTemplate(a, DIR + '.T/dotx');
    const bytes = s.files.get(DIR + '.T/dotx').bytes;
    assert.ok(isTemplate(await readDocx(bytes)));
    const o = await openDoc({readFile: async () => bytes,
      stat: () => ({filetype: TEMPLATE_TYPE}),
      leaf: (p) => p.slice(p.lastIndexOf('.') + 1)}, DIR + '.T/dotx');
    assert.equal(o.imported, 'template');
    assert.deepEqual(texts(o.doc), ['Dear Sir.']);
    assert.ok(!isTemplate(o.doc));
    assert.ok(!isTemplate(a.doc));       // (the window's Doc: no)
    emit('tpl4-saved-template', bytes, {ext: '.dotx'});
  });

  it('an untitled document: centred, and nothing named by it', async () => {
    const a = windowOf(plainDoc(), null);
    const d = SAB.saveAsBox(a);
    d.set('format', 'template');
    d.press('Continue');
    await tick();
    const b = a.boxes.get('template');
    assert.equal(b.centred, 1);
    assert.equal(b.filename(), TPLDIR + '.Untitled/dotx');
    await b.press();
    assert.equal(a.path, null);
    assert.equal(a.isUntitled, true);
  });

  it('a starter-made document is offered its CamelCase title; ' +
    'a taken name is numbered', async () => {
    const a = windowOf(plainDoc(), null);
    a.suggestedTitle = 'Fax cover sheet';
    const d = SAB.saveAsBox(a);
    d.set('format', 'template');
    d.press('Continue');
    await tick();
    const b = a.boxes.get('template');
    assert.equal(b.filename(), TPLDIR + '.FaxCoverSheet/dotx');
    s.files.set(TPLDIR + '.FaxCoverSheet/dotx', new Uint8Array(1));
    b.close();
    const d2 = SAB.saveAsBox(a);
    d2.set('format', 'template');
    d2.press('Continue');
    await tick();
    assert.equal(a.boxes.get('template').filename(),
      TPLDIR + '.FaxCoverSheet2/dotx');
    s.files.delete(TPLDIR + '.FaxCoverSheet/dotx');
    assert.equal(a.isUntitled, true);
  });

  it('an imported document: unchanged, importedFrom kept', async () => {
    const a = windowOf(plainDoc(), null);
    a.importedFrom = DIR + '.Old/odt';
    a.imported = 'odt';
    a.leaf = 'Old/odt';
    const before = snap(a);
    await DS.saveTemplate(a, DIR + '.Old/dotx');
    assert.deepEqual(snap(a), before);
    assert.equal(a.imported, 'odt');
    await assert.rejects(DS.saveTemplate(a, DIR + '.Old/odt'),
      /opened from/);
  });

  it('a write error: told as Save does, window untouched',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.Report/docx');
      a.d.dirty;                         // (read only)
      const before = snap(a);
      s.writeFails = 'disc full';
      await assert.rejects(DS.saveTemplate(a, DIR + '.T/dotx'),
        /'T\/dotx' could not be saved: disc full/);
      assert.deepEqual(snap(a), before);
      const d = SAB.saveAsBox(a);
      d.set('format', 'template');
      d.press('Continue');
      await tick();
      await a.boxes.get('template').press();
      assert.match(s.notes.at(-1).m, /could not be saved: disc full/);
      assert.deepEqual(snap(a), before);
    });

  it('the folder cannot be made: said once, the usual folder is ' +
    'offered, and saving still changes nothing', async () => {
    const a = windowOf(plainDoc(), null);
    s.mkdirFails = 'Choices is read-only';
    const before = snap(a);
    for (let i = 0; i < 2; i++) {
      const d = SAB.saveAsBox(a);
      d.set('format', 'template');
      d.press('Continue');
      await tick();
      const b = a.boxes.get('template');
      assert.equal(b.filename(), DIR + '.Untitled/dotx');
      b.close();
    }
    assert.equal(s.notes.length, 1);
    assert.match(s.notes[0].m, /Choices is read-only/);
    await a.boxes.get('template').press();
    assert.deepEqual(snap(a), before);
    assert.ok(s.files.has(DIR + '.Untitled/dotx'));
  });

  it('OK onto a file that is there: Replace / Cancel first',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.Report/docx');
      s.files.set(TPLDIR + '.Report/dotx', {bytes: new Uint8Array(1)});
      const d = SAB.saveAsBox(a);
      d.set('format', 'template');
      d.press('Continue');
      await tick();
      const b = a.boxes.get('template');
      // (the name offered skips the file that is there)
      assert.equal(b.filename(), TPLDIR + '.Report2/dotx');
      b.setFilename(TPLDIR + '.Report/dotx');
      s.answer = 'Cancel';
      await b.press();
      await tick();
      assert.equal(s.questions.length, 1);
      assert.equal(s.files.get(TPLDIR + '.Report/dotx').bytes.length, 1);
      s.answer = 'Replace';
      await b.press();
      await tick();
      await b.done;
      assert.ok(s.files.get(TPLDIR + '.Report/dotx').bytes.length > 100);
    });

  it('a document made from a template: Save as template over that ' +
    'template, after Replace (the guide\'s way of changing one)',
  async () => {
    const src = TPLDIR + '.Letter/dotx';
    s.files.set(src, {bytes: new Uint8Array(1)});
    const a = windowOf(plainDoc('Changed.'), null);
    a.imported = 'template';
    a.importedFrom = src;
    a.leaf = 'Letter';
    const before = snap(a);
    const d = SAB.saveAsBox(a);
    d.set('format', 'template');
    d.press('Continue');
    await tick();
    const b = a.boxes.get('template');
    b.setFilename(src);
    s.answer = 'Cancel';
    await b.press();
    await tick();
    assert.equal(s.questions.length, 1);   // (asked, not refused)
    assert.equal(s.files.get(src).bytes.length, 1);
    s.answer = 'Replace';
    await b.press();
    await tick();
    await b.done;
    assert.ok(s.files.get(src).bytes.length > 100);
    assert.deepEqual(snap(a), before);     // (the window is as it was)
    assert.equal(a.imported, 'template');
    assert.equal(DS.canWrite(a, src, true), null);
  });

  it('refusals keep their words: a template window saved as a ' +
    '.docx over its source; an ODT window as a template', async () => {
    const src = TPLDIR + '.Letter/dotx';
    const a = windowOf(plainDoc(), null);
    a.imported = 'template';
    a.importedFrom = src;
    assert.match(DS.canWrite(a, src),
      /opened from: save it under another name, as a \.docx\.$/);
    const o = windowOf(plainDoc(), null);
    o.imported = 'odt';
    o.importedFrom = DIR + '.Old/odt';
    assert.match(DS.canWrite(o, DIR + '.Old/odt', true),
      /opened from: save it under another name\.$/);
    assert.match(DS.canWrite(o, DIR + '.Old/odt'), /as a \.docx\./);
    // (another window's file is refused for a template window too)
    const x = windowOf(plainDoc(), DIR + '.B/dotx', 'docx', a.app);
    assert.match(DS.canWrite(a, DIR + '.B/dotx', true),
      /open in another window/);
    assert.ok(x);
  });

  it('the name offered for a document made from a template is in ' +
    'the default folder, not the Templates folder', () => {
    const src = TPLDIR + '.Letter/dotx';
    const a = windowOf(plainDoc(), null);
    a.imported = 'template';
    a.importedFrom = src;
    const n = SS.suggestName(a, DIR);
    assert.equal(n, DIR + '.Letter/docx');
    // an ODT's copy still goes beside it
    a.imported = 'odt';
    a.importedFrom = DIR + '.Sub.Old/odt';
    assert.equal(SS.suggestName(a, 'X'), DIR + '.Sub.Old/docx');
  });

  it('the offered template name is the one probed for a clash',
    () => {
      const a = windowOf(plainDoc(), null);
      a.leaf = 'Memo';
      s.files.set(TPLDIR + '.Memo/dotx', {bytes: new Uint8Array(1)});
      const d = SAB.saveAsBox(a);
      d.set('format', 'template');
      d.press('Continue');
      const b = a.boxes.get('template');
      assert.equal(b.filename(), TPLDIR + '.Memo2/dotx');
    });

  it('another open window\'s file is refused', async () => {
    const a = windowOf(plainDoc(), DIR + '.A/docx');
    const o = windowOf(plainDoc(), DIR + '.B/dotx', 'docx', a.app);
    await assert.rejects(DS.saveTemplate(a, DIR + '.B/dotx'),
      /open in another window/);
    assert.equal(s.files.has(DIR + '.B/dotx'), false);
    assert.ok(o);
  });

  it('a macro-enabled package is never written as a template',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.A/docx');
      const m = a.doc.meta;
      m.contentTypes.overrides[0][1] = m.contentTypes.overrides[0][1]
        .replace('document.main', 'document.macroEnabled.main');
      await assert.rejects(DS.saveTemplate(a, DIR + '.A/dotx'),
        /macro/);
      assert.equal(s.files.size, 0);
    });

  it('docx and rtf choices still open the Save box as before',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.Report/docx');
      const d = SAB.saveAsBox(a);
      d.set('format', 'rtf');
      d.press('Continue');
      await tick();
      assert.equal(a.boxes.get('saveas').filetype, 0xC32);
      assert.equal(a.boxes.get('template'), undefined);
    });
});
