// !Edit start-up (Edit's c.edit): the icon bar icon and its menu (Info, Create, BASIC options,
// Quit), loading files (DataOpen / DataLoad / RAM transfer / command line), PreQuit and Quit.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { parseType } from '../../core/filetypes.js';
import { EditApp, parseMenuString } from './editor.js';
import { setCurrentEdit } from './api.js';

export default async function start(task, ctx) {
  const app = await new EditApp(task, ctx.app?.info ?? {}).init();
  setCurrentEdit(app);
  task.on('quit', () => { app.disposeAll(); setCurrentEdit(null); });
  const M = app.M;

  // ------------------------------------------------------------------ icon bar menu
  const quit = async () => { if (await app.mayQuit()) { app.disposeAll(); task.quit(); } };
  const iconMenu = () => {
    const it = parseMenuString(M.lookup('ED2a'));           // >Info,Create,BASIC options,Quit
    const cr = parseMenuString(M.lookup('ED4'));            // Text,BASIC,Obey,Command,example
    const op = parseMenuString(M.lookup('ED2c'));           // Strip line numbers,Line number increment
    const h = (t) => () => app.help(t);
    const typeW = { value: app.newTypeName, maxLen: 9, validation: 'a~.' };
    const create = new Menu(M.lookup('ED3'), [
      { text: cr[0].text, action: () => app.open('', 0xFFF), help: h('IHELP10') },
      { text: cr[1].text, action: () => app.open('', 0xFFB), help: h('IHELP11') },
      { text: cr[2].text, action: () => app.open('', 0xFEB), help: h('IHELP12') },
      { text: cr[3].text, action: () => app.open('', 0xFFE), help: h('IHELP13') },
      {
        text: '', writable: typeW, help: h('IHELP14'),
        action: (ev) => {
          app.newTypeName = ev.value;
          const t = parseType(ev.value);
          if (t < 0) { task.reportError(`Unknown file type '${ev.value}'`); return; }
          wimp.menus.close();
          app.open('', t);
        },
      },
    ]);
    const incW = { value: String(app.basicIncrement), maxLen: 5, validation: 'a0-9' };
    const incr = new Menu(M.lookup('ED2d'), [{
      text: '', writable: incW, help: h('IHELPX21'),
      action: (ev) => {
        const n = parseInt(ev.value, 10) || 0;
        if (!n) { task.reportError(M.lookup('BA1')); return; }
        app.basicIncrement = n;
      },
    }]);
    const opts = new Menu(M.lookup('ED2b'), [
      { text: op[0].text, ticked: () => app.basicStrip, action: () => { app.basicStrip = !app.basicStrip; }, help: h('IHELP20') },
      { text: op[1].text, submenu: incr, help: h('IHELP21') },
    ]);
    return new Menu(M.lookup('ED1'), [
      { text: it[0].text, submenu: () => app.progInfo(), help: h('IHELP0') },
      { text: it[1].text, submenu: create, help: h('IHELP1') },
      { text: it[2].text, submenu: opts, help: h('IHELP2') },
      { text: it[3].text, action: quit, help: h('IHELP3') },
    ]);
  };

  // ------------------------------------------------------------------ icon bar icon
  task.addIconbarIcon({
    sprite: M.lookup('BarIcon') || '!edit',
    side: 'right',
    onClick: () => app.open('', 0xFFF),
    menu: iconMenu,
    help: () => M.lookup('ED5'),
    // a file dropped on the icon: open it (any type)
    onDataLoad: (ev) => { for (const f of ev.files ?? []) if (f.filetype !== 0x1000 && f.filetype !== 0x2000) app.open(f.path, f.filetype); },
    // another application's Save box dropped on the icon: a new window with the data
    onDataSave: async (ev) => {
      const s = await app.open('', ev.filetype >= 0 ? ev.filetype : 0xFFF);
      if (!s) return;
      const data = await ev.receive();
      await s.importData(data, ev.filetype);
      s.doc.clearUndo();
    },
  });

  // ------------------------------------------------------------------ messages
  task.onMessage('DataOpen', (msg) => {
    if (msg.filetype !== 0xFFF) return false;
    app.open(msg.path, 0xFFF);
    return true;
  });
  task.onMessage('PreQuit', async (msg) => {
    if (!app.modifiedCount) return;
    msg.object?.();
    if (await app.mayQuit()) {
      app.disposeAll();
      if (msg.single) task.quit();
      else wimp.emit('hotkey:CtrlShiftF12', {});   // restart the closedown sequence
    }
  });
  task.onMessage('Quit', () => { app.disposeAll(); task.quit(); });
  task.on('run', ({ file }) => { if (file) app.open(file, 0); });

  // started with a file (double-click / *Run <Edit$Dir> file)
  if (ctx.file) await app.open(ctx.file, 0);
  return app;
}
