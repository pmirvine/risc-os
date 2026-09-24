// !Access+ 1.01 - the Acorn Access+ Sharer front end (local only: shares are kept by sharefs.js and no
// other machine can see them). The original !RunImage is squeezed ARM code with no source in vendor/, so the
// behaviour comes from its Templates (progInfo, Server, Show, Quit, Ovr), Messages (menu, help, errors),
// !Help and the ShareFS 3.40 module it drives (*Share … -protected -auth <key>, *Shares -spin, *UnShare):
//
//   * icon bar icon; Select opens the share dialogue ("Server"): Directory, Password (two to six letters or
//     numbers, blank = none), "Share protected", OK / Cancel. Dragging a directory to the icon opens it with
//     the directory filled in. The disc name is the directory's leaf name (or the Directory field's text when
//     that is a plain name and a directory was dropped).
//   * menu "Access+": Info ▸, Show ▸ <shares> ▸ "About a share", Save (the shares, as *Share lines in
//     !Access+.!Shares, re-shared when Access+ next starts), Remove ▸ <shares>, Quit ("Quit" box when shares
//     are present: Quit = stop sharing, Leave = quit leaving them shared, Cancel).
//   * structured sharing: dropping a text file of "U|P <user> <key>" lines shares <Access+ parent>.Dirs.<user>
//     for each user (P = protected), plus Apps (read only) and Boot (no icon) if present, keeps the file as
//     !Access+.PINS ("Ovr" box: Replace / Add / Cancel when one exists) and saves the shares.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';
import * as sfs from './sharefs.js';

const TPL = 'assets/templates/AccessPlus.json';
let M = null;
export const clean = (s) => String(s ?? '').replace(/\0/g, '').trimEnd();
const msg = (t, ...a) => clean(M ? M.lookup(t, ...a) : t);

function centre(w) {
  w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2) - 40, behind: 'top' });
}

/** A short description of a share for the Show box's "Shared" field. */
export function describe(s) {
  const parts = [s.how.owner ? 'Unprotected' : 'Protected'];
  if (s.how.readonly) parts.push('read only');
  if (s.how.cdrom) parts.push('CD-ROM');
  if (s.how.hidden) parts.push('no icon');
  parts.push(s.pin ? 'with password' : 'no password');
  return parts.join(', ');
}

export default async function start(task, ctx) {
  const vfs = os.vfs, sv = os.sysvars;
  if (sv.get('Access+$Running')) { task.reportError('An Access+ Sharer is already running'); task.quit(); return; }
  const [tpl] = await Promise.all([loadTemplates(TPL), (async () => { M = await loadMessages('AccessPlus'); })()]);
  const dir = ctx.dir ?? ctx.app.appDir;
  const parentDir = vfs.parent(dir);
  const sharesFile = `${dir}.!Shares`, pinsFile = `${dir}.PINS`;
  sv.set('Access+$Running', 'Yes');
  task.on('quit', () => sv.unset('Access+$Running'));
  const err = (e) => task.reportError(clean(e?.message ?? e));
  const mine = new Set();                 // disc names shared by this task

  // ------------------------------------------------------------ shares
  function doShare(path, name, opts, key) {
    const pin = key ? sfs.passwordToPin(key) : 0;
    const s = sfs.share(vfs, path, name, opts, pin);
    mine.add(s.name.toLowerCase());
    return s;
  }
  async function save() {
    const lines = sfs.list().map((s) => `Share ${s.path} ${s.name} ${sfs.howPrint(s.how)}${s.pin ? `-auth ${s.pin}` : ''}`.trimEnd());
    try { vfs.writeFile(sharesFile, lines.map((l) => l + '\n').join(''), { filetype: 0xFFD }); } catch (e) { err(e); }
  }
  // re-share what was saved last time
  try {
    if (vfs.exists(sharesFile)) {
      for (const line of (await vfs.readText(sharesFile)).split(/\r?\n/)) {
        const argv = line.trim().split(/\s+/);
        if (argv[0]?.toLowerCase() !== 'share') continue;
        try { const a = sfs.parseShareArgs(argv.slice(1)); const s = sfs.share(vfs, a.path, a.name, a.opts, a.pin); mine.add(s.name.toLowerCase()); } catch { /* already shared / gone */ }
      }
    }
  } catch { /* */ }

  // ------------------------------------------------------------ share dialogue (template "Server")
  let server = null, dropped = null;
  function openServer(path = null) {
    dropped = path;
    if (!server) {
      server = wimp.createWindowFromTemplate(tpl, 'Server', {}, task);
      const I = server.icons;
      server.helpText = msg('DIALOG').replace(/\\w/g, 'window');
      const help = { 0: 'D_0', 3: 'D_3', 4: 'D_4', 5: 'D_5', 6: 'D_6' };
      for (const [i, t] of Object.entries(help)) if (I[i]) I[i].help = msg(t);
      server.on('click', (ev) => {
        if (ev.button === 'menu') return true;
        if (ev.icon === I[0]) { if (ok() && ev.button !== 'adjust') server.close(); }
        else if (ev.icon === I[5]) server.close();
        return false;
      });
      server.on('key', (ev) => {
        if (ev.code === 13) { if (ok()) server.close(); return true; }
        if (ev.code === 27) { server.close(); return true; }
        return false;
      });
    }
    const I = server.icons;
    I[3].setText(path ?? '');
    I[4].setText('');
    I[6].setState({ selected: false });
    centre(server);
    wimp.setCaret(server, I[3], I[3].text.length);
  }
  function ok() {
    const I = server.icons;
    const text = I[3].text.trim(), key = I[4].text.trim();
    let path = text, name = null;
    if (!text) { err(msg('Dir0')); return false; }
    if (dropped && !/[.:$]/.test(text)) { path = dropped; name = text; }
    if (/^sharefs:/i.test(path)) { err(msg('Inv0')); return false; }
    if (!sfs.validKey(key)) { err(msg('Pin0')); return false; }
    try { doShare(path, name, { protected: I[6].selected }, key); } catch (e) { err(e); return false; }
    return true;
  }

  // ------------------------------------------------------------ "About a share" (template "Show")
  function showBox(s) {
    const w = wimp.createWindowFromTemplate(tpl, 'Show', {}, task);
    w.helpText = msg('SHOW');
    w.icons[0].setText(s.name);
    w.icons[2].setText(s.path);
    w.icons[4].setText(describe(s));
    w.on('menuclosed', () => setTimeout(() => w.delete(), 0));
    return w;
  }
  function progInfo() {
    const w = wimp.createWindowFromTemplate(tpl, 'progInfo', {}, task);
    w.helpText = msg('PROGINFO').replace(/\\w/g, 'window');
    w.on('menuclosed', () => setTimeout(() => w.delete(), 0));
    return w;
  }

  // ------------------------------------------------------------ quit
  let quitBox = null;
  function quit() {
    if (!sfs.list().some((s) => mine.has(s.name.toLowerCase()))) { task.quit(); return; }
    quitBox ??= (() => {
      const w = wimp.createWindowFromTemplate(tpl, 'Quit', {}, task);
      const I = w.icons;
      w.on('click', (ev) => {
        if (ev.button === 'menu') return true;
        if (ev.icon === I[1]) { for (const n of mine) { try { sfs.unshare(vfs, n); } catch { /* */ } } w.close(); task.quit(); }
        else if (ev.icon === I[3]) { w.close(); task.quit(); }
        else if (ev.icon === I[2]) w.close();
        return false;
      });
      w.on('key', (ev) => { if (ev.code === 27) { w.close(); return true; } return false; });
      return w;
    })();
    centre(quitBox);
    wimp.setCaret(quitBox);
  }
  task.onMessage('Quit', () => { task.quit(); return false; });

  // ------------------------------------------------------------ structured sharing (PINS)
  function askOverwrite() {
    return new Promise((resolve) => {
      const w = wimp.createWindowFromTemplate(tpl, 'Ovr', {}, task);
      const I = w.icons;
      const done = (r) => { w.delete(); resolve(r); };
      w.on('click', (ev) => {
        if (ev.button === 'menu') return true;
        if (ev.icon === I[1]) done('replace'); else if (ev.icon === I[3]) done('add'); else if (ev.icon === I[2]) done(null);
        return false;
      });
      w.on('close', () => { done(null); return false; });
      w.on('key', (ev) => { if (ev.code === 27) { done(null); return true; } return false; });
      centre(w);
      wimp.setCaret(w);
    });
  }
  async function pinsFileDropped(path) {
    const text = (await vfs.readText(path)).replace(/\r/g, '');
    let old = '';
    try { if (vfs.exists(pinsFile)) old = await vfs.readText(pinsFile); } catch { /* */ }
    let all = text;
    if (old.trim()) {
      const r = await askOverwrite();
      if (!r) return;
      if (r === 'add') all = old.replace(/\n?$/, '\n') + text;
    }
    // the structure: Apps (read only), Boot (invisible), Dirs.<user> (one share each)
    for (const [leaf, opts] of [['Apps', { readonly: true }], ['Boot', { noicon: true }]]) {
      const p = `${parentDir}.${leaf}`;
      if (vfs.isDir(p) && !sfs.find(leaf)) try { doShare(p, leaf, opts, ''); } catch (e) { err(e); }
    }
    for (const line of text.split('\n')) {
      const m = /^\s*([UP])\s+(\S+)(?:\s+(\S+))?/i.exec(line);
      if (!m) continue;
      const [, how, user, key = ''] = m;
      if (!sfs.validKey(key)) { err(msg('Pin0')); continue; }
      const p = `${parentDir}.Dirs.${user}`;
      if (sfs.find(user)) continue;
      try { doShare(p, user, { protected: how.toUpperCase() === 'P', subdir: !!key }, key); } catch (e) { err(e); }
    }
    try { vfs.writeFile(pinsFile, all, { filetype: 0xFFF }); } catch (e) { err(e); }
    await save();
  }

  async function dropped_(files) {
    for (const f of files ?? []) {
      const st = f?.path ? vfs.stat(f.path) : null;
      if (!st) continue;
      if (st.type === 'dir') { openServer(st.path); return; }
      if (st.filetype === 0xFFF) { await pinsFileDropped(st.path); return; }
      err(msg('BadNam'));
      return;
    }
  }

  // ------------------------------------------------------------ icon bar + menu
  const shareMenu = (title, onPick, sub) => () => {
    const l = sfs.list();
    return new Menu(title, l.length ? l.map((s) => ({ text: s.name, help: sub ? undefined : msg('M_3_N'), ...(sub ? { submenu: () => showBox(s) } : { action: () => onPick(s) }) }))
      : [{ text: ' ', shaded: true }]);
  };
  const menu = () => new Menu(msg('Title'), [
    { text: msg('Info'), submenu: progInfo, help: msg('M_0') },
    { text: msg('Show'), submenu: shareMenu(msg('ShwTitl'), null, true), shaded: () => !sfs.list().length, help: msg('M_1') },
    { text: msg('Save'), action: () => save(), help: msg('M_2') },
    { text: msg('Remove'), submenu: shareMenu(msg('RemTitl'), (s) => { try { sfs.unshare(vfs, s.name); mine.delete(s.name.toLowerCase()); } catch (e) { err(e); } }), shaded: () => !sfs.list().length, help: msg('M_3') },
    { text: msg('Quit'), action: () => quit(), help: msg('M_4') },
  ]);
  task.addIconbarIcon({
    sprite: ctx.app.sprite, side: 'right',
    onClick: (ev) => { if (ev.button === 'select' || ev.button === 'adjust') openServer(); },
    menu, help: msg('ICON'),
    onDataLoad: (ev) => { dropped_(ev.files); return true; },
  });
  task.onMessage('DataLoad', (m) => { if (m.iconbar?.task === task) { dropped_(m.files); return true; } });

  task.accessPlus = { openServer, get server() { return server; }, save, dropped: dropped_, quit, shares: sfs.list };
}
