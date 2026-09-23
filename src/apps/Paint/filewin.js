// Sprite file windows (c.Main spritefile_event_handler, main_set_extent; c.Menus file menu).
//
// Layout, in OS units as in main.h (1 px = 2 OS units):
//   thumbnail cells  TotalWidth 208 x TotalHeight 240 (sprite in a 192 square, name below)
//   full info rows   FullInfoWidth 1196 x FullInfoHeight 96
//   a 48 OS unit strip at the top reads "  Sprite file window" (SPACE_FOR_HELP_TEXT).

import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { Menu } from '../../core/menu.js';
import { fonts } from '../../core/fonts.js';
import { wimpColour } from '../../core/palette.js';
import { spriteCanvas } from './render.js';

const TEXT_H = 16, TEXT_W = 10;                 // main_FILER_TextHeight/Width in px
const XSIZE = 12 * (TEXT_W - 2), BORDER = TEXT_W - 2;  // 96, 8
const CELL_W = XSIZE + BORDER, CELL_H = XSIZE + TEXT_H + BORDER;   // 104 x 120
const FULL_W = XSIZE / 2 + 55 * TEXT_W, FULL_H = 3 * TEXT_H;       // 598 x 48
const STRIP = TEXT_H * 3 / 2;                    // 24

export class FileWindows {
  constructor(A) { this.A = A; }

  cell(f) { return f.fullInfo ? { w: FULL_W, h: FULL_H } : { w: CELL_W, h: CELL_H }; }

  title(f) { return (f.filename ?? this.A.msg('PntF4')) + (f.modified ? ' *' : ''); }
  setTitle(f) { f.win?.setTitle(this.title(f)); }

  /** New_Window (+ Load_File sizing). */
  create(f, { open = true } = {}) {
    const A = this.A;
    const w = f.win = A.task.createWindowFromTemplate(A.tpl, 'SpriteFile', { title: this.title(f) });
    w.flags |= 1 << 12;   // hot keys (Ctrl-Z undo)
    w.minW = 1; w.minH = 1;
    w._paintFile = f;
    w.useCanvas((g, r) => this.paint(f, g, r), { fill: false });
    w.on('open', (ev) => { ev.preventDefault(); w.open(ev); this.layout(f, false, ev.w); });
    w.on('doubleclick', (ev) => this.doubleClick(f, ev));
    w.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(this.menu(f, ev), ev, { task: A.task }); return true; }
      return false;
    });
    w.on('close', (ev) => { ev.preventDefault(); this.closeRequest(f, ev); });
    w.on('dataload', (ev) => { A.mergeFiles(f, ev.files ?? [{ path: ev.path, filetype: ev.filetype }]); return true; });
    w.on('datasave', (ev) => { this.receive(f, ev); return true; });
    w.on('hotkey', (ev) => this.hotkey(ev));
    w.on('key', (ev) => this.hotkey(ev));
    w.on('helprequest', (ev) => { ev.text = A.msgs[f.sprites.length ? 'PntH4' : 'PntH3']; });
    // initial geometry: cascaded position, sized by main_set_extent
    const pos = A.allocatePosition(w.h);
    f.lastCols = 0;
    w.x = pos.x; w.y = pos.y;
    this.layout(f, true);
    if (open) w.open({ x: pos.x, y: pos.y, behind: 'top', scrollY: 0 });
    return w;
  }

  /**
   * main_set_extent: the work area holds the sprites; when the number of columns changes the
   * window is made as wide as the extent (all sprites in a row, or the title) and as tall as the
   * rows of sprites, as Paint 1.94 does. reqW = the width the user asked for (open request).
   */
  layout(f, force = false, reqW = null) {
    const w = f.win;
    if (!w) return;
    const { w: cw, h: ch } = this.cell(f);
    const n = f.sprites.length;
    const name = f.filename ?? '';
    const width = Math.max(TEXT_W * ((f.filename == null ? 12 : name.length) + 10), cw * n);
    const cols = Math.max(1, Math.floor((reqW ?? w.w) / cw));
    if (!force && cols === f.lastCols && w.extent.x1 === width) return false;
    // the Wimp limits the window to the screen: that decides how many sprites fit in a row
    const maxW = wimp.width - 24;
    const fitCols = Math.max(1, Math.floor(Math.min(width, maxW) / cw));
    const rows = Math.max(1, Math.ceil(n / fitCols));
    const height = STRIP + ch * rows;
    f.lastCols = fitCols;
    w.extent = { x0: 0, y0: 0, x1: width, y1: height };
    const nh = Math.min(height, wimp.height - 110);
    if (w.isOpen) w.open({ w: width, h: nh, behind: 'keep' });
    else { w.w = Math.min(width, maxW); w.h = nh; w._layout(); }
    w.invalidate();
    return true;
  }

  redraw(f) { f.win?.invalidate(); }
  redrawSprite(s) { const f = s.st?.file; if (f?.win) this.scheduleRedraw(f); }
  scheduleRedraw(f) {
    if (f._rt) return;
    f._rt = setTimeout(() => { f._rt = null; f.win?.invalidate(); }, 40);
  }

  cols(f) { return f.lastCols || Math.max(1, Math.floor(f.win.w / this.cell(f).w)); }

  /** Redraw (spritefile_event_handler wimp_EREDRAW). */
  paint(f, g, r) {
    const A = this.A;
    const { w: cw, h: ch } = this.cell(f);
    const per = this.cols(f);
    g.textBaseline = 'middle';
    g.font = fonts.css;
    // the "Sprite file window" strip
    if (r.y0 < STRIP) {
      g.fillStyle = wimpColour(3);
      g.fillRect(r.x0, 0, r.x1 - r.x0, STRIP);
      g.fillStyle = wimpColour(7);
      g.fillText(A.msg('PntW1'), 0, STRIP - (2 + TEXT_H / 2) + 1);
    }
    f.sprites.forEach((s, i) => {
      const cx = (i % per) * cw, cy = STRIP + Math.floor(i / per) * ch;
      if (cx > r.x1 || cx + cw < r.x0 || cy > r.y1 || cy + ch < r.y0) return;
      const bottom = cy + ch;
      g.fillStyle = wimpColour(7);
      const ok = !s.bad && s.w > 0 && s.h > 0;
      let tw = 0, th = 0, sc = 1;
      if (ok) {
        const icw = f.fullInfo ? 3 * TEXT_H - BORDER : XSIZE, ich = icw;
        const wOS = s.w << s.xeig, hOS = s.h << s.yeig;
        // psprite_set_icon_scale (in OS units)
        let mul = 1, div = 1;
        if (wOS > icw * 2) { mul = icw * 2; div = wOS; }
        if (hOS * mul > div * ich * 2) { mul = ich * 2; div = hOS; }
        sc = mul / div;
        tw = wOS * sc / 2; th = hOS * sc / 2;
      }
      let sx, sy;
      if (f.fullInfo) {
        const mid1 = bottom - (2 * TEXT_H) - 2 + 8, mid2 = bottom - TEXT_H - 2 + 8;
        g.textAlign = 'left';
        g.fillText(s.name, cx + 6 * TEXT_W, mid1 - 8);
        g.fillText(ok ? A.msg('PntW21', s.w, s.h) : A.msg('PntW22'), cx + 20 * TEXT_W, mid1 - 8);
        const T = s.mode >>> 27;
        g.fillText(s.mode >>> 0 < 256 ? A.msg('PntW23', s.mode) : A.msg('PntW24', ['2', '4', '16', '256', '32k', '16M'][T - 1] ?? '?'), cx + 33 * TEXT_W, mid1 - 8);
        g.textAlign = 'right';
        g.fillText(formatFixedSize(A.spriteSize(s)), cx + 55 * TEXT_W, mid1 - 8);
        g.textAlign = 'left';
        const pal = s.pal && s.pal.length ? (s.bpp <= 8 && s.pal.length >= 2 * (1 << s.bpp) ? 'PntW3a' : 'PntW3') : 'PntW4';
        g.fillText(`${A.msg(pal)}, ${A.msg(s.mask ? 'PntW5' : 'PntW6')}`, cx + 20 * TEXT_W, mid2 - 8);
        sx = cx + BORDER / 2; sy = bottom - BORDER / 2 - th;
      } else {
        g.textAlign = 'center';
        g.fillText(s.name.slice(0, 12), cx + cw / 2, bottom - 10);
        sx = cx + (BORDER + XSIZE - tw) / 2;
        sy = cy + (BORDER + XSIZE - th) / 2;
      }
      if (ok) {
        g.imageSmoothingEnabled = false;
        g.drawImage(spriteCanvas(s, f.useDesktop), Math.round(sx), Math.round(sy), Math.max(1, Math.round(tw)), Math.max(1, Math.round(th)));
      }
    });
    g.textAlign = 'left';
  }

  /** main_pick_sprite */
  pick(f, x, y) {
    const { w: cw, h: ch } = this.cell(f);
    const per = this.cols(f);
    const yy = y - STRIP;
    if (yy < 0) return null;
    const cx = Math.floor(x / cw);
    if (cx >= per) return null;
    const i = Math.floor(yy / ch) * per + cx;
    return f.sprites[i] ?? null;
  }

  doubleClick(f, ev) {
    if (ev.button !== 'select') return;
    const s = this.pick(f, ev.x, ev.y);
    const A = this.A;
    if (s) {
      if (s.bad) { A.error('PntEJ'); return; }
      A.spriteWins.open(s);
    } else A.dialogs.createSprite(f, { auto: false, name: '' });
  }

  hotkey(ev) {
    if (ev.code === 26) { this.A.undo(); return true; }    // Ctrl-Z
    if (ev.code === 25) { this.A.redo(); return true; }    // Ctrl-Y
    return false;
  }

  /** A save box from another application dropped here: merge its sprites (RAM transfer). */
  async receive(f, ev) {
    const A = this.A;
    if (ev.filetype !== 0xFF9 && ev.filetype !== 0xC85) { A.error('PntEB', ev.leafname); return; }
    const data = await ev.receive();
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    try {
      const { readSpriteFile } = await import('./spritefile.js');
      const sprites = ev.filetype === 0xC85 ? [await A.jpegSprite(bytes, ev.leafname)] : readSpriteFile(bytes).sprites;
      A.mergeSprites(f, sprites);
    } catch (e) { A.error(e.message); }
  }

  // ------------------------------------------------------------------ closing
  async closeRequest(f, ev) {
    const A = this.A;
    const adjust = ev.button === 'adjust';
    if (!(adjust && ev.shift) && f.modified) {
      const text = f.filename == null ? A.msg('PntF2') : A.msg('PntF3', f.filename);
      const r = await A.dialogs.closeQuery(text);
      if (r === 'cancel') return;
      if (r === 'save') {
        A.dialogs.saveFileBox(f, { onSaved: () => this.finishClose(f, adjust, ev.shift) }).openCentred();
        return;
      }
    }
    this.finishClose(f, adjust, ev.shift);
  }
  finishClose(f, adjust, shift) {
    if (adjust && f.filename) {
      const i = f.filename.lastIndexOf('.');
      if (i > 0) os.cli.run(`Filer_OpenDir ${f.filename.slice(0, i)}`).catch(() => {});
      if (shift) return;
    }
    this.destroy(f);
  }

  /** delete_file_window */
  destroy(f) {
    const A = this.A;
    A.dialogs.closeCreateFor(f);
    for (const s of f.sprites) A.spriteWins.closeAll(s);
    f.win?.delete();
    f.win = null;
    A.files = A.files.filter((q) => q !== f);
    if (!A.files.length) A.toolWin.closeIfUnused();
  }

  // ------------------------------------------------------------------ menu (menus_file_maker)
  menu(f, ev) {
    const A = this.A;
    const hit = this.pick(f, ev.x, ev.y);
    const H = (k) => A.msgs[k];
    const nameBuf = { value: hit?.name ?? '', maxLen: 12, validation: 'A~ ' };
    const spriteMenu = new Menu(A.msg('PntM4'), [
      { text: 'Copy', submenu: new Menu(A.msg('PntM6'), [{ text: '', writable: nameBuf, action: () => this.copySprite(f, hit, nameBuf.value) }]), help: H('FILER30') },
      { text: 'Rename', submenu: new Menu(A.msg('PntM7'), [{ text: '', writable: nameBuf, action: () => this.renameSprite(f, hit, nameBuf.value) }]), help: H('FILER31') },
      { text: 'Delete', dotted: true, action: () => this.deleteSprite(f, hit), help: H('FILER32') },
      { text: 'Save', submenu: () => A.dialogs.saveSpriteBox(hit), help: H('FILER33') },
      { text: 'Info', dotted: true, submenu: () => A.dialogs.spriteInfo(hit), help: H('FILER34') },
      { text: 'Print', submenu: () => A.dialogs.printBox(hit), action: () => A.error('PntE9'), help: H('FILER35') },
    ]);
    const displayMenu = new Menu(A.msg('PntM8'), [
      { text: 'Drawing and name', ticked: () => !f.fullInfo, action: () => this.setDisplay(f, false), help: H('FILER10') },
      { text: 'Full info', ticked: () => f.fullInfo, dotted: true, action: () => this.setDisplay(f, true), help: H('FILER11') },
      { text: 'Use desktop colours', ticked: () => f.useDesktop, action: () => this.toggleDesktop(f), help: H('FILER12') },
    ]);
    return new Menu(A.msg('Pnt00'), [
      { text: A.msg('PntMM'), submenu: new Menu(A.msg('PntMM'), [
        { text: 'Info', submenu: () => A.dialogs.progInfo(), help: H('FILER00') },
        { text: 'File', submenu: () => A.dialogs.fileInfo(f), help: H('FILER01') },
      ]), help: H('FILER0') },
      { text: 'Display', submenu: displayMenu, help: H('FILER1') },
      { text: 'Save', submenu: () => A.dialogs.saveFileBox(f), action: () => this.quickSave(f), help: H('FILER2') },
      { text: `Sprite '${hit?.name ?? ''}'`, submenu: spriteMenu, shaded: !hit, dotted: true, help: H('FILER3') },
      { text: 'New sprite', submenu: () => A.dialogs.createSprite(f, { auto: -1, name: '' }), help: H('FILER4') },
    ], { help: H('FILER0') });
  }

  /** Save menu entry clicked: save straight away if the file has a name (menus_save_file). */
  quickSave(f) {
    const A = this.A;
    if (!f.filename) { A.dialogs.saveFileBox(f).openCentred(); return; }
    try {
      os.vfs.writeFile(f.filename, A.fileBytes(f), { filetype: 0xFF9 });
      A.fileSaved(f, f.filename);
    } catch (e) { A.error(e.message ?? String(e)); }
  }

  setDisplay(f, full) {
    f.fullInfo = full;
    this.A.options.fullInfo = full;
    const w = f.win;
    if (full && w.w < FULL_W) w.open({ w: FULL_W, behind: 'keep' });
    f.lastCols = 0;
    this.layout(f, false);
    this.redraw(f);
  }

  toggleDesktop(f) {
    f.useDesktop = !f.useDesktop;
    this.A.options.useDesktop = f.useDesktop;
    for (const s of f.sprites) { s._palVer = (s._palVer ?? 0) + 1; this.A.spriteWins.reshaped(s); }
    this.redraw(f);
  }

  deleteSprite(f, s) {
    if (!s) return;
    const A = this.A;
    A.pushUndoFile(f);
    A.spriteWins.closeAll(s);
    f.sprites = f.sprites.filter((q) => q !== s);
    if (A.toolOpts.brush.sprite === s) A.toolOpts.brush.sprite = null;
    A.setModified(f);
    f.lastCols = 0;
    this.layout(f, false);
    this.redraw(f);
  }

  copySprite(f, s, name) {
    const A = this.A;
    if (!s) return;
    name = String(name).trim();
    if (!name) { A.error('PntE7'); return; }
    if (f.sprites.some((q) => q.name.toLowerCase() === name.toLowerCase())) { A.error('PntE6', name); return; }
    A.pushUndoFile(f);
    import('./spritefile.js').then(({ cloneSprite }) => {
      const c = cloneSprite(s, name.toLowerCase().slice(0, 12));
      delete c.st; delete c._cv; delete c.ts; delete c._cvVer;
      f.sprites.push(A.attach(c, f));
      A.setModified(f);
      f.lastCols = 0;
      this.layout(f, false);
      this.redraw(f);
    });
  }

  renameSprite(f, s, name) {
    const A = this.A;
    if (!s) return;
    name = String(name).trim();
    if (!name) { A.error('PntE7'); return; }
    const other = f.sprites.find((q) => q !== s && q.name.toLowerCase() === name.toLowerCase());
    if (other) { A.error('PntE6', name); return; }
    A.pushUndoFile(f);
    s.name = name.toLowerCase().slice(0, 12);
    if (s.raw) { s.orig = s.raw; s.raw = null; }
    A.setModified(f);
    A.spriteWins.titles(s);
    this.redraw(f);
  }
}

/** OS_ConvertFixedFileSize-style: "1234 bytes", "12K" ... right-aligned by the caller. */
function formatFixedSize(n) {
  if (n < 4096) return `${n} bytes`;
  if (n < 4096 * 1024) return `${Math.round(n / 1024)} Kbytes`;
  return `${Math.round(n / (1024 * 1024))} Mbytes`;
}
