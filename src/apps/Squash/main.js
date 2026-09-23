// !Squash 0.49 (RISC OS 3.71) - native port of Sources/Apps/Squash/c/main + c/squash.
//
// Icon bar icon only (clicking it does nothing). Files dropped on it are queued; each one gets a
// Save box (if "Save Box" is ticked): a file_fca icon when compressing, or the original type's
// icon when decompressing. OK with a full path or dragging the icon to a directory display
// squashes to that name; the same name squashes in place. Directories get the Squash template's
// "xfer_dir" box with Squash / Unsquash radio buttons and are processed recursively (applications
// are copied unless "Squash Apps" is ticked). Without the Save box files are squashed in place.
// Files are only compressed if that makes them smaller (else left alone / copied).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { saveAs } from '../../core/dialogs.js';
import { os } from '../../core/os.js';
import { squashFile, unsquashFile, isSquashed, SQUASH_TYPE, HEADER_SIZE, SquashError } from './lzw.js';

let M = null;
const msg = (t, ...a) => (M ? M.lookup(t, ...a) : t);

function objError(text, name) {
  wimp.reportError(name != null ? `Squash (object '${name}'): ${text}` : `Squash: ${text}`, { appName: 'Squash' });
}

/** do_squash(): compress or decompress one file from -> to (to === from: in place). */
export async function squashObject(from, to = from) {
  const vfs = os.vfs;
  M ??= await loadMessages('Squash');
  let st;
  try { st = vfs.stat(from); if (!st) throw new Error(`File '${from}' not found`); } catch (e) { objError(e.message, from); return false; }
  if (st.type === 'dir') return true;
  const inPlace = vfs.canonical(from).toLowerCase() === (vfs.exists(to) ? vfs.canonical(to).toLowerCase() : String(to).toLowerCase());
  const copy = async () => { if (!inPlace) await vfs.copy(from, to); };
  try {
    if (inPlace && st.locked) throw new Error(`File '${st.name}' is locked`);
    if (st.size <= HEADER_SIZE) { await copy(); return true; }        // very small files: nothing
    const data = await vfs.readFile(from);
    const decompress = (st.load >>> 20) === 0xFFF && st.filetype === SQUASH_TYPE;
    if (!decompress) {
      const out = squashFile(data, st.load, st.exec);
      if (!out) { await copy(); return true; }                            // no improvement
      const p = vfs.writeFile(to, out, { load: st.load, exec: st.exec });
      vfs.setType(p, SQUASH_TYPE);
    } else {
      if (!isSquashed(data)) throw new SquashError(msg('Squash1'));
      let u;
      try { u = unsquashFile(data); } catch (e) { throw new SquashError(e instanceof SquashError && /header/i.test(e.message) ? msg('Squash1') : e.message); }
      vfs.writeFile(to, u.data, { load: u.load, exec: u.exec });
    }
    if (st.attr != null) try { vfs.setAccess(to, st.attr); } catch { /* */ }
    return true;
  } catch (e) {
    objError(e.message ?? String(e), to);
    return false;
  }
}

/** squash_dir(): all files of a directory (recursively), in place or dir to dir. */
async function squashDir(from, to, { squash, apps }) {
  const vfs = os.vfs;
  if (vfs.canonical(from).toLowerCase() !== String(to).toLowerCase() && !vfs.exists(to)) {
    try { vfs.mkdir(to); } catch (e) { objError(e.message, to); return true; }
  }
  wimp.setPointer?.('hourglass');
  try {
    for (const e of vfs.list(from)) {
      const f = `${from}.${e.name}`, t = `${to}.${e.name}`;
      if (e.type === 'dir') {
        if (apps || !e.name.startsWith('!')) await squashDir(f, t, { squash, apps });
        else if (f.toLowerCase() !== t.toLowerCase()) await vfs.copy(f, t, { recursive: true });
      } else {
        const isSq = e.filetype === SQUASH_TYPE;
        if ((squash && !isSq) || (!squash && isSq)) await squashObject(f, t);
        else if (f.toLowerCase() !== t.toLowerCase()) await vfs.copy(f, t);
      }
    }
  } finally { wimp.setPointer?.(''); }
  return true;
}

export default async function start(task, ctx) {
  const vfs = os.vfs;
  const [tpl] = await Promise.all([loadTemplates('assets/templates/Squash.json'), (async () => { M = await loadMessages('Squash'); })()]);
  // run with a file (double-click on a Squash file): squash in place and exit, like argc == 2
  if (ctx.file) { await squashObject(ctx.file, ctx.file); task.quit(); return; }

  let useSaveBox = true, squashApps = false, squashDirs = true;
  const queue = [];
  let busy = false;

  // ---------------------------------------------------------------- save boxes
  // dbox_show: the box appears at the pointer, kept on screen (above the icon bar)
  const at = (w = 150, h = 110) => ({
    x: Math.max(0, Math.min(wimp.width - w - 8, os.input.mouseX - 64)),
    y: Math.max(40, Math.min(wimp.height - 70 - h, os.input.mouseY - 20)),
  });
  function fileBox(path, type) {
    return new Promise((resolve) => {
      let done = false;
      const box = saveAs({ task, filename: path, filetype: type, save: async (to) => { await squashObject(path, to); done = true; } });
      box.on('menuclosed', () => { setTimeout(() => { box.delete(); resolve(done); }, 0); });
      const p = at(box.w, box.h);
      wimp.menus.open(box, p.x, p.y, { task });
      wimp.setCaret(box, box.icons[1], box.icons[1].text.length);
    });
  }
  function dirBox(path, type) {
    return new Promise((resolve) => {
      const w = wimp.createWindowFromTemplate(tpl, 'xfer_dir', {}, task);
      const I = w.icons;
      const leaf = (p) => String(p).slice(String(p).lastIndexOf('.') + 1);
      I[3].setText('');
      I[3].flags = ((I[3].flags & ~0xF001) | 2 | (6 << 12)) >>> 0;
      I[3].setSprite(type === 0x2000 ? 'application' : 'directory');
      I[2].bufLen = 256; I[2].setText(path);
      squashDirs = true;
      const radios = () => { I[1].setState({ selected: squashDirs }); I[4].setState({ selected: !squashDirs }); };
      radios();
      let done = false;
      const go = async (to) => { done = true; wimp.menus.close(); await squashDir(path, to, { squash: squashDirs, apps: squashApps }); };
      const ok = () => { const t = I[2].text; if (!/[.:]/.test(t)) { objError(msg('Squash3')); return; } go(t); };
      w.on('click', (ev) => {
        if (ev.button === 'menu') return true;
        if (ev.icon === I[1]) { squashDirs = true; radios(); }
        else if (ev.icon === I[4]) { squashDirs = false; radios(); }
        else if (ev.icon === I[0]) ok();
        return true;
      });
      w.on('drag', (ev) => {
        if (ev.icon !== I[3]) return;
        const b = I[3].bbox, p = w.workToScreen(b.x0, b.y0);
        wimp.drag({ sprite: I[3].spriteName, box: { x0: p.x, y0: p.y, x1: p.x + 34, y1: p.y + 34 }, event: ev.pointerEvent }).then((drop) => {
          const fdir = drop.window?._filerDir;
          if (fdir) go(`${fdir}.${leaf(I[2].text)}`);
        });
        return true;
      });
      w.on('key', (ev) => { if (ev.code === 13) { ok(); return true; } return false; });
      w.on('menuclosed', () => { setTimeout(() => { w.delete(); resolve(done); }, 0); });
      const p = at(w.w, w.h);
      wimp.menus.open(w, p.x, p.y, { task });
      wimp.setCaret(w, I[2], I[2].text.length);
    });
  }

  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const f = queue.shift();
        const st = vfs.stat(f.path);
        if (!st) continue;
        if (st.type === 'dir') {
          if (!(await dirBox(st.path, st.isApp ? 0x2000 : 0x1000))) queue.length = 0;
        } else if (useSaveBox) {
          let type = SQUASH_TYPE;
          if (st.filetype === SQUASH_TYPE) {
            try {
              const h = await vfs.readFile(st.path);
              const load = (h[8] | (h[9] << 8) | (h[10] << 16) | (h[11] << 24)) >>> 0;
              type = isSquashed(h) ? ((load >>> 20) === 0xFFF ? (load >>> 8) & 0xFFF : 0xFFD) : 0xFFD;
            } catch { type = 0xFFD; }
          }
          if (!(await fileBox(st.path, type))) queue.length = 0;       // free_all() when cancelled
        } else await squashObject(st.path, st.path);
      }
    } finally { busy = false; }
  }
  const drop = (files) => { for (const f of files ?? []) if (f?.path) queue.push(f); pump(); };

  // ---------------------------------------------------------------- icon bar
  const menu = () => new Menu(msg('TaskId'), [
    { text: 'Info', submenu: () => {
      const w = wimp.createWindowFromTemplate(tpl, 'ProgInfo', {}, task);
      w.icons[4].setText(msg('Version'));
      w.icons[0]?.setState({ deleted: true });
      w.on('menuclosed', () => w.delete());
      return w;
    } },
    { text: 'Save Box', ticked: () => useSaveBox, action: () => { useSaveBox = !useSaveBox; } },
    { text: 'Squash Apps', ticked: () => squashApps, action: () => { squashApps = !squashApps; } },
    { text: 'Quit', action: () => task.quit() },
  ]);
  task.addIconbarIcon({
    sprite: ctx.app.sprite, side: 'right',
    onClick: () => {},                       // "Clicking on the icon has no effect"
    menu, help: msg('HelpTxt'),
    onDataLoad: (ev) => { drop(ev.files); return true; },
  });
  task.onMessage('DataLoad', (m) => { if (m.iconbar?.task === task) { drop(m.files); return true; } });
  task.on('run', ({ file }) => { if (file) squashObject(file, file); });
  task.onMessage('Quit', () => task.quit());

  task.squash = { drop, squashObject, get queue() { return queue; } };
}
