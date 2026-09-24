// !AccessCD 1.02 - sets the size of the AccessCD data cache used when CD-ROMs are shared over Access, and
// keeps the list of shared CDs (!AccessCD.sharecd). Resources.!RunImage is ARM code with no source in vendor/;
// behaviour from its Templates (progInfo, Cache), Messages, !Help and !Run / !RunCDFS:
//   * icon bar icon; Select opens "Set cache": Cache size [    ] K with ↓/↑ adjusters (Select +, Adjust -),
//     Save (write the size to !AccessCD.Config and use it), Cancel, OK (use it for this session).
//   * menu "AccessCD": Info ▸, Quit.
//   * CD shares saved in sharecd (made through the CDFS icon bar menu) are re-shared at start. There is no
//     CD-ROM drive, so there is nothing to share: a saved CD share whose drive is missing is skipped.
import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';
import * as sfs from './sharefs.js';

let M = null;
const clean = (s) => String(s ?? '').replace(/\0/g, '').trimEnd();
const msg = (t) => clean(M ? M.lookup(t) : t);
export const STEP = 16, MIN = 0, MAX = 16384;

export default async function start(task, ctx) {
  const vfs = os.vfs, sv = os.sysvars;
  if (sv.get('AccessCDS$Running')) { task.reportError('AccessCDS is already running.'); task.quit(); return; }
  if (sv.get('AccessCD$Running')) { task.reportError('AccessCD is already running. Cannot start AccessCDS'); task.quit(); return; }
  const [tpl] = await Promise.all([loadTemplates('assets/templates/AccessCD.json'), (async () => { M = await loadMessages('AccessCD'); })()]);
  const dir = ctx.dir ?? ctx.app.appDir;
  const cfg = `${dir}.Config`;
  sv.set('AccessCD$Running', 'Yes');
  task.on('quit', () => sv.unset('AccessCD$Running'));

  let size = 256;
  try { const t = parseInt(await vfs.readText(cfg), 10); if (Number.isFinite(t)) size = t; } catch { /* */ }
  sv.set('AccessCD$CacheSize', String(size));

  // re-share saved CD shares (each line: "<discname> <cd path> [options]"); no CD drive here
  try {
    for (const l of (await vfs.readText(`${dir}.sharecd`)).split(/\r?\n/)) {
      const [name, path, ...opts] = l.trim().split(/\s+/);
      if (!name || !path || !vfs.isDir(path)) continue;
      try { sfs.share(vfs, path, name, { cdrom: true, readonly: true, protected: opts.includes('-protected') }); } catch { /* */ }
    }
  } catch { /* */ }

  let win = null;
  function cacheBox() {
    if (win) return win;
    win = wimp.createWindowFromTemplate(tpl, 'Cache', {}, task);
    const I = win.icons;
    win.helpText = msg('CDIAL').replace(/\\w/g, 'window');
    for (const [i, t] of Object.entries({ 0: 'C_0', 1: 'C_1', 3: 'C_3', 4: 'C_4', 5: 'C_5', 6: 'C_6' })) if (I[i]) I[i].help = msg(t);
    const value = () => Math.max(MIN, Math.min(MAX, parseInt(I[0].text, 10) || 0));
    const bump = (d) => { I[0].setText(String(Math.max(MIN, Math.min(MAX, value() + d)))); wimp.setCaret(win, I[0], I[0].text.length); };
    const use = () => { size = value(); sv.set('AccessCD$CacheSize', String(size)); };
    win.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      const adj = ev.button === 'adjust';
      if (ev.icon === I[4]) bump(adj ? -STEP : STEP);
      else if (ev.icon === I[5]) bump(adj ? STEP : -STEP);
      else if (ev.icon === I[6]) { use(); if (!adj) win.close(); }
      else if (ev.icon === I[1]) {
        use();
        try { vfs.writeFile(cfg, `${size}\n`, { filetype: 0xFFF }); } catch (e) { task.reportError(e.message); return false; }
        if (!adj) win.close();
      } else if (ev.icon === I[3]) { if (adj) I[0].setText(String(size)); else win.close(); }
      return false;
    });
    win.on('key', (ev) => {
      if (ev.code === 13) { use(); win.close(); return true; }
      if (ev.code === 27) { win.close(); return true; }
      return false;
    });
    return win;
  }
  function openCache() {
    const w = cacheBox();
    w.icons[0].setText(String(size));
    w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2) - 40, behind: 'top' });
    wimp.setCaret(w, w.icons[0], w.icons[0].text.length);
  }
  function progInfo() {
    const w = wimp.createWindowFromTemplate(tpl, 'progInfo', {}, task);
    w.helpText = msg('PROGINFO').replace(/\\w/g, 'window');
    w.on('menuclosed', () => setTimeout(() => w.delete(), 0));
    return w;
  }
  const menu = () => new Menu(msg('Title'), [
    { text: msg('Info'), submenu: progInfo, help: msg('M_0') },
    { text: msg('Quit'), action: () => task.quit(), help: msg('M_1') },
  ]);
  task.addIconbarIcon({
    sprite: ctx.app.sprite, side: 'right',
    onClick: (ev) => { if (ev.button !== 'menu') openCache(); },
    menu,
  });
  task.onMessage('Quit', () => { task.quit(); return false; });
  task.accessCD = { openCache, get size() { return size; }, get window() { return win; } };
}
