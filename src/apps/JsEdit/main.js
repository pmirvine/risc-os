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
  const quit = async () => { if (await app.mayQuit()) { app.disposeAll(); task.quit(); } };
  task.on('quit', () => { app.disposeAll(); if (os.hooks.throwback === takeError) os.hooks.throwback = null; });

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
    { text: 'Throwback', action: () => app.throwback.open(), dotted: true },
    { text: 'Quit', action: quit },
  ]);

  task.addIconbarIcon({
    sprite: '!jsedit',
    side: 'right',
    onClick: () => create(0xF81, NEW_JS),
    menu: iconMenu,
    help: () => 'This is the JsEdit icon.|MClick SELECT to start a new JavaScript program.|MClick MENU for other options.|MDrag a file here to edit it.',
    onDataLoad: (ev) => { for (const f of ev.files ?? []) if (f.filetype !== 0x1000 && f.filetype !== 0x2000) app.open(f.path, f.filetype); },
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
      app.disposeAll();
      if (msg.single) task.quit();
      else wimp.emit('hotkey:CtrlShiftF12', {});
    }
  });
  task.onMessage('Quit', () => { app.disposeAll(); task.quit(); });
  task.on('run', ({ file }) => { if (file) app.open(file, 0); });

  if (ctx.file) await app.open(ctx.file, 0);
  return app;
}
