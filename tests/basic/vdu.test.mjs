// Tests for the RISC OS VDU driver (src/basic/vdu.js). Run: node --test tests/basic/vdu.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VDU, gcolToPixel, pixelToGcol } from '../../src/basic/vdu.js';
import { SYSTEM_FONT } from '../../src/basic/font8x8.js';

// ---- helpers ------------------------------------------------------------------------------------
const w16 = (v) => [v & 255, (v >> 8) & 255];
const mk = (mode = 12, opts = {}) => new VDU({ mode, ...opts });
const PLOT = (v, k, x, y) => v.write([25, k, ...w16(x), ...w16(y)]);
const MOVE = (v, x, y) => PLOT(v, 4, x, y);
const DRAW = (v, x, y) => PLOT(v, 5, x, y);
const GCOL = (v, a, c) => v.write([18, a, c]);
const COLOUR = (v, c) => v.write([17, c]);
const TINT = (v, which, t) => v.write([23, 17, which, t, 0, 0, 0, 0, 0, 0]);
/** pixel at OS coordinates (no origin) */
const px = (v, x, y) => v.getPixel(x >> v.xEig, v.yWL - (y >> v.yEig));
/** all set (non-zero) pixels as "x,y" internal coordinates (y up) */
function setPixels(v, test = (p) => p !== 0) {
  const s = new Set();
  for (let y = 0; y < v.height; y++) for (let x = 0; x < v.width; x++) if (test(v.getPixel(x, y))) s.add(`${x},${v.yWL - y}`);
  return s;
}
function bbox(v, test = (p) => p !== 0) {
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < v.height; y++) for (let x = 0; x < v.width; x++) {
    if (test(v.getPixel(x, y))) { const iy = v.yWL - y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, iy); y1 = Math.max(y1, iy); }
  }
  return { x0, x1, y0, y1 };
}

// ---- mode variables -----------------------------------------------------------------------------
test('mode variables match the RISC OS 3.71 mode table', () => {
  // ModeFlags, ScrRCol, ScrBRow, NColour, XEig, YEig, LineLength, ScreenSize, YShft, Log2BPP, Log2BPC, XWind, YWind
  const expect = {
    0: [0, 79, 31, 1, 1, 2, 80, 20480, 4, 0, 0, 639, 255],
    1: [0, 39, 31, 3, 2, 2, 80, 20480, 4, 1, 1, 319, 255],
    2: [0, 19, 31, 15, 3, 2, 160, 40960, 5, 2, 3, 159, 255],
    7: [7, 39, 24, 15, 2, 2, 160, 81920, 5, 2, 2, 319, 249],
    12: [0, 79, 31, 15, 1, 2, 320, 81920, 6, 2, 2, 639, 255],
    13: [0, 39, 31, 63, 2, 2, 320, 81920, 6, 3, 3, 319, 255],
    15: [0, 79, 31, 63, 1, 2, 640, 163840, 7, 3, 3, 639, 255],
    20: [0, 79, 63, 15, 1, 1, 320, 163840, 6, 2, 2, 639, 511],
    27: [0, 79, 59, 15, 1, 1, 320, 153600, 6, 2, 2, 639, 479],
    28: [0, 79, 59, 63, 1, 1, 640, 307200, 7, 3, 3, 639, 479],
    31: [0, 99, 74, 15, 1, 1, 400, 240000, 0, 2, 2, 799, 599],
  };
  const v = mk(12);
  for (const [mode, vals] of Object.entries(expect)) {
    for (let i = 0; i < 13; i++) assert.equal(v.modeVar(i, +mode), vals[i], `mode ${mode} var ${i}`);
  }
  assert.equal(v.modeVar(0, 60), undefined);
  assert.equal(v.modeVar(13, 12), undefined);
  // current mode + VDU variables
  const m28 = mk(28);
  for (let i = 0; i < 13; i++) { assert.equal(m28.modeVar(i), expect[28][i]); assert.equal(m28.vduVar(i), expect[28][i]); }
  assert.equal(m28.vduVar(161), 49); // MaxMode
  assert.equal(m28.vduVar(256), 79); // WindowWidth (chars printable before a newline - kernel returns width-1)
  assert.equal(m28.vduVar(257), 59);
});

test('mode sizes and display sizes', () => {
  const cases = [[12, 640, 256, 640, 512], [1, 320, 256, 640, 512], [28, 640, 480, 640, 480], [2, 160, 256, 640, 512], [7, 320, 250, 640, 500]];
  for (const [m, w, h, dw, dh] of cases) {
    const v = mk(m);
    assert.equal(v.mode, m);
    assert.deepEqual([v.width, v.height, v.displayWidth, v.displayHeight], [w, h, dw, dh], `mode ${m}`);
  }
});

test('MODE change: substitution, errors and shadow bit', () => {
  const v = mk(12);
  v.write([22, 23]); assert.equal(v.mode, 0, 'mode 23 is substituted on a multisync monitor');
  v.write([22, 128 + 13]); assert.equal(v.mode, 13, 'shadow bit ignored');
  let err = null; v.onError = (e) => { err = e; };
  v.write([22, 60]); assert.equal(v.mode, 13); assert.ok(err);
});

// ---- text output --------------------------------------------------------------------------------
test('text output, wrapping, CR/LF and textLines', () => {
  const v = mk(12);
  v.write('Hello, World!');
  assert.equal(v.pos, 13); assert.equal(v.vpos, 0);
  v.newLine();
  v.write('x'.repeat(85));
  const lines = v.textLines();
  assert.equal(lines.length, 32);
  assert.equal(lines[0], 'Hello, World!'.padEnd(80));
  assert.equal(lines[1], 'x'.repeat(80));
  assert.equal(lines[2], 'xxxxx'.padEnd(80));
  assert.equal(v.pos, 5); assert.equal(v.vpos, 2);
  // backspace / delete
  v.write([8, 8]); assert.equal(v.pos, 3);
  v.write([127]); assert.equal(v.pos, 2);
  assert.equal(v.textLines()[2], 'xx xx'.padEnd(80));
  // BS at the left edge wraps to the end of the previous line
  v.write([13, 8]); assert.deepEqual([v.pos, v.vpos], [79, 1]);
  // VT at the top line scrolls down
  v.write([30, 11]); assert.equal(v.vpos, 0); assert.equal(v.textLines()[1], 'Hello, World!'.padEnd(80));
});

test('glyphs are painted from the system font in the text colours', () => {
  const v = mk(12);
  v.write('A');
  for (let r = 0; r < 8; r++) for (let x = 0; x < 8; x++) {
    const bit = (SYSTEM_FONT[65 * 8 + r] >> (7 - x)) & 1;
    assert.equal(v.getPixel(x, r), bit ? 7 : 0);
  }
  assert.deepEqual(v.readCharAtCursor(), { char: 32, mode: 12 });
  v.write([8]);
  assert.deepEqual(v.readCharAtCursor(), { char: 65, mode: 12 });
});

test('scrolling the whole screen is a hard scroll moving pixel rows', () => {
  const v = mk(12);
  for (let i = 0; i < 40; i++) v.write(`Line ${i}\r\n`);
  const lines = v.textLines();
  assert.equal(lines[0].trim(), 'Line 9');
  assert.equal(lines[30].trim(), 'Line 39');
  assert.equal(lines[31].trim(), '');
});

test('text windows: VDU 28, scrolling inside, TAB, CLS, VDU 26', () => {
  const v = mk(12);
  for (let r = 0; r < 31; r++) { v.write([31, 0, r]); v.write('#'.repeat(80)); } // fill rows 0..30
  v.write([28, 10, 20, 29, 5]); // left 10, bottom 20, right 29, top 5
  assert.equal(v.vduVar(132), 10); assert.equal(v.vduVar(133), 20); assert.equal(v.vduVar(134), 29); assert.equal(v.vduVar(135), 5);
  assert.equal(v.vduStatus() & 8, 8);
  v.write([12]); // CLS clears the window only
  let lines = v.textLines();
  assert.equal(lines[5].slice(10, 30), ' '.repeat(20));
  assert.equal(lines[5].slice(0, 10), '#'.repeat(10));
  assert.equal(lines[4].slice(10, 30), '#'.repeat(20));
  assert.deepEqual([v.pos, v.vpos], [0, 0]);
  for (let i = 0; i < 20; i++) v.write(`w${i}\r\n`);
  lines = v.textLines();
  assert.equal(lines[5].slice(10, 30).trim(), 'w5');
  assert.equal(lines[19].slice(10, 30).trim(), 'w19');
  assert.equal(lines[20].slice(10, 30).trim(), '');
  assert.equal(lines[21], '#'.repeat(80), 'outside the window untouched by scrolling');
  // TAB outside the window is ignored
  v.write([31, 3, 4]); const p = [v.pos, v.vpos];
  v.write([31, 30, 4]); assert.deepEqual([v.pos, v.vpos], p);
  v.write([31, 19, 15]); assert.deepEqual([v.pos, v.vpos], [19, 15]);
  // invalid window is ignored
  v.write([28, 30, 20, 10, 5]); assert.equal(v.vduVar(132), 10);
  v.write([26]);
  assert.deepEqual([v.vduVar(132), v.vduVar(133), v.vduVar(134), v.vduVar(135)], [0, 31, 79, 0]);
  assert.equal(v.vduStatus() & 8, 0);
  assert.deepEqual([v.pos, v.vpos], [0, 0]);
});

test('VDU 23,16 81-column mode gives a pending newline at the right edge', () => {
  const v = mk(12);
  v.write([23, 16, 1, 0xFE, 0, 0, 0, 0, 0, 0]);
  v.write('y'.repeat(80));
  assert.deepEqual([v.pos, v.vpos], [80, 0]);
  v.write('z');
  assert.deepEqual([v.pos, v.vpos], [1, 1]);
  // no-scroll mode (bit 4): wraps to the top instead of scrolling
  const w = mk(12);
  w.write([23, 16, 16, 0xEF, 0, 0, 0, 0, 0, 0]);
  w.write([31, 0, 31, 10]);
  assert.equal(w.vpos, 0);
});

test('VDU 21 disables and VDU 6 re-enables output; queue length', () => {
  const v = mk(12);
  v.write([21]); v.write('hidden'); assert.equal(v.vduStatus() & 0x80, 0x80);
  v.write([6]); v.write('shown');
  assert.equal(v.textLines()[0].trim(), 'shown');
  v.write([25, 4, 0]); assert.equal(v.queueLength, 3);
  v.write([0, 0, 0]); assert.equal(v.queueLength, 0);
  v.write([23]); assert.equal(v.queueLength, 9);
  v.write([0, 0, 0, 0, 0, 0, 0, 0, 0]); assert.equal(v.queueLength, 0);
});

test('bell', () => {
  let n = 0; const v = mk(12, { onBell: () => n++ });
  v.write([7, 7]); assert.equal(n, 2);
});

// ---- colours ------------------------------------------------------------------------------------
test('COLOUR in 2, 4 and 16 colour modes', () => {
  const m0 = mk(0);
  m0.write([17, 129, 17, 0, 12]); m0.write('X');
  assert.equal(m0.getPixel(7, 7), 1); assert.deepEqual(m0.getPixelRGB(7, 7), [255, 255, 255]);
  const m1 = mk(1);
  COLOUR(m1, 2); m1.write('W');
  const wx = [...Array(8).keys()].find((x) => SYSTEM_FONT[87 * 8] & (0x80 >> x));
  assert.equal(m1.getPixel(wx, 0), 2);
  assert.deepEqual(m1.getPixelRGB(wx, 0), [255, 255, 0]);
  assert.equal(m1.getPixel(wx, 7), 0);
  COLOUR(m1, 6); assert.equal(m1.vduVar(155), 2, 'colour limited to NColour');
  const m12 = mk(12);
  assert.equal(m12.vduVar(155), 7, 'default text colour 7 in 16 colour modes');
  COLOUR(m12, 12); COLOUR(m12, 129); m12.write('\xff'); // solid-ish glyph
  const vals = new Set(); for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) vals.add(m12.getPixel(x, y));
  assert.deepEqual([...vals].sort((a, b) => a - b), [1, 12]);
  assert.deepEqual(m12.getPixelRGB(0, 0).length, 3);
});

test('256 colour modes: COLOUR/GCOL + TINT map to pixel bytes (ConvertGCOLToColourNumber)', () => {
  assert.equal(gcolToPixel(0xFF), 255);
  assert.equal(gcolToPixel(0), 0);
  for (let c = 0; c < 256; c++) { const { colour, tint } = pixelToGcol(gcolToPixel(c)); assert.equal(colour | tint, c); }
  const v = mk(13);
  assert.equal(v.vduVar(155), 255, 'default TForeCol is 255 in 256 colour modes');
  COLOUR(v, 3); TINT(v, 0, 0xC0); v.write('\xff');
  const p = v.getPixel(1, 0); // top row of 'ÿ' is 0x66
  assert.equal(p, gcolToPixel(0xC3));
  assert.deepEqual(v.getPixelRGB(1, 0), [255, 51, 51]);
  // graphics colour with tint
  GCOL(v, 0, 12); TINT(v, 2, 0x40);
  PLOT(v, 69, 640, 512);
  assert.equal(px(v, 640, 512), gcolToPixel(12 | 0x40));
  assert.deepEqual(v.readPoint(640, 512), { colour: 12, tint: 64, offScreen: false });
  // GCOL colour masked to 63
  GCOL(v, 0, 255 - 128); TINT(v, 2, 0);
  PLOT(v, 69, 100, 100);
  assert.equal(v.readPoint(100, 100).colour, 63);
  // default palette formula (paldat8): white is 255, bright green = GCOL 12 + TINT 192
  assert.deepEqual(v.readPalette(255).first, 0xFFFFFF10);
  assert.equal(v.readPalette(gcolToPixel(12 | 0xC0)).first, 0x33FF3310);
});

test('GCOL actions: store, OR, AND, EOR, invert, no change, AND NOT, OR NOT', () => {
  const v = mk(12);
  const at = () => px(v, 400, 400);
  const plotWith = (a, c) => { GCOL(v, a, c); PLOT(v, 69, 400, 400); return at(); };
  assert.equal(plotWith(0, 5), 5);
  assert.equal(plotWith(1, 10), 15);
  assert.equal(plotWith(2, 6), 6);
  assert.equal(plotWith(3, 3), 5);
  assert.equal(plotWith(4, 0), 10);
  assert.equal(plotWith(5, 1), 10);
  assert.equal(plotWith(6, 2), 8);
  assert.equal(plotWith(7, 3), 12);
  // plot action 2 (inverse) and 3 (background)
  GCOL(v, 0, 1); GCOL(v, 0, 128 + 9);
  PLOT(v, 70, 400, 400); assert.equal(at(), 3);
  PLOT(v, 71, 400, 400); assert.equal(at(), 9);
  PLOT(v, 68, 400, 400); assert.equal(at(), 9, 'PLOT 68 is a move');
  // transparency (action + 8): foreground plotted where it differs from background
  GCOL(v, 8, 9); PLOT(v, 69, 402, 400); assert.equal(px(v, 402, 400), 0);
  GCOL(v, 8, 3); PLOT(v, 69, 402, 400); assert.equal(px(v, 402, 400), 3);
});

test('VDU 19 palette changes, flashing colours, VDU 20 and OS_ReadPalette', () => {
  const v = mk(12);
  assert.deepEqual(v.readPalette(1), { first: 0x0000FF10, second: 0x0000FF10, r: 255, g: 0, b: 0 });
  const f9 = v.readPalette(9);
  assert.equal(f9.first, 0x0000FF11); assert.equal(f9.second, 0xFFFF0012);
  v.write([19, 1, 4, 0, 0, 0]);
  assert.equal(v.readPalette(1).b, 255);
  v.write([19, 2, 16, 10, 20, 30]);
  assert.deepEqual([v.readPalette(2).r, v.readPalette(2).g, v.readPalette(2).b], [10, 20, 30]);
  GCOL(v, 0, 2); PLOT(v, 69, 0, 0);
  assert.deepEqual(v.getPixelRGB(0, 255), [10, 20, 30]);
  v.setPalette(3, 1, 2, 3); assert.deepEqual([v.readPalette(3).r, v.readPalette(3).g], [1, 2]);
  v.write([19, 0, 24, 255, 0, 0]); assert.equal(v.readPalette(0, 24).r, 255);
  v.write([20]);
  assert.equal(v.readPalette(1).r, 255); assert.equal(v.readPalette(2).g, 255);
  // 256-colour VDU 19 sets 16 entries, keeping bits controlled by the pixel's top bits
  const m = mk(13);
  m.write([19, 0, 16, 0x33, 0x33, 0x33]);
  assert.equal(m.readPalette(0).r, 0x33); assert.equal(m.readPalette(0x10).r, 0xBB);
});

// ---- graphics -----------------------------------------------------------------------------------
test('MOVE/DRAW: both end points plotted, OS units scaled by eig factors', () => {
  const v = mk(12);
  MOVE(v, 0, 0); DRAW(v, 1279, 1023);
  assert.equal(v.getPixel(0, 255), 7); assert.equal(v.getPixel(639, 0), 7);
  let n = 0; for (let y = 0; y < 256; y++) for (let x = 0; x < 640; x++) if (v.getPixel(x, y)) n++;
  assert.equal(n, 640, 'x-major line has one pixel per column');
  const w = mk(12);
  MOVE(w, 100, 100); DRAW(w, 500, 300);
  assert.equal(px(w, 100, 100), 7); assert.equal(px(w, 500, 300), 7);
  // PLOT 13 = draw absolute, excluding the last point; PLOT 5 includes it
  const x = mk(12);
  MOVE(x, 100, 100); PLOT(x, 13, 300, 100);
  assert.equal(px(x, 300, 100), 0); assert.equal(px(x, 298, 100), 7); assert.equal(px(x, 100, 100), 7);
  MOVE(x, 100, 200); PLOT(x, 37, 300, 200); // exclude first point
  assert.equal(px(x, 100, 200), 0); assert.equal(px(x, 102, 200), 7); assert.equal(px(x, 300, 200), 7);
  // vertical and diagonal line pixel counts
  const y = mk(28);
  MOVE(y, 10, 10); DRAW(y, 10, 110); assert.equal(setPixels(y).size, 51);
  const z = mk(28);
  MOVE(z, 0, 0); DRAW(z, 200, 100);
  const s = setPixels(z);
  assert.equal(s.size, 101); assert.ok(s.has('0,0') && s.has('100,50'));
});

test('dotted lines use the VDU 23,6 pattern (default on/off)', () => {
  const v = mk(28);
  MOVE(v, 0, 0); PLOT(v, 21, 38, 0); // 20 pixels
  const xs = [...setPixels(v)].map((s) => +s.split(',')[0]).sort((a, b) => a - b);
  assert.deepEqual(xs, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  const w = mk(28);
  w.write([23, 6, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0]);
  MOVE(w, 0, 0); PLOT(w, 21, 30, 0);
  const ws = [...setPixels(w)].map((s) => +s.split(',')[0]).sort((a, b) => a - b);
  assert.deepEqual(ws, [0, 1, 2, 3, 8, 9, 10, 11]);
});

test('rectangle fill covers both corners exactly', () => {
  const v = mk(12);
  GCOL(v, 0, 3); MOVE(v, 100, 100); PLOT(v, 97, 200, 100); // RECTANGLE FILL 100,100,200,100
  assert.deepEqual(bbox(v), { x0: 50, x1: 150, y0: 25, y1: 50 });
  assert.equal(setPixels(v).size, 101 * 26);
  assert.equal(v.vduVar(138), 300); assert.equal(v.vduVar(139), 200);
});

test('triangle fill includes vertices and edges', () => {
  const v = mk(28);
  MOVE(v, 0, 0); MOVE(v, 200, 0); PLOT(v, 85, 0, 200);
  const s = setPixels(v);
  for (const p of ['0,0', '100,0', '0,100', '50,50', '99,1', '1,99']) assert.ok(s.has(p), p);
  assert.ok(!s.has('51,51') && !s.has('101,0'));
  assert.equal(s.size, (101 * 102) / 2);
});

test('parallelogram fill', () => {
  const v = mk(28);
  MOVE(v, 0, 0); MOVE(v, 200, 0); PLOT(v, 117, 300, 100);
  const s = setPixels(v);
  for (const p of ['0,0', '100,0', '150,50', '50,50', '149,50']) assert.ok(s.has(p), p);
  assert.ok(!s.has('151,50') && !s.has('49,50'));
  const b = bbox(v); assert.deepEqual(b, { x0: 0, x1: 150, y0: 0, y1: 50 });
});

test('circle outline and fill: symmetric, correct radius in square and rectangular pixel modes', () => {
  for (const mode of [28, 12, 1, 2]) {
    const v = mk(mode);
    MOVE(v, 640, 512); PLOT(v, 145, 200, 0); // CIRCLE 640,512,200
    const s = setPixels(v);
    const cx = 640 >> v.xEig, cy = 512 >> v.yEig;
    for (const p of s) {
      const [x, y] = p.split(',').map(Number);
      assert.ok(s.has(`${2 * cx - x},${y}`) && s.has(`${x},${2 * cy - y}`), `mode ${mode}: symmetric ${p}`);
    }
    const b = bbox(v);
    assert.equal(b.x1 - cx, 200 >> v.xEig, `mode ${mode} x radius`);
    assert.equal(b.y1 - cy, 200 >> v.yEig, `mode ${mode} y radius`);
    assert.ok(!s.has(`${cx},${cy}`));
    const f = mk(mode);
    MOVE(f, 640, 512); PLOT(f, 153, 200, 0); // CIRCLE FILL (relative)
    const fs = setPixels(f);
    assert.ok(fs.has(`${cx},${cy}`));
    assert.deepEqual(bbox(f), b);
    for (const p of s) assert.ok(fs.has(p), `fill covers outline ${p}`);
  }
});

test('circular arc, segment and sector', () => {
  const arc = mk(28);
  MOVE(arc, 640, 512); MOVE(arc, 840, 512); PLOT(arc, 165, 640, 712); // quarter arc 0..90 degrees
  const s = setPixels(arc);
  assert.ok(s.has('420,256') && s.has('320,356'));
  for (const p of s) { const [x, y] = p.split(',').map(Number); assert.ok(x >= 320 && y >= 256, p); }
  const sec = mk(28);
  MOVE(sec, 640, 512); MOVE(sec, 840, 512); PLOT(sec, 181, 640, 712);
  const ss = setPixels(sec);
  assert.ok(ss.has('330,266') && ss.has('380,300') && !ss.has('310,266') && !ss.has('330,246'));
  const seg = mk(28);
  MOVE(seg, 640, 512); MOVE(seg, 840, 512); PLOT(seg, 173, 640, 712);
  const sg = setPixels(seg);
  assert.ok(sg.has('410,270') && !sg.has('330,266'), 'segment excludes the triangle next to the centre');
  assert.ok(sg.size < ss.size);
});

test('ellipse outline and fill (centre, x extent, top point with shear)', () => {
  const v = mk(28);
  MOVE(v, 640, 512); MOVE(v, 840, 512); PLOT(v, 205, 640, 612); // ELLIPSE FILL 640,512,200,100
  assert.deepEqual(bbox(v), { x0: 220, x1: 420, y0: 206, y1: 306 });
  const o = mk(28);
  MOVE(o, 640, 512); MOVE(o, 840, 512); PLOT(o, 197, 640, 612);
  const s = setPixels(o);
  assert.ok(s.has('420,256') && s.has('220,256') && s.has('320,306') && s.has('320,206'));
  assert.ok(!s.has('320,256'));
  // sheared: top point to the right of the centre
  const sh = mk(28);
  MOVE(sh, 640, 512); MOVE(sh, 740, 512); PLOT(sh, 205, 740, 612);
  const b = bbox(sh);
  assert.equal(b.y1, 306); assert.ok(b.x1 > 370);
});

test('flood fill and line fills', () => {
  const v = mk(27);
  GCOL(v, 0, 1);
  MOVE(v, 100, 100); DRAW(v, 300, 100); DRAW(v, 300, 300); DRAW(v, 100, 300); DRAW(v, 100, 100);
  GCOL(v, 0, 2); PLOT(v, 133, 200, 200); // FILL 200,200 (flood over background)
  assert.equal(px(v, 200, 200), 2); assert.equal(px(v, 102, 102), 2); assert.equal(px(v, 298, 298), 2);
  assert.equal(px(v, 100, 200), 1, 'boundary unchanged'); assert.equal(px(v, 50, 50), 0, 'outside unfilled');
  // PLOT 77: fill left & right to non-background
  const w = mk(27);
  GCOL(w, 0, 3); MOVE(w, 100, 50); DRAW(w, 100, 150); MOVE(w, 500, 50); DRAW(w, 500, 150);
  GCOL(w, 0, 4); PLOT(w, 77, 300, 100);
  assert.equal(px(w, 102, 100), 4); assert.equal(px(w, 498, 100), 4); assert.equal(px(w, 100, 100), 3);
  assert.equal(px(w, 502, 100), 0);
  assert.equal(w.vduVar(142), 51, 'OldCs = left end'); assert.equal(w.vduVar(144), 249, 'ICursor = right end');
  // PLOT 93: fill right to background
  const x = mk(27);
  GCOL(x, 0, 5); MOVE(x, 100, 100); DRAW(x, 300, 100);
  GCOL(x, 0, 6); PLOT(x, 93, 200, 100);
  assert.equal(px(x, 200, 100), 6); assert.equal(px(x, 300, 100), 6); assert.equal(px(x, 302, 100), 0); assert.equal(px(x, 198, 100), 5);
  // flood to foreground (PLOT 141): fills everything that isn't the foreground colour
  const y = mk(27);
  GCOL(y, 0, 7); MOVE(y, 0, 400); DRAW(y, 1279, 400);
  PLOT(y, 141, 10, 10);
  assert.equal(px(y, 10, 10), 7); assert.equal(px(y, 10, 600), 0);
});

test('graphics window clipping, CLG and origin', () => {
  const v = mk(12);
  v.write([24, ...w16(200), ...w16(200), ...w16(599), ...w16(599)]);
  assert.deepEqual([v.vduVar(128), v.vduVar(129), v.vduVar(130), v.vduVar(131)], [100, 50, 299, 149]);
  MOVE(v, 0, 0); DRAW(v, 1279, 1023);
  const b = bbox(v);
  assert.ok(b.x0 >= 100 && b.x1 <= 299 && b.y0 >= 50 && b.y1 <= 149);
  PLOT(v, 69, 100, 100); assert.equal(px(v, 100, 100), 0);
  GCOL(v, 0, 128 + 4); v.write([16]);
  assert.equal(px(v, 200, 200), 4); assert.equal(px(v, 598, 598), 4); assert.equal(px(v, 198, 200), 0); assert.equal(px(v, 600, 600), 0);
  // invalid window ignored
  v.write([24, ...w16(600), ...w16(0), ...w16(100), ...w16(100)]);
  assert.equal(v.vduVar(128), 100);
  // origin
  const o = mk(12);
  o.write([29, ...w16(640), ...w16(512)]);
  PLOT(o, 69, 0, 0); assert.equal(o.getPixel(320, 255 - 128), 7);
  PLOT(o, 69, -640, -512); assert.equal(o.getPixel(0, 255), 7);
  assert.deepEqual([o.vduVar(136), o.vduVar(137)], [640, 512]);
  assert.deepEqual(o.graphicsCursors(), { oldX: 0, oldY: 0, curX: -640, curY: -512 });
  o.write([29, 0, 0, 0, 0]);
  assert.deepEqual([o.vduVar(138), o.vduVar(139)], [0, 0], 'external cursor follows the origin change');
});

test('POINT / OS_ReadPoint including off-screen -1', () => {
  const v = mk(12);
  GCOL(v, 0, 9); PLOT(v, 69, 300, 300);
  assert.deepEqual(v.readPoint(300, 300), { colour: 9, tint: 0, offScreen: false });
  assert.equal(v.readPoint(-10, -10).colour, -1);
  assert.equal(v.readPoint(1280, 0).colour, -1);
  assert.equal(v.readPoint(0, 1024).colour, -1);
  v.write([24, 0, 0, 0, 0, ...w16(100), ...w16(100)]);
  assert.equal(v.readPoint(300, 300).colour, -1, 'outside graphics window counts as off screen');
  assert.equal(mk(7).readPoint(0, 0).colour, -1, 'non-graphics mode');
});

test('CLS and CLG use text / graphics background colours', () => {
  const v = mk(12);
  COLOUR(v, 128 + 5); v.write([12]);
  assert.equal(v.getPixel(0, 0), 5); assert.equal(v.getPixel(639, 255), 5);
  GCOL(v, 0, 128 + 6); v.write([16]);
  assert.equal(v.getPixel(0, 0), 6);
  GCOL(v, 3, 128 + 1); v.write([16]); // CLG uses the background GCOL action (EOR)
  assert.equal(v.getPixel(0, 0), 7);
});

test('block copy and move (PLOT 184-191)', () => {
  const v = mk(27);
  GCOL(v, 0, 3); MOVE(v, 100, 100); PLOT(v, 101, 199, 199);
  MOVE(v, 100, 100); MOVE(v, 199, 199); PLOT(v, 190, 400, 100); // copy absolute to 400,100
  assert.equal(px(v, 400, 100), 3); assert.equal(px(v, 498, 198), 3); assert.equal(px(v, 100, 100), 3);
  assert.equal(px(v, 500, 200), 0); assert.equal(px(v, 398, 100), 0);
  MOVE(v, 100, 100); MOVE(v, 199, 199); PLOT(v, 189, 700, 100); // move absolute
  assert.equal(px(v, 700, 100), 3); assert.equal(px(v, 100, 100), 0, 'source erased');
  // overlapping move to the right
  const w = mk(27);
  GCOL(w, 0, 3); MOVE(w, 100, 100); PLOT(w, 101, 199, 199);
  GCOL(w, 0, 4); PLOT(w, 69, 100, 100);
  MOVE(w, 100, 100); MOVE(w, 199, 199); PLOT(w, 189, 150, 100);
  assert.equal(px(w, 150, 100), 4); assert.equal(px(w, 248, 198), 3); assert.equal(px(w, 250, 198), 0);
  assert.equal(px(w, 100, 100), 0); assert.equal(px(w, 148, 150), 0);
});

test('VDU 5 text at the graphics cursor', () => {
  const v = mk(12);
  v.write([5]);
  assert.equal(v.vduStatus() & 0x20, 0x20);
  GCOL(v, 0, 2);
  MOVE(v, 100, 500); v.write('A');
  // top-left of the glyph at the graphics cursor
  for (let r = 0; r < 8; r++) for (let x = 0; x < 8; x++) {
    const bit = (SYSTEM_FONT[65 * 8 + r] >> (7 - x)) & 1;
    assert.equal(v.getPixel(50 + x, 255 - 125 + r), bit ? 2 : 0, `${x},${r}`);
  }
  assert.deepEqual([v.vduVar(138), v.vduVar(139)], [116, 500], 'cursor advances by 8 pixels');
  // only the foreground pixels of a VDU 5 character are plotted
  GCOL(v, 0, 5); MOVE(v, 0, 1023); PLOT(v, 101, 100, 900);
  GCOL(v, 0, 2); MOVE(v, 0, 1023); v.write('B');
  const bx = [...Array(8).keys()].find((x) => SYSTEM_FONT[66 * 8] & (0x80 >> x));
  const nx = [...Array(8).keys()].find((x) => !(SYSTEM_FONT[66 * 8] & (0x80 >> x)));
  assert.equal(v.getPixel(bx, 0), 2); assert.equal(v.getPixel(nx, 0), 5);
  // BS + delete erases with the background colour
  GCOL(v, 0, 128 + 3); MOVE(v, 300, 300); v.write('C'); v.write([127]);
  assert.equal(px(v, 300, 300), 3);
  v.write([4]); assert.equal(v.vduStatus() & 0x20, 0);
  // VDU 5 disabled in non-graphics modes
  const t = mk(7); t.write([5]); assert.equal(t.vduStatus() & 0x20, 0);
  // character size (VDU 23,17,7)
  const s = mk(28);
  s.write([5]); s.write([23, 17, 7, 6, 16, 0, 16, 0, 0, 0]);
  MOVE(s, 0, 1023); s.write('I');
  assert.equal(s.vduVar(162), 16); assert.equal(s.vduVar(164), 16);
  assert.deepEqual([s.vduVar(138), s.vduVar(139)], [32, 1022], 'external cursor recomputed from pixels (IEG)');
});

test('VDU 23 character redefinition and OS_Word 10', () => {
  const v = mk(12);
  const def = [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81];
  v.write([23, 240, ...def]);
  assert.deepEqual([...v.osWordReadCharDef(240)], def);
  v.write([240]);
  for (let r = 0; r < 8; r++) for (let x = 0; x < 8; x++) assert.equal(v.getPixel(x, r) ? 1 : 0, (def[r] >> (7 - x)) & 1);
  assert.equal(v.textLines()[0][0], '\xf0');
  v.write([8]); assert.equal(v.readCharAtCursor().char, 240);
  assert.deepEqual([...v.osWordReadCharDef(6)], [0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]);
});

test('ECF patterns: default, simple (23,12) and GCOL 16..80', () => {
  const v = mk(12);
  v.write([23, 12, 1, 2, 1, 2, 1, 2, 1, 2]); // ECF 1: colours 1/2 alternating horizontally
  GCOL(v, 16, 0); MOVE(v, 0, 0); PLOT(v, 101, 63, 63);
  const row = []; for (let x = 0; x < 8; x++) row.push(v.getPixel(x, 255));
  assert.deepEqual(row, [1, 2, 1, 2, 1, 2, 1, 2]);
  // mode 0 default ECF 2 (grey = 2 black, 2 white)
  const m = mk(0);
  GCOL(m, 32, 0); MOVE(m, 0, 0); PLOT(m, 101, 63, 63);
  let ones = 0; for (let y = 255 - 7; y <= 255; y++) for (let x = 0; x < 8; x++) ones += m.getPixel(x, y);
  assert.equal(ones, 32);
});

test('text cursor shape and VDU 23,1', () => {
  const v = mk(12);
  assert.equal(v.cursorStart, 7); assert.equal(v.cursorEnd, 8);
  v.write([23, 1, 0, 0, 0, 0, 0, 0, 0, 0]); assert.equal(v._cursorRects(0).length, 0);
  v.write([23, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  v.write([23, 0, 10, 0x40, 0, 0, 0, 0, 0, 0]); assert.equal(v.cursorStart, 0);
  v.write([23, 0, 11, 7, 0, 0, 0, 0, 0, 0]); assert.equal(v.cursorEnd, 8);
  const m7 = mk(7); assert.equal(m7.cursorStart, 9); assert.equal(m7.cursorEnd, 10);
  const m3 = mk(3); assert.equal(m3.cursorStart, 7); assert.equal(m3.cursorEnd, 10);
});

test('gap modes: 10 pixel text rows; BBC gap modes leave the gap in colour 2', () => {
  const v = mk(3);
  assert.equal(v.rowMult, 10);
  v.write('Hello'); v.newLine(); v.write('World');
  assert.deepEqual(v.textLines().slice(0, 2).map((s) => s.trim()), ['Hello', 'World']);
  assert.equal(v.getPixel(0, 8), 2); assert.equal(v.getPixel(0, 9), 2);
  assert.deepEqual(v.getPixelRGB(0, 8), [0, 0, 0]);
  const w = mk(14);
  w.write([17, 129, 12]);
  assert.equal(w.getPixel(0, 8), 1);
  w.write('X'); assert.equal(w.getPixel(1, 9), 1);
});

test('MODE 7 teletext: map, control codes, double height, textLines', () => {
  const v = mk(7);
  v.write('\x81Red\x82Green');
  assert.equal(v.textLines()[0].slice(0, 9), ' Red Gree');
  // red text: pixel colour 1 somewhere in cells 1-3
  let reds = 0; for (let y = 0; y < 10; y++) for (let x = 8; x < 32; x++) if (v.getPixel(x, y) === 1) reds++;
  assert.ok(reds > 10);
  // '#' is displayed as '#' but stored swapped, and read back correctly
  v.write([31, 0, 1]); v.write('#');
  v.write([31, 0, 1]); assert.equal(v.readCharAtCursor().char, 35);
  // double height: the row below becomes a bottom row
  v.write([31, 0, 3]); v.write('\x8dBig');
  assert.equal(v.ttxBottom[4], 1);
  v.write([31, 0, 4]); v.write('\x8dBig');
  // top and bottom halves differ but together look like a tall 'B'
  let top = 0, bot = 0;
  for (let y = 0; y < 10; y++) for (let x = 8; x < 16; x++) { if (v.getPixel(x, 30 + y)) top++; if (v.getPixel(x, 40 + y)) bot++; }
  assert.ok(top > 10 && bot > 10);
  // new background
  v.write([31, 0, 6]); v.write('\x84\x9d\x87X');
  assert.equal(v.getPixel(8 * 2 + 0, 60), 4, 'blue background from new background code');
  // COLOUR ignored, PLOT ignored
  COLOUR(v, 1); PLOT(v, 69, 0, 0); assert.equal(v.getPixel(0, 249), 0);
  // scrolling keeps the map in step
  for (let i = 0; i < 30; i++) v.write(`row ${i}\r\n`);
  assert.equal(v.textLines()[23].trim(), 'row 29');
  assert.equal(v.textLines()[24].trim(), '');
});

test('OS_Byte 135 read character and VDU status', () => {
  const v = mk(28);
  v.write('ABC'); v.write([31, 1, 0]);
  assert.deepEqual(v.readCharAtCursor(), { char: 66, mode: 28 });
  COLOUR(v, 1); v.write([31, 5, 0]); v.write('Z'); v.write([8]);
  assert.equal(v.readCharAtCursor().char, 90);
  COLOUR(v, 129); assert.equal(v.readCharAtCursor().char, 0, 'unrecognised with a different background');
});

test('VDU 23,7 scrolls and VDU 23,8 clears blocks', () => {
  const v = mk(12);
  v.write('abcdefgh');
  v.write([23, 7, 0, 0, 0, 0, 0, 0, 0, 0]); // scroll window right by a char
  assert.equal(v.textLines()[0].slice(0, 9), ' abcdefgh');
  v.write([23, 7, 1, 1, 0, 0, 0, 0, 0, 0]); // scroll screen left
  assert.equal(v.textLines()[0].slice(0, 8), 'abcdefgh');
  v.write([23, 7, 0, 2, 0, 0, 0, 0, 0, 0]); // down
  assert.equal(v.textLines()[1].slice(0, 8), 'abcdefgh');
  v.write([23, 7, 0, 3, 0, 0, 0, 0, 0, 0]); // up
  assert.equal(v.textLines()[0].slice(0, 8), 'abcdefgh');
  v.write([23, 8, 0, 0, 2, 0, 5, 0, 0, 0]); // clear from (2,0) to before (5,0)
  assert.equal(v.textLines()[0].slice(0, 8), 'ab   fgh');
});

test('graphics cursor bookkeeping (OldCs/OlderCs/ICursor/NewPt) and OS_Word 13', () => {
  const v = mk(28);
  MOVE(v, 10, 20); MOVE(v, 30, 40); PLOT(v, 0, 2, 4);
  assert.deepEqual([v.vduVar(140), v.vduVar(141)], [5, 10]);   // OlderCs (internal)
  assert.deepEqual([v.vduVar(142), v.vduVar(143)], [15, 20]);  // OldCs
  assert.deepEqual([v.vduVar(144), v.vduVar(145)], [16, 22]);  // ICursor
  assert.deepEqual([v.vduVar(138), v.vduVar(139)], [32, 44]);  // external
  assert.deepEqual(v.graphicsCursors(), { oldX: 30, oldY: 40, curX: 32, curY: 44 });
});

test('rendering to a canvas-like object', () => {
  const puts = [];
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img, x, y, dx, dy, dw, dh) => puts.push([dy, dh]),
  };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const v = new VDU({ canvas, mode: 12 });
  assert.equal(canvas.width, 640); assert.equal(canvas.style.width, '640px'); assert.equal(canvas.style.height, '512px');
  v.render(); assert.equal(puts.length, 1); assert.deepEqual(puts[0], [0, 256]);
  v.render(); assert.equal(puts.length, 1, 'nothing to do');
  v.write([31, 0, 10]); v.write('x');
  v.render(); assert.equal(puts.length, 2); assert.ok(puts[1][0] <= 80 && puts[1][0] + puts[1][1] >= 88);
  v.write([22, 28]); assert.equal(canvas.height, 480); assert.equal(canvas.style.width, '640px');
});

test('performance: thousands of lines and graphics primitives are fast', () => {
  const v = mk(28);
  let t = performance.now();
  for (let i = 0; i < 5000; i++) v.write(`Line ${i} of text for the performance test\r\n`);
  const text = performance.now() - t;
  t = performance.now();
  for (let i = 0; i < 2000; i++) { MOVE(v, i % 1280, 0); DRAW(v, 1279 - (i % 1280), 959); }
  for (let i = 0; i < 500; i++) { MOVE(v, 640, 480); PLOT(v, 157, 640 + (i % 400), 480); }
  const gfx = performance.now() - t;
  assert.ok(text < 1500, `text ${text}ms`); assert.ok(gfx < 1500, `graphics ${gfx}ms`);
});
