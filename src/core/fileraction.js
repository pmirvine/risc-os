// FilerAction: background file operations with a progress window (FilerAct 'FCount' template).
//
//   fileAction(op, paths, arg, options) -> Promise
//     op: 'copy' | 'move' (arg = destination directory), 'copyas' (arg = destination path),
//         'delete', 'count', 'stamp', 'access' (arg = {set, clear, recurse}),
//         'settype' (arg = filetype), 'find' (arg = leaf name pattern)
//     options: {verbose, confirm, force, newer}

import { wimp } from './wimp.js';
import { vfs } from './vfs.js';
import { loadTemplates } from './templates.js';
import { loadMessages } from './messages.js';
import { os } from './os.js';
import { sleep } from './util.js';

let tpl, M, FM;
async function init() {
  if (tpl) return;
  [tpl, M, FM] = await Promise.all([loadTemplates('assets/templates/FilerAct.json'), loadMessages('FilerAct'), loadMessages('Filer')]);
}

// op -> [title token (Filer), activity msg, verb msg, count1 label, count2 label]
const OPS = {
  copy: ['TCopy', 29, 69, 31, 30],
  copyas: ['TCopy', 29, 69, 31, 30],
  move: ['TMove', 34, 70, 58, 30],
  delete: ['TDelete', 38, 71, 40, 39],
  count: ['TCount', 53, 74, 54, 55],
  access: ['TAccess', 43, 72, 45, 44],
  settype: ['TType', 48, 73, 50, 49],
  stamp: ['TStamp', 59, 77, 61, 60],
  find: ['TFind', 64, 78, 66, 65],
};

export async function fileAction(op, paths, arg, options = {}) {
  await init();
  const spec = OPS[op];
  const title = FM.has(spec[0]) ? FM.lookup(spec[0]) : { TAccess: 'Set access', TStamp: 'Stamp files', TFind: 'Find' }[spec[0]] ?? M.lookup(String(spec[1]));
  const show = options.verbose !== false || op === 'count' || op === 'find';
  let w = null, I;
  let aborted = false;
  const stats = { files: 0, dirs: 0, bytes: 0, total: 0 };
  if (show) {
    w = wimp.createWindowFromTemplate(tpl, 'fcount', { title }, os.filer?.task);
    I = w.icons;
    I[1].setText(M.lookup(String(spec[1])));
    I[2].setText('');
    I[15].setText('');
    for (const k of [8, 9, 11, 12, 13, 14]) I[k].setState({ deleted: true });
    I[7].setText(M.lookup('5'));
    I[10].setText(M.lookup('6'));
    I[5].setText(M.lookup(String(spec[3])));
    I[6].setText(M.lookup(String(spec[4])));
    I[3].setText('0'); I[4].setText('0');
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.icon === I[7]) { aborted = true; if (done) w.delete(); }
      if (ev.icon === I[10]) { paused = !paused; I[10].setText(M.lookup(paused ? '26' : '6')); }
    });
    w.on('close', () => { aborted = true; });
    const scr = wimp.screenRect(true);
    const x = Math.max(8, Math.min(scr.w - w.w - 24, Math.round(scr.w / 2 - w.w / 2 + (fileAction._n = ((fileAction._n ?? 0) + 1) % 5) * 16)));
    w.open({ x, y: Math.round(scr.h / 3) + fileAction._n * 16, behind: 'top' });
  }
  let paused = false, done = false;
  const upd = (name) => {
    if (!w) return;
    if (name != null) I[2].setText(name);
    const c1 = op === 'count' || op === 'find' || op === 'delete' || op === 'access' || op === 'settype' || op === 'stamp' ? stats.files : stats.files;
    const c2 = op === 'count' ? stats.bytes : op === 'copy' || op === 'copyas' || op === 'move' ? Math.max(0, stats.total - stats.bytes) : stats.dirs;
    I[3].setText(String(c1));
    I[4].setText(String(c2));
  };
  const tick = async () => { await sleep(show ? 25 : 0); while (paused && !aborted) await sleep(100); };
  const errors = [];
  const found = [];
  const walk = (p, fn) => {
    const st = vfs.stat(p);
    if (!st) return;
    fn(st);
    if (st.type === 'dir') for (const c of vfs.list(st.path)) walk(c.path, fn);
  };
  // totals for copy
  for (const p of paths) walk(p, (st) => { if (st.type === 'file') stats.total += st.size; });
  try {
    for (const p of paths) {
      if (aborted) break;
      const st = vfs.stat(p);
      if (!st) continue;
      upd(st.name);
      await tick();
      try {
        switch (op) {
          case 'copy': case 'move': case 'copyas': {
            const dest = op === 'copyas' ? arg : `${arg}.${st.name}`;
            if (op !== 'move' && vfs.canonical(dest).toLowerCase() === st.path.toLowerCase()) break;
            if (op === 'move') await vfs.move(st.path, dest, { force: options.force, newer: options.newer });
            else await vfs.copy(st.path, dest, { force: options.force, newer: options.newer, onProgress: (n) => { if (!n.isDir) { stats.files++; stats.bytes += n.size; } upd(n.name); } });
            if (st.type === 'file') { stats.files++; stats.bytes += st.size; }
            break;
          }
          case 'delete': {
            let locked = 0;
            const del = async (q) => {
              const s = vfs.stat(q);
              if (!s || aborted) return;
              if (s.type === 'dir') { for (const c of vfs.list(q)) await del(c.path); stats.dirs++; }
              else stats.files++;
              upd(s.name);
              try { vfs.delete(q, { force: options.force, recursive: true }); } catch (e) { if (s.locked) locked++; else throw e; }
            };
            await del(st.path);
            if (locked) errors.push(M.lookup('86').replace('%d', locked));
            break;
          }
          case 'count':
            walk(st.path, (s) => { if (s.type === 'file') { stats.files++; stats.bytes += s.size; } });
            break;
          case 'stamp':
            walk(st.path, (s) => { vfs.stamp(s.path); if (s.type === 'file') stats.files++; else stats.dirs++; });
            break;
          case 'settype':
            walk(st.path, (s) => { if (s.type === 'file') { vfs.setType(s.path, arg); stats.files++; } else stats.dirs++; });
            break;
          case 'access': {
            const apply = (s) => { const a = (s.attr | arg.set) & ~arg.clear; vfs.setAccess(s.path, a); if (s.type === 'file') stats.files++; else stats.dirs++; };
            if (arg.recurse) walk(st.path, apply); else apply(st);
            break;
          }
          case 'find': {
            const re = new RegExp('^' + String(arg).toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/#/g, '.') + '$');
            walk(st.path, (s) => { if (s.type === 'file') stats.files++; else stats.dirs++; if (re.test(s.name.toLowerCase())) found.push(s); });
            break;
          }
          default: break;
        }
      } catch (e) {
        errors.push(e.message ?? String(e));
      }
      upd();
    }
  } finally {
    done = true;
  }
  if (w) {
    upd('');
    I[1].setText(M.lookup('85'));

    if (op === 'find') {
      I[2].setText(found.length ? `${M.lookup('84')} ${found[0].name}` : M.lookup('93'));
      if (found[0]) os.filer?.openDir(vfs.parent(found[0].path));
    }
    I[10].setState({ deleted: true });
    I[7].setText(M.lookup('15'));
    if (op !== 'count' && op !== 'find' && !errors.length) setTimeout(() => w.delete(), 600);
    else w.on('click', (ev) => { if (ev.icon === I[7]) w.delete(); });
    w.on('close', () => w.delete());
  }
  if (errors.length) wimp.reportError(errors[0], { appName: 'Filer' });
  return { ...stats, found, errors };
}
