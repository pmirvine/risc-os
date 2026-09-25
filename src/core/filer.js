// The Filer: directory viewers, Filer menu, file operations, Filer_Run / Filer_Boot.

import { wimp } from './wimp.js';
import { vfs, FT_DIR, FT_APP, FT_UNTYPED, ATTR } from './vfs.js';
import { Menu } from './menu.js';
import { Icon } from './icons.js';
import { IF } from './templates.js';
import { loadTemplates } from './templates.js';
import { loadMessages } from './messages.js';
import { fonts, textWidth } from './fonts.js';
import { fileSprite, typeName, hex3, parseType } from './filetypes.js';
import { sprites } from './sprites.js';
import { sysvars } from './sysvars.js';
import { os } from './os.js';
import { el } from './util.js';
import { fileAction } from './fileraction.js';
import { saveAs } from './dialogs.js';
import { EXEC_TYPES } from './native.js';

const LGI_W = 86, LGI_H = 54;      // template icon 2 (172 x 108 OS)
const SMI_W = 108, SMI_H = 18;     // template icon 3 (216 x 36 OS)
const TOPGAP = 4;
const RHSGAP = 8;                  // dvr_rhsgap (16 OS): viewer width = columns x item width + RHSGAP
const RHSSLACK = 16;               // dvr_rhsslack (32 OS): narrowing a viewer this little doesn't reflow it
const colsFor = (w, cw) => Math.max(1, Math.floor((w - RHSGAP + RHSSLACK) / cw));

export function formatDate(d, sep = '-') {
  const p = (n) => String(n).padStart(2, '0');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}${sep}${M[d.getMonth()]}${sep}${d.getFullYear()}`;
}
// The Filer's own date format (full info display and the Info box) comes from its 'directory'
// template icon 1: "%24:%mi:%se %dy %m3 %ce%yr", i.e. spaces rather than the territory's dashes.
const filerDate = (d) => formatDate(d, ' ');
export function accessString(attr) {
  let s = '';
  if (attr & ATTR.locked) s += 'L';
  if (attr & ATTR.ownerWrite) s += 'W';
  if (attr & ATTR.ownerRead) s += 'R';
  s += '/';
  if (attr & ATTR.publicWrite) s += 'w';
  if (attr & ATTR.publicRead) s += 'r';
  return s;
}
function sizeColumn(n) {
  if (n < 4096) return `${n}`;
  if (n < 4096 * 1024) return `${Math.round(n / 1024)}K`;
  return `${Math.round(n / (1024 * 1024))}M`;
}

export class Filer {
  constructor() {
    this.viewers = new Map();
    this.options = { confirm: false, verbose: true, force: false, newer: false };
    this.defaultMode = 'large';
    this.defaultSort = 'name';
    this.topLevelCount = 0;
    this.booted = new Set();
  }

  async init() {
    this.task = wimp.createTask('Filer', { kind: 'module', memory: 0 });
    this.tpl = await loadTemplates('assets/templates/Filer.json');
    this.msgs = await loadMessages('Filer');
    vfs.on('change', (ev) => this._dirChanged(ev.dir));
    sprites.onChange(() => { for (const v of this.viewers.values()) v._rerenderSprites(); });
    wimp.on('modechange', () => { for (const v of this.viewers.values()) v.reformat(true); });
  }

  m(tok, ...a) { return this.msgs.lookup(tok, ...a); }

  /** Open (or bring to front) a directory viewer. opts: {mode, sort, x, y, w, h, from: DirViewer} */
  openDir(path, opts = {}) {
    let canon;
    try { canon = vfs.canonical(path); } catch (e) { wimp.reportError(e.message, { appName: 'Filer' }); return null; }
    const st = vfs.stat(canon);
    if (!st || st.type !== 'dir') { wimp.reportError(st ? `'${st.name}' is a file` : `Directory '${vfs.leaf(canon) || canon}' not found`, { appName: 'Filer' }); return null; }
    const key = canon.toLowerCase();
    let v = this.viewers.get(key);
    if (v) { v.win.open({ behind: 'top' }); return v; }
    v = new DirViewer(this, canon, opts);
    this.viewers.set(key, v);
    this._openStateChanged(canon);
    return v;
  }
  /** Redraw the parent viewer of dir, which shows dir as an open or closed directory (s.Redraw dfs_opened). */
  _openStateChanged(dir) {
    if (vfs.isRoot(dir)) return;
    const pv = this.viewers.get(vfs.parent(dir).toLowerCase());
    if (pv && pv.icons) pv.render();
  }
  closeDir(path) {
    const v = this.viewers.get(vfs.canonical(path).toLowerCase());
    v?.close();
  }
  viewerFor(win) { for (const v of this.viewers.values()) if (v.win === win) return v; return null; }

  _dirChanged(dir) {
    const v = this.viewers.get(dir.toLowerCase());
    if (v) v.refresh();
    // a directory may have been deleted: close viewers under it
    for (const w of [...this.viewers.values()]) if (!vfs.exists(w.path)) w.close();
  }

  // ------------------------------------------------------------ run / boot
  /** Filer_Boot: make an application's sprites and !Boot settings known. */
  async bootApp(path) {
    const key = path.toLowerCase();
    if (this.booted.has(key)) return;
    this.booted.add(key);
    if (os.apps?.bootAppDir(path)) return;       // registered JS application
    const boot = vfs.stat(path + '.!Boot');
    try {
      sysvars.set('Obey$Dir', path);
      if (boot && boot.filetype === 0xFEB) { await os.cli.obey(path + '.!Boot', { quiet: true, safe: true }); return; }
    } catch (e) { /* ignore errors in !Boot */ }
    const spr = vfs.stat(path + '.!Sprites22') ?? vfs.stat(path + '.!Sprites');
    if (spr) {
      try { sprites.addSpriteFile(await vfs.readFile(spr.path), spr.path); } catch { /* bad sprite file */ }
    }
  }

  /**
   * Filer_Run: what a double-click does. opts.shift: open apps as directories / files as text.
   * Returns a Promise.
   */
  async run(path, opts = {}) {
    const st = vfs.stat(path);
    if (!st) return wimp.reportError(`File '${vfs.leaf(path)}' not found`, { appName: 'Filer' });
    if (st.type === 'dir' && (!st.isApp || opts.shift)) return this.openDir(st.path, opts);
    try {
      if (st.isApp) { await this.bootApp(st.path); return await os.cli.run(`Run ${st.path}`); }
      if (opts.shift && st.filetype !== FT_UNTYPED) {
        // Shift-double-click: load the file as text
        if (os.apps?.openFile(st.path, 0xFFF)) return;
      }
      // DataOpen broadcast: a running application that handles this type may claim it
      const claimed = wimp.sendMessage('DataOpen', { path: st.path, filetype: st.filetype, files: [st] }, { from: this.task });
      if (claimed) return;
      if (st.filetype === FT_UNTYPED) return wimp.reportError(`File '${st.name}' has no file type (load &${(st.load >>> 0).toString(16).toUpperCase()})`, { appName: 'Filer' });
      // Absolute / Module / Utility: FileSwitch runs these itself (*Run; native.js stand-ins for ARM code)
      if (EXEC_TYPES.has(st.filetype)) return await os.cli.run(`Run ${st.path}`);
      const alias = sysvars.get('Alias$@RunType_' + hex3(st.filetype));
      if (alias == null) return wimp.reportError(this.m('UkRun') === 'UkRun' ? 'An application that loads a file of this type has not been found by the Filer. Open a directory display containing the required application and try again.' : this.m('UkRun'), { appName: 'Filer' });
      await os.cli.run(`@RunType_${hex3(st.filetype)} ${st.path}`);
    } catch (e) {
      wimp.reportError(e.message ?? String(e), { appName: 'Filer' });
    }
  }
}

// ---------------------------------------------------------------------------------------- viewer

class DirViewer {
  constructor(filer, path, opts) {
    this.filer = filer;
    this.path = path;
    this.mode = opts.mode ?? filer.defaultMode;
    this.sort = opts.sort ?? filer.defaultSort;
    this.selected = new Set();
    this.items = [];
    this.cols = 0;
    const t = filer.tpl.windows.directory;
    const win = this.win = wimp.createWindowFromTemplate(filer.tpl, 'directory', { title: path }, filer.task);
    win._filerDir = path;
    // the template's icons are only prototypes (sizes): the real Filer's viewers have none, and
    // left in place they would steal clicks (and double-clicks) from the first row of items
    for (let i = win.icons.length - 1; i >= 0; i--) win.deleteIcon(i);
    win.el.classList.add('filer');
    win.on('click', (ev) => this.click(ev));
    win.on('doubleclick', (ev) => this.doubleClick(ev));
    win.on('drag', (ev) => this.drag(ev));
    win.on('close', (ev) => this.onClose(ev));
    win.on('open', (ev) => this.onOpenRequest(ev));
    win.on('dataload', (ev) => this.dataLoad(ev));
    win.on('datasave', (ev) => { ev.accept(`${this.path}.${ev.leafname}`); return true; });
    win.on('deleted', () => { if (filer.viewers.get(path.toLowerCase()) === this) { filer.viewers.delete(path.toLowerCase()); filer._openStateChanged(path); } });
    win.helpText = filer.m('Viewer_Help');
    this.refresh(true);
    // initial geometry
    let { w, h } = this.idealSize();
    let x, y;
    if (opts.x != null) { x = opts.x; y = opts.y; }
    else if (opts.from) {
      // Filer OpenDir: offset from the parent by template icon 0 (20, -32 OS) x nth child (1..8)
      const p = opts.from.win;
      if (opts.replacing) { x = p.x; y = p.y; }
      else {
        opts.from.nChildren = ((opts.from.nChildren ?? 0) & 7) + 1;
        x = p.x + 10 * opts.from.nChildren; y = p.y + 16;
      }
    } else {
      const k = filer.topLevelCount++ % 8;
      x = Math.floor(t.visible.x0 / 2) + 1 + k * 63;
      y = Math.max(22, wimp.height - Math.floor(t.visible.y1 / 2)) + k * 0;
    }
    if (opts.w) w = opts.w;
    if (opts.h) h = opts.h;
    this._wantH = h;
    this.cols = 0;
    this.layout(w);
    win.open({ x, y, w, h, behind: 'top' });
    this._wantH = 0;
  }

  /** Window size that shows the contents (up to the template's size), as the Filer opens it. */
  idealSize() {
    const t = this.filer.tpl.windows.directory;
    const n = this.items.length;
    const cw = this.cellW, ch = this.cellH;
    const maxW = Math.floor((t.visible.x1 - t.visible.x0) / 2);
    const maxH = Math.floor((t.visible.y1 - t.visible.y0) / 2);
    let cols = this.mode === 'full' ? 1 : Math.max(1, Math.min(n || 1, Math.floor((maxW - RHSGAP) / cw)));
    // at least as wide as the title plus 6 system font characters (back + close icons)
    const titleW = Math.ceil(textWidth(this.path, fonts.css)) + 48;
    let w = this.mode === 'full' ? Math.min(cw + RHSGAP, wimp.width - 40) : Math.max(cols * cw + RHSGAP, titleW);
    if (this.mode !== 'full') w = Math.min(w, Math.max(maxW, cw + RHSGAP));
    const rows = Math.ceil(n / cols) || 1;
    const h = Math.max(60, Math.min(maxH, rows * ch + 2 * TOPGAP));
    return { w, h };
  }

  get cellW() {
    if (this._cw != null && this._cwMode === this.mode) return this._cw;
    this._cwMode = this.mode;
    return (this._cw = this._computeCellW());
  }
  _computeCellW() {
    if (this.mode === 'large') {
      let m = LGI_W;
      for (const it of this.items) m = Math.max(m, this._textW(it.name) + 2);
      return Math.ceil(m) + 8;
    }
    let s = SMI_W;
    for (const it of this.items) s = Math.max(s, this._textW(it.name) + 22);
    s = Math.ceil(s);
    if (this.mode === 'small') return s + 8;
    return s + this.infoWidth() + 24;   // + fui_lhsgap, midgap1, midgap2 (system font characters), rhsgap
  }
  // GetItemBoxSize: large icons 8 OS units gap all round, small icons / full info 4 OS units above and below
  get cellH() { return this.mode === 'large' ? LGI_H + 8 : SMI_H + 4; }
  get cellGapY() { return this.mode === 'large' ? 4 : 2; }
  infoWidth() {
    const f = fonts.css;
    const cw = textWidth('0', f);
    // Filer cache_lengths: the columns are as wide as these strings in the desktop font
    const W = (t) => Math.ceil(textWidth(t, f));
    this._col = { access: W('LWR/wr '), size: W('8888'), unit: W('M '), type: Math.max(W('XXXXXXXX '), W('Directory'), W('Application')), date: W('88:88:88 30 Mar 1999') };
    return this._col.access + this._col.size + this._col.unit + this._col.type + this._col.date;
  }

  refresh(noLayout) {
    let list;
    try { list = vfs.list(this.path); } catch { this.close(); return; }
    const sorters = {
      name: (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      type: (a, b) => (rank(a) - rank(b)) || (a.filetype - b.filetype) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      size: (a, b) => (rank(a) - rank(b)) || (b.size - a.size) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      date: (a, b) => (b.date - a.date) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    };
    const rank = (x) => (x.type === 'dir' ? (x.isApp ? 1 : 0) : 2);
    list.sort(sorters[this.sort] ?? sorters.name);
    this.items = list;
    this._cw = null; this._tw = new Map();
    for (const s of [...this.selected]) if (!list.some((i) => i.name.toLowerCase() === s)) this.selected.delete(s);
    // Filer_Boot applications that come into view
    for (const it of list) if (it.isApp) this.filer.bootApp(it.path).then(() => this._rerenderSprites());
    if (!noLayout) { this.cols = 0; this.layout(this.win.w); }
  }

  _rerenderSprites() { clearTimeout(this._rs); this._rs = setTimeout(() => this.render(), 50); }

  /** Compute columns for a visible width and render. */
  layout(w) {
    const cw = this.cellW;
    const cols = this.mode === 'full' ? 1 : colsFor(w, cw);
    this.cols = cols;
    const rows = Math.ceil(this.items.length / cols);
    const extH = rows * this.cellH + 2 * TOPGAP;
    // the extent is at least the window size, so viewers can be made bigger than their contents
    const minW = Math.max(w, this.win.isOpen ? this.win.w : 0), minH = Math.max(this._wantH ?? 0, this.win.isOpen ? this.win.h : 0);
    this.win.extent = { x0: 0, y0: 0, x1: Math.max((this.mode === 'full' ? cw : cols * cw) + RHSGAP, minW, 100), y1: Math.max(extH, minH, 60) };
    // keep the extent at least the visible size in the reflow direction
    this.render();
  }

  reformat(force) {
    const cols = this.mode === 'full' ? 1 : colsFor(this.win.w, this.cellW);
    if (cols !== this.cols || force) { this.layout(this.win.w); if (this.win.isOpen) this.win.open({}); }
  }

  onOpenRequest(ev) {
    // reflow the icons when the window width changes
    ev.preventDefault();
    const cw = this.cellW;
    let cols = this.mode === 'full' ? 1 : colsFor(ev.w, cw);
    if (cols !== this.cols) {
      this.cols = cols;
      const rows = Math.ceil(this.items.length / cols);
      this.win.extent = { x0: 0, y0: 0, x1: Math.max((this.mode === 'full' ? cw : cols * cw) + RHSGAP, ev.w, 100), y1: Math.max(rows * this.cellH + 2 * TOPGAP, ev.h, 60) };
      this.render();
    } else {
      // allow the window to be made bigger than its contents
      const needW = Math.max(ev.w, (this.mode === 'full' ? cw : cols * cw) + RHSGAP);
      const needH = Math.max(ev.h, Math.ceil(this.items.length / cols) * this.cellH + 2 * TOPGAP);
      if (needW > this.win.extent.x1 || needH > this.win.extent.y1) this.win.extent = { ...this.win.extent, x1: Math.max(needW, this.win.extent.x1), y1: Math.max(needH, this.win.extent.y1) };
    }
    this.win.open(ev);
  }

  itemRect(i) {
    const cw = this.cellW, ch = this.cellH;
    const col = i % this.cols, row = Math.floor(i / this.cols);
    const x0 = col * cw, y0 = TOPGAP + row * ch;
    return { x0, y0, x1: x0 + cw, y1: y0 + ch };
  }

  /** Bounding box of the "hot" part of item i (icon + name) in work-area coords. */
  _textW(name) {
    this._tw ??= new Map();
    let w = this._tw.get(name);
    if (w == null) { w = textWidth(name, fonts.css); this._tw.set(name, w); }
    return w;
  }

  hotRect(i) {
    const r = this.itemRect(i);
    const it = this.items[i];
    if (this.mode === 'large') {
      const tw = this._textW(it.name);
      const cx = (r.x0 + r.x1) / 2;
      const w = Math.max(tw + 4, 36);
      return { x0: cx - w / 2, y0: r.y0 + 4, x1: cx + w / 2, y1: r.y1 - 4 };
    }
    const tw = this._textW(it.name);
    return { x0: r.x0 + 4, y0: r.y0 + 2, x1: r.x0 + 4 + 18 + 4 + tw + 4, y1: r.y1 - 2 };
  }

  indexAt(wx, wy) {
    for (let i = 0; i < this.items.length; i++) {
      const h = this.hotRect(i);
      if (wx >= h.x0 && wx < h.x1 && wy >= h.y0 && wy < h.y1) return i;
    }
    return -1;
  }

  render() {
    const layer = this.win.iconLayer;
    layer.textContent = '';
    this.icons = [];
    const font = fonts.css;
    const nameW = Math.ceil(Math.max(0, ...this.items.map((q) => this._textW(q.name) + 22), SMI_W));
    this.items.forEach((it, i) => {
      const r = this.itemRect(i);
      const sel = this.selected.has(it.name.toLowerCase());
      const open = it.type === 'dir' && !it.isApp && this.filer.viewers.has(it.path.toLowerCase());
      const spr = fileSprite(it, { small: this.mode !== 'large', open });
      let spec;
      const common = IF.text | IF.sprite | IF.indirected | (7 << 24) | (1 << 28) | (sel ? IF.selected : 0) | (spr.half ? IF.halfSize : 0);
      if (this.mode === 'large') {
        spec = { bbox: { x0: r.x0 + 4, y0: r.y0 + 4, x1: r.x1 - 4, y1: r.y1 - 4 }, flags: (common | IF.hcentre) >>> 0 };
      } else {
        spec = { bbox: { x0: r.x0 + 4, y0: r.y0 + 2, x1: r.x0 + 4 + Math.ceil(this._textW(it.name)) + 24, y1: r.y1 - 2 }, flags: (common | IF.vcentre) >>> 0 };
      }
      spec.text = it.name; spec.validation = 'S' + spr.name; spec.bufLen = 256;
      const ic = new Icon(this.win, spec, i);
      ic.el.classList.add('fitem');
      layer.appendChild(ic.el);
      this.icons.push(ic);
      if (this.mode === 'full') {
        const c = this._col ?? (this.infoWidth(), this._col);
        const row = el('div', 'fullinfo', layer);
        row.style.cssText = `position:absolute;left:${r.x0 + 4 + nameW + 8}px;top:${r.y0 + 2}px;height:${SMI_H}px;font:${font};line-height:${SMI_H}px;white-space:pre;color:#000`;
        let x = 0;
        const cell = (t, w, right) => { const s = el('span', '', row); s.textContent = t; s.style.cssText = `position:absolute;left:${x}px;width:${w}px;${right ? 'text-align:right;' : ''}`; x += w; };
        cell(accessString(it.attr), c.access);
        if (it.type === 'dir') { cell('', c.size + c.unit); cell(it.isApp ? 'Application' : 'Directory', c.type); }
        else {
          const sz = sizeColumn(it.size);
          const unit = /[KM]$/.test(sz) ? sz.slice(-1) : '';
          cell(unit ? sz.slice(0, -1) : sz, c.size, true); cell(unit, c.unit);
          cell(it.filetype === FT_UNTYPED ? '' : typeName(it.filetype), c.type);
        }
        cell(it.filetype === FT_UNTYPED && it.type !== 'dir' ? `${(it.load >>> 0).toString(16).toUpperCase().padStart(8, '0')} ${(it.exec >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : filerDate(it.date), c.date);
      }
    });
  }

  setSelected(i, on) {
    const it = this.items[i];
    if (!it) return;
    const k = it.name.toLowerCase();
    if (on) this.selected.add(k); else this.selected.delete(k);
    this.icons[i]?.setState({ selected: on });
  }
  clearSelection() { for (let i = 0; i < this.items.length; i++) if (this.selected.has(this.items[i].name.toLowerCase())) this.setSelected(i, false); this.selected.clear(); }
  selectAll() { this.items.forEach((_, i) => this.setSelected(i, true)); }
  selection() { return this.items.filter((it) => this.selected.has(it.name.toLowerCase())); }

  close() { this.win.delete(); if (this.filer.viewers.get(this.path.toLowerCase()) === this) { this.filer.viewers.delete(this.path.toLowerCase()); this.filer._openStateChanged(this.path); } }

  onClose(ev) {
    ev.preventDefault();
    const parent = vfs.isRoot(this.path) ? null : vfs.parent(this.path);
    // Adjust-click on close: open parent and close this one
    if (ev.button === 'adjust' && parent) {
      this.filer.openDir(parent, { x: this.win.x, y: this.win.y });
    }
    this.close();
  }

  // ------------------------------------------------------------ mouse
  click(ev) {
    const i = this.indexAt(ev.x, ev.y);
    if (ev.button === 'menu') { this.openMenu(ev, i); return true; }
    if (i < 0) {
      if (ev.button === 'select') this.clearSelection();
      return true;
    }
    const k = this.items[i].name.toLowerCase();
    if (ev.button === 'adjust') this.setSelected(i, !this.selected.has(k));
    else if (!this.selected.has(k)) { this.clearSelection(); this.setSelected(i, true); }
    return true;
  }

  doubleClick(ev) {
    const i = this.indexAt(ev.x, ev.y);
    if (i < 0) return true;
    const it = this.items[i];
    this.setSelected(i, false);
    // The Filer (s.Clicks click_select) closes this viewer for an ADJUST double-click; SHIFT (held at the
    // click) opens applications as directories and files as text.
    const adjust = ev.button === 'adjust';
    if (it.type === 'dir' && (!it.isApp || ev.shift)) {
      this.filer.openDir(it.path, { from: this, replacing: adjust });
      if (adjust) this.close();
      return true;
    }
    this.filer.run(it.path, { shift: ev.shift });
    if (adjust) this.close();
    return true;
  }

  drag(ev) {
    const i = this.indexAt(ev.x, ev.y);
    if (i < 0) { this.rubberBand(ev); return true; }
    const k = this.items[i].name.toLowerCase();
    if (!this.selected.has(k)) {
      if (ev.button === 'select') this.clearSelection();
      this.setSelected(i, true);
    }
    const sel = this.selection();
    const h = this.hotRect(i);
    const icon = this.icons[i];
    const spr = sel.length > 1 ? 'package' : fileSprite(this.items[i], { small: this.mode !== 'large' }).name;
    const s = sprites.get(spr);
    const b = icon.bbox;
    let sx0 = b.x0, sy0 = b.y0;
    if (this.mode === 'large') { sx0 = (b.x0 + b.x1) / 2 - (s?.cssW ?? 34) / 2; sy0 = b.y0; }
    const p = this.win.workToScreen(sx0, sy0);
    const box = { x0: p.x, y0: p.y, x1: p.x + (s?.cssW ?? 34), y1: p.y + (s?.cssH ?? 34) };
    wimp.drag({ sprite: spr, box, event: ev.pointerEvent }).then((drop) => this.dropped(drop, sel, ev));
    return true;
  }

  rubberBand(ev) {
    const start = this.win.screenToWork(ev.sx, ev.sy);
    const adjust = ev.button === 'adjust';
    if (!adjust) this.clearSelection();
    const before = new Set(this.selected);
    const bounds = { x0: this.win.x, y0: this.win.y, x1: this.win.x + this.win.w, y1: this.win.y + this.win.h };
    wimp.drag({ type: 'rubber', box: { x0: ev.sx, y0: ev.sy, x1: ev.sx, y1: ev.sy }, bounds, event: ev.pointerEvent }).then((drop) => {
      const a = start, b = this.win.screenToWork(drop.box.x1, drop.box.y1);
      const r = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
      this.items.forEach((it, i) => {
        const h = this.hotRect(i);
        const hit = h.x0 < r.x1 && h.x1 > r.x0 && h.y0 < r.y1 && h.y1 > r.y0;
        if (!hit) return;
        const k = it.name.toLowerCase();
        this.setSelected(i, adjust ? !before.has(k) : true);
      });
    });
  }

  async dropped(drop, sel, ev) {
    const w = drop.window;
    if (!w || w === this.win && !drop.icon) return;
    const files = sel.map((s) => ({ path: s.path, filetype: s.filetype, size: s.size, name: s.name, type: s.type }));
    const move = !!drop.shift;
    // Onto another Filer viewer (or a directory in one)
    const target = this.filer.viewerFor(w);
    if (target) {
      let dest = target.path;
      const j = target.indexAt(drop.x, drop.y);
      if (j >= 0 && target.items[j].type === 'dir' && !target.items[j].isApp) dest = target.items[j].path;
      if (j >= 0 && target.items[j].isApp && !files.some((f) => f.path === target.items[j].path)
        && os.apps?.dropOnApp(target.items[j].path, files)) { this.clearSelection(); return; }
      if (target === this && dest === this.path) return;
      fileAction(move ? 'move' : 'copy', files.map((f) => f.path), dest, this.filer.options);
      if (move === false) this.clearSelection();
      return;
    }
    wimp.dataLoad(drop, files, this.filer.task);
    if (w !== this.win) this.clearSelection();
  }

  dataLoad(ev) {
    // files dropped from elsewhere (not via Filer drag - e.g. from pinboard)
    const files = ev.files ?? [];
    if (!files.length) return true;
    const j = this.indexAt(ev.x, ev.y);
    if (j >= 0 && this.items[j].isApp && os.apps?.dropOnApp(this.items[j].path, files)) return true;
    const paths = files.map((f) => f.path).filter((p) => vfs.parent(p).toLowerCase() !== this.path.toLowerCase());
    if (paths.length) fileAction(ev.shift ? 'move' : 'copy', paths, this.path, this.filer.options);
    return true;
  }

  // ------------------------------------------------------------ menu
  openMenu(ev, i) {
    const f = this.filer;
    let temp = false;
    if (this.selected.size === 0 && i >= 0) { this.setSelected(i, true); temp = true; }
    const sel = this.selection();
    const one = sel.length === 1 ? sel[0] : null;
    const kind = sel.length === 0 ? null : sel.length > 1 ? 'S' : one.isApp ? 'A' : one.type === 'dir' ? 'D' : 'F';
    const ro = vfs.stat(this.path)?.readonly;
    const leaf = one?.name ?? '';
    const fileItemText = kind == null ? f.m('MT1F', '') : kind === 'S' ? f.m('MT1S') : f.m('MT1' + kind, leaf);
    const subTitle = kind == null ? f.m('MT1TF') : f.m('MT1T' + kind);
    const disp = new Menu(f.m('MT0T'), [
      { text: f.m('MT00'), ticked: () => this.mode === 'large', action: () => this.setMode('large') },
      { text: f.m('MT01'), ticked: () => this.mode === 'small', action: () => this.setMode('small') },
      { text: f.m('MT02'), ticked: () => this.mode === 'full', dotted: true, action: () => this.setMode('full') },
      { text: f.m('MT03'), ticked: () => this.sort === 'name', action: () => this.setSort('name') },
      { text: f.m('MT04'), ticked: () => this.sort === 'type', action: () => this.setSort('type') },
      { text: f.m('MT05'), ticked: () => this.sort === 'size', action: () => this.setSort('size') },
      { text: f.m('MT06'), ticked: () => this.sort === 'date', action: () => this.setSort('date') },
    ]);
    const renameMenu = new Menu(f.m('MT11T'), [{ text: '', writable: { value: leaf, maxLen: 255, validation: f.m('MTFilename_Validation') }, action: (e) => this.rename(one, e.value) }]);
    const accessMenu = new Menu(f.m('MT13T'), [
      { text: f.m('MT130'), action: () => this.access(sel, { set: ATTR.locked }) },
      { text: f.m('MT131'), dotted: true, action: () => this.access(sel, { clear: ATTR.locked }) },
      { text: f.m('MT132'), action: () => this.access(sel, { set: ATTR.publicRead }) },
      { text: f.m('MT133'), dotted: true, action: () => this.access(sel, { clear: ATTR.publicRead | ATTR.publicWrite }) },
      { text: f.m('MT134'), submenu: () => this.accessBox(sel) },
    ]);
    const findMenu = new Menu(f.m('MT17T'), [{ text: '', writable: { value: '', maxLen: 255, validation: f.m('MTFindname_Validation') }, action: (e) => fileAction('find', sel.map((s) => s.path), e.value, f.options) }]);
    const typeMenu = new Menu(f.m('MT18T'), [{ text: '', writable: { value: one && one.type === 'file' && one.filetype >= 0 ? typeName(one.filetype) : '', maxLen: 12, validation: f.m('MTFiletype_Validation') }, action: (e) => this.setType(sel, e.value) }]);
    const hasHelp = one?.isApp && vfs.exists(one.path + '.!Help');
    const fileMenu = new Menu(subTitle, [
      { text: f.m('MT10'), submenu: () => this.copyBox(one), shaded: !one },
      { text: f.m('MT11'), submenu: renameMenu, shaded: !one || ro },
      { text: f.m('MT12'), shaded: ro, action: () => { fileAction('delete', sel.map((s) => s.path), null, f.options); } },
      { text: f.m('MT13'), submenu: accessMenu, shaded: ro },
      { text: f.m('MT14'), action: () => fileAction('count', sel.map((s) => s.path), null, f.options) },
      { text: f.m('MT15'), shaded: !hasHelp, action: () => os.cli.run(`Filer_Run ${one.path}.!Help`) },
      { text: f.m('MT16'), submenu: () => this.infoBox(one), shaded: !one },
      { text: f.m('MT17'), submenu: findMenu },
      { text: f.m('MT18'), submenu: typeMenu, shaded: ro },
      { text: f.m('MT19'), shaded: ro, action: () => fileAction('stamp', sel.map((s) => s.path), null, f.options) },
    ]);
    const optMenu = new Menu(f.m('MT4T'), [
      { text: f.m('MT40'), ticked: () => f.options.confirm, action: () => { f.options.confirm = !f.options.confirm; } },
      { text: f.m('MT41'), ticked: () => f.options.verbose, action: () => { f.options.verbose = !f.options.verbose; } },
      { text: f.m('MT42'), ticked: () => f.options.force, action: () => { f.options.force = !f.options.force; } },
      { text: f.m('MT43'), ticked: () => f.options.newer, action: () => { f.options.newer = !f.options.newer; } },
    ]);
    const newDir = new Menu(f.m('MT5T'), [{ text: '', writable: { value: '', maxLen: 255, validation: f.m('MTDirname_Validation') }, action: (e) => this.newDir(e.value) }]);
    const m = new Menu(f.m('MTT'), [
      { text: f.m('MT0'), submenu: disp },
      { text: fileItemText, submenu: fileMenu, shaded: !kind, showArrowWhenShaded: true },
      { text: f.m('MT2'), shaded: !this.items.length, action: () => this.selectAll() },
      { text: f.m('MT3'), shaded: !sel.length, action: () => this.clearSelection() },
      { text: f.m('MT4'), submenu: optMenu },
      { text: f.m('MT5'), submenu: newDir, shaded: ro },
      { text: f.m('MT6'), shaded: vfs.isRoot(this.path), action: () => this.filer.openDir(vfs.parent(this.path), { from: this }) },
    ]);
    wimp.menus.open(m, ev.sx - 32, ev.sy, {
      task: f.task, window: this.win,
      onClose: () => { if (temp) this.clearSelection(); },
    });
  }

  setMode(m) {
    this.mode = m; this.filer.defaultMode = m; this.cols = 0;
    const { w, h } = this.idealSize();
    this.layout(w);
    this.win.open({ w, h: Math.max(h, Math.min(this.win.h, this.win.extent.y1)) });
  }
  setSort(s) { this.sort = s; this.filer.defaultSort = s; this.refresh(); this.win.open({}); }

  rename(it, name) {
    if (!it || !name || name === it.name) return;
    try { vfs.rename(it.path, `${this.path}.${name}`); } catch (e) { wimp.reportError(e.message, { appName: 'Filer' }); }
  }
  newDir(name) {
    if (!name) return;
    try { vfs.mkdir(`${this.path}.${name}`); } catch (e) { wimp.reportError(e.message, { appName: 'Filer' }); }
  }
  access(sel, { set = 0, clear = 0 }) {
    fileAction('access', sel.map((s) => s.path), { set, clear }, this.filer.options);
  }
  setType(sel, v) {
    const t = parseType(v);
    if (t < 0) { wimp.reportError(`File type '${v}' is unrecognised`, { appName: 'Filer' }); return; }
    fileAction('settype', sel.map((s) => s.path), t, this.filer.options);
  }

  copyBox(it) {
    const box = saveAs({
      task: this.filer.task, title: 'Copy as', filename: it.name, filetype: it.type === 'dir' ? (it.isApp ? FT_APP : FT_DIR) : it.filetype,
      save: async (path) => {
        if (!/[.:]/.test(path)) path = `${this.path}.${path}`;
        await fileAction('copyas', [it.path], path, this.filer.options);
      },
    });
    if (it.type === 'dir') box.setFiletype(it.isApp ? FT_APP : FT_DIR);
    box.icons[2].setSprite(fileSprite(it).name);
    box.on('menuclosed', () => box.delete());
    return box;
  }

  infoBox(it) {
    const w = wimp.createWindowFromTemplate(this.filer.tpl, 'fileinfo', {}, this.filer.task);
    const I = w.icons;
    I[0].setSprite(fileSprite(it).name);
    I[5].setText(it.name);
    I[2].setText(it.type === 'dir' ? (it.isApp ? 'Application' : 'Directory') : it.filetype === FT_UNTYPED ? 'Untyped' : `${typeName(it.filetype)} (${hex3(it.filetype).toLowerCase()})`);
    const size = it.type === 'dir' ? dirSize(it.path) : it.size;
    I[4].setText(`${size.toLocaleString('en-GB')} bytes`);
    I[3].setText('');
    I[8].setText(accessString(it.attr));
    I[7].setText(filerDate(it.date));
    I[10].setState({ deleted: true });
    w.on('menuclosed', () => w.delete());
    return w;
  }

  accessBox(sel) {
    const w = wimp.createWindowFromTemplate(this.filer.tpl, 'faccess', {}, this.filer.task);
    const I = w.icons;
    const a = sel[0]?.attr ?? DEFAULT;
    const bits = [ATTR.locked, ATTR.ownerRead, ATTR.ownerWrite, ATTR.publicRead, ATTR.publicWrite];
    // icons 1-5 "yes" column, 7-11 "no" column
    bits.forEach((b, k) => { I[1 + k].setState({ selected: !!(a & b) }); I[7 + k].setState({ selected: !(a & b) }); });
    I[6].setState({ deleted: !sel.some((s) => s.type === 'dir') });
    w.on('click', (ev) => {
      if (ev.icon === I[0] && ev.button !== 'menu') {
        let set = 0, clear = 0;
        bits.forEach((b, k) => { if (I[1 + k].selected) set |= b; else if (I[7 + k].selected) clear |= b; });
        fileAction('access', sel.map((s) => s.path), { set, clear, recurse: I[6].selected }, this.filer.options);
        if (ev.button === 'select') wimp.menus.close();
      }
    });
    w.on('menuclosed', () => w.delete());
    return w;
  }
}
const DEFAULT = ATTR.ownerRead | ATTR.ownerWrite | ATTR.publicRead;

function dirSize(path) {
  let n = 0;
  const walk = (p) => { for (const c of vfs.list(p)) { if (c.type === 'dir') walk(c.path); else n += c.size; } };
  try { walk(path); } catch { /* */ }
  return n;
}

export const filer = new Filer();
