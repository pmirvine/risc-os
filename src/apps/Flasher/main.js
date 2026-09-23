// !Flasher - the caret flasher (Minerva Software, 1990; Diversions). Port of
// Sources/Diversions/Flasher/bas/!RunImage.
//
// While running, the caret flashes (off 20cs, on 45cs: Wimp_SetCaretPosition with the "invisible"
// bit 25 toggled). SELECT/ADJUST on the icon bar icon (or Find) locates the caret: its window is
// brought to the front (Open_Window_Request, scrolled to centre the caret if Scroll is ticked) and
// the pointer is glided to it in 32-OS-unit steps (MOUSE TO). A browser can't move the real pointer,
// so a pointer sprite is animated along the same path instead.

import { Menu } from '../../core/menu.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';
import { sprites } from '../../core/sprites.js';

export default async function start(task, ctx) {
  const M = await loadMessages('Flasher');
  const wimp = os.wimp;
  const appl = M.lookup('Name');
  const version = M.lookup('Version');

  let flashing = true, autoscroll = true, quitting = false;
  const offtime = 200, ontime = 450;     // ms (the original's 20 / 45 centiseconds)
  let invisible = false;

  const caretEl = () => wimp.caretEl;
  const setVisible = (v) => { invisible = !v; const e = caretEl(); if (e) e.style.visibility = v ? '' : 'hidden'; };

  // PROCset_templates: ProgInfo from FlasherFrm; PROCversion puts the version in icon 4
  const pinfo = await task.createWindowFromTemplate('assets/templates/Flasher.FlasherFrm.json', 'ProgInfo');
  pinfo.icons[4]?.setText(version);
  pinfo.helpText = M.lookup('H01');

  const hasCaret = () => !!(wimp.caret?.window?.isOpen);

  // "#Flasher,Info>%0,Flash,Scroll,Find,Quit"
  const [, ...items] = M.lookup('Menu').replace(/^#/, '').split(',');
  const label = (s) => s.replace(/>.*$/, '');
  const menu = () => new Menu(appl, [
    { text: label(items[0]), submenu: pinfo },
    { text: items[1], ticked: () => flashing, action: () => toggleFlash() },
    { text: items[2], ticked: () => autoscroll, action: () => { autoscroll = !autoscroll; } },
    { text: items[3], shaded: () => !hasCaret(), action: () => showCaret() },
    { text: items[4], action: () => quit() },
  ]);

  function quit() {
    if (quitting) return;
    quitting = true;
    setVisible(true);            // PROCrestorec
    task.quit();
  }

  function toggleFlash() {       // PROCflash
    if (flashing) { setVisible(true); flashing = false; } else { flashing = true; schedule(0); }
  }

  // PROCbackgnd: null events at the next flash time
  let timer = null;
  function schedule(ms) {
    timer?.();
    timer = task.after(ms, backgnd);
  }
  function backgnd() {
    if (!flashing) return;
    if (hasCaret()) {
      setVisible(invisible);                 // toggle bit 25
      schedule(invisible ? offtime : ontime);
    } else schedule(ontime);
  }

  // PROCshowcaret / PROCfindcaret
  function caretScreenPos() {
    const c = wimp.caret;
    if (!c?.window) return null;
    let p = c.pos;
    if (c.icon) p = c.icon.caretPos(c.index);
    if (!p) return null;
    return { win: c.window, x: p.x, y: p.y, h: p.h ?? 20 };
  }
  function showCaret() {
    const cp = caretScreenPos();
    if (!cp) { wimp.beep(); return; }
    const w = cp.win;
    const st = { x: w.x, y: w.y, w: w.w, h: w.h, scrollX: w.scrollX, scrollY: w.scrollY };
    if (autoscroll) {
      if (cp.x < w.scrollX || cp.x > w.scrollX + w.w) st.scrollX = cp.x - w.w / 2;
      if (cp.y < w.scrollY + 16 || cp.y > w.scrollY + w.h) st.scrollY = cp.y - w.h / 2;
    }
    if (w.requestOpen) w.requestOpen({ ...st, behind: 'top' }); else w.open({ ...st, behind: 'top' });
    task.after(0, findCaret);
  }
  function findCaret() {
    const cp = caretScreenPos();
    if (!cp) { wimp.beep(); return; }
    const w = cp.win;
    let tx, ty;
    if (cp.x < w.scrollX || cp.x > w.scrollX + w.w || cp.y < w.scrollY || cp.y > w.scrollY + w.h) { tx = w.x; ty = w.y + w.h; }
    else { const s = w.workToScreen(cp.x, cp.y); tx = s.x; ty = s.y; }
    glidePointer(os.input?.mouseX ?? tx, os.input?.mouseY ?? ty, tx, ty);
  }
  function glidePointer(x0, y0, x1, y1) {
    const s = sprites.get('ptr_default');
    if (!s) return;
    const im = sprites.img('ptr_default');
    im.style.position = 'absolute'; im.style.pointerEvents = 'none'; im.style.zIndex = 100;
    wimp.layers.drag.appendChild(im);
    const N = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 16));   // 32 OS units a step
    let i = 0;
    const step = () => {
      i++;
      const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * i / N;
      im.style.left = (x - 1) + 'px'; im.style.top = (y - 1) + 'px';
      if (i < N) requestAnimationFrame(step); else setTimeout(() => im.remove(), 600);   // WAIT per step
    };
    step();
  }

  // PROCbaricon: sprite "!flasher", button type 3
  task.addIconbarIcon({
    sprite: '!flasher',
    onClick: (ev) => { if (ev.button === 'select' || ev.button === 'adjust') showCaret(); },
    menu,
    help: () => M.lookup('H00', M.lookup(flashing ? 'Off' : 'On')),
  });

  task.on('quit', () => { setVisible(true); });
  task.onMessage('Quit', () => quit());
  schedule(0);
}
