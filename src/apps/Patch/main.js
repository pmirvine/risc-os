// !Patch 1.32 (RISC OS 3.71) - native port of Sources/Utilities/Patches/Patch/c/Main.
//
// Icon bar icon "!patch": Select opens the "Patch target directory" window; its menu is Info ▸, Quit.
// At start-up Patch:BootStrap is read (PatchesDir:Patch:Patches → every Patch (&FC3) file in there,
// TransformsFile:Patch:Transforms), then any files named on the command line. Double-clicking a Patch
// file loads it too. Dropping an application (or any directory containing applications, or $) on the
// icon or the window scans it: each application some patch file knows about gets two lines (its
// description and path) and one line per patch, with an "Apply" or "Remove" option button when the
// patch can be applied / removed (none when the files don't match). The window menu (Patcher):
// Select all apply, Select all remove, Clear selection, Patch selected - which applies / removes
// the selected patches (patch.js) and re-checks them.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages, parseMessagesText } from '../../core/messages.js';
import { templateIconToSpec } from '../../core/icons.js';
import { registerNative } from '../../core/native.js';
import { os } from '../../core/os.js';
import { Patcher, ACTION, FT_PATCH } from './patch.js';

// OS units (template, y up) → work-area pixels
const pxBox = (x0, y0, x1, y1) => ({ x0: x0 / 2, y0: -y1 / 2, x1: x1 / 2, y1: -y0 / 2 });

/** *UnSqueeze (the UnSqueeze 1.24 module !Patch.!Run loads): the checks of s/UnSqueeze. */
async function unsqueeze(argv) {
  const vfs = os.vfs;
  const [inp] = argv;
  const st = vfs.stat(inp);
  if (!st || st.type !== 'file') throw Object.assign(new Error(`File '${inp}' not found`), { riscos: true });
  if (st.filetype !== 0xFF8) throw new Error('UnSqueeze: Input file must be of type Application');
  const b = await vfs.readFile(st.path);
  const w = (i) => (b.length >= i * 4 + 4 ? (b[i * 4] | (b[i * 4 + 1] << 8) | (b[i * 4 + 2] << 16) | (b[i * 4 + 3] << 24)) >>> 0 : 0);
  if (w(4) === 0xEF000011) {                           // AIF image (word 4 = SWI OS_Exit)
    if (w(0) === 0xFB000000) throw new Error('UnSqueeze: Input file is not squeezed');
    if ((w(0) & 0xFF000000) >>> 0 !== 0xEB000000) throw new Error('UnSqueeze: Input file is not a valid AIF run image');
  } else if ((w(0) & 0xFF000000) >>> 0 !== 0xEA000000) throw new Error('UnSqueeze: Input file is not squeezed');
  // Squeezed: UnSqueeze runs the image's own decompression code, which is ARM code.
  throw new Error(`UnSqueeze: '${st.name}' is squeezed - unsqueezing it runs its ARM code decompressor, which cannot be run on this computer`);
}

export default async function start(task, ctx) {
  const vfs = os.vfs;
  const [tpl, M] = await Promise.all([loadTemplates('assets/templates/Patch.json'), loadMessages('Patch')]);
  const msg = (t, ...a) => M.lookup(t, ...a);

  // !Run: RMEnsure UnSqueeze 1.24 RMLoad Patch:Modules.UnSqueeze
  if (!os.cli.commands?.has?.('unsqueeze')) {
    os.cli.register('UnSqueeze', { syntax: 'Syntax: *UnSqueeze <input file> [<output file>]', help: '*UnSqueeze unsqueezes a squeezed application image.', min: 1, max: 2, run: unsqueeze });
  }
  // Patch:Library.squeeze (Acorn C/C++ squeeze, the Squeeze transform's Finish step)
  registerNative('Library.squeeze', {
    run: async (args) => { throw new Error(`squeeze is ARM code, which cannot be run on this computer: '${args[0] ?? ''}' could not be squeezed into '${args[1] ?? ''}'`); },
  });

  // ---------------------------------------------------------------- engine
  let quitting = false;
  const patcher = new Patcher({
    vfs,
    gstrans: (s) => os.sysvars.gstrans(String(s)),
    run: async (cmd) => {
      const lines = [];
      await os.cli.run(cmd, { out: { write: (s) => lines.push(s), writeln: (s) => lines.push(s + '\n') } });
    },
    // report_error(..., OK | Cancel): Cancel quits the patcher
    report: async (text) => {
      const r = await wimp.reportError(text, { appName: msg('ErrorTitle'), cancel: true });
      if (r === 2) { quitting = true; task.quit(); return false; }
      return true;
    },
    msg,
    parseMessages: parseMessagesText,
  });

  // ---------------------------------------------------------------- target window
  const W = tpl.windows;
  const proto = W.targetproto.icons;
  const pApp = proto[0].bbox, pPatch = proto[1].bbox, pSel = proto[2].bbox;
  const appH = pApp.y0;                          // -48
  const patchH = pPatch.y0 - pApp.y0;            // -52 (y0 relative to y1, as target_window_init adjusts)
  const selH = pSel.y0 - pApp.y0;                // -52
  let bottom = 0;                                 // target_window_y0 (OS units, ≤ 0)

  const win = task.createWindowFromTemplate(tpl, 'TargetDir');
  win.helpText = '';
  const iconFrom = (p, box, text) => ({ ...templateIconToSpec(p), bbox: pxBox(box.x0, box.y0, box.x1, box.y1), text, bufLen: text.length + 1 });

  function setupWindow() {                        // target_setup_window
    const y0 = bottom === 0 ? appH + patchH : bottom;
    win.setExtent({ x0: pApp.x0 / 2, y0: 0, x1: pApp.x1 / 2, y1: -y0 / 2 });
  }

  function addTargetIcons(t) {                    // add_target
    win.addIcon(iconFrom(proto[0], { x0: pApp.x0, x1: pApp.x1, y1: bottom, y0: bottom + appH }, t.app.desc ?? ''));
    bottom += appH;
    win.addIcon(iconFrom(proto[0], { x0: pApp.x0, x1: pApp.x1, y1: bottom, y0: bottom + appH }, t.displayPath));
    bottom += appH;
    for (const tp of t.patches) {
      win.addIcon(iconFrom(proto[1], { x0: pPatch.x0, x1: pPatch.x1, y1: bottom, y0: bottom + patchH }, tp.patch.desc));
      tp.selY1 = bottom;
      bottom += selH;
    }
    setupWindow();
  }

  async function checkTarget(t) {                 // check_target_app
    for (const tp of t.patches) {
      if (quitting) return;
      const old = tp.action;
      tp.action = await patcher.checkPatch(t, tp);
      if (old === tp.action) continue;
      if (tp.icon) { const i = win.icons.indexOf(tp.icon); if (i >= 0) win.deleteIcon(i); tp.icon = null; }
      if (tp.action === ACTION.NONE) continue;
      const text = msg(tp.action === ACTION.APPLY ? 'Apply' : 'Remove');
      tp.icon = win.addIcon({ ...iconFrom(proto[2], { x0: pSel.x0, x1: pSel.x1, y1: tp.selY1, y0: tp.selY1 + selH }, text), bufLen: 9 });
    }
  }

  const pending = [];
  patcher.onTarget = (t) => { addTargetIcons(t); pending.push(t); };

  function openFront() {
    setupWindow();
    const st = win.getState?.() ?? {};
    win.open({ ...(win.isOpen ? {} : { x: st.x, y: st.y }), behind: 'top' });
  }

  async function dataLoad(files) {                // Message_DataLoad on the icon or the window
    openFront();
    wimp.setPointer?.('hourglass');
    try {
      for (const f of files ?? []) {
        if (!f?.path) continue;
        await patcher.enumerate(f.path, { file: true, dir: true }, (d, leaf, ft) => patcher.addIfPatchable(d, leaf, ft));
        while (pending.length && !quitting) await checkTarget(pending.shift());
      }
    } finally { wimp.setPointer?.(''); }
  }

  // ---------------------------------------------------------------- window menu (TargtMEntr)
  const allPatches = () => patcher.allTargets.flatMap((t) => t.patches.map((tp) => ({ t, tp })));
  const live = () => allPatches().filter(({ tp }) => tp.action !== ACTION.NONE && tp.icon);
  const setAll = (actions, selected) => { for (const { tp } of live()) if (actions.includes(tp.action)) tp.icon.setState({ selected }); };
  async function patchSelected() {                // target_patch_selected
    wimp.setPointer?.('hourglass');
    try {
      for (const t of patcher.allTargets) {
        let modified = false;
        for (const tp of t.patches) {
          if (quitting) return;
          if (tp.action === ACTION.NONE || !tp.icon?.selected) continue;
          await patcher.performPatch(t, tp);
          modified = true;
        }
        if (modified) await checkTarget(t);
      }
    } finally { wimp.setPointer?.(''); }
  }
  const [mSelApply, mSelRemove, mClear, mPatch] = msg('TargtMEntr').split(',');
  const targetMenu = () => new Menu(msg('TargtMTitl'), [
    { text: mSelApply, shaded: () => !live().some(({ tp }) => tp.action === ACTION.APPLY), action: () => setAll([ACTION.APPLY], true) },
    { text: mSelRemove, shaded: () => !live().some(({ tp }) => tp.action === ACTION.REMOVE), action: () => setAll([ACTION.REMOVE], true) },
    { text: mClear, shaded: () => !live().some(({ tp }) => tp.icon.selected), action: () => setAll([ACTION.APPLY, ACTION.REMOVE], false) },
    { text: mPatch, shaded: () => !live().some(({ tp }) => tp.icon.selected), action: () => patchSelected() },
  ]);
  win.on('click', (ev) => {
    if (ev.button === 'menu') { wimp.menus.openAt(targetMenu(), ev, { task }); return true; }
    return false;                                  // option buttons toggle themselves (radio, ESG 0)
  });
  win.on('dataload', (ev) => { dataLoad(ev.files); return true; });

  // ---------------------------------------------------------------- icon bar
  const [mInfo, mQuit] = msg('IcBarMEntr').replace(/^>/, '').split(',').map((s) => s.replace(/^>/, ''));
  const iconbarMenu = () => new Menu(msg('IcBarMTitl'), [
    { text: mInfo, submenu: () => {
      const w = wimp.createWindowFromTemplate(tpl, 'ProgInfo', {}, task);
      w.on('menuclosed', () => setTimeout(() => w.delete(), 0));
      return w;
    } },
    { text: mQuit, action: () => task.quit() },
  ]);
  task.addIconbarIcon({
    sprite: msg('IcBarSprite'), side: 'right',
    onClick: () => openFront(),
    menu: iconbarMenu,
    onDataLoad: (ev) => { dataLoad(ev.files); return true; },
  });
  task.onMessage('DataLoad', (m) => { if (m.iconbar?.task === task) { dataLoad(m.files); return true; } });

  // Double-click / Filer_Run of a Patch file: DataOpen → DataLoadAck, read it
  const loadPatchFile = async (path) => {
    wimp.setPointer?.('hourglass');
    try { await patcher.readPatchFile(null, path, FT_PATCH); } finally { wimp.setPointer?.(''); }
  };
  task.onMessage('DataOpen', (m) => { if (m.filetype === FT_PATCH) { loadPatchFile(m.path); return true; } });
  task.on('run', ({ file }) => {                  // started again with a directory argument
    if (file && vfs.exists(file) && vfs.stat(file).filetype !== FT_PATCH) patcher.enumerate(file, { file: true }, (d, l, ft) => patcher.readPatchFile(d, l, ft));
  });
  task.onMessage('Quit', () => task.quit());

  // ---------------------------------------------------------------- start-up
  setupWindow();
  wimp.setPointer?.('hourglass');
  try {
    await patcher.readPatchFile(null, 'Patch:BootStrap', FT_PATCH);
    for (const a of String(ctx.args ?? '').trim().split(/\s+/).filter(Boolean)) {
      await patcher.enumerate(a.replace(/^"(.*)"$/, '$1'), { file: true }, (d, l, ft) => patcher.readPatchFile(d, l, ft));
    }
  } finally { wimp.setPointer?.(''); }

  task.patch = { patcher, window: win, dataLoad, patchSelected, loadPatchFile };
}
