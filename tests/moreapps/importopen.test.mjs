// Opening through an importer (ODT/.doc import, task 4): ./Open's
// IMPORTERS are tried before the .docx reader; what one reads opens
// as a .docx window marked imported (dw.imported, dw.importedFrom
// the original, dw.path null), which nothing ever writes over the
// original: Save, Ctrl+S, the close prompt's Save and Quit go to the
// Save box offering <leaf>/docx beside it; Save a copy offers the
// same and refuses the original; Revert reads the original again
// and stays imported; once Save as has written a .docx the window
// is a plain .docx window. ImportError's messages, the opening
// notice, the file types (&A81, &AE6) and the boot files. A fake
// importer stands in for the readers (later tasks); 'riscos', the
// Dialog and the SaveQuery are stand-ins (no desktop).
import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Emitter} from '../../src/core/util.js';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const APP = path.join(ROOT, 'tools/moreapps/!Letters');

// ------------------------------------------------------- stand-ins

const s = globalThis.__impStub = {notes: [], files: new Map(),
  writes: [], questions: [], answer: 'Cancel', queries: [],
  qanswer: 'Discard', saves: []};

/** The menu tree (none opened here but the Save as box's). */
const M = s.M = {isOpen: false, owner: null, top: null,
  open(w) { M.isOpen = true; M.top = w; w.isOpen = true; },
  close() {
    const w = M.top;
    M.top = null;
    M.isOpen = false;
    if (w) { w.isOpen = false; if (w.emit) w.emit('closed', {}); }
  }};

/** A core saveAs box: press(name) is OK with that name. */
s.saveAs = (o) => {
  const w = new Emitter();
  const name = {text: o.filename};
  Object.assign(w, {opts: o, isOpen: false, filetype: o.filetype,
    icons: [{}, name], filename: () => name.text,
    setFilename: (n) => { name.text = n; },
    setFiletype: (t) => { w.filetype = t; },
    bringToFront() {},
    openCentred() { w.isOpen = true; },
    close() { w.isOpen = false; w.emit('closed', {}); },
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
  w.press = (p) => {
    if (p !== undefined) name.text = p;
    w.emit('click', {icon: w.icons[0], button: 'select'});
    return w.done;
  };
  s.saves.push(w);
  return w;
};

/** Every name a module under tools/moreapps imports from 'riscos'. */
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
const OWN = new Set(['Menu', 'wimp', 'reportError', 'saveAs', 'vfs',
  'query']);
const RISCOS = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__impStub;' +
  'export class Menu {constructor(t, i) {this.title = t;' +
  ' this.items = i;}}' +
  'export const wimp = {beep() {}, menus: s.M, setCaret() {},' +
  ' width: 2000, height: 1600, tasks: []};' +
  'export const reportError = (m, o) => { s.notes.push({m, o}); };' +
  'export const saveAs = (o) => s.saveAs(o);' +
  'export const query = (o) => { s.queries.push(o);' +
  ' return Promise.resolve(s.qanswer); };' +
  'export const vfs = {exists: (p) => s.files.has(p),' +
  ' leaf: (p) => p.slice(p.lastIndexOf(".") + 1),' +
  ' stat: (p) => (s.files.has(p) ? {filetype:' +
  ' s.files.get(p).filetype} : null), canonical: (p) => p,' +
  ' readFile: async (p) => { if (!s.files.has(p))' +
  '  throw new Error("File not found"); return s.files.get(p).bytes;' +
  ' },' +
  ' writeFile(p, b, o) { s.writes.push(p);' +
  ' s.files.set(p, {bytes: b, ...o}); return p; }};' +
  [...riscosNames()].filter((n) => !OWN.has(n))
    .map((n) => `export const ${n} = new Proxy(function () {}, ` +
      '{get: () => () => {}, apply: () => undefined});').join(''));
const DIALOG = 'data:text/javascript,' + encodeURIComponent(
  'export const dialog = () => { const w = {isOpen: false,' +
  ' on() {}, delete() {}}; return {win: w, isOpen: false,' +
  ' set() {}, get() {}, on() {}, open() {}, close() {}}; };');
const QUERY = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__impStub;' +
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
const O = await import(L + 'Open');
const DS = await import(L + 'DocSave');
const CD = await import(L + 'CloseDoc');
const SS = await import(L + 'SaveState');
const PB = await import(L + 'PdfBox');
const {copyBox} = await import(L + 'CopySave');
const {windowMenu} = await import(L + 'WinMenu');
const {docCommand} = await import(L + 'DocKeys');
const {changed} = await import(L + 'Quit');

// ---------------------------------------------------------- fixtures

const DIR = 'ADFS::HardDisc4.$.Work';
const ORIG = DIR + '.Report/odt';
const MAGIC = [0x46, 0x41, 0x4b, 0x45];   // 'FAKE'
const fakeBytes = (text) => Uint8Array.from([...MAGIC,
  ...Buffer.from(text, 'latin1')]);
const texts = (doc) => doc.sections.flatMap((x) => x.blocks)
  .filter((b) => b.type === 'p').map((b) => b.text);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** The fake importer: 'FAKE' then the text, one paragraph. */
const FAKE = {format: 'odt', label: 'ODT', reads: 0,
  sniff: (b) => MAGIC.every((c, i) => b[i] === c),
  read(bytes) {
    FAKE.reads++;
    const text = Buffer.from(bytes.slice(4)).toString('latin1');
    if (text === 'THROW') throw new Error('broken inside');
    const doc = newDoc({});
    doc.sections[0].blocks = [newPara(text)];
    return {doc, notes: FAKE.notes};
  },
  notes: []};

let keys = 0;
/** A window as ./AppWin makes one (what these modules use of it):
 *  its file from SaveState fileOf, never saved when imported. */
class FakeWin {
  constructor(app, p, doc, format, imported) {
    this.app = app;
    Object.assign(this, SS.fileOf(p, imported));
    this.format = format === 'rtf' && !this.importedFrom ? 'rtf'
      : 'docx';
    this.doc = doc;
    this.d = new Document(doc);
    this.openedAt = this.d.stateId;
    if (this.importedFrom) this.d.markSavedAt(-1);
    this.leaf = p ? p.slice(p.lastIndexOf('.') + 1) : 'Untitled';
    this.boxes = new Map();
    this.closed = false;
    this.docKey = ++keys;
    this.title = '';
    this.rulerOn = true;
    this.zoom = 100;
    this.view = {comp: null, hasFocus: false, mac: false, hdr: null,
      caretRect: () => null, focus() {}, destroy() {}, d: this.d};
    this.win = {x: 100, y: 200, isOpen: true, opened: 0,
      workToScreen: (x, y) => ({x, y}), getState: () => ({}),
      open() { this.isOpen = true; this.opened++; },
      delete() { this.isOpen = false; }};
    this.zb = {destroy() {}};
    this.viewName = 'draft';
    this.markup = 'final';
    this.retitle();
  }
  get isUntitled() { return !this.path; }
  retitle() { this.title = this.leaf + (this.d.dirty ? ' *' : ''); }
  saveBytes(f) { return DS.bytesOf(this, f); }
  save() { return DS.save(this); }
  saveAs(p) { return DS.saveAsTo(this, p); }
  requestClose() { return CD.requestClose(this); }
  revert() { return CD.revert(this); }
  setRuler(on) { this.rulerOn = on; }
  setZoom(z) { this.zoom = z; }
  show() {}
  relayout() {}
  close() { CD.destroy(this); }
}

/** The app (!RunImage's): docs keyed by the path opened. */
function appOf() {
  let n = 0;
  const app = {task: {name: 'Letters', windows: new Set(),
    onMessage() { return () => {}; }},
  docs: new Map(), keyOf: (q) => String(q).toLowerCase(),
  recent: [], noteRecent(p) { app.recent.unshift(p); },
  closed(dw) {
    for (const [k, v] of app.docs) if (v === dw) app.docs.delete(k);
  },
  rekey(dw) {
    app.closed(dw);
    if (dw.closed) return;
    app.docs.set(dw.path ? app.keyOf(dw.path) : `untitled:${++n}`, dw);
  },
  prompt: null, closing: null};
  return app;
}

/** Open p as !RunImage's load does: the window and the notice. */
async function load(app, p) {
  const got = await O.openDoc(
    {readFile: async (q) => s.files.get(q).bytes}, p);
  app.noteRecent(p);
  const dw = new FakeWin(app, p, got.doc, got.format, got.imported);
  app.docs.set(app.keyOf(p), dw);
  return {dw, got, notice: O.openNotice(dw.leaf, got)};
}

const put = (p, bytes, filetype = 0xA81) => {
  s.files.set(p, {bytes, filetype});
  return p;
};
const original = () => s.files.get(ORIG).bytes;
const menuItem = (dw, text) => windowMenu(dw).items
  .find((i) => i && i.text === text);
const errors = () => s.notes.map((n) => n.m);

beforeEach(() => {
  M.close();
  Object.assign(s, {notes: [], files: new Map(), writes: [],
    questions: [], answer: 'Cancel', queries: [], qanswer: 'Discard',
    saves: []});
  FAKE.notes = [];
  FAKE.reads = 0;
  O.IMPORTERS.push(FAKE);
  put(ORIG, fakeBytes('From the ODT.'));
});
afterEach(() => {
  const i = O.IMPORTERS.indexOf(FAKE);
  if (i >= 0) O.IMPORTERS.splice(i, 1);
});

/** The original is as it was, and nothing was written to it. */
function untouched() {
  assert.ok(!s.writes.some((p) => p.toLowerCase() ===
    ORIG.toLowerCase()), 'nothing written to the original');
  assert.deepEqual([...original()], [...fakeBytes('From the ODT.')]);
}

// ---------------------------------------------------------- tests

describe('opening through an importer', () => {
  it("an importer's file opens as docx with imported set",
    async () => {
      const app = appOf();
      const {dw, got} = await load(app, ORIG);
      assert.equal(got.format, 'docx');
      assert.equal(got.imported, 'odt');
      assert.deepEqual(got.notes, []);
      assert.deepEqual(texts(got.doc), ['From the ODT.']);
      assert.equal(dw.imported, 'odt');
      assert.equal(dw.importedFrom, ORIG);
      assert.equal(dw.path, null, 'no path to save to');
      assert.equal(dw.format, 'docx');
      assert.equal(dw.leaf, 'Report/odt');
      assert.equal(dw.d.dirty, true, 'never saved: closing asks');
      assert.equal(dw.title, 'Report/odt *');
      assert.equal(app.docs.get(app.keyOf(ORIG)), dw,
        'keyed by the original: opening it again raises it');
      assert.equal(changed(app).length, 1, 'Quit counts it');
    });

  it('the importers come before the .docx reader, in order; a ' +
    "sniff that throws is a no; nothing sniffed: as before",
    async () => {
      const seen = [];
      const bad = {format: 'doc', label: '.doc',
        sniff() { seen.push('bad'); throw new Error('x'); },
        read() { throw new Error('never'); }};
      O.IMPORTERS.unshift(bad);
      try {
        const got = await O.openDoc({readFile: async () => original()},
          ORIG);
        assert.equal(got.imported, 'odt');
        assert.deepEqual(seen, ['bad']);
        const rtf = Uint8Array.from(Buffer.from('{\\rtf1 Hi.\\par}'));
        const r = await O.openDoc({readFile: async () => rtf}, 'x');
        assert.equal(r.format, 'rtf');
        assert.equal(r.imported, undefined);
        assert.equal(FAKE.reads, 1, 'RTF is not offered to importers');
      } finally {
        O.IMPORTERS.splice(O.IMPORTERS.indexOf(bad), 1);
      }
    });

  it('too big is refused before it is read; a reader that throws ' +
    'is bad', async () => {
    const big = new Uint8Array(O.MAX_IMPORT_BYTES + 1);
    big.set(MAGIC);
    await assert.rejects(O.openDoc({readFile: async () => big}, 'x'),
      (e) => e.name === 'ImportError' && e.code === 'too-big' &&
        e.format === 'odt');
    assert.equal(FAKE.reads, 0);
    await assert.rejects(O.openDoc({readFile: async () =>
      fakeBytes('THROW')}, 'x'), (e) => e.name === 'ImportError' &&
      e.code === 'bad' && e.format === 'odt');
  });

  it('&A81 and &AE6 open in !Letters (formatOfType), but nothing ' +
    'is saved as them', () => {
    assert.equal(O.formatOfType(0xA81), 'odt');
    assert.equal(O.formatOfType(0xAE6), 'doc');
    assert.equal(O.formatOfType(0xA7E), 'docx');
    assert.equal(O.formatOfType(0xC32), 'rtf');
    assert.equal(O.formatOfType(0xFFF), null);
    assert.deepEqual(O.FILETYPES, {docx: 0xA7E, rtf: 0xC32});
    assert.equal(O.fileTypeOf('odt'), 0xA7E);
    assert.equal(O.fileTypeOf('doc'), 0xA7E);
  });

  for (const f of ['!Boot', '!Run']) {
    it(`${f} claims &A81 and &AE6 as it does &A7E`, () => {
      const lines = fs.readFileSync(path.join(APP, f), 'latin1')
        .split('\n');
      for (const t of ['A81', 'AE6']) {
        assert.ok(lines.includes(`Set Alias$@RunType_${t} Run ` +
          '<Letters$Dir>.!Run %%*0'), t);
      }
      assert.ok(lines.includes('Set File$Type_A81 ODT'));
      assert.ok(lines.includes('Set File$Type_AE6 MSWord'));
    });
  }

  it('the real window and !RunImage use the same plumbing', () => {
    const win = fs.readFileSync(path.join(APP, 'AppWin'), 'latin1');
    assert.ok(win.includes('fileOf(path, imported)'));
    assert.ok(win.includes('markSavedAt(-1)'));
    const run = fs.readFileSync(path.join(APP, '!RunImage'), 'latin1');
    assert.match(run,
      /place\(path, key, got\.doc, got\.format,\s+got\.imported\)/);
    assert.ok(run.includes('openNotice(dw.leaf, got)'));
    assert.deepEqual(SS.fileOf('A.$.B', 'odt'),
      {path: null, imported: 'odt', importedFrom: 'A.$.B'});
    assert.deepEqual(SS.fileOf('A.$.B'),
      {path: 'A.$.B', imported: null, importedFrom: null});
    assert.deepEqual(SS.fileOf(null),
      {path: null, imported: null, importedFrom: null});
  });
});

describe('saving an imported window', () => {
  it('Save of an imported window opens Save as, never writes the ' +
    'original path', async () => {
    const app = appOf();
    const {dw} = await load(app, ORIG);
    // Save from the menu, Ctrl+S and dw.save() all open the box
    menuItem(dw, 'Save').action();
    const b = dw.boxes.get('saveas');
    assert.ok(b && b.isOpen, 'the Save box opened');
    assert.equal(b.filename(), DIR + '.Report/docx');
    assert.equal(b.filetype, 0xA7E);
    assert.equal(docCommand(dw, 'save'), true);
    const p = dw.save();
    await tick();
    untouched();
    assert.equal(s.writes.length, 0);
    // OK onto the original: refused, said, nothing written
    await b.press(ORIG);
    untouched();
    assert.ok(errors().some((m) => m.startsWith("'Report/odt' is " +
      'the file this document was opened from')));
    assert.equal(s.questions.length, 0, 'no Replace question');
    // a drag of the icon to a directory: the path it gives
    await assert.rejects(b.opts.save(ORIG.toUpperCase()));
    untouched();
    // OK as suggested: a .docx beside it, the window renamed
    await b.press(DIR + '.Report/docx');
    assert.equal(await p, true);
    untouched();
    const f = s.files.get(DIR + '.Report/docx');
    assert.equal(f.filetype, 0xA7E);
    assert.deepEqual(texts(await readDocx(f.bytes)), ['From the ODT.']);
    assert.equal(dw.path, DIR + '.Report/docx');
    assert.equal(dw.imported, null);
    assert.equal(dw.importedFrom, null);
    assert.equal(dw.d.dirty, false);
    assert.equal(dw.title, 'Report/docx');
    assert.equal(app.docs.get(app.keyOf(DIR + '.Report/docx')), dw);
    assert.equal(app.docs.get(app.keyOf(ORIG)), undefined);
    // and a plain Save now writes the .docx, not the original
    dw.view.d.breakCoalesce();
    assert.equal(await dw.save(), true);
    assert.equal(s.writes.at(-1), DIR + '.Report/docx');
    untouched();
  });

  it('the close prompt and Quit: Save goes to the Save box; Discard ' +
    'writes nothing', async () => {
    const app = appOf();
    const {dw} = await load(app, ORIG);
    s.answer = 'Save';
    const closing = dw.requestClose();
    await tick();
    assert.equal(s.questions.length, 1, 'closing an import asks');
    assert.match(s.questions[0].message, /'Report\/odt' has changes/);
    const b = dw.boxes.get('saveas');
    assert.ok(b && b.isOpen, 'Save opened the Save box');
    assert.equal(b.filename(), DIR + '.Report/docx');
    untouched();
    b.close();                          // (closed without saving)
    assert.equal(await closing, false, 'kept');
    assert.equal(dw.closed, false);
    untouched();
    s.answer = 'Discard';
    assert.equal(await dw.requestClose(), true);
    assert.equal(dw.closed, true);
    assert.equal(s.writes.length, 0);
    untouched();
  });

  it('a Save with no path at all never writes (writeTo refuses)',
    async () => {
      const app = appOf();
      const {dw} = await load(app, ORIG);
      await assert.rejects(DS.writeTo(dw, null), /no file yet/);
      assert.equal(await DS.saveAsTo(dw, null), false);
      assert.equal(s.writes.length, 0);
      untouched();
    });

  it('Save a copy suggests <leaf>.docx', async () => {
    const app = appOf();
    const {dw} = await load(app, ORIG);
    const c = copyBox(dw);
    assert.equal(c.filename(), DIR + '.Report/docx');
    assert.equal(c.filetype, 0xA7E);
    await c.press(ORIG);
    untouched();
    assert.ok(errors().some((m) => m.includes('is the file this ' +
      'document was opened from')));
    await c.press(DIR + '.Copy/docx');
    const f = s.files.get(DIR + '.Copy/docx');
    assert.equal(f.filetype, 0xA7E);
    assert.deepEqual(texts(await readDocx(f.bytes)), ['From the ODT.']);
    assert.equal(dw.imported, 'odt', 'a copy changes nothing');
    assert.equal(dw.path, null);
    assert.equal(dw.d.dirty, true);
    untouched();
  });

  it('the name offered: the old extension replaced, a free one ' +
    'when that is there, never the original', () => {
    const name = (from, have = []) => SS.importName(from, undefined,
      (p) => have.includes(p));
    assert.equal(name(DIR + '.Report/odt'), DIR + '.Report/docx');
    assert.equal(name(DIR + '.Old/DOC'), DIR + '.Old/docx');
    assert.equal(name(DIR + '.Tmpl/ott'), DIR + '.Tmpl/docx');
    assert.equal(name(DIR + '.Report'), DIR + '.Report/docx');
    assert.equal(name(DIR + '.Report/odt', [DIR + '.Report/docx']),
      DIR + '.Report2/docx');
    assert.equal(name(DIR + '.Odd/docx'), DIR + '.Odd2/docx',
      'an ODT named /docx: not offered its own name');
    assert.equal(name('Report'), SS.HOME + '.Report/docx');
    const rtf = SS.suggestName({path: null, importedFrom: ORIG},
      SS.HOME, () => false, 'rtf');
    assert.equal(rtf, DIR + '.Report/rtf');
    // (task 17: the free name is looked for with the format's own
    // extension: Report/docx there does not make it Report2/rtf)
    const has = (...l) => (p) => l.includes(p);
    const as = (f, ...l) => SS.suggestName({path: null,
      importedFrom: ORIG}, SS.HOME, has(...l), f);
    assert.equal(as('rtf', DIR + '.Report/docx'), DIR + '.Report/rtf');
    assert.equal(as('rtf', DIR + '.Report/rtf'), DIR + '.Report2/rtf');
    assert.equal(as('docx', DIR + '.Report/rtf'), DIR + '.Report/docx');
    assert.equal(as(undefined, DIR + '.Report/docx'),
      DIR + '.Report2/docx');
    // Export as PDF: numbered only when the .pdf itself is there
    const pdf = (dw, ...l) => PB.pdfName(dw, SS.HOME, has(...l));
    const imp = {path: null, importedFrom: ORIG};
    assert.equal(pdf(imp, DIR + '.Report/docx'), DIR + '.Report/pdf');
    assert.equal(pdf(imp, DIR + '.Report/pdf'), DIR + '.Report2/pdf');
    assert.equal(pdf({path: null, leaf: 'Untitled'},
      SS.HOME + '.Untitled'),
      SS.HOME + '.Untitled/pdf');
  });
});

describe('Revert of an imported window', () => {
  it('Revert re-reads the original and keeps imported', async () => {
    const app = appOf();
    const {dw} = await load(app, ORIG);
    const item = menuItem(dw, 'Revert');
    assert.equal(item.shaded(), false, 'Revert is offered');
    // unchanged since it opened: no question
    assert.equal(await dw.revert(), true);
    assert.equal(s.queries.length, 0);
    // (final review: the box says again where it came from, as when
    // it was opened, notes or none)
    assert.deepEqual(errors(), ["'Report/odt' was opened from an ODT " +
      'file; it will be saved as a .docx.']);
    assert.equal(dw.closed, true);
    const nw = app.docs.get(app.keyOf(ORIG));
    assert.ok(nw && nw !== dw, 'a new window, keyed by the original');
    assert.equal(nw.imported, 'odt');
    assert.equal(nw.importedFrom, ORIG);
    assert.equal(nw.path, null);
    assert.equal(nw.d.dirty, true);
    assert.equal(FAKE.reads, 2, 'read again through the importer');
    // changed: it asks first; Discard reloads
    nw.openedAt = -2;                   // (a stand-in for an edit)
    assert.equal(await nw.revert(), true);
    assert.equal(s.queries.length, 1);
    assert.match(s.queries[0].message,
      /Discard changes to 'Report\/odt'/);
    const nw2 = app.docs.get(app.keyOf(ORIG));
    assert.equal(nw2.imported, 'odt');
    assert.equal(s.writes.length, 0);
    untouched();
    // the notes are said again; a file gone keeps the window
    FAKE.notes = ['a text box was left out'];
    s.notes = [];
    await nw2.revert();
    assert.ok(errors().some((m) => m.includes('a text box was left ' +
      'out')));
    assert.deepEqual(errors(), ["'Report/odt' was opened from an ODT " +
      'file; it will be saved as a .docx. Also: a text box was left ' +
      'out.']);
    const nw3 = app.docs.get(app.keyOf(ORIG));
    s.files.delete(ORIG);
    assert.equal(await nw3.revert(), false);
    assert.equal(nw3.closed, false);
  });
});

describe('ImportError and the notice', () => {
  it('describe gives each ImportError message exactly', () => {
    const E = O.ImportError, d = (e) => O.describe(e, 'Report');
    assert.equal(d(new E('old', 'doc')), "'Report' could not be " +
      'opened: it is a Word 6/95 file, which !Letters cannot read.');
    assert.equal(d(new E('encrypted', 'doc')), "'Report' could not " +
      'be opened: it is password-protected.');
    assert.equal(d(new E('not-word', 'doc')), "'Report' could not " +
      'be opened: it is not a Word document.');
    // (fix round 1 of task 11: a damaged .doc has its own words)
    assert.equal(d(new E('bad', 'doc')), "'Report' could not be " +
      'opened: the file is damaged.');
    assert.equal(d(new E('bad', 'odt')), "'Report' could not be " +
      'opened: it is not an OpenDocument text file.');
    assert.equal(d(new E('too-big', 'odt')), "'Report' could not be " +
      'opened: it is too big (more than 16 MB).');
    assert.equal(d(new E('too-big', 'doc')), "'Report' could not be " +
      'opened: it is too big (more than 16 MB).');
    assert.equal(new E('old', 'doc').name, 'ImportError');
  });

  it('describe: one message for each of the six codes', () => {
    const E = O.ImportError;
    const lead = "'Report' could not be opened: ";
    const TABLE = [
      ['old', 'doc', 'it is a Word 6/95 file, which !Letters cannot ' +
        'read.'],
      ['encrypted', 'doc', 'it is password-protected.'],
      ['not-word', 'doc', 'it is not a Word document.'],
      ['bad', 'odt', 'it is not an OpenDocument text file.'],
      ['too-big', 'odt', 'it is too big (more than 16 MB).'],
      ['toocomplex', 'odt', 'it is too large or complex for !Letters ' +
        'to open.']];
    for (const [code, format, text] of TABLE) {
      assert.equal(O.describe(new E(code, format), 'Report'),
        lead + text, code);
    }
  });

  it('a file of an import type no reader took is said in its ' +
    'type\'s words (task 17)', async () => {
      // (random bytes, one byte, nothing: the .docx reader's
      // refusal, said as what the file's type says it is)
      const DOC = "'F' could not be opened: it is not a Word document.";
      const ODT = "'F' could not be opened: it is not an OpenDocument " +
        'text file.';
      const junk = new Uint8Array(300).map((_, i) => (i * 7919 + 13) &
        255);
      const zip = new Uint8Array([0x50, 0x4b, 3, 4, ...new Uint8Array(40)]);
      for (const b of [junk, new Uint8Array([7]), new Uint8Array(0),
        zip]) {
        const e = await O.openDoc({readFile: async () => b}, 'F')
          .catch((x) => x);
        assert.equal(O.describe(e, 'F', 0xAE6), DOC);
        assert.equal(O.describe(e, 'F', 0xA81), ODT);
        // (other types: as before)
        assert.match(O.describe(e, 'F', 0xA7E), /\.docx|damaged|main/);
      }
    });

  it('notes show in the opening notice', async () => {
    const app = appOf();
    const plain = await load(app, ORIG);
    assert.equal(plain.notice, "'Report/odt' was opened from an ODT " +
      'file; it will be saved as a .docx.');
    FAKE.notes = ['2 text boxes were left out', 'a chart was left out'];
    put(DIR + '.Two/odt', fakeBytes('Two.'));
    const two = await load(app, DIR + '.Two/odt');
    assert.equal(two.notice, "'Two/odt' was opened from an ODT file; " +
      'it will be saved as a .docx. Also: 2 text boxes were left ' +
      'out; a chart was left out.');
    FAKE.notes = Array.from({length: 200}, (_, i) => `note ${i} ` +
      'x'.repeat(50));
    put(DIR + '.Many/odt', fakeBytes('Many.'));
    const many = await load(app, DIR + '.Many/odt');
    assert.ok(many.notice.length <= O.MAX_NOTICE);
    assert.ok(many.notice.startsWith("'Many/odt' was opened from an " +
      'ODT file; it will be saved as a .docx. Also: note 0'));
    assert.match(many.notice, /\(and \d+ more\)\.$/);
    // a .doc importer's wording; a plain .docx or RTF: as before
    assert.equal(O.openNotice('Old/doc', {imported: 'doc', notes: []}),
      "'Old/doc' was opened from a .doc file; it will be saved as a " +
      '.docx.');
    assert.equal(O.openNotice('A', {format: 'docx', notes: []}), null);
    assert.equal(O.openNotice('A', {format: 'rtf', notes: ['x']}),
      O.notesNotice('A', ['x']));
  });
});

describe('after Save as', () => {
  it('closing and reopening the saved .docx is a normal docx window',
    async () => {
      const app = appOf();
      const {dw} = await load(app, ORIG);
      dw.save();
      const b = dw.boxes.get('saveas');
      await b.press(DIR + '.Report/docx');
      assert.equal(dw.d.dirty, false);
      s.questions = [];
      assert.equal(await dw.requestClose(), true);
      assert.equal(s.questions.length, 0, 'saved: closes at once');
      const again = await load(app, DIR + '.Report/docx');
      assert.equal(again.got.format, 'docx');
      assert.equal(again.got.imported, undefined);
      assert.equal(again.notice, null, 'no import notice');
      const nw = again.dw;
      assert.equal(nw.imported, null);
      assert.equal(nw.importedFrom, null);
      assert.equal(nw.path, DIR + '.Report/docx');
      assert.equal(nw.d.dirty, false);
      assert.deepEqual(nw.d.doc && texts(nw.doc), ['From the ODT.']);
      // its Save writes itself; Revert reads the .docx
      s.writes = [];
      assert.equal(await nw.save(), true);
      assert.deepEqual(s.writes, [DIR + '.Report/docx']);
      assert.equal(await nw.revert(), true);
      const r = app.docs.get(app.keyOf(DIR + '.Report/docx'));
      assert.equal(r.imported, null);
      assert.equal(r.path, DIR + '.Report/docx');
      untouched();
    });
});
