// !JsEdit start-up: the icon bar icon and its menu (Info, Create, Throwback, Quit), loading files (dropped on
// the icon, Shift-double-clicked JSScript files, *Run <JsEdit$Dir> <file>), throwback from *JSRun, PreQuit and
// Quit. The texts themselves are ./editor.js.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { os } from '../../core/os.js';
import { JsEditApp } from './editor.js';

// a new JavaScript program starts with this
const NEW_JS = '// \n';

export default async function start(task, ctx) {
  const app = await new JsEditApp(task, ctx.app?.info ?? {}).init();
  const finish = () => { app.dirs.quit(); app.disposeAll(); };
  const quit = async () => { if (await app.mayQuit()) { finish(); task.quit(); } };
  task.on('quit', () => { finish(); if (os.hooks.throwback === takeError) os.hooks.throwback = null; });

  const create = async (type, text = '') => {
    const s = await app.open('', type);
    if (s && text) { s.doc.setText(text); s.doc.setModified(false); s.doc.clearUndo(); s.activeView?.setCaret(text.length - 1); }
    return s;
  };
  const iconMenu = () => new Menu('JsEdit', [
    { text: 'Info', submenu: () => app.progInfo() },
    { text: 'Create', submenu: new Menu('Create', [
      { text: 'JavaScript', action: () => create(0xF81, NEW_JS) },
      { text: 'BASIC', action: () => create(0xFFB) },
      { text: 'Obey', action: () => create(0xFEB) },
      { text: 'JSON', action: () => create(0xF75) },
      { text: 'Text', action: () => create(0xFFF) },
    ]) },
    { text: 'Open directory', submenu: () => new Menu('Directory', [{ text: '', writable: { value: app.dirs.last ?? 'ADFS::HardDisc4.$', maxLen: 255 }, action: (e) => { if (e.value.trim()) app.dirs.open(e.value.trim()); } }]),
      help: 'Move the pointer right, type the name of a directory and press Return, to see its files in a directory view.|MOr drag a directory to the JsEdit icon.' },
    { text: 'Throwback', action: () => app.throwback.open(), dotted: true },
    { text: 'Quit', action: quit },
  ]);

  task.addIconbarIcon({
    sprite: '!jsedit',
    side: 'right',
    onClick: () => create(0xF81, NEW_JS),
    menu: iconMenu,
    help: () => 'This is the JsEdit icon.|MClick SELECT to start a new JavaScript program.|MClick MENU for other options.|MDrag a file here to edit it, or a directory to see its files.',
    // files are edited; directories (and applications) open in a directory view
    onDataLoad: (ev) => { for (const f of ev.files ?? []) { if (f.filetype === 0x1000 || f.filetype === 0x2000) app.dirs.open(f.path); else app.open(f.path, f.filetype); } },
    onDataSave: async (ev) => {
      const s = await app.open('', ev.filetype >= 0 ? ev.filetype : 0xFFF);
      if (!s) return;
      await s.importData(await ev.receive(), ev.filetype);
      s.doc.clearUndo();
    },
  });

  // errors from programs being edited here come back to their texts (throwback)
  const takeError = (e) => app.takeError(e);
  os.hooks.throwback = takeError;

  task.onMessage('PreQuit', async (msg) => {
    if (!app.modifiedCount) return;
    msg.object?.();
    if (await app.mayQuit()) {
      finish();
      if (msg.single) task.quit();
      else wimp.emit('hotkey:CtrlShiftF12', {});
    }
  });
  task.onMessage('Quit', () => { finish(); task.quit(); });
  const openPath = (p) => (os.vfs.isDir(p) ? app.dirs.open(p) : app.open(p, 0));
  task.on('run', ({ file }) => { if (file) openPath(file); });

  task.jsedit = app;                               // (for tests)
  await app.dirs.restore();                        // the directory views open when it last quit
  if (ctx.file) await openPath(ctx.file);
  return app;
}
