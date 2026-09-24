// !Madness - "moves all of the windows on the screen except its own". Port of the BBC BASIC !RunImage
// (RISC OS 2 Applications 2 disc version 0.41, and 0.48 as published by RISC OS Open under the Apache
// licence; both use the same algorithm):
//
//  * Wimp_Initialise as "Window Madness"; no icon bar icon, no menu. It creates one window titled "Madness"
//    with no work area (just a title bar with back and close icons) and opens it at the BACK of the window
//    stack at (0,100) OS units - usually hidden behind the icon bar, as its !Help says.
//  * It ignores Open_Window_Request for its own window (so it can't be dragged); its close icon quits.
//  * Every 20 cs (Wimp_PollIdle, madspeed%=20) it moves ONE window: the one in front of the window it moved
//    last, starting from its own window and walking up the stack. When it reaches the top it starts again from
//    its own window, which it re-opens at the back.
//  * Each window has a velocity X%(handle AND 255), Y%(...), initially 4*RND(3) OS units (right and up). When
//    the window's visible area goes past the screen's right edge - 64 (top - 64) it gets -4*RND(3); past
//    x0 < 10 (y0 < 100) +4*RND(3). The move is sent to the owner as an Open_Window_Request (Wimp_SendMessage
//    reason 2), so the stacking order is kept and the owner may object. Windows are not put back on quit.
//  * The icon bar (fixed in Wimp 2.95: "!Madness made icon bar move"), the backdrop and panes are left alone.

import { wimp } from '../../core/wimp.js';
import { vfs } from '../../core/vfs.js';
import { textWidth } from '../../core/fonts.js';
import { parseMessagesText } from '../../core/messages.js';

const DEFAULTS = { TaskID: 'Window Madness', Madness: 'Madness' };
const MADSPEED = 20;                          // centiseconds
const RND3 = () => 1 + Math.floor(Math.random() * 3);

export default async function start(task, ctx) {
  const dir = ctx.dir || ctx.app.appDir;
  let M = { ...DEFAULTS };
  try { M = { ...DEFAULTS, ...parseMessagesText(await vfs.readText(dir + '.Messages')) }; } catch { /* defaults */ }
  task.name = M.TaskID;

  // DIM X%(255),Y%(255): FOR X%=0 TO 255: X%(X%)=4*RND(3): Y%(X%)=4*RND(3)
  const X = Array.from({ length: 256 }, () => 4 * RND3());
  const Y = Array.from({ length: 256 }, () => 4 * RND3());

  // DATA NotUsed,%1010011,... : title bar, moveable, auto-redraw, no bounds (back and close icons)
  const title = M.Madness;
  const win = task.createWindow({
    title,
    flags: { back: true, close: true, title: true, moveable: true, noBounds: true },
    colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: 1, scrollOuter: 3, scrollInner: 2, titleFocus: 12 },
    extent: { x0: 0, y0: 0, x1: 640, y1: 512 },
    // a zero-size visible area: the Wimp makes the window as wide as its title needs
    minW: Math.ceil(textWidth(title)) + 16 + 2 * 20, minH: 0.01,
    x: 0, y: 0, w: 0, h: 0,
  });
  win.helpText = 'This is the !Madness window.|MClick on the close icon to stop !Madness.';
  win.on('open', (ev) => { ev.preventDefault(); });           // Open_Window_Request ignored
  win.on('close', (ev) => { ev.preventDefault(); task.quit(); });

  // PROCpopup: (0,100) OS units = bottom-left of the visible area, at the back (behind -2): below the icon bar
  // too, unless that has been brought to the front with Shift-F12
  const popup = () => {
    const ib = wimp.iconbar?.window;
    const behind = ib && !wimp.iconbarFront && wimp.stack.includes(ib) ? ib : 'bottom';
    win.open({ x: 0, y: wimp.height - 50, w: 0, h: 0, behind });
  };
  popup();

  let after = win;
  const eligible = (w) => w && w.isOpen && !w._isIconbar && !w.isBackWindow && !w.isPane && !w._paneParent && !w._menuWindow;

  function nudge() {
    const s = wimp.stack;
    const i = s.indexOf(after);
    let next = null;
    if (i >= 0 && after.isOpen) for (let j = i + 1; j < s.length; j++) if (eligible(s[j]) || s[j] === win) { next = s[j]; break; }
    if (!next || next === win) { after = win; popup(); return; }   // top of the stack: ERROR -> start again
    after = next;
    const w = next;
    const ros = wimp.width * 2, tos = wimp.height * 2;              // screen size in OS units
    const x0 = w.x * 2, x1 = (w.x + w.w) * 2;
    const y0 = (wimp.height - (w.y + w.h)) * 2, y1 = (wimp.height - w.y) * 2;
    const a = w.handle & 255;
    if (x1 > ros - 64) X[a] = -RND3() * 4; else if (x0 < 10) X[a] = RND3() * 4;
    if (y1 > tos - 64) Y[a] = -RND3() * 4; else if (y0 < 100) Y[a] = RND3() * 4;
    w.requestOpen({ x: w.x + X[a] / 2, y: w.y - Y[a] / 2, behind: 'keep' });
  }
  task.every(MADSPEED * 10, nudge);
  task.onMessage('Quit', () => task.quit());
  task.madness = { win, nudge, get after() { return after; }, X, Y };
}
