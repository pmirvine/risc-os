// The Save as box (Batch G2, task 11): the window menu's Save as and
// its key (F3) open a box that asks Word document (.docx) or Rich
// Text (.rtf), the window's own format chosen; Continue opens the
// Save box with the name and file type of the format chosen. RTF
// chosen for a document holding what RTF cannot store: one
// information step first, listing it in ./RtfLost's words, Continue
// or Cancel (Cancel: nothing written, nothing changed). A save that
// writes sets the window's format (later Saves follow it). Plain
// Save of an RTF window that would lose something says so once per
// window. Boxes made once per window, the state looked up when it
// is used: a second Save as (also after a Cancel) and a second
// window work; a window closed with a box open leaves nothing
// behind. ('riscos', the Dialog and the Replace question replaced
// by stand-ins; the real writers make the bytes.)
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
  carets: 0};

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
  ' stat: () => ({}), canonical: (p) => p,' +
  ' readFile: async (p) => s.files.get(p).bytes,' +
  ' writeFile(p, b, o) { s.files.set(p, {bytes: b, ...o});' +
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
const {copyBox} = await import(L + 'CopySave');
const {windowMenu} = await import(L + 'WinMenu');
const {docCommand} = await import(L + 'DocKeys');

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

describe('the Save as box: the format', () => {
  it('a .docx window: Word document chosen; an RTF window: Rich ' +
    'Text', () => {
    const a = windowOf(plainDoc(), DIR + '.A/docx', 'docx');
    const b = windowOf(plainDoc(), DIR + '.B/rtf', 'rtf');
    const x = fromMenu(a);
    assert.equal(x.get('format'), 'docx');
    assert.equal(x.opts.title, 'Save as');
    assert.deepEqual(x.opts.buttons, ['Cancel', 'Continue']);
    const radios = x.opts.rows.flat().filter((c) => c.kind === 'radio');
    assert.deepEqual(radios.map((c) => [c.value, c.text]),
      [['docx', 'Word document (.docx)'], ['rtf', 'Rich Text (.rtf)'],
        ['template', 'Word template (.dotx)']]);
    M.close();
    assert.equal(fromMenu(b).get('format'), 'rtf');
  });

  it('opened again after Cancel: the window\'s format again', () => {
    const a = windowOf(plainDoc(), DIR + '.A/docx', 'docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Cancel');
    assert.equal(x.gone, false, 'the box is kept');
    assert.equal(x.isOpen, false);
    const y = fromMenu(a);
    assert.equal(y, x, 'the same box');
    assert.equal(y.get('format'), 'docx');
    assert.equal(s.files.size, 0);
    assert.equal(a.format, 'docx');
  });

  it('closed by a click elsewhere (no Cancel): the window\'s format ' +
    'again next time', () => {
    const a = windowOf(plainDoc(), DIR + '.A/docx', 'docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    M.close();                         // (the menu dismissed)
    assert.equal(x.isOpen, false);
    assert.equal(fromMenu(a).get('format'), 'docx');
    M.close();
    docCommand(a, 'saveBox');          // (and by F3)
    assert.equal(x.get('format'), 'docx');
  });

  it('asked again while open: left as it is (the same box, the ' +
    'choice kept)', () => {
    const a = windowOf(plainDoc(), DIR + '.A/docx', 'docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    assert.equal(SAB.saveAsBox(a), x);
    assert.equal(x.get('format'), 'rtf');
  });
});

describe('Continue: the Save box for the format chosen', () => {
  it('RTF for a .docx window: an RTF name and &C32; OK writes RTF ' +
    'and the window is RTF from then on', async () => {
    const a = windowOf(plainDoc('Typed.'), DIR + '.Report/docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    assert.equal(lostBoxes().length, 0, 'nothing lost: no question');
    const b = saveBoxOf(a);
    assert.equal(b.isOpen, true);
    assert.equal(M.top, b, 'opened where the box was, as a menu');
    assert.equal(b.filename(), DIR + '.Report/rtf');
    assert.equal(b.filetype, 0xC32);
    await b.press();
    const f = s.files.get(DIR + '.Report/rtf');
    assert.ok(f, [...s.files.keys()].join());
    assert.equal(f.filetype, 0xC32);
    assert.ok(latin1(f.bytes).startsWith('{\\rtf1'));
    assert.ok(f.bytes.every((c) => c < 0x80), 'ASCII');
    assert.deepEqual(texts(readRtf(f.bytes).doc), ['Typed.']);
    assert.equal(a.format, 'rtf');
    assert.equal(a.path, DIR + '.Report/rtf');
    assert.equal(a.d.dirty, false);
    assert.deepEqual(s.notes, []);
    // later Save follows the new format
    s.files.clear();
    assert.equal(await DS.save(a), true);
    assert.equal(s.files.get(DIR + '.Report/rtf').filetype, 0xC32);
  });

  it('.docx for an RTF window: converted, &A7E, the window .docx',
    async () => {
      const r = readRtf(Buffer.from('{\\rtf1\\ansi{\\fonttbl{\\f0 ' +
        'Times;}}\\f0 From RTF.\\par}', 'latin1')).doc;
      const a = windowOf(r, DIR + '.Letter/rtf', 'rtf');
      const x = fromMenu(a);
      assert.equal(x.get('format'), 'rtf');
      x.change('format', 'docx');
      x.press('Continue');
      await tick();
      assert.equal(lostBoxes().length, 0, 'to .docx: never a question');
      const b = saveBoxOf(a);
      assert.equal(b.filename(), DIR + '.Letter/docx');
      assert.equal(b.filetype, 0xA7E);
      await b.press();
      const f = s.files.get(DIR + '.Letter/docx');
      assert.equal(f.filetype, 0xA7E);
      assert.deepEqual([...f.bytes.slice(0, 2)], [0x50, 0x4b]);
      assert.equal(a.format, 'docx');
      assert.equal(a.path, DIR + '.Letter/docx');
    });

  it('the window\'s own format: the Save box as before', async () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    fromMenu(a).press('Continue');
    await tick();
    const b = saveBoxOf(a);
    assert.equal(b.filename(), DIR + '.Report/docx');
    assert.equal(b.filetype, 0xA7E);
    await b.press(DIR + '.Other/docx');
    assert.equal(s.files.get(DIR + '.Other/docx').filetype, 0xA7E);
    assert.equal(a.format, 'docx');
    assert.equal(a.path, DIR + '.Other/docx');
  });

  it('the Save a copy box takes the new file type', async () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    const c = copyBox(a);
    assert.equal(c.filetype, 0xA7E);
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    await saveBoxOf(a).press();
    assert.equal(c.filetype, 0xC32);
    assert.equal(c.filename(), DIR + '.Report/rtf');
  });

  it('an untitled document: the Save box centred, as Save opens it',
    async () => {
      const a = windowOf(plainDoc(), null);
      const x = fromMenu(a);
      x.change('format', 'rtf');
      x.press('Continue');
      await tick();
      const b = saveBoxOf(a);
      assert.equal(b.isOpen, true);
      assert.equal(b.centred, 1);
      assert.equal(b.filename(), DIR + '.Untitled');
      assert.equal(b.filetype, 0xC32);
      await b.press();
      assert.equal(s.files.get(DIR + '.Untitled').filetype, 0xC32);
      assert.equal(a.format, 'rtf');
    });

  it('a drag to another program gets the bytes of the format chosen',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.Report/docx');
      const x = fromMenu(a);
      x.change('format', 'rtf');
      x.press('Continue');
      await tick();
      const bytes = await saveBoxOf(a).opts.getData();
      assert.ok(latin1(bytes).startsWith('{\\rtf1'));
      assert.equal(a.format, 'docx', 'nothing saved: unchanged');
    });
});

describe('what RTF cannot store: one question first', () => {
  it('the text, in the pinned words', () => {
    assert.equal(LB.lostText([{what: LOST.textBoxes, count: 1},
      {what: LOST.objects, count: 1}]), LOST_TEXT);
    assert.equal(LB.lostText([{what: LOST.pictures, count: 1}]),
      "1 item can't be stored in RTF: pictures (1).");
    assert.equal(LB.lostText([{what: LOST.pictures, count: 3},
      {what: LOST.textBoxes, count: 1}]),
    "4 items can't be stored in RTF: pictures (3), text boxes (1).");
  });

  it('bounded: every kind, huge counts', () => {
    const all = Object.values(LOST).map((what, i) => ({what,
      count: 1e9 + i}));
    const t = LB.lostText(all);
    assert.ok(t.length <= LB.MAX_TEXT, t.length);
    assert.ok(t.startsWith(`${all.reduce((n, x) => n + x.count, 0)} ` +
      "items can't be stored in RTF: items of an unknown kind ("), t);
    assert.ok(/, and \d+ other kinds\.$/.test(t), t);
    assert.ok(LB.lostText([]).length > 0, 'never empty');
  });

  it('shown once; Cancel there writes nothing and changes nothing',
    async () => {
      const a = windowOf(lostDoc(), DIR + '.Report/docx');
      const x = fromMenu(a);
      x.change('format', 'rtf');
      x.press('Continue');
      await tick();
      const q = lostBoxes();
      assert.equal(q.length, 1);
      assert.equal(q[0].opened, 1);
      assert.ok(q[0].text().startsWith(LOST_TEXT), q[0].text());
      assert.deepEqual(q[0].opts.buttons, ['Cancel', 'Continue']);
      assert.equal(saveBoxOf(a), undefined, 'no Save box yet');
      q[0].press('Cancel');
      await tick();
      assert.equal(saveBoxOf(a), undefined);
      assert.equal(s.files.size, 0);
      assert.equal(a.format, 'docx');
      assert.equal(a.path, DIR + '.Report/docx');
      assert.equal(lostBoxes().length, 0);
    });

  it('Continue there: the Save box, then RTF written', async () => {
    const a = windowOf(lostDoc(), DIR + '.Report/docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    lostBoxes()[0].press('Continue');
    await tick();
    assert.equal(lostBoxes().length, 0);
    const b = saveBoxOf(a);
    assert.equal(b.isOpen, true);
    assert.equal(b.filetype, 0xC32);
    await b.press();
    assert.equal(s.files.get(DIR + '.Report/rtf').filetype, 0xC32);
    assert.equal(a.format, 'rtf');
  });

  it('worked out at Continue, over the document as it is then',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.Report/docx');
      const x = fromMenu(a);
      x.change('format', 'rtf');
      a.doc = lostDoc();               // (inserted while the box was up)
      x.press('Continue');
      await tick();
      assert.equal(lostBoxes().length, 1);
      lostBoxes()[0].press('Cancel');
      a.doc = plainDoc();
      const y = fromMenu(a);
      y.change('format', 'rtf');
      y.press('Continue');
      await tick();
      assert.equal(lostBoxes().length, 0);
      assert.equal(saveBoxOf(a).isOpen, true);
    });

  it('an RTF window saved as RTF under a new name: asked too',
    async () => {
      const a = windowOf(lostDoc(), DIR + '.Letter/rtf', 'rtf');
      fromMenu(a).press('Continue');
      await tick();
      assert.equal(lostBoxes().length, 1);
      lostBoxes()[0].press('Continue');
      await tick();
      await saveBoxOf(a).press(DIR + '.New/rtf');
      assert.equal(s.files.get(DIR + '.New/rtf').filetype, 0xC32);
    });

  it('.docx chosen for a document RTF would lose things from: no ' +
    'question', async () => {
    const a = windowOf(lostDoc(), DIR + '.Report/docx');
    fromMenu(a).press('Continue');
    await tick();
    assert.equal(lostBoxes().length, 0);
    assert.equal(saveBoxOf(a).filetype, 0xA7E);
  });
});

describe('boxes made once, state looked up when used', () => {
  it('a name typed in the open Save box is kept; the format ' +
    'changed: its extension switched', async () => {
    const a = windowOf(plainDoc(), null);
    DS.save(a);                        // (the Save box, centred)
    const b = saveBoxOf(a);
    b.setFilename(DIR + '.Typed/docx');
    let x = fromMenu(a);
    x.press('Continue');               // (.docx again)
    await tick();
    assert.equal(b.filename(), DIR + '.Typed/docx');
    x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    assert.equal(b.filename(), DIR + '.Typed/rtf');
    assert.equal(b.filetype, 0xC32);
  });

  it('a failure on the way is said in an error box', async () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    a.boxes.set('saveas', {on() {}, delete() {}, isOpen: false,
      filetype: 0, setFiletype() { throw new Error('No room'); }});
    x.press('Continue');
    await tick();
    assert.deepEqual(s.notes.map((n) => n.m), ['No room']);
    a.boxes.delete('saveas');
  });

  it('two Save as runs on one window (one after a Cancel) both ' +
    'write', async () => {
    const a = windowOf(lostDoc(), DIR + '.Report/docx');
    const n0 = s.dialogs.length;
    let x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Cancel');
    x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    lostBoxes()[0].press('Cancel');      // (and Cancel here too)
    x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    lostBoxes()[0].press('Continue');
    await tick();
    const b = saveBoxOf(a);
    await b.press(DIR + '.One/rtf');
    assert.equal(s.files.get(DIR + '.One/rtf').filetype, 0xC32);
    x = fromMenu(a);
    assert.equal(x.get('format'), 'rtf', 'the window is RTF now');
    x.change('format', 'docx');
    x.press('Continue');
    await tick();
    assert.equal(saveBoxOf(a), b, 'the same Save box');
    assert.equal(b.filename(), DIR + '.One/docx');
    await b.press();
    assert.equal(s.files.get(DIR + '.One/docx').filetype, 0xA7E);
    assert.equal(a.format, 'docx');
    // one Save as box made for the window, ever
    const mine = s.dialogs.slice(n0).filter((d) =>
      d.opts.title === 'Save as');
    assert.equal(mine.length, 1);
  });

  it('two windows: each its own box and its own choice', async () => {
    const a = windowOf(plainDoc('A'), DIR + '.A/docx');
    const b = windowOf(plainDoc('B'), DIR + '.B/docx', 'docx', a.app);
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    const y = fromMenu(b);
    assert.notEqual(y, x);
    assert.equal(y.get('format'), 'docx');
    y.press('Continue');
    await tick();
    assert.notEqual(saveBoxOf(a), saveBoxOf(b));
    assert.equal(saveBoxOf(b).filetype, 0xA7E);
    await saveBoxOf(b).press();
    await saveBoxOf(a).press();
    assert.equal(s.files.get(DIR + '.B/docx').filetype, 0xA7E);
    assert.equal(s.files.get(DIR + '.A/rtf').filetype, 0xC32);
    assert.equal(a.format, 'rtf');
    assert.equal(b.format, 'docx');
  });

  it('a file that is there: Replace / Cancel first', async () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    s.files.set(DIR + '.Report/rtf', {bytes: new Uint8Array(1)});
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    const b = saveBoxOf(a);
    s.answer = 'Cancel';
    await b.press();
    await tick();
    assert.equal(s.questions.length, 1);
    assert.equal(s.questions[0].message,
      "'Report/rtf' already exists. Replace it?");
    assert.equal(s.files.get(DIR + '.Report/rtf').bytes.length, 1);
    assert.equal(a.format, 'docx');
    s.answer = 'Replace';
    b.emit('click', {icon: b.icons[0], button: 'select'});
    await tick();
    await b.done;
    assert.equal(s.files.get(DIR + '.Report/rtf').filetype, 0xC32);
    assert.equal(a.format, 'rtf');
  });

  it('the window closed while the question is up: nothing written, ' +
    'nothing left', async () => {
    const a = windowOf(lostDoc(), DIR + '.Report/docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    const q = lostBoxes()[0];
    close(a);
    await tick();
    assert.equal(q.gone, true);
    assert.equal(x.gone, true);
    assert.equal(saveBoxOf(a), undefined);
    assert.equal(s.files.size, 0);
    assert.equal(a.boxes.size, 0);
  });

  it('the window closed while the Save as box is open: gone with ' +
    'it; Continue then does nothing', async () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    const x = fromMenu(a);
    x.change('format', 'rtf');
    a.closed = true;
    x.press('Continue');
    await tick();
    assert.equal(saveBoxOf(a), undefined);
    close(a);
    assert.equal(x.gone, true);
    assert.equal(a.boxes.size, 0);
  });
});

describe('the menu item and the key', () => {
  it('the window menu\'s Save as (F3): the Save as box', () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    const it0 = windowMenu(a).items.find((i) => i.text === 'Save as');
    assert.equal(it0.key, 'F3');
    const w = it0.submenu();
    assert.equal(w, SAB.saveAsBox(a).win);
    assert.equal(it0.submenu(), w, 'made once');
  });

  it('F3: the Save as box near the caret, as a menu', () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    assert.equal(docCommand(a, 'saveBox'), true);
    const x = SAB.saveAsBox(a);
    assert.equal(M.top, x.win);
    assert.equal(x.isOpen, true);
    assert.equal(x.get('format'), 'docx');
    const n = s.menus.length;
    assert.equal(docCommand(a, 'saveBox'), true);
    assert.equal(s.menus.length, n, 'open: left as it is');
  });

  it('F3 while the Save box is open: left as it is', async () => {
    const a = windowOf(plainDoc(), DIR + '.Report/docx');
    docCommand(a, 'saveBox');
    SAB.saveAsBox(a).press('Continue');
    await tick();
    assert.equal(M.top, saveBoxOf(a));
    const n = s.menus.length;
    docCommand(a, 'saveBox');
    assert.equal(s.menus.length, n);
    assert.equal(M.top, saveBoxOf(a));
  });

  it('F3 on an untitled document: the Save as box too', async () => {
    const a = windowOf(plainDoc(), null);
    docCommand(a, 'saveBox');
    const x = SAB.saveAsBox(a);
    assert.equal(M.top, x.win);
    x.press('Continue');
    await tick();
    assert.equal(saveBoxOf(a).centred, 1);
    assert.equal(saveBoxOf(a).filetype, 0xA7E);
  });
});

describe('the RTF written once per state of the document', () => {
  /** Counts the writer's calls while fn runs. */
  async function counted(fn) {
    const real = LB.RTF.write;
    let n = 0;
    LB.RTF.write = (doc) => { n++; return real(doc); };
    try { await fn(); } finally { LB.RTF.write = real; }
    return n;
  }
  const edit = (dw) => dw.d.apply({op: 'replaceText', block: [0, 0],
    at: 0, del: 0, ins: 'x'});

  it('Save of an RTF window: written once; Save again with no edit:' +
    ' not again; an edit: once more', async () => {
    const a = windowOf(plainDoc(), DIR + '.Letter/rtf', 'rtf');
    assert.equal(await counted(() => DS.save(a)), 1);
    assert.equal(await counted(() => DS.save(a)), 0);
    edit(a);
    assert.equal(await counted(() => DS.save(a)), 1);
    const f = s.files.get(DIR + '.Letter/rtf');
    assert.deepEqual(texts(readRtf(f.bytes).doc), ['xHello.']);
  });

  it('Save as RTF with the question: written once', async () => {
    const a = windowOf(lostDoc(), DIR + '.Report/docx');
    const n = await counted(async () => {
      const x = fromMenu(a);
      x.change('format', 'rtf');
      x.press('Continue');
      await tick();
      lostBoxes()[0].press('Continue');
      await tick();
      await saveBoxOf(a).press();
    });
    assert.equal(n, 1);
    assert.equal(s.files.get(DIR + '.Report/rtf').filetype, 0xC32);
  });
});

describe('plain Save of an RTF window that would lose things', () => {
  it('told, then an edit adding more RTF cannot store: asked again;' +
    ' an edit adding none: not', async () => {
    const a = windowOf(lostDoc(), DIR + '.Letter/rtf', 'rtf');
    const p = DS.save(a);
    await tick();
    lostBoxes()[0].press('Continue');
    assert.equal(await p, true);
    a.d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'x'});
    assert.equal(await DS.save(a), true);
    assert.equal(lostBoxes().length, 0, 'nothing more lost');
    const more = lostDoc();          // (two more items of each kind)
    more.sections[0].blocks.push(...lostDoc().sections[0].blocks);
    a.doc = more;
    const p2 = DS.save(a);
    await tick();
    assert.equal(lostBoxes().length, 1, 'more lost: asked again');
    assert.ok(lostBoxes()[0].text().startsWith('4 items'));
    lostBoxes()[0].press('Cancel');
    assert.equal(await p2, false);
  });

  it('said once per window; Cancel saves nothing', async () => {
    const a = windowOf(lostDoc(), DIR + '.Letter/rtf', 'rtf');
    const p = DS.save(a);
    await tick();
    assert.equal(lostBoxes().length, 1);
    assert.ok(lostBoxes()[0].text().startsWith(LOST_TEXT));
    lostBoxes()[0].press('Cancel');
    assert.equal(await p, false);
    assert.equal(s.files.size, 0);
    // asked again: still not told
    const p2 = DS.save(a);
    await tick();
    assert.equal(lostBoxes().length, 1);
    lostBoxes()[0].press('Continue');
    assert.equal(await p2, true);
    assert.equal(s.files.get(DIR + '.Letter/rtf').filetype, 0xC32);
    // told: not asked again
    s.files.clear();
    assert.equal(await DS.save(a), true);
    assert.equal(lostBoxes().length, 0);
    assert.ok(s.files.has(DIR + '.Letter/rtf'));
  });

  it('nothing lost, or a .docx window: never asked', async () => {
    const a = windowOf(plainDoc(), DIR + '.Letter/rtf', 'rtf');
    assert.equal(await DS.save(a), true);
    const b = windowOf(lostDoc(), DIR + '.R/docx', 'docx');
    assert.equal(await DS.save(b), true);
    assert.equal(lostBoxes().length, 0);
  });

  it('told by the Save as question: plain Save then asks nothing',
    async () => {
      const a = windowOf(lostDoc(), DIR + '.Report/docx');
      const x = fromMenu(a);
      x.change('format', 'rtf');
      x.press('Continue');
      await tick();
      lostBoxes()[0].press('Continue');
      await tick();
      await saveBoxOf(a).press();
      assert.equal(a.format, 'rtf');
      assert.equal(await DS.save(a), true);
      assert.equal(lostBoxes().length, 0);
    });

  it('the window closed while asked: false, nothing written',
    async () => {
      const a = windowOf(lostDoc(), DIR + '.Letter/rtf', 'rtf');
      const p = DS.save(a);
      await tick();
      close(a);
      assert.equal(await p, false);
      assert.equal(s.files.size, 0);
    });
});

describe('final review: asked whenever more would be lost', () => {
  it('an untitled window: Save as RTF, Continue, a picture put in, ' +
    'OK: asked first; Cancel writes nothing, the box stays open, the ' +
    'window keeps its changes', async () => {
    const a = windowOf(plainDoc(), null);
    const x = fromMenu(a);
    x.change('format', 'rtf');
    x.press('Continue');
    await tick();
    assert.equal(lostBoxes().length, 0, 'nothing lost yet');
    const b = saveBoxOf(a);
    assert.equal(b.isOpen, true);
    a.doc = lostDoc();                 // (put in with the box open)
    a.d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'x'});
    await b.press();
    await tick();
    assert.equal(lostBoxes().length, 1, 'asked');
    assert.ok(lostBoxes()[0].text().startsWith(LOST_TEXT));
    lostBoxes()[0].press('Cancel');
    await tick();
    assert.equal(s.files.size, 0, 'nothing written');
    assert.equal(b.isOpen, true, 'the Save box still open');
    assert.equal(a.d.dirty, true);
    assert.equal(a.path, null);
    // OK again: asked again; Continue writes
    await b.press();
    await tick();
    assert.equal(lostBoxes().length, 1);
    lostBoxes()[0].press('Continue');
    await tick();
    await b.done;
    assert.equal(s.files.get(DIR + '.Untitled').filetype, 0xC32);
    assert.equal(a.format, 'rtf');
    assert.equal(a.d.dirty, false);
  });

  it('Save as RTF, Continue, then Escape in the Save box: the next ' +
    'Save of the RTF window still asks', async () => {
    const a = windowOf(lostDoc(), DIR + '.Letter/rtf', 'rtf');
    fromMenu(a).press('Continue');
    await tick();
    lostBoxes()[0].press('Continue');
    await tick();
    assert.equal(M.top, saveBoxOf(a));
    M.close();                         // (Escape: nothing written)
    assert.equal(s.files.size, 0);
    const p = DS.save(a);
    await tick();
    assert.equal(lostBoxes().length, 1, 'not told: nothing was saved');
    lostBoxes()[0].press('Cancel');
    assert.equal(await p, false);
  });

  it('the bytes saved are a copy, never the cached RTF itself',
    async () => {
      const a = windowOf(plainDoc(), DIR + '.Letter/rtf', 'rtf');
      const one = await DS.bytesOf(a, 'rtf');
      const two = await DS.bytesOf(a, 'rtf');
      assert.notEqual(one, two);
      assert.notEqual(one, LB.rtfOf(a).bytes);
      assert.deepEqual(one, LB.rtfOf(a).bytes);
      assert.equal(await DS.save(a), true);
      const f = s.files.get(DIR + '.Letter/rtf').bytes;
      assert.notEqual(f, LB.rtfOf(a).bytes);
      f[0] = 0;
      assert.equal(LB.rtfOf(a).bytes[0], 0x7b, 'the cache unchanged');
      assert.equal((await DS.bytesOf(a, 'rtf'))[0], 0x7b);
    });

  it('Quit with a close waiting: the Save as RTF question to the ' +
    'front', async () => {
    const {mayQuit} = await import(L + 'Quit');
    const a = windowOf(lostDoc(), DIR + '.Letter/rtf', 'rtf');
    const p = DS.save(a);
    await tick();
    const q = lostBoxes()[0];
    let fronted = 0;
    q.win.bringToFront = () => { fronted++; };
    const app = a.app;
    app.task.alive = true;
    app.closing = new Promise(() => {});
    mayQuit(app);
    assert.equal(fronted, 1);
    q.press('Cancel');
    assert.equal(await p, false);
  });
});
