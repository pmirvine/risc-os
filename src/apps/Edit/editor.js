// The Edit application proper: RISC_OSLib txtedit.c + txtoptmenu.c + txtfile.c + Edit's c.edit.
//
//   EditApp     one per Edit task: the list of texts, options (Edit$Options), BASIC settings,
//               templates/messages, icon bar menu, Find system.
//   TextState   one per edited text (txtedit_state): an EditDocument, one or more EditViews
//               (windows), file name / type / date, menus and all the menu / key operations.
//
// Other code (TaskWindow) reuses this through src/apps/Edit/api.js - see docs/apps/Edit.md.

import { wimp } from '../../core/wimp.js';
import { input } from '../../core/input.js';
import { os } from '../../core/os.js';
import { Menu, colourMenu } from '../../core/menu.js';
import { saveAs } from '../../core/dialogs.js';
import { loadMessages } from '../../core/messages.js';
import { loadTemplates, IF } from '../../core/templates.js';
import { typeName, parseType, fileSprite, hex3 } from '../../core/filetypes.js';
import { formatDate } from '../../core/filer.js';
import { EditDocument } from './document.js';
import { EditView, scrap, setSelection, clearSelection, loadSystemFont, parseOptions, formatOptions, defaultOptions } from './view.js';
import { DBox } from './dbox.js';
import { FindController } from './findbox.js';
import * as misc from './misc.js';
import { detokeniseProgram, tokeniseText, isBasicProgram } from './basic.js';

export const bytesToString = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return s;
};
export const stringToBytes = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF; return b; };

/** Split a RISC_OSLib menu description ("A,>B    F3,C|D") into items {text, key, dotted, dbox}. */
export function parseMenuString(str) {
  const out = [];
  let cur = '';
  const push = (dotted) => {
    let t = cur, dbox = false, tick = false, shade = false;
    for (;;) {
      if (t[0] === '>') { dbox = true; t = t.slice(1); } else if (t[0] === '!') { tick = true; t = t.slice(1); } else if (t[0] === '~') { shade = true; t = t.slice(1); } else break;
    }
    const m = /^(.*?\S)\s{2,}(\S.*)$/.exec(t);
    out.push({ text: m ? m[1] : t.trim() ? t : t, key: m ? m[2] : undefined, dotted, dbox, tick, shade });
    cur = '';
  };
  for (const c of String(str)) {
    if (c === ',') push(false);
    else if (c === '|') push(true);
    else cur += c;
  }
  push(false);
  return out;
}

const FONT_SIZES = [8, 10, 12, 14, 20];

// ============================================================================================ app
export class EditApp {
  constructor(task, info = {}) {
    this.task = task;
    this.info = info;
    this.states = [];
    this.basicStrip = true;          // Edit_Strip (icon bar menu ▸ BASIC options)
    this.basicIncrement = 10;        // Edit_Incrm
    this.formatWidth = 76;           // fwidthbuf (Edit ▸ Format text ▸)
    this.newTypeName = '';           // Create ▸ writable
  }

  async init() {
    [this.M, this.tpl, this.fontsMsgs] = await Promise.all([
      loadMessages('Edit'), loadTemplates('assets/templates/Edit.json'), loadMessages('Fonts'), loadSystemFont(), os.fontreg?.ready(),
    ]);
    this.find = new FindController(this);
    return this;
  }

  /** Message lookup with C printf-style (%s %d %i) and %0-%3 parameters. */
  msg(tok, ...args) {
    let s = this.M.has(tok) ? this.M.dict[tok] : tok;
    let k = 0;
    s = s.replace(/%([sdi])/g, () => String(args[k++] ?? ''));
    return s.replace(/%([0-3])/g, (_, n) => String(args[+n] ?? ''));
  }
  help(tok) { return this.M.has(tok) ? this.M.lookup(tok) : null; }

  // ------------------------------------------------------------------ options (Edit$Options)
  options() { return parseOptions(os.sysvars?.get('Edit$Options') ?? '', defaultOptions()); }
  saveOptions(o) { os.sysvars?.set('Edit$Options', formatOptions(o)); }

  // ------------------------------------------------------------------ texts
  findNamed(path) {
    const l = String(path).toLowerCase();
    return this.states.find((s) => s.filename && s.filename.toLowerCase() === l) ?? null;
  }
  get modifiedCount() { return this.states.filter((s) => s.doc.modified && !s.noQuitCheck).length; }

  /**
   * txtedit_newwithoptions: open a window on a file (or a new empty text of desiredType when
   * filename is ''). Returns the TextState, or null (error already reported).
   */
  async open(filename = '', desiredType = 0xFFF, { options = null, focus = true } = {}) {
    const vfs = os.vfs;
    let st = null;
    if (filename) {
      st = vfs.stat(filename);
      if (!st || st.type !== 'file') { await this.task.reportError(this.msg('txt43', filename)); return null; }
      filename = st.path;
      const s = this.findNamed(filename);
      if (s && !s.doc.modified) {
        if (+s.date !== +st.date) { s.doc.setText(''); await s.insertFile(filename, true); }
        s.front();
        return s;
      }
    }
    const filetype = st ? st.filetype : desiredType;
    const s = new TextState(this, { filename: '', filetype, date: st?.date ?? new Date() });
    const v = s.newView({ options });
    if (filetype !== 0xFFF) v.options.wordwrap = false;
    if (filename) {
      const text = await s.readFile(filename, st);
      if (text == null) { s.dispose(); return null; }
      s.doc.setText(text);
      s.doc.filename = filename;
      s.date = st.date;
    }
    v.applyOptions(false);
    v.open();
    if (focus) v.setCaret(0);
    s.updateTitles();
    return s;
  }

  /**
   * txtedit_install for other clients (task windows): a new, unnamed text with one window.
   * opts: {title, text, filetype, readOnly, options, noQuitCheck}
   */
  install(opts = {}) {
    const s = new TextState(this, { filename: '', filetype: opts.filetype ?? 0xFFF, date: new Date() });
    s.noQuitCheck = !!opts.noQuitCheck;
    const v = s.newView({ options: opts.options });
    if (opts.text) s.doc.setText(opts.text);
    s.doc.readOnly = !!opts.readOnly;
    if (opts.title != null) s.titleOverride = opts.title;
    v.applyOptions(false);
    s.updateTitles();
    return s;
  }

  // ------------------------------------------------------------------ quitting
  /** txtedit_mayquit: ask about modified files. Resolves true if Edit may quit. */
  async mayQuit() {
    const n = this.modifiedCount;
    if (!n) return true;
    const r = await this.query('quit', n === 1 ? this.msg('txt6') : this.msg('txt7', n), { discard: 0, cancel: 2 });
    return r === 'discard';
  }
  disposeAll() { for (const s of [...this.states]) s.dispose(); }

  /** dboxquery_close / dboxquery_quit using Edit's "close" / "quit" templates. Resolves to a name. */
  query(tplName, message, buttons) {
    return new Promise((resolve) => {
      const names = Object.fromEntries(Object.entries(buttons).map(([k, v]) => [v, k]));
      let done = false;
      const box = new DBox(this.tpl, tplName, {
        task: this.task, messages: this.M, help: tplName === 'quit' ? 'QUIT' : 'CLOSE',
        onAction: (i) => { if (names[i]) finish(names[i]); },
        onClose: () => finish('cancel'),
      });
      const finish = (r) => { if (done) return; done = true; box.win.delete(); resolve(r); };
      box.setField(1, message);
      box.key = ((orig) => (ev) => { if (ev.code === 13) { finish(names[0] ?? 'cancel'); return true; } if (ev.code === 27) { finish('cancel'); return true; } return orig.call(box, ev); })(box.key);
      box.win.open({ behind: 'top' });
      wimp.setCaret(box.win);
    });
  }

  // ------------------------------------------------------------------ dialogue helpers
  /** dboxfile: ask for a file name ("Name of new file:" / "Insert file:"). Resolves string or ''. */
  askFileName(message, how = 'key') {
    return new Promise((resolve) => {
      let result = '';
      const box = new DBox(this.tpl, 'dboxfile_db', {
        task: this.task,
        onAction: (i) => { if (i === 0) { result = box.field(2); box.hide(); } },
        onClose: () => { box.win.delete(); resolve(result); },
      });
      box.setField(1, message);
      box.setField(2, '');
      box.show(how);
    });
  }

  progInfo() {
    if (!this._progInfo) {
      const w = wimp.createWindowFromTemplate(this.tpl, 'proginfo', {}, this.task);
      const I = w.icons;
      I[1]?.setText(this.info.name ?? 'Edit');
      I[2]?.setText(this.info.purpose ?? 'Text editor');
      I[3]?.setText(this.info.author ?? '© Acorn Computers Ltd, 1994');
      I[4]?.setText(this.M.lookup('EditId'));
      w.on('helprequest', (ev) => { ev.text = this.help('PROGINFO'); });
      this._progInfo = w;
    }
    return this._progInfo;
  }

  /** Font menu as built by Font_MakeMenu (with "System font"). onPick(name|null), current() */
  fontMenu(current, pick) {
    // the fonts the Font Manager knows: the ROM / !Fonts fonts and any outline fonts on Font$Path (core fontreg.js)
    const reg = os.fontreg;
    const fams = new Map(reg ? reg.families() : []);
    // a font from the disc is converted to a web font first; the text is laid out again when it is ready
    const onPick = (name) => { pick(name); if (name && reg?.info(name)?.disc) reg.load(name).then((f) => { if (f) pick(name); }); };
    const cur = () => current();
    const help = () => this.help('HELPX40');
    const items = [{ text: this.fontsMsgs.lookup('SystemFont'), ticked: () => cur() == null, action: () => onPick(null), dotted: true, help }];
    for (const [f, styles] of [...fams.entries()].sort()) {
      if (styles.length === 1 && !styles[0]) {
        items.push({ text: f, ticked: () => cur() === f, action: () => onPick(f), help });
      } else {
        const sub = new Menu(f, styles.map((st) => ({ text: st || this.fontsMsgs.lookup('Regular'), ticked: () => cur() === (st ? `${f}.${st}` : f), action: () => onPick(st ? `${f}.${st}` : f), help })));
        items.push({ text: f, ticked: () => (cur() ?? '').split('.')[0] === f, submenu: sub, action: () => onPick(`${f}.${styles[0]}`), help });
      }
    }
    return new Menu(this.fontsMsgs.lookup('FontList'), items);
  }
}

// ============================================================================================ text
export class TextState {
  constructor(app, { filename = '', filetype = 0xFFF, date = new Date() } = {}) {
    this.app = app;
    this.doc = new EditDocument({ filename, filetype, date });
    this.views = [];
    this.alive = true;
    this.titleOverride = null;     // string | fn(view) (task windows)
    this.menuHook = null;          // fn(view, ev) -> true if it opened its own menu (task windows)
    this.keyFilter = null;         // fn(view, ev) -> true if consumed (task windows); per view too
    this.closeHook = null;         // async fn(view, ev) -> true if handled
    this.noQuitCheck = false;
    app.states.push(this);
    this.doc.on('modified', () => this.updateTitles());
  }

  get M() { return this.app.M; }
  get filename() { return this.doc.filename; }
  set filename(v) { this.doc.filename = v; this.updateTitles(); }
  get filetype() { return this.doc.filetype; }
  set filetype(v) { this.doc.filetype = v; }
  get date() { return this.doc.date; }
  set date(v) { this.doc.date = v; }
  /** The view that last had the input focus (or the first). */
  get activeView() { return this.views.find((v) => v.hasFocus) ?? this._lastView ?? this.views[0] ?? null; }
  get caret() { return this.activeView?.caret ?? 0; }

  // ------------------------------------------------------------------ views
  newView({ options = null, x, y, w, h } = {}) {
    const o = { ...this.app.options(), ...(options ?? {}) };
    const v = new EditView(this.app.task, this.doc, { options: o, x, y, w, h, handlers: this._handlers() });
    v.state = this;
    v.keyFilter = (ev) => !!this.keyFilter?.(v, ev);
    v.titleOverride = () => this._titleFor(v);
    this.views.push(v);
    this._lastView = v;
    return v;
  }
  /** Misc ▸ New view (txtedit_splitwindow). */
  splitWindow(from = this.activeView) {
    const v = this.newView({ options: from?.options });
    v.applyOptions(false);
    v.open();
    v.setCaret(from?.caret ?? 0);
    this.updateTitles();
    return v;
  }
  front() { const v = this.activeView; if (v) { v.win.open({ behind: 'top' }); v.showCaret(); } }

  /** txtedit_settexttitle */
  _titleFor(v) {
    if (this.titleOverride != null) return typeof this.titleOverride === 'function' ? this.titleOverride(v) : this.titleOverride;
    let a = this.filename || this.M.lookup('txt65');
    if (this.doc.modified) a += ' *';
    if (this.views.length > 1) a += ' ' + this.views.length;
    const o = v.options;
    if (!o.wordtab) a += this.M.lookup('txt23');
    if (o.overwrite) a += this.M.lookup('txt24');
    if (o.wordwrap) a += this.M.lookup('txt25');
    return a;
  }
  updateTitles() { for (const v of this.views) v._title(); }

  // ------------------------------------------------------------------ view handlers
  _handlers() {
    const s = this, app = this.app;
    return {
      menu: (v, ev) => { s._lastView = v; if (s.menuHook?.(v, ev)) return; wimp.menus.openAt(s.menu(v), ev, { task: app.task }); },
      save: (v) => s.openSaveBox('key'),
      find: (v) => { s._lastView = v; app.find.open(s, 'key'); },
      gotoLine: (v) => { s._lastView = v; s.gotoBox().show('key'); },
      indent: () => { if (scrap.doc) s.indentBox().show('key'); },
      close: (v, ev) => s.closeView(v, ev),
      newFile: async (v) => { const n = await app.askFileName(app.msg('txt69')); if (n) app.open(n, 0xFFF, { options: v.options }); },
      insertFile: async (v) => { const n = await app.askFileName(app.msg('txt70')); if (n) s.insertFile(n, true); },
      expandTabs: (v) => s.expandTabs(v),
      formatText: (v) => s.formatText(v),
      swapCRLF: () => s.swapCRLF(),
      print: () => s.print(),
      dataLoad: (v, ev) => s.dataLoad(v, ev),
      dataSave: (v, ev) => s.dataSave(v, ev),
      optionsChanged: (v) => { app.saveOptions(v.options); for (const o of s.views) if (o !== v) { o.options.overwrite = v.options.overwrite; o.options.wordtab = v.options.wordtab; o.options.wordwrap = v.options.wordwrap; } s.updateTitles(); },
      formatWidth: () => app.formatWidth,
      focus: (v) => { s._lastView = v; },
      help: (v) => [app.M.lookup('txt19'), app.M.lookup('txt20'), app.M.lookup(scrap.doc === s.doc ? 'txt21' : 'txt22')].join('|M'),
    };
  }

  // ------------------------------------------------------------------ files
  /**
   * Read a file as Edit text: BASIC is detokenised (asking about line numbers, bas2), everything
   * else is taken byte for byte. Returns the text, or null if the load was abandoned.
   */
  async readFile(path, st = os.vfs.stat(path)) {
    const app = this.app;
    let bytes;
    try { bytes = await os.vfs.readFile(path); } catch (e) { await app.task.reportError(e.message ?? String(e)); return null; }
    if (st?.filetype === 0xFFB) {
      if (!isBasicProgram(bytes)) {
        const r = await app.task.reportError(app.msg('bas1'), { cancel: true });
        if (r === 2) return null;
        return bytesToString(bytes);
      }
      let r = detokeniseProgram(bytes, app.basicStrip);
      if (r.needNumbers) {
        const b = await app.task.reportError(app.msg('bas2'), { cancel: true });
        if (b !== 1) return null;
        r = detokeniseProgram(bytes, false);
      }
      return r.text;
    }
    return bytesToString(bytes);
  }

  /** txtedit_doinsertfile: insert a file at the caret. */
  async insertFile(path, replaceIfWasNull = true, { moveCaret = false } = {}) {
    const st = os.vfs.stat(path);
    if (!st || st.type !== 'file') { await this.app.task.reportError(this.app.msg('txt51', path)); return false; }
    const wasNull = this.doc.length === 0;
    const text = await this.readFile(st.path, st);
    if (text == null) return false;
    const v = this.activeView;
    const at = v?.caret ?? 0;
    this.doc.separate();
    this.doc.insert(at, text);
    this.doc.separate();
    if (moveCaret && v) v.setCaret(at + text.length);
    if (wasNull) {
      this.filetype = st.filetype;
      this.date = st.date;
      this.doc.setModified(false);
      this.doc.clearUndo();
      if (replaceIfWasNull) this.filename = st.path;
    }
    this.updateTitles();
    return true;
  }

  /** Import data transferred from another application (txtedit_doimport). */
  async importData(bytes, filetype) {
    let text;
    if (filetype === 0xFFB && isBasicProgram(bytes)) {
      let r = detokeniseProgram(bytes, this.app.basicStrip);
      if (r.needNumbers) {
        const b = await this.app.task.reportError(this.app.msg('bas2'), { cancel: true });
        if (b !== 1) return false;
        r = detokeniseProgram(bytes, false);
      }
      text = r.text;
    } else text = typeof bytes === 'string' ? bytes : bytesToString(bytes);
    const v = this.activeView;
    const at = v?.caret ?? 0;
    this.doc.separate();
    this.doc.insert(at, text);
    this.doc.separate();
    return true;
  }

  /** The bytes to save for [from, to): BASIC is re-tokenised (warnings reported). */
  async dataFor(from = 0, to = this.doc.length) {
    const text = this.doc.slice(from, to);
    if (this.filetype === 0xFFB) {
      let r;
      try { r = tokeniseText(text, this.app.basicIncrement); } catch (e) { throw new Error(this.app.msg('bas9')); }
      for (const w of r.warnings) await this.app.task.reportError(w);
      return r.bytes;
    }
    return stringToBytes(text);
  }

  /** Write the whole text to a file (txtedit__saverprocsafe). safe: the file is its new home. */
  async saveTo(path, safe = true) {
    let data;
    try { data = await this.dataFor(); } catch (e) { await this.app.task.reportError(e.message); throw e; }
    const type = this.filetype >= 0 ? this.filetype : 0xFFD;
    let canon;
    try { canon = os.vfs.writeFile(path, data, { filetype: type }); } catch (e) {
      throw new Error(e.message ?? this.app.msg('txt2', path));
    }
    if (safe) {
      this.filename = os.vfs.stat(canon ?? path)?.path ?? path;
      this.date = new Date();
      this.doc.setModified(false);
      this.updateTitles();
    }
    return true;
  }

  dftName() {
    const t = this.filetype;
    return this.M.lookup(t === 0xFFF ? 'txt26' : t === 0xFFD ? 'txt27' : t === 0xFFE ? 'txt28' : t === 0xFEB ? 'txt29' : t === 0xFE1 ? 'txt29a' : t === 0xFFB ? 'txt29b' : 'txt30');
  }

  /** The Save box (Save ▸ / F3). */
  saveBox() {
    this._saveBox?.delete();
    const app = this.app;
    const box = this._saveBox = saveAs({
      task: app.task, filename: this.filename || this.dftName(), filetype: this.filetype >= 0 ? this.filetype : 0xFFD,
      getData: async () => { app._savingFrom = this; try { return await this.dataFor(); } finally { app._savingFrom = null; } },
      save: async (path) => { await this.saveTo(path, true); },
      onSaved: (path, { toApp } = {}) => { this._afterSave?.(path, toApp); },
    });
    box.on('helprequest', (ev) => { ev.text = app.help(ev.icon ? ['SAVEAS0', 'SAVEAS2', 'SAVEAS3'][ev.icon.handle] ?? 'SAVEAS' : 'SAVEAS'); });
    box.on('closed', () => { app._saveBoxFrom = null; });
    app._saveBoxFrom = this;
    return box;
  }
  /** Open the save box as a transient box near the caret / pointer (F3). */
  openSaveBox(how = 'key') {
    const box = this.saveBox();
    const v = this.activeView;
    let x = input.mouseX, y = input.mouseY;
    if (how === 'key' && v?.hasFocus && wimp.caret?.pos) { const p = v.win.workToScreen(wimp.caret.pos.x, wimp.caret.pos.y); x = p.x + 50; y = p.y + 60; } else { x -= 24; y -= 24; }
    wimp.menus.open(box, Math.round(x), Math.round(y), { task: this.app.task });
    const nameI = box.icons[1];
    if (nameI) wimp.setCaret(box, nameI, nameI.text.length);
    return box;
  }

  /** Select ▸ Save ▸ : save the selection (txtedit_saveselect). */
  saveSelectionBox() {
    this._selBox?.delete();
    const app = this.app;
    const box = this._selBox = saveAs({
      task: app.task, filename: this.M.lookup('txt73'), filetype: this.filetype >= 0 ? this.filetype : 0xFFD,
      getData: async () => { app._selSaveFrom = this; return (scrap.doc === this.doc) ? this.dataFor(scrap.start, scrap.end) : new Uint8Array(0); },
      save: async (path) => {
        const data = await this.dataFor(scrap.start, scrap.end);
        os.vfs.writeFile(path, data, { filetype: this.filetype >= 0 ? this.filetype : 0xFFD });
      },
      onSaved: () => { app._selSaveFrom = null; },
    });
    box.on('helprequest', (ev) => { ev.text = app.help(ev.icon ? ['SAVEAS0', 'SAVEAS2', 'SAVEAS3'][ev.icon.handle] ?? 'SAVEAS' : 'SAVEAS'); });
    box.on('closed', () => { app._selSaveFrom = null; });
    app._selSaveFrom = this;
    return box;
  }

  /** Main menu "Save" clicked: save straight away if the text has a full name. */
  quickSave() {
    if (this.filename && /[.:]/.test(this.filename)) {
      this.saveTo(this.filename, true).catch((e) => this.app.task.reportError(e.message ?? this.app.msg('txt2', this.filename)));
    } else this.openSaveBox('pointer');
  }

  // ------------------------------------------------------------------ drag & drop into a window
  async dataLoad(v, ev) {
    const f = ev.files?.[0];
    if (!f) return;
    this._lastView = v;
    if (f.filetype === 0x1000 || f.filetype === 0x2000 || ev.shift) {
      // Shift-drag (or a directory): insert the file name, and a newline
      const at = v.caret;
      this.doc.separate();
      this.doc.insert(at, f.path + '\n');
      this.doc.separate();
      v.setCaret(at + f.path.length + 1);
      return;
    }
    await this.insertFile(f.path, true, { moveCaret: true });
  }

  async dataSave(v, ev) {
    const app = this.app;
    this._lastView = v;
    if (app._saveBoxFrom === this && ev.from === app.task && !app._selSaveFrom) { app.task.reportError(app.msg('txt1')); return; }
    if (app._selSaveFrom === this && ev.from === app.task) {
      // dragging a selection into its own text: a copy
      wimp.menus.close();
      v.copySelection();
      return;
    }
    const data = await ev.receive();
    await this.importData(data, ev.filetype);
  }

  // ------------------------------------------------------------------ edit operations
  expandTabs(v = this.activeView) {
    this.doc.separate();
    const d = misc.expandTabs(this.doc, v?.caret ?? 0);
    this.doc.separate();
    v?.setCaret(d);
  }
  formatText(v = this.activeView) {
    this.doc.separate();
    const d = misc.formatParagraph(this.doc, v?.caret ?? 0, this.app.formatWidth || 1);
    this.doc.separate();
    v?.setCaret(d);
  }
  swapCRLF() { misc.exchangeCRLF(this.doc); for (const v of this.views) v.showCaret(false); }
  /** Print the text (or the selection) through !Printers: Edit prints what it shows, so BASIC prints as its listing. */
  print(selection = false) {
    const sel = selection && scrap.doc === this.doc;
    const text = sel ? this.doc.slice(scrap.start, scrap.end) : this.doc.text;
    if (os.printers?.current) {
      os.printers.print({ title: this.filename || '<untitled>', text, size: text.length });
      return;
    }
    // no printer manager API: a PrintSave broadcast (a printer manager could claim it), else the Edit error
    const claimed = wimp.sendMessage('PrintSave', { filetype: this.filetype, filename: this.filename, getData: () => this.dataFor(sel ? scrap.start : 0, sel ? scrap.end : this.doc.length) }, { from: this.app.task });
    if (!claimed) this.app.task.reportError(this.app.msg('txt64'));
  }
  setType(name) {
    const t = parseType(name);
    if (t < 0) { this.app.task.reportError(`Unknown file type '${name}'`); return; }
    this.filetype = t;
    this.updateTitles();
  }

  // ------------------------------------------------------------------ dialogue boxes
  gotoBox() {
    const app = this.app, v = this.activeView;
    this._goto?.win.delete();
    const box = this._goto = new DBox(app.tpl, 'goto', {
      task: app.task, messages: app.M, help: 'GOTO',
      onAction: (i, { persist }) => {
        if (i !== 0) return;
        const line = box.numeric(4);
        const view = this.activeView;
        if (!persist) box.hide();
        if (view) { view.setCaret(misc.lineStart(this.doc, line)); this.doc.separate(); }
        if (persist) { box.setField(2, String(this.doc.lineNumberAt(view?.caret ?? 0))); box.setField(3, String(view?.caret ?? 0)); }
      },
    });
    box.setField(2, String(this.doc.lineNumberAt(v?.caret ?? 0)));
    box.setField(3, String(v?.caret ?? 0));
    box.setField(4, '');
    return box;
  }

  indentBox() {
    const app = this.app;
    if (!this._indent) {
      const box = this._indent = new DBox(app.tpl, 'indent', {
        task: app.task, messages: app.M, help: 'INDENT',
        onAction: (i, { persist }) => {
          if (i !== 0) { box.hide(); return; }
          const owner = scrap.doc;
          if (!owner) { box.hide(); return; }
          const txt = box.field(2);
          let by = parseInt(txt, 10) || 0, withStr;
          if (by === 0) { by = 99; withStr = txt; } else withStr = ' '.repeat(99);
          owner.separate();
          const r = misc.indentRegion(owner, scrap.start, scrap.end, by, withStr);
          if (r) setSelection(owner, Math.min(r.start, scrap.start), r.end);
          owner.separate();
          if (!persist) box.hide();
        },
      });
    }
    return this._indent;
  }

  fileInfoBox() {
    const app = this.app;
    this._fileInfo?.delete();
    const w = this._fileInfo = wimp.createWindowFromTemplate(app.tpl, 'fileinfo', {}, app.task);
    const I = w.icons;
    const stamped = this.filetype >= 0;
    I[1].setText(this.filename || this.M.lookup('txt65'));
    I[2].setText(this.M.lookup(this.doc.modified ? 'txt66' : 'txt67'));
    I[3].setText(stamped ? `${typeName(this.filetype).padEnd(8, ' ').slice(0, 8)}(${hex3(this.filetype).toLowerCase()})` : this.M.lookup('txt68'));
    I[4].setText(String(this.doc.length));
    I[5].setText(stamped ? formatDate(this.date ?? new Date()) : '');
    // fileicon(): the icon becomes a sprite-only icon showing the file type's sprite
    I[6].flags = ((I[6].flags & ~IF.text & ~IF.indirected) | IF.sprite) >>> 0;
    I[6].setSprite(fileSprite({ type: 'file', filetype: stamped ? this.filetype : -1 }).name);
    w.on('helprequest', (ev) => { ev.text = app.help('FILEINFO'); });
    return w;
  }

  // ------------------------------------------------------------------ closing
  /** Close request on a view (close icon, Ctrl-F2). Adjust opens the parent directory. */
  async closeView(v, ev = {}) {
    if (await this.closeHook?.(v, ev)) return;
    const updated = this.doc.modified, many = this.views.length > 1;
    if (ev.button === 'adjust') {
      const i = this.filename.lastIndexOf('.');
      if (i > 0) os.filer?.openDir(this.filename.slice(0, i));
      if (ev.shift || (updated && !many)) return;
    }
    if (many) { this.removeView(v); return; }
    if (updated) {
      const msg = this.filename ? this.app.msg('txt8', this.filename) : this.app.msg('txt9');
      const r = await this.app.query('close', msg, { save: 0, discard: 2, cancel: 3 });
      if (r === 'save') {
        this._afterSave = (path, toApp) => { this._afterSave = null; if (!toApp && !this.doc.modified) this.dispose(); };
        this.openSaveBox('pointer');
        return;
      }
      if (r !== 'discard') return;
    }
    this.dispose();
  }
  removeView(v) {
    const i = this.views.indexOf(v);
    if (i < 0) return;
    this.views.splice(i, 1);
    if (this._lastView === v) this._lastView = this.views[0] ?? null;
    v.dispose();
    this.updateTitles();
    if (!this.views.length) this.dispose();
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.app.find?.forget(this);
    if (scrap.doc === this.doc) clearSelection();
    for (const v of [...this.views]) v.dispose();
    this.views = [];
    for (const w of [this._fileInfo, this._saveBox, this._selBox, this._goto?.win, this._indent?.win]) w?.delete?.();
    const k = this.app.states.indexOf(this);
    if (k >= 0) this.app.states.splice(k, 1);
    this.onDispose?.();
  }

  // ------------------------------------------------------------------ the menu tree
  /** Menu help: HELP<path digits>, falling back to HELPX<first two digits> (txtedit__help_handler). */
  _help(path) {
    const d = path.join('');
    return this.app.help('HELP' + d) ?? this.app.help('HELPX' + d.slice(0, 2));
  }

  /** The Edit window menu (txtedit_menumaker): Misc, Save, Select, Edit, Display. */
  menu(v = this.activeView) {
    const app = this.app, M = this.M, s = this, d = this.doc;
    const H = (...p) => () => this._help(p);
    const P = (tok) => parseMenuString(M.lookup(tok));
    const noscrap = () => !scrap.doc;
    const opts = () => v.options;
    const setOpts = (fn) => { fn(v.options); v.applyOptions(); };
    const toggle = (k) => { v.options[k] = !v.options[k]; v.handlers.optionsChanged?.(v); };

    // --- Misc
    const mi = P('txt13');
    const typeValue = { value: this.filetype >= 0 ? typeName(this.filetype) : '', maxLen: 9, validation: 'a~.' };
    const typeMenu = new Menu(M.lookup('txt13a'), [{ text: '', writable: typeValue, action: (ev) => s.setType(ev.value), help: () => app.help('HELPX02') }]);
    const miscMenu = new Menu(M.lookup('txt12'), [
      { text: mi[0].text, submenu: () => app.progInfo(), help: H(0, 0) },
      { text: mi[1].text, submenu: () => s.fileInfoBox(), help: H(0, 1) },
      { text: mi[2].text, submenu: typeMenu, help: H(0, 2) },
      { text: mi[3].text, action: () => s.splitWindow(v), help: H(0, 3) },
      { text: mi[4].text, key: mi[4].key, action: () => s.print(), help: H(0, 4) },
      { text: mi[5].text, key: mi[5].key, ticked: () => !opts().wordtab, action: () => toggle('wordtab'), help: H(0, 5) },
      { text: mi[6].text, key: mi[6].key, ticked: () => opts().overwrite, action: () => toggle('overwrite'), help: H(0, 6) },
      { text: mi[7].text, key: mi[7].key, ticked: () => opts().wordwrap, action: () => toggle('wordwrap'), help: H(0, 7) },
    ]);

    // --- Select
    const se = P('txt15');
    const selMenu = new Menu(M.lookup('txt14'), [
      { text: se[0].text, submenu: () => s.saveSelectionBox(), shaded: () => scrap.doc !== d, help: H(2, 0) },
      { text: se[1].text, key: se[1].key, shaded: noscrap, action: () => s.print(true), help: H(2, 1) },
      { text: se[2].text, key: se[2].key, shaded: noscrap, action: () => { d.separate(); v.copySelection(); d.separate(); }, help: H(2, 2) },
      { text: se[3].text, key: se[3].key, shaded: noscrap, action: () => { d.separate(); v.moveSelection(); d.separate(); }, help: H(2, 3) },
      { text: se[4].text, key: se[4].key, shaded: noscrap, action: () => { v.deleteSelection(); }, help: H(2, 4) },
      { text: se[5].text, key: se[5].key, shaded: noscrap, action: () => clearSelection(), help: H(2, 5) },
      { text: se[6].text, key: se[6].key, shaded: noscrap, submenu: () => s.indentBox().asSubmenu(), help: H(2, 6) },
    ]);

    // --- Edit
    const ed = P('txt17');
    const fw = { value: String(app.formatWidth), maxLen: 9, validation: 'a0-9' };
    const fmtMenu = new Menu(M.lookup('txt18'), [{ text: '', writable: fw, action: (ev) => { app.formatWidth = parseInt(ev.value, 10) || 0; s.formatText(v); }, help: () => app.help('HELP360') }]);
    const editMenu = new Menu(M.lookup('txt16'), [
      { text: ed[0].text, key: ed[0].key, submenu: () => app.find.submenu(s), help: H(3, 0) },
      { text: ed[1].text, key: ed[1].key, submenu: () => { s._lastView = v; return s.gotoBox().asSubmenu(); }, help: H(3, 1) },
      { text: ed[2].text, key: ed[2].key, action: () => v.undo(), help: H(3, 2) },
      { text: ed[3].text, key: ed[3].key, action: () => v.redo(), help: H(3, 3) },
      { text: ed[4].text, key: ed[4].key, action: () => s.swapCRLF(), help: H(3, 4) },
      { text: ed[5].text, key: ed[5].key, action: () => s.expandTabs(v), help: H(3, 5) },
      { text: ed[6].text, key: ed[6].key, submenu: fmtMenu, action: () => s.formatText(v), help: H(3, 6) },
    ]);

    // --- Display (txtoptmenu)
    const di = parseMenuString(M.lookup('txt63'));
    const sizeMenu = (title, cur, set, helpTok) => {
      const vals = parseMenuString(M.lookup(title === 'txt56' ? 'txt57' : 'txt59'));
      const w = { value: '', maxLen: 3, validation: 'a0-9' };
      return new Menu(M.lookup(title), [
        ...FONT_SIZES.map((n, i) => ({ text: vals[i]?.text ?? String(n), ticked: () => cur() === n, action: () => set(n), help: () => app.help(helpTok) })),
        { text: '', writable: w, action: (ev) => { const n = parseInt(ev.value, 10); if (n > 0) set(n); }, help: () => app.help(helpTok) },
      ], { width: 80 });
    };
    const lead = { value: String(v.options.leading), maxLen: 3, validation: 'a0-9\\-' };
    const marg = { value: String(v.options.margin), maxLen: 3, validation: 'a0-9' };
    const warea = { value: String(v.options.bigSize || Math.floor(wimp.width / 8) - 3), maxLen: 4, validation: 'a0-9' };
    const dispMenu = new Menu(M.lookup('txt62'), [
      { text: di[0].text, submenu: () => app.fontMenu(() => (opts().fixfont ? null : opts().fontname), (name) => setOpts((o) => { if (name == null) o.fixfont = true; else { o.fixfont = false; o.fontname = name; } o.leading = 0; })), help: H(4, 0) },
      { text: di[1].text, shaded: () => opts().fixfont, submenu: () => sizeMenu('txt56', () => opts().fontwidth, (n) => setOpts((o) => { o.fixfont = false; o.fontwidth = n; o.fontheight = n; }), 'HELPX41'), help: H(4, 1) },
      { text: di[2].text, shaded: () => opts().fixfont, submenu: () => sizeMenu('txt58', () => opts().fontheight, (n) => setOpts((o) => { o.fixfont = false; o.fontheight = n; }), 'HELPX42'), help: H(4, 2) },
      { text: di[3].text, submenu: new Menu(M.lookup('txt60'), [{ text: '', writable: lead, action: (ev) => setOpts((o) => { o.leading = parseInt(ev.value, 10) || 0; }), help: () => app.help('HELPX43') }]), help: H(4, 3) },
      { text: di[4].text, submenu: new Menu(M.lookup('txt61'), [{ text: '', writable: marg, action: (ev) => setOpts((o) => { o.margin = parseInt(ev.value, 10) || 0; }), help: () => app.help('HELPX44') }]), help: H(4, 4) },
      { text: di[5].text, action: () => setOpts((o) => { [o.fore, o.back] = [o.back, o.fore]; }), help: H(4, 5) },
      { text: di[6].text, ticked: () => opts().wraptowindow, action: () => setOpts((o) => { o.wraptowindow = !o.wraptowindow; }), help: H(4, 6) },
      { text: di[7].text, submenu: colourMenu(M.lookup('txt55'), () => opts().fore, (n) => setOpts((o) => { o.fore = n; })), help: H(4, 7) },
      { text: di[8].text, submenu: colourMenu(M.lookup('txt55'), () => opts().back, (n) => setOpts((o) => { o.back = n; })), help: H(4, 8) },
      { text: di[9].text, ticked: () => opts().bigWindows, action: () => setOpts((o) => { o.bigWindows = !o.bigWindows; }),
        submenu: new Menu(M.lookup('txt71'), [{ text: '', writable: warea, action: (ev) => setOpts((o) => { o.bigWindows = true; o.bigSize = Math.max(1, Math.min(192, parseInt(ev.value, 10) || 1)); }), help: () => app.help('HELPX49') }]), help: H(4, 9) },
    ]);
    // colour menu entries: help
    for (const [k, m] of [[7, dispMenu.items[7].submenu], [8, dispMenu.items[8].submenu]]) for (const it of m.items) it.help = () => app.help('HELPX4' + k);

    // --- main menu
    const top = P('txt11');
    return new Menu(M.lookup('txt10'), [
      { text: top[0].text, submenu: miscMenu, help: H(0) },
      { text: top[1].text, key: top[1].key, submenu: () => s.saveBox(), action: () => s.quickSave(), help: H(1) },
      { text: top[2].text, submenu: selMenu, help: H(2) },
      { text: top[3].text, submenu: editMenu, help: H(3) },
      { text: top[4].text, submenu: dispMenu, help: H(4) },
    ]);
  }
}
