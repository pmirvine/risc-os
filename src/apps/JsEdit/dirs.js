// !JsEdit's directory views: a directory (drop one on the icon bar icon, or Open directory on its menu) shown as a
// tree, in the Filer's small-icon style: sub-directories fold open in place; double-click edits a file (or runs one
// that isn't text, as the Filer would); the menu makes, renames and deletes files and directories and finds text
// in all the files; files drag to and from the Filer; files being edited are shown in bold, with * when changed.
// The views open when !JsEdit quit are opened again next time (Choices:JsEditDirs).

import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { Menu } from '../../core/menu.js';
import { sprites } from '../../core/sprites.js';
import { fonts } from '../../core/fonts.js';
import { fileSprite } from '../../core/filetypes.js';
import { fileAction } from '../../core/fileraction.js';
import { choices } from '../../core/choices.js';
import { allModes } from './modes.js';
import { ListWindow } from './lists.js';

const ROW_H = 22, INDENT = 16, TOGGLE_W = 14;
const MAX_ROWS = 5000, MAX_FIND_FILES = 3000, MAX_FIND_SIZE = 1024 * 1024, MAX_FOUND = 2000;
// a new file's type from the end of its name (RISC OS keeps the host's extension as /js)
const SUFFIX_TYPES = { js: 0xF81, mjs: 0xF81, bas: 0xFFB, json: 0xF75, txt: 0xFFF, html: 0xFAF, htm: 0xFAF, css: 0xF79, csv: 0xDFE, xml: 0xF80 };
const NAME_VALIDATION = 'A~ :*#$&@^%\\|"';

const lc = (s) => String(s).toLowerCase();
const within = (path, dir) => lc(path) === lc(dir) || lc(path).startsWith(lc(dir) + '.');

/** Text !JsEdit edits: a type one of its modes colours, Text, or untyped. */
export function isTextType(t) {
  return t === 0xFFF || t === -1 || allModes().some((m) => m.name !== 'Text' && m.types.includes(t));
}

// ============================================================================================ all views
export class DirViews {
  constructor(app) {
    this.app = app;
    this.views = [];
    this.quitting = false;
    this.last = null;                           // the directory last opened (Open directory's writable)
    this.found = null;
    this.offChange = os.vfs.on('change', ({ dir }) => { for (const v of this.views) v.changed(dir); });
  }

  /** Open a view of dir, or bring its view to the front. */
  open(dir, state = {}) {
    const st = os.vfs.stat(dir);
    if (!st || st.type !== 'dir') { this.app.task.reportError(`'${dir}' is not a directory`); return null; }
    this.last = st.path;
    const v = this.views.find((x) => lc(x.path) === lc(st.path));
    if (v) { v.win.open({ behind: 'top' }); v.focus(); return v; }
    const nv = new DirView(this, st.path, state);
    this.views.push(nv);
    this.save();
    return nv;
  }

  closed(v) {
    this.views = this.views.filter((x) => x !== v);
    if (!this.quitting) this.save();
  }

  /** Marks for files being edited: call when a text opens, closes, changes or is renamed. */
  marks() { for (const v of this.views) v.win.invalidate(); }

  // ------------------------------------------------------------------ remembered between sessions
  async restore() {
    const c = await choices.read('JsEditDirs', { dirs: [] });
    for (const d of c.dirs ?? []) if (d?.path && os.vfs.isDir(d.path)) this.open(d.path, d);
  }
  save() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => {
      if (this.quitting) return;
      const dirs = this.views.map((v) => ({ path: v.path, expanded: [...v.expanded].filter((p) => p !== lc(v.path)), x: v.win.x, y: v.win.y, w: v.win.w, h: v.win.h }));
      try { choices.write('JsEditDirs', { dirs }); } catch { /* read-only disc */ }
    }, 300);
  }
  /** Quitting: the views close, but are remembered. */
  quit() {
    if (this.quitting) return;
    clearTimeout(this._saveT);
    const dirs = this.views.map((v) => ({ path: v.path, expanded: [...v.expanded].filter((p) => p !== lc(v.path)), x: v.win.x, y: v.win.y, w: v.win.w, h: v.win.h }));
    try { choices.write('JsEditDirs', { dirs }); } catch { /* read-only disc */ }
    this.quitting = true;
    for (const v of [...this.views]) v.dispose();
    this.found?.win.delete();
    this.offChange?.();
  }

  // ------------------------------------------------------------------ Find in files
  /** Every line of the text files below dir containing text (without regard to case), in a list to click. */
  async findInFiles(dir, text) {
    if (!text) return;
    const needle = text.toLowerCase();
    const items = [];
    let files = 0, hits = 0;
    const walk = async (d) => {
      let list;
      try { list = os.vfs.list(d); } catch { return; }
      for (const e of list) {
        if (files >= MAX_FIND_FILES || hits >= MAX_FOUND) return;
        if (e.type === 'dir') { await walk(e.path); continue; }
        if (!isTextType(e.filetype) || e.size > MAX_FIND_SIZE) continue;
        files++;
        let t;
        try { t = await os.vfs.readText(e.path); } catch { continue; }
        if (!t.toLowerCase().includes(needle)) continue;
        items.push({ text: e.path, colour: 8, go: () => this.app.openAt(e.path, 1) });
        t.split('\n').forEach((l, k) => {
          if (hits >= MAX_FOUND || !l.toLowerCase().includes(needle)) return;
          hits++;
          items.push({ text: `  line ${String(k + 1).padStart(4)}: ${l.trim().slice(0, 120)}`, colour: 7, go: () => this.app.openAt(e.path, k + 1) });
        });
      }
    };
    await walk(dir);
    if (!this.found) {
      this.found = new ListWindow(this.app.task, 'Found', { x: 180, y: 160, w: 620, h: 260 });
      this.found.empty = 'Not found';
      this.found.win.helpText = 'This lists the lines found.|MClick SELECT on one to edit its file there.';
    }
    this.found.win.setTitle(`Found '${text}' in ${dir} (${hits} line${hits === 1 ? '' : 's'} in ${items.length - hits} file${items.length - hits === 1 ? '' : 's'})`);
    this.found.set(items);
    this.found.open();
    return hits;
  }
}

// ============================================================================================ one view
export class DirView {
  constructor(set, path, state = {}) {
    this.set = set;
    this.app = set.app;
    this.task = this.app.task;
    this.path = path;
    this.expanded = new Set([lc(path), ...(state.expanded ?? []).map(lc)]);
    this.selected = new Set();
    this.cursor = -1;
    this.rows = [];
    this.icons = new Map();                    // sprite name -> {c, w, h} once loaded
    this.typed = { s: '', t: 0 };
    const n = set.views.length;
    const win = this.win = this.task.createWindow({
      title: path, x: state.x ?? 100 + n * 24, y: state.y ?? 100 + n * 24, w: state.w ?? 360, h: state.h ?? 440,
      flags: { back: true, close: true, title: true, toggle: true, vscroll: true, hscroll: true, size: true, moveable: true },
      colours: { workBg: 0 }, extent: { w: 1000, h: 440 }, workButton: 'clickdragdouble', minW: 160, minH: 80,
    });
    win.titleBufLen = 256;
    win.useCanvas((g, r) => this.draw(g, r), { hiDPI: true });
    win.menu = (ev) => this.menu(ev);
    win.helpText = 'This is a !JsEdit directory view.';
    win.on('helprequest', (ev) => { ev.text = this.help(this.rowAt(ev.y)); });
    win.on('click', (ev) => this.click(ev));
    win.on('doubleclick', (ev) => this.doubleClick(ev));
    win.on('drag', (ev) => this.drag(ev));
    win.on('dataload', (ev) => this.dataLoad(ev));
    win.on('key', (ev) => this.key(ev));
    win.on('close', (ev) => {
      ev.preventDefault();
      if (ev.button === 'adjust') os.filer.openDir(os.vfs.parent(this.path) || this.path);
      this.dispose();
    });
    win.on('moved', () => this.set.save());
    this.rebuild();
    win.open({ behind: 'top' });
    this.focus();
  }

  focus() { wimp.setCaret(this.win); }

  // ------------------------------------------------------------------ the rows
  rebuild() {
    const rows = [];
    const add = (dir, depth) => {
      let list;
      try { list = os.vfs.list(dir); } catch { return; }
      list.sort((a, b) => ((b.type === 'dir' && !b.isApp) - (a.type === 'dir' && !a.isApp)) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      for (const e of list) {
        if (rows.length >= MAX_ROWS) return;
        const open = e.type === 'dir' && this.expanded.has(lc(e.path));
        rows.push({ ...e, depth, open });
        if (open) add(e.path, depth + 1);
      }
    };
    add(this.path, 0);
    const cur = this.rows[this.cursor]?.path;
    this.rows = rows;
    for (const k of [...this.selected]) if (!rows.some((r) => lc(r.path) === k)) this.selected.delete(k);
    this.cursor = cur ? rows.findIndex((r) => lc(r.path) === lc(cur)) : -1;
    const width = Math.max(360, ...rows.slice(0, 500).map((r) => 60 + r.depth * INDENT + r.name.length * 9));
    this.win.setExtent({ x0: 0, y0: 0, x1: width, y1: Math.max(rows.length * ROW_H + 8, this.win.h) });
    this.win.invalidate();
  }

  /** A directory changed on the disc (the Filer, a program, HostFS...): show it if it's here. */
  changed(dir) {
    if (!dir) return;
    if (!os.vfs.isDir(this.path)) { this.dispose(); return; }        // the directory itself went
    if (!within(dir, this.path) || ![...this.expanded].some((e) => lc(dir) === e)) return;
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this.rebuild(), 30);
  }

  rowAt(y) { const i = Math.floor(y / ROW_H); return i >= 0 && i < this.rows.length ? i : -1; }

  sel() { return this.rows.filter((r) => this.selected.has(lc(r.path))); }

  select(i, { add = false, toggle = false } = {}) {
    if (!add && !toggle) this.selected.clear();
    const r = this.rows[i];
    if (r) {
      const k = lc(r.path);
      if (toggle && this.selected.has(k)) this.selected.delete(k); else this.selected.add(k);
      this.cursor = i;
      this.show(i);
    }
    this.win.invalidate();
  }

  show(i) {
    const top = i * ROW_H, w = this.win;
    if (top < w.scrollY) w.scrollTo(w.scrollX, top);
    else if (top + ROW_H > w.scrollY + w.h) w.scrollTo(w.scrollX, top + ROW_H - w.h);
  }

  /** The directory new things go in: the selected directory, or the selected file's, or the top one. */
  targetDir() {
    const r = this.rows[this.cursor] && this.selected.has(lc(this.rows[this.cursor].path)) ? this.rows[this.cursor] : this.sel()[0];
    if (!r) return this.path;
    return r.type === 'dir' ? r.path : os.vfs.parent(r.path);
  }

  setOpen(i, open) {
    const r = this.rows[i];
    if (!r || r.type !== 'dir') return;
    if (open) this.expanded.add(lc(r.path)); else this.expanded.delete(lc(r.path));
    for (const e of [...this.expanded]) if (!open && e !== lc(r.path) && within(e, r.path)) this.expanded.delete(e);
    this.rebuild();
    this.set.save();
  }

  expandAll(open) {
    if (!open) { this.expanded = new Set([lc(this.path)]); this.rebuild(); this.set.save(); return; }
    const walk = (d, depth) => {
      if (depth > 12 || this.expanded.size > 400) return;
      let list;
      try { list = os.vfs.list(d); } catch { return; }
      for (const e of list) if (e.type === 'dir' && !e.isApp) { this.expanded.add(lc(e.path)); walk(e.path, depth + 1); }
    };
    walk(this.path, 0);
    this.rebuild();
    this.set.save();
  }

  // ------------------------------------------------------------------ drawing
  sprite(name) {
    const got = this.icons.get(name);
    if (got) return got.c ? got : null;
    const s = sprites.get(name);
    if (!s) return null;
    this.icons.set(name, {});
    s.canvas().then((c) => { this.icons.set(name, { c, w: s.cssW, h: s.cssH }); this.win.invalidate(); }, () => {});
    return null;
  }

  draw(g, r) {
    const dark = !!this.app.options().dark;
    const bg = dark ? '#1e1e1e' : '#ffffff', fg = dark ? '#d4d4d4' : '#000000';
    g.fillStyle = bg;
    g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    const base = fonts.css;
    g.textBaseline = 'middle';
    g.imageSmoothingEnabled = false;
    const first = Math.max(0, Math.floor(r.y0 / ROW_H)), last = Math.min(this.rows.length, Math.ceil(r.y1 / ROW_H) + 1);
    for (let i = first; i < last; i++) {
      const row = this.rows[i], y = i * ROW_H, mid = y + ROW_H / 2;
      let x = 4 + row.depth * INDENT;
      // the fold arrow
      if (row.type === 'dir') {
        g.fillStyle = dark ? '#aaaaaa' : '#555555';
        g.beginPath();
        if (row.open) { g.moveTo(x, mid - 3); g.lineTo(x + 9, mid - 3); g.lineTo(x + 4.5, mid + 3); } else { g.moveTo(x + 2, mid - 5); g.lineTo(x + 8, mid); g.lineTo(x + 2, mid + 5); }
        g.fill();
      }
      x += TOGGLE_W;
      const fs = fileSprite(row, { small: true, open: row.open });
      const s = this.sprite(fs.name);
      if (s) {
        const w = fs.half ? s.w / 2 : s.w, h = fs.half ? s.h / 2 : s.h;
        g.drawImage(s.c, x, mid - h / 2, w, h);
      }
      x += 22;
      const text = this.app.findNamed(row.path);
      const label = row.name + (text?.doc.modified ? ' *' : '');
      g.font = text ? `bold ${base}` : base;
      const tw = g.measureText(label).width;
      const selected = this.selected.has(lc(row.path));
      if (selected) { g.fillStyle = dark ? '#264f78' : '#000000'; g.fillRect(x - 2, y + 2, tw + 4, ROW_H - 4); }
      g.fillStyle = selected ? '#ffffff' : fg;
      g.fillText(label, x, mid + 1);
      if (i === this.cursor && this.win.hasFocus) {
        g.strokeStyle = dark ? '#888888' : '#777777';
        g.setLineDash([2, 2]);
        g.strokeRect(x - 3.5, y + 1.5, tw + 6, ROW_H - 3);
        g.setLineDash([]);
      }
    }
    if (!this.rows.length) { g.font = base; g.fillStyle = dark ? '#888888' : '#777777'; g.fillText('(empty)', 8, ROW_H / 2 + 1); }
  }

  // ------------------------------------------------------------------ mouse
  onToggle(i, x) { const row = this.rows[i]; const tx = 4 + row.depth * INDENT; return row.type === 'dir' && x >= tx - 2 && x < tx + TOGGLE_W; }

  click(ev) {
    this.focus();
    if (ev.button === 'menu') {
      // Menu on a row that isn't selected selects just it (as the Filer)
      const i = this.rowAt(ev.y);
      if (i >= 0 && !this.selected.size) this.select(i);
      return undefined;                      // (the Wimp then opens the menu)
    }
    const i = this.rowAt(ev.y);
    if (i < 0) { if (ev.button === 'select') this.select(-1); return true; }
    if (this.onToggle(i, ev.x)) { this.setOpen(i, !this.rows[i].open); return true; }
    this.select(i, { toggle: ev.button === 'adjust' });
    return true;
  }

  doubleClick(ev) {
    const i = this.rowAt(ev.y);
    if (i < 0 || this.onToggle(i, ev.x)) return true;
    this.openRow(i, { shift: ev.shift, adjust: ev.button === 'adjust' });
    return true;
  }

  /** Double-click / Return: a directory folds open or shut, a text file is edited, anything else is run. */
  async openRow(i, { shift = false } = {}) {
    const r = this.rows[i];
    if (!r) return;
    if (r.type === 'dir') {
      if (r.isApp && !shift) { os.filer.run(r.path); return; }
      this.setOpen(i, !r.open);
      return;
    }
    if (shift || isTextType(r.filetype)) {
      const s = await this.app.openAt(r.path);
      if (s) this.set.marks();
    } else os.filer.run(r.path);
  }

  drag(ev) {
    const i = this.rowAt(ev.y);
    if (i < 0) return true;
    if (!this.selected.has(lc(this.rows[i].path))) this.select(i);
    const sel = this.sel();
    const fs = sel.length > 1 ? { name: 'package' } : fileSprite(sel[0], { small: true });
    const s = sprites.get(fs.name);
    const w = s?.cssW ?? 18, h = s?.cssH ?? 18;
    wimp.drag({ sprite: fs.name, box: { x0: ev.sx - w / 2, y0: ev.sy - h / 2, x1: ev.sx + w / 2, y1: ev.sy + h / 2 }, event: ev.pointerEvent }).then((drop) => this.dropped(drop, sel));
    return true;
  }

  /** Rows dragged out: to a Filer window (or one of its directories) they're copied (moved with Shift). */
  dropped(drop, sel) {
    const w = drop.window;
    if (!w) return;
    const paths = sel.map((r) => r.path);
    const move = !!drop.shift;
    if (w === this.win) {
      // onto a directory in this view: into it
      const j = this.rowAt(this.win.screenToWork(drop.sx, drop.sy).y);
      const d = this.rows[j];
      if (!d || d.type !== 'dir' || d.isApp) return;
      const ok = paths.filter((p) => !within(d.path, p) && lc(os.vfs.parent(p)) !== lc(d.path));
      if (ok.length) fileAction(move ? 'move' : 'copy', ok, d.path, os.filer.options);
      return;
    }
    const other = this.set.views.find((v) => v.win === w);
    const viewer = os.filer.viewerFor?.(w);
    if (viewer || other) {
      let dest = viewer ? viewer.path : other.path;
      if (viewer) {
        const j = viewer.indexAt(drop.x, drop.y);
        if (j >= 0 && viewer.items[j].type === 'dir' && !viewer.items[j].isApp) dest = viewer.items[j].path;
      } else {
        const j = other.rowAt(drop.y);
        const d = other.rows[j];
        if (d?.type === 'dir' && !d.isApp) dest = d.path; else if (d) dest = os.vfs.parent(d.path);
      }
      fileAction(move ? 'move' : 'copy', paths.filter((p) => lc(os.vfs.parent(p)) !== lc(dest)), dest, os.filer.options);
      return;
    }
    wimp.dataLoad(drop, sel.map((r) => ({ path: r.path, filetype: r.filetype, size: r.size, name: r.name, type: r.type })), this.task);
  }

  /** Files dropped in from the Filer (or elsewhere): copied (moved with Shift) into the directory they land on. */
  dataLoad(ev) {
    const files = ev.files ?? [];
    if (!files.length) return true;
    const d = this.rows[this.rowAt(ev.y)];
    const dest = !d ? this.path : d.type === 'dir' && !d.isApp ? d.path : os.vfs.parent(d.path);
    const paths = files.map((f) => f.path).filter((p) => lc(os.vfs.parent(p)) !== lc(dest) && !within(dest, p));
    if (paths.length) fileAction(ev.shift ? 'move' : 'copy', paths, dest, os.filer.options);
    return true;
  }

  // ------------------------------------------------------------------ keys
  key(ev) {
    const n = this.rows.length, c = this.cursor, r = this.rows[c];
    switch (ev.code) {
      case 0x18F: case 0x18E: {                                              // Up, Down
        const i = Math.max(0, Math.min(n - 1, (c < 0 ? (ev.code === 0x18E ? -1 : n) : c) + (ev.code === 0x18E ? 1 : -1)));
        this.select(i);
        return true;
      }
      case 0x19F: case 0x19E: {                                              // Page Up, Page Down
        const page = Math.max(1, Math.floor(this.win.h / ROW_H) - 1);
        this.select(Math.max(0, Math.min(n - 1, Math.max(c, 0) + (ev.code === 0x19E ? page : -page))));
        return true;
      }
      case 0x18D:                                                             // Right: open a directory, or into it
        if (r?.type === 'dir' && !r.open) this.setOpen(c, true); else if (r?.open && this.rows[c + 1]?.depth > r.depth) this.select(c + 1);
        return true;
      case 0x18C:                                                             // Left: shut it, or to its parent
        if (r?.type === 'dir' && r.open) this.setOpen(c, false);
        else if (r && r.depth > 0) { for (let i = c - 1; i >= 0; i--) if (this.rows[i].depth < r.depth) { this.select(i); break; } }
        return true;
      case 13: if (c >= 0) this.openRow(c, { shift: ev.shift }); return true;   // Return
      case 127: case 8: if (this.selected.size) this.deleteSelection(); return true;   // Delete
      case 27: this.select(-1); return true;                                 // Escape
      case 0x185: this.rebuild(); return true;                               // F5
    }
    // typing letters: the next name starting with them
    if (ev.char && ev.code >= 32 && ev.code < 256 && !ev.ctrl) {
      const now = performance.now();
      this.typed = { s: (now - this.typed.t < 900 ? this.typed.s : '') + ev.char.toLowerCase(), t: now };
      const s = this.typed.s;
      for (let k = 0; k < n; k++) {
        const i = (Math.max(c, 0) + (s.length === 1 ? 1 : 0) + k) % n;
        if (this.rows[i].name.toLowerCase().startsWith(s)) { this.select(i); break; }
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ making, renaming, deleting
  report(e) { this.task.reportError(e?.message ?? String(e)); }

  newFile(name) {
    name = String(name ?? '').trim();
    if (!name) return;
    const dir = this.targetDir();
    const path = os.vfs.join(dir, name);
    if (os.vfs.exists(path)) { this.report(`'${name}' already exists`); return; }
    const ext = /\/([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
    let type = SUFFIX_TYPES[ext];
    if (type == null) {
      // the kind of text most common here, else JavaScript
      const counts = new Map();
      try { for (const e of os.vfs.list(dir)) if (e.type === 'file' && isTextType(e.filetype) && e.filetype !== -1) counts.set(e.filetype, (counts.get(e.filetype) ?? 0) + 1); } catch { /* */ }
      type = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0xF81;
    }
    try { os.vfs.writeFile(path, '', { filetype: type }); } catch (e) { this.report(e); return; }
    this.expanded.add(lc(dir));
    this.rebuild();
    const i = this.rows.findIndex((r) => lc(r.path) === lc(path));
    if (i >= 0) this.select(i);
    this.app.openAt(path).then(() => this.set.marks());
  }

  newDir(name) {
    name = String(name ?? '').trim();
    if (!name) return;
    const dir = this.targetDir();
    const path = os.vfs.join(dir, name);
    if (os.vfs.exists(path)) { this.report(`'${name}' already exists`); return; }
    try { os.vfs.mkdir(path); } catch (e) { this.report(e); return; }
    this.expanded.add(lc(dir));
    this.rebuild();
    const i = this.rows.findIndex((r) => lc(r.path) === lc(path));
    if (i >= 0) this.select(i);
  }

  rename(row, name) {
    name = String(name ?? '').trim();
    if (!row || !name || name === row.name) return;
    const to = os.vfs.join(os.vfs.parent(row.path), name);
    if (os.vfs.exists(to) && lc(to) !== lc(row.path)) { this.report(`'${name}' already exists`); return; }
    try { os.vfs.rename(row.path, to); } catch (e) { this.report(e); return; }
    // texts being edited follow their files
    for (const s of this.app.states) {
      if (s.filename && within(s.filename, row.path)) s.filename = os.vfs.canonical(to) + s.filename.slice(row.path.length);
    }
    for (const e of [...this.expanded]) if (within(e, row.path)) { this.expanded.delete(e); this.expanded.add(lc(to) + e.slice(row.path.length)); }
    this.selected = new Set([lc(os.vfs.canonical(to))]);
    this.rebuild();
    this.set.save();
  }

  async deleteSelection() {
    const sel = this.sel();
    if (!sel.length) return;
    const what = sel.length === 1 ? `'${sel[0].name}'` : `these ${sel.length} objects`;
    const r = await this.task.reportError(`Delete ${what}? This can't be undone.`, { category: 'question', cancel: true, okText: 'Delete' });
    if (r !== 1) return;
    fileAction('delete', sel.map((x) => x.path), null, os.filer.options);
  }

  // ------------------------------------------------------------------ the menu
  menu() {
    const sel = this.sel(), one = sel.length === 1 ? sel[0] : null;
    const leafLabel = one ? `${one.type === 'dir' ? 'Dir.' : 'File'} '${one.name}'` : sel.length ? 'Selection' : 'File \'\'';
    const writable = (value, action) => new Menu('Name', [{ text: '', writable: { value, maxLen: 255, validation: NAME_VALIDATION }, action: (e) => action(e.value) }]);
    const m = new Menu('JsEdit dir', [
      { text: leafLabel, shaded: !sel.length, submenu: () => new Menu(leafLabel.slice(0, 28), [
        { text: 'Open', action: () => sel.forEach((r) => this.openRow(this.rows.indexOf(r))), help: 'Click SELECT to edit the file (or open the directory).' },
        { text: 'Edit as text', shaded: !sel.some((r) => r.type === 'file'), action: () => sel.filter((r) => r.type === 'file').forEach((r) => this.openRow(this.rows.indexOf(r), { shift: true })), help: 'Click SELECT to edit the file here whatever its type.' },
        { text: 'Rename', shaded: !one, submenu: () => writable(one.name, (v) => this.rename(one, v)), help: 'Move the pointer right, type a new name and press Return.' },
        { text: 'Delete', action: () => this.deleteSelection(), help: 'Click SELECT to delete it (you\'ll be asked first).' },
        { text: 'Open in Filer', action: () => os.filer.openDir(one?.type === 'dir' ? one.path : os.vfs.parent(sel[0].path)), help: 'Click SELECT to show it in a Filer window.' },
      ]), help: 'Move the pointer right to do something with the selected files.' },
      { text: 'New file', submenu: () => writable('', (v) => this.newFile(v)), help: 'Move the pointer right, type the new file\'s name and press Return.|MIts type comes from the end of its name (/js, /bas, /json...), otherwise from the files beside it.' },
      { text: 'New directory', submenu: () => writable('', (v) => this.newDir(v)), dotted: true, help: 'Move the pointer right, type the new directory\'s name and press Return.' },
      { text: 'Select all', action: () => { this.selected = new Set(this.rows.map((r) => lc(r.path))); this.win.invalidate(); } },
      { text: 'Clear selection', shaded: !sel.length, action: () => this.select(-1), dotted: true },
      { text: 'Expand all', action: () => this.expandAll(true) },
      { text: 'Collapse all', action: () => this.expandAll(false), dotted: true },
      { text: 'Find in files', submenu: () => writable(this.set.lastFind ?? '', (v) => { this.set.lastFind = v; this.set.findInFiles(this.targetDir(), v); }), help: 'Move the pointer right, type the text to look for and press Return.|MEvery line containing it, in every text file in the directory, is listed.' },
      { text: 'Open in Filer', action: () => os.filer.openDir(this.path), help: 'Click SELECT to open this directory in a Filer window.' },
      { text: 'Refresh', key: 'F5', action: () => this.rebuild(), help: 'Click SELECT to read the directory again.' },
    ]);
    return m;
  }

  help(i) {
    const r = this.rows[i];
    if (!r) return 'This is a !JsEdit directory view.|MClick MENU to make a new file or directory, or to find text in the files.';
    if (r.type === 'dir') return `This is the directory '${r.name}'.|MDouble-click SELECT to open or shut it${r.isApp ? ' (it\'s an application: double-click runs it; click the arrow, or hold Shift, to see inside)' : ''}.|MDrag files here from the Filer to copy them into it.`;
    const t = this.app.findNamed(r.path);
    return `This is the file '${r.name}'${t ? (t.doc.modified ? ', being edited, with changes not saved' : ', being edited') : ''}.|MDouble-click SELECT to ${isTextType(r.filetype) ? 'edit it' : 'run it (Shift: edit it as text)'}.|MDrag it to a Filer window to copy it (Shift: move it).`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this._ct);
    this.win.delete();
    this.set.closed(this);
  }
}
