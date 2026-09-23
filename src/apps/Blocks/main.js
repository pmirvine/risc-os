// !Blocks - the falling-blocks game (Diversions). Port of Sources/Diversions/Blocks/bas/!RunImage.
//
// Faithful to the original's rules:
//  * 11 x 31 board of 28 OS-unit squares; pieces are 4x4 bit masks (bit A -> x = A AND 3, y = A >> 2,
//    y upwards). The seven shapes (DATA 240,1136,1856,1584,864,1632,624) use tiles 1-7, start at X=4,
//    Y=26 and are rotated RND(4) times; 1 in 200 pieces is random junk (RND AND RND AND 65535), 1 in 30 a
//    random 3x3 blob (RND AND 1911).
//  * The drop interval is 30*EXP(-score/500) centiseconds; the drop key divides it by 3 and makes the
//    piece fall on every null event. The score counts pieces landed; the high score is kept for the
//    session. Full rows are removed. The game pauses while the window hasn't got the input focus.
//  * Keys (changeable with "New keys"): 2 turn, Space drop, 1 left, 3 right.
//  * "Auto" plays by itself using the original's position evaluation (PROCsuss_*).
// The board and the score lines ("Score", "High score" in the system font, @%=5 number format) are drawn
// exactly as PROCpat does, from the game's own tile sprites.

import { Menu } from '../../core/menu.js';
import { loadMessages } from '../../core/messages.js';
import { loadManifest } from '../../core/sprites.js';
import { os } from '../../core/os.js';

const G = 28;                              // size of a square in OS units
const R_TAB = [3, 7, 11, 15, 2, 6, 10, 14, 1, 5, 9, 13, 0, 4, 8, 12];
const B_TAB = [0, 240, 1136, 1856, 1584, 864, 1632, 624];
const W_PX = 11 * G / 2, H_PX = 928 / 2;   // work area 308 x 928 OS units

const RND = (n) => (n == null ? (Math.random() * 0x100000000) | 0 : 1 + Math.floor(Math.random() * n));
const TIME = () => Math.floor(performance.now() / 10);

let sysfont = null;
async function loadSysFont() {
  if (!sysfont) sysfont = fetch('assets/fonts/system8x8.json').then((r) => r.json()).then((j) => j.chars).catch(() => null);
  return sysfont;
}

export default async function start(task, ctx) {
  const M = await loadMessages('Blocks');
  const wimp = os.wimp;
  const appname = M.lookup('Name');
  const [spr, chars] = await Promise.all([loadManifest('Blocks', 'Sprites'), loadSysFont()]);
  const tiles = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => spr.get('tile' + i)?.canvas()));

  // ---------------------------------------------------------------- state (names as in the BASIC)
  const Q = Array.from({ length: 11 }, () => new Array(31).fill(0));
  const height = new Array(11).fill(0);
  let P = 0, X = 0, Y = 0, Qc = 0, S = 0, H = 0, I = 30, T = 0, F = 1;
  let STOPPED = 1, WASSTOPPED = 0, open = false, auto = false, over = false;
  let sussing = 0;
  const key = [0x32, 0x20, 0x31, 0x33];     // turn, drop, left, right
  const newkey = [...key];

  // ---------------------------------------------------------------- windows
  const pat = await task.createWindowFromTemplate('assets/templates/Blocks.json', 'main');
  pat.setExtent({ w: W_PX, h: H_PX });
  const keysWin = await task.createWindowFromTemplate('assets/templates/Blocks.json', 'keys', { spriteArea: spr });

  pat.useCanvas((g) => {                     // PROCpat
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W_PX, H_PX);
    text(g, 4, 31 * G + 48, `${M.lookup('Score')} ${String(S).padStart(5)}`);
    text(g, 4, 31 * G + 8, `${M.lookup('High')} ${String(H).padStart(5)}`);
    for (let x = 0; x <= 10; x++) for (let y = 0; y <= 30; y++) {
      const c = Q[x][y];
      if (c && tiles[c & 7]) g.drawImage(tiles[c & 7], x * G / 2, H_PX - (y + 1) * G / 2, G / 2, G / 2);
    }
  });
  // VDU 5 text in the system font (8x8 pixels, colour 7), graphics cursor = top-left, OS units y up
  function text(g, osx, osy, s) {
    g.fillStyle = '#000000';
    const x0 = osx / 2, y0 = H_PX - osy / 2;
    for (let i = 0; i < s.length; i++) {
      const rows = chars?.[s.charCodeAt(i) & 255];
      if (!rows) continue;
      for (let r = 0; r < 8; r++) for (let b = 0; b < 8; b++) if (rows[r] & (0x80 >> b)) g.fillRect(x0 + i * 8 + b, y0 + r, 1, 1);
    }
  }
  const redraw = () => pat.invalidate();

  pat.on('close', (ev) => { ev.preventDefault(); open = false; pat.close(); });
  // Lose_Caret / Gain_Caret: the game pauses while the window hasn't got the input focus
  let paused = false;
  pat.on('losecaret', () => { if (paused) return; paused = true; T -= TIME(); WASSTOPPED = STOPPED; STOPPED = 1; });
  pat.on('gaincaret', () => { if (!paused) return; paused = false; if (STOPPED) { T += TIME(); STOPPED = WASSTOPPED; } });
  pat.on('click', (ev) => {
    if (ev.button === 'menu') { openMenu(ev, false); return true; }
    if (ev.button === 'select' && wimp.caret?.window !== pat) wimp.setCaret(pat);   // work area type 15
    return true;
  });
  pat.on('key', (ev) => keyPressed(ev.code));

  // ---------------------------------------------------------------- pieces (PROCP, FNF, FNR, PROCL)
  function PROCP(p) {
    for (let A = 0; A <= 19; A++) if (p & (1 << A)) { const b = X + (A & 3), c = Y + (A >> 2); if (b >= 0 && b <= 10 && c >= 0 && c <= 30) Q[b][c] ^= Qc; }
    redraw();
  }
  function FNF(p, x, y) {
    for (let A = 0; A <= 15; A++) if (p & (1 << A)) {
      const b = x + (A & 3), c = y + (A >> 2);
      if (b < 0 || b > 10 || c < 0) return 0;
      if (c > 30 || Q[b][c]) return 0;
    }
    return 1;
  }
  function norm(r) {
    if (!r) return 0;
    while ((r & 0xF) === 0) r >>= 4;
    while ((r & 0x1111) === 0) r >>= 1;
    return r;
  }
  function FNR(p) {
    let r = 0;
    for (let A = 0; A <= 15; A++) if (p & (1 << A)) r += 1 << R_TAB[A];
    return norm(r);
  }
  function PROCL(y) {
    for (let x = 0; x <= 10; x++) if (!Q[x][y]) return;
    for (; y < 30; y++) for (let x = 0; x <= 10; x++) Q[x][y] = Q[x][y + 1];
    for (let x = 0; x <= 10; x++) {
      let yy = height[x];
      while (yy > 0 && Q[x][yy] === 0) yy--;
      if (Q[x][yy]) yy++;
      height[x] = yy;
    }
    redraw();
  }

  function startGame() {                     // PROCstart
    if (S > H) H = S;
    S = 0; paused = false;
    for (const col of Q) col.fill(0);
    T = TIME(); STOPPED = 0; over = false;
    height.fill(0);
    sussing = 0;
    if (piece()) redraw();
  }
  function piece() {                         // FNpiece
    do {
      Qc = RND(7); P = B_TAB[Qc];
      for (let A = 1, n = RND(4); A <= n; A++) P = FNR(P);
      if (RND(200) === 1) P = RND() & RND() & 65535;
      if (RND(30) === 1) P = RND() & 1911;
    } while (!P);
    P = norm(P);
    I = 30 * Math.exp(-S / 500); F = 1; X = 4; Y = 26;
    if (FNF(P, X, Y)) { PROCP(P); return 1; }
    return 0;
  }
  function drop() {                          // FNdrop: 1 when the piece has landed
    if (TIME() < T && F) return 0;
    if (FNF(P & ~(P << 4), X, Y - 1)) { Y -= 1; PROCP(P ^ (P << 4)); T += I; return 0; }
    sussGrommets();
    S += 1;
    for (let A = 29; A >= 0; A--) PROCL(A);
    sussing = 0;
    return 1;
  }
  function bgEvent() {                       // PROCbg_event
    if (!open || STOPPED) return;
    if (auto) automove();
    if (drop()) { redraw(); if (!piece()) { STOPPED = 1; over = true; } }
  }

  function keyPressed(k) {                   // PROCkey_pressed (pat%)
    if (over || STOPPED) return [key[0], key[1], key[2], key[3]].includes(k);
    let R;
    switch (k) {
      case key[1]: I = I / 3; F = 0; return true;
      case key[3]:
        R = (P & 0xEEEE) >> 1;
        if (FNF(P & ~R, X + 1, Y)) { PROCP(P & 0x1111); X += 1; PROCP(P ^ R); }
        return true;
      case key[2]:
        R = (P & 0x7777) << 1;
        if (FNF(P & ~R, X - 1, Y)) { PROCP(P & 0x8888); X -= 1; PROCP(P ^ R); }
        return true;
      case key[0]:
        R = FNR(P);
        if (FNF(R & ~P, X, Y)) { PROCP(P ^ R); P = R; }
        return true;
      default: return false;                 // Wimp_ProcessKey
    }
  }

  // ---------------------------------------------------------------- automatic play
  let oldtime = TIME(), idealP = 0, idealX = 5, bestvalue = 0, firstP = 0, currentP = 0, currentX = 0;
  let shapeX0 = 0, shapeX1 = 3;
  const h = [0, 0, 0, 0], toph = [0, 0, 0, 0];
  function automove() {
    for (let i = 1; i <= 2; i++) if (sussing >= 0) sussPiece();
    if (sussing >= 0) return;
    if (TIME() - oldtime > 10) oldtime = TIME(); else return;
    if (wimp.caret?.window !== pat) return;
    if (idealP !== P) keyPressed(key[0]);
    else if (idealX < X) keyPressed(key[2]);
    else if (idealX > X) keyPressed(key[3]);
    else if (sussing !== -2) { sussing = -2; keyPressed(key[1]); }
  }
  function sussPiece() {
    if (sussing === 0) {
      firstP = P; idealP = P; idealX = 5; bestvalue = -1e8; currentP = P;
      sussRot(currentP);
    }
    if (currentX + shapeX1 > 10) {
      currentP = FNR(currentP);
      if (currentP === firstP) { sussing = -1; return; }
      sussRot(currentP);
    }
    sussMove(currentP, currentX);
    currentX += 1;
    sussing = 1;
  }
  function sussMove(p, x) {
    let value = 0, Hh = -1e8, K;
    for (let i = shapeX0; i <= shapeX1; i++) { K = height[x + i] - h[i]; if (K > Hh) Hh = K; }
    value -= Hh * 100;
    for (let i = shapeX0; i <= shapeX1; i++) { K = Hh - height[x + i] + h[i]; if (K > 2) K = 2; value -= K * 400; }
    const temph = [...height];
    let Tt = -1e8;
    for (let i = shapeX0; i <= shapeX1; i++) {
      if (toph[i]) temph[x + i] = Hh + toph[i];
      if (temph[x + i] > Tt) Tt = temph[x + i];
    }
    value -= Tt * 50;
    for (let i = 0; i <= 9; i++) value -= 25 * Math.abs(temph[i] - temph[i + 1]);
    K = temph[1] - temph[0]; if (K > 0) value -= 25 * K;
    K = temph[9] - temph[10]; if (K > 0) value -= 25 * K;
    value -= RND(10);
    if (value > bestvalue) { bestvalue = value; idealP = p; idealX = x; }
  }
  function sussRot(p) {
    currentP = p;
    let m = 0x1111; shapeX0 = 0; while ((p & m) === 0 && shapeX0 < 4) { shapeX0++; m <<= 1; }
    m = 0x8888; shapeX1 = 3; while ((p & m) === 0 && shapeX1 > 0) { shapeX1--; m >>= 1; }
    currentX = -shapeX0;
    for (let i = 0; i <= 3; i++) {
      m = 1 << i; h[i] = 0;
      for (let j = 0; j <= 3; j++) { if (p & m) break; h[i]++; m <<= 4; }
    }
    for (let i = 3; i >= 0; i--) {
      m = 1 << (i + 12); toph[i] = 4;
      for (let j = 0; j <= 3; j++) { if (p & m) break; toph[i]--; m >>= 4; }
    }
  }
  function sussGrommets() {
    sussRot(P);
    for (let i = shapeX0; i <= shapeX1; i++) if (toph[i]) height[X + i] = Y + toph[i];
  }

  // null events: Wimp_Poll returns as often as the machine allows; a few per frame
  task.animate(() => { for (let n = 0; n < 4; n++) bgEvent(); });

  // ---------------------------------------------------------------- keys dialogue
  function keyName(k) {                      // FNkeyname
    if (k === 13) return M.lookup('Return');
    if (k === 32) return M.lookup('Space');
    if (k === 0x7F) return M.lookup('Delete');
    const f = k & 0xF;
    if ((k >= 0x180 && k <= 0x189) || (k >= 0x1CA && k <= 0x1CC)) return 'F' + f;
    if ((k >= 0x190 && k <= 0x199) || (k >= 0x1DA && k <= 0x1DC)) return 'S-F' + f;
    if ((k >= 0x1A0 && k <= 0x1A9) || (k >= 0x1EA && k <= 0x1EC)) return 'C-F' + f;
    if ((k >= 0x1B0 && k <= 0x1B9) || (k >= 0x1FA && k <= 0x1FC)) return 'C-S-F' + f;
    if (k < 32) return 'Ctrl-' + String.fromCharCode(k + 0x40);
    return String.fromCharCode(k & 0xFF);
  }
  function setNewKeys() {
    for (let i = 0; i < 4; i++) { newkey[i] = key[i]; keysWin.icons[i].setText(keyName(key[i])); }
  }
  keysWin.on('key', (ev) => {
    const ic = ev.icon ? keysWin.icons.indexOf(ev.icon) : -1;
    if (ic < 0 || ic > 3) return false;
    newkey[ic] = ev.code;
    ev.icon.setText(keyName(ev.code));
    wimp.setCaret(keysWin, ev.icon, ev.icon.text.length);
    return true;
  });
  keysWin.on('click', (ev) => {
    if (ev.button !== 'select' && ev.button !== 'adjust') return;
    if (ev.iconIndex === 4) {                // OK: PROCusenewkeys
      for (let i = 0; i <= 2; i++) for (let j = i + 1; j <= 3; j++) {
        if (newkey[i] === newkey[j]) { task.reportError(M.lookup('E02')); return true; }
      }
      for (let i = 0; i < 4; i++) key[i] = newkey[i];
      wimp.menus.close();
      return true;
    }
    if (ev.iconIndex === 5) { wimp.menus.close(); return true; }
  });
  keysWin.on('menuopen', () => { wimp.setCaret(keysWin, keysWin.icons[0], -1); });

  // ---------------------------------------------------------------- menu
  const [mNew, mKeys, mAuto, mQuit] = M.lookup('Menu').split(',').map((s) => s.replace(/>.*$/, ''));
  const menu = () => {
    setNewKeys();
    return new Menu(appname, [
      { text: mNew, action: () => startGame() },
      { text: mKeys, submenu: keysWin },
      { text: mAuto, ticked: () => auto, action: () => { auto = !auto; sussing = 0; } },
      { text: mQuit, action: () => task.quit() },
    ]);
  };
  function openMenu(ev, iconbar) {
    if (iconbar) wimp.menus.openIconbar(menu(), ev.sx, { task });
    else wimp.menus.openAt(menu(), ev, { task });
  }

  // ---------------------------------------------------------------- icon bar
  task.addIconbarIcon({
    sprite: '-blocks', area: spr,
    menu,
    onClick: (ev) => {
      if (ev.button !== 'select') return;
      if (open) pat.open({ behind: 'top' });
      else { pat.open({ behind: 'top' }); open = true; startGame(); }
      wimp.setCaret(pat);                    // invisible caret in the game window
    },
  });
  task.onMessage('Quit', () => task.quit());
}
