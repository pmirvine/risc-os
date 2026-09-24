// Wimp SWI bridge: the Wimp_* SWIs for a BASIC program, implemented on the core window manager.
//
// One WimpBridge per BASIC task (created at Wimp_Initialise). It owns a core Task, maps Wimp
// window/icon handles and blocks in the program's memory onto core Windows/Icons, turns core
// window events into a Wimp_Poll event queue (the program's SYS Wimp_Poll suspends until an
// event is available: cooperative scheduling), and runs redraw loops by drawing with the
// program's own VDU (a DesktopVDU the size of the desktop) and copying each redraw rectangle
// into the window's canvas (screen.js). Coordinates: Wimp blocks use OS units with the origin
// at the bottom-left of the screen (1 desktop pixel = 2 OS units); the core uses pixels, y down.

import { os } from '../os.js';
import { wimp } from '../wimp.js';
import { vfs } from '../vfs.js';
import { sysvars } from '../sysvars.js';
import { input } from '../input.js';
import { Menu } from '../menu.js';
import { Window } from '../window.js';
import { IF } from '../templates.js';
import { Icon } from '../icons.js';
import { sprites as wimpSprites } from '../sprites.js';
import { fonts as desktopFonts, textWidth } from '../fonts.js';
import { BasicError } from '../../basic/errors.js';
import { WindowCanvas, wimpRGB, rectAnd, rectEmpty, rectListAdd, rectListSub } from './screen.js';
import { TemplateFile, loadTemplate } from './templates.js';
import { rdCtrl, wrStr0, WIMP_POOL_ROM, WIMP_POOL_RAM, resolveSprite, plotSprite, paintText, pixelToGcol } from './services.js';

const u32 = (x) => x >>> 0;
const WF_NEW = 1 << 31;
let handleSeq = 0;
let myRefSeq = 0x100;
const bridges = new Set();

// Message numbers
const MSG = { Quit: 0, DataSave: 1, DataSaveAck: 2, DataLoad: 3, DataLoadAck: 4, DataOpen: 5, RAMFetch: 6, RAMTransmit: 7, PreQuit: 8, PaletteChange: 9, SaveDesktop: 10, DeviceClaim: 11, Shutdown: 14, HelpRequest: 0x502, HelpReply: 0x503, MenuWarning: 0x400C0, ModeChange: 0x400C1, TaskInitialise: 0x400C2, TaskCloseDown: 0x400C3, MenusDeleted: 0x400C9, IconizeAt: 0x400D0 };

// ============================================================================================
// SWI registration (on every desktop BASIC machine; most need Wimp_Initialise first)
// ============================================================================================
export function installWimpSwis(m, proc) {
  const pre = () => (proc._pre ??= new WimpBridge(proc));
  const need = () => {
    if (proc.bridge) return proc.bridge;
    throw new BasicError(0x283, 'Wimp_Initialise has not been called');
  };
  const W = (name, fn, anytime = false) => m.registerSwi(name, (r, mm, ctx) => fn(anytime ? (proc.bridge ?? pre()) : need(), r, ctx));
  W('Wimp_Initialise', (b, r) => { proc.bridge = b; return b.initialise(r); }, true);
  W('Wimp_CloseDown', (b, r) => b.closeDown(false), true);
  W('Wimp_CreateWindow', (b, r) => b.createWindow(r));
  W('Wimp_CreateIcon', (b, r) => b.createIcon(r));
  W('Wimp_DeleteWindow', (b, r) => b.deleteWindow(r));
  W('Wimp_DeleteIcon', (b, r) => b.deleteIcon(r));
  W('Wimp_OpenWindow', (b, r) => b.openWindow(r));
  W('Wimp_CloseWindow', (b, r) => b.closeWindow(r));
  W('Wimp_Poll', (b, r) => b.poll(r, false));
  W('Wimp_PollIdle', (b, r) => b.poll(r, true));
  W('Wimp_RedrawWindow', (b, r) => b.redrawWindow(r));
  W('Wimp_UpdateWindow', (b, r) => b.updateWindow(r));
  W('Wimp_GetRectangle', (b, r) => b.getRectangle(r));
  W('Wimp_GetWindowState', (b, r) => b.getWindowState(r));
  W('Wimp_GetWindowInfo', (b, r) => b.getWindowInfo(r));
  W('Wimp_SetIconState', (b, r) => b.setIconState(r));
  W('Wimp_GetIconState', (b, r) => b.getIconState(r));
  W('Wimp_GetPointerInfo', (b, r) => b.getPointerInfo(r), true);
  W('Wimp_DragBox', (b, r) => b.dragBox(r));
  W('Wimp_ForceRedraw', (b, r) => b.forceRedraw(r));
  W('Wimp_SetCaretPosition', (b, r) => b.setCaretPosition(r));
  W('Wimp_GetCaretPosition', (b, r) => b.getCaretPosition(r), true);
  W('Wimp_CreateMenu', (b, r) => b.createMenu(r));
  W('Wimp_CreateSubMenu', (b, r) => b.createSubMenu(r));
  W('Wimp_DecodeMenu', (b, r) => b.decodeMenu(r), true);
  W('Wimp_GetMenuState', (b, r) => b.getMenuState(r));
  W('Wimp_WhichIcon', (b, r) => b.whichIcon(r));
  W('Wimp_SetExtent', (b, r) => b.setExtent(r));
  W('Wimp_SetPointerShape', () => {}, true);
  W('Wimp_OpenTemplate', (b, r) => b.openTemplate(r), true);
  W('Wimp_CloseTemplate', (b) => { b.templates = null; }, true);
  W('Wimp_LoadTemplate', (b, r) => loadTemplate(b.templates, r, m, (n, xs, ys) => proc.fonts.find(n, xs, ys)), true);
  W('Wimp_ProcessKey', (b, r) => b.processKey(r), true);
  W('Wimp_StartTask', (b, r) => b.startTask(r), true);
  W('Wimp_ReportError', (b, r) => b.reportError(r), true);
  W('Wimp_GetWindowOutline', (b, r) => b.getWindowOutline(r));
  W('Wimp_PlotIcon', (b, r) => b.plotIcon(r));
  W('Wimp_SetMode', () => {}, true);
  W('Wimp_SetPalette', () => {}, true);
  W('Wimp_ReadPalette', (b, r) => b.readPalette(r), true);
  W('Wimp_SetColour', (b, r) => b.setColour(r[0], false), true);
  W('Wimp_TextColour', (b, r) => b.setColour(r[0], true), true);
  W('Wimp_SendMessage', (b, r) => b.sendMessage(r));
  W('Wimp_SpriteOp', (b, r) => { r[0] = (r[0] & 0xFF) | 0x100; r[1] = WIMP_POOL_RAM; return m.callSwiByName('OS_SpriteOp', r); }, true);
  W('Wimp_BaseOfSprites', (b, r) => { r[0] = WIMP_POOL_ROM; r[1] = WIMP_POOL_RAM; }, true);
  W('Wimp_BlockCopy', (b, r) => b.blockCopy(r));
  W('Wimp_SlotSize', (b, r) => b.slotSize(r), true);
  W('Wimp_ReadPixTrans', (b, r) => b.readPixTrans(r), true);
  W('Wimp_ClaimFreeMemory', (b, r) => { r[1] = 0; }, true);
  W('Wimp_CommandWindow', () => {}, true);
  W('Wimp_TextOp', (b, r) => b.textOp(r), true);
  W('Wimp_ResizeIcon', (b, r) => b.resizeIcon(r));
  W('Wimp_SetWatchdogState', () => {}, true);
  W('Wimp_Extend', (b, r) => { r[0] = 0; }, true);
  W('Wimp_RegisterFilter', () => {}, true);
  W('Wimp_AddMessages', () => {}, true);
  W('Wimp_RemoveMessages', () => {}, true);
  W('Wimp_SetColourMapping', () => {}, true);
  W('Wimp_TransferBlock', (b, r) => b.transferBlock(r));
  W('Wimp_SetFontColours', (b, r) => { proc.setFontColoursRGB?.(wimpRGB(r[1]), wimpRGB(r[2])); }, true);
  W('Wimp_ReadSysInfo', (b, r) => b.readSysInfo(r), true);
}

// ============================================================================================
export class WimpBridge {
  constructor(proc) {
    this.proc = proc;
    this.m = proc.machine;
    this.M = proc.machine.mem;
    this.recs = new Map();       // handle -> rec
    this.byWin = new Map();      // core Window -> rec
    this.ib = new Map();         // iconbar icon handle -> item
    this.events = [];
    this.pollWait = null;
    this.redraw = null;
    this.inRedraw = false;
    this.templates = null;
    this.helpCache = new Map();
    this.alive = false;
    this.buttons = 0;
  }

  get vdu() { return this.m.vdu; }
  get H() { return wimp.height; }

  // ------------------------------------------------------------------ coordinates
  osX(px) { return Math.round(px * 2); }
  osY(py) { return Math.round((this.H - py) * 2); }
  pxX(ox) { return Math.floor(ox / 2); }
  pxY(oy) { return this.H - Math.ceil(oy / 2); }
  pointerOS() { return { x: input.mouseX * 2, y: (this.H - 1 - input.mouseY) * 2 }; }

  // ------------------------------------------------------------------ task
  initialise(r) {
    const M = this.M;
    const version = r[0];
    const name = rdCtrl(this.m, r[2], 64) || 'BASIC';
    if (this.task?.alive) { r[0] = version; r[1] = this.task.handle; return; }
    const proc = this.proc;
    this.task = wimp.createTask(name, { memory: proc.slotK, app: proc.appDesc ?? null });
    this.task.basicProcess = proc;
    this.alive = true;
    bridges.add(this);
    this.task.on('quit', () => this._coreQuit());
    // messages from the core / other tasks
    this.task.onMessage('Quit', () => { this.queueMessage(MSG.Quit, [], 17); return true; });
    this.task.onMessage('PreQuit', (msg) => { this.queueMessage(MSG.PreQuit, [msg.single ? 1 : 0], 18); });
    this.task.onMessage('ModeChange', () => { this.queueMessage(MSG.ModeChange, [], 17); });
    this.task.onMessage('MenusDeleted', () => { if (this._menusDeletedPending) { this._menusDeletedPending = false; this.queueMessage(MSG.MenusDeleted, [this.menuPtr ?? 0], 17); } });
    this.task.onMessage('DataLoad', (msg) => { if (msg.window && this.byWin.has(msg.window)) return; this.dataLoadMessage(msg, -2, msg.icon?._ib ? msg.icon.handle : -1); return true; });
    this.task.onMessage('DataOpen', (msg) => { this.dataLoadMessage(msg, 0, -1, MSG.DataOpen); return false; });
    this._installGlobalListeners();
    this.vduBytes([5]);                 // the desktop plots text at the graphics cursor
    r[0] = 310;
    r[1] = this.task.handle;
    // messages list (R3) ignored: every message is delivered
  }

  _installGlobalListeners() {
    const bits = (b) => ((b & 1) ? 4 : 0) | ((b & 4) ? 2 : 0) | ((b & 2) ? 1 : 0);
    const m = this.m;
    this._listeners = [
      ['pointerdown', (e) => { this.buttons = bits(e.buttons); const p = this.pointerOS(); m.setMouse(p.x, p.y, this.buttons); m.keyDown([9, 10, 11][e.button] ?? 9); }],
      ['pointerup', (e) => { this.buttons = bits(e.buttons); const p = this.pointerOS(); m.setMouse(p.x, p.y, this.buttons); m.keyUp([9, 10, 11][e.button] ?? 9); }],
      ['pointermove', (e) => { this.buttons = bits(e.buttons); const p = this.pointerOS(); m.setMouse(p.x, p.y, this.buttons); }],
      ['keydown', (e) => { const k = this.keymap?.internalKey(e); if (k !== undefined) m.keyDown(k); }],
      ['keyup', (e) => { const k = this.keymap?.internalKey(e); if (k !== undefined) m.keyUp(k); }],
    ];
    import('../../basic/keymap.js').then((km) => { this.keymap = km; });
    for (const [t, f] of this._listeners) window.addEventListener(t, f, true);
  }

  /** Wimp_CloseDown, or the program ended (final = true). */
  closeDown(final) {
    if (!this.alive) return;
    this.alive = false;
    bridges.delete(this);
    for (const [t, f] of this._listeners ?? []) window.removeEventListener(t, f, true);
    if (wimp.menus?.owner === this.task) wimp.menus.close();
    for (const rec of this.recs.values()) rec.canvas?.remove();
    this.recs.clear(); this.byWin.clear();
    this._closing = true;
    this.task?.quit();
    this.abortPoll();
  }

  _coreQuit() {
    // the core task was quit (Task Manager "Quit", Shutdown): let the program see Message_Quit
    // first; if it's still running a little later, stop it.
    if (this._closing) return;
    this.alive = false;
    this.recs.clear(); this.byWin.clear();
    this.queueMessage(MSG.Quit, [], 17, true);
    setTimeout(() => { if (!this.proc.ended) this.proc.kill(); }, 1500);
  }

  // ------------------------------------------------------------------ event queue / Wimp_Poll
  queue(code, words, extra = {}) { this.events.push({ code, words, ...extra }); this.kick(); }

  queueMessage(action, words = [], code = 17, force = false, opts = {}) {
    if (!this.alive && !force) return;
    const myRef = ++myRefSeq;
    this.events.push({ code, msg: { action, words, bytes: opts.bytes, sender: opts.sender ?? 0, myRef, yourRef: opts.yourRef ?? 0 } });
    this.kick();
    return myRef;
  }

  abortPoll() {
    const w = this.pollWait;
    if (w) { this.pollWait = null; clearTimeout(w.timer); w.r[0] = 0; w.resolve(); }
  }

  poll(r, idle) {
    this.proc.taskStarted();
    this.syncFromMemory();
    const mask = r[0] >>> 0, block = u32(r[1]);
    const due = idle ? r[2] | 0 : null;
    if (this.redraw) this._endRedraw();
    return new Promise((resolve) => {
      this.pollWait = { r, mask, block, due, resolve, t0: performance.now() };
      if (!this.tryDeliver()) {
        if (!(mask & 1)) {
          const ms = idle ? Math.max(0, (due - this.m.monotonicTime()) * 10) : 1;
          this.pollWait.timer = setTimeout(() => { if (this.pollWait) { this.pollWait.nullDue = true; this.tryDeliver(); } }, Math.min(ms, 60000));
        }
      }
    });
  }

  kick() { if (this.pollWait && !this._kickQueued) { this._kickQueued = true; queueMicrotask(() => { this._kickQueued = false; this.tryDeliver(); }); } }

  tryDeliver() {
    const w = this.pollWait;
    if (!w) return false;
    const ev = this.nextEvent(w.mask, w.nullDue);
    if (!ev) return false;
    this.pollWait = null;
    clearTimeout(w.timer);
    this.writeEvent(ev, w.block);
    w.r[0] = ev.code;
    if (w.due != null) w.r[2] = w.due;
    w.resolve();
    return true;
  }

  nextEvent(mask, nullDue) {
    while (this.events.length) {
      const ev = this.events.shift();
      if (mask & (1 << ev.code)) continue;       // masked out: lost
      return ev;
    }
    if (!(mask & 2)) {
      for (const rec of this.stackOrder()) if (this.needsRedraw(rec)) return { code: 1, words: [rec.handle] };
    }
    if (!(mask & 1) && nullDue) return { code: 0, words: [] };
    return null;
  }

  writeEvent(ev, p) {
    const M = this.M;
    if (ev.msg) {
      const g = ev.msg;
      const data = g.bytes ?? null;
      const len = 20 + (data ? data.length : g.words.length * 4);
      const size = (len + 3) & ~3;
      M.wr32(p, size); M.wr32(p + 4, g.sender); M.wr32(p + 8, g.myRef); M.wr32(p + 12, g.yourRef); M.wr32(p + 16, g.action);
      if (data) for (let i = 0; i < data.length; i++) M.wr8(p + 20 + i, data[i]);
      else g.words.forEach((w, i) => M.wr32(p + 20 + i * 4, w | 0));
      return;
    }
    if (ev.fill) { ev.fill(p); return; }
    ev.words.forEach((w, i) => M.wr32(p + i * 4, w | 0));
  }

  stackOrder() {
    const out = [];
    for (let i = wimp.stack.length - 1; i >= 0; i--) { const rec = this.byWin.get(wimp.stack[i]); if (rec) out.push(rec); }
    return out;
  }

  // ------------------------------------------------------------------ windows
  rec(h, need = true) {
    const rec = this.recs.get(h | 0);
    if (!rec && need) throw new BasicError(0x288, 'Illegal window handle');
    return rec ?? null;
  }
  /** A core window for a handle (ours, another bridge's, or a core window handle). */
  coreWindow(h) {
    for (const b of bridges) { const r = b.recs.get(h | 0); if (r) return r.win; }
    for (const w of wimp.windows) if (w.handle === (h | 0)) return w;
    return null;
  }
  handleOf(win) {
    if (!win) return -1;
    if (win._isIconbar) return -2;
    for (const b of bridges) { const r = b.byWin.get(win); if (r) return r.handle; }
    return win.handle;
  }

  readWindowBlock(p) {
    const M = this.M;
    const o = {
      vx0: M.rd32(p), vy0: M.rd32(p + 4), vx1: M.rd32(p + 8), vy1: M.rd32(p + 12),
      sx: M.rd32(p + 16), sy: M.rd32(p + 20), behind: M.rd32(p + 24), flags: M.rd32(p + 28) >>> 0,
      colours: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => M.rd8(p + 32 + i)),
      ex0: M.rd32(p + 40), ey0: M.rd32(p + 44), ex1: M.rd32(p + 48), ey1: M.rd32(p + 52),
      titleFlags: M.rd32(p + 56) >>> 0, workFlags: M.rd32(p + 60) >>> 0, area: M.rd32(p + 64) >>> 0,
      minW: M.rd16(p + 68), minH: M.rd16(p + 70), nIcons: M.rd32(p + 84),
    };
    if (!(o.flags & WF_NEW)) {
      const f = o.flags;
      let n = (f & ~0xFF) | (f & 0x72) | WF_NEW;
      if (f & 1) n |= 1 << 26;
      if (f & 4) n |= 1 << 28;
      if (f & 8) n |= 1 << 30;
      if (!(f & 128)) n |= (1 << 24) | (1 << 25);
      if (f & 1) n |= 1 << 27;
      if ((f & 4) && (f & 8)) n |= 1 << 29;
      o.flags = n >>> 0;
    }
    o.titleData = [M.rd32(p + 72), M.rd32(p + 76), M.rd32(p + 80)];
    o.titleDataAddr = p + 72;
    o.icons = [];
    for (let i = 0; i < Math.max(0, Math.min(o.nIcons, 1024)); i++) o.icons.push(this.readIconBlock(p + 88 + 32 * i, o.area));
    o.raw = new Uint8Array(88);
    for (let i = 0; i < 88; i++) o.raw[i] = M.rd8(p + i);
    return o;
  }

  /** Read a 32-byte icon block -> {bboxOS, flags, data[3], spec (core icon spec, px)} */
  readIconBlock(p, windowArea) {
    const M = this.M;
    const bb = { x0: M.rd32(p), y0: M.rd32(p + 4), x1: M.rd32(p + 8), y1: M.rd32(p + 12) };
    const flags = M.rd32(p + 16) >>> 0;
    const data = [M.rd32(p + 20), M.rd32(p + 24), M.rd32(p + 28)];
    const ic = { bb, flags, data, dataAddr: p + 20, windowArea };
    this.iconContent(ic, p + 20);
    return ic;
  }

  /** Decode icon text/sprite/validation from its data (indirected: from the buffers in memory). */
  iconContent(ic, dataAddr) {
    const f = ic.flags, M = this.M;
    ic.text = undefined; ic.validation = undefined; ic.sprite = undefined; ic.area = undefined;
    if (f & IF.indirected) {
      const [p0, p1, len] = ic.data;
      if (f & IF.text) {
        ic.textPtr = u32(p0); ic.valPtr = p1 > 0 ? u32(p1) : 0; ic.bufLen = len;
        ic.text = ic.textPtr ? this.rdIconText(ic.textPtr, Math.max(1, len)) : '';
        ic.validation = ic.valPtr ? rdCtrl(this.m, ic.valPtr, 256) : undefined;
      } else if (f & IF.sprite) {
        ic.spriteArea = u32(p1);
        if (len > 0) ic.sprite = rdCtrl(this.m, p0, len);
        else ic.sprite = this.proc.spriteAreas.nameAt(u32(p0));
      }
    } else if (dataAddr) {
      const s = rdCtrl(this.m, dataAddr, 12);
      if (f & IF.text) ic.text = s;
      if (f & IF.sprite) ic.sprite = s;
      ic.bufLen = 12;
    }
  }
  rdIconText(p, len) { let s = ''; for (let i = 0; i < Math.min(len, 1024); i++) { const c = this.M.rd8(p + i); if (c < 32) break; s += String.fromCharCode(c); } return s; }

  areaMap(a) { return a && a !== 1 ? this.proc.spriteAreas.map(u32(a)) : null; }

  iconSpec(ic) {
    const spec = {
      bbox: { x0: ic.bb.x0 / 2, y0: -ic.bb.y1 / 2, x1: ic.bb.x1 / 2, y1: -ic.bb.y0 / 2 },
      flags: ic.flags, text: ic.text, validation: ic.validation, sprite: ic.sprite,
      bufLen: ic.bufLen ?? 12,
    };
    const area = ic.spriteArea ?? ic.windowArea;
    const map = this.areaMap(area);
    if (map) spec.area = map;
    if (ic.flags & IF.font) {
      const f = this.proc.fonts.get(ic.flags >>> 24);
      if (f) spec.font = { name: f.name, size: f.ys / 16 };
    }
    return spec;
  }

  createWindow(r) {
    const o = this.readWindowBlock(u32(r[1]));
    const H = this.H;
    const c = o.colours;
    const titleIc = { flags: o.titleFlags, data: o.titleData };
    this.iconContent(titleIc, o.titleDataAddr);
    const def = {
      title: titleIc.text ?? '', titleFlags: o.titleFlags, flags: o.flags,
      colours: { titleFg: c[0], titleBg: c[1], workFg: c[2], workBg: c[3], scrollOuter: c[4], scrollInner: c[5], titleFocus: c[6] },
      extent: { x0: o.ex0 / 2, y0: -o.ey1 / 2, x1: o.ex1 / 2, y1: -o.ey0 / 2 },
      x: o.vx0 / 2, y: H - o.vy1 / 2, w: (o.vx1 - o.vx0) / 2, h: (o.vy1 - o.vy0) / 2,
      scrollX: o.sx / 2, scrollY: -o.sy / 2,
      minW: o.minW / 2, minH: o.minH / 2,
      workButton: (o.workFlags >>> 12) & 15,
      spriteArea: this.areaMap(o.area),
    };
    const win = wimp.createWindow(this.task, def);
    const handle = 0x220000 + ((++handleSeq) << 6);
    const rec = { handle, win, o, title: titleIc, icons: [], invalid: [], canvas: null };
    for (const ic of o.icons) { rec.icons.push(ic); win.addIcon(this.iconSpec(ic)); }
    this.recs.set(handle, rec);
    this.byWin.set(win, rec);
    this.hookWindow(rec);
    rec.invalid = [{ ...win.extent }];
    r[0] = handle;
  }

  hookWindow(rec) {
    const win = rec.win, h = rec.handle;
    win.on('open', (ev) => {
      ev.preventDefault();
      const st = { x: ev.x, y: ev.y, w: ev.w, h: ev.h, scrollX: ev.scrollX, scrollY: ev.scrollY };
      const behind = ev.behind === 'top' ? -1 : ev.behind === 'bottom' ? -2 : ev.behind instanceof Window ? this.handleOf(ev.behind) : this.behindHandle(win);
      this.queue(2, [h, ...this.visibleOS(st), Math.round(st.scrollX * 2), Math.round(-st.scrollY * 2), behind]);
    });
    win.on('close', (ev) => { ev.preventDefault(); this.queue(3, [h]); });
    const click = (kind) => (ev) => { this.mouseClick(rec, ev, kind); return true; };
    win.on('click', click('click'));
    win.on('doubleclick', click('double'));
    win.on('drag', click('drag'));
    win.on('key', (ev) => { this.keyPressed(ev.code); return true; });
    win.on('hotkey', (ev) => { this.keyPressed(ev.code); return true; });
    win.on('gaincaret', () => this.queue(12, this.caretWords()));
    win.on('losecaret', () => this.queue(11, [h, -1, 0, 0, -1, -1]));
    win.on('pointerenter', () => this.queue(5, [h]));
    win.on('pointerleave', () => this.queue(4, [h]));
    win.on('scrollrequest', (ev) => {
      const st = win.getState();
      this.queue(10, [h, ...this.visibleOS(st), Math.round(st.scrollX * 2), Math.round(-st.scrollY * 2), this.behindHandle(win), Math.sign(ev.dx) * (Math.abs(ev.dx) > 1 ? 2 : 1), -Math.sign(ev.dy) * (Math.abs(ev.dy) > 1 ? 2 : 1)]);
      return true;
    });
    win.on('iconchanged', (ev) => this.writeBackIcon(rec, ev.icon));
    win.on('moved', () => this.kick());
    win.on('opened', () => this.kick());
    win.on('dataload', (ev) => { this.dataLoadMessage(ev, h, ev.icon ? ev.icon.handle : -1); return true; });
    win.on('helprequest', (ev) => {
      const key = `${h}:${ev.icon ? ev.icon.handle : -1}`;
      if (this.helpCache.has(key)) ev.text = this.helpCache.get(key);
      const now = performance.now();
      if (!this._lastHelp || this._lastHelp.key !== key || now - this._lastHelp.t > 500) {
        this._lastHelp = { key, t: now };
        const p = { x: ev.sx * 2, y: (this.H - 1 - ev.sy) * 2 };
        this.pendingHelp = { key, myRef: this.queueMessage(MSG.HelpRequest, [p.x, p.y, this.buttons, h, ev.icon ? ev.icon.handle : -1], 17) };
      }
    });
  }

  behindHandle(win) {
    const s = wimp.stack, i = s.indexOf(win);
    if (i < 0 || i === s.length - 1) return -1;
    return this.handleOf(s[i + 1]);
  }

  visibleOS(st) {
    const H = this.H;
    return [Math.round(st.x * 2), Math.round((H - st.y - st.h) * 2), Math.round((st.x + st.w) * 2), Math.round((H - st.y) * 2)];
  }

  stateWords(rec) {
    const w = rec.win;
    let flags = (rec.o.flags & 0xFFE0FFFF) >>> 0;
    if (w.isOpen) flags |= 1 << 16;
    if (w.isOpen && this.behindHandle(w) === -1) flags |= 1 << 17;
    if (w.fullSize) flags |= 1 << 18;
    if (w.hasFocus) flags |= 1 << 20;
    return [...this.visibleOS(w), Math.round(w.scrollX * 2), Math.round(-w.scrollY * 2), w.isOpen ? this.behindHandle(w) : -1, flags | 0];
  }

  getWindowState(r) {
    const p = u32(r[1]);
    const rec = this.rec(this.M.rd32(p));
    this.stateWords(rec).forEach((v, i) => this.M.wr32(p + 4 + i * 4, v));
  }

  getWindowInfo(r) {
    const noIcons = r[1] & 1;
    const p = u32(r[1]) & ~3;
    const M = this.M;
    const rec = this.rec(M.rd32(p));
    const w = rec.win;
    for (let i = 0; i < 88; i++) M.wr8(p + 4 + i, rec.o.raw[i]);
    this.stateWords(rec).forEach((v, i) => M.wr32(p + 4 + i * 4, v));
    const e = w.extent;
    [e.x0 * 2, -e.y1 * 2, e.x1 * 2, -e.y0 * 2].forEach((v, i) => M.wr32(p + 4 + 40 + i * 4, Math.round(v)));
    M.wr32(p + 4 + 84, w.icons.length);
    if (!noIcons) w.icons.forEach((ic, i) => this.writeIconBlock(rec, i, p + 4 + 88 + 32 * i));
  }

  writeIconBlock(rec, i, p) {
    const M = this.M;
    const core = rec.win.icons[i];
    const ic = rec.icons[i];
    if (!core || !ic) { for (let k = 0; k < 32; k++) M.wr8(p + k, 0); M.wr32(p + 16, IF.deleted); return; }
    const b = core.bbox;
    [b.x0 * 2, -b.y1 * 2, b.x1 * 2, -b.y0 * 2].forEach((v, k) => M.wr32(p + k * 4, Math.round(v)));
    M.wr32(p + 16, core.flags | 0);
    if (ic.flags & IF.indirected) ic.data.forEach((v, k) => M.wr32(p + 20 + k * 4, v));
    else { const s = (core.flags & IF.text ? core.text : core.spriteName) ?? ''; for (let k = 0; k < 12; k++) M.wr8(p + 20 + k, k < s.length ? s.charCodeAt(k) : k === s.length ? 13 : 0); }
  }

  openWindow(r) {
    const p = u32(r[1]), M = this.M;
    const rec = this.rec(M.rd32(p));
    const [x0, y0, x1, y1, sx, sy, behind] = [0, 1, 2, 3, 4, 5, 6].map((i) => M.rd32(p + 4 + i * 4));
    const H = this.H;
    const st = { x: x0 / 2, y: H - y1 / 2, w: (x1 - x0) / 2, h: (y1 - y0) / 2, scrollX: sx / 2, scrollY: -sy / 2 };
    if (behind === -1) st.behind = 'top';
    else if (behind === -2 || behind === -3) st.behind = 'bottom';
    else { const w = this.coreWindow(behind); st.behind = w && w !== rec.win ? w : (rec.win.isOpen ? 'keep' : 'top'); }
    rec.win.open(st);
    this.ensureCanvas(rec);
    this.kick();
  }

  closeWindow(r) { const rec = this.rec(this.M.rd32(u32(r[1]))); rec.win.close(); }

  deleteWindow(r) {
    const rec = this.rec(this.M.rd32(u32(r[1])));
    rec.canvas?.remove();
    rec.win.delete();
    this.recs.delete(rec.handle); this.byWin.delete(rec.win);
  }

  getWindowOutline(r) {
    const p = u32(r[1]);
    const rec = this.rec(this.M.rd32(p));
    const o = rec.win.outline();
    const H = this.H;
    [o.x0 * 2, (H - o.y1) * 2, o.x1 * 2, (H - o.y0) * 2].forEach((v, i) => this.M.wr32(p + 4 + i * 4, v));
  }

  setExtent(r) {
    const rec = this.rec(r[0]);
    const p = u32(r[1]), M = this.M;
    const [x0, y0, x1, y1] = [0, 1, 2, 3].map((i) => M.rd32(p + i * 4));
    const old = { ...rec.win.extent };
    rec.win.setExtent({ x0: x0 / 2, y0: -y1 / 2, x1: x1 / 2, y1: -y0 / 2 });
    if (rec.canvas) rec.canvas.resize();
    // newly exposed areas need drawing
    const e = rec.win.extent;
    for (const piece of [{ x0: old.x1, y0: e.y0, x1: e.x1, y1: e.y1 }, { x0: e.x0, y0: old.y1, x1: e.x1, y1: e.y1 }, { x0: e.x0, y0: e.y0, x1: old.x0, y1: e.y1 }, { x0: e.x0, y0: e.y0, x1: e.x1, y1: old.y0 }]) {
      if (!rectEmpty(piece)) rec.invalid = rectListAdd(rec.invalid, piece);
    }
    this.kick();
  }

  // ------------------------------------------------------------------ icons
  createIcon(r) {
    const p = u32(r[1]);
    const wh = this.M.rd32(p);
    if (wh === -1 || wh === -2 || (wh <= -3 && wh >= -8)) return this.createIconbarIcon(r, p, wh);
    const rec = this.rec(wh);
    const ic = this.readIconBlock(p + 4, rec.o.area);
    let idx = rec.win.icons.findIndex((x) => x == null);
    if (idx < 0) { idx = rec.win.icons.length; rec.win.addIcon(this.iconSpec(ic)); }
    else { const core = new Icon(rec.win, this.iconSpec(ic), idx); rec.win.icons[idx] = core; rec.win.iconLayer.appendChild(core.el); }
    rec.icons[idx] = ic;
    r[0] = idx;
  }

  createIconbarIcon(r, p, wh) {
    const ic = this.readIconBlock(p + 4, 1);
    const spec = this.iconSpec(ic);
    const w = Math.max(8, (ic.bb.x1 - ic.bb.x0) / 2), h = Math.max(8, (ic.bb.y1 - ic.bb.y0) / 2);
    const side = wh === -2 || wh === -5 || wh === -6 ? 'left' : 'right';
    let item;
    const bridge = this;
    item = this.task.addIconbarIcon({
      sprite: ic.sprite ?? (ic.validation ? /(?:^|;)s([^;,]*)/i.exec(ic.validation)?.[1] : undefined) ?? 'file_xxx',
      text: ic.flags & IF.text ? ic.text : undefined,
      side, priority: r[0] | 0, area: spec.area,
      raw: { flags: ic.flags, validation: ic.validation ?? '', w, h },
      onClick: (ev) => bridge.mouseClick(null, ev, ev.kind === 'double' ? 'double' : 'click', item),
      menu: (ev) => { bridge.mouseClick(null, ev, 'click', item); return null; },
      onDataLoad: (ev) => bridge.dataLoadMessage(ev, -2, item.icon.handle),
    });
    if (!(ic.flags & IF.text) && ic.flags & IF.sprite) {
      // plain sprite icon: let the icon bar size it from the sprite
      delete item.raw;
      item.icon.flags = ic.flags;
      item.icon.spriteName = ic.sprite;
      if (spec.area) item.icon.area = spec.area;
      item.icon.render();
      wimp.iconbar.layout();
    }
    item.bwIcon = ic;
    const handle = item.icon.handle;
    this.ib.set(handle, item);
    r[0] = handle;
  }

  iconRef(wh, ih) {
    if (wh === -2 || wh === -1) {
      const item = this.ib.get(ih);
      if (!item) throw new BasicError(0x289, 'Illegal icon handle');
      return { core: item.icon, ic: item.bwIcon, item };
    }
    const rec = this.rec(wh);
    const core = rec.win.icons[ih];
    if (!core) throw new BasicError(0x289, 'Illegal icon handle');
    return { core, ic: rec.icons[ih], rec };
  }

  deleteIcon(r) {
    const p = u32(r[1]), M = this.M;
    const wh = M.rd32(p), ih = M.rd32(p + 4);
    if (wh === -2 || wh === -1) { const item = this.ib.get(ih); if (item) { wimp.iconbar.remove(item); this.ib.delete(ih); } return; }
    const rec = this.rec(wh);
    rec.win.deleteIcon(ih);
    rec.icons[ih] = null;
  }

  /** Re-read an icon's indirected text/validation (and its sprite area) from memory. */
  refreshIcon(ic, core, rec) {
    if (!ic || !core) return;
    if (!(ic.flags & IF.indirected)) return;
    const oldText = ic.text, oldVal = ic.validation, oldSpr = ic.sprite;
    this.iconContent(ic, null);
    if (ic.flags & IF.text && ic.text !== oldText && !(wimp.caret?.icon === core && core.text === ic.text)) core.setText(ic.text);
    if (ic.validation !== oldVal) core.setValidation(ic.validation);
    if (ic.sprite !== oldSpr && ic.sprite && !(ic.flags & IF.text)) core.setSprite(ic.sprite);
  }

  setIconState(r) {
    const p = u32(r[1]), M = this.M;
    const wh = M.rd32(p), ih = M.rd32(p + 4), eor = M.rd32(p + 8) >>> 0, clear = M.rd32(p + 12) >>> 0;
    const { core, ic, rec, item } = this.iconRef(wh, ih);
    if (ic) ic.flags = (((ic.flags & ~clear) ^ eor) >>> 0);
    this.refreshIcon(ic, core, rec);
    if (ic && ic.flags & IF.sprite && !(ic.flags & IF.text) && rec) { const map = this.areaMap(ic.spriteArea ?? rec.o.area); if (map) core.area = map; }
    core.setState(eor, clear);
    if (item) wimp.iconbar.layout();
  }

  getIconState(r) {
    const p = u32(r[1]), M = this.M;
    const wh = M.rd32(p), ih = M.rd32(p + 4);
    if (wh === -2 || wh === -1) {
      const { core, ic } = this.iconRef(wh, ih);
      const b = core.bbox;
      [b.x0 * 2, -b.y1 * 2, b.x1 * 2, -b.y0 * 2].forEach((v, k) => M.wr32(p + 8 + k * 4, Math.round(v)));
      M.wr32(p + 24, core.flags | 0);
      ic?.data.forEach((v, k) => M.wr32(p + 28 + k * 4, v));
      return;
    }
    const rec = this.rec(wh);
    this.writeIconBlock(rec, ih, p + 8);
  }

  whichIcon(r) {
    const rec = this.rec(r[0]);
    const mask = r[2] >>> 0, want = r[3] >>> 0;
    let p = u32(r[1]);
    rec.win.icons.forEach((ic, i) => { if (ic && ((ic.flags & mask) >>> 0) === ((want & mask) >>> 0)) { this.M.wr32(p, i); p += 4; } });
    this.M.wr32(p, -1);
  }

  resizeIcon(r) {
    const rec = this.rec(r[0]);
    const core = rec.win.icons[r[1]];
    if (!core) throw new BasicError(0x289, 'Illegal icon handle');
    core.moveTo({ x0: r[2] / 2, y0: -r[5] / 2, x1: r[4] / 2, y1: -r[3] / 2 });
    const ic = rec.icons[r[1]];
    if (ic) ic.bb = { x0: r[2], y0: r[3], x1: r[4], y1: r[5] };
  }

  writeBackIcon(rec, core) {
    const ic = rec.icons[core.handle];
    if (!ic || !(ic.flags & IF.indirected) || !ic.textPtr) return;
    const s = core.text.slice(0, Math.max(0, (ic.bufLen || 1) - 1));
    for (let i = 0; i < s.length; i++) this.M.wr8(ic.textPtr + i, s.charCodeAt(i) & 255);
    this.M.wr8(ic.textPtr + s.length, 0);
    ic.text = s;
  }

  /** Pick up changes the program made to indirected buffers (text, validation, title). */
  syncFromMemory() {
    for (const rec of this.recs.values()) {
      rec.icons.forEach((ic, i) => { if (ic && ic.flags & IF.indirected && ic.flags & IF.text) this.refreshIcon(ic, rec.win.icons[i], rec); });
      const t = rec.title;
      if (t && t.flags & IF.indirected && t.flags & IF.text) {
        const s = this.rdIconText(u32(t.data[0]), Math.max(1, t.data[2]));
        if (s !== rec.win.title) rec.win.setTitle(s);
      }
    }
    for (const item of this.ib.values()) {
      const ic = item.bwIcon;
      if (ic && ic.flags & IF.indirected && ic.flags & IF.text) {
        const old = ic.text;
        this.iconContent(ic, null);
        if (ic.text !== old) { item.icon.setText(ic.text); item.text = ic.text; wimp.iconbar.layout(); }
      }
    }
  }

  // ------------------------------------------------------------------ mouse / keys
  mouseClick(rec, ev, kind, item = null) {
    const bmap = { select: 4, menu: 2, adjust: 1 };
    let b = bmap[ev.button] ?? 4;
    const icon = ev.icon;
    const btype = ev.button === 'menu' ? -1 : (icon && icon.buttonType !== 0 ? icon.buttonType : rec ? rec.win.workButton : 3);
    if (kind === 'drag') { b *= 16; this.lastDragEvent = ev.pointerEvent; }
    else if (kind === 'click' && btype === 10) b *= 256;
    const x = Math.round((ev.sx ?? input.mouseX) * 2), y = Math.round((this.H - 1 - (ev.sy ?? input.mouseY)) * 2);
    const wh = rec ? rec.handle : -2;
    const ih = item ? item.icon.handle : icon ? icon.handle : -1;
    this.queue(6, [x, y, b, wh, ih]);
  }

  caretWords() {
    const c = wimp.caret;
    if (!c || !c.window) return [-1, -1, 0, 0, -1, -1];
    const h = this.handleOf(c.window);
    if (c.icon) {
      const p = c.icon.caretPos(c.index);
      return [h, c.icon.handle, Math.round(p.x * 2), Math.round(-(p.y + p.h) * 2), Math.round(p.h * 2) | 0, c.index];
    }
    if (c.pos) return [h, -1, Math.round(c.pos.x * 2), Math.round(-(c.pos.y + (c.pos.h ?? 20)) * 2), Math.round((c.pos.h ?? 20) * 2) | (c.pos.flags ?? 0), c.index ?? -1];
    return [h, -1, 0, 0, 1 << 25, -1];
  }

  keyPressed(code) { this.queue(8, [...this.caretWords(), code]); }

  processKey(r) {
    const code = r[0];
    // pass on to other hot-key windows, then the Wimp's own hot keys
    const c = wimp.caret;
    for (let i = wimp.stack.length - 1; i >= 0; i--) {
      const w = wimp.stack[i];
      if (w.hasFlag(1 << 12) && w !== c?.window && !this.byWin.has(w)) { const ev = w.emit('hotkey', { code, char: code >= 32 && code < 256 ? String.fromCharCode(code) : '', key: '' }); if (ev.handled || ev.defaultPrevented) return; }
    }
    const hot = { 0x1CC: 'hotkey:F12', 0x1EC: 'hotkey:CtrlF12', 0x1FC: 'hotkey:CtrlShiftF12' }[code];
    if (hot) setTimeout(() => wimp.emit(hot, {}), 0);
    else if (code === 0x1DC) wimp.toggleIconbarFront();
  }

  getPointerInfo(r) {
    const p = u32(r[1]), M = this.M;
    const pos = this.pointerOS();
    const hit = wimp.hitTest(input.mouseX, input.mouseY);
    let wh = -1, ih = -1;
    if (hit.window) {
      wh = this.handleOf(hit.window);
      if (hit.icon) ih = hit.icon.handle;
      else if (hit.part && hit.part !== 'work') ih = { back: -7, close: -2, title: -3, toggle: -4, up: -5, vbar: -6, vwell: -6, down: -7, size: -8, left: -9, hbar: -10, hwell: -10, right: -11 }[hit.part] ?? -1;
    }
    M.wr32(p, pos.x); M.wr32(p + 4, pos.y); M.wr32(p + 8, this.buttons); M.wr32(p + 12, wh); M.wr32(p + 16, ih);
  }

  // ------------------------------------------------------------------ caret
  setCaretPosition(r) {
    const wh = r[0];
    if (wh === -1) { wimp.setCaret(null); return; }
    const win = this.coreWindow(wh);
    if (!win) throw new BasicError(0x288, 'Illegal window handle');
    const rec = { win };
    const ih = r[1], x = r[2], y = r[3], hgt = r[4], idx = r[5];
    if (ih >= 0) {
      const core = rec.win.icons[ih];
      if (!core) throw new BasicError(0x289, 'Illegal icon handle');
      let i = idx;
      if (i < 0) i = core.indexAt(x / 2);
      wimp.setCaret(rec.win, core, i);
      return;
    }
    if (hgt === -1 || (hgt & (1 << 25))) { wimp.setCaret(rec.win); return; }
    const hpx = (hgt & 0xFFFF) / 2;
    wimp.setCaret(rec.win, null, idx, { x: x / 2, y: -y / 2 - hpx, h: hpx, flags: hgt & ~0xFFFF });
  }

  getCaretPosition(r) {
    const p = u32(r[1]);
    this.caretWords().forEach((v, i) => this.M.wr32(p + i * 4, v));
  }

  // ------------------------------------------------------------------ redraw
  ensureCanvas(rec) {
    if (!rec.canvas) rec.canvas = new WindowCanvas(rec.win);
    else rec.canvas.resize();
    return rec.canvas;
  }

  /** visible work-area rect that is on the screen (work px) */
  drawableRect(rec) {
    const w = rec.win;
    const vis = w.visibleWork();
    const scr = { x0: w.scrollX - w.x, y0: w.scrollY - w.y, x1: w.scrollX - w.x + wimp.width, y1: w.scrollY - w.y + wimp.height };
    return rectAnd(rectAnd(vis, scr), w.extent);
  }

  needsRedraw(rec) {
    if (!rec.win.isOpen || rec.o.flags & (1 << 4)) return false;
    if (!rec.invalid.length) return false;
    const d = this.drawableRect(rec);
    if (rectEmpty(d)) return false;
    return rec.invalid.some((r) => !rectEmpty(rectAnd(r, d)));
  }

  keyFor(rec) {
    const bg = rec.win.colours.workBg;
    return bg === 255 ? -1 : this.vdu.nearest(wimpRGB(bg));
  }

  redrawWindow(r) {
    const p = u32(r[1]);
    const rec = this.rec(this.M.rd32(p));
    this.ensureCanvas(rec);
    const d = this.drawableRect(rec);
    const rects = [];
    if (!(rec.o.flags & (1 << 4))) for (const x of rec.invalid) { const i = rectAnd(x, d); if (!rectEmpty(i)) rects.push(i); }
    for (const x of rects) rec.invalid = rectListSub(rec.invalid, x);
    this.redraw = { rec, rects, update: false, block: p, cur: null };
    return this.nextRect(r);
  }

  updateWindow(r) {
    const p = u32(r[1]), M = this.M;
    const rec = this.rec(M.rd32(p));
    this.ensureCanvas(rec);
    const [x0, y0, x1, y1] = [0, 1, 2, 3].map((i) => M.rd32(p + 4 + i * 4));
    const want = { x0: Math.floor(x0 / 2), y0: Math.floor(-y1 / 2), x1: Math.ceil(x1 / 2), y1: Math.ceil(-y0 / 2) };
    const i = rectAnd(want, this.drawableRect(rec));
    this.redraw = { rec, rects: rectEmpty(i) ? [] : [i], update: true, block: p, cur: null };
    return this.nextRect(r);
  }

  getRectangle(r) {
    if (!this.redraw) { r[0] = 0; return; }
    return this.nextRect(r);
  }

  _finishRect() {
    const rd = this.redraw;
    if (!rd?.cur) return;
    const { rec, cur } = rd;
    const w = rec.win;
    rec.canvas.fromScreen(this.vdu, cur.x0, cur.y0, cur.x1 - cur.x0, cur.y1 - cur.y0, w.x + cur.x0 - w.scrollX, w.y + cur.y0 - w.scrollY, rd.key);
    rd.cur = null;
  }

  _endRedraw() {
    this._finishRect();
    this.redraw = null;
    this.inRedraw = false;
    const v = this.vdu;
    v.gwl = 0; v.gwb = 0; v.gwr = v.xWL; v.gwt = v.yWL;
  }

  nextRect(r) {
    const rd = this.redraw;
    this._finishRect();
    const M = this.M, p = rd.block, rec = rd.rec, w = rec.win;
    this.stateWords(rec).slice(0, 6).forEach((v, i) => M.wr32(p + 4 + i * 4, v));
    if (!rd.rects.length || !w.isOpen) { this._endRedraw(); r[0] = 0; return; }
    const cur = rd.cur = rd.rects.shift();
    const v = this.vdu;
    if (!v.isDesktopMode) { /* the program changed MODE: draw anyway at desktop scale */ }
    rd.key = this.keyFor(rec);
    const sx0 = w.x + cur.x0 - w.scrollX, sy0 = w.y + cur.y0 - w.scrollY;
    const sw = cur.x1 - cur.x0, sh = cur.y1 - cur.y0;
    if (rd.update) rec.canvas.toScreen(v, cur.x0, cur.y0, sw, sh, sx0, sy0, rd.key);
    else {
      const fill = rd.key < 0 ? 0 : rd.key;
      for (let y = Math.max(0, sy0); y < Math.min(v.H, sy0 + sh); y++) v.fb.fill(fill, y * v.W + Math.max(0, sx0), y * v.W + Math.min(v.W, sx0 + sw));
    }
    // graphics window = this rectangle (internal pixel coords, y up)
    v.gwl = Math.max(0, sx0); v.gwr = Math.min(v.xWL, sx0 + sw - 1);
    v.gwt = Math.min(v.yWL, v.H - 1 - sy0); v.gwb = Math.max(0, v.H - (sy0 + sh));
    v._dirtyAll();
    this.inRedraw = true;
    // like the Wimp: graphics colours = the window's work area foreground / background
    const cols = w.colours;
    if (!this.redraw._coloured) { this.redraw._coloured = true; this.setColour(cols.workFg & 15, false); if (cols.workBg !== 255) this.setColour(128 | (cols.workBg & 15), false); }
    const H = this.H;
    [sx0 * 2, (H - sy0 - sh) * 2, (sx0 + sw) * 2 - 1, (H - sy0) * 2 - 1].forEach((val, i) => M.wr32(p + 28 + i * 4, val));
    r[0] = 1;
  }

  forceRedraw(r) {
    const wh = r[0];
    const [x0, y0, x1, y1] = [r[1], r[2], r[3], r[4]];
    this.syncFromMemory();
    if (wh === -1 || wh === -2) {
      // screen coordinates: every one of our windows that overlaps
      const H = this.H;
      const s = { x0: x0 / 2, y0: H - y1 / 2, x1: x1 / 2, y1: H - y0 / 2 };
      for (const rec of this.recs.values()) {
        const w = rec.win;
        const wr = { x0: s.x0 - w.x + w.scrollX, y0: s.y0 - w.y + w.scrollY, x1: s.x1 - w.x + w.scrollX, y1: s.y1 - w.y + w.scrollY };
        const i = rectAnd(wr, w.extent);
        if (!rectEmpty(i)) rec.invalid = rectListAdd(rec.invalid, i);
      }
      if (wh === -2) wimp.iconbar.layout();
      this.kick();
      return;
    }
    const rec = this.rec(wh);
    const i = rectAnd({ x0: Math.floor(x0 / 2), y0: Math.floor(-y1 / 2), x1: Math.ceil(x1 / 2), y1: Math.ceil(-y0 / 2) }, rec.win.extent);
    if (!rectEmpty(i)) rec.invalid = rectListAdd(rec.invalid, i);
    this.kick();
  }

  blockCopy(r) {
    const rec = this.rec(r[0]);
    const c = this.ensureCanvas(rec);
    const src = { x0: r[1] / 2, y0: -r[4] / 2, x1: r[3] / 2, y1: -r[2] / 2 };
    const dx = r[5] / 2 - src.x0, dy = -r[6] / 2 - src.y1 + (src.y1 - src.y0);
    const w = src.x1 - src.x0, h = src.y1 - src.y0;
    const tmp = new Uint8Array(w * h), tm = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = src.x0 + x - c.x0, sy = src.y0 + y - c.y0;
      if (sx < 0 || sy < 0 || sx >= c.W || sy >= c.H) continue;
      tmp[y * w + x] = c.pix[sy * c.W + sx]; tm[y * w + x] = c.mask[sy * c.W + sx];
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tx = src.x0 + dx + x - c.x0, ty = src.y0 + dy + y - c.y0;
      if (tx < 0 || ty < 0 || tx >= c.W || ty >= c.H) continue;
      c.pix[ty * c.W + tx] = tmp[y * w + x]; c.mask[ty * c.W + tx] = tm[y * w + x];
    }
    c.paint(src.x0 + dx - c.x0, src.y0 + dy - c.y0, w, h, this.vdu);
    // the source area not covered by the destination is invalid
    rec.invalid = rectListAdd(rec.invalid, { x0: src.x0, y0: src.y0, x1: src.x1, y1: src.y1 });
    rec.invalid = rectListSub(rec.invalid, { x0: src.x0 + dx, y0: src.y0 + dy, x1: src.x1 + dx, y1: src.y1 + dy });
    this.kick();
  }

  // ------------------------------------------------------------------ colours
  /** VDU bytes straight to the program's VDU (not program output) */
  vduBytes(bytes) { const v = this.vdu; for (const b of bytes) v.writeC(b & 255); }

  setColour(c, text) {
    const v = this.vdu;
    const bg = !!(c & 128), action = (c >> 4) & 7;
    const px = v.nearest(wimpRGB(c & 15));
    const g = pixelToGcol(px);
    if (text) { this.vduBytes([17, (g.colour & 63) | (bg ? 128 : 0)]); this.vduBytes([23, 17, bg ? 1 : 0, g.tint & 255, 0, 0, 0, 0, 0, 0]); }
    else { this.vduBytes([18, action, (g.colour & 63) | (bg ? 128 : 0)]); this.vduBytes([23, 17, bg ? 3 : 2, g.tint & 255, 0, 0, 0, 0, 0, 0]); }
  }

  readPalette(r) {
    const p = u32(r[1]), v = this.vdu;
    for (let i = 0; i < 20; i++) {
      const rgb = i < 16 ? wimpRGB(i) : i === 16 ? 0 : [0x00FFFF, 0x000099, 0xFF0000][i - 17];
      const px = v.nearest(rgb); const g = pixelToGcol(px);
      const word = (((rgb & 255) << 24) | (((rgb >> 8) & 255) << 16) | (((rgb >> 16) & 255) << 8) | ((g.colour << 2) | (g.tint >> 6))) >>> 0;
      this.M.wr32(p + i * 4, word);
    }
  }

  readPixTrans(r) {
    const M = this.M;
    if (u32(r[6])) { const p = u32(r[6]); M.wr32(p, 1); M.wr32(p + 4, 1); M.wr32(p + 8, 1); M.wr32(p + 12, 1); }
    if (u32(r[7])) { const p = u32(r[7]); for (let i = 0; i < 16; i++) M.wr8(p + i, this.vdu.nearest(wimpRGB(i))); }
    // sprites of mode 12 (eig 1,2) plot at double height on our eig 1,1 screen: scale in PutSpriteScaled
    return (async () => {
      const sp = await resolveSprite(this.m, this.proc.spriteAreas, r[0], u32(r[1]), u32(r[2])).catch(() => null);
      if (sp && u32(r[6])) { const p = u32(r[6]); M.wr32(p, 1 << sp.xeig); M.wr32(p + 4, 1 << sp.yeig); M.wr32(p + 8, 2); M.wr32(p + 12, 2); }
    })();
  }

  // ------------------------------------------------------------------ PlotIcon / TextOp
  async plotIcon(r) {
    if (!this.redraw?.cur) return;
    const ic = this.readIconBlock(u32(r[1]), this.redraw.rec.o.area);
    const rec = this.redraw.rec, w = rec.win, v = this.vdu;
    // work-area OS -> screen OS
    const ox = (w.x - w.scrollX) * 2, oy = (this.H - w.y + w.scrollY) * 2;
    const b = { x0: ic.bb.x0 + ox, y0: ic.bb.y0 + oy, x1: ic.bb.x1 + ox, y1: ic.bb.y1 + oy };
    const f = ic.flags;
    if (f & IF.filled && !(f & IF.font)) {
      const px = v.nearest(wimpRGB(f >>> 28));
      this._fillOS(b, px);
    }
    if (f & IF.sprite) {
      let name = ic.sprite;
      if (f & IF.text && ic.validation) name = /(?:^|;)s([^;,]*)/i.exec(ic.validation)?.[1] ?? name;
      const area = ic.spriteArea ?? rec.o.area;
      let sp = null;
      if (area && area !== 1) sp = this.proc.spriteAreas.decoded(area, name);
      if (!sp) sp = await (await import('./services.js')).wimpPoolSprite(name);
      if (sp) {
        const sw = (sp.width << sp.xeig) * (f & IF.halfSize ? 0.5 : 1), sh = (sp.height << sp.yeig) * (f & IF.halfSize ? 0.5 : 1);
        const x = f & IF.hcentre ? (b.x0 + b.x1 - sw) / 2 : f & IF.rjustify ? b.x1 - sw : b.x0;
        const y = f & IF.vcentre ? (b.y0 + b.y1 - sh) / 2 : b.y0;
        const sc = f & IF.halfSize ? { xm: 1, ym: 1, xd: 2, yd: 2 } : null;
        plotSprite(v, sp, Math.round(x) - v.orgX, Math.round(y) - v.orgY, 8, sc, { mask: true });
      }
    }
    if (f & IF.text && ic.text) {
      const css = f & IF.font ? (this.proc.fonts.get(f >>> 24)?.css ?? desktopFonts.css) : desktopFonts.css;
      const tw = textWidth(ic.text, css) * 2;
      const x = f & IF.hcentre ? (b.x0 + b.x1 - tw) / 2 : f & IF.rjustify ? b.x1 - tw - 6 : b.x0 + 6;
      const y = (b.y0 + b.y1) / 2 - 8;
      const fg = wimpRGB((f >>> 24) & 15), bg = wimpRGB(f >>> 28);
      paintText(v, css, ic.text, Math.round(x) - v.orgX, Math.round(y) - v.orgY, fg, bg);
    }
    if (f & IF.border) {
      const px = v.nearest(0);
      this._fillOS({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y0 + 2 }, px); this._fillOS({ x0: b.x0, y0: b.y1 - 2, x1: b.x1, y1: b.y1 }, px);
      this._fillOS({ x0: b.x0, y0: b.y0, x1: b.x0 + 2, y1: b.y1 }, px); this._fillOS({ x0: b.x1 - 2, y0: b.y0, x1: b.x1, y1: b.y1 }, px);
    }
  }

  _fillOS(b, px) {
    const v = this.vdu;
    const X0 = Math.max(v.gwl, b.x0 >> 1), X1 = Math.min(v.gwr, (b.x1 >> 1) - 1);
    const Y0 = Math.max(v.gwb, b.y0 >> 1), Y1 = Math.min(v.gwt, (b.y1 >> 1) - 1);
    for (let y = Y0; y <= Y1; y++) { const row = (v.H - 1 - y) * v.W; for (let x = X0; x <= X1; x++) v.fb[row + x] = px; }
  }

  textOp(r) {
    const op = r[0] & 255;
    if (op === 0) { this._textOpColour = { fg: r[1] >>> 8, bg: r[2] >>> 8 }; return; }
    const s = rdCtrl(this.m, r[1], 1024);
    const n = r[2] > 0 ? Math.min(r[2], s.length) : s.length;
    if (op === 1) { r[0] = Math.round(textWidth(s.slice(0, n), desktopFonts.css) * 2); return; }
    if (op === 2) {
      const bgr = (w) => (((w) & 255) << 16) | (((w >> 8) & 255) << 8) | ((w >> 16) & 255);
      const c = this._textOpColour ?? { fg: 0, bg: 0xFFFFFF };
      paintText(this.vdu, desktopFonts.css, s.slice(0, n), r[4] - (r[0] & (1 << 30) ? 0 : 0) - this.vdu.orgX, r[5] - this.vdu.orgY, bgr(c.fg), bgr(c.bg));
    }
  }

  // ------------------------------------------------------------------ drags
  dragBox(r) {
    const p = u32(r[1]);
    if (!p || (r[1] | 0) <= 0) { return; }
    const M = this.M;
    const wh = M.rd32(p), type = M.rd32(p + 4);
    const box = [2, 3, 4, 5].map((i) => M.rd32(p + i * 4));
    const par = [6, 7, 8, 9].map((i) => M.rd32(p + i * 4));
    const H = this.H;
    const toPx = (b) => ({ x0: b[0] / 2, y0: H - b[3] / 2, x1: b[2] / 2, y1: H - b[1] / 2 });
    const ev = this.lastDragEvent ?? {};
    if ((type === 1 || type === 2) && this.recs.has(wh)) {
      const rec = this.rec(wh);
      wimp.dragWindow(rec.win, { pointerEvent: ev, sx: input.mouseX, sy: input.mouseY }, { resize: type === 2 });
      return;
    }
    if (type === 3 || type === 4) return;
    const finish = (b) => { const bx = [Math.round(b.x0 * 2), Math.round((H - b.y1) * 2), Math.round(b.x1 * 2), Math.round((H - b.y0) * 2)]; this.queue(7, bx); };
    if (!this.buttons) { finish(toPx(box)); return; }
    const b0 = toPx(box), bounds = toPx(par);
    wimp.drag({
      type: type === 6 ? 'rubber' : type === 7 || type === 12 ? 'point' : 'fixed',
      box: b0, bounds: par[2] > par[0] ? bounds : undefined, event: ev,
      onEnd: (info) => finish(info.box),
    });
  }

  // ------------------------------------------------------------------ menus
  isWindowHandle(h) { for (const b of bridges) if (b.recs.has(h | 0)) return true; return false; }

  buildMenu(p, depth = 0, path = []) {
    const M = this.M;
    if (depth > 8) return new Menu('', []);
    const items = [];
    const firstFlags = M.rd32(p + 28);
    let title;
    if (firstFlags & 0x100) title = rdCtrl(this.m, M.rd32(p), 256);
    else title = rdCtrl(this.m, p, 12);
    let q = p + 28;
    for (let i = 0; i < 256; i++, q += 24) {
      const mf = M.rd32(q) >>> 0, sub = M.rd32(q + 4), iflags = M.rd32(q + 8) >>> 0;
      const ic = { flags: iflags, data: [M.rd32(q + 12), M.rd32(q + 16), M.rd32(q + 20)] };
      this.iconContent(ic, q + 12);
      const idx = i;
      const it = {
        text: ic.text ?? '',
        ticked: !!(mf & 1), dotted: !!(mf & 2), shaded: !!(iflags & IF.shaded),
        showArrowWhenShaded: !!(mf & 16),
        action: (ev) => this.menuSelect([...path, idx], ev),
      };
      if (iflags & IF.sprite && !(iflags & IF.text)) { it.sprite = ic.sprite; it.spriteArea = this.areaMap(ic.spriteArea); }
      if (mf & 4) {
        it.writable = { value: ic.text ?? '', maxLen: Math.max(1, (ic.bufLen ?? 12) - 1), validation: ic.validation };
        it.writable.onChange = (v) => { if (ic.textPtr) { for (let k = 0; k < v.length; k++) M.wr8(ic.textPtr + k, v.charCodeAt(k)); M.wr8(ic.textPtr + v.length, 0); } };
      }
      if (sub !== -1 && sub !== 0) {
        if (mf & 8) {
          it.submenu = (e) => { this.menuWarning(sub, [...path, idx], e); return null; };
        } else if (this.isWindowHandle(sub)) {
          it.submenu = () => this.coreWindow(sub);
        } else {
          const sp = u32(sub);
          it.submenu = () => this.buildMenu(sp, depth + 1, [...path, idx]);
        }
      }
      items.push(it);
      if (mf & 0x80) break;
    }
    const menu = new Menu(title, items, { width: Math.max(0, (M.rd32(p + 16) - 24) / 2) });
    menu.bwPtr = p;
    return menu;
  }

  menuSelect(path, ev) {
    const words = [...path, -1];
    if (ev?.value != null) this._lastWritable = ev.value;
    this._menuKeptOpen = ev?.button === 'adjust';
    this.queue(9, words);
  }

  menuWarning(sub, path, e) {
    const lv = wimp.menus.levels.find((l) => l.menu && l.menu.items[path[path.length - 1]] === e.item);
    this._warnLevel = lv ?? wimp.menus.levels[wimp.menus.levels.length - 1];
    this._warnIndex = path[path.length - 1];
    const x = this._warnLevel ? this._warnLevel.win.x + this._warnLevel.win.w + 1 : input.mouseX;
    const rowTop = this._warnLevel?.rows?.[this._warnIndex]?.top ?? 0;
    const y = this._warnLevel ? this._warnLevel.win.y + rowTop - this._warnLevel.win.scrollY : input.mouseY;
    this.queueMessage(MSG.MenuWarning, [sub, Math.round(x * 2), Math.round((this.H - y) * 2), ...path, -1], 17);
  }

  createMenu(r) {
    const ptr = r[1];
    if (ptr === -1 || ptr === 0) { if (wimp.menus.owner === this.task) wimp.menus.close(); this.menuPtr = null; return; }
    const x = r[2] / 2, y = this.H - r[3] / 2;
    const isWin = this.isWindowHandle(ptr);
    // Adjust-click re-open of the same menu: refresh in place
    if (!isWin && wimp.menus.isOpen && wimp.menus.owner === this.task && this.menuPtr === u32(ptr) && this._menuKeptOpen) {
      this._menuKeptOpen = false;
      this.refreshMenus();
      return;
    }
    this.menuPtr = isWin ? null : u32(ptr);
    const m = isWin ? this.coreWindow(ptr) : this.buildMenu(u32(ptr));
    this._menusDeletedPending = true;
    wimp.menus.open(m, x, y, { task: this.task });
  }

  refreshMenus() {
    const mm = wimp.menus;
    for (const lv of mm.levels) {
      if (lv.isDbox || !lv.menu?.bwPtr) continue;
      const fresh = this.buildMenu(lv.menu.bwPtr, 0, this._pathForLevel(lv.level));
      lv.menu.items = fresh.items; lv.menu.title = fresh.title;
    }
    mm.refresh();
  }
  _pathForLevel(level) { const p = []; for (let l = 0; l < level; l++) p.push(wimp.menus.levels[l].subOpenFor); return p; }

  createSubMenu(r) {
    const ptr = r[1];
    const mm = wimp.menus;
    const lv = this._warnLevel && mm.levels.includes(this._warnLevel) ? this._warnLevel : mm.levels[mm.levels.length - 1];
    if (!lv) return this.createMenu(r);
    const x = r[2] / 2, y = this.H - r[3] / 2;
    const sub = this.isWindowHandle(ptr) ? this.coreWindow(ptr) : this.buildMenu(u32(ptr), 1, [...this._pathForLevel(lv.level), this._warnIndex ?? 0]);
    lv.subOpenFor = this._warnIndex ?? -1;
    const nlv = mm._openLevel(lv.level + 1, sub, x, y);
    if (nlv) nlv.parentIndex = lv.subOpenFor;
  }

  decodeMenu(r) {
    const M = this.M;
    let p = u32(r[1]), s = u32(r[2]);
    const out = [];
    for (let d = 0; d < 16; d++) {
      const i = M.rd32(s); s += 4;
      if (i < 0) break;
      const q = p + 28 + 24 * i;
      const ic = { flags: M.rd32(q + 8) >>> 0, data: [M.rd32(q + 12), M.rd32(q + 16), M.rd32(q + 20)] };
      this.iconContent(ic, q + 12);
      out.push(ic.text ?? '');
      const sub = M.rd32(q + 4);
      if (sub === -1 || this.isWindowHandle(sub)) break;
      p = u32(sub);
    }
    wrStr0(this.m, r[3], out.join('.'));
  }

  getMenuState(r) {
    const p = u32(r[1]);
    const mm = wimp.menus;
    const path = [];
    if (mm.isOpen && mm.owner === this.task) {
      if (r[0] & 1) {
        const lv = mm.levels.find((l) => !l.isDbox && l.win.el.contains(document.elementFromPoint?.(0, 0)));
        void lv;
        for (const l of mm.levels) { if (l.isDbox) break; if (l.highlight >= 0) path.push(l.highlight); else break; }
      } else for (const l of mm.levels) { if (l.isDbox || l.subOpenFor < 0) break; path.push(l.subOpenFor); }
    }
    path.forEach((v, i) => this.M.wr32(p + i * 4, v));
    this.M.wr32(p + path.length * 4, -1);
  }

  // ------------------------------------------------------------------ messages
  sendMessage(r) {
    const code = r[0], p = u32(r[1]), M = this.M;
    const size = Math.max(20, Math.min(256, M.rd32(p)));
    const action = M.rd32(p + 16) >>> 0;
    const myRef = ++myRefSeq;
    M.wr32(p + 4, this.task?.handle ?? 0);
    M.wr32(p + 8, myRef);
    const yourRef = M.rd32(p + 12);
    const bytes = new Uint8Array(size - 20);
    for (let i = 0; i < bytes.length; i++) bytes[i] = M.rd8(p + 20 + i);
    let dest = r[2];
    // Help replies go to the core's help system
    if (action === MSG.HelpReply) {
      const text = rdCtrl(this.m, p + 20, 236);
      const key = this.pendingHelp?.key;
      if (key) this.helpCache.set(key, text);
      return;
    }
    if (code === 19) return;           // acknowledgements: nothing to do
    // to a window handle: that window's task
    let target = null;
    for (const b of bridges) {
      if (dest === 0) continue;
      if (b.task?.handle === dest || b.recs.has(dest)) { target = b; break; }
      if (dest === -2 && b.ib.has(r[3])) { target = b; break; }
    }
    if (dest === 0) {
      for (const b of bridges) if (b !== this) b.queueMessage(action, [], code, false, { bytes, sender: this.task.handle, yourRef });
      // translate a few for the rest of the desktop
      if (action === MSG.Quit) void 0;
      r[2] = 0;
      return;
    }
    if (target) { target.queueMessage(action, [], code, false, { bytes, sender: this.task.handle, yourRef }); r[2] = target.task.handle; return; }
    // a core (JavaScript) task: forward what we can
    const win = this.coreWindow(dest);
    const task = win?.task ?? wimp.tasks.find((t) => t.handle === dest);
    if (task) r[2] = task.handle;
  }

  dataLoadMessage(ev, wh, ih, action = MSG.DataLoad) {
    const f = ev.files?.[0] ?? { path: ev.path, filetype: ev.filetype, size: 0 };
    if (!f?.path) return;
    const path = f.path;
    const bytes = new Uint8Array(24 + path.length + 1);
    const dv = new DataView(bytes.buffer);
    const x = Math.round((ev.sx ?? input.mouseX) * 2), y = Math.round((this.H - 1 - (ev.sy ?? input.mouseY)) * 2);
    dv.setInt32(0, wh, true); dv.setInt32(4, ih, true); dv.setInt32(8, x, true); dv.setInt32(12, y, true);
    dv.setInt32(16, f.size ?? vfs.stat(path)?.size ?? 0, true); dv.setInt32(20, f.filetype ?? 0xFFF, true);
    for (let i = 0; i < path.length; i++) bytes[24 + i] = path.charCodeAt(i) & 255;
    this.queueMessage(action, [], 18, false, { bytes, sender: 0 });
  }

  transferBlock(r) {
    // Wimp_TransferBlock between two BASIC tasks
    const src = [...bridges].find((b) => b.task?.handle === r[0]);
    const dst = [...bridges].find((b) => b.task?.handle === r[2]);
    if (!src || !dst) throw new BasicError(0x28C, 'Invalid task handle');
    for (let i = 0; i < r[4]; i++) dst.M.wr8(u32(r[3]) + i, src.M.rd8(u32(r[1]) + i));
  }

  // ------------------------------------------------------------------ misc
  openTemplate(r) {
    const path = rdCtrl(this.m, r[1], 256);
    return TemplateFile.open(path).then((tf) => { this.templates = tf; });
  }

  async reportError(r) {
    const e = u32(r[0]);
    const num = this.M.rd32(e); void num;
    const msg = rdCtrl(this.m, e + 4, 252);
    const flags = r[1];
    const app = r[2] ? rdCtrl(this.m, r[2], 64) : '';
    const opts = { appName: flags & 16 ? undefined : app || undefined, cancel: !!(flags & 2), category: flags & 256 ? ['info', 'info', 'error', 'program', 'question'][(flags >> 9) & 7] : 'error' };
    if (!(flags & 1) && !(flags & 2)) opts.cancel = false;
    if (flags & 16) opts.title = app || 'Error';
    const res = await wimp.reportError(msg, opts);
    r[1] = res === 2 ? 2 : 1;
  }

  startTask(r) {
    const cmd = rdCtrl(this.m, r[0], 256);
    os.cli.run(cmd).catch((e) => wimp.reportError(e.message ?? String(e), { appName: this.task?.name }));
    r[0] = 0;
  }

  slotSize(r) {
    // the program's memory is a flat 4MB: any slot up to the RMA fits (BASIC's HIMEM doesn't move)
    this.slot ??= this.m.interp.himem - 0x8000;
    const MAX = 0x300000 - 0x8000;
    if (r[0] >= 0) this.slot = Math.min(MAX, Math.max(this.m.interp.himem - 0x8000, r[0]));
    if (r[1] >= 0) this.nextSlot = r[1];
    r[0] = this.slot; r[1] = this.nextSlot ?? 640 * 1024; r[2] = Math.max(0, 12 * 1024 * 1024 - this.slot);
    if (this.task) this.task.memory = Math.round(this.slot / 1024);
    wimp.emit('taskschanged', {});
  }

  readSysInfo(r) {
    switch (r[0]) {
      case 0: r[0] = wimp.tasks.filter((t) => t.kind === 'app').length; break;
      case 1: r[0] = 28; break;
      case 2: { this._suffix ??= this.m.sysAlloc(4); wrStr0(this.m, this._suffix, '22'); r[0] = this._suffix; break; }
      case 3: r[0] = 1; break;
      case 4: r[0] = 0; break;
      case 5: r[0] = this.task?.handle ?? 0; r[1] = 0; break;
      case 6: r[0] = 0; break;
      case 7: r[0] = 371; break;
      case 8: r[0] = 0; r[1] = 0; break;
      default: r[0] = 0;
    }
  }
}

export { bridges };
