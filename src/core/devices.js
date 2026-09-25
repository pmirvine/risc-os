// Icon bar device icons (ADFSFiler: floppy :0 and HardDisc4, RAMFSFiler, ResourceFiler "Apps"),
// the Free space window, and the Display Manager.

import { wimp } from './wimp.js';
import { vfs } from './vfs.js';
import { Menu } from './menu.js';
import { loadTemplates } from './templates.js';
import { loadMessages } from './messages.js';
import { query } from './dialogs.js';
import { os } from './os.js';

export async function initDevices() {
  const [adfsM, ramM, resM, freeTpl, freeM, dispTpl, dispM] = await Promise.all([
    loadMessages('ADFSFiler'), loadMessages('RAMFSFiler'), loadMessages('ResFiler'),
    loadTemplates('assets/templates/Free.json'), loadMessages('Free'),
    loadTemplates('assets/templates/Display.json'), loadMessages('Display'),
  ]);
  const adfsTask = wimp.createTask('ADFS Filer', { kind: 'module', memory: 0 });
  const ramTask = wimp.createTask('RAMFS Filer', { kind: 'module', memory: 0 });
  const resTask = wimp.createTask('Resource Filer', { kind: 'module', memory: 0 });
  const freeTask = wimp.createTask('Free', { kind: 'module', memory: 0 });

  // ------------------------------------------------------------------ Free window
  const showFree = (disc) => {
    const label = disc.fs === 'Resources' ? 'Resources' : `${disc.fs}::${disc.name}`;
    const w = wimp.createWindowFromTemplate(freeTpl, 'free', { title: freeM.lookup('FSP', label) }, freeTask);
    const I = w.icons;
    const upd = () => {
      const u = vfs.usage(disc);
      const k = (n) => (n >= 10 * 1024 * 1024 ? `${Math.round(n / (1024 * 1024))}M` : `${Math.round(n / 1024)}K`);
      I[7].setText(k(u.free)); I[1].setText(k(u.used)); I[8].setText(k(u.size));
      for (const i of [9, 10, 11]) I[i].setState({ deleted: true });
      const box = I[0].bbox;
      const full = box.x1 - box.x0 - 6;
      const bar = (ic, frac) => { const b = ic.bbox; ic.moveTo({ ...b, x1: b.x0 + Math.max(0, Math.round(full * frac)) }); };
      bar(I[6], u.free / u.size); bar(I[4], u.used / u.size); bar(I[5], 1);
    };
    upd();
    const off = vfs.on('change', upd);
    w.on('deleted', off);
    w.on('close', (ev) => { ev.preventDefault(); w.delete(); });
    w.open({ x: Math.round(wimp.width / 2 - w.w / 2), y: Math.round(wimp.height / 3), behind: 'top' });
    return w;
  };
  os.free = { showDisc: showFree, show: (spec) => { const d = vfs.discs.find((x) => spec.toLowerCase().includes(x.name.toLowerCase())) ?? vfs.hd; showFree(d); } };

  // ------------------------------------------------------------------ ADFS
  const openRoot = (disc, ev) => {
    const path = disc.prefix + '$';
    os.filer.openDir(path);
  };
  const dismount = (disc) => { for (const v of [...os.filer.viewers.values()]) if (vfs.discOf(v.path) === disc) v.close(); };
  const adfsMenu = (disc, item, isFloppy) => () => {
    const fmts = new Menu(adfsM.lookup('T03'), [
      { text: 'ADFS 800K (E)', action: () => format(disc) },
      { text: 'ADFS 1.6M (F)', action: () => format(disc) },
      { text: 'ADFS 800K (D)', action: () => format(disc) },
      { text: 'ADFS 640K (L)', action: () => format(disc) },
    ]);
    const name = new Menu(adfsM.lookup('T01'), [{ text: '', writable: { value: disc.name === '0' ? '' : disc.name, maxLen: 10, validation: 'A~ .:*#$&@^%\\"|' }, action: (e) => {
      if (!e.value || e.value.length < 2) { wimp.reportError(adfsM.lookup('TooShrt'), { appName: 'ADFS Filer' }); return; }
      dismount(disc); vfs.nameDisc(disc, e.value); if (!isFloppy) wimp.iconbar.update(item, { text: e.value });
    } }]);
    const share = new Menu(adfsM.lookup('T02'), [{ text: adfsM.lookup('M12') }, { text: adfsM.lookup('M22') }, { text: adfsM.lookup('M32') }]);
    return new Menu(`ADFS::${disc.drive}`, [
      { text: adfsM.lookup('M01'), submenu: name },
      { text: adfsM.lookup('M02'), action: () => dismount(disc) },
      { text: adfsM.lookup('M03'), submenu: isFloppy ? fmts : null, shaded: !isFloppy, showArrowWhenShaded: true },
      { text: adfsM.lookup('M04'), shaded: !isFloppy, submenu: null },
      { text: adfsM.lookup('M05'), submenu: share, shaded: true, showArrowWhenShaded: true },
      { text: adfsM.lookup('M06'), action: () => verify(disc) },
      { text: adfsM.lookup('M07'), action: () => showFree(disc) },
    ]);
  };
  const format = async (disc) => {
    const r = await query({ task: adfsTask, title: adfsM.lookup('TF', 'ADFS 1.6M'), message: 'Formatting will destroy all data on the disc in drive 0. Are you sure?', buttons: [adfsM.lookup('BF'), 'Cancel'] });
    if (r !== adfsM.lookup('BF')) return;
    dismount(disc); vfs.wipe(disc);
    wimp.reportError(adfsM.lookup('FOK'), { appName: 'ADFS Filer', category: 'info' });
  };
  const verify = (disc) => wimp.reportError(adfsM.lookup('VOK'), { appName: 'ADFS Filer', category: 'info' });

  const floppy = wimp.iconbar.add({ task: adfsTask, side: 'left', priority: 0x70000000, sprite: 'floppydisc', text: ':0', onClick: (ev) => openRoot(vfs.floppy, ev) });
  floppy.menu = adfsMenu(vfs.floppy, floppy, true);
  floppy.onDataLoad = (ev) => { import('./fileraction.js').then(({ fileAction }) => fileAction(ev.shift ? 'move' : 'copy', ev.files.map((f) => f.path), vfs.floppy.prefix + '$', os.filer.options)); };
  const hd = wimp.iconbar.add({ task: adfsTask, side: 'left', priority: 0x60000000, sprite: 'harddisc', text: vfs.hd.name, onClick: (ev) => openRoot(vfs.hd, ev) });
  hd.menu = adfsMenu(vfs.hd, hd, false);
  hd.onDataLoad = (ev) => { import('./fileraction.js').then(({ fileAction }) => fileAction(ev.shift ? 'move' : 'copy', ev.files.map((f) => f.path), vfs.hd.prefix + '$', os.filer.options)); };

  // ------------------------------------------------------------------ RAM disc
  let ram = null;
  const addRam = () => {
    ram = wimp.iconbar.add({ task: ramTask, side: 'left', priority: 0x50000000, sprite: 'ramfs', text: ramM.lookup('IconTxt'), onClick: () => openRoot(vfs.ram) });
    ram.menu = () => new Menu(ramM.lookup('MTitle'), [
      { text: ramM.lookup('MFree'), action: () => showFree(vfs.ram) },
      { text: ramM.lookup('MQuit'), action: async () => {
        if (vfs.ram.root.children.size) {
          const r = await wimp.reportError(ramM.lookup('HasData'), { title: ramM.lookup('RFSMess'), cancel: true, category: 'question' });
          if (r !== 1) return;
        }
        dismount(vfs.ram); vfs.wipe(vfs.ram); wimp.iconbar.remove(ram); ram = null;
      } },
    ]);
    ram.onDataLoad = (ev) => { import('./fileraction.js').then(({ fileAction }) => fileAction(ev.shift ? 'move' : 'copy', ev.files.map((f) => f.path), vfs.ram.prefix + '$', os.filer.options)); };
  };
  addRam();
  os.ramdisc = { add: () => { if (!ram) addRam(); }, remove: () => { if (ram) { dismount(vfs.ram); wimp.iconbar.remove(ram); ram = null; } }, get present() { return !!ram; } };

  // ------------------------------------------------------------------ Apps (ResourceFiler)
  const apps = wimp.iconbar.add({ task: resTask, side: 'left', priority: 0x40000000, sprite: 'romapps', text: 'Apps', onClick: () => os.filer.openDir('Resources:$.Apps') });
  apps.menu = () => new Menu(resM.lookup('T00'), [{ text: resM.lookup('M02'), action: () => os.filer.openDir('Resources:$') }]);

  // ------------------------------------------------------------------ Display manager
  const dispTask = wimp.createTask('Display Manager', { kind: 'module', memory: 0 });
  let dispWin = null;
  const RES = [[640, 480], [800, 600], [1024, 768], [1152, 864], [1280, 1024], [1600, 1200]];
  const colourNames = ['M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17', 'M18'].map((t) => dispM.lookup(t));
  let sel = { colours: 5, res: null, rate: 60 };
  const resText = (r) => (r ? `${r[0]} x ${r[1]}` : `${wimp.width} x ${wimp.height}`);
  const openDisplay = () => {
    if (dispWin) { dispWin.open({ behind: 'top' }); return; }
    const w = dispWin = wimp.createWindowFromTemplate(dispTpl, 'display', { title: dispM.lookup('Title') }, dispTask);
    const I = w.icons;
    const upd = () => { I[4].setText(colourNames[sel.colours]); I[5].setText(resText(sel.res ?? wimp.mode)); I[9].setText(`${sel.rate}Hz`); };
    upd();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const at = (ic) => { const p = w.workToScreen(ic.bbox.x1, ic.bbox.y0); return p; };
      if (ev.icon === I[3]) {
        const p = at(I[3]);
        wimp.menus.open(new Menu(dispM.lookup('T01'), colourNames.map((n, i) => ({ text: n, ticked: () => sel.colours === i, shaded: i < 3, action: () => { sel.colours = i; upd(); } }))), p.x, p.y, { task: dispTask });
      } else if (ev.icon === I[7]) {
        const p = at(I[7]);
        wimp.menus.open(new Menu(dispM.lookup('T02'), [{ text: `Window (${window.innerWidth} x ${window.innerHeight})`, ticked: () => !sel.res, action: () => { sel.res = null; upd(); } }, ...RES.map((r) => ({ text: resText(r), ticked: () => sel.res === r, action: () => { sel.res = r; upd(); } }))]), p.x, p.y, { task: dispTask });
      } else if (ev.icon === I[10]) {
        const p = at(I[10]);
        wimp.menus.open(new Menu(dispM.lookup('T03'), [60, 72, 75].map((r) => ({ text: `${r}Hz`, ticked: () => sel.rate === r, action: () => { sel.rate = r; upd(); } }))), p.x, p.y, { task: dispTask });
      } else if (ev.icon === I[1]) {
        wimp.setMode(sel.res ? { width: sel.res[0], height: sel.res[1] } : null, { greys: sel.colours === 4 || sel.colours === 1 || sel.colours === 2 });
        w.close();
      } else if (ev.icon === I[6]) w.close();
    });
    w.on('closed', () => {});
    w.open({ x: Math.round(wimp.width / 2 - w.w / 2), y: Math.round(wimp.height / 3), behind: 'top' });
  };
  const disp = wimp.iconbar.add({ task: dispTask, side: 'right', priority: 0x68000000, sprite: 'display', onClick: openDisplay });
  disp.menu = () => new Menu(dispM.lookup('T00'), [
    { text: dispM.lookup('M01'), submenu: () => { const w = wimp.createWindowFromTemplate(dispTpl, 'info', {}, dispTask); w.icons[3].setText(dispM.lookup('Version')); w.on('menuclosed', () => w.delete()); return w; } },
    { text: dispM.lookup('M02'), submenu: () => {
      const w = wimp.createWindowFromTemplate(dispTpl, 'mode', { title: 'Mode' }, dispTask);
      w.icons[0].setText(`X${wimp.width} Y${wimp.height} C256`);
      const go = () => {
        const m = /x\s*(\d+).*?y\s*(\d+)/i.exec(w.icons[0].text);
        if (m) wimp.setMode({ width: +m[1], height: +m[2] });
        wimp.menus.close();
      };
      w.on('click', (ev) => { if (ev.icon === w.icons[1] && ev.button !== 'menu') go(); });
      w.on('key', (ev) => { if (ev.code === 13) { go(); return true; } });
      w.on('menuclosed', () => w.delete());
      return w;
    } },
  ]);
}
