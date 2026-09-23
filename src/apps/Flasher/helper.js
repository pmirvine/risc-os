// The Minerva Software Text Reader (!Flasher.!Help): port of its BASIC !Help program (Merlyn Kline 1989).
// Reads <dir>^.HelpText: first two non-';' lines are the program name and title, then the text,
// 17 lines a page (lines cut to 55 chars). "*>Name[:text]" lines make index entries (up to 9) shown
// on the right; clicking an index arrow jumps to its page. Up/Back Page = previous page, Down/Fwd Page
// = next (ADJUST reverses); pages wrap round. Closing the window quits.

import { parseTemplateFile } from '../../core/templates.js';
import { parseMessagesText, Messages } from '../../core/messages.js';
import { os } from '../../core/os.js';

export default async function start(task, ctx) {
  const vfs = os.vfs, wimp = os.wimp;
  const dir = ctx.app.appDir;
  const parent = dir.replace(/\.[^.]*$/, '');
  const M = new Messages('Helper', parseMessagesText(await vfs.readText(dir + '.Messages')));
  const tpl = parseTemplateFile(await vfs.readFile(dir + '.Templates'));
  const w = wimp.createWindowFromTemplate(tpl, 'Text', {}, task);
  w.setTitle(M.lookup('Title', M.lookup('Version')));

  // PROCloadhelp
  let text;
  try { text = await vfs.readText(parent + '.HelpText'); } catch { task.reportError(M.lookup('E06', parent + '.HelpText')); task.quit(); return; }
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let li = 0;
  const getstr = () => { let t; do { t = lines[li++] ?? ''; } while (t.startsWith(';') && li < lines.length); return t; };
  const prog = getstr(), titl = getstr();
  const pages = [[]];                 // pages[0] unused (1-based like the original)
  let line = 9999;
  const pindex = [];
  let index = 0;
  const setIcon = (i, t) => { const ic = w.icons[i]; if (ic) ic.setText(String(t).slice(0, Math.max(0, (ic.bufLen ?? 12) - 1))); };
  const buffer = (T) => {
    while (T.startsWith('*>')) {       // PROCindex
      let I = T.indexOf(':'); if (I < 0) I = T.length;
      const A = T.slice(0, I); T = T.slice(I + 1);
      if (index <= 8) { setIcon(index + 9, A.slice(2)); pindex[index] = pages.length - 1; index++; }
      if (T === '') return;
    }
    T = T.slice(0, 55);
    if (line > 16) { pages.push([]); line = 0; }
    pages[pages.length - 1].push(T); line++;
  };
  while (li < lines.length) buffer(getstr());
  const maxpage = pages.length - 1;
  for (let I = index; I < 9; I++) setIcon(I + 9, '');

  // PROCstartup: application sprite and name
  const leaf = parent.replace(/^.*\./, '');
  w.icons[23]?.setValidation('s' + leaf);
  w.icons[23] && (w.icons[23].spriteName = leaf);
  w.icons[23]?.render();
  setIcon(24, (prog + ' ' + titl).slice(0, 42));

  let page = 1;
  function show(T) {                   // PROCpage
    page = T;
    if (page > maxpage) page = 1;
    if (page < 1) page = maxpage;
    const pl = pages[page] ?? [];
    for (let I = 27; I < 44; I++) setIcon(I, pl[I - 27] ?? '');
    setIcon(26, M.lookup('Page', String(page), String(maxpage)));
  }
  show(1);

  w.on('click', (ev) => {
    if (ev.button === 'menu') return;
    const mi = ev.iconIndex, sel = ev.button === 'select';
    if (mi === 20 || mi === 22) show(sel ? page - 1 : page + 1);
    else if (mi === 19 || mi === 21) show(sel ? page + 1 : page - 1);
    else if (mi >= 0 && mi <= 17) {
      const p = pindex[mi % 9];
      if (!p) wimp.beep(); else show(p);
    } else if (mi === 25) task.reportError(M.lookup('E07'));
    return true;
  });
  w.on('close', () => task.quit());
  task.onMessage('Quit', () => task.quit());
  w.open({ behind: 'top' });
}
