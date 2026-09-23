// BASIC graphics statements through the headless VDU driver (pixels checked directly).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BasicMachine } from '../../src/basic/machine.js';
import { VDU } from '../../src/basic/vdu.js';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'programs');
const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');

async function gfx(src, opts = {}) {
  const vdu = new VDU({ mode: opts.mode ?? 12 });
  let out = '';
  const m = new BasicMachine({ vdu, seed: 7, onOutput: (c) => { if (c >= 32 || c === 10) out += String.fromCharCode(c); } });
  for (const k of opts.input || '') m.keyPress(k.charCodeAt(0));
  await m.load(src);
  await m.run();
  return { vdu, m, out };
}
/** pixel at OS coordinates (x,y) in the current mode */
function px(vdu, x, y) {
  const xe = vdu.modeVar(4), ye = vdu.modeVar(5);
  return vdu.getPixel(x >> xe, vdu.height - 1 - (y >> ye));
}

test('MODE, CLS, COLOUR and text output', async () => {
  const { vdu } = await gfx(lines('MODE 1', 'COLOUR 2:PRINT "Yellow text"', 'PRINT TAB(5,3);"at 5,3"', 'PRINT POS;",";VPOS'));
  assert.equal(vdu.mode, 1);
  const t = vdu.textLines();
  assert.equal(t[0].trimEnd(), 'Yellow text');
  assert.equal(t[3].trimEnd(), '     at 5,3');
  assert.equal(t[4].trimEnd(), '         0,4'); // POS/VPOS evaluated before printing
  // text colour 2 in MODE 1 (4 colours) is yellow
  const [r, g, b] = vdu.getPixelRGB(1, 1);
  assert.deepEqual([r > 200, g > 200, b < 50], [true, true, true]);
});

test('GCOL, MOVE/DRAW, RECTANGLE FILL, CIRCLE FILL, POINT()', async () => {
  const { vdu, out } = await gfx(lines(
    'MODE 12:GCOL 0,1',
    'RECTANGLE FILL 100,100,200,100',
    'GCOL 2:CIRCLE FILL 800,500,100',
    'GCOL 4:MOVE 0,1000:DRAW 1279,1000',
    'GCOL 3:PLOT 69,640,900',
    'PRINT POINT(150,150);POINT(800,500);POINT(640,1000);POINT(640,900);POINT(10,10);POINT(-10,-10)'));
  assert.equal(px(vdu, 150, 150), 1);
  assert.equal(px(vdu, 800, 500), 2);
  assert.equal(px(vdu, 800, 590), 2);
  assert.equal(px(vdu, 800, 620), 0);
  assert.equal(px(vdu, 640, 1000), 4);
  assert.ok(out.endsWith('         12430-1\n'));
});

test('GCOL actions (EOR) and CLG with background colour', async () => {
  const { vdu } = await gfx(lines('MODE 9:GCOL 0,129:CLG', 'GCOL 3,6:RECTANGLE FILL 0,0,100,100', 'GCOL 3,6:RECTANGLE FILL 50,50,100,100'));
  assert.equal(px(vdu, 500, 500), 1);        // background colour 1 after CLG
  assert.equal(px(vdu, 20, 20), 1 ^ 6);      // EOR once
  assert.equal(px(vdu, 70, 70), 1);          // EORed twice
});

test('256 colour GCOL with TINT', async () => {
  const { vdu } = await gfx(lines('MODE 28:GCOL 63 TINT 192:RECTANGLE FILL 0,0,50,50', 'GCOL 3 TINT 0:RECTANGLE FILL 100,0,50,50', 'COLOUR 12:PRINT TINT(0,0);" ";POINT(0,0);" ";POINT(110,10)'));
  assert.deepEqual(vdu.getPixelRGB(2, 478), [255, 255, 255]);
  assert.deepEqual(vdu.getPixelRGB(52, 478), [204, 0, 0]);
});

test('VDU 19 palette and VDU 23 character definition', async () => {
  const { vdu } = await gfx(lines('MODE 12', 'VDU 19,1,16,10,20,30', 'GCOL 1:RECTANGLE FILL 0,0,20,20', 'VDU 23,240,255,129,129,129,129,129,129,255', 'PRINT CHR$240'));
  assert.deepEqual(vdu.getPixelRGB(1, 254), [10, 20, 30]);
  // character 240 drawn as a box at the top-left
  assert.equal(vdu.getPixel(0, 0), 7);
  assert.equal(vdu.getPixel(3, 3), 0);
  assert.equal(vdu.getPixel(7, 7), 7);
});

test('ORIGIN, graphics window clipping, ELLIPSE, LINE, FILL', async () => {
  const { vdu } = await gfx(lines(
    'MODE 12:ORIGIN 640,512',
    'VDU 24,-200;-200;200;200;',
    'GCOL 5:RECTANGLE FILL -600,-600,1200,1200',
    'VDU 26:ORIGIN 640,512', // VDU 26 also clears the origin
    'GCOL 6:ELLIPSE FILL -500,300,100,50',
    'GCOL 1:LINE -600,-400,600,-400',
    'GCOL 2:MOVE 400,-300:DRAW 500,-300:DRAW 450,-200:DRAW 400,-300:FILL 450,-270'));
  assert.equal(px(vdu, 640, 512), 5);
  assert.equal(px(vdu, 640 + 250, 512), 0);   // clipped
  assert.equal(px(vdu, 640 - 500, 512 + 300), 6);
  assert.equal(px(vdu, 640 - 500 + 90, 512 + 300), 6);
  assert.equal(px(vdu, 640 - 500, 512 + 300 + 40), 6);
  assert.equal(px(vdu, 640 - 500, 512 + 300 + 70), 0);
  assert.equal(px(vdu, 640, 512 - 400), 1);
  assert.equal(px(vdu, 640 + 450, 512 - 270), 2);
});

test('VDU 5 text at the graphics cursor and MODE 7', async () => {
  const { vdu } = await gfx(lines('MODE 12:VDU 5:MOVE 0,1023:GCOL 3:PRINT "G";:VDU 4'));
  assert.equal(vdu.getPixel(2, 1), 3);
  const r = await gfx(lines('MODE 7', 'PRINT CHR$(129);"Red teletext"'));
  assert.equal(r.vdu.mode, 7);
  assert.match(r.vdu.textLines()[0], /Red teletext/);
});

test('demo programs run and draw', async () => {
  const mandel = await gfx(fs.readFileSync(path.join(dir, 'mandel.bas'), 'latin1'));
  assert.equal(mandel.vdu.mode, 28);
  assert.deepEqual(mandel.vdu.getPixelRGB(400, 240), [0, 0, 0]);      // inside the set
  assert.notDeepEqual(mandel.vdu.getPixelRGB(10, 400), [0, 0, 0]);  // outside
  const circles = await gfx(fs.readFileSync(path.join(dir, 'circles.bas'), 'latin1'));
  assert.equal(px(circles.vdu, 640 + 30, 512 + 10) !== 0, true);
  const spiral = await gfx(fs.readFileSync(path.join(dir, 'spiral.bas'), 'latin1'));
  let lit = 0;
  for (let y = 0; y < 480; y += 4) for (let x = 0; x < 640; x += 4) if (spiral.vdu.getPixel(x, y)) lit++;
  assert.ok(lit > 500);
  const colours = await gfx(fs.readFileSync(path.join(dir, 'colours.bas'), 'latin1'));
  assert.deepEqual(colours.vdu.getPixelRGB(639, 0), [255, 255, 255]);
  const sieve = await gfx(fs.readFileSync(path.join(dir, 'sieve.bas'), 'latin1'));
  assert.match(sieve.out, /1899 primes/);
  const ball = await gfx(fs.readFileSync(path.join(dir, 'ball.bas'), 'latin1'), { input: ' ' });
  assert.match(ball.out, /Done\./);
  let guesses = ''; for (let i = 1; i <= 100; i++) guesses += i + '\r';
  const guess = await gfx(fs.readFileSync(path.join(dir, 'guess.bas'), 'latin1'), { input: guesses });
  assert.match(guess.out, /Correct! You took \d+ tries\./);
});
