// !SciCalc - the RISC OS 3.71 scientific calculator, re-implemented natively from the original
// BASIC !RunImage (see calc.js for the calculation logic). Uses the original Templates
// ("Calculator", "Info"), Sprites (button faces) and Messages.
//
// Like the original: starts with just an icon bar icon; clicking it opens the calculator
// (and claims the input focus with an invisible caret); the display is drawn by the task
// in the system font, right-justified in 36 characters, black on white.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';
import { SciCalc } from './calc.js';

let sysfont = null;
async function systemFont() {
  if (!sysfont) sysfont = fetch('assets/fonts/system8x8.json').then((r) => r.json()).then((j) => j.chars);
  return sysfont;
}

export default async function start(task, ctx) {
  const [tpl, M, area, font] = await Promise.all([
    loadTemplates('assets/templates/SciCalc.json'),
    loadMessages('SciCalc'),
    os.sprites.loadManifest('SciCalc', 'Sprites'),
    systemFont(),
  ]);
  const msg = (t, ...a) => M.lookup(t, ...a);
  const calc = new SciCalc(msg);

  // ---------------------------------------------------------------- windows
  const win = wimp.createWindowFromTemplate(tpl, 'Calculator', { spriteArea: area, title: calc.title() }, task);
  win.el.classList.add('scicalc');
  const info = wimp.createWindowFromTemplate(tpl, 'Info', {}, task);
  info.helpText = msg('H2');

  // The display: the task paints a white box and the text itself (PROCcalc).
  const disp = document.createElement('canvas');
  disp.width = 36 * 8 + 16; disp.height = 22;
  disp.style.cssText = 'position:absolute;left:25px;top:13px;pointer-events:none;image-rendering:pixelated';
  win.work.appendChild(disp);
  const g = disp.getContext('2d');

  function paintDisplay() {
    const text = calc.display();
    g.clearRect(0, 0, disp.width, disp.height);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 36 * 8, 20);
    g.fillStyle = '#000000';
    let x = 8 * (36 - text.length);
    for (const ch of text) {
      const rows = font[ch.charCodeAt(0) & 255] ?? [];
      for (let r = 0; r < 8; r++) {
        const bits = rows[r] | 0;
        if (!bits) continue;
        for (let b = 0; b < 8; b++) if (bits & (0x80 >> b)) g.fillRect(x + b, 5 + r * 2, 1, 2);
      }
      x += 8;
    }
  }

  // Icon states driven by PROChide_icon / PROCgrey_icon etc.
  const DELETED = 0x00800080, SHADED = 0x00400000, SPRBORDER = 0x6;
  function applyIcons() {
    for (let i = 0; i < win.icons.length; i++) {
      const ic = win.icons[i];
      if (!ic || i === 52) continue;
      let f = ic.flags & ~(DELETED | SHADED | SPRBORDER);
      if (calc.hidden.has(i)) f |= DELETED;
      f |= calc.greyed.has(i) ? SHADED : SPRBORDER;
      f >>>= 0;
      if (f !== ic.flags) { ic.flags = f; ic.render(); }
    }
  }

  function update() {
    applyIcons();
    paintDisplay();
    const t = calc.title();
    if (win.title !== t) win.setTitle(t);
  }
  update();

  // ---------------------------------------------------------------- opening / closing
  let open = false;
  let pos = null;                  // remembered screen position (xo%, yo%)
  const focus = () => wimp.setCaret(win);
  function openCalc() {
    if (open && win.isOpen) { win.open({ behind: 'top' }); focus(); return; }
    const x = pos?.x ?? 12;                                  // xo% = 24 OS
    const y = pos?.y ?? (wimp.height - 80 - win.h);          // yo% = 160 OS (bottom edge)
    win.open({ x, y, behind: 'top' });
    open = true;
    focus();
  }
  win.on('close', (ev) => { ev.preventDefault(); pos = { x: win.x, y: win.y }; open = false; win.close(); });

  win.on('click', (ev) => {
    if (ev.button === 'menu') return true;
    const i = ev.icon ? win.icons.indexOf(ev.icon) : -1;
    if (i === 52) focus();
    if (i >= 0) calc.click(i, ev.button);
    update();
    return true;
  });
  win.on('drag', () => true);
  win.on('key', (ev) => {
    const c = ev.code;
    if (c > 255) return false;
    const used = calc.key(c);
    update();
    return used;
  });
  win.on('helprequest', (ev) => {
    const i = ev.icon ? win.icons.indexOf(ev.icon) : -1;
    let t = '';
    if (calc.errorflag) t = msg('H6');
    else if (i >= 0 && i <= 9) t = msg('K' + i, String(i));
    else if (i === 17) t = msg('K17', msg('B' + calc.base));
    else if (i === 47) t = msg('K47', msg('T' + calc.trig));
    else if (i === 48) t = msg('D' + (calc.bracket ? 1 : 0));
    else if (i >= 64 && i <= 69) t = msg('K' + i, String(i - 54));
    else if (i > 0 && M.has('K' + i)) t = msg('K' + i);
    ev.text = t || msg('H3');
  });

  // ---------------------------------------------------------------- icon bar
  const menu = () => new Menu(msg('M3'), [
    { text: msg('M1'), submenu: info, help: msg('H4') },
    { text: msg('M2'), help: msg('H5'), action: () => task.quit() },
  ]);
  task.addIconbarIcon({
    sprite: ctx.app.sprite, side: 'right',
    onClick: (ev) => { if (ev.button !== 'menu') openCalc(); },
    menu, help: msg('H1'),
  });
  task.on('run', () => openCalc());
  task.onMessage('Quit', () => task.quit());

  // test hook
  task.calc = calc; task.calcWindow = win; task.openCalc = openCalc; task.refresh = update;
}
