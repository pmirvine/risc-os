// !Hopper - the game itself: a port of Simon Foster's C sources (hopper.c, frog.c, cars.c, water.c,
// scenery.c, snake.c, score.c, timer.c, sync.c and the drawing side of graphics.c; 1994-96, BSD licence,
// published by RISC OS Open in Apps/Diversions/Hopper).
//
// The original takes the whole screen in MODE 13 (320 x 256, 256 colours) and draws straight into screen
// memory: it keeps each object's graphics pre-shifted by 0-3 pixels so that it can copy whole words, saves
// the background under the frog and the snake and puts it back, and uses a second 320 x 256 sprite as a back
// buffer for the title / attract screens, which the PsychoEffect module fades in and out row by row. This port
// keeps that model: `screen` and `second` are 8-bit buffers in the default 256-colour palette, the graphics
// come from the app's sprite file (<Hopper$Dir>.Sprites, the pre-shifted frames as sprites <name>_<1-4>) laid
// out again as the data files were, and the drawing code works in the same word addresses. Text is painted in
// Trinity.Bold.Italic (45 x 19 point, anti-aliased against black, like ColourTrans + Font_Paint) and matched to
// the palette. The blocking loops of the C code are async loops that wait for the next frame ("VSync").
//
// Timing is the original's: the clock is OS_ReadMonotonicTime x 8 (800 ticks a second); objects move one
// pixel every `speed` ticks, the frog's hop takes four 2.5 cs steps, the time bar counts 400 x 5 cs.

import { VIDC256 } from './palette.js';

export const W = 320, H = 256;
const BLACK = 0, RED = 1, GREEN = 2, YELLOW = 3, BLUE = 4, MAGENTA = 5, CYAN = 6, WHITE = 7;   // eslint-disable-line no-unused-vars
const TO = 0, FROM = 1;
const B_L = 0, B_T = 45, B_R = 319, B_B = 222;           // hopper.h: the attract screen border
const N_L = 40, N_T = 150, N_R = 280, N_B = 190;         // hopper.c: the name entry box
const MINIMUM_SPEED = 4;
const FROG_PITCH = 15;
// qtm.h sample numbers
export const Q = { JUMP: 0, ALARM: 1, FROG: 2, SPLASH: 3, CLEAR: 4, BURP: 5, SPLAT: 6, BANK: 7, EATEN: 8 };
export const SONG = { NONE: 0, INTRO: 1, INGAME: 2, HISCORE: 3 };
// keys.h: fixed control keys (internal key number + 128)
export const KEY = { PAUSE: 247, CONTINUE: 158, ABORT: 240, SOUND_ON: 241, SOUND_OFF: 242, MUSIC_ON: 244, MUSIC_OFF: 245 };

// graphics.c: user defined characters 128-131 (a frog for the lives, the level dots)
const DEFINED = [[24, 27, 67, 63, 15, 63, 51, 248], [48, 176, 132, 248, 224, 248, 152, 62], [112, 248, 248, 248, 112, 0, 0, 0], [0, 112, 112, 112, 0, 0, 0, 0]];

class Abort extends Error {}

// ---------------------------------------------------------------------------- palette helpers
const RGB = VIDC256;
const nearestCache = new Map();
/** ColourTrans: the nearest colour of the default 256-colour palette. */
export function nearest(r, g, b) {
  const k = (r << 16) | (g << 8) | b;
  let v = nearestCache.get(k);
  if (v != null) return v;
  let best = 0, bd = Infinity;
  for (let i = 0; i < 256; i++) {
    const [R, G, B] = RGB[i];
    const d = 2 * (R - r) ** 2 + 4 * (G - g) ** 2 + (B - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  nearestCache.set(k, best);
  return best;
}
// PsychoEffect_Fade: each pixel's colour scaled by fade/60 and matched to the palette
const FADE = Array.from({ length: 61 }, (_, f) => Uint8Array.from({ length: 256 }, (_, i) => {
  const [r, g, b] = RGB[i];
  return f === 60 ? i : nearest(Math.round(r * f / 60), Math.round(g * f / 60), Math.round(b * f / 60));
}));
/** gfx_set_colour / gfx_write_string colour: col bits RGB = &FF, other components bright*&11. */
function colourOf(col, bright) {
  const bgt = (bright * 0x10 + bright) & 0xff;
  return [col & RED ? 0xff : bgt, col & GREEN ? 0xff : bgt, col & BLUE ? 0xff : bgt];
}
/** GCOL colour c (0-63) + tint 0 in a 256-colour mode -> pixel byte (VDU 17 / VDU 18). */
const gcolByte = (c) => ((c & 1) << 2) | ((c & 2) << 3) | ((c & 4) << 3) | ((c & 8) << 3) | ((c & 16) >> 1) | ((c & 32) << 2);

// ---------------------------------------------------------------------------- the game
export class Hopper {
  /**
   * env: { gfx: {frog, fly, snake, vehicles, waters, scenery, numbers, title} (Uint8Array data files),
   *        cars, water (Int32Array level tables), msg(token), keyName(k), keys (prefs object, live),
   *        hi: [{name, score}] x 11, qtm: {sample(n, note, vol, pos), start(song), stop(), volume(v)},
   *        canvas, isDown(internalKey), readKey() -> {code, char} | null, flushKeys(), alive() }
   */
  constructor(env) {
    this.env = env;
    this.g = env.gfx;
    this.screen = new Uint8Array(W * H);
    this.second = new Uint8Array(W * H);
    this.out = this.screen;               // VDU / font output (gfx_to_sprite / gfx_to_screen)
    this.ctx = env.canvas.getContext('2d');
    this.img = this.ctx.createImageData(W, H);
    this.seed = 0;
    this.tickcount = 0;
    this.gcol = 0;                        // graphics foreground (pixel byte)
    this.textFg = gcolByte(7);            // text colours for VDU 4 characters
    this.vdu5 = false;
    this.lists = null;
    this.frogStore = new Uint8Array(480); this.snakeStore = new Uint8Array(384);
    this.frogOld = 0; this.snakeOld = -1; this.snakeFrom = 0; this.snakeTo = 0;
    this.state = {};
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = 400; this.textCanvas.height = 40;
    this.tctx = this.textCanvas.getContext('2d', { willReadFrequently: true });
    this.frames = 0;
  }

  // ------------------------------------------------------------------ sync.c
  readTimer() { this.tickcount = Math.floor(performance.now() / 10) << 3; }
  setTimer() { return this.tickcount; }
  passed(t) { return this.tickcount - t; }
  /** sync_elapsed: returns [elapsed units, new timer]. */
  elapsed(t, e) { const el = Math.floor((this.tickcount - t.v) / e); t.v += el * e; return el; }
  random(l, h) { this.seed = ((this.seed * 75) + 1) % 65537; return (this.seed % ((h - l) + 1)) + l; }
  async wait(t) { const timer = this.setTimer(); do { await this.frame(); this.readTimer(); } while (this.passed(timer) < t); }

  // ------------------------------------------------------------------ display
  present() {
    const d = this.img.data, s = this.screen;
    for (let i = 0, j = 0; i < s.length; i++, j += 4) { const c = RGB[s[i]]; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255; }
    this.ctx.putImageData(this.img, 0, 0);
  }
  /** Show the screen and wait for the next frame (OS_Byte 19). Throws Abort if the task has gone. */
  async frame() {
    this.present();
    this.frames++;
    await new Promise((r) => (this.env.nextFrame ? this.env.nextFrame(r) : requestAnimationFrame(() => r())));
    if (!this.env.alive()) throw new Abort();
  }
  scan(k) { return this.env.isDown(k - 128); }      // OS_Byte 121 (key number EOR &80)
  inkey() { return this.env.readKey(); }             // OS_Byte 129,0,0: next key in the buffer
  flush() { this.env.flushKeys(); }                  // OS_Byte 15,1

  // ------------------------------------------------------------------ graphics.c: plot lists
  initList() { this.lists = { water: [], store: [], mask: [], cars: [], plot: [] }; }
  // entries: [srcArray, srcOff, dstArray, dstOff, words, rows(height+1), srcStride, maskArray, maskOff]
  addPlot(which, src, so, dst, doff, words, height, width) { if (words > 0) this.lists[which].push([src, so, dst, doff, words, height + 1, width]); }
  addMask(src, so, msk, mo, dst, doff, words, height, width) { if (words > 0) this.lists.mask.push([src, so, dst, doff, words, height + 1, width, msk, mo]); }
  plotSprites(list) {
    for (const [src, so, dst, doff, words, rows, stride] of list) {
      const n = words * 4;
      for (let r = 0; r < rows; r++) {
        const s = so + r * stride, d = doff + r * W;
        for (let i = 0; i < n; i++) { const a = d + i; if (a >= 0 && a < dst.length) dst[a] = src[s + i]; }
      }
    }
  }
  storeSprites(list) {         // copy screen -> store buffer
    for (const [buf, bo, scr, soff, words, rows, stride] of list) {
      const n = words * 4;
      for (let r = 0; r < rows; r++) {
        const b = bo + r * stride, s = soff + r * W;
        for (let i = 0; i < n; i++) { const a = s + i; buf[b + i] = a >= 0 && a < scr.length ? scr[a] : 0; }
      }
    }
  }
  maskSprites(list) {
    for (const [src, so, dst, doff, words, rows, stride, msk, mo] of list) {
      const n = words * 4;
      for (let r = 0; r < rows; r++) {
        const s = so + r * stride, m = mo + r * stride, d = doff + r * W;
        for (let i = 0; i < n; i++) { const a = d + i; if (a >= 0 && a < dst.length) dst[a] = (dst[a] & msk[m + i]) | src[s + i]; }
      }
    }
  }
  plotList(order) {
    const L = this.lists;
    if (order === 0) { this.plotSprites(L.water); this.storeSprites(L.store); this.maskSprites(L.mask); this.plotSprites(L.cars); this.plotSprites(L.plot); }
    else { this.plotSprites(L.water); this.plotSprites(L.cars); this.storeSprites(L.store); this.maskSprites(L.mask); this.plotSprites(L.plot); }
  }
  // screen word address (screen = screen base - 40 words) -> byte offset
  static addr(nx, y) { return (nx >> 2) * 4 - 160 + y * W; }

  showVehicle(st) {
    const nx = st.x + 158;
    if (nx > 120 && nx < 480) {
      const from = nx < 160 ? 40 - (nx >> 2) : 0;
      let to = nx > 440 ? (483 - nx) >> 2 : 10;
      to = to - from;
      this.addPlot('cars', this.g.vehicles, ((st.spr * 4) + (nx % 4)) * 800 + from * 4, this.screen, Hopper.addr(nx, st.y) + from * 4, to, 18, 40);
    }
  }
  showWater(st) {
    const nx = st.x + 158;
    if (nx > 72 && nx < 480) {
      const from = nx < 160 ? 40 - (nx >> 2) : 0;
      let to = nx > 392 ? (483 - nx) >> 2 : 22;
      to = to - from;
      this.addPlot('water', this.g.waters, ((st.spr * 4) + (nx % 4)) * 1760 + from * 4, this.screen, Hopper.addr(nx, st.y) + from * 4, to, 19, 88);
    }
  }
  showScenery(x, y, spr) {
    const nx = x + 160;
    this.addPlot('plot', this.g.scenery, spr * 960, this.screen, Hopper.addr(nx, y), 10, 23, 40);
  }
  showFrog(st) {
    const nx = st.x + 160;
    const so = st.spr * 3840 + (nx % 4) * 960;
    const scr = Hopper.addr(nx, st.y);
    this.frogOld = scr;
    this.addPlot('store', this.frogStore, 0, this.screen, scr, 6, 19, 24);
    this.addMask(this.g.frog, so, this.g.frog, so + 480, this.screen, scr, 6, 19, 24);
  }
  deleteFrog() { this.addPlot('water', this.frogStore, 0, this.screen, this.frogOld, 6, 19, 24); }
  showFly(x) {
    const nx = x + 158;
    if (nx > 140 && nx < 480) {
      const so = (nx % 4) * 800 + 60, mo = so + 400;
      const scr = Hopper.addr(nx, 88);
      const from = nx < 160 ? 40 - (nx >> 2) : 0;
      const to = nx > 460 ? (483 - nx) >> 2 : 5;
      this.addMask(this.g.fly, so + from * 4, this.g.fly, mo + from * 4, this.screen, scr + from * 4, to - from, 12, 20);
    }
  }
  showSnake(x) {
    const nx = x + 158;
    this.snakeOld = -1;
    if (nx > 128 && nx < 480) {
      const so = (nx % 4) * 768, mo = so + 384;
      const scr = Hopper.addr(nx, 126);
      this.snakeOld = scr;
      const from = nx < 160 ? 40 - (nx >> 2) : 0;
      const to = nx > 448 ? (483 - nx) >> 2 : 8;
      this.addPlot('store', this.snakeStore, from * 4, this.screen, scr + from * 4, to - from, 11, 32);
      this.addMask(this.g.snake, so + from * 4, this.g.snake, mo + from * 4, this.screen, scr + from * 4, to - from, 11, 32);
      this.snakeFrom = from; this.snakeTo = to;
    }
  }
  deleteSnake() {
    if (this.snakeOld !== -1) this.addPlot('water', this.snakeStore, this.snakeFrom * 4, this.screen, this.snakeOld + this.snakeFrom * 4, this.snakeTo - this.snakeFrom, 11, 32);
  }
  showNumber(x, y, spr) { this.addPlot('plot', this.g.numbers, spr * 160, this.screen, Hopper.addr(x + 160, y), 4, 9, 16); }

  // ------------------------------------------------------------------ VDU, lines, fonts
  cls() { this.out.fill(0); }                                           // VDU 12
  setColour(col, bright) { this.gcol = nearest(...colourOf(col, bright)); }   // ColourTrans_SetGCOL
  drawLine(x0, y0, x1, y1) {                                            // PLOT 4 / PLOT 5 (lines are straight here)
    const o = this.out;
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    for (;;) {
      if (x >= 0 && x < W && y >= 0 && y < H) o[y * W + x] = this.gcol;
      if (x === x1 && y === y1) break;
      if (x !== x1) x += dx; if (y !== y1) y += dy;
    }
  }
  /** VDU 4 character at text column/row (8x8 cells, text foreground on background 0). */
  textChar(col, row, ch) {
    const rows = ch >= 128 && ch <= 131 ? DEFINED[ch - 128] : null;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const on = rows ? (rows[y] >> (7 - x)) & 1 : 0;
      const a = (row * 8 + y) * W + col * 8 + x;
      if (a >= 0 && a < this.out.length) this.out[a] = on ? this.textFg : 0;
    }
  }
  /** VDU 5 character at graphics position (pixels, top-left), foreground only. */
  gfxChar(px, py, ch) {
    const rows = DEFINED[ch - 128];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if ((rows[y] >> (7 - x)) & 1) { const X = px + x, Y = py + y; if (X >= 0 && X < W && Y >= 0 && Y < H) this.out[Y * W + X] = this.gcol; }
    }
  }
  fontSetup(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = 'italic 700 11.875px Trinity, "Times New Roman", serif';
    ctx.textBaseline = 'alphabetic';
  }
  /** gfx_string_width: in OS units (4 per pixel). */
  stringWidth(s) {
    this.fontSetup(this.tctx);
    return Math.round(this.tctx.measureText(s).width * (45 / 19) * 4);
  }
  /** Font_Paint of a string at pixel x, baseline y + 8, colour (col, bright), blended against black. */
  writeString(s, x, y, col, bright) {
    const [r, g, b] = colourOf(col, bright);
    const c = this.tctx, tw = this.textCanvas.width, th = this.textCanvas.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, tw, th);
    this.fontSetup(c);
    c.setTransform(45 / 19, 0, 0, 1, 8, 28);
    c.fillStyle = '#fff';
    c.fillText(s, 0, 0);
    const d = c.getImageData(0, 0, tw, th).data;
    const X0 = x - 8, Y0 = y + 8 - 28;
    for (let j = 0; j < th; j++) {
      const Y = Y0 + j;
      if (Y < 0 || Y >= H) continue;
      for (let i = 0; i < tw; i++) {
        const X = X0 + i;
        if (X < 0 || X >= W) continue;
        const a = d[(j * tw + i) * 4 + 3];
        if (a < 12) continue;
        const lv = Math.round(a / 255 * 15) / 15;          // 16 anti-alias levels
        this.out[Y * W + X] = nearest(Math.round(r * lv), Math.round(g * lv), Math.round(b * lv));
      }
    }
  }
  stringRight(s, x, y, col, bright) { this.writeString(s, Math.round(((x << 2) - this.stringWidth(s)) / 4), y, col, bright); }
  stringCentre(s, x, y, col, bright) { this.writeString(s, Math.round(((x << 2) - this.stringWidth(s) / 2) / 4), y, col, bright); }
  toSprite() { this.out = this.second; }
  toScreen() { this.out = this.screen; }

  /** PsychoEffect_Fade between the two buffers for rows [row, row+n). */
  psycho(fromBuf, toBuf, row, n, fade) {
    const lut = FADE[Math.max(0, Math.min(60, fade))];
    const a = row * W, b = Math.min(H, row + n) * W;
    for (let i = a; i < b; i++) toBuf[i] = lut[fromBuf[i]];
  }
  fade(startRow, height, fade, dir) {
    if (dir === TO) this.psycho(this.second, this.screen, startRow, height, fade);
    else this.psycho(this.screen, this.second, startRow, height, fade);
  }
  async fadeScreen(withMusic) {
    this.psycho(this.screen, this.second, 0, H, 60);
    let loop = 59, volume = this.env.keys.musicVol;
    this.readTimer();
    const timer = { v: this.setTimer() };
    while (loop > 0) {
      this.psycho(this.second, this.screen, 0, H, loop);
      if (withMusic) this.env.qtm.volume(volume);
      await this.frame();
      this.readTimer();
      const speed = this.elapsed(timer, 12);
      loop = loop > speed ? loop - speed : 0;
      volume = volume > 0 ? volume - 1 : 0;
    }
    this.psycho(this.second, this.screen, 0, H, 0);
    if (withMusic) this.env.qtm.stop();
  }
  fadeScreenAndQtm() { return this.fadeScreen(true); }

  async displayTitle() {
    this.second.fill(0, 0, 18560 * 4);
    this.initList();
    this.addPlot('plot', this.g.title, 0, this.second, 36, 61, 41, 244);
    this.plotList(1);
    const fade = Array.from({ length: 42 }, (_, i) => i - 41);
    this.readTimer();
    const timer = { v: this.setTimer() };
    let state = 0;
    while (fade[0] < 60 && state === 0) {
      state = this.key(0);
      const speed = this.elapsed(timer, 16);
      for (let l = 0; l <= 41; l++) {
        this.psycho(this.second, this.screen, l, 1, fade[l] >= 0 ? fade[l] : 0);
        fade[l] = fade[l] < 61 - speed ? fade[l] + speed : 60;
      }
      await this.frame();
    }
    return state;
  }

  async special(out) {
    const fade = [];
    let which = 0, step = 0;
    const mid = B_T + ((B_B - B_T) >> 1);
    switch (this.random(0, 3)) {
      case 0: for (let l = B_T; l <= B_B; l++) fade[l] = out ? 60 + (l - B_T) : -(l - B_T); which = B_B; step = 8; break;
      case 1: for (let l = B_T; l <= mid; l++) { fade[l] = out ? 60 + (l - B_T) : -(l - B_T); fade[B_B - (l - B_T)] = fade[l]; } which = mid; step = 4; break;
      case 2: for (let l = B_T; l <= B_B; l++) fade[l] = out ? 60 + ((B_B - B_T) - (l - B_T)) : -((B_B - B_T) - (l - B_T)); which = B_T; step = 8; break;
      default: for (let l = B_T; l <= mid; l++) { const v = (mid - B_T) - (l - B_T); fade[l] = out ? 60 + v : -v; fade[B_B - (l - B_T)] = fade[l]; } which = B_T; step = 4; break;
    }
    this.readTimer();
    const timer = { v: this.setTimer() };
    let state = 0;
    while ((out ? fade[which] > 0 : fade[which] < 60) && state === 0) {
      state = this.key(0);
      const st = step * this.elapsed(timer, 32);
      for (let l = B_T; l <= B_B; l++) {
        if (out) { this.psycho(this.second, this.screen, l, 1, fade[l] <= 60 ? fade[l] : 60); fade[l] = fade[l] > st ? fade[l] - st : 0; }
        else { this.psycho(this.second, this.screen, l, 1, fade[l] >= 0 ? fade[l] : 0); fade[l] = fade[l] < 61 - st ? fade[l] + st : 60; }
      }
      await this.frame();
    }
    return state;
  }
  specialIn() { return this.special(false); }
  specialOut() { return this.special(true); }

  // ------------------------------------------------------------------ cars.c
  carsInit(level) {
    const d = this.env.cars, L = d[0];
    const num = level > L ? L : level, minus = level > L ? level - L : 0;
    let pos = d[num];
    this.road = [];
    for (let l = 0; l < 4; l++) {
      const row = { speed: Math.max(MINIMUM_SPEED, d[pos++] - minus), timer: { v: this.setTimer() }, width: d[pos++], num: d[pos++], sprites: [] };
      for (let k = 0; k < row.num; k++) row.sprites.push({ x: d[pos++], y: 144 + l * 20, spr: l === 1 ? 3 : this.random(0, 2) + 3 * (l % 2) });
      this.road.push(row);
    }
  }
  carsResetTimers() { for (const r of this.road) r.timer.v = this.setTimer(); }
  carsPrint() { for (const r of this.road) for (const s of r.sprites) this.showVehicle(s); }
  carsUpdate() {
    this.road.forEach((r, l) => {
      const plus = this.elapsed(r.timer, r.speed);
      const top = r.width - 40;
      for (const s of r.sprites) {
        if (l === 0 || l === 2) {
          s.x -= plus;
          if (s.x <= -40) { s.x += r.width; s.spr = l === 1 ? 3 : this.random(0, 2) + 3 * (l % 2); }
        } else {
          s.x += plus;
          if (s.x >= top) { s.x -= r.width; s.spr = l === 1 ? 3 : this.random(0, 2) + 3 * (l % 2); }
        }
      }
    });
  }
  carsCollided(box, row) {
    const r = this.road[((row + 1) >> 1) - 6];
    return r.sprites.some((s) => box.x + 16 >= s.x && box.x <= s.x + 29) ? 1 : 0;
  }

  // ------------------------------------------------------------------ water.c
  waterInit(level) {
    const d = this.env.water, L = d[0];
    const num = level > L ? L : level, minus = level > L ? level - L : 0;
    let pos = d[num];
    this.water = [];
    for (let l = 0; l < 4; l++) {
      const row = { speed: Math.max(MINIMUM_SPEED, d[pos++] - minus), timer: { v: this.setTimer() }, width: d[pos++], num: d[pos++], sprites: [] };
      for (let k = 0; k < row.num; k++) row.sprites.push({ x: d[pos++], y: 44 + l * 20, spr: l === 0 || l === 2 ? 0 : 1 });
      this.water.push(row);
    }
    const S = this.state;
    S.dir = [-1, 1, 0];
    if (level === 1) S.dir = [0, 0, 0];
    else if (level === 2) { S.dir[0] = -1; this.water[1].sprites[0].spr = 4; }
    else if (level < 6) { S.dir[0] = -1; S.dir[1] = 1; this.water[1].sprites[0].spr = 4; }
    else { S.dir = [-1, 1, 1]; this.water[1].sprites[0].spr = 4; }
    S.turtleSpeed = level > 8 ? [300, 250, 200] : level > 5 ? [350, 400, 350] : [500, 400, 350];
    S.submerge = S.submerge ?? [0, 0, 0];
    S.flyOk = 0;
    S.subTimer = [0, 1, 2].map(() => ({ v: this.setTimer() }));
    S.plus = [0, 0, 0, 0];
    S.flyPos = S.flyPos ?? 0;
  }
  waterResetTimers() { for (const r of this.water) r.timer.v = this.setTimer(); for (const t of this.state.subTimer) t.v = this.setTimer(); }
  waterPrint() { for (const r of this.water) for (const s of r.sprites) this.showWater(s); }
  waterUpdate() {
    const S = this.state;
    this.water.forEach((r, l) => {
      S.plus[l] = this.elapsed(r.timer, r.speed);
      const top = r.width - 100;
      for (const s of r.sprites) {
        if (l === 0 || l === 2) {
          s.x += S.plus[l];
          if (s.x >= top) {
            s.x -= r.width;
            if (l === 2 && S.flyOk === 0 && this.random(0, 100) < 50) { S.flyPos = s.x + 10 + this.random(0, 40); S.flyOk = 1; }
          }
        } else {
          s.x -= S.plus[l];
          if (s.x <= -100) s.x += r.width;
        }
      }
    });
    // submerging turtles
    const T = [[1, 0], [3, 0], [1, 1]];
    for (let l = 0; l < 3; l++) {
      if (S.dir[l] === 0) continue;
      S.submerge[l] = (S.submerge[l] + this.elapsed(S.subTimer[l], 2)) % S.turtleSpeed[l];
      if (S.submerge[l] === 0) {
        const t = this.water[T[l][0]].sprites[T[l][1]];
        if (!t) continue;
        t.spr += S.dir[l];
        if (t.spr === 4 || t.spr === 1) S.dir[l] = -S.dir[l];
      }
    }
    S.flyPos += S.plus[2];
    if (S.flyPos >= 480) S.flyOk = 0;
  }
  waterCollided(box, row) {
    const S = this.state, l = (row >> 1) - 1;
    if (l === 2 && S.flyOk !== 0 && box.x >= S.flyPos - 15 && box.x <= S.flyPos + 12) {
      this.env.qtm.sample(Q.BURP, 21, 64, box.x);
      this.scoreAdd(200);
      S.flyOk = 0;
    }
    for (const s of this.water[l].sprites) {
      if (box.x + 10 >= s.x && box.x <= s.x + 74) {
        box.x = l === 0 || l === 2 ? box.x + S.plus[l] : box.x - S.plus[l];
        return s.spr === 4 ? 1 : 0;
      }
    }
    return 1;
  }
  waterShowFly() { if (this.state.flyOk) this.showFly(this.state.flyPos); }

  // ------------------------------------------------------------------ snake.c
  snakeInit(level) {
    this.snakePos = 320;
    this.snakeSpeed = level === 1 ? 0 : level < 5 ? 96 : level < 7 ? 64 : 48;
    this.snakeTimer = { v: this.setTimer() };
  }
  snakeUpdate() {
    if (this.snakeSpeed > 0) {
      this.snakePos -= this.elapsed(this.snakeTimer, this.snakeSpeed);
      if (this.snakePos <= -40) this.snakePos = 320;
    }
  }
  snakeCollided(box) { return box.x <= this.snakePos - 19 || box.x >= this.snakePos + 24 ? 0 : 1; }

  // ------------------------------------------------------------------ scenery.c
  clearRiver() { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) this.showWater({ x: c * 88, y: r * 20 + 44, spr: 4 }); }
  clearRoad() { for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) this.showVehicle({ x: c * 32, y: r * 20 + 144, spr: 6 }); }
  sceneryDisplay(hi) {
    this.initList();
    this.showScenery(100, 0, 7); this.showScenery(140, 0, 8); this.showScenery(180, 0, 9);
    for (let l = 0; l < 8; l++) { this.showScenery(l * 40, 20, 2); this.showScenery(l * 40, 122, 3); this.showScenery(l * 40, 220, 4); }
    this.writeString(this.env.msg('Score'), 0, 0, RED, 3);
    this.stringRight(this.env.msg('High'), 320, 0, RED, 3);
    this.stringRight(this.env.msg('Time'), 268, 246, RED, 3);
    this.homes = [0, 0, 0, 0, 0];
    for (let l = 0; l < 5; l++) this.showScenery(12 + l * 64, 20, 1);
    this.flush();
    this.clearRiver();
    this.clearRoad();
    this.textFg = gcolByte(13);                           // VDU 17,13
    [10000, 1000, 100, 10, 1].forEach((d, i) => this.showNumber(240 + i * 16, 10, Math.floor(hi / d) % 10));
    this.plotList(1);
  }
  sceneryCollided(box) {
    const C = this.croc;
    let ret = 1;
    for (let l = 0; l < 5; l++) {
      if (this.homes[l] !== 0) continue;
      const pos = 16 + l * 64;
      if (box.x >= pos - 2 && box.x <= pos + 16 && l !== C.inHome) {
        this.homes[l] = 1;
        if (l === C.pos) { C.pos = 5; C.num = 0; }
        this.env.qtm.sample(Q.FROG, 15, 64, pos);
        this.initList();
        this.showScenery(12 + l * 64, 20, 0);
        this.plotList(0);
        ret = this.homes.every((h) => h) ? 3 : 2;
      }
    }
    return ret;
  }
  async clearHomes() {
    for (let l = 0; l < 5; l++) {
      await this.wait(500);
      this.env.qtm.sample(Q.CLEAR, 10 + l, 64, 16 + l * 64);
      this.scoreAdd(200);
      this.initList();
      this.showScenery(12 + l * 64, 20, 1);
      this.scorePrint();
      this.plotList(0);
    }
  }
  crocInit(level) {
    this.croc = { num: 0, pos: level > 1 ? 5 : 6, count: 0, dir: 1, inHome: 5, use: level > 1 ? 1 : 0, speed: level < 5 ? 200 : level < 8 ? 300 : 400, timer: { v: this.setTimer() } };
  }
  crocUpdate() {
    const C = this.croc;
    if (C.use !== 1) return;
    C.count = (C.count + this.elapsed(C.timer, 2)) % (C.speed + ((C.num === 6 ? 1 : 0) * (C.speed << 1)));
    if (C.count !== 0) return;
    if (C.pos === 5 && this.random(0, 50) > 35) {
      C.pos = this.random(0, 4);
      if (this.homes[C.pos] !== 0) C.pos = 5;
      C.num = 4; C.dir = 1;
    }
    if (C.pos !== 5) {
      C.num += C.dir;
      if (C.num === 6) C.dir = -1;
      if (C.num === 4) { this.showScenery(12 + C.pos * 64, 20, 1); C.pos = 5; }
      else this.showScenery(12 + C.pos * 64, 20, C.num);
    }
    C.inHome = C.num === 6 ? C.pos : 5;
  }

  // ------------------------------------------------------------------ score.c / timer.c
  showLives(num) {
    const col = num === 0 ? 0 : (num - 1) << 1;
    if (num > 0) { this.textChar(col, 31, 128); this.textChar(col + 1, 31, 129); this.textChar(col + 2, 31, 32); this.textChar(col + 3, 31, 32); }
    else { this.textChar(col, 31, 32); this.textChar(col + 1, 31, 32); }
  }
  scoreInit() { this.score = 0; this.changed = 1; this.extra = 5000; this.lives = 3; this.first = 1; }
  scoreAdd(n) {
    this.changed = 1;
    this.score += n;
    if (this.score >= this.extra) { this.lives++; this.extra += 10000; this.showLives(this.lives); }
  }
  scorePrint() {
    if (this.changed === 1) { [10000, 1000, 100, 10, 1].forEach((d, i) => this.showNumber(i * 16, 10, Math.floor(this.score / d) % 10)); this.changed = 0; }
    if (this.first === 1) { for (let l = 1; l <= this.lives; l++) this.showLives(l); this.first = 0; }
  }
  scoreLives() { this.lives--; this.showLives(this.lives); return this.lives; }
  timerInit() { this.timer = 400; this.timerSw = { v: this.setTimer() }; }
  timerPrint() {
    this.timer -= this.elapsed(this.timerSw, 40);
    const t = Math.max(0, this.timer);
    this.showNumber(272, 246, Math.floor(t / 100) % 10);
    this.showNumber(288, 246, Math.floor(t / 10) % 10);
    this.showNumber(304, 246, t % 10);
    if (this.timer === 100) this.env.qtm.sample(Q.ALARM, 17, 64, 160);
    return this.timer;
  }

  // ------------------------------------------------------------------ frog.c
  frogInit(control) {
    this.frog = { x: 150, y: 224, spr: 0 };
    this.frogTimer = { v: this.setTimer() };
    this.yPos = 20; this.direction = 0; this.moving = 0;
    this.frogControl = control;
    this.pressed ??= { up: 0xff, down: 0xff, left: 0xff, right: 0xff };
    this.showFrog(this.frog);
  }
  frogPrint() { this.showFrog(this.frog); }
  frogDead() { this.frog.spr = 12; this.showFrog(this.frog); }
  soundKeys(inGame) {
    const K = this.env.keys;
    if (this.scan(KEY.SOUND_ON)) K.soundFx = 1;
    if (this.scan(KEY.SOUND_OFF)) K.soundFx = 0;
    if (this.scan(KEY.MUSIC_ON)) {
      if (inGame ? K.ingame === 0 : K.intro === 0) { K.ingame = 1; K.intro = 1; this.env.qtm.start(inGame ? SONG.INGAME : SONG.INTRO); }
      K.ingame = 1; K.intro = 1;
    }
    if (this.scan(KEY.MUSIC_OFF)) {
      if (inGame ? K.ingame === 1 : K.intro === 1) this.env.qtm.stopMusic();
      K.ingame = 0; K.intro = 0;
    }
  }
  async frogUpdate() {
    const K = this.env.keys, q = this.env.qtm;
    // F9 - pause
    if (this.scan(KEY.PAUSE)) {
      const paused = this.env.msg('Pause');
      this.fade(0, H, 60, FROM);
      this.readTimer();
      const timer = { v: this.setTimer() };
      let which = 0, dir = 1;
      this.paused = true;
      do {
        which += dir;
        if (which === 0 || which === 15) dir = -dir;
        do { await this.frame(); this.readTimer(); } while (this.elapsed(timer, 64) === 0);
        this.stringCentre(paused, 160, 162, BLACK, which);
      } while (!this.scan(KEY.CONTINUE) && !this.env.forceContinue?.());
      this.paused = false;
      this.fade(0, H, 60, TO);
      this.readTimer();
      this.frogTimer.v = this.setTimer();
      this.carsResetTimers(); this.waterResetTimers(); this.snakeTimer.v = this.setTimer(); this.timerSw.v = this.setTimer();
    }
    if (this.scan(KEY.ABORT)) return -1;
    this.soundKeys(true);
    if (this.elapsed(this.frogTimer, 20) > 0) {
      const f = this.frog, P = this.pressed;
      switch (this.moving) {
        case 0: {
          let up = this.scan(K.up) ? 0xff : 0, down = this.scan(K.down) ? 0xff : 0, left = this.scan(K.left) ? 0xff : 0, right = this.scan(K.right) ? 0xff : 0;
          up &= P.up; down &= P.down; left &= P.left; right &= P.right;
          if (up === 0xff && this.yPos > 0) { this.direction = 0; this.moving = 1; f.y -= 4; this.yPos--; q.sample(Q.JUMP, FROG_PITCH, 64, f.x); this.scoreAdd(10); P.up = 0; }
          if (down === 0xff && this.yPos < 20) { this.direction = 1; this.moving = 1; f.y += 4; this.yPos++; q.sample(Q.JUMP, FROG_PITCH, 64, f.x); P.down = 0; }
          if (left === 0xff && f.x > 19) { this.direction = 2; this.moving = 1; f.x -= 4; q.sample(Q.JUMP, FROG_PITCH, 64, f.x); P.left = 0; }
          if (right === 0xff && f.x < 280) { this.direction = 3; this.moving = 1; f.x += 4; q.sample(Q.JUMP, FROG_PITCH, 64, f.x); P.right = 0; }
          break;
        }
        case 1: case 2: case 3: {
          const step = [5, 6, 5][this.moving - 1];
          const d = this.direction;
          if (d === 0) f.y -= step; else if (d === 1) f.y += step; else if (d === 2) f.x -= step; else f.x += step;
          if (this.moving === 3) { if (d === 0) this.yPos--; else if (d === 1) this.yPos++; this.moving = -255; }
          else this.moving++;
          break;
        }
        case -255: this.moving = -254; break;
        case -254: this.moving = 0; break;
        default: this.moving = 0; this.direction = 0;
      }
      f.spr = this.direction * 3 + (this.moving > 2 ? 2 : this.moving < 0 ? 0 : this.moving);
    }
    const P = this.pressed;
    if (K.autoRepeat) { P.up = P.down = P.left = P.right = 0xff; }
    else {
      if (!this.scan(K.up)) P.up = 0xff;
      if (!this.scan(K.down)) P.down = 0xff;
      if (!this.scan(K.left)) P.left = 0xff;
      if (!this.scan(K.right)) P.right = 0xff;
    }
    return this.yPos;
  }
  frogCollided() {
    const f = this.frog, q = this.env.qtm;
    if (f.x < 0 || f.x > 300) { q.sample(Q.BANK, 15, 64, f.x); return 1; }
    let r;
    switch (this.yPos) {
      case 0: r = this.sceneryCollided(f); if (r === 1) q.sample(Q.BANK, 15, 64, f.x); return r;
      case 2: case 4: case 6: case 8: r = this.waterCollided(f, this.yPos); if (r) q.sample(Q.SPLASH, 15, 64, f.x); return r;
      case 10: r = this.snakeCollided(f); if (r === 1) q.sample(Q.EATEN, 15, 64, f.x); return r;
      case 12: case 14: case 16: case 18: r = this.carsCollided(f, this.yPos); if (r) q.sample(Q.SPLAT, 15, 64, f.x); return r;
      default: return 0;
    }
  }

  // ------------------------------------------------------------------ hopper.c
  setupScreen() {
    let c1 = 0, c2 = 0;
    while (c1 === c2) { c1 = this.random(1, 6); c2 = this.random(1, 6); }
    for (let l = 0; l < 5; l++) {
      this.setColour(c1, 10 - l * 2);
      this.drawLine(B_L + l, B_T + l, B_R - l, B_T + l);
      this.drawLine(B_L + l, B_B - l, B_R - l, B_B - l);
      this.setColour(c2, 10 - (l - 10) * 2);
      this.drawLine(B_L + l, B_T + l, B_L + l, B_B - l);
      this.drawLine(B_R - l, B_T + l, B_R - l, B_B - l);
    }
    return [c1, c2];
  }
  twoColours(b1, b2) {
    let a = 0, b = 0;
    while (a === b || b === b1 || a === b1 || b === b2 || a === b2) { a = this.random(1, 6); b = this.random(1, 6); }
    return [a, b];
  }
  displayHi() {
    const [b1, b2] = this.setupScreen();
    const [nameCol, scoreCol] = this.twoColours(b1, b2);
    const hi = this.env.hi;
    for (let l = 0; l < 10; l++) {
      this.writeString(hi[l].name, 25, 60 + l * 15, nameCol, l);
      this.stringRight(String(hi[l].score).padStart(5, '0'), 294, 60 + l * 15, scoreCol, l);
    }
    return nameCol;
  }
  async enterName(where, col) {
    let temp = '';
    const xPos = 60, yPos = 60 + where * 15;
    let dir = 1, which = 1;
    this.flush();
    this.inkey();
    this.readTimer();
    const ftimer = { v: this.setTimer() };
    let key;
    do {
      await this.frame();
      this.readTimer();
      if (this.elapsed(ftimer, 32) !== 0) which += dir;
      if (which <= 0) dir = 1; else if (which >= 20) dir = -1;
      const k = this.inkey();
      key = k ? k.code : 0xff;
      if (key >= 32 && key <= 126) {
        const tx = xPos + (this.stringWidth(temp) >> 2);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) this.writeString('_', tx + a, yPos + b, BLACK, 0);
        temp += String.fromCharCode(key);
        if (this.stringWidth(temp) > 776) temp = temp.slice(0, -1);
        this.writeString(temp, xPos, yPos, col, where);
      } else if ((key === 8 || key === 127) && temp.length > 0) {
        let tx = xPos + (this.stringWidth(temp) >> 2);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) this.writeString('_', tx + a, yPos + b, BLACK, 0);
        const last = temp.slice(-1);
        temp = temp.slice(0, -1);
        tx = xPos + (this.stringWidth(temp) >> 2);
        for (let a = -2; a <= 1; a++) for (let b = -1; b <= 1; b++) this.writeString(last, tx + a, yPos + b, BLACK, 0);
        this.writeString(temp, xPos, yPos, col, where);
      }
      this.writeString('_', xPos + (this.stringWidth(temp) >> 2), yPos, BLACK, which > 15 ? 15 : which);
    } while (key !== 13 && key !== 27);
    return temp;
  }
  async insertScore(score) {
    const hi = this.env.hi;
    let where = 0;
    for (let l = 0; l < 10; l++) if (score > hi[l].score) { where = l; break; }
    for (let l = 10; l > where; l--) hi[l] = { ...hi[l - 1] };
    hi[where] = { score, name: '' };
    this.toSprite(); this.cls(); this.toScreen();
    await this.displayTitle();
    this.toSprite();
    const [c1, c2] = this.setupScreen();
    let nameCol = -1, textCol = -1;
    while (nameCol === textCol || textCol === c1 || nameCol === c1 || textCol === c2 || nameCol === c2) { nameCol = this.random(1, 6); textCol = this.random(1, 6); }
    const M = this.env.msg;
    this.stringCentre(M('Hs00'), 160, 68, textCol, 8);
    this.stringCentre(M('Hs01'), 160, 88, textCol, 6);
    this.stringCentre(M('Hs02'), 160, 103, textCol, 4);
    this.stringCentre(M('Name'), 160, 123, textCol, 2);
    for (let l = 0; l < 5; l++) {
      this.setColour(c2, 10 - l * 2);
      this.drawLine(N_L + l, N_T + l, N_R - l, N_T + l);
      this.drawLine(N_L + l, N_B - l, N_R - l, N_B - l);
      this.setColour(c1, 10 - (l - 10) * 2);
      this.drawLine(N_L + l, N_T + l, N_L + l, N_B - l);
      this.drawLine(N_R - l, N_T + l, N_R - l, N_B - l);
    }
    this.toScreen();
    await this.specialIn();
    hi[where].name = await this.enterName(7, nameCol);
    this.env.onHiScore?.();
  }

  async playLevel(level, hi, control) {
    this.carsInit(level); this.waterInit(level); this.snakeInit(level); this.crocInit(level);
    this.sceneryDisplay(hi);
    // the level dots (VDU 5, characters 130/131 at the graphics cursor)
    for (let l = 0; l < level; l++) {
      const px = (1259 - l * 24) >> 2, py = (1023 - 68) >> 2;
      this.setColour(BLACK, 0); this.gfxChar(px, py, 130);
      this.setColour(BLUE, l); this.gfxChar(px, py, 131);
    }
    this.initList();
    this.frogInit(control);
    this.scorePrint();
    this.timerInit();
    let time = this.timerPrint();
    this.showSnake(this.snakePos);
    this.plotList(1);

    this.initList();
    this.deleteFrog(); this.deleteSnake();
    this.carsPrint(); this.waterPrint(); this.frogPrint(); this.waterShowFly(); this.showSnake(this.snakePos); this.scorePrint();
    await this.frame();
    this.plotList(1);
    this.flush();

    this.readTimer();
    this.carsResetTimers(); this.waterResetTimers(); this.snakeTimer.v = this.setTimer();
    this.timerInit();
    let which = 1, coll = 0, where = 0;
    do {
      this.readTimer();
      this.carsUpdate(); this.waterUpdate(); this.snakeUpdate();
      where = await this.frogUpdate();

      this.initList();
      this.deleteFrog(); this.deleteSnake();
      if (!this.env.keys.update) { this.carsPrint(); this.waterPrint(); }
      else if (which) this.carsPrint();
      else this.waterPrint();
      which = which ? 0 : 1;
      this.frogPrint(); this.waterShowFly(); this.showSnake(this.snakePos); this.crocUpdate(); this.scorePrint();
      time = this.timerPrint();
      await this.frame();                  // the VSync wait in gfx_plot_list
      this.plotList(where >= 10 ? 1 : 0);

      coll = this.frogCollided();
      if (coll === 1 || time <= 0) {
        coll = 1;
        this.initList(); this.deleteFrog(); this.frogDead(); this.plotList(0);
        await this.wait(500);
        this.initList(); this.deleteFrog(); this.frogInit(control); this.plotList(0);
        this.flush();
        if (this.scoreLives() >= 0) coll = 0;
        this.readTimer();
        this.carsResetTimers(); this.waterResetTimers(); this.snakeTimer.v = this.setTimer();
        this.timerInit();
      }
      if (coll === 2) {
        coll = 0;
        this.scoreAdd(time);
        await this.wait(500);
        this.initList(); this.frogInit(control); this.scorePrint(); this.plotList(0);
        this.flush();
        this.readTimer();
        this.carsResetTimers(); this.waterResetTimers(); this.snakeTimer.v = this.setTimer();
        this.timerInit();
      }
      if (coll === 3) {
        this.scoreAdd(time);
        this.initList(); this.scorePrint(); this.plotList(0);
      }
    } while (coll === 0 && where !== -1);
    return where === -1 ? 4 : coll;
  }

  async playGame(hi, control) {
    this.cls();
    this.scoreInit();
    this.env.qtm.start(SONG.INGAME);
    let happened = 0, level = 1;
    do {
      this.level = level;
      happened = await this.playLevel(level++, hi, control);
      if (happened === 3) await this.clearHomes();
    } while (happened === 3);
    await this.fadeScreenAndQtm();
    if (happened !== 4 && this.score > this.env.hi[9].score) {
      this.env.qtm.start(SONG.HISCORE);
      await this.insertScore(this.score);
      await this.fadeScreenAndQtm();
    }
  }

  /** hopper_key: 1 Space, 2 joystick fire, 3 Escape. start=1 sets up the "Press SPACE" line. */
  key(start) {
    const S = this.keyState ??= { count: 0, step: 1, timer: { v: 0 } };
    if (start === 1) {
      this.fade(0, H, 60, FROM);
      this.toSprite();
      this.stringCentre(this.env.msg('StKbd'), 160, 232, WHITE, 15);
      this.toScreen();
      this.flush(); this.inkey();
      S.count = 0; S.step = 1;
      this.readTimer();
      S.timer.v = this.setTimer();
      return 0;
    }
    this.fade(232, 24, S.count < 60 ? S.count : 60, TO);
    this.readTimer();
    if (this.elapsed(S.timer, 16) !== 0) { S.count += S.step; if (S.count === 0 || S.count === 80) S.step = -S.step; }
    const k = this.inkey();
    this.flush();
    if (k?.code === 32) return 1;
    if (k?.code === 27) return 3;
    return 0;
  }

  hopperWriteKey(text, key, hcol, kcol, num) {
    const y = 58 + num * 20, name = this.env.keyName(key);
    this.stringRight(text, 128, y, hcol, num);
    this.writeString("'", 136, y, hcol, num);
    this.writeString(name, 143, y, kcol, num);
    this.writeString("'", 143 + (this.stringWidth(name) >> 2), y, hcol, num);
  }
  showControlKeys() {
    const [b1, b2] = this.setupScreen(), [h, k] = this.twoColours(b1, b2), M = this.env.msg, K = this.env.keys;
    this.writeString(M('Frg00'), 20, 58, WHITE, 15);
    this.hopperWriteKey(M('Frg01'), K.up, h, k, 2);
    this.hopperWriteKey(M('Frg02'), K.down, h, k, 3);
    this.hopperWriteKey(M('Frg03'), K.left, h, k, 4);
    this.hopperWriteKey(M('Frg04'), K.right, h, k, 5);
    this.stringRight(M('Frg05'), 300, 198, WHITE, 15);
  }
  showGeneralKeys() {
    const [b1, b2] = this.setupScreen(), [h, k] = this.twoColours(b1, b2), M = this.env.msg;
    this.writeString(M('Gen00'), 20, 58, WHITE, 15);
    [KEY.SOUND_ON, KEY.SOUND_OFF, KEY.MUSIC_ON, KEY.MUSIC_OFF, KEY.PAUSE, KEY.CONTINUE, KEY.ABORT]
      .forEach((key, i) => this.hopperWriteKey(M('Gen0' + (i + 1)), key, h, k, i + 1));
  }
  displayCredits() {
    const [b1, b2] = this.setupScreen(), [h, k] = this.twoColours(b1, b2), M = this.env.msg;
    this.writeString(M('Crd00'), 20, 58, h, 0);
    this.stringRight('Simon Foster', 300, 73, k, 1);
    this.writeString(M('Crd01'), 20, 98, h, 2);
    this.stringRight('Leitch, Myers & Young', 300, 113, k, 3);
    this.writeString(M('Crd02'), 20, 138, h, 4);
    this.stringRight('Steve Harrison', 300, 153, k, 5);
    this.writeString(M('Crd03'), 20, 178, h, 6);
    this.stringRight('Andy Southgate', 300, 193, k, 7);
  }

  /** hopper_go: the title / attract loop, games, back to the desktop on Escape. */
  async go() {
    this.seed = Date.now() % 65537;
    this.cls();
    this.readTimer();
    let state = 0, screenNo = 0, first = true;
    try {
      do {
        this.key(1);
        state = await this.displayTitle();
        const scrTimer = { v: 0 };
        if (state === 0) {
          this.env.qtm.start(SONG.INTRO);
          this.readTimer();
          scrTimer.v = this.setTimer();
          this.fade(0, 231, 60, FROM);
          this.toSprite();
          if (first) { this.displayCredits(); first = false; }
          else { this.displayHi(); screenNo = 5; }
          this.toScreen();
          state = await this.specialIn();
        }
        while (state === 0) {
          state = this.key(0);
          if (state) break;
          if (this.elapsed(scrTimer, 12000) !== 0) {
            state = await this.specialOut();
            if (state === 0) {
              this.fade(0, 231, 60, FROM);
              this.toSprite();
              screenNo = (screenNo + 1) % 6;
              if (screenNo === 0) this.displayCredits();
              else if (screenNo === 2) this.showControlKeys();
              else if (screenNo === 4) this.showGeneralKeys();
              else this.displayHi();
              this.toScreen();
              state = await this.specialIn();
            }
          }
          this.soundKeys(false);
          await this.frame();
        }
        await this.fadeScreenAndQtm();
        if (state === 1 || state === 2) {
          this.inGame = true;
          await this.playGame(this.env.hi[0].score, state === 2 ? 1 : 0);
          this.inGame = false;
          state = 0;
        }
      } while (state !== 3);
    } catch (e) {
      if (!(e instanceof Abort)) throw e;
    }
  }
}
