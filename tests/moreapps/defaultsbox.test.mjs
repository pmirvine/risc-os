// The Document defaults box (Format > Document defaults...,
// ./DefaultsBox): it opens filled with what the defaults resolve to;
// Set checks the values (a bad one: a beep, why in the box, the box
// kept), refuses an original w:docDefaults it cannot change (the
// reason shown), and makes one undo step, the box gone; Choose...
// opens the font menu, a pick puts the name in; a second open after
// Cancel works; two windows have a box each; the document closing
// deletes it (./CloseDoc destroy). ('riscos' and the Dialog replaced by stand-ins.)
import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Emitter} from '../../src/core/util.js';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');

// ------------------------------------------------------- stand-ins

const s = globalThis.__ddStub = {beeps: 0, menus: [], dialogs: []};

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
  const api = {opts: o, win, gone: false, focused: null, opens: 0,
    get isOpen() { return win.isOpen; },
    get: (n) => vals.get(n), shaded: (n) => shaded.has(n),
    set(n, v) { vals.set(n, v); },
    shade(n, on) { if (on) shaded.add(n); else shaded.delete(n); },
    focus(n) { api.focused = n; },
    values: () => Object.fromEntries(vals),
    on(t, fn) { h[t].push(fn); },
    open() { win.isOpen = true; closed = false; api.opens++; },
    close() { win.isOpen = false; ended(); },
    delete() {
      if (api.gone) return;
      api.gone = true;
      win.isOpen = false;
      ended();
      reg.delete(o.key);
      win.emit('deleted');
    },
    /** A button (a bottom one deletes the box unless kept). */
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
  win.iconByName = () => ({bbox: {x0: 0, y0: 0, x1: 10, y1: 10}});
  win.workToScreen = (x, y) => ({x, y});
  for (const c of o.rows.flat()) {
    if ('value' in c && c.kind !== 'radio') vals.set(c.name, c.value);
    if (c.kind === 'label' && c.name) vals.set(c.name, c.text);
  }
  reg.set(o.key, api);
  s.dialogs.push(api);
  return api;
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
const OWN = new Set(['Menu', 'wimp', 'os']);
const RISCOS = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__ddStub;' +
  'export class Menu {constructor(t, i) {this.title = t;' +
  ' this.items = i;}}' +
  'export const wimp = {beep() { s.beeps++; }, menus: {close() {},' +
  ' open(m, x, y, o) { s.menus.push(m); }},' +
  ' setCaret() {}, width: 2000, height: 1600};' +
  'export const os = {};' +
  [...riscosNames()].filter((n) => !OWN.has(n))
    .map((n) => `export const ${n} = new Proxy(function () {}, ` +
      '{get: () => () => {}, apply: () => undefined});').join(''));
const DIALOG = 'data:text/javascript,' + encodeURIComponent(
  'export const dialog = (o) => globalThis.__ddStub.dialog(o);');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: RISCOS, shortCircuit: true};
  if (spec === 'wimplib/Ui/Dialog') {
    return {url: DIALOG, shortCircuit: true};
  }
  return next(spec, ctx);
}});

const L = '../../tools/moreapps/!Letters/';
const {defaultsBox} = await import(L + 'DefaultsBox');
const {Document} = await import(L + 'Document');
const {Typing} = await import(L + 'Typing');
const {readDocx} = await import(L + 'DocxRead');
const {newDoc} = await import(L + 'NewDoc');
const {destroy} = await import(L + 'CloseDoc');

// ---------------------------------------------------------- fixtures

const DATE = new Date(Date.UTC(2026, 10, 4, 12));
let n = 0;

/** A window over Document d (what the box uses of one). */
function windowOf(d) {
  const typing = new Typing(d);
  const view = {d, typing, hdr: null, sel: {}, focused: 0,
    focus() { view.focused++; }};
  return {d, doc: d.doc, view, boxes: new Map(), docKey: 'doc' + (++n),
    app: {task: {name: 'Letters'}}};
}
const fresh = () => {
  const d = new Document(newDoc({date: DATE}));
  d.clearHistory();
  return windowOf(d);
};
const closeDoc = (dw) => {                         // (as ./CloseDoc)
  for (const b of [...dw.boxes.values()]) b.delete();
};

beforeEach(() => {
  s.beeps = 0;
  s.menus = [];
});

// -------------------------------------------------------------- tests

describe('the Document defaults box', () => {
  it('opens filled with the defaults; asked again, the same box', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    assert.equal(api.isOpen, true);
    assert.equal(api.opts.title, 'Document defaults');
    assert.equal(api.opts.key, `defaults:${dw.docKey}`);
    assert.deepEqual(api.opts.buttons, ['Cancel', 'Set']);
    assert.equal(api.get('font'), 'Calibri');
    assert.equal(api.get('size'), 11);
    assert.equal(api.get('after'), 160);
    assert.equal(api.get('spacing'), 'multiple');
    assert.equal(api.get('at'), 259 / 240);
    assert.equal(api.get('msg'), '');
    assert.equal(dw.boxes.get('defaults'), api.win);
    assert.equal(defaultsBox(dw), api);
    assert.equal(api.opens, 1);
  });
  it('Set: one undo step, the box gone, the caret back', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    api.change('size', 12);
    api.change('font', 'Arial');
    api.change('after', 0);
    api.change('spacing', 'single');
    api.press('Set');
    assert.equal(api.gone, true);
    assert.equal(dw.boxes.has('defaults'), false);
    assert.equal(dw.view.focused, 1);
    assert.equal(dw.d.undoDepth, 1);
    const dd = dw.d.doc.styles.docDefaults;
    assert.equal(dd.rPr.sz, 24);
    assert.equal(dd.pPr.spacing.after, 0);
    assert.equal(dd.pPr.spacing.line, 240);
    dw.d.undo();
    assert.equal(dw.d.doc.styles.docDefaults.rPr.sz, 22);
  });
  it('Set with nothing changed: no undo step, the box gone', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    api.press('Set');
    assert.equal(api.gone, true);
    assert.equal(dw.d.undoDepth, 0);
  });
  it('a bad value: a beep, why, the caret in it, the box kept', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    api.change('size', null);
    api.press('Set');
    assert.equal(api.gone, false);
    assert.equal(api.isOpen, true);
    assert.equal(s.beeps, 1);
    assert.equal(api.get('msg'), 'Check the Size value.');
    assert.equal(api.focused, 'size');
    assert.equal(dw.d.undoDepth, 0);
    api.change('size', 14);
    api.change('font', '');
    api.press('Set');
    assert.equal(api.get('msg'), 'Check the Font value.');
    assert.equal(api.focused, 'font');
    api.change('font', 'Georgia');
    api.press('Set');
    assert.equal(api.gone, true);
    assert.equal(dw.d.doc.styles.docDefaults.rPr.sz, 28);
  });
  it('the fields hold Word\'s ranges: Size 1-400 pt, After ' +
    '0-1584 pt', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    const rows = api.opts.rows.flat();
    const f = (name) => rows.find((c) => c.name === name);
    assert.equal(f('size').min, 1);
    assert.equal(f('size').max, 400);
    assert.equal(f('after').unit, 'pt');
    assert.equal(f('after').min, 0);
    assert.equal(f('after').max, 31680);
  });
  it('an original it cannot change: the reason in the box', async () => {
    const bytes = await buildDocx({'word/document.xml':
      documentXml(p(r('x'))), 'word/styles.xml': stylesXml(
      '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/>' +
      '</w:rPr></w:rPrDefault><w:rPrDefault><w:rPr/></w:rPrDefault>' +
      '</w:docDefaults><w:style w:type="paragraph" w:default="1" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/></w:style>')},
    {broken: 'two w:rPrDefault (the schema allows one)'});
    const d = new Document(await readDocx(bytes));
    d.clearHistory();
    const dw = windowOf(d);
    const api = defaultsBox(dw);
    api.change('size', 16);
    api.press('Set');
    assert.equal(api.gone, false);
    assert.equal(s.beeps, 1);
    assert.match(api.get('msg'), /cannot be changed/);
    assert.equal(d.undoDepth, 0);
  });
  it('Choose...: the font menu, a pick puts the name in', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    api.press('fonts');
    assert.equal(api.gone, false, 'the box kept');
    assert.equal(s.menus.length, 1);
    const m = s.menus[0];
    assert.equal(m.title, 'Font');
    const cal = m.items.find((i) => i.text === 'Calibri');
    assert.ok(cal && cal.ticked, 'the font now ticked');
    const ar = m.items.find((i) => i.text === 'Arial');
    ar.action();
    assert.equal(api.get('font'), 'Arial');
    api.press('Set');
    assert.equal(dw.d.doc.styles.docDefaults.rPr.rFonts.ascii, 'Arial');
  });
  it('Line spacing: At follows the kind, shaded for Single', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    assert.equal(api.shaded('at'), false);
    api.change('spacing', 'single');
    assert.equal(api.shaded('at'), true);
    api.change('spacing', 'exactly');
    assert.equal(api.get('at'), 12);
    assert.equal(api.get('atunit'), 'pt');
    api.press('Set');
    const sp = dw.d.doc.styles.docDefaults.pPr.spacing;
    assert.deepEqual([sp.line, sp.lineRule], [240, 'exact']);
  });
  it('the styles changed while it was open: filled again, kept', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    api.change('size', 20);
    api.press('Set');
    const again = defaultsBox(dw);
    assert.notEqual(again, api);
    assert.equal(again.get('size'), 20);
    dw.d.undo();
    again.change('after', 0);
    again.press('Set');
    assert.equal(again.gone, false);
    assert.equal(s.beeps, 1);
    assert.match(again.get('msg'), /changed/);
    assert.equal(again.get('size'), 11, 'filled again');
    again.press('Set');
    assert.equal(again.gone, true);
  });
  it('a second open after Cancel works', () => {
    const dw = fresh();
    const a = defaultsBox(dw);
    a.change('size', 30);
    a.press('Cancel');
    assert.equal(a.gone, true);
    assert.equal(dw.d.undoDepth, 0);
    const b = defaultsBox(dw);
    assert.notEqual(b, a);
    assert.equal(b.isOpen, true);
    assert.equal(b.get('size'), 11);
    b.change('size', 9);
    b.press('Set');
    assert.equal(b.gone, true);
    assert.equal(dw.d.doc.styles.docDefaults.rPr.sz, 18);
  });
  it('two windows: a box each, each setting its own document', () => {
    const one = fresh(), two = fresh();
    const a = defaultsBox(one), b = defaultsBox(two);
    assert.notEqual(a, b);
    a.change('size', 16);
    b.change('size', 8);
    b.press('Set');
    assert.equal(a.isOpen, true, 'the other box stays');
    assert.equal(one.d.undoDepth, 0);
    a.press('Set');
    assert.equal(one.d.doc.styles.docDefaults.rPr.sz, 32);
    assert.equal(two.d.doc.styles.docDefaults.rPr.sz, 16);
  });
  it('closed with the document', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    closeDoc(dw);
    assert.equal(api.gone, true);
    assert.equal(dw.boxes.size, 0);
  });
  it('CloseDoc destroy deletes it with the window', () => {
    const dw = fresh();
    const api = defaultsBox(dw);
    let gone = 0;
    Object.assign(dw, {closed: false, zb: {destroy() {}},
      win: {delete() { gone++; }}});
    dw.view.destroy = () => {};
    dw.app.docs = new Map([['k', dw]]);
    dw.app.closed = () => {};
    destroy(dw);
    assert.equal(api.gone, true);
    assert.equal(dw.boxes.size, 0);
    assert.equal(gone, 1);
  });
});
