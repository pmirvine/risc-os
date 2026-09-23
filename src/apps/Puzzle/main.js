// !Puzzle - the fifteen tile sliding block puzzle from the RISC OS 3.71 Diversions, recreated
// from the original BASIC !RunImage (Sources/Diversions/Puzzle). Drawing follows the original's
// RECTANGLE / PRINT calls in OS units (converted to pixels, 1 px = 2 OS units).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { vfs } from '../../core/vfs.js';
import { input } from '../../core/input.js';
import { parseMessagesText } from '../../core/messages.js';
import { loadSystemFont, rectFill, rectOutline, vduText } from '../Patience/vdutext.js';

const WIDTH = 4;    // WidthOfPuzzle
const DEFAULTS = {
  Puzzle: 'Puzzle', Menu: 'Puzzle', New: 'New board',
  Help: 'Click tile adjacent to blank space to move tile into blank space.|MRearrange tiles so they are in order from 1 to %0, left to right,|Mtop to bottom.',
  HelpNew: 'Click SELECT to generate a new pattern to solve',
};
const COLS = ['#ffffff', '#dddddd', '#bbbbbb', '#999999', '#777777', '#555555', '#333333', '#000000'];

export default async function start(task, ctx) {
  const dir = ctx.dir || ctx.app.appDir;
  let msgs = { ...DEFAULTS };
  try { msgs = { ...DEFAULTS, ...parseMessagesText(await vfs.readText(dir + '.Messages')) }; } catch { /* defaults */ }
  const msg = (t, a) => (msgs[t] ?? t).replace(/%0/g, a ?? '');
  await loadSystemFont();

  // ---------------------------------------------------------------- board
  const curside = WIDTH - 1;
  const Bd = [];                         // Bd[x][y]
  let xblank, yblank;
  function resizeBoard(side) {
    let t = 1;
    for (let x = 0; x <= side; x++) Bd[x] = [];
    for (let y = 0; y <= side; y++) for (let x = 0; x <= side; x++) Bd[x][y] = t++;
    Bd[side][side] = 0;
    xblank = side; yblank = side;
  }
  // Randomise by moving the blank about (algorithm from Don Bennett's X11 puzzle, as the original)
  function newBoard() {
    const s = curside + 1;
    let X = xblank, Y = yblank;
    const rnd = () => Math.floor(Math.random() * s);
    for (let i = 1; i <= 10 * s * s; i++) {
      let T = rnd();
      while (T > X) { Bd[X][Y] = Bd[X + 1][Y]; X++; }
      while (T < X) { Bd[X][Y] = Bd[X - 1][Y]; X--; }
      T = rnd();
      while (T > Y) { Bd[X][Y] = Bd[X][Y + 1]; Y++; }
      while (T < Y) { Bd[X][Y] = Bd[X][Y - 1]; Y--; }
    }
    Bd[X][Y] = 0;
    xblank = X; yblank = Y;
  }
  resizeBoard(curside);
  newBoard();
  const puzzleH = (curside + 1) * 64 + 24;   // OS units
  const puzzleW = (curside + 1) * 64 + 20;

  // ---------------------------------------------------------------- drawing (PROCredraw_window / PROCTile)
  function tile(g, X, Y) {
    const A = Bd[X][Y];
    const x = X * 64 + 14, y = -Y * 64 - 72;
    if (A) {
      g.fillStyle = COLS[0]; rectFill(g, x + 2, y + 4, 52, 48);
      g.fillStyle = COLS[7]; rectOutline(g, x, y, 56, 56);
      vduText(g, String(A), x + (A > 9 ? -8 : 0) + 20, y + 40);
    } else {
      g.fillStyle = COLS[4]; rectFill(g, x, y, 56, 56);
    }
  }
  function redraw(g) {
    g.fillStyle = COLS[3]; rectFill(g, 0, 0, puzzleW, -puzzleH);
    g.fillStyle = COLS[7]; rectOutline(g, 8, -8, puzzleW - 16, 16 - puzzleH);
    for (let X = 0; X <= curside; X++) for (let Y = 0; Y <= curside; Y++) tile(g, X, Y);
  }

  // ---------------------------------------------------------------- moves (PROCmove)
  function move(CX, CY) {
    if (CX >= 0 && CX <= curside && CY >= 0 && CY <= curside && (CX === xblank || CY === yblank)) {
      if (CX === xblank) {
        while (CY > yblank) { Bd[CX][yblank] = Bd[CX][yblank + 1]; yblank++; }
        while (CY < yblank) { Bd[CX][yblank] = Bd[CX][yblank - 1]; yblank--; }
      } else {
        while (CX > xblank) { Bd[xblank][CY] = Bd[xblank + 1][CY]; xblank++; }
        while (CX < xblank) { Bd[xblank][CY] = Bd[xblank - 1][CY]; xblank--; }
      }
      Bd[CX][CY] = 0;
      win.invalidate();
    } else wimp.beep();
  }

  // ---------------------------------------------------------------- window (old-style flags 3: title bar, moveable)
  const w = puzzleH / 2, h = puzzleW / 2;      // the original swaps them in the visible-area DATA
  // PROCpopup: centred horizontally on the pointer, top 64 OS units below it
  const px = input.mouseX ?? wimp.width / 2, py = input.mouseY ?? wimp.height / 2;
  const win = task.createWindow({
    title: msg('Puzzle'),
    flags: { back: true, close: true, title: true, moveable: true },
    colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: 3, scrollOuter: 3, scrollInner: 2, titleFocus: 12 },
    extent: { w: 640, h: 512 },
    // (the Wimp keeps the window on screen)
    x: Math.max(4, Math.min(wimp.width - w - 4, Math.round(px - w / 2))), y: Math.max(24, Math.min(wimp.height - h - 60, Math.round(py + 32))), w, h,
    workButton: 'click',
  });
  win.useCanvas((g) => redraw(g));
  win.on('click', (ev) => {
    if (ev.button === 'menu') { wimp.menus.openAt(menu(), ev, { task }); return true; }
    // PROCstrike: (mousex-bx-14)>>6, (by-8-mousey)>>6 in OS units
    move((ev.x * 2 - 14) >> 6, (ev.y * 2 - 8) >> 6);
    return true;
  });
  win.on('helprequest', (ev) => { ev.text = msg('Help', String((curside + 1) * (curside + 1) - 1)); });
  win.on('close', () => { task.quit(); });

  const menu = () => new Menu(msg('Menu'), [
    { text: msg('New'), help: msg('HelpNew'), action: () => { newBoard(); win.invalidate(); } },
  ]);

  task.onMessage('Quit', () => task.quit());
  win.open({ behind: 'top' });
  task.puzzle = { get board() { return Bd.map((c) => c.slice()); }, get blank() { return [xblank, yblank]; }, move, win };
}
