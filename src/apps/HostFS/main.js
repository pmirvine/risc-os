// !HostFS: an icon on the right of the icon bar while it runs. Select mounts a folder from this computer (the
// browser asks which); Menu: Info, Mounts..., Mount folder..., Mount read-only..., Server folders (those given
// to serve.mjs --host), Quit. The Mounts window lists every folder mounted or remembered: open, mount, dismount
// or forget it, and choose whether it's mounted when the desktop starts. Quitting leaves the mounts as they are
// (they belong to the desktop: src/core/hostfs/ui.js, os.hostfs).
import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { infoBox } from '../../core/dialogs.js';

const KIND = { fsa: 'Folder', server: 'Server folder', files: 'Snapshot' };
const STATE = { mounted: 'Mounted', offline: 'Needs permission', scanning: 'Reading...', dismounted: 'Not mounted' };
const ROW_H = 28, TOP = 34, W = 580;

export default async function start(task, ctx) {
  const H = globalThis.os?.hostfs ?? (await import('../../core/os.js')).os.hostfs;
  if (!H) { task.reportError('HostFS isn\'t available'); task.quit(); return; }
  const os = (await import('../../core/os.js')).os;

  const mountFolder = () => (H.supportsPicking() ? H.pickFolder() : H.pickReadOnly());

  // ---------------------------------------------------------------- the Mounts window
  let win = null, selected = null, list = [];
  const rows = () => list;
  const sel = () => list.find((m) => m.id === selected) ?? null;

  function build() {
    list = H.list();
    if (selected && !sel()) selected = null;
    const n = Math.max(1, list.length);
    const h = TOP + n * ROW_H + 64;
    if (!win) {
      win = task.createWindow({
        title: 'HostFS mounts', x: Math.round(wimp.width / 2 - W / 2), y: 120, w: W, h, extent: { w: W, h },
        flags: { back: true, close: true, title: true, moveable: true }, workButton: 'click',
      });
      win.helpText = 'This lists the folders from this computer that are mounted, or remembered to mount again.|MClick SELECT on one to choose it, then use the buttons.';
      win.on('click', (ev) => click(ev));
      win.on('doubleclick', (ev) => { const m = ev.icon?._mount; if (m) { selected = m.id; open(m); } return true; });
      win.on('close', (ev) => { ev.preventDefault(); win.close(); });
    }
    for (let i = win.icons.length - 1; i >= 0; i--) win.deleteIcon(i);
    const label = (x, w, text) => win.addIcon({ x, y: 8, w, h: 22, text, vcentre: true });
    label(44, 140, 'Folder'); label(192, 156, 'Kind'); label(352, 120, 'State'); label(476, 100, 'At start-up');
    const add = (spec, extra) => Object.assign(win.addIcon(spec), extra);
    list.forEach((m, i) => {
      const y = TOP + i * ROW_H;
      const pick = { button: 'click' }, row = { _mount: m };
      add({ x: 8, y: y + 1, w: 30, h: 26, sprite: m.state === 'offline' ? 'nodisc' : 'harddisc', halfSize: true, hcentre: true, ...pick }, row);
      const name = add({ x: 44, y, w: 144, h: 26, text: m.name, filled: m.id === selected, bg: 7, fg: m.id === selected ? 0 : 7, ...pick }, row);
      name.help = `This is the HostFS disc '${m.name}'.|MClick SELECT to choose it; double-click to open it.`;
      add({ x: 192, y, w: 156, h: 26, text: KIND[m.kind] + (m.readonly ? ' (read-only)' : ''), ...pick }, row);
      add({ x: 352, y, w: 120, h: 26, text: STATE[m.state] ?? m.state, ...pick }, row);
      const opt = add({
        x: 476, y, w: 96, h: 26, text: 'Mount', sprite: 'optoff', validation: 'Soptoff,opton', selected: m.kind !== 'files' && m.startup !== false,
        button: 'click', shaded: m.kind === 'files',
      }, { _startup: m });
      opt.help = m.kind === 'files' ? 'A snapshot (a read-only copy) can\'t be mounted again later.' : 'Click SELECT to choose whether this folder is mounted when the desktop starts.';
    });
    if (!list.length) win.addIcon({ x: 44, y: TOP, w: 440, h: 26, text: 'No folders are mounted. Click Mount folder... to add one.', fg: 4 });
    const by = TOP + n * ROW_H + 16, m = sel();
    const button = (x, w, text, name, shaded, help, def = false) => {
      const ic = win.addIcon({ x, y: by - (def ? 4 : 0), w, h: def ? 40 : 32, text, border: true, filled: true, hcentre: true, validation: def ? 'R6,3' : 'R5,3', button: 'click', shaded });
      ic.name = name; ic.help = help;
    };
    button(8, 136, 'Mount folder...', 'add', false, 'Click SELECT to choose a folder from this computer to mount.', true);
    button(160, 80, 'Open', 'open', !m || m.state === 'scanning', 'Click SELECT to open the chosen disc in a Filer window (mounting it first if it isn\'t).');
    button(246, 92, 'Dismount', 'dismount', !m || !['mounted', 'offline'].includes(m.state), 'Click SELECT to dismount the chosen disc. It stays in this list, and isn\'t mounted at start-up.');
    button(344, 80, 'Mount', 'mount', !m || m.state === 'mounted' || m.state === 'scanning' || m.kind === 'files', 'Click SELECT to mount the chosen folder again.');
    button(470, 100, 'Forget', 'forget', !m || !m.remembered || m.kind === 'server', 'Click SELECT to dismount the chosen folder and take it off this list.');
    win.setExtent({ x0: 0, y0: 0, x1: W, y1: h });
    if (win.isOpen) win.open({ ...win.getState(), h });
    else win._fullH = h;
  }

  async function open(m) {
    let s = null;
    if (m.state !== 'mounted') s = await H.mountRemembered(m.id);
    const name = s?.name ?? m.name;
    os.filer.openDir(`HostFS::${name}.$`);
  }

  function click(ev) {
    if (ev.button === 'menu') return;
    const ic = ev.icon;
    if (!ic) return true;
    if (ic._startup) { const m = ic._startup; if (m.kind !== 'files') H.setStartup(m.id, m.startup === false); return true; }
    if (ic._mount) { selected = ic._mount.id; build(); return true; }
    const m = sel();
    switch (ic.name) {
      case 'add': mountFolder(); break;
      case 'open': if (m) open(m); break;
      case 'mount': if (m) H.mountRemembered(m.id); break;
      case 'dismount': if (m) H.dismount(m.name).catch((e) => task.reportError(e.message)); break;
      case 'forget': if (m) H.forget(m.id); break;
    }
    return true;
  }

  const showMounts = () => {
    build();
    if (!win.isOpen) win.open({ x: win.x, y: win.y, w: W, h: win._fullH ?? win.h, behind: 'top' });
    else win.bringToFront();
  };
  const off = H.onChange(() => { if (win) build(); });

  // ---------------------------------------------------------------- icon bar
  const quit = () => { off(); win?.delete(); task.quit(); };
  const serverMenu = () => {
    return new Menu('Server', folders.map((f) => {
      const s = H.slots.find((x) => x.id === `server:${f.name}` && x.state === 'mounted');
      return { text: f.name + (f.readonly ? ' (read-only)' : ''), ticked: !!s, action: () => (s ? H.dismount(s.name) : H.mountServerFolder(f.name)).catch((e) => task.reportError(e.message)) };
    }));
  };
  const folders = await H.serverFolders();
  task.addIconbarIcon({
    sprite: '!hostfs', side: 'right',
    help: 'This is the HostFS icon.|MClick SELECT to mount a folder from this computer.|MClick MENU for the list of mounts and other options.|MThe mounts stay when HostFS quits.|MThe guide is Docs.HostFS on the hard disc.',
    onClick: (ev) => { if (ev.button === 'adjust') showMounts(); else mountFolder(); },
    menu: () => new Menu('HostFS', [
      { text: 'Info', submenu: () => infoBox(task, ctx.app?.info ?? {}) },
      { text: 'Mounts...', action: showMounts, help: 'Click SELECT to see the folders mounted or remembered, and choose which are mounted at start-up.' },
      { text: 'Mount folder...', shaded: !H.supportsPicking(), action: () => H.pickFolder(), help: 'Click SELECT to choose a folder to mount (Chrome, Edge and other Chromium browsers can change it).' },
      { text: 'Mount read-only...', action: () => H.pickReadOnly(), help: 'Click SELECT to mount a read-only copy of a folder (any browser).' },
      { text: 'Server folders', shaded: !folders.length, showArrowWhenShaded: true, submenu: folders.length ? serverMenu : null, dotted: true, help: 'Move the pointer right for the folders given to the server with node serve.mjs --host Name=/path.' },
      { text: 'Quit', action: quit, help: 'Click SELECT to quit HostFS. The folders mounted stay mounted.' },
    ]),
  });
  task.onMessage('Quit', () => { quit(); return true; });
  task.on('quit', () => off());
  task.hostfsApp = { showMounts, build: () => build(), get win() { return win; }, select: (id) => { selected = id; build(); } };   // for tests
  return task;
}
