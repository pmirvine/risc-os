// !Patience - the RISC OS 3.71 Diversions card game (Klondike variant), recreated from the
// original BASIC !RunImage (Sources/Diversions/Patience). Coordinates below are the original's
// OS-unit work-area coordinates; drawing converts them to pixels (1 px = 2 OS units).
//
// Card encoding as in the original: N = suit + rank*4 (suit 0 club, 1 diamond, 2 heart, 3 spade;
// rank 1..13), +128 = face down. Piles A..G are arrays of such numbers (index 0 = bottom).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { vfs } from '../../core/vfs.js';
import { loadManifest } from '../../core/sprites.js';
import { loadSystemFont, rectFill, vduText, plotSprite, parseLines } from './vdutext.js';

const DEFAULT_MSGS = ['Deal Hand', 'Resign', 'New Pack', 'Only Kings', 'Rev. Cards', 'Save Choices', 'Quit',
  'Games: ', ' Won: ', 'Patience', ' (Internal Error ', ')', '!Patience', 'Patience'];
const SUITS = ['club', 'diamond', 'heart', 'spade'];
const WBCOL = 10;   // `wbcol: green baize

export default async function start(task, ctx) {
  const dir = ctx.dir || ctx.app.appDir;
  // ---------------------------------------------------------------- resources
  let m = DEFAULT_MSGS.slice();
  try { const t = parseLines(await vfs.readText(dir + '.Messages')); if (t.length >= 14) m = t; } catch { /* defaults */ }
  const sprMap = await loadManifest('Patience', 'Sprites22');
  const canv = new Map();
  await Promise.all([...sprMap.values()].map(async (s) => { try { canv.set(s.name, await s.canvas()); } catch { /* */ } }));
  await loadSystemFont();
  const spr = (name) => sprMap.get(name);

  // ---------------------------------------------------------------- choices (!Config)
  let cback = 0, kingsonly = true, dealreverse = true, numberover = 3;
  try {
    const cfg = dir + '.!Config';
    if (vfs.exists(cfg)) {
      const l = (await vfs.readText(cfg)).split(/\r?\n/);
      cback = parseInt(l[0], 10) || 0;
      kingsonly = (parseInt(l[1], 10) || 0) !== 0;
      dealreverse = (parseInt(l[2], 10) || 0) !== 0;
      numberover = parseInt(l[3], 10) || 3;
    }
  } catch { /* defaults */ }
  if (!spr('back' + cback)) cback = 0;

  // ---------------------------------------------------------------- game state
  let piles = [[], [], [], [], [], [], []];   // A..G
  let S = [0, 1, 2, 3];                        // suit stacks: top card (rank 0 = empty)
  let pack = [];                               // PACK$ (face up values)
  let place = 0;                               // PLACE: cards 1..place are the waste pile
  let play = true, dealnumber = numberover;
  let gamesstarted = 0, gamesout = 0;

  function shuffle() {
    const deck = [];
    for (let i = 0; i < 4; i++) for (let j = 1; j <= 13; j++) deck.push(i + j * 4);
    const p = [];
    while (deck.length) p.push(deck.splice(Math.floor(Math.random() * deck.length), 1)[0] + 128);
    let k = 0;
    piles = [];
    for (let i = 1; i <= 7; i++) {
      const pile = p.slice(k, k + 7 - i);            // face down
      pile.push(p[k + 7 - i] & 127);                 // one face up
      k += 8 - i;
      piles.push(pile);
    }
    pack = p.slice(k).map((c) => c & 127);
    place = 0;
    S = [0, 1, 2, 3];
    play = true; dealnumber = numberover;
  }
  const checkbacks = () => piles.every((p) => p.every((c) => c < 128));

  // ---------------------------------------------------------------- drawing
  const setCol = (g, c) => { g.fillStyle = ['#ffffff', '#dddddd', '#bbbbbb', '#999999', '#777777', '#555555', '#333333', '#000000', '#004499', '#eeee00', '#00cc00', '#dd0000'][c] ?? '#000'; };
  const plot = (g, name, x, y) => plotSprite(g, spr(name), canv.get(name), x, y);
  function rankText(n) { n >>= 2; if (n > 1 && n < 11) return String(n); return { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[n] ?? ''; }
  function card(g, n, x, y) {
    plot(g, SUITS[n & 3], x, y);
    setCol(g, ((n ^ (n >> 1)) & 1) ? 11 : 7);
    vduText(g, rankText(n), x + 24, y + 72);
  }
  function halfCard(g, n, x, y) {
    plot(g, 'half' + SUITS[n & 3], x, y + 40);
    setCol(g, ((n ^ (n >> 1)) & 1) ? 11 : 7);
    vduText(g, rankText(n), x + 24, y + 72);
  }
  const back = (g, x, y) => plot(g, 'back' + cback, x, y);
  const halfBack = (g, x, y) => plot(g, 'half' + cback, x, y + 40);
  const noCard = (g, x, y) => { setCol(g, WBCOL); rectFill(g, x, y, 60, 83); };
  const cardHole = (g, x, y) => { setCol(g, 3); rectFill(g, x, y, 60, 83); };
  function pile(g, a, x, y) {
    if (!a.length) return;
    for (let i = 0; i < a.length - 1; i++) { if (a[i] > 127) halfBack(g, x, y); else halfCard(g, a[i], x, y); y -= 40; }
    const j = a[a.length - 1];
    if (j > 127) back(g, x, y); else card(g, j, x, y);
  }
  function redraw(g) {
    for (let z = 0; z < 7; z++) pile(g, piles[z], 8 + z * 68, -96);
    for (let i = 0; i < 4; i++) card(g, S[i], (7 + i) * 68 + 24, -128);
    if (pack.length) {
      setCol(g, 7);
      vduText(g, String(pack.length).padStart(5, ' '), 9 * 68, -280);   // @%=5
      if (place === pack.length) cardHole(g, 24 + 9 * 68, -256); else back(g, 24 + 9 * 68, -256);
      if (place > 0) card(g, pack[place - 1], 24 + 8 * 68, -256); else noCard(g, 24 + 8 * 68, -256);
    }
    // "Jiggle the position where the line is plotted depending upon its length"
    const won = m[7] + gamesstarted + ' ' + m[8] + gamesout;
    setCol(g, 7);
    vduText(g, won, 480 - (won.length - 16) * 16, -580);
  }

  // ---------------------------------------------------------------- moves (PROCTO / PROCNEXT)
  const beep = () => wimp.beep();
  let src = null;   // SRC$: 'P' (waste) or 0..6
  function fnFrom(a) {
    src = a;
    if (a === 'P' && (place === 0 || pack.length === 0)) { beep(); return true; }
    if (a !== 'P' && (a < 0 || a > 6 || piles[a].length === 0)) { beep(); return true; }
    return false;
  }
  function remPack() { place -= 1; pack.splice(place, 1); }
  function remCards(i, j) {
    const p = piles[i];
    p.length -= j;
    if (p.length) p[p.length - 1] &= 127;          // turn the next card over
  }
  function fnChk(cardt, c) {
    if (cardt === -1) return kingsonly ? (c >> 2) === 13 : c < 127;
    const ct = (cardt ^ c) & 3;
    if (ct === 0 || ct === 3) return false;
    return (cardt >> 2) === (c >> 2) + 1;
  }
  function moveTo(a, b) {
    if (b === 'S') {
      const c = a === 'P' ? pack[place - 1] : piles[a][piles[a].length - 1];
      const i = c & 3;
      if (c !== S[i] + 4) { beep(); return; }
      S[i] = c;
      if (a === 'P') remPack(); else remCards(a, 1);
    } else {
      if (b < 0 || b > 6) { beep(); return; }
      const t = piles[b];
      const cardt = t.length ? t[t.length - 1] : -1;
      if (a === 'P') {
        const c = pack[place - 1];
        if (!fnChk(cardt, c)) { beep(); return; }
        t.push(c); remPack();
      } else {
        const p = piles[a];
        let d = 0;
        while (d < p.length && !fnChk(cardt, p[d])) d++;
        if (d >= p.length) { beep(); return; }
        const run = p.slice(d);
        remCards(a, p.length - d);
        t.push(...run);
      }
    }
    win.invalidate();
  }
  function next() {
    if (!pack.length) { beep(); return; }
    if (place === pack.length) place = 0;
    let n1;
    if (dealreverse) {
      n1 = [];
      for (let i = dealnumber; i >= 1; i--) if (place + i - 1 < pack.length) n1.push(pack[place + i - 1]);
    } else n1 = pack.slice(place, place + dealnumber);
    pack = [...pack.slice(0, place), ...n1, ...pack.slice(place + dealnumber)];
    place += n1.length;
    win.invalidate();
  }

  // ---------------------------------------------------------------- window
  const W = 400, H = 320;
  const win = task.createWindow({
    title: m[13],
    flags: { back: true, close: true, title: true, toggle: true, vscroll: true, hscroll: true, size: true, moveable: true },
    colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: WBCOL, scrollOuter: 3, scrollInner: 1, titleFocus: 12 },
    extent: { w: 400, h: 512 },
    x: Math.round((wimp.width - W) / 2), y: Math.round((wimp.height - H) / 2), w: W, h: H,
    workButton: 'click',
  });
  win.useCanvas((g) => redraw(g));
  // work-area pixel -> original OS-unit coordinates relative to the work-area origin
  const toOS = (wx, wy) => ({ X: wx * 2, Y: -wy * 2 });
  const pileAt = (X) => Math.trunc((X - 8) / 68);

  win.on('click', (ev) => {
    if (ev.button === 'menu') { wimp.menus.openAt(winMenu(), ev, { task }); return true; }
    const { X, Y } = toOS(ev.x, ev.y);
    if (ev.button === 'select') {
      if (X >= 24 + 9 * 68 && Y < -176 && Y >= -256) { next(); return true; }
      let from = null;
      if (play && X >= 24 + 8 * 68 && Y < -176 && Y >= -256) from = 'P';
      else if (play && X < 8 + 7 * 68) from = pileAt(X);
      if (from === null) return true;
      if (fnFrom(from)) return true;
      // Wimp_DragBox type 5: 60x80 OS box around the pointer, confined to the window
      const box = { x0: ev.sx - 15, y0: ev.sy - 20, x1: ev.sx + 15, y1: ev.sy + 20 };
      wimp.drag({ type: 'fixed', box, bounds: { x0: win.x, y0: win.y, x1: win.x + win.w, y1: win.y + win.h } }).then((drop) => dragEnd(drop));
      return true;
    }
    if (ev.button === 'adjust') {
      if (X >= 24 + 9 * 68 && Y < -176 && Y >= -256) { next(); return true; }
      if (play && X >= 24 + 8 * 68 && Y < -176 && Y >= -256) { if (!fnFrom('P')) moveTo(src, 'S'); return true; }
      if (play && X < 8 + 7 * 68) { if (!fnFrom(pileAt(X))) moveTo(src, 'S'); return true; }
    }
    return true;
  });
  function dragEnd(drop) {
    const wp = win.screenToWork(drop.sx, drop.sy);
    const { X, Y } = toOS(wp.x, wp.y);
    if (X > 24 + 9 * 68 && Y < -176 && Y > -256) return;
    if (X >= 8 + 7 * 68 && Y >= -176) { moveTo(src, 'S'); return; }
    if (X < 8 + 7 * 68) moveTo(src, pileAt(X));
  }
  win.on('close', (ev) => { ev.preventDefault(); win.close(); });

  // ---------------------------------------------------------------- menus
  const winMenu = () => new Menu(m[9], [
    { text: m[0], action: () => { gamesstarted += 1; if (!pack.length && checkbacks()) gamesout += 1; shuffle(); win.invalidate(); } },
    { text: m[1], action: () => { for (const p of piles) for (let j = 0; j < p.length; j++) p[j] &= 127; play = false; dealnumber = 1; win.invalidate(); } },
    { text: m[2], action: () => { cback += 1; if (!spr('back' + cback)) cback = 0; win.invalidate(); } },
    { text: m[3], ticked: () => kingsonly, action: () => { kingsonly = !kingsonly; } },
    { text: m[4], ticked: () => dealreverse, action: () => { dealreverse = !dealreverse; } },
  ]);
  const barMenu = () => new Menu(m[9], [
    { text: m[5], action: () => saveChoices() },
    { text: m[6], action: () => task.quit() },
  ]);
  function saveChoices() {
    try {
      const b = (v) => (v ? '-1' : '0');
      vfs.writeFile(dir + '.!Config', `${cback}\n${b(kingsonly)}\n${b(dealreverse)}\n${numberover}\n`, { filetype: 0xFFF });
    } catch (e) { task.reportError(e.message ?? String(e)); }
  }

  task.addIconbarIcon({
    sprite: ctx.app.sprite,
    onClick: (ev) => { if (ev.button === 'select' || ev.button === 'adjust') win.open({ behind: 'top' }); },
    menu: barMenu,
  });
  task.onMessage('Quit', () => task.quit());

  shuffle();
  // The original only opens the window when the icon bar icon is clicked.
  task.patience = { get state() { return { piles, S, pack, place, play, gamesstarted, gamesout, kingsonly, dealreverse, cback }; }, win, next, moveTo: (a, b) => moveTo(a, b), shuffle: () => { shuffle(); win.invalidate(); } };
}
