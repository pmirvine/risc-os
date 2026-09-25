// !JsEdit's application and texts, built on !Edit's (src/apps/Edit/editor.js): JsEditApp is an EditApp (the
// list of texts, dialogue boxes, Find, queries) and CodeText a TextState (a document, its windows, files, the
// Save box) with a mode, a toolbar on each window, a menu of its own, Run, the syntax check, throwback,
// completion and the Functions list.

import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { Menu } from '../../core/menu.js';
import { parseType, typeName } from '../../core/filetypes.js';
import { checkSyntax } from '../../core/jsrun.js';
import { EditApp, TextState, parseMenuString } from '../Edit/editor.js';
import { parseOptions, formatOptions, defaultOptions, scrap, setSelection } from '../Edit/view.js';
import * as misc from '../Edit/misc.js';
import { CodeView } from './view.js';
import { loadModes, allModes, modeForType, modeNamed } from './modes.js';
import { Completion } from './complete.js';
import { Throwback, FunctionsList } from './lists.js';

const TOOLBAR_H = 32;
const CHECK_DELAY = 900;            // ms after typing stops before the syntax check runs

// ============================================================================================ app
export class JsEditApp extends EditApp {
  async init() {
    await super.init();                         // Edit's messages and templates (Find, Goto, Save, queries ...)
    await loadModes(os);
    this.throwback = new Throwback(this);
    return this;
  }

  // options: Edit's (JsEdit$Options, same letters) plus !JsEdit's display switches (JsEdit$Display)
  options() {
    const o = parseOptions(os.sysvars?.get('JsEdit$Options') ?? 'f7 b0 l0 m2 h12 w12 T', defaultOptions());
    const d = String(os.sysvars?.get('JsEdit$Display') ?? 'numbers bold line complete');
    o.lineNumbers = /\bnumbers\b/.test(d); o.boldKeywords = /\bbold\b/.test(d);
    o.currentLine = /\bline\b/.test(d); o.autoComplete = /\bcomplete\b/.test(d); o.dark = /\bdark\b/.test(d);
    o.wordwrap = false;
    return o;
  }
  saveOptions(o) {
    os.sysvars?.set('JsEdit$Options', formatOptions(o));
    os.sysvars?.set('JsEdit$Display', [o.lineNumbers && 'numbers', o.boldKeywords && 'bold', o.currentLine && 'line', o.autoComplete && 'complete', o.dark && 'dark'].filter(Boolean).join(' '));
  }

  createText(opts) { return new CodeText(this, opts); }

  progInfo() {
    const w = super.progInfo();
    const I = w.icons;
    I[1]?.setText(this.info.name ?? 'JsEdit');
    I[2]?.setText(this.info.purpose ?? 'Programmer\'s editor');
    I[3]?.setText(this.info.author ?? '');
    I[4]?.setText(this.info.version ?? '');
    return w;
  }

  /** Open a file (or bring it to the front) and put the caret on a line. */
  async openAt(path, line) {
    const s = this.findNamed(path) ?? await this.open(path, 0);
    if (!s) return null;
    s.front();
    if (line) s.gotoLine(line);
    return s;
  }

  /** Throwback from *JSRun (os.hooks.throwback): take errors in texts being edited here. */
  takeError(e) {
    const s = this.findNamed(e.path);
    if (!s) return false;
    s.markError(e.line, e.message, { runtime: true });
    s.front();
    s.gotoLine(e.line);
    this.throwback.add(e);                       // (last, so the Throwback window is in front)
    return true;
  }
}

// ============================================================================================ text
export class CodeText extends TextState {
  constructor(app, opts) {
    super(app, opts);
    this.mode = modeForType(this.filetype);
    this.functions = null;
    this.errors = new Map();                   // line -> message (for every window's gutter)
    this.runtimeLines = new Set();             // which of them came from running the program (kept until the next Run)
  }

  /** The title: the file name, * if changed, the number of views; plus Overwrite (Tab is always indentation here). */
  _titleFor(v) {
    let a = this.filename || '<untitled>';
    if (this.doc.modified) a += ' *';
    if (this.views.length > 1) a += ' ' + this.views.length;
    if (v.options.overwrite) a += ' Overwrite';
    return a;
  }

  /** The name a new text's Save box offers. */
  dftName() { return this.filetype === 0xF81 ? 'Program' : super.dftName(); }

  // ------------------------------------------------------------------ mode
  get filetype() { return this.doc.filetype; }
  set filetype(v) { this.doc.filetype = v; if (this.views) this.setMode(modeForType(v)); }
  setMode(mode) {
    if (!mode || mode === this.mode) return;
    this.mode = mode;
    for (const v of this.views) { v.modeChanged(); this._toolbarText(v); }
    this.functions?.update();
    this.scheduleCheck();
  }
  setType(name) {
    const t = parseType(name);
    if (t < 0) { this.app.task.reportError(`Unknown file type '${name}'`); return; }
    this.filetype = t;
    this.updateTitles();
  }

  // ------------------------------------------------------------------ windows (with a toolbar)
  createView(opts) {
    // a bigger window than Edit's: room for 80 columns of code and the line numbers
    const W = Math.min(740, wimp.width - 80), H = Math.min(520, wimp.height - 160);
    opts = { ...opts, w: opts.w ?? W, h: opts.h ?? H, x: opts.x ?? Math.max(20, Math.round((wimp.width - W) / 2) - 60 + this.app.states.length * 24 % 120), y: opts.y ?? 60 + (this.app.states.length * 24) % 120 };
    const v = new CodeView(this.app.task, this.doc, opts);
    v.state = this;
    v.marks = this.errors;
    this._toolbar(v);
    v.modeChanged();
    return v;
  }
  _toolbar(v) {
    const task = this.app.task;
    const btn = (x, w, text) => ({ x, y: 3, w, h: 26, text, border: true, filled: true, hcentre: true, vcentre: true, button: 'click', validation: 'R5,3', bg: 1 });
    const names = ['Save', 'Run', 'Check', 'Find', 'Goto', 'Functions', 'Errors'];
    const widths = [52, 44, 56, 48, 48, 84, 58];
    let x = 4;
    const icons = names.map((n, k) => { const b = btn(x, widths[k], n); x += widths[k] + 4; return b; });
    icons.push({ x: x + 8, y: 3, w: 420, h: 26, text: '', vcentre: true, fg: 7 });
    const tb = task.createWindow({
      flags: { pane: true }, colours: { workBg: 1 }, extent: { w: 1600, h: TOOLBAR_H },
      x: 0, y: 0, w: 400, h: TOOLBAR_H, icons, workButton: 'click',
    });
    tb.on('click', (ev) => {
      if (ev.button === 'menu') { this._lastView = v; wimp.menus.openAt(this.menu(v), ev, { task }); return true; }
      const k = ev.icon ? tb.icons.indexOf(ev.icon) : -1;
      this._lastView = v;
      [() => this.quickSave(), () => this.run(v), () => this.check(v, true), () => this.app.find.open(this, 'key'),
        () => this.gotoBox().show('key'), () => this.showFunctions(), () => this.app.throwback.open(),
        () => wimp.menus.openAt(this.modeMenu(), ev, { task })][k]?.();
      return true;
    });
    tb.on('helprequest', (ev) => {
      const k = ev.icon ? tb.icons.indexOf(ev.icon) : -1;
      ev.text = ['Click SELECT to save the text (F3).', 'Click SELECT to save the program and run it (Ctrl-R).', 'Click SELECT to check the program\'s syntax.',
        'Click SELECT to find text (F4).', 'Click SELECT to go to a line (F5).', 'Click SELECT to list the functions in the text.',
        'Click SELECT to see the errors from your programs (throwback).', 'This shows the text\'s mode and where the caret is.|MClick SELECT to change the mode.'][k] ?? 'This is !JsEdit\'s toolbar.';
    });
    v.toolbar = tb;
    v.inset = TOOLBAR_H;
    v.win.attachPane(tb, { dx: 0, dy: 0, h: TOOLBAR_H, fitWidth: true });
    v.win.on('deleted', () => { v.completion?.dispose(); });
    this._toolbarText(v);
  }
  _toolbarText(v) {
    if (!v.toolbar) return;
    const L = v.lineOf?.(v.caret) ?? 0;
    const col = v.caret - (v.lineStarts?.[L] ?? 0) + 1;
    v.toolbar.icons[7].setText(`${this.mode?.name ?? 'Text'}    Line ${L + 1}  Col ${col}`);
  }

  // hooks from CodeView
  caretMoved(v) { this._toolbarText(v); }
  textChanged() { this.scheduleCheck(); clearTimeout(this._fnT); this._fnT = setTimeout(() => this.functions?.update(), 400); }
  typed(v, ch) {
    if (!v.options.autoComplete) return;
    if (/[\w$.]/.test(ch)) Completion.update(v);
    else v.completion?.close();
  }
  complete(v, force) { Completion.update(v, force); }

  // ------------------------------------------------------------------ errors, checking, running
  get isJS() { return this.mode?.name === 'JavaScript'; }
  markError(line, message, { runtime = false } = {}) {
    this.errors.set(line, message);
    if (runtime) this.runtimeLines.add(line); else this.runtimeLines.delete(line);
    for (const v of this.views) v.invalidate();
  }
  /** Clear the syntax check's marks (and with all: the ones from running the program too). */
  clearErrors({ all = false } = {}) {
    let changed = false;
    for (const line of [...this.errors.keys()]) {
      if (!all && this.runtimeLines.has(line)) continue;
      this.errors.delete(line); this.runtimeLines.delete(line); changed = true;
    }
    if (changed) for (const v of this.views) v.invalidate();
  }
  scheduleCheck() {
    clearTimeout(this._checkT);
    if (!this.isJS) { this.clearErrors({ all: true }); return; }
    this._checkT = setTimeout(() => this.check(null, false), CHECK_DELAY);
  }
  /** Check the syntax; mark the first mistake. report: also say so (Check button). Resolves null if it's OK, else {line, message}. */
  async check(v, report = false) {
    if (!this.isJS) { if (report) this.app.task.reportError(`${this.mode?.name ?? 'Text'} files aren't checked`); return null; }
    const err = await checkSyntax(this.doc.text);
    this.clearErrors();
    if (!err) { if (report) this.app.task.reportError('No syntax errors found', { category: 'info' }); return null; }
    this.markError(err.line, err.message);
    if (report) {
      this.gotoLine(err.line);
      this.app.throwback.add({ path: this.filename || '<untitled>', line: err.line, message: err.message });
    }
    return err;
  }
  /** Run (Ctrl-R, toolbar): save if needed, check, then *JSRun it (an application's !RunImage: run the application). */
  async run(v) {
    if (!this.isJS) { this.app.task.reportError('Only JavaScript programs can be run from !JsEdit'); return; }
    clearTimeout(this._checkT);                 // (Run checks now: no check pending afterwards)
    if (!this.filename || !/[.:]/.test(this.filename)) {
      // not saved yet: the Save box first, then run
      this._afterSave = (path, toApp) => { this._afterSave = null; if (!toApp) this.run(v); };
      this.openSaveBox('pointer');
      return;
    }
    if (this.doc.modified) {
      try { await this.saveTo(this.filename, true); } catch (e) { this.app.task.reportError(e.message); return; }
    }
    this.clearErrors({ all: true });
    const err = await this.check(v, false);
    if (err) {
      this.gotoLine(err.line);
      this.app.throwback.add({ path: this.filename, line: err.line, message: err.message });
      return;
    }
    this.app.throwback.clear(this.filename);
    const dir = this.filename.slice(0, this.filename.lastIndexOf('.'));
    const target = /\.!runimage$/i.test(this.filename) ? dir : this.filename;
    os.cli.run(`Run ${target}`).catch((e) => this.app.task.reportError(e.message));
  }

  gotoLine(line) {
    const v = this.activeView;
    if (!v) return;
    v.setCaret(misc.lineStart(this.doc, line), { take: true });
    this.doc.separate();
  }
  showFunctions() {
    if (!this.functions) this.functions = new FunctionsList(this);
    else this.functions.update();
    this.functions.open();
  }
  /** Comment or uncomment the selected lines (or the caret's line) with the mode's line comment. */
  toggleComment(v = this.activeView) {
    const c = this.mode?.comment;
    if (!c || !v) return;
    const d = this.doc;
    const sel = scrap.doc === d;
    const a = d.bol(sel ? scrap.start : v.caret);
    let b = sel ? scrap.end : d.eol(v.caret);
    if (sel && b > a && d.slice(b - 1, b) === '\n') b--;
    const lines = d.slice(a, b).split('\n');
    const on = lines.some((l) => l.trim() && !l.trimStart().startsWith(c));
    const out = lines.map((l) => (on ? (l.trim() ? l.replace(/^(\s*)/, `$1${c} `) : l) : l.replace(new RegExp(`^(\\s*)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ?`), '$1'))).join('\n');
    d.separate(); d.replace(a, b - a, out); d.separate();
    if (sel) setSelection(d, a, a + out.length);
  }

  // ------------------------------------------------------------------ dispose
  dispose() {
    clearTimeout(this._checkT); clearTimeout(this._fnT);
    this.functions?.win.delete();
    super.dispose();
  }

  // ------------------------------------------------------------------ menus
  modeMenu() {
    return new Menu('Mode', allModes().map((m) => ({ text: m.name, ticked: () => this.mode === m, action: () => this.setMode(m) })));
  }
  /** The window menu: Edit's Misc, Save, Select and Display, and !JsEdit's Edit, Mode and Run. */
  menu(v = this.activeView) {
    const base = super.menu(v);
    const [misc0, save, select, , display] = base.items;
    const toggle = (k) => () => { v.options[k] = !v.options[k]; this.app.saveOptions(v.options); for (const o of this.views) { o.options[k] = v.options[k]; o.applyOptions(false); } };
    const edit = new Menu('Edit', [
      { text: 'Find', key: 'F4', submenu: () => this.app.find.submenu(this) },
      { text: 'Goto', key: 'F5', submenu: () => { this._lastView = v; return this.gotoBox().asSubmenu(); } },
      { text: 'Undo', key: 'F8', action: () => v.undo() },
      { text: 'Redo', key: 'F9', action: () => v.redo(), dotted: true },
      { text: 'Indent', key: 'Tab', action: () => { v.indent(1); this.doc.separate(); } },
      { text: 'Outdent', key: '\x8bTab', action: () => { v.indent(-1); this.doc.separate(); } },
      { text: 'Comment', shaded: () => !this.mode?.comment, action: () => this.toggleComment(v) },
      { text: 'Complete', key: '^Space', action: () => this.complete(v, true) },
    ]);
    const extra = [
      { text: 'Line numbers', ticked: () => v.options.lineNumbers, action: toggle('lineNumbers'), dotted: false },
      { text: 'Bold keywords', ticked: () => v.options.boldKeywords, action: toggle('boldKeywords') },
      { text: 'Caret line', ticked: () => v.options.currentLine, action: toggle('currentLine') },
      { text: 'Completion', ticked: () => v.options.autoComplete, action: toggle('autoComplete') },
      { text: 'Dark theme', ticked: () => v.options.dark, action: toggle('dark') },
    ];
    const disp = display.submenu;
    disp.items[disp.items.length - 1].dotted = true;
    disp.items.push(...extra);
    const run = new Menu('Run', [
      { text: 'Run', key: '^R', shaded: () => !this.isJS, action: () => this.run(v) },
      { text: 'Check syntax', shaded: () => !this.isJS, action: () => this.check(v, true), dotted: true },
      { text: 'Functions', action: () => this.showFunctions() },
      { text: 'Throwback', action: () => this.app.throwback.open() },
    ]);
    return new Menu('JsEdit', [
      misc0, save, select,
      { text: 'Edit', submenu: edit },
      display,
      { text: 'Mode', submenu: this.modeMenu() },
      { text: 'Run', submenu: run },
    ]);
  }
}

export { parseMenuString, typeName, modeNamed };
