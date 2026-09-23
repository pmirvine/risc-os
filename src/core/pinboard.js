// Pinboard: the desktop backdrop (tiled texture / backdrop sprite) with pinned file icons.
// RISC OS 3.71 default !Boot does:  Backdrop -tile BootResources:Configure.Textures.T3

import { wimp } from './wimp.js';
import { vfs } from './vfs.js';
import { Menu } from './menu.js';
import { Icon } from './icons.js';
import { IF } from './templates.js';
import { loadTemplates } from './templates.js';
import { loadMessages } from './messages.js';
import { sprites, spritesFromFile, loadManifest } from './sprites.js';
import { fileSprite } from './filetypes.js';
import { fonts, textWidth } from './fonts.js';
import { infoBox, saveAs } from './dialogs.js';
import { os } from './os.js';

const STORE = 'riscos371.pinboard';
const CELL_W = 90, CELL_H = 62, GRID = 24;

export class Pinboard {
  async init() {
    this.task = wimp.createTask('Pinboard', { kind: 'module', memory: 0 });
    this.tpl = await loadTemplates('assets/templates/Pinboard.json');
    this.msgs = await loadMessages('Pinboard');
    this.pins = [];         // {path, x, y (screen, icon top-left), icon}
    this.gridLock = false;
    const w = this.win = wimp.createWindowFromTemplate(this.tpl, 'back', {}, this.task);
    w.flags = (w.flags | (1 << 11) | (1 << 6)) >>> 0;   // back window, may be off-screen
    w.el.classList.add('pinboard');
    w.customBackground = true;
    w.on('click', (ev) => this.click(ev));
    w.on('doubleclick', (ev) => this.dclick(ev));
    w.on('drag', (ev) => this.drag(ev));
    w.on('dataload', (ev) => { this.dropFiles(ev); return true; });
    w.on('close', (ev) => ev.preventDefault());
    w.on('helprequest', (ev) => { const p = this.pinAt(ev.x, ev.y); ev.text = this.msgs.lookup(!p ? 'PWH' : p.iconised ? 'PIcW' : p.info?.isApp ? 'PIcA' : p.info?.type === 'dir' ? 'PIcD' : 'PIcF'); });
    wimp.on('modechange', () => this.reopen());
    wimp.iconiser = (win) => this.iconise(win);
    vfs.on('change', () => this.refreshIcons());
    this.reopen();
    // default backdrop: tiled T3 texture
    const saved = this._load();
    if (saved?.backdrop) await this.setBackdrop(saved.backdrop.path, saved.backdrop.mode, { quiet: true }).catch(() => this.defaultBackdrop());
    else await this.defaultBackdrop();
    for (const p of saved?.pins ?? []) this.pin(p.path, p.x, p.y, { noSave: true });
  }

  reopen() {
    const w = this.win;
    w.extent = { x0: 0, y0: 0, x1: wimp.width, y1: wimp.height };
    w.open({ x: 0, y: 0, w: wimp.width, h: wimp.height, behind: 'bottom' });
    this._applyBackdrop();
  }

  async defaultBackdrop() {
    const m = await loadManifest('Textures', 'T3');
    const s = [...m.values()][0];
    this.backdrop = s ? { sprite: s, mode: 'tile', path: 'BootResources:Configure.Textures.T3', isDefault: true } : null;
    this._applyBackdrop();
  }

  async setBackdrop(path, mode = 'scale', { quiet } = {}) {
    const st = vfs.stat(path);
    if (!st) throw new Error(`File '${path}' not found`);
    if (st.filetype !== 0xFF9) throw new Error(`'${st.name}' is not a sprite file`);
    const m = spritesFromFile(await vfs.readFile(st.path));
    const s = [...m.values()][0];
    if (!s) throw new Error(`'${st.name}' is not a sprite file`);
    this.backdrop = { sprite: s, mode, path: st.path };
    this._applyBackdrop();
    if (!quiet) this._save();
  }
  removeBackdrop() { this.backdrop = null; this._applyBackdrop(); this._save(); }

  _applyBackdrop() {
    const v = this.win.view.style;
    v.backgroundColor = '#777777';        // Wimp colour 4: the plain desktop background
    const b = this.backdrop;
    if (!b) { v.backgroundImage = ''; return; }
    v.backgroundImage = `url("${b.sprite.url}")`;
    v.backgroundPosition = b.mode === 'centre' ? 'center' : '0 0';
    v.backgroundRepeat = b.mode === 'tile' ? 'repeat' : 'no-repeat';
    v.backgroundSize = b.mode === 'scale' ? '100% 100%' : `${b.sprite.cssW}px ${b.sprite.cssH}px`;
  }

  // ------------------------------------------------------------ iconised windows
  /** Iconise a window (Message_Iconize): close it and show an icon on the backdrop. */
  iconise(win) {
    const ev = win.emit('iconise', {});
    if (ev.defaultPrevented) return;
    const task = win.task?.name ?? '';
    const cand = ['ic_' + task.toLowerCase(), task.toLowerCase() === 'filer' ? 'ic_filer' : null, win.task?.app?.sprite, 'ic_?'].filter(Boolean);
    const spr = cand.find((n) => sprites.has(n)) ?? 'ic_?';
    let title = win.title;
    const dot = title.lastIndexOf('.');
    if (dot >= 0 && /[:$]/.test(title)) title = title.slice(dot + 1) || title;
    title = title.replace(/ \*$/, '').slice(0, 20);
    const p = { iconised: win, path: null, ...this._freeSpot() };
    win.close();
    const w = Math.max(CELL_W - 8, Math.ceil(textWidth(title, fonts.css)) + 4);
    const ic = new Icon(this.win, {
      bbox: { x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + CELL_H - 8 },
      flags: (IF.text | IF.sprite | IF.hcentre | IF.indirected | (7 << 24) | (1 << 28)) >>> 0,
      text: title, validation: 'S' + spr, bufLen: 64,
    }, -1);
    ic.el.classList.add('pin');
    ic._pin = p;
    p.icon = ic;
    p.info = { name: title, filetype: -1, type: 'iconised' };
    this.pins.push(p);
    this.win.iconLayer.appendChild(ic.el);
    const off = win.on('opened', () => { off(); this.unpin(p, true); });
    win.on('deleted', () => this.unpin(p, true));
  }

  // ------------------------------------------------------------ pins
  /** Pin an object at screen position (x, y) = top-left of its icon cell. */
  pin(path, x, y, opts = {}) {
    const st = vfs.stat(path);
    if (!st) return null;
    if (x == null) { const p = this._freeSpot(); x = p.x; y = p.y; }
    if (this.gridLock) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
    const p = { path: st.path, x, y };
    this.pins.push(p);
    this._makeIcon(p);
    if (!opts.noSave) this._save();
    return p;
  }

  _makeIcon(p) {
    const st = vfs.stat(p.path);
    if (!st) return;
    const spr = fileSprite(st);
    const w = Math.max(CELL_W - 8, Math.ceil(textWidth(st.name, fonts.css)) + 4);
    p.icon?.el.remove();
    const ic = new Icon(this.win, {
      bbox: { x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + CELL_H - 8 },
      flags: (IF.text | IF.sprite | IF.hcentre | IF.indirected | (7 << 24) | (1 << 28) | (p.selected ? IF.selected : 0)) >>> 0,
      text: st.name, validation: 'S' + spr.name, bufLen: 256,
    }, -1);
    ic.el.classList.add('pin');
    ic._pin = p;
    p.icon = ic;
    p.info = st;
    this.win.iconLayer.appendChild(ic.el);
  }

  refreshIcons() {
    for (const p of [...this.pins]) {
      if (!p.path) continue;
      if (!vfs.exists(p.path)) { this.unpin(p, true); continue; }
    }
  }

  unpin(p, noSave) {
    p.icon?.el.remove();
    this.pins = this.pins.filter((q) => q !== p);
    if (!noSave) this._save();
  }
  clear() { for (const p of [...this.pins]) this.unpin(p, true); this._save(); }

  _freeSpot() {
    for (let col = 0; col < 40; col++) {
      for (let row = 0; row < 20; row++) {
        const x = 16 + col * CELL_W, y = 16 + row * CELL_H;
        if (y + CELL_H > wimp.height - (wimp.iconbar?.height ?? 68)) break;
        if (!this.pins.some((p) => Math.abs(p.x - x) < CELL_W / 2 && Math.abs(p.y - y) < CELL_H / 2)) return { x, y };
      }
    }
    return { x: 16, y: 16 };
  }

  pinAt(x, y) {
    for (let i = this.pins.length - 1; i >= 0; i--) {
      const p = this.pins[i];
      if (p.icon?.contains(x, y)) return p;
    }
    return null;
  }
  selection() { return this.pins.filter((p) => p.selected); }
  setSel(p, on) { p.selected = on; p.icon?.setState({ selected: on }); }
  clearSel() { for (const p of this.pins) if (p.selected) this.setSel(p, false); }

  // ------------------------------------------------------------ mouse
  click(ev) {
    const p = this.pinAt(ev.x, ev.y);
    if (ev.button === 'menu') { this.menu(ev, p); return true; }
    if (!p) { if (ev.button === 'select') this.clearSel(); return true; }
    if (ev.button === 'adjust') this.setSel(p, !p.selected);
    else if (!p.selected) { this.clearSel(); this.setSel(p, true); }
    return true;
  }

  dclick(ev) {
    const p = this.pinAt(ev.x, ev.y);
    if (!p) return true;
    this.setSel(p, false);
    if (p.iconised) { p.iconised.open({ behind: 'top' }); return true; }
    os.filer.run(p.path);
    if (ev.button === 'adjust') this.unpin(p);
    return true;
  }

  drag(ev) {
    const p = this.pinAt(ev.x, ev.y);
    if (!p) {
      // rubber-band selection on the backdrop
      if (ev.button === 'select') this.clearSel();
      wimp.drag({ type: 'rubber', box: { x0: ev.sx, y0: ev.sy, x1: ev.sx, y1: ev.sy }, event: ev.pointerEvent }).then((d) => {
        const r = { x0: Math.min(d.box.x0, d.box.x1), y0: Math.min(d.box.y0, d.box.y1), x1: Math.max(d.box.x0, d.box.x1), y1: Math.max(d.box.y0, d.box.y1) };
        for (const q of this.pins) {
          const b = q.icon.bbox;
          if (b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0) this.setSel(q, ev.button === 'adjust' ? !q.selected : true);
        }
      });
      return true;
    }
    if (!p.selected) { if (ev.button === 'select') this.clearSel(); this.setSel(p, true); }
    const sel = this.selection();
    const spr = sel.length > 1 ? 'package' : p.iconised ? p.icon.currentSprite()?.name : fileSprite(p.info).name;
    const s = sprites.get(spr);
    const b = p.icon.bbox;
    const sx = (b.x0 + b.x1) / 2 - (s?.cssW ?? 34) / 2, sy = b.y0;
    wimp.drag({ sprite: spr, box: { x0: sx, y0: sy, x1: sx + (s?.cssW ?? 34), y1: sy + (s?.cssH ?? 34) }, event: ev.pointerEvent }).then((d) => {
      if (d.window === this.win) {
        // move the icons
        const dx = d.box.x0 - sx, dy = d.box.y0 - sy;
        for (const q of sel) {
          q.x += dx; q.y += dy;
          if (this.gridLock) { q.x = Math.round(q.x / GRID) * GRID; q.y = Math.round(q.y / GRID) * GRID; }
          q.icon.moveTo({ x0: q.x, y0: q.y, x1: q.x + (q.icon.bbox.x1 - q.icon.bbox.x0), y1: q.y + (q.icon.bbox.y1 - q.icon.bbox.y0) });
        }
        this._save();
        return;
      }
      if (!d.window) return;
      const files = sel.filter((q) => q.path).map((q) => ({ path: q.path, filetype: q.info.filetype, size: q.info.size, name: q.info.name, type: q.info.type }));
      const fv = os.filer.viewerFor(d.window);
      if (fv) { import('./fileraction.js').then(({ fileAction }) => fileAction(d.shift ? 'move' : 'copy', files.map((f) => f.path), fv.path, os.filer.options)); return; }
      wimp.dataLoad(d, files, this.task);
    });
    return true;
  }

  dropFiles(ev) {
    let x = ev.sx ?? ev.x, y = ev.sy ?? ev.y;
    for (const f of ev.files ?? []) {
      if (this.pins.some((p) => p.path.toLowerCase() === f.path.toLowerCase())) {
        const p = this.pins.find((q) => q.path.toLowerCase() === f.path.toLowerCase());
        this.unpin(p, true);
      }
      this.pin(f.path, x - CELL_W / 2 + 4, y - 20);
      x += CELL_W;
    }
  }

  tidy() {
    const H = wimp.height - (wimp.iconbar?.height ?? 68) - 8;
    let x = 16, y = 16;
    for (const p of [...this.pins].sort((a, b) => a.info.name.localeCompare(b.info.name))) {
      p.x = x; p.y = y;
      p.icon.moveTo({ x0: x, y0: y, x1: x + (p.icon.bbox.x1 - p.icon.bbox.x0), y1: y + (p.icon.bbox.y1 - p.icon.bbox.y0) });
      y += CELL_H;
      if (y + CELL_H > H) { y = 16; x += CELL_W; }
    }
    this._save();
  }

  menu(ev, p) {
    const M = (t, ...a) => this.msgs.lookup(t, ...a);
    let temp = false;
    if (!this.selection().length && p) { this.setSel(p, true); temp = true; }
    const sel = this.selection();
    const spriteSel = sel.length === 1 && sel[0].info?.filetype === 0xFF9;
    const bdMenu = new Menu(M('T4'), [
      { text: M('M41'), action: () => this.setBackdrop(sel[0].path, 'scale').catch((e) => wimp.reportError(e.message, { appName: 'Pinboard' })) },
      { text: M('M42'), action: () => this.setBackdrop(sel[0].path, 'centre').catch((e) => wimp.reportError(e.message, { appName: 'Pinboard' })) },
      { text: M('M43'), action: () => this.setBackdrop(sel[0].path, 'tile').catch((e) => wimp.reportError(e.message, { appName: 'Pinboard' })) },
    ]);
    const m = new Menu(M('TaskID'), [
      { text: M('M31'), submenu: () => infoBox(this.task, { name: 'Pinboard', purpose: 'Backdrop and icon bar utility', author: '© Acorn Computers Ltd, 1992', version: '0.66 (09-Jan-95)' }) },
      { text: M('M32'), action: () => this.tidy() },
      { text: M('M33'), ticked: () => this.gridLock, action: () => { this.gridLock = !this.gridLock; } },
      { text: sel.length > 1 ? M('M34s') : M('M34'), shaded: !sel.length, action: () => { for (const q of this.selection()) this.unpin(q, true); this._save(); } },
      { text: M('M35'), shaded: !this.pins.length, action: () => { for (const q of this.pins) this.setSel(q, true); } },
      { text: M('M36'), shaded: !sel.length, action: () => this.clearSel() },
      { text: M('M37'), shaded: !spriteSel, submenu: spriteSel ? bdMenu : null, action: spriteSel ? () => this.setBackdrop(sel[0].path, 'scale').catch((e) => wimp.reportError(e.message, { appName: 'Pinboard' })) : null },
      { text: M('M38'), shaded: !this.backdrop, action: () => this.removeBackdrop() },
      { text: M('M39'), submenu: () => this.saveBox() },
    ]);
    wimp.menus.open(m, ev.sx - 32, ev.sy, { task: this.task, onClose: () => { if (temp) this.clearSel(); } });
  }

  saveBox() {
    const box = saveAs({
      task: this.task, title: 'Save as', filename: 'Pinboard', filetype: 0xFEB,
      getData: async () => this.obeyText(),
    });
    box.on('menuclosed', () => box.delete());
    return box;
  }

  obeyText() {
    let s = 'Pinboard\n';
    if (this.backdrop && !this.backdrop.isDefault) s += `Backdrop -${this.backdrop.mode === 'tile' ? 'Tile' : this.backdrop.mode === 'centre' ? 'Centre' : 'Scale'} ${this.backdrop.path}\n`;
    for (const p of this.pins) s += `Pin ${p.path} ${Math.round(p.x * 2)} ${Math.round((wimp.height - p.y) * 2)}\n`;
    return s;
  }

  _save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        pins: this.pins.filter((p) => p.path).map((p) => ({ path: p.path, x: p.x, y: p.y })),
        backdrop: this.backdrop && !this.backdrop.isDefault ? { path: this.backdrop.path, mode: this.backdrop.mode } : null,
      }));
    } catch { /* ignore */ }
  }
  _load() { try { return JSON.parse(localStorage.getItem(STORE) ?? 'null'); } catch { return null; } }
}

export const pinboard = new Pinboard();
