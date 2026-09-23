// Example application demonstrating the core API (see docs/CORE_API.md).
//
// - icon bar icon with a menu (Info box, Colour menu, Save box, Quit)
// - a document window whose work area is a redraw-driven canvas (click to add dots)
// - Wimp icons created programmatically: writable field, action buttons, radio buttons
// - input focus / caret and key presses, DataLoad (drag a text file in), Save-as drag protocol,
//   "discard changes?" on close, PreQuit handling, null events.

import { wimp } from '../../core/wimp.js';
import { Menu, colourMenu } from '../../core/menu.js';
import { infoBox, saveAs, discardChanges } from '../../core/dialogs.js';
import { wimpColour } from '../../core/palette.js';
import { os } from '../../core/os.js';

export default async function start(task, ctx) {
  const info = ctx.app.info;
  let colour = 11;               // Wimp colour for new dots
  let size = 6;
  let dots = [];                 // {x, y, c, r}
  let modified = false;
  let title = 'Untitled';
  let doc = null;

  // ---------------------------------------------------------------- document window
  function openDocument() {
    if (doc) { doc.open({ behind: 'top' }); return; }
    doc = task.createWindow({
      title: `${title}`,
      flags: { back: true, close: true, title: true, toggle: true, vscroll: true, hscroll: true, size: true, moveable: true },
      colours: { workBg: 0 },                  // white work area
      extent: { w: 1200, h: 900 },
      x: 180, y: 120, w: 420, h: 300,
      workButton: 'clickdragdouble',            // report clicks, drags and double-clicks
    });
    // redraw-driven canvas: called with work-area coordinates whenever needed
    doc.useCanvas((g, r) => {
      g.strokeStyle = '#dddddd';
      for (let x = Math.floor(r.x0 / 40) * 40; x < r.x1; x += 40) { g.beginPath(); g.moveTo(x + 0.5, r.y0); g.lineTo(x + 0.5, r.y1); g.stroke(); }
      for (let y = Math.floor(r.y0 / 40) * 40; y < r.y1; y += 40) { g.beginPath(); g.moveTo(r.x0, y + 0.5); g.lineTo(r.x1, y + 0.5); g.stroke(); }
      for (const d of dots) {
        g.fillStyle = wimpColour(d.c);
        g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
      }
    });
    doc.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(mainMenu(), ev, { task }); return true; }
      wimp.setCaret(doc, null, -1, { x: ev.x, y: ev.y - 10, h: 20 });   // take the input focus
      if (ev.button === 'select') dots.push({ x: ev.x, y: ev.y, c: colour, r: size });
      else dots = dots.filter((d) => Math.hypot(d.x - ev.x, d.y - ev.y) > d.r + 2);
      setModified(true);
      doc.invalidate();
      return true;
    });
    doc.on('drag', (ev) => {
      // a rubber-band drag inside the window: delete dots inside the box
      wimp.drag({ type: 'rubber', box: { x0: ev.sx, y0: ev.sy, x1: ev.sx, y1: ev.sy }, event: ev.pointerEvent }).then((drop) => {
        const a = doc.screenToWork(drop.box.x0, drop.box.y0), b = doc.screenToWork(drop.box.x1, drop.box.y1);
        const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)], [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        dots = dots.filter((d) => !(d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1));
        setModified(true); doc.invalidate();
      });
      return true;
    });
    doc.on('key', (ev) => {
      if (ev.char === 'c' || ev.char === 'C') { dots = []; setModified(true); doc.invalidate(); return true; }
      if (ev.code === 0x183 /* F3 */) { wimp.menus.open(saveBox(), wimp.width / 2 - 100, wimp.height / 2); return true; }
      return false;   // not handled: passed on as a hot key
    });
    doc.on('dataload', (ev) => {
      // a file was dropped on the window (e.g. from a Filer viewer)
      const f = ev.files[0];
      if (f.filetype !== 0xFFF) { task.reportError('Example can only load text files'); return true; }
      os.vfs.readText(f.path).then((txt) => {
        dots = [];
        for (const line of txt.split('\n')) {
          const m = /^(\d+) (\d+) (\d+) (\d+)$/.exec(line.trim());
          if (m) dots.push({ x: +m[1], y: +m[2], c: +m[3], r: +m[4] });
        }
        title = f.path; setModified(false); doc.invalidate();
      });
      return true;
    });
    doc.on('close', async (ev) => {
      ev.preventDefault();                        // we decide whether to close
      if (modified && !(await discardChanges(task))) return;
      doc.delete(); doc = null; dots = []; setModified(false);
    });
    doc.open({ behind: 'top' });
    openToolbox();
  }

  function setModified(m) {
    modified = m;
    doc?.setTitle(title + (m ? ' *' : ''));
  }

  // ---------------------------------------------------------------- a dialogue with icons
  let tools = null;
  function openToolbox() {
    if (tools) { tools.open({ behind: 'top' }); return; }
    tools = task.createWindow({
      title: 'Tools', flags: { title: true, close: true, moveable: true },
      extent: { w: 220, h: 150 }, x: 620, y: 120, w: 220, h: 150,
      icons: [
        { x: 8, y: 8, w: 70, h: 20, text: 'Size', rjustify: true },
        { x: 84, y: 4, w: 60, h: 28, text: String(size), border: true, filled: true, bg: 0, button: 'writable', validation: 'R7;A0-9', maxLen: 3 },
        { x: 8, y: 40, w: 100, h: 22, text: 'Small', sprite: 'radiooff', validation: 'Sradiooff,radioon', button: 'radio', esg: 1, selected: size <= 6 },
        { x: 110, y: 40, w: 100, h: 22, text: 'Large', sprite: 'radiooff', validation: 'Sradiooff,radioon', button: 'radio', esg: 1, selected: size > 6 },
        { x: 8, y: 70, w: 200, h: 22, text: 'Show grid', sprite: 'optoff', validation: 'Soptoff,opton', button: 'radio', selected: true },
        { x: 8, y: 106, w: 90, h: 34, text: 'Clear', border: true, filled: true, hcentre: true, button: 'release', validation: 'R5,3', bg: 1 },
        { x: 110, y: 100, w: 100, h: 40, text: 'Apply', border: true, filled: true, hcentre: true, button: 'click', validation: 'R6,3', bg: 1 },
      ],
    });
    const I = tools.icons;
    const apply = () => { size = Math.max(1, Math.min(60, parseInt(I[1].text, 10) || 6)); };
    tools.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.icon === I[2]) { size = 4; I[1].setText('4'); }
      if (ev.icon === I[3]) { size = 12; I[1].setText('12'); }
      if (ev.icon === I[5]) { dots = []; setModified(true); doc?.invalidate(); }
      if (ev.icon === I[6]) apply();
    });
    tools.on('key', (ev) => { if (ev.code === 13) { apply(); return true; } });
    tools.on('close', (ev) => { ev.preventDefault(); tools.close(); });
    tools.open({ behind: 'top' });
    wimp.setCaret(tools, I[1]);
  }

  // ---------------------------------------------------------------- menus & dialogues
  let infoWin = null, saveWin = null;
  const saveBox = () => {
    saveWin?.delete();
    saveWin = saveAs({
      task, filename: title.includes('.') ? title : 'Dots', filetype: 0xFFF,
      getData: async () => dots.map((d) => `${Math.round(d.x)} ${Math.round(d.y)} ${d.c} ${d.r}`).join('\n') + '\n',
      onSaved: (path) => { if (path) title = path; setModified(false); },
    });
    return saveWin;
  };
  const mainMenu = () => new Menu('Example', [
    { text: 'Info', submenu: () => (infoWin ??= infoBox(task, info)) },
    { text: 'Colour', submenu: colourMenu('Colour', () => colour, (n) => { colour = n; }) },
    { text: 'Save', submenu: saveBox, dotted: true },
    { text: 'Open window', action: openDocument },
    { text: 'Quit', action: () => quit() },
  ]);

  async function quit() {
    if (modified && !(await discardChanges(task, 'Example has unsaved changes. Discard them?'))) return;
    task.quit();
  }

  // ---------------------------------------------------------------- icon bar, messages
  task.addIconbarIcon({
    sprite: ctx.app.sprite,
    onClick: (ev) => { if (ev.button === 'select') openDocument(); else openToolbox(); },
    menu: mainMenu,
    onDataLoad: (ev) => { openDocument(); doc.emit('dataload', ev); },
  });
  task.onMessage('PreQuit', (msg) => {
    if (modified) { msg.object?.(); quit(); }
  });
  task.onMessage('Quit', () => task.quit());
  // "null events": periodic work while the task runs (stopped automatically on quit)
  task.every(1000, () => { if (tools?.isOpen) tools.setTitle(`Tools (${dots.length})`); });
  openDocument();
}
