// !Paint - the RISC OS 3.71 sprite editor (a port of Sources/Apps/Paint).
//
// Module layout:
//   main.js     application core: files, loading/merging/saving, icon bar, messages, undo
//   filewin.js  sprite file windows (thumbnails / full info) and their menu
//   sprwin.js   sprite editing windows, colour windows, the sprite menu and its dialogues
//   toolwin.js  the "Paint tools" window
//   dialogs.js  Create new sprite, info boxes, zoom, size, query boxes...
//   picker.js   ColourPicker-style dialogue (deep sprites, Edit palette)
//   tools.js    the painting tools (c.Tools); raster.js - VDU shape rasterising
//   spritefile.js / ops.js / colours.js / render.js - the sprite model

import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadManifest } from '../../core/sprites.js';
import { readSpriteFile, writeSpriteFile, encodeSprite, newSprite, isSpriteFile, cloneSprite } from './spritefile.js';
import { nColours, WIMP_RGB, nearest, deepPixel, nearestColour } from './colours.js';
import { snapshot, restore, changed } from './ops.js';
import { spriteEdited } from './render.js';
import { makeTools } from './tools.js';
import { FileWindows } from './filewin.js';
import { SpriteWindows } from './sprwin.js';
import { ToolWindow } from './toolwin.js';
import { Dialogs } from './dialogs.js';

export const SPRITE = 0xFF9, PALETTE = 0xFED, JPEG = 0xC85;

export default async function start(task, ctx) {
  const [msgs, tpl, paintSprites, pickerTpl, rgbTpl] = await Promise.all([
    fetch('assets/messages/Paint.json').then((r) => r.json()).catch(() => ({})),
    loadTemplates('assets/templates/Paint.json'),
    loadManifest('Paint', 'Sprites'),
    loadTemplates('assets/templates/Picker.json'),
    loadTemplates('assets/templates/Picker-RGB.json'),
  ]);
  const A = new PaintApp(task, ctx, msgs, tpl, paintSprites);
  A.pickerTpl = [pickerTpl, rgbTpl];
  task.paint = A;                         // for tests / debugging
  await A.init();
  return A;
}

/** C printf-ish formatting of a Messages string (%s %d %.12s, and %0..%3). */
export function fmt(str, ...args) {
  let i = 0;
  return String(str ?? '').replace(/%(%|\.(\d+)s|[sd]|[0-3])/g, (m, k, prec) => {
    if (k === '%') return '%';
    if (/^[0-3]$/.test(k)) return String(args[+k] ?? '');
    const v = args[i++];
    if (prec) return String(v ?? '').slice(0, +prec);
    return k === 'd' ? String(Math.trunc(v ?? 0)) : String(v ?? '');
  });
}

class PaintApp {
  constructor(task, ctx, msgs, tpl, paintSprites) {
    this.task = task;
    this.ctx = ctx;
    this.msgs = msgs;
    this.tpl = tpl;
    this.paintSprites = paintSprites;     // Map name -> SpriteInfo (toolbox icons, brushes)
    this.files = [];                      // open sprite files (PFile)
    this.fudge = null;                    // Paint's own sprites as a (hidden) file, for brushes
    // main_current_options (initial_options, then Paint$Options)
    this.options = {
      fullInfo: false, useDesktop: true,
      showColours: true, smallColours: false,
      showTools: true,
      zoom: { mul: 1, div: 1 },
      grid: { show: true, colour: 7 },
    };
    this.readOptions();
    // tool options (the tool window's extra fields)
    this.toolOpts = {
      mode: 0, floodLocal: true, exporting: false,
      text: { text: '', xsize: '8', ysize: '8', xspace: '8' },
      spray: { density: '20', radius: '30' },
      brush: { name: 'circle', sprite: null, scale: { xmul: 1, xdiv: 1, ymul: 1, ydiv: 1 }, useGcol: true, fields: { name: '', xm: '1', xd: '1', ym: '1', yd: '1' } },
    };
    this.currentTool = 'pixel';
    this.undoStack = [];
    this.redoStack = [];
    // window stacking positions (main_allocate_position)
    const t = tpl.windows.spritefile.visible;
    this.startX = t.x0 / 2; this.startTop = wimp.height - t.y1 / 2;
    this.nextTop = this.startTop;
  }

  // ------------------------------------------------------------------ messages & errors
  msg(token, ...args) { return fmt(this.msgs[token] ?? token, ...args); }
  error(tokenOrText, ...args) {
    const text = this.msgs[tokenOrText] != null ? this.msg(tokenOrText, ...args) : String(tokenOrText);
    return this.task.reportError(text);
  }

  readOptions() {
    const s = String(os.sysvars?.get?.('Paint$Options') ?? '').trim();
    const o = this.options;
    for (const tok of s.split(/\s+/).filter(Boolean)) {
      const c = tok[0].toUpperCase(), rest = tok.slice(1).toUpperCase();
      if (c === 'D') for (const ch of rest) { if (ch === 'D') o.fullInfo = false; if (ch === 'F') o.fullInfo = true; if (ch === 'W') o.useDesktop = true; if (ch === 'B') o.useDesktop = false; }
      else if (c === 'G') { const m = /(\d+)/.exec(rest); if (m) { o.grid.colour = +m[1] & 15; o.grid.show = true; } if (rest.includes('-')) o.grid.show = false; if (rest.includes('+')) o.grid.show = true; }
      else if (c === 'Z') { const m = /^(\d+):(\d+)/.exec(rest); if (m) { o.zoom = { mul: Math.max(1, +m[1]), div: Math.max(1, +m[2]) }; } }
      else if (c === 'T') { if (rest[0] === '+') o.showTools = true; if (rest[0] === '-') o.showTools = false; }
      else if (c === 'C') for (const ch of rest) { if (ch === '+') o.showColours = true; if (ch === '-') o.showColours = false; if (ch === 'S') o.smallColours = true; if (ch === 'L') o.smallColours = false; }
    }
  }

  // ------------------------------------------------------------------ start up
  async init() {
    const task = this.task;
    this.dialogs = new Dialogs(this);
    this.tools = makeTools(this.toolAPI());
    this.fileWins = new FileWindows(this);
    this.spriteWins = new SpriteWindows(this);
    this.toolWin = new ToolWindow(this);

    this.iconMenu = new Menu(this.msg('Pnt00'), [
      { text: 'Info', submenu: () => this.dialogs.progInfo(), help: this.msgs.ICONB0 },
      { text: 'Snapshot ...', shaded: () => this.dialogs.snapshotActive, action: () => this.dialogs.snapshot(), help: this.msgs.ICONB1 },
      { text: 'Quit', action: () => this.quit(), help: this.msgs.ICONB2 },
    ]);
    this.iconbar = task.addIconbarIcon({
      sprite: this.msgs.BarIcon ?? '!paint',
      onClick: () => this.iconClick(),
      menu: () => this.iconMenu,
      onDataLoad: (ev) => { this.loadFiles(ev.files ?? [{ path: ev.path, filetype: ev.filetype }]); return true; },
      onDataSave: (ev) => { this.receiveData(ev); return true; },
      help: this.msgs.PntH5,
    });

    task.onMessage('DataOpen', (msg) => {
      if (msg.filetype !== SPRITE) return false;
      this.newFile(msg.path);
      return true;
    });
    task.onMessage('DataLoad', (msg) => {
      if (msg.window) return false;
      this.loadFiles(msg.files ?? [{ path: msg.path, filetype: msg.filetype }]);
      return true;
    });
    task.onMessage('PreQuit', (msg) => {
      const n = this.modifiedCount();
      if (!n) return;
      msg.object?.();
      this.dialogs.quitQuery(n).then((ok) => { if (ok) { this.files.slice().forEach((f) => this.fileWins.destroy(f)); task.quit(); } });
    });
    task.onMessage('Quit', () => task.quit());
    task.on('run', ({ file }) => { if (file) this.newFile(file); });
    task.on('quit', () => { this.dialogs.dispose?.(); });

    if (this.ctx.file) await this.newFile(this.ctx.file, { safe: true });
  }

  /** API the painting tools use (see tools.js). */
  toolAPI() {
    const A = this;
    return {
      options: this.toolOpts,
      edited: (s, box) => A.edited(s, box),
      undo: (s) => A.pushUndo(s),
      redisplay: (s) => A.spriteWins.redisplay(s),
      redisplayAll: () => A.spriteWins.redisplayAll(),
      error: (t) => A.error(t),
      desktop: (s) => A.desktop(s),
      exportSprite: (s, x0, y0, x1, y1) => A.exportBlock(s, x0, y0, x1, y1),
    };
  }

  desktop(s) { return s.st?.file?.useDesktop ?? true; }
  nearestColourFor(s, rgb) { return nearestColour(s, rgb, this.desktop(s)); }

  // ------------------------------------------------------------------ sprite state
  /** Attach Paint's per-sprite state (main_sprite) to a sprite. */
  attach(s, file) {
    s.st ??= {};
    Object.assign(s.st, { file });
    s.st.gcol ??= nColours(s) - 1;
    s.st.gcol2 ??= 0;
    s.st.ecfs ??= [null, null, null, null];
    s.st.coloursize ??= this.options.smallColours ? 15 : 30;
    s.st.windows ??= [];
    return s;
  }

  /** Something changed the pixels of s (box in pixels from bottom-left, null = everything). */
  edited(s, box) {
    changed(s);
    spriteEdited(s, box);
    this.setModified(s.st.file);
    this.spriteWins.redisplay(s);
    this.fileWins.redrawSprite(s);
  }

  /** Geometry/palette/mask changed: rebuild everything that shows s. */
  reshaped(s) {
    this.setModified(s.st.file);
    this.spriteWins.reshaped(s);
    this.fileWins.layout(s.st.file, false);
    this.fileWins.redraw(s.st.file);
  }

  setModified(file, on = true) {
    if (!file || file.hidden) return;
    if (file.modified !== on) { file.modified = on; this.fileWins.setTitle(file); }
  }

  modifiedCount() { return this.files.filter((f) => f.modified).length; }

  // ------------------------------------------------------------------ undo (not in the original)
  pushUndo(s) {
    if (!s.st?.file || s.st.file.hidden) return;
    this.undoStack.push({ kind: 'sprite', s, snap: snapshot(s), gcol: s.st.gcol, gcol2: s.st.gcol2 });
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  pushUndoFile(file) {
    this.undoStack.push({ kind: 'file', file, sprites: file.sprites.slice(), snaps: file.sprites.map(snapshot) });
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  _apply(entry, from, to) {
    // record the inverse, then restore
    if (entry.kind === 'sprite') {
      to.push({ kind: 'sprite', s: entry.s, snap: snapshot(entry.s), gcol: entry.s.st.gcol, gcol2: entry.s.st.gcol2 });
      const geomChanged = entry.s.w !== entry.snap.w || entry.s.h !== entry.snap.h || !!entry.s.mask !== !!entry.snap.mask || (entry.s.pal?.length ?? 0) !== (entry.snap.pal?.length ?? 0);
      restore(entry.s, entry.snap);
      const nc = nColours(entry.s);
      if (entry.s.st.gcol > nc || (entry.s.st.gcol === nc && !entry.s.mask)) entry.s.st.gcol = nc - 1;
      this.setModified(entry.s.st.file);
      if (geomChanged) this.reshaped(entry.s);
      else { this.spriteWins.reshaped(entry.s); this.fileWins.redrawSprite(entry.s); }
    } else {
      const f = entry.file;
      to.push({ kind: 'file', file: f, sprites: f.sprites.slice(), snaps: f.sprites.map(snapshot) });
      // sprites no longer in the file lose their windows
      for (const s of f.sprites) if (!entry.sprites.includes(s)) this.spriteWins.closeAll(s);
      f.sprites = entry.sprites.slice();
      f.sprites.forEach((s, i) => restore(s, entry.snaps[i]));
      this.setModified(f);
      for (const s of f.sprites) this.spriteWins.reshaped(s);
      this.fileWins.layout(f, true);
      this.fileWins.redraw(f);
    }
  }
  undo() { const e = this.undoStack.pop(); if (e && this.files.includes((e.s?.st?.file) ?? e.file)) this._apply(e, this.undoStack, this.redoStack); }
  redo() { const e = this.redoStack.pop(); if (e && this.files.includes((e.s?.st?.file) ?? e.file)) this._apply(e, this.redoStack, this.undoStack); }

  // ------------------------------------------------------------------ files
  /** A new, empty sprite file (New_Window). */
  makeFile() {
    const f = { sprites: [], ext: new Uint8Array(0), filename: null, modified: false,
      fullInfo: this.options.fullInfo, useDesktop: this.options.useDesktop, win: null };
    this.files.push(f);
    return f;
  }

  /** main_allocate_position / main_check_position: cascade new windows down the screen. */
  allocatePosition(h) {
    let top = this.nextTop;
    if (top + h > wimp.height - 70) { top = this.startTop; this.nextTop = top; }
    this.nextTop = top + 24;
    return { x: this.startX, y: Math.max(40, top) };
  }

  /** Click on the icon bar icon: a new sprite file with the Create box (main_iconclick). */
  iconClick() {
    const f = this.makeFile();
    this.fileWins.create(f, { open: false });
    this.dialogs.createSprite(f, { auto: true, name: this.msg('PntF7') });
  }

  /** Read a sprite (or JPEG) file into sprites. */
  async readFile(path, filetype) {
    const data = await os.vfs.readFile(path);
    if (filetype === JPEG) return { ext: new Uint8Array(0), sprites: [await this.jpegSprite(data, os.vfs.leaf(path))] };
    if (!isSpriteFile(data)) throw new Error('Bad sprite file');
    return readSpriteFile(data);
  }

  /** Double-click / DataOpen / *Run: load a file into a new window (New_File). */
  async newFile(path, { safe = true } = {}) {
    let st;
    try { st = os.vfs.stat(path); } catch { st = null; }
    if (!st) { this.error(`File '${path}' not found`); return null; }
    const type = st.filetype;
    if (type !== SPRITE && type !== JPEG) { this.error('PntEB', st.name); return null; }
    let sf;
    try { sf = await this.readFile(st.path, type); } catch (e) { this.error(e.message ?? String(e)); return null; }
    const f = this.makeFile();
    f.ext = sf.ext;
    f.sprites = sf.sprites.map((s) => this.attach(s, f));
    if (safe) f.filename = st.path;
    this.fileWins.create(f, { open: true });
    if (f.sprites.length === 1 && !f.sprites[0].bad) this.spriteWins.open(f.sprites[0]);
    return f;
  }

  /** Files dropped on the icon bar: each becomes a new window. */
  loadFiles(files) {
    for (const fl of files) {
      const t = fl.filetype ?? os.vfs.stat(fl.path)?.filetype;
      if (t === SPRITE || t === JPEG) this.newFile(fl.path);
      else this.error('PntEB', os.vfs.leaf(fl.path));
    }
  }

  /** Another application's save box dropped on the icon bar (RAM transfer). */
  async receiveData(ev) {
    if (ev.filetype !== SPRITE && ev.filetype !== JPEG) { this.error('PntEB', ev.leafname); return; }
    const data = await ev.receive();
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    let sf;
    try { sf = ev.filetype === JPEG ? { ext: new Uint8Array(0), sprites: [await this.jpegSprite(bytes, ev.leafname)] } : readSpriteFile(bytes); } catch (e) { this.error(e.message); return; }
    const f = this.makeFile();
    f.ext = sf.ext;
    f.sprites = sf.sprites.map((s) => this.attach(s, f));
    this.fileWins.create(f, { open: true });
    if (f.sprites.length === 1) this.spriteWins.open(f.sprites[0]);
  }

  /** Merge sprites into a file (psprite_merge_area): same-named sprites are replaced. */
  mergeSprites(f, sprites) {
    this.pushUndoFile(f);
    for (const ns of sprites) {
      const i = f.sprites.findIndex((s) => s.name.toLowerCase() === ns.name.toLowerCase());
      if (i >= 0) {
        // the info block (and its windows) moves to the end and takes the new data
        const old = f.sprites.splice(i, 1)[0];
        const st = old.st;
        for (const k of Object.keys(old)) if (k !== 'st') delete old[k];
        Object.assign(old, ns, { st });
        old._ver = (old._ver ?? 0) + 1000; old._palVer = (old._palVer ?? 0) + 1000;
        const nc = nColours(old);
        if (st.gcol > nc || (st.gcol === nc && !old.mask)) st.gcol = nc - 1;
        f.sprites.push(old);
        this.spriteWins.reshaped(old);
      } else f.sprites.push(this.attach(ns, f));
    }
    this.setModified(f);
    this.fileWins.layout(f, true);
    this.fileWins.redraw(f);
  }

  /** Files dropped on a file window: merge them (Load_File with merge). */
  async mergeFiles(f, files) {
    for (const fl of files) {
      const t = fl.filetype ?? os.vfs.stat(fl.path)?.filetype;
      if (t !== SPRITE && t !== JPEG) { this.error('PntEB', os.vfs.leaf(fl.path)); continue; }
      try { const sf = await this.readFile(fl.path, t); this.mergeSprites(f, sf.sprites); } catch (e) { this.error(e.message); }
    }
  }

  /** Bytes of a whole sprite file. */
  fileBytes(f) { return writeSpriteFile({ ext: f.ext, sprites: f.sprites }); }

  /** A single sprite as a sprite file, optionally renamed (buffer_sprite / save_sprite). */
  spriteBytes(s, name = null) {
    let sp = s;
    if (name && name.toLowerCase() !== s.name.toLowerCase()) sp = cloneSprite(s, name.toLowerCase().slice(0, 12));
    return writeSpriteFile({ ext: new Uint8Array(0), sprites: [sp] });
  }

  /** Area size as shown in the file info box. */
  areaSize(f) { return this.fileBytes(f).length + 4; }
  spriteSize(s) { return encodeSprite(s).length; }

  /** Saved (whole file) to `path`. */
  fileSaved(f, path) {
    if (path) { f.filename = path; }
    this.setModified(f, false);
    this.fileWins.setTitle(f);
  }

  /** Find a sprite by name in any file (psprite_find), Paint's own sprites last. */
  async findSprite(name) {
    const n = String(name).trim().toLowerCase();
    if (!n) return null;
    for (const f of this.files) { const s = f.sprites.find((q) => q.name.toLowerCase() === n); if (s) return s; }
    const fudge = await this.getFudge();
    return fudge.sprites.find((q) => q.name.toLowerCase() === n) ?? null;
  }

  /** Paint's own sprite file (brush shapes etc.) decoded from the assets. */
  async getFudge() {
    if (this.fudge) return this.fudge;
    const f = { sprites: [], hidden: true, useDesktop: true };
    const j = await fetch('assets/sprites/Paint/Sprites.json').then((r) => r.json()).catch(() => ({}));
    for (const [name, e] of Object.entries(j)) {
      try {
        const img = new Image();
        img.src = `assets/sprites/Paint/${e.file}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = e.w; c.height = e.h;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, e.w, e.h).data;
        const lb = { 1: 0, 2: 1, 4: 2, 8: 3 }[e.bpp] ?? 2;
        const mode = e.xeig === 1 && e.yeig === 2 ? [0, 8, 12, 15][lb] : e.xeig === 2 ? [4, 1, 9, 13][lb] : [25, 26, 27, 28][lb];
        const s = newSprite({ name, w: e.w, h: e.h, mode, mask: !!e.hasMask });
        const pal = lb === 0 ? [WIMP_RGB[0], WIMP_RGB[7]] : lb === 1 ? [WIMP_RGB[0], WIMP_RGB[2], WIMP_RGB[4], WIMP_RGB[7]] : WIMP_RGB;
        for (let i = 0; i < e.w * e.h; i++) {
          const a = d[i * 4 + 3];
          if (s.mask) s.mask[i] = a > 0 ? 1 : 0;
          s.px[i] = nearest(pal, [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
        }
        this.attach(s, f);
        f.sprites.push(s);
      } catch { /* skip */ }
    }
    this.fudge = f;
    return f;
  }

  /** Decode a JPEG into a 16M-colour sprite (Paint imports JPEGs as "!newjpeg"-style sprites). */
  async jpegSprite(bytes, leaf) {
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const mode = ((6 << 27) | (90 << 14) | (90 << 1) | 1) >>> 0;
    const s = newSprite({ name: String(leaf).toLowerCase().replace(/[^\x21-\x7e]/g, '').slice(0, 12) || 'jpeg', w: c.width, h: c.height, mode });
    for (let i = 0; i < c.width * c.height; i++) s.px[i] = deepPixel(32, [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    return s;
  }

  /** Copy / Move tool in Export mode: save the block as a sprite called "Export". */
  exportBlock(s, x0, y0, x1, y1) {
    const pw = 1 << s.xeig, ph = 1 << s.yeig;
    const px0 = Math.max(0, Math.floor(x0 / pw)), px1 = Math.min(s.w - 1, Math.floor(x1 / pw));
    const py0 = Math.max(0, Math.floor(y0 / ph)), py1 = Math.min(s.h - 1, Math.floor(y1 / ph));
    if (px1 < px0 || py1 < py0) return;
    const w = px1 - px0 + 1, h = py1 - py0 + 1;
    const e = newSprite({ name: 'export', w, h, mode: s.mode, mask: !!s.mask, pal: s.pal ? s.pal.slice() : null });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = (s.h - 1 - (py0 + y)) * s.w + px0 + x, di = (h - 1 - y) * w + x;
      e.px[di] = s.px[si];
      if (e.mask) e.mask[di] = s.mask[si];
    }
    this.attach(e, null);
    this.dialogs.saveSpriteBox(e, { title: 'Export', standalone: true }).openCentred();
  }

  // ------------------------------------------------------------------ quit
  async quit() {
    const n = this.modifiedCount();
    if (n && !(await this.dialogs.quitQuery(n))) return;
    for (const f of this.files.slice()) this.fileWins.destroy(f);
    this.task.quit();
  }
}
