// Task Manager (Switcher): icon bar Acorn icon, Task display window, menu, shutdown.

import { wimp } from './wimp.js';
import { Menu } from './menu.js';
import { loadTemplates } from './templates.js';
import { loadMessages } from './messages.js';
import { saveAs } from './dialogs.js';
import { os } from './os.js';
import { el } from './util.js';
import { memory, barOS, barK } from './memory.js';
import { startPointerDrag } from './input.js';

const ROW = 20;               // 40 OS units (Switcher allocateblock)

export class Switcher {
  async init() {
    this.task = wimp.createTask('Task Manager', { kind: 'module', memory: 0 });
    [this.tpl, this.M] = await Promise.all([loadTemplates('assets/templates/Switcher.json'), loadMessages('Switcher')]);
    this.icon = wimp.iconbar.add({ task: this.task, side: 'right', priority: 0x7fffffff, sprite: 'switcher', onClick: () => this.toggleDisplay() });
    this.icon.menu = (ev) => this.menu(ev);
    this.icon.help = () => this.m('HiFF');
    wimp.on('taskschanged', () => this.refresh());
    wimp.on('memorychanged', () => this.refresh());
    wimp.on('hotkey:CtrlShiftF12', () => this.shutdown());
    this.every = setInterval(() => { if (this.win?.isOpen) this.refresh(); }, 2000);
  }

  m(t, ...a) { return this.M.lookup(t, ...a); }

  // ------------------------------------------------------------ memory (the machine's model: src/core/memory.js)
  /** The figures the Task display shows (os.memory.snapshot(), with the names this module has always used). */
  memory() {
    const s = memory.snapshot();
    return { ...s, used: s.usedK, next: s.nextK, free: s.freeK, total: s.totalK };
  }

  // ------------------------------------------------------------ Task display
  toggleDisplay() {
    if (this.win?.isOpen) { this.win.open({ behind: 'top' }); return; }
    if (!this.win) {
      this.win = wimp.createWindowFromTemplate(this.tpl, 'taskmenu', {}, this.task);
      const w = this.win;
      this.proto = w.icons.slice();
      for (let i = w.icons.length - 1; i >= 0; i--) w.deleteIcon(i);
      w.icons = [];
      w.on('click', (ev) => this.click(ev));
      w.on('close', (ev) => { ev.preventDefault(); w.close(); });
    }
    this.refresh();
    // front_window: opened on top at its template position (then kept where the user leaves it), wide
    // enough for the longest bar (the Total row's) when the screen allows
    this.win.open({ behind: 'top', w: this.win.extent.x1 - this.win.extent.x0 });
  }

  refresh() {
    const w = this.win;
    if (!w) return;
    const P = this.proto;
    const mem = this.memory();
    const layer = w.iconLayer;
    layer.textContent = '';
    w.icons = [];
    this.rows = [];
    const px = (ic) => ic.bbox;
    const nameX1 = px(P[5]).x0 - 4, sizeX0 = px(P[5]).x0, sizeX1 = px(P[5]).x1, barX = px(P[6]).x0;
    const hdrX0 = px(P[0]).x0;
    // stepped bars (Switcher calcbarcoords): OS units / 2 = pixels, at least a pixel wide when not empty
    const kToW = (k) => (k > 0 ? Math.max(1, Math.round(barOS(k) / 2)) : 0);
    // as Switcher sets it: the window's right-hand extent is the Total bar's end + 16 OS units, and the
    // section headings reach it
    const extX1 = barX + kToW(mem.total) + 8;
    let y = px(P[0]).y0;
    // Switcher allocateblock: section headings take 56 OS units, every other row 40 OS units
    const hdr = (i) => {
      const b = px(P[i]);
      y += 2;
      w.addIcon({ bbox: { x0: hdrX0, y0: y, x1: extX1, y1: y + (b.y1 - b.y0) }, flags: P[i].flags, text: P[i].text, bufLen: 40 });
      y += (b.y1 - b.y0) + 2;
    };
    // proto: template icon giving the label's flags and x extent (left-aligned names, right-aligned
    // "Next", "Free", "Total" ...). area: the memory area a red (draggable) bar sets (os.memory.setArea)
    const row = (label, k, { proto = P[4], barColour = 13, task = null, noSize = false, noBar = false, area = null } = {}) => {
      const lb = px(proto);
      const x1 = proto === P[4] ? nameX1 : lb.x1;
      const f = proto === P[4] ? (P[4].flags & ~0xF000 | (6 << 12)) : proto.flags;
      w.addIcon({ bbox: { x0: lb.x0, y0: y + 2, x1, y1: y + 18 }, flags: f >>> 0, text: label, bufLen: 40 });
      if (!noSize) w.addIcon({ bbox: { x0: sizeX0, y0: y + 2, x1: sizeX1, y1: y + 18 }, flags: P[5].flags >>> 0, text: `${k}K`, bufLen: 20 });
      const colour = area ? 11 : barColour;
      if (!noBar) {
        const bf = (P[6].flags & ~(15 << 28)) | ((colour & 15) << 28);
        const bw = kToW(k);
        if (bw > 0) w.addIcon({ bbox: { x0: barX, y0: y + 5, x1: barX + bw, y1: y + 15 }, flags: bf >>> 0 });
      }
      this.rows.push({ y0: y, y1: y + ROW, task, label, area: noBar ? null : area, draggable: !!area && !noBar });
      y += ROW;
    };
    this._barX = barX;
    y -= 2;
    hdr(0);
    for (const t of mem.apps) row(t.name, memory.slotK(t), { task: t });
    row('Next', mem.next, { proto: P[7], area: 'next' });
    row('Free', mem.free, { proto: P[9], area: 'free' });
    hdr(1);
    const s = mem.sys;
    // red bars can be dragged; the screen only when it is in DRAM (on a Risc PC it is the VRAM)
    const sysRows = [['Screen memory', s.screen, mem.screen.inVRAM || mem.vramK ? null : 'screen'], ['Cursor/System/Sound', s.cursor], ['System heap/stack', s.heap], ['Module area', s.module],
      ['Font cache', s.fontcache, 'fontcache'], ['System sprites', s.sprites, 'sprites'], ['RAM disc', s.ramdisc, 'ramdisc'],
      ['Applications (free)', mem.free + mem.next], ['Applications (used)', mem.used], ['System workspace', s.workspace]];
    for (const [l, k, area] of sysRows) row(l, k, { proto: P[11], area });
    row('Total', mem.total, { proto: P[21], barColour: 13 });
    hdr(2);
    for (const t of wimp.tasks.filter((t) => t.kind === 'module' && t !== wimp.systemTask && t.name)) row(t.name, 0, { task: t, noSize: true, noBar: true });
    row('Free in Module area', 212, { proto: P[22], noBar: true });
    row('Largest block', 96, { proto: P[23], noBar: true });
    hdr(3);
    for (const [l, k] of [['Kernel buffers', 16], ['Sprite area', 0], ['Draw module workspace', 4]]) row(l, k, {});
    const old = w.extent;
    const ext = { x0: old.x0, y0: px(P[0]).y0 - 4, x1: extX1, y1: y + 8 };
    const showedAll = w.isOpen && w.w >= old.x1 - old.x0;
    w.extent = ext;
    // a window showing its whole width follows the extent as the RAM size changes
    if (w.isOpen) w.open(showedAll && old.x1 !== ext.x1 ? { w: ext.x1 - ext.x0 } : {});
  }

  click(ev) {
    if (ev.button === 'menu') {
      const r = this.rows?.find((q) => ev.y >= q.y0 && ev.y < q.y1 && q.task);
      this.menu(ev, r?.task ?? null);
      return true;
    }
    if (ev.kind === 'click') this._barDrag(ev);
  }

  /** Red bars can be dragged to change memory allocation (Next slot, Free, RAM disc, font cache ...). */
  _barDrag(ev) {
    const r = this.rows?.find((q) => ev.y >= q.y0 && ev.y < q.y1 && q.draggable);
    if (!r || ev.x < this._barX - 4) return;
    const setK = (x) => { memory.setArea(r.area, barK((x - this._barX) * 2)); this.refresh(); };
    setK(ev.x);
    // until the button is released (a click that has already ended moves nothing)
    const stop = startPointerDrag({}, {
      onMove: (q, pe) => { if (!pe.buttons) { stop(); return; } const wp = this.win.screenToWork(q.x, q.y); setK(wp.x); },
    });
  }

  // ------------------------------------------------------------ menu
  menu(ev, task = null) {
    const quitMenu = new Menu(this.m('T02'), [{ text: this.m('M12'), action: () => this.quitTask(task) }]);
    const newTask = new Menu(this.m('T01'), [{ text: '', writable: { value: '', maxLen: 255 }, action: (e) => { if (e.value) os.cli.run(e.value).catch((err) => wimp.reportError(err.message, { appName: 'Task Manager' })); } }]);
    const [shTxt, shKey] = this.m('M08').split(/\s{2,}/);
    const [cmTxt, cmKey] = this.m('M03').split(/\s{2,}/);
    const [twTxt, twKey] = this.m('M04').split(/\s+(?=\^)/);
    const m = new Menu(this.m('T00'), [
      { text: this.m('M00'), submenu: () => this.infoBox() },
      { text: this.m('M01'), submenu: newTask },
      { text: task ? this.m('M02b', task.name) : this.m('M02a'), submenu: task ? quitMenu : null, shaded: !task || task.kind !== 'app', showArrowWhenShaded: true },
      { text: cmTxt, key: cmKey, action: () => os.cli.open() },
      { text: twTxt, key: twKey, action: () => wimp.emit('hotkey:CtrlF12', {}) },
      // !GraphTask's window at BASIC's > prompt (*GraphTask starts it if need be): src/apps/GraphTask
      {
        text: 'Graphics task window', shaded: () => !os.cli.find('graphtask'),
        action: () => os.cli.run('GraphTask').catch((err) => wimp.reportError(err.message, { appName: 'Task Manager' })),
        help: 'Click SELECT to open a graphics task window at BASIC\'s > prompt (GraphTask).',
      },
      { text: this.m('M05'), submenu: () => this.bootBox() },
      { text: this.m('M06'), action: () => this.exitDesktop() },
      { text: shTxt, key: shKey, action: () => this.shutdown() },
    ]);
    if (ev.iconbarItem || ev.window?._isIconbar) wimp.menus.openIconbar(m, ev.sx, { task: this.task });
    else wimp.menus.open(m, ev.sx - 32, ev.sy, { task: this.task });
  }

  infoBox() {
    const w = wimp.createWindowFromTemplate(this.tpl, 'proginfo', {}, this.task);
    w.icons[0].setText('    RISC OS 3.71');
    w.icons[2].setText('© Acorn Computers Ltd, 1997');
    w.icons[3].setText('3.71 (19 Feb 1997)');
    w.icons[7]?.setState({ deleted: true });
    w.on('menuclosed', () => w.delete());
    return w;
  }

  bootBox() {
    const box = saveAs({ task: this.task, title: 'Save boot file', filename: '!Boot', filetype: 0xFEA, getData: async () => this.desktopBootText() });
    box.on('menuclosed', () => box.delete());
    return box;
  }

  desktopBootText() {
    let s = `|| Desktop boot file, saved at ${new Date().toUTCString()}\n\n`;
    for (const v of os.filer.viewers.values()) s += `Filer_OpenDir ${v.path} ${Math.round(v.win.x * 2)} ${Math.round((wimp.height - v.win.y) * 2)} ${v.win.w * 2} ${v.win.h * 2}\n`;
    for (const t of wimp.tasks.filter((t) => t.kind === 'app' && t.app?.appDir)) s += `Run ${t.app.appDir}\n`;
    return s;
  }

  async quitTask(task) {
    if (!task) return;
    const ev = { objected: false, object() { this.objected = true; } };
    wimp.sendMessage('PreQuit', { ...ev, single: true, object: () => { ev.objected = true; } }, { to: task });
    if (!ev.objected) { wimp.sendMessage('Quit', {}, { to: task }); if (task.alive) task.quit(); }
  }

  /** Ask every application task whether it may quit. Resolves true if all agree. */
  async preQuitAll() {
    let objected = false;
    for (const t of wimp.tasks.filter((t) => t.kind === 'app')) {
      wimp.sendMessage('PreQuit', { object: () => { objected = true; } }, { to: t });
      if (objected) return false;
    }
    return true;
  }

  async exitDesktop() {
    if (!(await this.preQuitAll())) return;
    for (const t of wimp.tasks.filter((t) => t.kind === 'app')) { wimp.sendMessage('Quit', {}, { to: t }); t.quit(); }
    for (const v of [...os.filer.viewers.values()]) v.close();
    os.cli.open({ exited: true });
  }

  async shutdown() {
    wimp.menus.close();
    if (!(await this.preQuitAll())) return;
    for (const t of wimp.tasks.filter((t) => t.kind === 'app')) { wimp.sendMessage('Quit', {}, { to: t }); t.quit(); }
    for (const v of [...os.filer.viewers.values()]) v.close();
    const w = wimp.createWindowFromTemplate(this.tpl, 'shutdown', { title: '' }, this.task);
    w.on('click', (ev) => { if (ev.icon === w.icons[1]) location.reload(); });
    w.on('key', (ev) => { if (ev.code === 13) location.reload(); return true; });
    w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
    wimp.setCaret(w);
    const shield = el('div', 'modal-shield', wimp.layers.modal);
    shield.style.pointerEvents = 'none';
  }
}

export const switcher = new Switcher();
