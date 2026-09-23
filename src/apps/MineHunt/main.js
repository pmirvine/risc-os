// !MineHunt - Paul LeBeau's Mine Hunt (RISC OS 3.71 Diversions).
//
// The original is a compiled C program (!RunImage,ff8, squeezed), so the behaviour here is
// reconstructed from its !Help, Messages, Templates and sprite files (see docs/apps/MineHunt.md):
//  - board drawn from the real 'Parts' sprites (tplft/tpmid/tprgt header with LED counters and
//    the man, sides, btlft/btmid/btrgt, cover/blank/s1..s8/flag/qmark/mine/badmine/goodflag);
//  - SELECT uncovers, ADJUST cycles clear -> flag -> question mark (if on) -> clear,
//    SHIFT-SELECT "clears around" a numbered square; flagged squares are protected;
//  - win = every mine flagged and every other square uncovered; score = seconds, timer
//    starts at the first uncover; 5 levels + Custom; top-5 high score table per level;
//  - click the man for a new game, click the LED digits to cycle their colour.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { infoBox } from '../../core/dialogs.js';
import { loadTemplates } from '../../core/templates.js';
import { loadManifest } from '../../core/sprites.js';
import { vfs } from '../../core/vfs.js';

const LEVELS = [
  { name: 'Beginner', w: 8, h: 8, mines: 10 },
  { name: 'Better', w: 16, h: 8, mines: 20 },
  { name: 'Intermediate', w: 16, h: 16, mines: 40 },
  { name: 'Good', w: 24, h: 16, mines: 60 },
  { name: 'Expert', w: 30, h: 16, mines: 99 },
];
const LED_COLOURS = [[0, 204, 0], [221, 221, 221], [0, 187, 255], [255, 187, 0]]; // green, light grey, blue, orange
const TILE = 24;          // square size in desktop pixels (sprite 24x12 at mode 12 = 48x48 OS)
const SIDE = 16;          // 'sides' width
const TOP = 64;           // header height (tplft etc. 32 rows at yeig 2)
const BOT = 16;           // bottom edge height
const MAXDIM = 64;
// cell states
const COVER = 0, FLAG = 1, QMARK = 2, OPEN = 3;

export default async function start(task, ctx) {
  const M = await (await fetch('assets/messages/MineHunt.json')).json();
  const tpl = await loadTemplates('assets/templates/MineHunt.json');
  const wimpSprites = await loadManifest('MineHunt', 'Sprites');
  const partsMap = await loadManifest('MineHunt', 'Parts');
  const parts = {};
  await Promise.all([...partsMap].map(async ([n, s]) => { parts[n] = { c: await s.canvas(), w: s.cssW, h: s.cssH }; }));
  const ledCache = new Map();
  const led = (d, col) => {           // digit sprite recoloured to an LED colour
    const key = d + ':' + col;
    if (!ledCache.has(key)) {
      const src = parts[d].c;
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d'); g.drawImage(src, 0, 0);
      if (col) {
        const id = g.getImageData(0, 0, c.width, c.height), p = id.data, [r, gg, b] = LED_COLOURS[col];
        for (let i = 0; i < p.length; i += 4) if (p[i] === 0 && p[i + 1] === 204 && p[i + 2] === 0) { p[i] = r; p[i + 1] = gg; p[i + 2] = b; }
        g.putImageData(id, 0, 0);
      }
      ledCache.set(key, c);
    }
    return ledCache.get(key);
  };

  // ------------------------------------------------------------------ settings & scores
  const dir = ctx.dir || ctx.app.appDir;
  const choicesPath = dir + '.Choices', scoresPath = dir + '.HiScores';
  const opts = { level: 0, custom: { w: 10, h: 10, mines: 16 }, qmarks: true, sound: true, loud: false, mineCol: 0, timeCol: 0 };
  let scores = LEVELS.map(() => []);            // [{name, time}] best first
  try { if (vfs.exists(choicesPath)) Object.assign(opts, JSON.parse(await vfs.readText(choicesPath))); } catch { /* defaults */ }
  try { if (vfs.exists(scoresPath)) { const s = JSON.parse(await vfs.readText(scoresPath)); if (Array.isArray(s) && s.length === 5) scores = s; } } catch { /* empty */ }
  const saveChoices = () => { try { vfs.writeFile(choicesPath, JSON.stringify(opts), { filetype: 0xFFD }); } catch (e) { task.reportError(e.message); } };
  const saveScores = () => { try { vfs.writeFile(scoresPath, JSON.stringify(scores), { filetype: 0xFFD }); } catch (e) { task.reportError(e.message); } };

  // ------------------------------------------------------------------ sound (the original uses
  // speech sample modules - Applause, YouDidIt, Spiffing, RealMine, Shame, TryAgain - which are
  // not on the disc; simple synthesised effects stand in for them)
  let actx = null;
  function sound(kind) {
    if (!opts.sound) return;
    try {
      actx ??= new AudioContext();
      const t0 = actx.currentTime, vol = opts.loud ? 0.35 : 0.08;
      const g = actx.createGain(); g.connect(actx.destination);
      if (kind === 'boom') {
        const len = actx.sampleRate * 0.6, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const s = actx.createBufferSource(); s.buffer = buf;
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        s.connect(f); f.connect(g); g.gain.value = vol * 2; s.start(t0);
      } else {
        const notes = kind === 'win' ? [523, 659, 784, 1047] : [880];
        notes.forEach((fr, i) => {
          const o = actx.createOscillator(); o.type = 'square'; o.frequency.value = fr;
          const og = actx.createGain(); og.gain.setValueAtTime(vol * 0.5, t0 + i * 0.12); og.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.12 + 0.11);
          o.connect(og); og.connect(g); o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.12);
        });
      }
    } catch { /* no audio */ }
  }

  // ------------------------------------------------------------------ game state
  let W, H, NM;                 // board size and mine count
  let mine, state, count;       // Uint8Arrays
  let flags = 0, opened = 0, status = 'play'; // 'play' | 'lost' | 'won'
  let startTime = 0, elapsed = 0, running = false, hit = -1;

  const cur = () => (opts.level >= 0 && opts.level < 5 ? LEVELS[opts.level] : opts.custom);
  const boardW = (w) => SIDE * 2 + TILE * w, boardH = (h) => TOP + TILE * h + BOT;
  const fits = (w, h) => {
    const r = wimp.screenRect(true);
    return boardW(w) + 24 <= r.w && boardH(h) + 48 <= r.h;
  };

  function newGame() {
    const l = cur();
    W = l.w; H = l.h; NM = Math.min(l.mines, W * H - 1);
    mine = new Uint8Array(W * H); state = new Uint8Array(W * H); count = new Uint8Array(W * H);
    let n = 0;
    while (n < NM) { const i = Math.floor(Math.random() * W * H); if (!mine[i]) { mine[i] = 1; n++; } }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = 0;
      forNb(x, y, (j) => { c += mine[j]; });
      count[y * W + x] = c;
    }
    flags = 0; opened = 0; status = 'play'; running = false; elapsed = 0; hit = -1;
    if (win) sizeWindow();
    redraw();
  }
  function forNb(x, y, fn) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const a = x + dx, b = y + dy;
      if (a >= 0 && b >= 0 && a < W && b < H) fn(b * W + a, a, b);
    }
  }

  function uncover(x, y) {
    const i = y * W + x;
    if (state[i] === OPEN || state[i] === FLAG) return;
    if (!running && status === 'play') { running = true; startTime = performance.now(); }
    if (mine[i]) { state[i] = OPEN; hit = i; lose(); return; }
    // flood fill blank squares
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (state[j] === OPEN || state[j] === FLAG) continue;
      state[j] = OPEN; opened++;
      if (!count[j]) forNb(j % W, Math.floor(j / W), (k) => { if (state[k] !== OPEN && state[k] !== FLAG && !mine[k]) stack.push(k); });
    }
  }
  function clearAround(x, y) {
    const i = y * W + x;
    if (state[i] !== OPEN || !count[i]) return;
    let f = 0;
    forNb(x, y, (j) => { if (state[j] === FLAG) f++; });
    if (f !== count[i]) return;
    forNb(x, y, (j, a, b) => { if (status === 'play' && state[j] !== FLAG && state[j] !== OPEN) uncover(a, b); });
  }
  function lose() {
    status = 'lost'; running = false; tick();
    sound('boom');
  }
  function checkWin() {
    if (status !== 'play' || opened !== W * H - NM) return;
    for (let i = 0; i < W * H; i++) if (mine[i] && state[i] !== FLAG) return;
    status = 'won'; running = false; tick();
    sound('win');
    const secs = Math.max(1, Math.min(9999, Math.floor(elapsed)));
    if (opts.level >= 0 && opts.level < 5) {
      const tab = scores[opts.level];
      const pos = tab.findIndex((e) => secs < e.time);
      const rank = pos < 0 ? tab.length : pos;
      if (rank < 5) enterName(opts.level, rank, secs);
    }
  }
  function tick() {
    if (running) elapsed = (performance.now() - startTime) / 1000;
    redraw(true);
  }

  // ------------------------------------------------------------------ the game window
  let win = null;
  function drawLed(g, x, y, value, col) {
    const v = Math.max(0, Math.min(999, value));
    const s = String(v).padStart(3, ' ');
    for (let k = 0; k < 3; k++) g.drawImage(led(s[k] === ' ' ? 'b' : s[k], col), x + k * 20, y, 20, 32);
  }
  function paint(g) {
    const P = (n, x, y) => { const p = parts[n]; g.drawImage(p.c, x, y, p.w, p.h); };
    const bw = boardW(W), bh = boardH(H);
    // header
    for (let x = 0; x < bw; x += TILE) P('tpmid', x, 0);
    P('tplft', 0, 0);
    P('tprgt', bw - 134, 0);
    drawLed(g, 16, 16, NM - flags, opts.mineCol);
    P(status === 'lost' ? 'dead' : status === 'won' ? 'success' : 'alive', bw - 134 + 6, 16);
    drawLed(g, bw - 134 + 58, 16, Math.floor(elapsed), opts.timeCol);
    // sides and bottom
    for (let y = 0; y < H; y++) { P('sides', 0, TOP + y * TILE); P('sides', bw - SIDE, TOP + y * TILE); }
    P('btlft', 0, bh - BOT);
    for (let x = 0; x < W; x++) P('btmid', SIDE + x * TILE, bh - BOT);
    P('btrgt', bw - SIDE, bh - BOT);
    // squares
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, st = state[i];
      let n;
      if (status !== 'play' && mine[i]) n = i === hit ? 'badmine' : st === FLAG ? 'goodflag' : 'mine';
      else if (st === OPEN) n = count[i] ? 's' + count[i] : 'blank';
      else if (i === pressed) n = 'blank';
      else n = st === FLAG ? 'flag' : st === QMARK ? 'qmark' : 'cover';
      P(n, SIDE + x * TILE, TOP + y * TILE);
    }
  }
  let pressed = -1;
  function redraw() { win?.invalidate(); }

  function sizeWindow(center = false) {
    const w = boardW(W), h = boardH(H);
    win.setExtent({ w, h });
    const r = wimp.screenRect(true);
    const st = win.isOpen ? win.getState() : null;
    let x = st && !center ? st.x : Math.round((r.w - w) / 2), y = st && !center ? st.y : Math.max(40, Math.round((r.h - h) / 2));
    x = Math.max(4, Math.min(x, r.w - w - 4)); y = Math.max(24, Math.min(y, r.h - h - 4));
    if (win.isOpen) win.open({ x, y, w, h, scrollX: 0, scrollY: 0, behind: 'keep' });
    else { win._pos = { x, y, w, h }; }
  }
  function openGame() {
    if (!win) {
      win = task.createWindowFromTemplate(tpl, 'Main', { workButton: 'click', spriteArea: wimpSprites });
      win.helpText = M.MAIN;
      win.useCanvas((g) => paint(g));
      win.on('click', onClick);
      win.on('close', (ev) => { ev.preventDefault(); win.close(); });
      sizeWindow(true);
      win.open({ ...win._pos, scrollX: 0, scrollY: 0, behind: 'top' });
      return;
    }
    if (!win.isOpen) { sizeWindow(true); win.open({ ...win._pos, scrollX: 0, scrollY: 0, behind: 'top' }); } else win.open({ behind: 'top' });
    redraw();
  }

  function onClick(ev) {
    if (ev.button === 'menu') { wimp.menus.openAt(gameMenu(), ev, { task }); return true; }
    const bw = boardW(W);
    const { x, y } = ev;
    // header: man, LEDs
    if (y >= 16 && y < 48) {
      if (x >= bw - 128 && x < bw - 96) { newGame(); return true; }
      if (x >= 16 && x < 76) { opts.mineCol = (opts.mineCol + 1) % 4; redraw(); return true; }
      if (x >= bw - 76 && x < bw - 16) { opts.timeCol = (opts.timeCol + 1) % 4; redraw(); return true; }
    }
    const cx = Math.floor((x - SIDE) / TILE), cy = Math.floor((y - TOP) / TILE);
    if (status !== 'play' || cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    const i = cy * W + cx;
    // SHIFT-SELECT = clear around (with the default mouse mapping Shift+left arrives as Adjust,
    // which does nothing on uncovered squares, so treat it as clear-around there too)
    if (ev.shift && state[i] === OPEN) { clearAround(cx, cy); if (status === 'play') checkWin(); redraw(); return true; }
    if (ev.button === 'select') {
      if (ev.shift) clearAround(cx, cy);
      else if (state[i] !== FLAG && state[i] !== OPEN) uncover(cx, cy);
      if (status === 'play') { sound('click'); checkWin(); }
    } else if (ev.button === 'adjust') {
      if (state[i] === OPEN) return true;
      if (state[i] === COVER) { state[i] = FLAG; flags++; }
      else if (state[i] === FLAG) { state[i] = opts.qmarks ? QMARK : COVER; flags--; }
      else state[i] = COVER;
      checkWin();
    }
    redraw();
    return true;
  }

  task.every(250, () => { if (running) { const s = Math.floor(elapsed); elapsed = (performance.now() - startTime) / 1000; if (Math.floor(elapsed) !== s) redraw(); } });

  // ------------------------------------------------------------------ dialogues
  let info = null;
  const infoWin = () => (info ??= infoBox(task, {
    name: M.INnamed, purpose: M.INpurpd, author: M.INauthd, version: M.INversd,
  }, { template: tpl, name: 'ProgInfo', title: M.INtitle }));

  let custom = null;
  let cw = opts.custom.w, ch = opts.custom.h, cm = opts.custom.mines;
  const maxW = () => { let m = MAXDIM; while (m > 8 && !fits(m, Math.max(ch, 1))) m--; return m; };
  const maxH = () => { let m = MAXDIM; while (m > 2 && !fits(Math.max(cw, 8), m)) m--; return m; };
  const auto = () => Math.max(1, Math.round((cw * ch * 10) / 64));
  function customWin() {
    if (!custom) {
      custom = task.createWindowFromTemplate(tpl, 'Custom', { title: M.CLtitle, spriteArea: wimpSprites });
      custom.helpText = M.CUST;
      const help = { 1: 'CUST1', 4: 'CUST4', 5: 'CUST5', 8: 'CUST8', 9: 'CUST9', 12: 'CUSTc', 13: 'CUSTd', 14: 'CUSTe' };
      for (const [k, v] of Object.entries(help)) if (custom.icons[k]) custom.icons[k].help = M[v];
      custom.on('click', (ev) => {
        const i = ev.iconIndex, d = ev.button === 'adjust' ? -1 : 1;
        if (i === 4 || i === 5) cw += (i === 5 ? 1 : -1) * d;
        else if (i === 8 || i === 9) ch += (i === 9 ? 1 : -1) * d;
        else if (i === 12 || i === 13) cm += (i === 13 ? 1 : -1) * d;
        else if (i === 14) cm = auto();
        else if (i === 1) {
          clampCustom();
          opts.custom = { w: cw, h: ch, mines: cm }; opts.level = 5;
          wimp.menus.close(); newGame(); openGame();
          return true;
        } else return;
        clampCustom(); return true;
      });
    }
    clampCustom();
    return custom;
  }
  function clampCustom() {
    cw = Math.max(8, Math.min(maxW(), cw));
    ch = Math.max(2, Math.min(maxH(), ch));
    cm = Math.max(1, Math.min(cw * ch - 1, 999, cm));
    custom?.icons[3].setText(String(cw)); custom?.icons[7].setText(String(ch)); custom?.icons[11].setText(String(cm));
  }

  let hsWin = null;
  function showScores() {
    if (!hsWin) {
      hsWin = task.createWindowFromTemplate(tpl, 'HighScore', { title: M.HStitle });
      hsWin.on('close', (ev) => { ev.preventDefault(); hsWin.close(); });
    }
    for (let l = 0; l < 5; l++) {
      hsWin.icons[l * 16].setText(LEVELS[l].name);
      for (let r = 0; r < 5; r++) {
        const e = scores[l][r], base = l * 16 + 1 + r * 3;
        hsWin.icons[base + 1].setText(e ? e.name : '');
        hsWin.icons[base + 2].setText(e ? String(e.time) : '');
      }
    }
    if (!hsWin.isOpen) {
      const ly = opts.level >= 0 && opts.level < 5 ? opts.level * 174 : 0;   // scroll to the current level (348 OS units each)
      hsWin.open({ behind: 'top', scrollY: Math.min(ly, 870 - hsWin.h) });
    } else hsWin.open({ behind: 'top' });
  }

  let enWin = null;
  function enterName(level, rank, secs) {
    enWin?.delete();
    enWin = task.createWindowFromTemplate(tpl, 'EnterName', { title: M.ENtitle });
    const I = enWin.icons;
    I[0].setText(M.ENline1);
    const nth = M['ENline2' + (rank + 1)];
    I[1].setText((nth ? nth + ' ' : '') + M.ENline2);
    I[2].setText(LEVELS[level].name);
    I[3].setText(M.ENline4);
    I[4].setText(M.ENline5);
    I[5].setText(String(rank + 1));
    I[6].setText('');
    I[7].setText(String(secs));
    const accept = () => {
      const name = I[6].text.trim() || M.ENnoname;
      scores[level].splice(rank, 0, { name, time: secs });
      scores[level].length = Math.min(5, scores[level].length);
      saveScores();
      enWin.delete(); enWin = null;
      showScores();
    };
    enWin.on('key', (ev) => { if (ev.code === 13) { accept(); return true; } if (ev.code === 27) { enWin.delete(); enWin = null; return true; } });
    enWin.on('close', (ev) => { ev.preventDefault(); accept(); });
    const r = wimp.screenRect(true);
    enWin.open({ x: Math.round((r.w - enWin.w) / 2), y: Math.round((r.h - enWin.h) / 2), behind: 'top' });
    wimp.setCaret(enWin, I[6], 0);
  }

  // ------------------------------------------------------------------ menus
  const levelMenu = () => new Menu(M.MElevelT, [
    ...LEVELS.map((l, i) => ({
      text: l.name, ticked: () => opts.level === i, shaded: () => !fits(l.w, l.h), help: M['MHELP1' + i],
      action: () => { opts.level = i; newGame(); openGame(); },
    })),
    { text: 'Custom', ticked: () => opts.level === 5, submenu: customWin, help: M.MHELP15 },
  ]);
  const gameMenu = () => new Menu(M.MEicbarT, [
    { text: 'New game', help: M.MHELP0, action: () => { newGame(); openGame(); } },
    { text: 'Level', submenu: levelMenu, dotted: true, help: M.MHELP1 },
    { text: 'Question marks', ticked: () => opts.qmarks, help: M.MHELP2, action: () => {
      opts.qmarks = !opts.qmarks;
      if (!opts.qmarks) for (let i = 0; i < state.length; i++) if (state[i] === QMARK) state[i] = COVER;
      redraw();
    } },
    { text: 'Sound', ticked: () => opts.sound, help: M.MHELP3, action: () => { opts.sound = !opts.sound; },
      submenu: () => new Menu(M.MEsoundT, [
        { text: 'Quiet', ticked: () => !opts.loud, help: M.MHELP30, action: () => { opts.loud = false; opts.sound = true; } },
        { text: 'Loud', ticked: () => opts.loud, help: M.MHELP31, action: () => { opts.loud = true; opts.sound = true; } },
      ]) },
    { text: 'High scores', help: M.MHELP4, submenu: () => new Menu(M.MEhiscrT, [
      { text: 'Show', help: M.MHELP40, action: showScores },
      { text: 'Reset', help: M.MHELP41, action: () => { scores = LEVELS.map(() => []); saveScores(); if (hsWin?.isOpen) showScores(); } },
    ]) },
  ]);
  const iconMenu = () => new Menu(M.MEicbarT, [
    { text: 'Info', submenu: infoWin, help: M.IHELP0 },
    { text: 'Save choices', help: M.IHELP1, action: saveChoices },
    { text: 'Quit', help: M.IHELP2, action: () => task.quit() },
  ]);

  // ------------------------------------------------------------------ mode changes
  task.onMessage('ModeChange', () => {
    const l = cur();
    if (fits(l.w, l.h)) return;
    let n = Math.min(opts.level, 4);
    while (n > 0 && !fits(LEVELS[n].w, LEVELS[n].h)) n--;
    opts.level = n;
    task.reportError(M.modechg, { title: M.reportt });
    newGame();
  });

  task.addIconbarIcon({
    sprite: 'ic_minehnt',
    help: M.IHELPI,
    onClick: (ev) => { if (ev.button === 'select' || ev.button === 'adjust') openGame(); },
    menu: iconMenu,
  });
  task.onMessage('Quit', () => task.quit());
  task.debugState = () => ({ W, H, mines: [...mine], status });   // used by tests/div/minehunt-act.mjs

  if (!fits(cur().w, cur().h)) opts.level = 0;
  newGame();
}
