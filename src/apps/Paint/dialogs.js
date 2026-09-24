// Paint's dialogue boxes, built from its own Templates file: Create new sprite (c.PSprite
// psprite_create_show), About this program / file / sprite, Save as (sprite file, sprite,
// palette), Sprite size, How many?, Select colour pattern, Magnifier (zoom), Print, the close
// and quit queries, and the Screen snapshot box.

import { wimp } from '../../core/wimp.js';
import { saveAs } from '../../core/dialogs.js';
import { input } from '../../core/input.js';
import { os } from '../../core/os.js';
import { spritesFromFile } from '../../core/sprites.js';
import { newSprite } from './spritefile.js';
import { stdPaletteWords, ENTRIES, spritePalette, nearest, deepPixel, translation } from './colours.js';
import * as ops from './ops.js';
import { Picker } from './picker.js';

const MODES_1x2 = [0, 8, 12, 15], MODES_2x2 = [-1, 1, 9, 13], MODES_1x1 = [25, 26, 27, 28];

// The screen mode Paint's defaults come from: 256 colours, 90 x 90 dpi (like MODE 28).
const SCREEN = { lb: 3, xeig: 1, yeig: 1 };

export class Dialogs {
  constructor(A) {
    this.A = A;
    this.create = null;
    this.snapshotActive = false;
  }

  win(name, overrides = {}) { return this.A.task.createWindowFromTemplate(this.A.tpl, name, overrides); }

  /** A dialogue used as a submenu: rebuilt each time it is opened, deleted when closed. */
  menuBox(w) {
    w.on('menuclosed', () => setTimeout(() => { if (!w._menuDbox && !w._keep) w.delete(); }, 0));
    return w;
  }

  // ------------------------------------------------------------------ info boxes
  progInfo() {
    const A = this.A;
    const w = this.menuBox(this.win('progInfo'));
    w.icons[1].setText(A.msg('Pnt00'));
    w.icons[2].setText(A.msg('PntM2'));
    w.icons[3].setText(A.msg('PntM1'));
    w.icons[4].setText(A.msg('PntID'));
    w.helpText = A.msgs.PntH8;
    return w;
  }

  fileInfo(f) {
    const A = this.A;
    const w = this.menuBox(this.win('fileInfo'));
    w.icons[0].setText(f.filename ?? A.msg('PntF4'));
    w.icons[1].setText(String(f.sprites.length));
    w.icons[2].setText(A.msg(f.modified ? 'PntG3' : 'PntG4'));
    w.icons[3].setText(String(A.areaSize(f)));
    w.helpText = A.msgs.PntH9;
    return w;
  }

  spriteInfo(s) {
    const A = this.A;
    if (!s) return null;
    const w = this.menuBox(this.win('spriteInfo'));
    const I = w.icons;
    I[1].setText(s.name);
    if (s.mode >>> 0 < 256) { I[11].setText(A.msg('PntWB')); I[2].setText(String(s.mode)); }
    else { I[11].setText(A.msg('PntWC')); I[2].setText(['2', '4', '16', '256', '32k', '16M'][(s.mode >>> 27) - 1] ?? '?'); }
    I[3].setText(A.msg(s.mask ? 'PntG3' : 'PntG4'));
    I[4].setText(s.bad ? '?' : String(s.w));
    I[5].setText(s.bad ? '?' : String(s.h));
    I[6].setText(A.msg(s.pal && s.pal.length ? 'PntG3' : 'PntG4'));
    I[7].setText(String(A.spriteSize(s)));
    w.helpText = A.msgs.PntHA;
    return w;
  }

  printBox(s) {
    const A = this.A;
    const w = this.menuBox(this.win('Printing'));
    const I = w.icons;
    const P = this.printSettings;   // like the static print_copies / print_scale / menus_print_where in c.Menus
    I[1].setText(String(P.copies));
    I[P.landscape ? 3 : 2].setState({ selected: true });
    I[4].setText(os.printers?.current?.name ?? A.msg('PntW9'));
    [I[7], I[9], I[11], I[13]].forEach((ic, i) => ic.setText(String(P.scale[i])));
    I[P.cm ? 19 : 18].setState({ selected: true });
    const unit = () => (P.cm ? 2.54 : 1);
    I[15].setText((P.x / unit()).toFixed(2)); I[17].setText((P.y / unit()).toFixed(2));
    const read = () => {
      P.copies = Math.max(1, parseInt(I[1].text, 10) || 1);
      P.landscape = I[3].selected;
      P.scale = [I[7], I[9], I[11], I[13]].map((ic) => Math.max(1, parseInt(ic.text, 10) || 1));
      P.cm = I[19].selected;
      P.x = (parseFloat(I[15].text) || 0) * unit(); P.y = (parseFloat(I[17].text) || 0) * unit();
    };
    w.on('click', (ev) => { if (ev.icon === I[0] && ev.button !== 'menu') { read(); wimp.menus.close(); this.print(s); } });
    w.on('key', (ev) => { if (ev.code === 13) { read(); wimp.menus.close(); this.print(s); return true; } });
    w.helpText = A.msgs.PntHB;
    return w;
  }

  get printSettings() { return (this.A._print ??= { copies: 1, landscape: false, scale: [1, 1, 1, 1], cm: false, x: 0, y: 0 }); }

  /** Print a sprite through !Printers (os.printers) at its true size (180 OS units per inch) times the scale. */
  async print(s) {
    const A = this.A, P = this.printSettings;
    if (!os.printers?.current) { A.error('PntE9'); return false; }
    if (!s) return false;
    const out = os.printers.print({   // called synchronously from the click, so the output window may open
      title: s.name,
      html: (async () => {
        const sp = spritesFromFile(A.spriteBytes(s)).values().next().value;
        const c = await sp.canvas();
        const wIn = (sp.osW / 180) * P.scale[0] / P.scale[1], hIn = (sp.osH / 180) * P.scale[2] / P.scale[3];
        const img = `<img class="pic" src="${c.toDataURL()}" style="position:relative;left:${P.x}in;top:${P.y}in;width:${wIn.toFixed(3)}in;height:${hIn.toFixed(3)}in;image-rendering:pixelated">`;
        return Array.from({ length: P.copies }, () => `<div style="break-after:page">${img}</div>`).join('');
      })(),
      css: P.landscape ? '@page { size: landscape }' : '',
    });
    return out;
  }

  // ------------------------------------------------------------------ save boxes
  saveFileBox(f, { onSaved } = {}) {
    const A = this.A;
    return saveAs({
      task: A.task, filename: f.filename ?? A.msg('PntF1'), filetype: 0xFF9,
      getData: async () => A.fileBytes(f),
      onSaved: (path, info) => { if (path && !info?.toApp) A.fileSaved(f, path); onSaved?.(path); },
    });
  }

  saveSpriteBox(s, { title } = {}) {
    const A = this.A;
    if (!s) return null;
    const box = saveAs({
      task: A.task, title: title ? 'Save as' : undefined, filename: s.name, filetype: 0xFF9,
      getData: async () => A.spriteBytes(s),
    });
    return box;
  }

  savePaletteBox(s) {
    const A = this.A;
    return saveAs({ task: A.task, filename: A.msg('PntG5'), filetype: 0xFED, getData: async () => paletteFile(s, A.desktop(s)) });
  }

  // ------------------------------------------------------------------ queries
  /** The "close" box: Save / Discard / Cancel. */
  closeQuery(text) {
    return new Promise((resolve) => {
      const w = this.win('close');
      const I = w.icons;
      I[1].setText(text);
      const done = (v) => { w.delete(); resolve(v); };
      w.on('click', (ev) => {
        if (ev.button === 'menu') return;
        if (ev.icon === I[0]) done('save'); else if (ev.icon === I[2]) done('discard'); else if (ev.icon === I[3]) done('cancel');
      });
      w.on('key', (ev) => { if (ev.code === 13) done('save'); else if (ev.code === 27) done('cancel'); return true; });
      w.on('close', (ev) => { ev.preventDefault(); done('cancel'); });
      w.helpText = this.A.msgs.CLOSE;
      w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
      wimp.setCaret(w);
    });
  }

  /** The "quit" box: n sprite files modified - Discard / Cancel. Resolves true to discard. */
  quitQuery(n) {
    return new Promise((resolve) => {
      const A = this.A;
      const w = this.win('quit');
      const I = w.icons;
      I[1].setText(n === 1 ? A.msg('PntF5') : A.msg('PntF6', n));
      const done = (v) => { w.delete(); resolve(v); };
      w.on('click', (ev) => { if (ev.button === 'menu') return; if (ev.icon === I[0]) done(true); else if (ev.icon === I[2]) done(false); });
      w.on('key', (ev) => { if (ev.code === 13) done(true); else if (ev.code === 27) done(false); return true; });
      w.on('close', (ev) => { ev.preventDefault(); done(false); });
      w.helpText = A.msgs.QUIT;
      w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
      wimp.setCaret(w);
    });
  }

  // ------------------------------------------------------------------ Create new sprite
  /**
   * psprite_create_show. auto: true (from the icon bar: the file window opens when a sprite is
   * made), false (static box), -1 (a menu dialogue box: New sprite >).
   */
  createSprite(f, { auto = false, name = '' } = {}) {
    const A = this.A;
    if (this.create) this.disposeCreate();
    const w = this.win('create');
    const I = w.icons;
    const st = this.create = { w, f, auto };
    const scrW = Math.round(wimp.width), scrH = Math.round(wimp.height);
    I[29].setText(name);
    I[29].bufLen = 13;
    I[15].setState({ selected: false });              // mask wanted (the sprites are inverted)
    I[31].setText(String(scrW)); I[34].setText(String(scrH));
    const sel = (i, on) => I[i].setState({ selected: !!on });
    sel(19, SCREEN.xeig === 2); sel(20, SCREEN.xeig === 1); sel(21, SCREEN.xeig === 0);
    sel(22, SCREEN.yeig === 2); sel(23, SCREEN.yeig === 1); sel(24, SCREEN.yeig === 0);
    sel(1, SCREEN.lb <= 3); sel(2, false); sel(3, SCREEN.lb > 3);
    [8, 9, 10, 11, 12, 13].forEach((ic, lb) => sel(ic, lb === SCREEN.lb));
    const upd = () => {
      const { lb, mode } = this.decode(w);
      I[32].setText(mode >>> 0 < 256 ? String(mode) : '');
      for (const i of [1, 2]) I[i].setState({ shaded: lb > 3 });
    };
    const { mode } = this.decode(w);
    I[32].setText(mode >>> 0 < 256 ? String(mode) : '');
    for (const i of [1, 2]) I[i].setState({ shaded: !(mode >>> 0 < 256) });
    const num = (i) => parseInt(I[i].text, 10) || 0;
    const step = (i, up) => { const v = num(i); if (up) I[i].setText(String(v + 1)); else if (v > 1) I[i].setText(String(v - 1)); };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const adj = ev.button === 'adjust';
      const i = ev.icon ? I.indexOf(ev.icon) : -1;
      if (i === 18) step(34, !adj); else if (i === 16) step(34, adj);
      else if (i === 26) step(31, !adj); else if (i === 25) step(31, adj);
      else if (i === 0) { const ok = this.makeSprite(st); if (ok && !(auto === -1 && adj)) this.disposeCreate(true); }
      else if (i === 28) this.disposeCreate();
      // radio groups keep one selected (Adjust must not clear them)
      if (ev.icon && ev.icon.esg && [2, 3, 4].includes(ev.icon.esg) && !ev.icon.selected) ev.icon.setState({ selected: true });
      if (ev.icon && ev.icon.esg === 1 && i >= 1 && i <= 3 && !ev.icon.selected) ev.icon.setState({ selected: true });
      upd();
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { const ok = this.makeSprite(st); if (ok) this.disposeCreate(true); return true; }
      if (ev.code === 27) { this.disposeCreate(); return true; }
      return false;
    });
    w.on('close', (ev) => { ev.preventDefault(); this.disposeCreate(); });
    w.on('helprequest', (ev) => {
      const i = ev.icon ? I.indexOf(ev.icon) : -1;
      const map = { 15: 'PntH7f', 29: 'PntH7t', 31: 'PntH7v', 34: 'PntH7y', 19: 'PntH7j', 20: 'PntH7k', 21: 'PntH7l', 22: 'PntH7m', 23: 'PntH7n', 24: 'PntH7o',
        1: 'PntH71', 2: 'PntH72', 3: 'PntH73', 8: 'PntH78', 9: 'PntH79', 10: 'PntH7a', 11: 'PntH7b', 12: 'PntH7c', 13: 'PntH7d', 16: 'PntH7i', 18: 'PntH7g', 25: 'PntH7p', 26: 'PntH7q' };
      ev.text = A.msgs[map[i] ?? 'PntH7'];
    });
    if (auto === -1) {
      w.on('menuclosed', () => setTimeout(() => { if (this.create?.w === w && !w._menuDbox) this.disposeCreate(); }, 0));
      return w;
    }
    w.open({ behind: 'top' });
    wimp.setCaret(w, I[29], I[29].text.length);
    return w;
  }

  /** Decode: colours / dpi radio buttons -> log2bpp and mode word. */
  decode(w) {
    const I = w.icons;
    const lb = [8, 9, 10, 11, 12, 13].findIndex((i) => I[i].selected);
    const xeig = I[21].selected ? 0 : I[20].selected ? 1 : 2;
    const yeig = I[24].selected ? 0 : I[23].selected ? 1 : 2;
    let mode = -1;
    const L = Math.max(0, lb);
    if (L <= 3) {
      if (xeig === 1 && yeig === 1) mode = MODES_1x1[L];
      else if (xeig === 1 && yeig === 2) mode = MODES_1x2[L];
      else if (xeig === 2 && yeig === 2) mode = MODES_2x2[L];
    }
    if (mode < 0) mode = ((((L + 1) << 27) | ((180 >> yeig) << 14) | ((180 >> xeig) << 1) | 1) >>> 0);
    return { lb: L, mode, xeig, yeig };
  }

  disposeCreate(created = false) {
    const st = this.create;
    if (!st) return;
    this.create = null;
    if (st.auto === -1) wimp.menus.close();
    st.w.delete();
    // a file window made from the icon bar that never got a sprite goes away again
    if (!created && st.f && !st.f.win?.isOpen && !st.f.sprites.length) {
      st.f.win?.delete();
      this.A.files = this.A.files.filter((q) => q !== st.f);
    }
  }
  closeCreateFor(f) { if (this.create?.f === f) this.disposeCreate(); }

  /** create_create_sprite. Returns true if a sprite was made. */
  makeSprite(st) {
    const A = this.A, w = st.w, I = w.icons, f = st.f;
    const name = I[29].text.trim().toLowerCase();
    if (!name) { A.error('PntE7'); return false; }
    if (f.sprites.some((q) => q.name.toLowerCase() === name)) { A.error('PntE6', name); return false; }
    const width = parseInt(I[31].text, 10) || 0, height = parseInt(I[34].text, 10) || 0;
    if (width <= 0 || height <= 0) { A.error('PntEA'); return false; }
    if (width * height > 64e6) { A.error('PntEG'); return false; }
    const { lb, mode } = this.decode(w);
    const wantPal = lb <= 3 && !I[3].selected;
    const mono = wantPal && I[2].selected;
    const wantMask = !I[15].selected;
    let pal = null;
    if (wantPal) {
      const N = [0xFFFFFF, 0x555555, 0x111111, 0x010101];
      const words = mono
        ? Array.from({ length: 1 << (1 << lb) }, (_, i) => ((i * N[lb]) << 8) >>> 0)
        : stdPaletteWords(lb, f.useDesktop).slice(0, ENTRIES(lb));
      pal = new Uint32Array(words.length * 2);
      words.forEach((wd, i) => { pal[2 * i] = pal[2 * i + 1] = wd >>> 0; });
    }
    const s = newSprite({ name, w: width, h: height, mode, mask: wantMask, pal });
    A.attach(s, f);
    // make it white (rather than 0 pixels)
    const white = s.bpp > 8 ? deepPixel(s.bpp, [255, 255, 255]) : nearest(spritePalette(s, f.useDesktop), [255, 255, 255]);
    s.px.fill(white);
    A.pushUndoFile(f);
    f.sprites.push(s);
    A.setModified(f);
    if (!f.win.isOpen) { f.lastCols = 0; A.fileWins.layout(f, true); f.win.open({ behind: 'top' }); }
    else { f.lastCols = 0; A.fileWins.layout(f, false); }
    A.fileWins.redraw(f);
    A.spriteWins.open(s);
    return true;
  }

  // ------------------------------------------------------------------ sprite size, how many, ECF
  spriteSize(s) {
    const A = this.A;
    const w = this.menuBox(this.win('spritesize'));
    const I = w.icons;
    I[6].setText(String(s.w)); I[7].setText(String(s.h));
    const num = (i) => parseInt(I[i].text, 10) || 0;
    const go = (keep) => {
      const cols = num(6), rows = num(7);
      if (!rows || !cols) { A.error('PntEA'); return; }
      A.spriteWins.op(s, () => { ops.adjustSize(s, cols, rows); return null; }, true);
      if (!keep) wimp.menus.close();
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const adj = ev.button === 'adjust';
      const i = ev.icon ? I.indexOf(ev.icon) : -1;
      const step = (k, up) => { const v = num(k); if (up) I[k].setText(String(v + 1)); else if (v > 1) I[k].setText(String(v - 1)); };
      if (i === 4) step(7, !adj); else if (i === 2) step(7, adj);
      else if (i === 5) step(6, !adj); else if (i === 3) step(6, adj);
      else if (i === 0) go(adj);
    });
    w.on('key', (ev) => { if (ev.code === 13) { go(false); return true; } return false; });
    w.helpText = A.msgs.PntHD;
    return w;
  }

  numberBox() {
    const w = this.menuBox(this.win('number'));
    return w;
  }

  selectECF(s) {
    const A = this.A;
    const w = this.menuBox(this.win('selectECF'));
    const I = w.icons;
    I[2].setText(''); I[2].bufLen = 13;
    const go = async (keep) => {
      const k = [4, 5, 6, 7].findIndex((i) => I[i].selected);
      if (k < 0) return;
      const e = await A.findSprite(I[2].text);
      if (!e) { A.error('PntE5b'); return; }
      setupECF(s, k, e, A.desktop(s));
      A.spriteWins.colourExtent(s);
      if (!keep) wimp.menus.close();
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.icon && [4, 5, 6, 7].includes(I.indexOf(ev.icon)) && !ev.icon.selected) ev.icon.setState({ selected: true });
      if (ev.icon === I[0]) go(ev.button === 'adjust');
    });
    w.on('key', (ev) => { if (ev.code === 13) { go(false); return true; } return false; });
    w.helpText = A.msgs.PntHC;
    return w;
  }

  // ------------------------------------------------------------------ zoom (RISC_OSLib magnify_select)
  zoomBox(sw) {
    const A = this.A;
    const w = this.menuBox(this.win('magnifier'));
    const I = w.icons;
    I[0].setText(String(sw.zoom.mul)); I[1].setText(String(sw.zoom.div));
    const apply = () => {
      const m = Math.max(1, Math.min(999, parseInt(I[0].text, 10) || 1)), d = Math.max(1, Math.min(999, parseInt(I[1].text, 10) || 1));
      if (m === sw.zoom.mul && d === sw.zoom.div) return;
      this.setZoom(sw, m, d);
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon ? I.indexOf(ev.icon) : -1;
      const adj = ev.button === 'adjust';
      const step = (k, up) => { const v = parseInt(I[k].text, 10) || 1; I[k].setText(String(Math.max(1, Math.min(999, v + (up ? 1 : -1))))); };
      if (i === 2) step(0, !adj); else if (i === 3) step(0, adj); else if (i === 4) step(1, !adj); else if (i === 5) step(1, adj); else return;
      apply();
    });
    w.on('key', (ev) => { if (ev.code === 13) { apply(); wimp.menus.close(); return true; } return false; });
    w.on('iconchanged', () => apply());
    w.helpText = A.msgs.MAGNIFIER;
    return w;
  }

  /** showmag: new zoom factor, window scaled so the same point stays at the top left. */
  setZoom(sw, mul, div) {
    const A = this.A, w = sw.win;
    const m = sw.zoom.mul, d = sw.zoom.div;
    sw.zoom = { mul, div };
    A.options.zoom = { mul, div };
    const k = (d * mul) / (m * div);
    const ext = A.spriteWins.extent(sw);
    w.extent = { x0: 0, y0: 0, x1: ext.w, y1: ext.h };
    w.open({ w: Math.round(w.w * k), h: Math.round(w.h * k), scrollX: Math.round(w.scrollX * k), scrollY: Math.round(w.scrollY * k), behind: 'keep' });
    w.invalidate();
  }

  // ------------------------------------------------------------------ colour picker
  picker(opts) { return new Picker(this.A, opts); }

  // ------------------------------------------------------------------ snapshot
  snapshot() {
    const A = this.A;
    if (this.snapshotActive) { A.error('PntHF'); return; }
    const w = this.win('snapshot');
    const I = w.icons;
    const o = this.snapOpts ??= { delay: false, secs: 10, whole: false, timer: true };
    I[2].setState({ selected: !o.delay }); I[3].setState({ selected: o.delay });
    I[4].setText(String(o.secs)); I[4].setState({ shaded: !o.delay });
    I[5].setState({ selected: o.whole }); I[6].setState({ selected: o.timer });
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.icon === I[2]) I[3].setState({ selected: !I[2].selected });
      if (ev.icon === I[3]) I[2].setState({ selected: !I[3].selected });
      I[4].setState({ shaded: !I[3].selected });
      if (ev.icon === I[0]) {
        Object.assign(o, { delay: I[3].selected, secs: parseInt(I[4].text, 10) || 0, whole: I[5].selected, timer: I[6].selected });
        w.delete();
        this.takeSnapshot(o);
      }
    });
    w.on('close', (ev) => { ev.preventDefault(); w.delete(); });
    w.helpText = A.msgs.PntHE;
    w.open({ behind: 'top' });
    wimp.setCaret(w);
  }

  async takeSnapshot(o) {
    const A = this.A;
    this.snapshotActive = true;
    try {
      const { grabScreen } = await import('./snapshot.js');
      let box = { x0: 0, y0: 0, x1: wimp.width, y1: wimp.height };
      if (!o.whole) { box = await this.snapBox(); if (!box) return; }
      if (o.delay && o.secs > 0) await this.countdown(o);
      const s = await grabScreen(box, A.msg('PntF8'));
      if (!s) return;
      A.attach(s, null);
      this.saveSpriteBox(s).openCentred();
    } catch (e) { A.error(e.message ?? String(e)); } finally { this.snapshotActive = false; }
  }

  /** get_snapshot_box: drag a rectangle with the "grab" pointer. */
  snapBox() {
    return new Promise((resolve) => {
      const shield = document.createElement('div');
      shield.style.cssText = 'position:absolute;inset:0;z-index:200000;cursor:crosshair';
      const grab = this.A.paintSprites.get('grabptr');
      if (grab) shield.style.cursor = `url("${grab.url}") 7 7, crosshair`;
      wimp.screen.appendChild(shield);
      const box = document.createElement('div');
      box.className = 'drag-box';
      box.style.cssText = 'position:absolute;display:none;border:1px dashed #fff;mix-blend-mode:difference;pointer-events:none';
      shield.appendChild(box);
      let start = null;
      const key = (e) => { if (e.key === 'Escape') { finish(null); } };
      const finish = (r) => { shield.remove(); window.removeEventListener('keydown', key, true); resolve(r); };
      shield.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); start = input.pos(e); box.style.display = ''; });
      shield.addEventListener('pointermove', (e) => {
        if (!start) return;
        const p = input.pos(e);
        box.style.left = Math.min(p.x, start.x) + 'px'; box.style.top = Math.min(p.y, start.y) + 'px';
        box.style.width = Math.abs(p.x - start.x) + 'px'; box.style.height = Math.abs(p.y - start.y) + 'px';
      });
      shield.addEventListener('pointerup', (e) => {
        if (!start) return;
        const p = input.pos(e);
        finish({ x0: Math.min(p.x, start.x), y0: Math.min(p.y, start.y), x1: Math.max(p.x, start.x), y1: Math.max(p.y, start.y) });
      });
      window.addEventListener('keydown', key, true);
    });
  }

  countdown(o) {
    return new Promise((resolve) => {
      let left = o.secs;
      let w = null;
      if (o.timer) {
        w = this.win('snpshottime');
        w.icons[1].setText(String(left));
        w.on('click', (ev) => { if (ev.icon === w.icons[2]) { clearInterval(t); w.delete(); this.snapshotActive = false; resolve(Promise.reject(new Error('cancelled'))); } });
        w.open({ behind: 'top' });
      }
      const t = setInterval(() => {
        left--;
        if (w) w.icons[1].setText(String(left));
        if (left <= 1 && w) { w.delete(); w = null; }
        if (left <= 0) { clearInterval(t); setTimeout(resolve, 50); }
      }, 1000);
    });
  }
}

/** build_sprite_palette_file: VDU 19 sequences (+ border and pointer colours for 16 entries). */
export function paletteFile(s, desktop) {
  let words;
  if (s.pal && s.pal.length) words = Array.from({ length: s.pal.length >> 1 }, (_, i) => s.pal[2 * i]);
  else {
    const lb = { 1: 0, 2: 1, 4: 2, 8: 3 }[s.bpp];
    words = stdPaletteWords(lb, desktop).slice(0, ENTRIES(lb));
  }
  const out = [];
  words.forEach((w, i) => out.push(19, i, 16, (w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255));
  if (words.length === 16) {
    const extra = [[0, 0, 0], [0, 255, 255], [0, 0, 0x99], [255, 0, 0]];
    extra.forEach(([r, g, b], i) => out.push(19, i, i === 0 ? 24 : 25, r, g, b));
  }
  return new Uint8Array(out);
}

/** psprite_setup_ecf: pattern k of sprite s from the bottom-left 8 x 8 pixels of e. */
export function setupECF(s, k, e, desktop) {
  const tr = translation(e, s, desktop);
  const pat = new Uint32Array(64);
  for (let r = 0; r < 8; r++) for (let x = 0; x < 8; x++) {
    let v = 0;
    if (x < e.w && r < e.h) v = e.px[(e.h - 1 - r) * e.w + x];
    pat[r * 8 + x] = tr(v);
  }
  s.st.ecfs[k] = { name: e.name, pat };
}

