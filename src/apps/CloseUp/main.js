// !CloseUp - a faithful re-implementation of Stuart Hickinbottom's CloseUp 3.09 (RISC OS 3.71 HardDisc4.Apps).
//
// The original grabs a 400x400 OS unit sprite of the screen around the pointer (or the caret) on every
// null event and plots it scaled by Mul:Div into its window. Here the "screen grab" is a live clone of
// the desktop's window/menu layers that intersect the magnified area (canvases are copied pixel for
// pixel), shown through a CSS scale transform. As in the original:
//   * the CloseUp window's own work area shows as cream (Wimp colour 12) to avoid visual feedback,
//   * the area outside the screen is black, a red cross marks the pointer (Select toggles it),
//   * Adjust takes the input focus; with "Key-cursor" ticked the cursor keys then move the view point,
//   * "Follow caret" magnifies around the caret (unless a mouse button is held down),
//   * Zoom ▸ Magnifier box: Mul/Div with adjuster arrows (Adjust reverses), Return/↑/↓ in the fields.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { input } from '../../core/input.js';

const SIZE = 200;      // 400 OS units = 200 desktop pixels (captured and displayed)

export default async function start(task, ctx) {
  const [tpl, M] = await Promise.all([
    loadTemplates('assets/templates/CloseUp.json'),
    loadMessages('CloseUp'),
  ]);
  const msg = (t) => M.lookup(t);

  let mul = 2, div = 1;
  let pointerOn = true;       // position marker
  let grabCursors = false;    // Key-cursor
  let followCaret = false;
  let on = false;             // window open and updating
  let vdx = 0, vdy = 0;       // key-cursor offset from the real pointer
  let lastMouse = [input.mouseX, input.mouseY];

  // ------------------------------------------------------------------ windows
  const info = wimp.createWindowFromTemplate(tpl, 'proginfo', {}, task);
  info.icons[4].setText(msg('VERSNO'));

  const mag = wimp.createWindowFromTemplate(tpl, 'magnifier', {}, task);
  const MI = mag.icons;

  const win = wimp.createWindowFromTemplate(tpl, 'closeup', { title: 'CloseUp' }, task);
  win.helpText = msg('HLPWIN');
  const view = document.createElement('div');
  view.className = 'closeup-view';
  Object.assign(view.style, { position: 'absolute', left: '0px', top: '0px', width: SIZE + 'px', height: SIZE + 'px', overflow: 'hidden', background: '#000' });
  const stage = document.createElement('div');
  Object.assign(stage.style, { position: 'absolute', left: '0px', top: '0px', transformOrigin: '0 0', overflow: 'hidden', background: '#777777', imageRendering: 'pixelated' });
  view.appendChild(stage);
  view.style.left = win.extent.x0 + 'px'; view.style.top = win.extent.y0 + 'px';   // extent is 0..+396 OS (above the origin)
  win.work.appendChild(view);

  // ------------------------------------------------------------------ zoom
  function setZoom(m, d) {
    m = Math.round(m) || 1; d = Math.round(d) || 1;
    m = Math.max(1, Math.min(999, m)); d = Math.max(1, Math.min(999, d));
    if (m / d < 1) d = m;
    mul = m; div = d;
    MI[0].setText(String(mul)); MI[1].setText(String(div));
    if (on) update(true);
  }
  setZoom(2, 1);

  mag.on('click', (ev) => {
    if (ev.button === 'menu') return;
    let m = parseInt(MI[0].text, 10) || 1, d = parseInt(MI[1].text, 10) || 1;
    const s = ev.button === 'adjust' ? -1 : 1;
    const i = ev.iconIndex;
    if (i === 2) m += s; else if (i === 3) m -= s; else if (i === 4) d += s; else if (i === 5) d -= s; else return;
    setZoom(m, d);
    return true;
  });
  mag.on('key', (ev) => {
    const i = ev.icon ? MI.indexOf(ev.icon) : -1;
    if ((i === 0 || i === 1) && (ev.code === 13 || ev.code === 0x18E || ev.code === 0x18F)) {
      if (ev.code === 13) setZoom(parseInt(MI[0].text, 10) || 1, parseInt(MI[1].text, 10) || 1);
      const o = MI[1 - i];
      wimp.setCaret(mag, o, o.text.length);
      return true;
    }
  });

  // ------------------------------------------------------------------ the magnified view
  const screenPos = (el) => {
    const r = el.getBoundingClientRect(), s = wimp.screen.getBoundingClientRect(), k = wimp.scale || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  };

  function caretPoint() {
    const c = wimp.caretEl;
    if (!c || !c.isConnected || c.style.display === 'none' || !wimp.caret?.window?.isOpen) return null;
    const r = screenPos(c);
    if (r.h <= 0) return null;
    return { x: r.x + 1, y: r.y + r.h / 2 };
  }

  function copyCanvases(src, dst) {
    const a = src.querySelectorAll('canvas'), b = dst.querySelectorAll('canvas');
    for (let i = 0; i < a.length && i < b.length; i++) {
      if (!a[i].width || !a[i].height) continue;
      try { b[i].getContext('2d').drawImage(a[i], 0, 0); } catch { /* tainted / webgl */ }
    }
  }

  let lastKey = '';
  function update(force = false) {
    if (!on || !win.isOpen) return;
    // track real pointer movement (cancels any key-cursor offset)
    if (input.mouseX !== lastMouse[0] || input.mouseY !== lastMouse[1]) { vdx = vdy = 0; lastMouse = [input.mouseX, input.mouseY]; }
    const px = input.mouseX + vdx, py = input.mouseY + vdy;
    let cx = px, cy = py, caretOn = false;
    if (followCaret && !input.buttonsDown) {
      const c = caretPoint();
      if (c) { cx = c.x; cy = c.y; caretOn = true; }
    }
    const k = mul / div;
    const W = wimp.width, H = wimp.height;
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.transform = `translate(${SIZE / 2 - cx * k}px, ${SIZE / 2 - cy * k}px) scale(${k})`;
    const key = `${cx},${cy},${k}`;
    if (!force && key === lastKey && (performance.now() - lastBuild) < 250) return;
    lastKey = key;
    rebuild(cx, cy, k, px, py, pointerOn || caretOn);
  }

  let lastBuild = 0;
  function rebuild(cx, cy, k, px, py, marker) {
    lastBuild = performance.now();
    const half = SIZE / 2 / k + 2;
    const R = { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half };
    const frag = document.createDocumentFragment();
    for (const layer of [wimp.layers.windows, wimp.layers.menus, wimp.layers.drag]) {
      const lc = layer.cloneNode(false);
      lc.removeAttribute('id');
      for (const el of layer.children) {
        if (el.style.display === 'none' || el === wimp.caretEl) continue;
        const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
        if (x > R.x1 || y > R.y1 || x + w < R.x0 || y + h < R.y0) continue;
        if (el === win.el) {
          // our own window: furniture as on screen, work area cream (colour 12)
          const c = el.cloneNode(true);
          c.querySelectorAll('.closeup-view').forEach((v) => { v.replaceChildren(); v.style.background = '#eeeebb'; });
          lc.appendChild(c);
          continue;
        }
        const c = el.cloneNode(true);
        copyCanvases(el, c);
        lc.appendChild(c);
      }
      frag.appendChild(lc);
    }
    if (marker) {
      const line = (x, y, w, h) => { const d = document.createElement('div'); Object.assign(d.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', background: '#dd0000', zIndex: 300000 }); frag.appendChild(d); };
      line(Math.floor(px) - 4, Math.floor(py), 9, 1);
      line(Math.floor(px), Math.floor(py) - 4, 1, 9);
    }
    stage.replaceChildren(frag);
  }

  // ------------------------------------------------------------------ open / close
  function openCloseUp() {
    win.open({ behind: 'top' });
    on = true;
    update(true);
  }
  win.on('close', (ev) => { ev.preventDefault(); win.close(); on = false; stage.replaceChildren(); });
  win.on('open', (ev) => { if (!on) { ev.preventDefault(); } });
  let raf = 0;
  task.animate(() => { if (on && ++raf % 2 === 0) update(); });

  win.on('click', (ev) => {
    if (ev.button === 'menu') { wimp.menus.openAt(menu(), ev, { task }); return true; }
    if (ev.button === 'select') { pointerOn = !pointerOn; update(true); return true; }
    if (ev.button === 'adjust') { wimp.setCaret(win); return true; }
  });
  win.on('key', (ev) => {
    const step = { 0x18C: [-1, 0], 0x18D: [1, 0], 0x18E: [0, 1], 0x18F: [0, -1], 0x19C: [-10, 0], 0x19D: [10, 0], 0x19E: [0, 10], 0x19F: [0, -10] }[ev.code];
    if (!step || !grabCursors) return false;
    vdx += step[0]; vdy += step[1];
    update(true);
    return true;
  });

  // ------------------------------------------------------------------ menu, icon bar
  const menu = () => new Menu(msg('MENTIT'), [
    { text: msg('MNINFO'), submenu: info },
    { text: msg('MNZOOM'), submenu: mag },
    { text: msg('MNKYCR'), ticked: () => grabCursors, action: () => { grabCursors = !grabCursors; } },
    { text: msg('MNFOCA'), ticked: () => followCaret, action: () => { followCaret = !followCaret; update(true); } },
    { text: msg('MNQUIT'), action: () => task.quit() },
  ]);

  task.addIconbarIcon({
    sprite: '!closeup',
    help: msg('HLPICN'),
    onClick: (ev) => { if (ev.button !== 'menu') openCloseUp(); },
    menu,
  });
  task.onMessage('Quit', () => task.quit());
  task.onMessage('ModeChange', () => { if (on) update(true); });

  const auto = ctx.os?.sysvars?.get?.('CloseUp$AutoOpen');
  if (String(auto ?? '').toUpperCase() === 'TRUE') openCloseUp();
}
