// !Meteors - a faithful port of Neil Raine's Meteors module (RISC OS 3.71 Diversions).
// Source: vendor/ro371/Sources/Diversions/Meteors/s/Meteors (ARM assembler) + s/MetShapes.
//
// The game logic follows the original closely: 16.16 fixed-point coordinates in screen pixels
// (y up), GOAL-style object queues (1 ship, 80 rock slots of which 26 move per step, 4 bullets,
// 5 explosion fragments), a game step every 2 centiseconds (null events), EOR-plotted pixel shapes
// with wrap-around inside the arena, bitmap collision detection, the "clever" look-ahead used for
// safe ship re-entry and hyperspace, the same pseudo-random generator and sheet parameters.
// Keys: Z/X rotate, Shift thrust, Return fire, Space hyperspace (and new game), N new sheet,
// Copy (End) pause, Delete resume, Escape toggles full screen. Clicking the window toggles the
// input focus - the game is frozen while Meteors does not have it. There is no icon bar icon,
// no menu and no sound, as in the original.

import { wimp } from '../../core/wimp.js';
import { sprites, loadManifest } from '../../core/sprites.js';
import { loadTemplates } from '../../core/templates.js';
import { os } from '../../core/os.js';
import { fonts } from '../../core/fonts.js';
import { WIMP_COLOURS } from '../../core/palette.js';
import { acc, plot, sizes, hit } from './shapes.js';

const TPL = 'assets/templates/Meteors.json';

// ---------------------------------------------------------------- constants (s.Meteors)
const VB = 16;                       // velbits
const ROIDRATE = 2;                  // centiseconds per game step
const ACCFREQ = 8;
const INIT_MINV = 1 << VB, INIT_MAXV = (4 << VB) - INIT_MINV;
const INIT_MINSPLITV = 0, INIT_MAXSPLITV = (1 << VB) - INIT_MINSPLITV;
const ADD_MINV = 1 << (VB - 4), ADD_MAXV = 4 << (VB - 4);
const ADD_MINSPLITV = 1 << (VB - 4), ADD_MAXSPLITV = (3 << (VB - 4)) - ADD_MINSPLITV;
const NUMROIDS = 80, NUMBULLETS = 4, NUMSHIPEXP = 5;
const Q = { ship: 0, roid: 1, bullet: 2, space: 3, spcbullet: 4, shipexplos: 5 };
const QSIZES = [1, NUMROIDS, NUMBULLETS, 1, 1, NUMSHIPEXP];
const NEWSHEETDELAY = 250, HYPERSPACE_DELAY = 100;
const BULLET_SPEED = 75, BULLET_LIFETIME = 50;
const SHIPREBIRTH = 81, CYCLES_NEWSHIP = 32;
const EXTRAMANEVERY = 10000;
const SCORE_ROIDS = [20, 50, 100];
const EXPLOSDATA = [[-40, -8, 70], [-50, 60, 60], [40, 48, 70], [50, -10, 65], [0, -60, 80]];

const UNUSED = -1;
const T = { ship0: 0, roid0: 32, roid1: 33, roid2: 34, bullet: 35, space0: 36, explos0: 37, explosN: 42, creator: 43, hyperspace: 44, newgame: 45 };
const GAME = { inprogress: 0, finished: 1, restart: 2 };
const STATE = { inwimp: 0, goingfull: 1, full: 2 };

const SCOREHEIGHT = 46;              // pixels (92 OS units: Scores template height)

const monotonic = () => Math.floor(performance.now() / 10);

export default async function start(task) {
  const tpl = await loadTemplates(TPL);
  const spriteArea = await loadManifest('Meteors', 'Sprites');

  // ------------------------------------------------------------------ windows
  const arena = await task.createWindowFromTemplate(tpl, 'Arena', {});
  // the "Game over" icon is removed from the window and plotted by hand (as the original does)
  const goIconSpec = tpl.windows.arena?.icons?.[0];
  for (const ic of arena.icons) ic.setState?.({ deleted: true });
  const full = await task.createWindowFromTemplate(tpl, 'FullArena', {
    colours: { ...tpl.windows.fullarena.colours, titleFg: 255 },
    flags: { noBounds: true },
  });
  const scores = await task.createWindowFromTemplate(tpl, 'Scores', {
    colours: { ...tpl.windows.scores.colours, titleFg: 255 },   // "no border required"
    flags: { pane: true }, spriteArea,
  });
  const scoreIcon = scores.icons[1], sheetIcon = scores.icons[3], shipIcon = scores.icons[4];
  const shipBox = shipIcon ? { x0: shipIcon.bbox?.x0 ?? 301, y0: shipIcon.bbox?.y0 ?? 12, x1: shipIcon.bbox?.x1 ?? 317, y1: shipIcon.bbox?.y1 ?? 32 } : { x0: 301, y0: 12, x1: 317, y1: 32 };
  shipIcon?.setState?.({ deleted: true });
  const livesEl = document.createElement('div');
  livesEl.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  scores.work.appendChild(livesEl);

  // game canvas (covers the visible area of whichever arena window is in use)
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated';
  const g = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  const lg = layer.getContext('2d');
  let img = null, u32 = null, idx = null, touched = [];

  // colour table: Wimp colour n -> RGBA (little-endian ABGR)
  const RGBA = WIMP_COLOURS.map((h) => {
    const n = parseInt(h.slice(1), 16);
    return (0xFF000000 | ((n & 0xFF) << 16) | (n & 0xFF00) | ((n >> 16) & 0xFF)) >>> 0;
  });
  const BG = 7;
  const colour_ship = 9 ^ BG, colour_dead = 11 ^ BG, colour_roids = 15 ^ BG, colour_bullet = colour_dead;

  // ------------------------------------------------------------------ state
  const table = [];
  const qstart = [];
  let n = 0;
  for (let q = 0; q < QSIZES.length; q++) { qstart.push(n); n += QSIZES[q]; }
  qstart.push(n);
  for (let i = 0; i < n; i++) table.push({ type: UNUSED, x: 0, y: 0, vx: 0, vy: 0, lv: 0 });
  const qcurrent = qstart.slice(0, QSIZES.length);

  let seed = (monotonic() | 1) >>> 0;
  let oldtime = monotonic();
  let hascaret = 2, oldfirekey = false, acccounter = ACCFREQ;
  let minv, maxv, minsplitv, maxsplitv;
  let score = 0, nships = 0, nsheet = 0, extramanscore = EXTRAMANEVERY;
  let newsheetwait = 0, newsheetroids = 4;
  let hypertime = 0, wouldhavehit = 0, canhyperspace = 0;
  let windowstate = STATE.inwimp, paused = 0, gameoverflag = GAME.inprogress;
  let wrap = { x0: 0, y0: 0, x1: 1 << VB, y1: 1 << VB, w: 1, h: 1 };
  let dirty = true;

  const cur = () => (windowstate === STATE.inwimp ? arena : full);
  const SH = () => wimp.height;

  // ------------------------------------------------------------------ helpers
  function random(range) {
    const s = seed >>> 0;
    let t = (s ^ (s << 3)) >>> 0;
    t = ((t << 9) >>> 0) >>> 24;
    seed = (t | (s << 8)) >>> 0;
    return range > 0 ? seed % (range >>> 0) : 0;
  }

  /** getwrap: wrap area = visible area of the arena less the scores pane (pixels << VB, y up). */
  function getwrap() {
    const w = cur();
    const x0 = w.x, x1 = w.x + w.w;
    const y0 = SH() - (w.y + w.h), y1 = SH() - w.y - SCOREHEIGHT;
    wrap = { x0: x0 << VB, x1: x1 << VB, y0: y0 << VB, y1: Math.max(y0 + 1, y1) << VB, w: x1 - x0, h: Math.max(1, y1 - y0) };
  }

  function wrapcoords(o) {
    const { x0, x1, y0, y1 } = wrap;
    const W = x1 - x0, H = y1 - y0;
    if (o.x >= x1 || o.x < x0) o.x = x0 + (((o.x - x0) % W) + W) % W;
    if (o.y >= y1 || o.y < y0) o.y = y0 + (((o.y - y0) % H) + H) % H;
  }

  function newshipcoords(o) {
    o.x = (wrap.x0 + wrap.x1) >> 1;
    o.y = (wrap.y0 + wrap.y1) >> 1;
    o.vx = 0; o.vy = 0;
  }

  // ------------------------------------------------------------------ scores pane
  function setscore(v) {
    score = v;
    scoreIcon?.setText(String(score));
    if (score >= extramanscore) {
      extramanscore += EXTRAMANEVERY;
      setships(nships + 1);                        // extra man!
    }
  }
  const addscore = (v) => setscore(score + v);
  function setsheet(v) { nsheet = v; sheetIcon?.setText(String(nsheet)); }
  function setships(v) {
    nships = v;
    livesEl.textContent = '';
    const sw = shipBox.x1 - shipBox.x0;
    const total = sw * Math.max(0, nships);
    let x = shipBox.x0 + sw / 2 - total / 2;
    for (let i = 0; i < nships; i++, x += sw) {
      const im = sprites.img('ship', { area: spriteArea });
      im.style.position = 'absolute';
      im.style.left = Math.floor(x) + 'px';
      im.style.top = (shipBox.y1 - (im._sprite?.cssH ?? 20)) + 'px';
      livesEl.appendChild(im);
    }
  }

  // ------------------------------------------------------------------ game set-up
  function newgame() {
    const s = table[qstart[Q.ship]];
    newshipcoords(s);
    s.type = T.ship0; s.lv = 0;
    for (let i = qstart[Q.ship] + 1; i < table.length; i++) Object.assign(table[i], { type: UNUSED, x: 0, y: 0, vx: 0, vy: 0, lv: 0 });
    extramanscore = EXTRAMANEVERY;
    newsheetroids = 4;
    minsplitv = INIT_MINSPLITV; maxsplitv = INIT_MAXSPLITV;
    minv = INIT_MINV; maxv = INIT_MAXV;
    setships(3 - 1);                                // 2 ships on the top, 1 on screen
    setscore(0);
    nsheet = 0; canhyperspace = 0;
    gameoverflag = GAME.inprogress;
    dirty = true;
  }

  function rndvel() {
    let r = random(maxv) + minv;
    if (r & 1) r = -r;
    return r;
  }

  function newsheet() {
    newsheetwait = 0;
    setsheet(nsheet + 1);
    minsplitv += ADD_MINSPLITV; maxsplitv += ADD_MAXSPLITV;
    minv += ADD_MINV; maxv += ADD_MAXV;
    const count = newsheetroids;
    if (newsheetroids < NUMROIDS / 4) newsheetroids++;
    for (let i = qstart[Q.roid]; i < qstart[Q.roid + 1]; i++) table[i].type = UNUSED;
    const gap = Math.max(4, Math.floor(NUMROIDS / count));
    for (let k = 0; k < count; k++) {
      let x = wrap.x0, y = wrap.y0;
      if (random(2) === 0) x += random(wrap.x1 - wrap.x0);   // bottom edge
      else y += random(wrap.y1 - wrap.y0);                    // left edge
      const vx = rndvel(), vy = rndvel();
      trycreate(qstart[Q.roid], qstart[Q.roid + 1], gap, { type: T.roid0, x, y, vx, vy, lv: 0 });
    }
    dirty = true;
  }

  function trycreate(from, to, gap, props) {
    for (let i = from; i < to; i += gap) {
      if (table[i].type === UNUSED) { Object.assign(table[i], props); return true; }
    }
    return false;
  }
  const create_object = (q, props) => trycreate(qstart[q], qstart[q + 1], 1, props);

  // ------------------------------------------------------------------ game step
  function game_step() {
    move_queue(Q.ship);
    for (let i = 0; i < NUMROIDS / 3 | 0; i++) move_queue(Q.roid);
    for (let i = 0; i < NUMBULLETS; i++) move_queue(Q.bullet);
    for (let i = 0; i < NUMSHIPEXP; i++) move_queue(Q.shipexplos);
    check_newsheet();
    dirty = true;
  }

  function check_newsheet() {
    if (newsheetwait) {
      if (monotonic() - newsheetwait > NEWSHEETDELAY) newsheet();
      return;
    }
    for (let i = qstart[Q.roid]; i < qstart[Q.roid + 1]; i++) if (table[i].type !== UNUSED) return;
    newsheetwait = monotonic() | 1;
  }

  function move_queue(q) {
    const i = qcurrent[q];
    const slot = table[i];
    if (slot.type !== UNUSED) {
      const o = { ...slot };
      move_object(o);
      Object.assign(slot, o);
    }
    qcurrent[q] = i + 1 === qstart[q + 1] ? qstart[q] : i + 1;
  }

  function move_object(o) {
    const t = o.type;
    if (t < 32) mv_ship(o);
    else if (t <= T.roid2) { /* rocks just drift */ }
    else if (t === T.bullet) mv_bullet(o);
    else if (t === T.space0 || t === T.explosN) { /* spaceship: not yet implemented (sic) */ }
    else if (t < T.explosN) { if (--o.lv === 0) o.type = UNUSED; }
    else if (t === T.creator) mv_creator(o);
    else if (t === T.hyperspace) mv_hyperspace(o);
    else if (t === T.newgame) mv_newgame(o);
    o.x += o.vx; o.y += o.vy;
    wrapcoords(o);
  }

  const keyDown = (...codes) => codes.some((c) => os.input.isDown(c));

  function mv_ship(o) {
    // hyperspace
    if (keyDown('Space')) {
      if (!canhyperspace) return;
      hypertime = monotonic();
      o.vx = 0; o.vy = 0;
      wouldhavehit = clevercollision_withrocks(o.x, o.y) ? 1 : 0;
      o.type = T.hyperspace;
      return;
    }
    canhyperspace = 1;
    // turning
    if (keyDown('KeyZ')) o.lv++;
    if (keyDown('KeyX')) o.lv--;
    o.lv &= 63;
    o.type = o.lv >> 1;
    // thrust and resistance
    if (keyDown('ShiftLeft', 'ShiftRight')) { o.vx += acc[o.type][0]; o.vy += acc[o.type][1]; }
    if (--acccounter === 0) {
      acccounter = ACCFREQ;
      o.vx -= o.vx >> 4; o.vy -= o.vy >> 4;
    }
    const r = tryhitroid(o);
    if (r >= 0) {
      killroid(r);
      killship_returncoords(o);
      return;
    }
    // fire (on the key going down)
    const fire = keyDown('Enter', 'NumpadEnter');
    const was = oldfirekey;
    oldfirekey = fire;
    if (fire && !was) {
      const [ax, ay] = acc[o.type];
      create_object(Q.bullet, {
        type: T.bullet, x: o.x + ax * 100, y: o.y + ay * 100,
        vx: o.vx + ax * BULLET_SPEED, vy: o.vy + ay * BULLET_SPEED, lv: BULLET_LIFETIME,
      });
    }
  }

  function mv_hyperspace(o) {
    if (monotonic() - hypertime <= HYPERSPACE_DELAY) return;
    o.type = o.lv >> 1;
    o.x = wrap.x0 + (random((wrap.x1 - wrap.x0) >> VB) << VB);
    o.y = wrap.y0 + (random((wrap.y1 - wrap.y0) >> VB) << VB);
    // The original means 1 in 3 for an unnecessary hyperspace, 1 in 5 otherwise - but the flags
    // tested come from an earlier CMP, so it is always 1 in 5.
    if (random(5) === 0) killship_returncoords(o);
  }

  function killship_returncoords(o) {
    killship();
    Object.assign(o, table[qstart[Q.ship]]);
  }

  function killship() {
    const s = table[qstart[Q.ship]];
    const px = s.x, py = s.y;
    newshipcoords(s);
    s.type = nships <= 0 ? T.newgame : T.creator;
    s.lv = SHIPREBIRTH;
    let type = T.explos0;
    for (const [vx, vy, c] of EXPLOSDATA) {
      create_object(Q.shipexplos, { type, x: px, y: py, vx: vx << (VB - 7), vy: vy << (VB - 7), lv: c });
      type++;
    }
  }

  function mv_newgame(o) {
    if (o.lv !== 0 && --o.lv !== 0) return;
    if (gameoverflag === GAME.inprogress) { gameoverflag = GAME.finished; dirty = true; }
  }

  function mv_creator(o) {
    if (o.lv !== 0 && --o.lv !== 0) return;
    if (!clevercollision_withrocks(o.x, o.y)) {
      o.type = T.ship0; o.lv = 0;
      setships(nships - 1);
    }
  }

  function mv_bullet(o) {
    const r = tryhitroid(o);
    if (r >= 0) { o.type = UNUSED; killroid(r); return; }
    if (--o.lv === 0) o.type = UNUSED;
  }

  function killroid(i) {
    const r = table[i];
    addscore(SCORE_ROIDS[r.type - T.roid0]);
    const nt = r.type + 1;
    if (nt === T.roid2 + 1) { r.type = UNUSED; return; }
    const dx = rndsplit(), dy = rndsplit();
    const { x, y, vx, vy } = r;
    Object.assign(r, { type: nt, vx: vx + dx, vy: vy + dy });
    const c = table[i + (nt === T.roid1 ? 2 : 1)];
    Object.assign(c, { type: nt, x, y, vx: vx - dx, vy: vy - dy, lv: 0 });
  }

  function rndsplit() {
    const r = random(maxsplitv);
    let v = minsplitv + r;
    if (r & 1) v = 1 - v;
    return v;
  }

  function tryhitroid(o) {
    for (let i = qstart[Q.roid]; i < qstart[Q.roid + 1]; i++) if (collision(o, table[i])) return i;
    return -1;
  }

  /** Bounding box then bitmap collision between moving object o (at its next position) and t. */
  function collision(o, t) {
    if (t.type === UNUSED) return false;
    const s1 = sizes[o.type], s2 = sizes[t.type];
    const cx = s1[0] + ((o.x + o.vx) >> VB), cy = s1[1] + ((o.y + o.vy) >> VB);
    const w1 = s1[2], h1 = s1[3];
    let xx0 = s2[0] + (t.x >> VB) - cx, yy0 = s2[1] + (t.y >> VB) - cy;
    const W = wrap.w, H = wrap.h;
    if (xx0 < 0) xx0 += W;
    if (yy0 < 0) yy0 += H;
    let xx1 = xx0 + s2[2];
    if (xx1 > W) { xx0 -= W; xx1 -= W; }
    let yy1 = yy0 + s2[3];
    if (yy1 > H) { yy0 -= H; yy1 -= H; }
    const xco = xx0, yco = yy1;
    if (xx0 < 0) xx0 = 0;
    if (yy0 < 0) yy0 = 0;
    if (xx1 > w1) xx1 = w1;
    if (yy1 > h1) yy1 = h1;
    if (!(xx0 < xx1 && yy0 < yy1)) return false;
    const b1 = hit[o.type], b2 = hit[t.type];
    const k1 = h1 - yy1, k2 = yco - yy1;
    const rows = yy1 - yy0;
    for (let k = 0; k < rows; k++) {
      const a = b1[k1 + k] | 0, b = b2[k2 + k] | 0;
      if (xco >= 0) { if (xco < 32 && (b & (a >>> xco))) return true; }
      else if (-xco < 32 && (a & (b >>> -xco))) return true;
    }
    return false;
  }

  /** NE => a rock will hit a ship at (sx,sy) within 32 rock cycles (line/box look-ahead). */
  function clevercollision_withrocks(sx, sy) {
    for (let i = qstart[Q.roid]; i < qstart[Q.roid + 1]; i++) if (clevercollision(table[i], sx, sy, CYCLES_NEWSHIP)) return true;
    return false;
  }

  function clevercollision(r, sx, sy, cycles) {
    if (r.type === UNUSED) return false;
    const s = sizes[0], rs = sizes[r.type];
    const bx0 = s[0] + (sx >> VB), by0 = s[1] + (sy >> VB);
    const box = { x0: bx0 - (rs[0] + rs[2]), y0: by0 - (rs[1] + rs[3]), x1: bx0 + s[2] - rs[0], y1: by0 + s[3] - rs[1] };
    return islineinbox(box, r.x, r.y, r.x + r.vx * cycles, r.y + r.vy * cycles, 0);
  }

  function islineinbox(b, ax, ay, bx, by, depth) {
    const code = (x, y) => {
      const px = x >> VB, py = y >> VB;
      return { l: b.x0 > px, r: b.x1 < px, d: b.y0 > py, u: b.y1 < py };
    };
    const c1 = code(ax, ay), c2 = code(bx, by);
    const in1 = !c1.l && !c1.r && !c1.d && !c1.u, in2 = !c2.l && !c2.r && !c2.d && !c2.u;
    if (in1 || in2) return true;
    if ((c1.l && c2.l) || (c1.r && c2.r) || (c1.d && c2.d) || (c1.u && c2.u)) return false;
    if (depth > 40) return false;
    const mx = Math.floor((ax + bx) / 2), my = Math.floor((ay + by) / 2);
    return islineinbox(b, mx, my, bx, by, depth + 1) || islineinbox(b, ax, ay, mx, my, depth + 1);
  }

  // ------------------------------------------------------------------ drawing
  function sizeCanvas() {
    const w = cur();
    if (canvas.parentNode !== w.view) w.view.appendChild(canvas);
    if (canvas.width !== w.w || canvas.height !== w.h) {
      canvas.width = layer.width = Math.max(1, w.w);
      canvas.height = layer.height = Math.max(1, w.h);
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
      img = lg.createImageData(layer.width, layer.height);
      u32 = new Uint32Array(img.data.buffer);
      idx = new Uint8Array(layer.width * layer.height);
      touched = [];
      goMask = null;
    }
  }

  function colourOf(t) {
    let c = colour_ship;
    if (t >= T.roid0) c = colour_roids;
    if (t === T.bullet) c = colour_bullet;
    if (t >= T.explos0) c = colour_ship;
    return c;
  }

  function render() {
    const w = cur();
    sizeCanvas();
    const CW = layer.width, CH = layer.height;
    for (const p of touched) { idx[p] = 0; u32[p] = 0; }
    touched = [];
    const wx0 = wrap.x0 >> VB, wy0 = wrap.y0 >> VB, W = wrap.w, H = wrap.h;
    const rowBase = SH() - 1 - w.y;        // canvas row = rowBase - Y
    for (const o of table) {
      if (o.type === UNUSED || o.type >= plot.length) continue;
      const pts = plot[o.type];
      if (!pts.length) continue;
      const c = colourOf(o.type);
      const ox = o.x >> VB, oy = o.y >> VB;
      for (let k = 0; k < pts.length; k += 2) {
        let X = ox + pts[k] - wx0, Y = oy + pts[k + 1] - wy0;
        X = ((X % W) + W) % W + wx0; Y = ((Y % H) + H) % H + wy0;
        const col = X - w.x, row = rowBase - Y;
        if (col < 0 || col >= CW || row < 0 || row >= CH) continue;
        const p = row * CW + col;
        if (idx[p] === 0) touched.push(p);
        idx[p] ^= c;
      }
    }
    for (const p of touched) u32[p] = idx[p] ? RGBA[idx[p] ^ BG] : 0;
    lg.putImageData(img, 0, 0);
    g.fillStyle = WIMP_COLOURS[BG];
    g.fillRect(0, 0, CW, CH);
    if (gameoverflag === GAME.finished) drawGameOver(CW, CH);
    g.drawImage(layer, 0, 0);
    dirty = false;
  }

  let goMask = null;
  function drawGameOver(CW, CH) {
    // "Game over" icon: Trinity.Medium 30pt, colours F79 (yellow on black), centred in the window
    const sp = goIconSpec;
    const iw = sp ? (sp.bbox.x1 - sp.bbox.x0) / 2 : 189, ih = sp ? (sp.bbox.y1 - sp.bbox.y0) / 2 : 48;
    const x = Math.floor(CW / 2 - iw / 2), y = Math.floor(CH / 2 - ih / 2);
    g.save();
    g.font = fonts.cssFor ? fonts.cssFor('Trinity.Medium', 30) : '37px Trinity, serif';
    g.fillStyle = WIMP_COLOURS[9];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Game over', x + iw / 2, y + ih / 2);
    g.restore();
  }

  // ------------------------------------------------------------------ window handling
  function geom(w) { return { ox: w.x - w.scrollX, oy: w.y - w.scrollY }; }
  let lastOrigin = null;

  /** correctcoords: keep objects fixed relative to the work area when the arena moves/scrolls. */
  function correctcoords(prev, now) {
    const dx = (now.ox - prev.ox) << VB, dy = -(now.oy - prev.oy) << VB;
    if (!dx && !dy) return;
    getwrap();
    for (const o of table) {
      if (o.type === UNUSED) continue;
      o.x += dx; o.y += dy;
      wrapcoords(o);
    }
  }

  arena.attachPane(scores, { dx: 0, dy: 0, h: SCOREHEIGHT, fitWidth: true });
  arena.on('moved', () => {
    const now = geom(arena);
    if (lastOrigin && windowstate === STATE.inwimp) correctcoords(lastOrigin, now);
    lastOrigin = now;
    if (windowstate === STATE.inwimp) { getwrap(); dirty = true; }
  });

  function toggleinputfocus() {
    if (wimp.caret?.window === arena) { hascaret = 0; wimp.setCaret(null); }
    else { hascaret = 1; wimp.setCaret(arena); }
  }
  for (const w of [arena, scores]) {
    w.on('click', () => { toggleinputfocus(); return true; });
  }
  arena.on('gaincaret', () => { hascaret = 1; });
  arena.on('losecaret', () => { hascaret = 0; });
  arena.on('close', (ev) => { ev.preventDefault?.(); closedown(); });

  arena.on('key', (ev) => {
    const code = ev.code;
    if (code === 27) { if (windowstate === STATE.inwimp) setfullwindow(); else setwimpwindow(); return true; }
    processkeys(code);
    return code < 0x100;                 // function keys are passed on
  });

  function processkeys(code) {
    if (code === 32) {
      if (gameoverflag === GAME.finished) { gameoverflag = GAME.restart; dirty = true; }
      return;
    }
    if (code === 78 || code === 110) { newsheet(); return; }       // N: new sheet
    if (code === 0x18B) paused = 1;                                 // Copy
    if (code === 127) paused = 0;                                   // Delete
  }

  function setfullwindow() {
    if (windowstate !== STATE.inwimp) return;
    full.open({ x: 0, y: 0, w: wimp.width, h: wimp.height, scrollX: 0, scrollY: 0, behind: 'top' });
    full.el.style.cursor = 'none';                                   // mouse pointer off
    scores._paneParent = full;                                       // the pane follows the full window
    scores.open({ x: full.x, y: full.y, w: full.w, h: SCOREHEIGHT, scrollX: 0, scrollY: 0, behind: 'top' });
    windowstate = STATE.goingfull;
    getwrap();
    dirty = true;
  }

  function setwimpwindow() {
    if (windowstate === STATE.inwimp) return;
    windowstate = STATE.inwimp;
    scores._paneParent = arena;
    full.close();
    arena.open({ behind: 'top' });
    scores.open({ x: arena.x, y: arena.y, w: arena.w, h: SCOREHEIGHT, behind: 'top' });
    lastOrigin = geom(arena);
    getwrap();
    dirty = true;
  }

  function closedown() { task.quit(); }

  task.onMessage('Quit', () => { closedown(); });
  task.onMessage('ModeChange', () => { if (windowstate !== STATE.inwimp) setwimpwindow(); getwrap(); dirty = true; });

  // test hook (tests/div/meteors*.mjs)
  task.meteors = {
    get state() { return { score, nships, nsheet, paused, hascaret, windowstate, gameoverflag, ship: { ...table[0] }, rocks: table.slice(qstart[Q.roid], qstart[Q.roid + 1]).filter((o) => o.type !== UNUSED).length }; },
    killship: () => { const o = { ...table[0] }; killship_returncoords(o); },
  };

  // ------------------------------------------------------------------ start
  arena.open({ behind: 'top' });
  lastOrigin = geom(arena);
  getwrap();
  newgame();
  newsheet();
  render();

  // null events: one game step per 2 centiseconds (no backlog, as Wimp_PollIdle)
  task.animate(() => {
    if (!arena.isOpen && windowstate === STATE.inwimp) return;
    for (let n = 0; n < 2; n++) {
      const now = monotonic();
      if (now < oldtime) break;
      if (windowstate === STATE.goingfull) windowstate = STATE.full;
      if (hascaret === 2) { hascaret = 1; wimp.setCaret(arena); }
      oldtime = Math.max(oldtime + ROIDRATE, now);
      getwrap();
      if (hascaret && paused !== 1) game_step();
      if (gameoverflag === GAME.restart) { newgame(); newsheet(); }
    }
    if (dirty) render();
  });
}
