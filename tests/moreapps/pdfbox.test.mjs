// The Export as PDF box (Batch G1, task 8): the window menu's Export as PDF...
// opens it; Pages All or From / To (clamped to the pages there are,
// an empty field the end of its side, From after To refused with a
// beep and a message, nothing written); the markup the pages show,
// named; OK opens the save box (a .pdf name, file type &ADF, the
// Replace question for a file that is there), whose save runs the
// export with its progress in the box: Cancel or the window closing
// stops it, nothing written and no error; a write that fails is said
// as Save a copy says it; the fonts' missing characters one
// information notice; the document, undo and modified state never
// touched. ('riscos', the Dialog and the Replace question replaced
// by stand-ins; the real export writes the file, from the real
// bundled fonts.)
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Emitter} from '../../src/core/util.js';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');

// ------------------------------------------------------- stand-ins

const s = globalThis.__pbStub = {notes: [], beeps: 0, files: new Map(),
  writeFail: null, questions: [], answer: 'Cancel', dialogs: [],
  saves: [], onMsg: null, reads: []};

/** A core saveAs box: OK (press) saves as the core's does. */
s.saveAs = (o) => {
  const w = new Emitter();
  const name = {text: o.filename};
  Object.assign(w, {opts: o, isOpen: false, filetype: o.filetype,
    icons: [{}, name], filename: () => name.text,
    setFilename: (n) => { name.text = n; },
    openCentred() { w.isOpen = true; }, close() { w.isOpen = false; },
    delete() { w.isOpen = false; w.emit('deleted'); }});
  w.done = Promise.resolve();
  w.on('click', (ev) => {
    if (ev.icon !== w.icons[0]) return;
    w.done = (async () => {
      try {
        await o.save(name.text);
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
  const vals = new Map(), shaded = new Set();
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
  const api = {opts: o, win, gone: false, focused: null,
    get isOpen() { return win.isOpen; },
    get: (n) => vals.get(n), shaded: (n) => shaded.has(n),
    set(n, v) {
      vals.set(n, v);
      if (n === 'msg' && s.onMsg) s.onMsg(v, api);
    },
    shade(n, on) { if (on) shaded.add(n); else shaded.delete(n); },
    focus(n) { api.focused = n; },
    values: () => Object.fromEntries(vals),
    on(t, fn) { h[t].push(fn); },
    open() { win.isOpen = true; closed = false; },
    close() { win.isOpen = false; ended(); },
    delete() {
      if (api.gone) return;
      api.gone = true;
      win.isOpen = false;
      ended();
      reg.delete(o.key);
      win.emit('deleted');
    },
    /** A bottom button (the box deleted unless kept). */
    press(name) {
      if (shaded.has(name) || api.gone) return;
      if (!emit('button', {name, values: api.values()})) api.delete();
    },
    /** The user changes a control. */
    change(n, v) {
      vals.set(n, v);
      emit('change', {name: n, value: v});
    }};
  win.isOpen = false;
  win.delete = () => api.delete();
  win.bringToFront = () => {};
  for (const c of o.rows.flat()) {
    if ('value' in c && c.kind !== 'radio') vals.set(c.name, c.value);
    if (c.kind === 'label' && c.name) vals.set(c.name, c.text);
  }
  reg.set(o.key, api);
  s.dialogs.push(api);
  return api;
};

/** Every name a module under tools/moreapps imports from 'riscos'
 *  (as ./spellmenu.test.mjs finds them). */
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
  'const s = globalThis.__pbStub;' +
  'export class Menu {constructor(t, i) {this.title = t;' +
  ' this.items = i;}}' +
  'export const wimp = {beep() { s.beeps++; }, menus: {close() {}},' +
  ' setCaret() {}, width: 2000, height: 1600};' +
  'export const reportError = (m, o) => { s.notes.push({m, o}); };' +
  'export const saveAs = (o) => s.saveAs(o);' +
  'export const vfs = {exists: (p) => s.files.has(p),' +
  ' stat: () => ({}), canonical: (p) => p,' +
  ' readFile: async (p) => { s.reads.push(p); return s.read(p); },' +
  ' writeFile(p, b, o) { if (s.writeFail) throw s.writeFail;' +
  ' s.files.set(p, {bytes: b, ...o}); }};' +
  [...riscosNames()].filter((n) => !OWN.has(n))
    .map((n) => `export const ${n} = new Proxy(function () {}, ` +
      '{get: () => () => {}, apply: () => undefined});').join(''));
const DIALOG = 'data:text/javascript,' + encodeURIComponent(
  'export const dialog = (o) => globalThis.__pbStub.dialog(o);');
const QUERY = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__pbStub;' +
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
s.read = (p) => {
  if (!p.startsWith('F.Fonts.')) throw new Error('not found');
  return new Uint8Array(fs.readFileSync(path.join(FONTS, p.slice(8))));
};

const L = '../../tools/moreapps/!Letters/';
const {pdfBox, pdfName, rangeOf, markupLine} =
  await import(L + 'PdfBox');
const {windowMenu} = await import(L + 'WinMenu');

before(loadStyles);

// ---------------------------------------------------------- fixtures

/** A window over Document d, in Print layout (its pages done). */
function windowOf(d, o = {}) {
  const L = new DocLayout(d.doc, tm(), null, {floats: true,
    markup: o.markup || 'final',
    pics: {get: () => ({state: 'pending'})}});
  L.layout(800);
  const pages = new Pages(printGalley(L));
  L.place = PlacePrint(L, pages);
  L.layout(800);
  pages.finish();
  d.markup = o.markup || 'final';
  const app = {task: {name: 'Letters'}, dir: 'F', docs: new Map(),
    keyOf: (p) => String(p).toLowerCase(), recent: []};
  const dw = {d, doc: d.doc, L, pages, viewName: 'print', app,
    boxes: new Map(), docKey: 'doc' + (++windowOf.n), closed: false,
    path: o.path === undefined ? 'ADFS::HardDisc4.$.Report/docx'
      : o.path, leaf: 'Report/docx', isUntitled: !o.path && o.path !==
      undefined, get markup() { return d.markup; },
    fields: {now: new Date(Date.UTC(2026, 0, 1))},
    view: {d, hdr: null, mac: false, focus() {}}};
  app.docs.set(app.keyOf(dw.path || 'untitled'), dw);
  return dw;
}
windowOf.n = 0;

const pagesDoc = (texts) => mk(texts.map((t, i) => (i
  ? [t, {pPr: {pageBreakBefore: true}}] : t)));
const latin1 = (b) => Buffer.from(b).toString('latin1');
const countOf = (b) => Number(/\/Type \/Pages[^]*?\/Count (\d+)/
  .exec(latin1(b))[1]);
const reset = () => {
  s.notes = [];
  s.beeps = 0;
  s.files = new Map();
  s.writeFail = null;
  s.questions = [];
  s.answer = 'Cancel';
  s.onMsg = null;
};
const PATH = 'ADFS::HardDisc4.$.Out/pdf';

/** The box opened for dw, with the save box OK opens. */
function opened(dw) {
  const api = pdfBox(dw);
  assert.ok(api.isOpen);
  return api;
}
const saveOf = (dw) => dw.boxes.get('pdfsave');

/** From / To typed, OK pressed: the save box (or null). */
function ok(api, dw, from, to) {
  if (from !== undefined || to !== undefined) {
    api.change('pages', 'range');
    api.change('from', from);
    api.change('to', to);
  }
  api.press('OK');
  const b = saveOf(dw);
  return b && b.isOpen ? b : null;
}

// -------------------------------------------------------------- tests

describe('the range read from the box', () => {
  it('All: every page', () => {
    assert.deepEqual(rangeOf({pages: 'all'}, 3), {from: 1,
      to: Infinity});
  });
  it('From 0 To 99 is clamped to 1..pages', () => {
    assert.deepEqual(rangeOf({pages: 'range', from: 0, to: 99}, 3),
      {from: 1, to: 3});
  });
  it('an empty field is the end of its side, never null', () => {
    assert.deepEqual(rangeOf({pages: 'range', from: undefined,
      to: 2}, 3), {from: 1, to: 2});
    assert.deepEqual(rangeOf({pages: 'range', from: 2,
      to: undefined}, 3), {from: 2, to: 3});
    assert.deepEqual(rangeOf({pages: 'range'}, null), {from: 1,
      to: Infinity});
  });
  it('the page count not known: only From is clamped', () => {
    assert.deepEqual(rangeOf({pages: 'range', from: 0, to: 99}, null),
      {from: 1, to: 99});
  });
  it('From after To, or text that is not a number, is refused', () => {
    assert.match(rangeOf({pages: 'range', from: 3, to: 2}, 5).bad,
      /From/);
    assert.ok(rangeOf({pages: 'range', from: null, to: 2}, 5).bad);
    assert.ok(rangeOf({pages: 'range', from: 1, to: null}, 5).bad);
  });
});

describe('the box', () => {
  it('names the markup the pages show', () => {
    assert.equal(markupLine('final'), 'Markup: final text');
    assert.equal(markupLine('all'), 'Markup: all markup shown');
    assert.equal(markupLine('original'), 'Markup: original text');
    reset();
    const dw = windowOf(pagesDoc(['a']), {markup: 'all'});
    const api = opened(dw);
    assert.equal(api.get('markup'), 'Markup: all markup shown');
    assert.equal(api.get('pages'), 'all');
    assert.ok(api.shaded('from') && api.shaded('to'));
    assert.ok(api.opts.rows.flat().some((c) => c.kind === 'label' &&
      /blank pages/i.test(c.text || '')), 'the blank pages note');
    assert.equal(dw.boxes.get('pdf'), api.win);
    assert.equal(pdfBox(dw), api, 'one box per document');
    api.press('Cancel');
  });
  it('the .pdf name: the document\'s, /docx put as /pdf', () => {
    const there = () => false;
    assert.equal(pdfName({path: 'ADFS::HardDisc4.$.Report/docx'},
      'X', there), 'ADFS::HardDisc4.$.Report/pdf');
    assert.equal(pdfName({path: 'RAM::RamDisc0.$.Notes'}, 'X', there),
      'RAM::RamDisc0.$.Notes/pdf');
    assert.equal(pdfName({path: null, leaf: 'Untitled 2'},
      'ADFS::HardDisc4.$', there), 'ADFS::HardDisc4.$.Untitled2/pdf');
  });
});

describe('Export as PDF: OK, the save box, the file', () => {
  it('range 0..99 is clamped; the file is &ADF and a PDF', async () => {
    reset();
    const d = pagesDoc(['one', 'two', 'three']);
    const dw = windowOf(d);
    const depth = d.undoDepth, dirty = d.dirty, doc = d.doc;
    const api = opened(dw);
    const b = ok(api, dw, 0, 99);
    assert.ok(b, 'the save box opened');
    assert.equal(b.filetype, 0xADF);
    assert.equal(b.filename(), 'ADFS::HardDisc4.$.Report/pdf');
    await b.press(PATH);
    assert.deepEqual(s.notes, []);
    const f = s.files.get(PATH);
    assert.ok(f, 'written');
    assert.equal(f.filetype, 0xADF);
    assert.equal(latin1(f.bytes.subarray(0, 5)), '%PDF-');
    assert.equal(countOf(f.bytes), 3);
    assert.ok(api.gone, 'the box gone after the export');
    assert.equal(b.isOpen, false);
    assert.equal(d.undoDepth, depth);
    assert.equal(d.dirty, dirty);
    assert.equal(d.doc, doc);
    assert.ok(s.reads.some((p) => p.startsWith('F.Fonts.')),
      'the bundled fonts read from the app\'s Fonts');
  });
  it('From 2, To empty: pages 2 to the end', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two', 'three']));
    const b = ok(opened(dw), dw, 2, undefined);
    await b.press(PATH);
    assert.equal(countOf(s.files.get(PATH).bytes), 2);
  });
  it('From empty, To 1: the first page', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two', 'three']));
    const b = ok(opened(dw), dw, undefined, 1);
    await b.press(PATH);
    assert.equal(countOf(s.files.get(PATH).bytes), 1);
  });
  it('From after To: a beep and a message, no save box, nothing ' +
    'written', () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two', 'three']));
    const api = opened(dw);
    assert.equal(ok(api, dw, 3, 2), null);
    assert.equal(s.beeps, 1);
    assert.match(api.get('msg'), /From/);
    assert.ok(api.isOpen, 'the box kept');
    assert.equal(s.files.size, 0);
    api.press('Cancel');
  });
  it('Cancel while the pages are made: nothing written, no error, ' +
    'the box gone', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two', 'three']));
    const api = opened(dw);
    const b = ok(api, dw);
    const seen = [];
    s.onMsg = (t, a) => {
      seen.push(t);
      if (/^Page 2 of 3$/.test(t)) a.press('Cancel');
    };
    assert.ok(api.shaded('OK') === false);
    await b.press(PATH);
    assert.deepEqual(seen.slice(0, 2), ['Preparing pages...',
      'Page 1 of 3']);
    assert.equal(s.files.size, 0);
    assert.deepEqual(s.notes, []);
    assert.ok(api.gone);
    assert.equal(b.isOpen, false);
  });
  it('progress: Preparing pages, Page n of N, Writing; OK shaded ' +
    'while it runs', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two']));
    const api = opened(dw);
    const b = ok(api, dw);
    const seen = [], okShaded = [];
    s.onMsg = (t, a) => {
      seen.push(t);
      okShaded.push(a.shaded('OK'));
    };
    await b.press(PATH);
    assert.deepEqual(seen.filter((t) => t), ['Preparing pages...',
      'Page 1 of 2', 'Page 2 of 2', 'Writing...']);
    assert.ok(okShaded.slice(0, 4).every(Boolean));
  });
  it('the window closing during the export stops it', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two', 'three']));
    const b = ok(opened(dw), dw);
    s.onMsg = (t) => {
      if (/^Page 2 of/.test(t)) {
        dw.closed = true;
        for (const x of [...dw.boxes.values()]) x.delete();
      }
    };
    await b.press(PATH);
    assert.equal(s.files.size, 0);
    assert.deepEqual(s.notes, []);
  });
  it('dropping the save icon on an application window exports ' +
    'the PDF', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one', 'two']));
    const api = opened(dw);
    const b = ok(api, dw);
    const bytes = await b.opts.getData();
    assert.equal(latin1(bytes.subarray(0, 5)), '%PDF-');
    assert.equal(countOf(bytes), 2);
    assert.ok(api.gone, 'the Export as PDF box gone');
    assert.equal(s.files.size, 0, 'the receiver writes, not the box');
  });
  it('the same drop twice and a refused drop leave the box usable',
    async () => {
      reset();
      const dw = windowOf(pagesDoc(['one']));
      const api = opened(dw);
      const b = ok(api, dw);
      // (a receiver that refuses: the bytes simply dropped)
      const first = await b.opts.getData();
      assert.equal(latin1(first.subarray(0, 5)), '%PDF-');
      const api2 = opened(dw);
      const b2 = ok(api2, dw);
      const second = await b2.opts.getData();
      assert.equal(latin1(second.subarray(0, 5)), '%PDF-');
      const api3 = opened(dw);
      const b3 = ok(api3, dw);
      await b3.press(PATH);
      assert.ok(s.files.get(PATH), 'a file save still works');
      assert.deepEqual(s.notes, []);
    });
  it('a drop whose export fails says why and returns no bytes',
    async () => {
      reset();
      const dw = windowOf(pagesDoc(['one']));
      dw.viewName = 'draft';     // (page count not known: no clamp)
      const b = ok(opened(dw), dw, 5, 6);
      assert.ok(b, 'the range is taken');
      const rej = [];
      const onRej = (e) => rej.push(e);
      process.on('unhandledRejection', onRej);
      const bytes = await b.opts.getData();
      await new Promise((r) => setTimeout(r, 5));
      process.off('unhandledRejection', onRej);
      assert.equal(bytes.length, 0);
      assert.deepEqual(rej, []);
      assert.deepEqual(s.notes.map((n) => n.m),
        ['No pages to export']);
      assert.equal(s.notes[0].o.appName, 'Letters');
    });
  it('a second drop while one runs says so and returns no bytes',
    async () => {
      reset();
      const dw = windowOf(pagesDoc(['one', 'two', 'three']));
      const b = ok(opened(dw), dw);
      const first = b.opts.getData();
      const bytes = await b.opts.getData();
      assert.equal(bytes.length, 0);
      assert.equal(s.notes.length, 1);
      assert.match(s.notes[0].m, /is being made/);
      const got = await first;
      assert.equal(latin1(got.subarray(0, 5)), '%PDF-');
    });
  it('a closed document refuses with no bytes and no throw',
    async () => {
      reset();
      const dw = windowOf(pagesDoc(['one']));
      const b = ok(opened(dw), dw);
      dw.closed = true;
      const bytes = await b.opts.getData();
      assert.equal(bytes.length, 0);
      assert.deepEqual(s.notes, []);
    });
  it('a write that fails is said as Save a copy says it', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one']));
    const api = opened(dw);
    const b = ok(api, dw);
    s.writeFail = new Error('Disc full');
    await b.press(PATH);
    assert.deepEqual(s.notes.map((n) => n.m),
      ["'Out/pdf' could not be saved: Disc full"]);
    assert.ok(b.isOpen, 'the save box kept');
    assert.ok(!api.gone, 'the box kept');
    assert.equal(api.shaded('OK'), false, 'OK back');
    api.press('Cancel');
  });
  it('a file that is there: Replace / Cancel asked first', async () => {
    reset();
    const dw = windowOf(pagesDoc(['one']));
    const b = ok(opened(dw), dw);
    s.files.set(PATH, {bytes: new Uint8Array([1]), filetype: 0xFFF});
    s.answer = 'Cancel';
    await b.press(PATH);
    assert.equal(s.questions.length, 1);
    assert.match(s.questions[0].message, /'Out\/pdf' already exists/);
    assert.equal(s.files.get(PATH).filetype, 0xFFF, 'not replaced');
    s.answer = 'Replace';
    await b.press(PATH);
    await new Promise((res) => setImmediate(res));
    await b.done;
    assert.equal(s.questions.length, 2);
    assert.equal(s.files.get(PATH).filetype, 0xADF, 'replaced');
  });
  it('the window\'s own document file is refused, nothing written',
    async () => {
      reset();
      const dw = windowOf(pagesDoc(['abc']));
      const own = dw.path;
      const b = ok(opened(dw), dw);
      await b.press(own);
      await b.done;
      assert.equal(s.files.has(own), false, 'not written');
      assert.equal(s.questions.length, 0, 'no Replace asked');
      assert.equal(s.notes.length, 1);
      assert.match(s.notes[0].m, /is this document's own file/);
      assert.match(s.notes[0].m, /another name/);
    });
  it('characters the fonts lack: one information notice', async () => {
    reset();
    const dw = windowOf(pagesDoc(['abc 漢字']));
    const b = ok(opened(dw), dw);
    await b.press(PATH);
    assert.ok(s.files.get(PATH));
    assert.equal(s.notes.length, 1);
    assert.equal(s.notes[0].o.category, 'info');
    assert.match(s.notes[0].m, /not in the font/);
  });
});

describe('the same window again (fix round 1: the boxes\' lifetime)',
  () => {
    it('two exports from one window: two files', async () => {
      reset();
      const dw = windowOf(pagesDoc(['one', 'two']));
      const b1 = ok(opened(dw), dw);
      await b1.press('ADFS::HardDisc4.$.A/pdf');
      const api2 = opened(dw);
      const b2 = ok(api2, dw, 2, 2);
      assert.equal(b2, b1, 'the one save box, made once');
      await b2.press('ADFS::HardDisc4.$.B/pdf');
      assert.deepEqual(s.notes, []);
      assert.equal(countOf(s.files.get('ADFS::HardDisc4.$.A/pdf')
        .bytes), 2);
      assert.equal(countOf(s.files.get('ADFS::HardDisc4.$.B/pdf')
        .bytes), 1);
      assert.ok(api2.gone);
    });
    it('Cancel in the box, then an export: written', async () => {
      reset();
      const dw = windowOf(pagesDoc(['one', 'two']));
      const api1 = opened(dw);
      ok(api1, dw);
      api1.press('Cancel');
      assert.equal(saveOf(dw).isOpen, false, 'the save box closed');
      const b = ok(opened(dw), dw);
      await b.press(PATH);
      assert.ok(s.files.get(PATH), 'written');
      assert.deepEqual(s.notes, []);
    });
    it('Cancel while it runs, then an export: written', async () => {
      reset();
      const dw = windowOf(pagesDoc(['one', 'two', 'three']));
      const b = ok(opened(dw), dw);
      s.onMsg = (t, a) => {
        if (/^Page 2 of/.test(t)) a.press('Cancel');
      };
      await b.press(PATH);
      assert.equal(s.files.size, 0);
      s.onMsg = null;
      const again = ok(opened(dw), dw);
      await again.press(PATH);
      assert.equal(countOf(s.files.get(PATH).bytes), 3);
      assert.deepEqual(s.notes, []);
    });
    it('the page count not known, From past the last page: said, ' +
      'nothing written, the boxes usable again', async () => {
      reset();
      const dw = windowOf(pagesDoc(['one', 'two', 'three']));
      dw.viewName = 'web';             // (no count: To unclamped)
      const api = opened(dw);
      const b = ok(api, dw, 5, 9);
      assert.ok(b, 'the range passes the box');
      await b.press(PATH);
      assert.deepEqual(s.notes.map((n) => n.m),
        ['No pages to export']);
      assert.equal(s.files.size, 0);
      assert.ok(b.isOpen && api.isOpen, 'both boxes kept');
      assert.equal(api.shaded('OK'), false);
      s.notes = [];
      const b2 = ok(api, dw, 2, 9);
      await b2.press(PATH);
      assert.deepEqual(s.notes, []);
      assert.equal(countOf(s.files.get(PATH).bytes), 2);
    });
  });

describe('the window menu', () => {
  it('the window menu: Export as PDF... after Save a copy, opens the box', () => {
    reset();
    const dw = windowOf(pagesDoc(['one']));
    dw.win = {isOpen: true};
    const m = windowMenu(dw);
    const t = m.items.map((i) => i.text);
    const k = t.indexOf('Export as PDF...');
    assert.equal(k, t.indexOf('Save a copy') + 1, t.join());
    const item = m.items[k];
    assert.ok(item.help && /PDF/.test(item.help));
    item.action();
    const api = s.dialogs[s.dialogs.length - 1];
    assert.ok(api.isOpen);
    assert.equal(api.opts.title, 'Export as PDF');
    api.press('Cancel');
  });
});
