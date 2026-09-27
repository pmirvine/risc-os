// Sprites on a program's own VDU (src/basic/sprites.js): OS_SpriteOp on user and system areas,
// PLOT &E8-&EF and VDU 23,27, *SGet/*SChoose/*SLoad/*SSave/*SList, *ScreenSave/*ScreenLoad,
// output to a sprite, the screen -> sprite file export; mode selectors and mode strings; MODE 7
// on a VDU with its own clock. Pixels are checked directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BasicMachine } from '../../src/basic/machine.js';
import { VDU } from '../../src/basic/vdu.js';
import { MemFS } from '../../src/basic/memfs.js';
import { screenToSpriteFile, screenSprite } from '../../src/basic/sprites.js';
import { readSpriteFile } from '../../src/apps/Paint/spritefile.js';

const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');

async function gfx(src, opts = {}) {
  const vdu = opts.vdu ?? new VDU({ mode: opts.mode ?? 12 });
  let out = '';
  const m = new BasicMachine({ vdu, fs: opts.fs, seed: 7, onOutput: (c) => { if (c >= 32 || c === 10) out += String.fromCharCode(c); } });
  await m.load(src);
  const r = await m.run();
  if (r?.reason === 'error') throw new Error(`${r.error?.message} at line ${r.error?.erl}\n${out}`);
  return { vdu, m, out };
}
/** pixel value at OS coordinates (x, y) */
function px(vdu, x, y) { return vdu.getPixel(x >> vdu.xEig, vdu.height - 1 - (y >> vdu.yEig)); }
const rgb = (vdu, x, y) => vdu.getPixelRGB(x >> vdu.xEig, vdu.height - 1 - (y >> vdu.yEig));

const AREA = ['DIM area% 40000:!area%=40000:area%!4=0:area%!8=16:area%!12=16'];

test('get a sprite from the screen into a user area and put it elsewhere (MODE 12)', async () => {
  const { vdu, out } = await gfx(lines(...AREA,
    'MODE 12:GCOL 1:RECTANGLE FILL 0,0,63,31:GCOL 2:RECTANGLE FILL 64,0,63,31',
    'SYS "OS_SpriteOp",16+256,area%,"blk",0,0,0,127,31',
    'SYS "OS_SpriteOp",40+256,area%,"blk" TO ,,,w%,h%,m%,mode%',
    'PRINT w%;",";h%;",";m%;",";mode%',
    'CLG:SYS "OS_SpriteOp",34+256,area%,"blk",400,600,0',
    'SYS "OS_SpriteOp",8+256,area% TO ,,,n%',
    'PRINT "n=";n%'));
  assert.match(out, /64,8,0,12/);          // 128 x 32 OS units in MODE 12 = 64 x 8 pixels, no mask
  assert.match(out, /n=1/);
  assert.equal(px(vdu, 400, 600), 1);
  assert.equal(px(vdu, 400 + 70, 600 + 20), 2);
  assert.equal(px(vdu, 400 + 130, 600), 0);  // just past the sprite
  assert.equal(px(vdu, 0, 0), 0);            // CLG cleared the original
});

test('PLOT &E8-&EF with VDU 23,27 and *SGet / *SChoose on the system sprite area', async () => {
  const { vdu, out, m } = await gfx(lines(
    'MODE 28:GCOL 9:RECTANGLE FILL 0,0,31,31',
    'MOVE 0,0:MOVE 31,31:VDU 23,27,1,7,0,0,0,0,0,0',           // SGet sprite "7"
    'GCOL 12:RECTANGLE FILL 100,100,31,31:MOVE 100,100:MOVE 131,131:*SGet other',
    'CLG',
    'VDU 23,27,0,7,0,0,0,0,0,0:GCOL 0,0:PLOT &ED,300,300',       // plot "7" with the foreground action (store)
    '*SChoose other',
    'PLOT &ED,500,300',
    'GCOL 3,0:PLOT &ED,500,300',                     // EOR it again: gone
    'PLOT &E8,700,300',                              // no effect
    '*SList'));
  assert.equal(vdu.readPoint(300, 300).colour, 9);   // the GCOL 9 square, pixel for pixel
  assert.equal(vdu.readPoint(330, 330).colour, 9);
  assert.equal(px(vdu, 340, 300), 0);
  assert.equal(px(vdu, 500, 300), 0);             // stored then EORed away
  assert.equal(px(vdu, 700, 300), 0);
  assert.match(out, /7\s*other/);
  assert.deepEqual(m.sprites.systemNames(), ['7', 'other']);
});

test('GCOL actions and masks when putting sprites; PLOT &EB plots the mask in the background colour', async () => {
  const { vdu } = await gfx(lines(...AREA,
    'MODE 12',
    'SYS "OS_SpriteOp",15+256,area%,"m",0,4,4,12',                  // 4x4 MODE 12 sprite, colour 0
    'FOR y%=0 TO 3:FOR x%=0 TO 3:SYS "OS_SpriteOp",42+256,area%,"m",x%,y%,3:NEXT:NEXT',
    'SYS "OS_SpriteOp",29+256,area%,"m"',                            // mask: all solid
    'SYS "OS_SpriteOp",44+256,area%,"m",0,0,0',                      // bottom-left pixel transparent
    'SYS "OS_SpriteOp",43+256,area%,"m",0,0 TO ,,,,,t%',
    'SYS "OS_SpriteOp",41+256,area%,"m",1,1 TO ,,,,,c%',
    'VDU 29,0;0;',
    'GCOL 5:RECTANGLE FILL 0,0,400,400',
    'SYS "OS_SpriteOp",34+256,area%,"m",0,0,8',                     // masked store
    'SYS "OS_SpriteOp",34+256,area%,"m",100,0,0',                   // unmasked store
    'SYS "OS_SpriteOp",34+256,area%,"m",200,0,1',                   // OR: 5 OR 3 = 7
    'SYS "OS_SpriteOp",34+256,area%,"m",300,0,3',                   // EOR: 5 EOR 3 = 6
    'PRINT t%;c%'));
  assert.equal(px(vdu, 0, 0), 5);            // transparent pixel left alone
  assert.equal(px(vdu, 2, 4), 3);
  assert.equal(px(vdu, 100, 0), 3);          // unmasked: the "transparent" pixel is plotted (colour 3)
  assert.equal(px(vdu, 204, 4), 7);
  assert.equal(px(vdu, 304, 4), 6);
  const { vdu: v2 } = await gfx(lines(...AREA,
    'MODE 12:SYS "OS_SpriteOp",15+256,area%,"m",0,4,4,12:SYS "OS_SpriteOp",29+256,area%,"m"',
    'SYS "OS_SpriteOp",44+256,area%,"m",0,0,0',
    'GCOL 0,4+128:SYS "OS_SpriteOp",49+256,area%,"m",0,0',           // PlotMask in background colour 4
    'SYS "OS_SpriteOp",24+256,area%,"m"'));
  assert.equal(px(v2, 0, 0), 0);
  assert.equal(px(v2, 2, 4), 4);
});

test('a sprite of another depth is drawn in the nearest colours of the current mode', async () => {
  const { vdu } = await gfx(lines(...AREA,
    'MODE 12:GCOL 1:RECTANGLE FILL 0,0,63,63:GCOL 2:RECTANGLE FILL 64,0,63,63',   // red, green
    'SYS "OS_SpriteOp",16+256,area%,"rg",0,0,0,127,63',
    'MODE 28:SYS "OS_SpriteOp",34+256,area%,"rg",200,200,0',
    'MODE 12:VDU 19,1,16,0,0,255:SYS "OS_SpriteOp",34+256,area%,"rg",200,200,0'));
  // MODE 12 sprite (4bpp) in MODE 12: pixel values kept (colour 1, now blue in the palette)
  assert.equal(px(vdu, 200, 200), 1);
  const { vdu: v28 } = await gfx(lines(...AREA,
    'MODE 12:GCOL 1:RECTANGLE FILL 0,0,63,63:GCOL 2:RECTANGLE FILL 64,0,63,63',
    'SYS "OS_SpriteOp",16+256,area%,"rg",0,0,0,127,63',
    'MODE 28:SYS "OS_SpriteOp",34+256,area%,"rg",200,200,0'));
  assert.equal(px(v28, 200, 200), v28.nearest(0xFF0000));
  assert.equal(px(v28, 280, 200), v28.nearest(0x00FF00));
  assert.deepEqual(rgb(v28, 200, 200), [0xDD, 0x11, 0x11]);   // the 256 colour palette's nearest red
  // PutSpriteScaled: the MODE 12 sprite (eig 1,2) in MODE 28 (eig 1,1) is twice as many pixels high
  const { vdu: vs } = await gfx(lines(...AREA,
    'MODE 12:GCOL 1:RECTANGLE FILL 0,0,63,63',
    'SYS "OS_SpriteOp",16+256,area%,"r",0,0,0,63,63',
    'MODE 28:SYS "OS_SpriteOp",52+256,area%,"r",0,0,0,0,0',
    'DIM sc% 16:!sc%=2:sc%!4=2:sc%!8=1:sc%!12=1:SYS "OS_SpriteOp",52+256,area%,"r",400,0,0,sc%,0'));
  const red = vs.nearest(0xFF0000);
  assert.equal(px(vs, 0, 60), red);
  assert.equal(px(vs, 0, 66), 0);
  assert.equal(px(vs, 400 + 120, 120), red);
  assert.equal(px(vs, 400 + 130, 130), 0);
});

test('*ScreenSave and *ScreenLoad round trip (with the palette)', async () => {
  const fs = new MemFS();
  const { vdu } = await gfx(lines(
    'MODE 12:GCOL 3:CIRCLE FILL 640,512,200:GCOL 9:RECTANGLE FILL 0,0,100,100',
    'VDU 19,3,16,10,20,30',
    '*ScreenSave $.Shot',
    'VDU 20:CLG',
    '*ScreenLoad $.Shot'), { fs });
  const f = await fs.readFile('$.Shot');
  assert.equal(f.type, 0xFF9);
  const sf = readSpriteFile(f.data);
  assert.equal(sf.sprites.length, 1);
  const s = sf.sprites[0];
  assert.equal(s.name, 'screendump');
  assert.equal(s.mode, 12);
  assert.deepEqual([s.w, s.h], [640, 256]);
  assert.equal(s.pal.length, 32);            // 16 colours x 2 flash states
  assert.equal(px(vdu, 640, 512), 3);
  assert.equal(px(vdu, 50, 50), 9);
  assert.equal(px(vdu, 1000, 900), 0);
  assert.deepEqual(vdu.getPixelRGB(320, 128), [10, 20, 30]);  // palette restored by ScreenLoad
});

test('*SSave / *SLoad / *SList / *SNew and OS_SpriteOp file operations', async () => {
  const fs = new MemFS();
  const { out, m } = await gfx(lines(...AREA,
    'MODE 28:GCOL 9:RECTANGLE FILL 0,0,31,31:MOVE 0,0:MOVE 15,15:*SGet one',
    'MOVE 0,0:MOVE 31,31:*SGet two',
    '*SSave $.Sprs',
    '*SNew',
    '*SList',
    '*SLoad $.Sprs',
    '*SList',
    'SYS "OS_SpriteOp",10+256,area%,"$.Sprs"',
    'SYS "OS_SpriteOp",40+256,area%,"two" TO ,,,w%,h%',
    'PRINT "two ";w%;"x";h%',
    '*SInfo'), { fs });
  assert.match(out, /No system sprites defined/);
  assert.match(out, /one\s*two/);
  assert.match(out, /two 16x16/);
  assert.match(out, /2 system sprite\(s\) defined/);
  assert.deepEqual(m.sprites.systemNames(), ['one', 'two']);
  const f = await fs.readFile('$.Sprs');
  assert.equal(readSpriteFile(f.data).sprites.length, 2);
});

test('output switched to a sprite (OS_SpriteOp 60) draws into the sprite', async () => {
  const { vdu, out } = await gfx(lines(...AREA,
    'MODE 28',
    'SYS "OS_SpriteOp",15+256,area%,"canvas",0,16,16,28',
    'SYS "OS_SpriteOp",60+256,area%,"canvas",0 TO r0%,r1%,r2%,r3%',
    'PRINT "w=";(1+POINT(-1,-1));" ";',
    'SYS "OS_ReadModeVariable",-1,11 TO ,,xw%:PRINT "xw=";xw%',
    'GCOL 12:RECTANGLE FILL 0,0,15,31',               // left half of the 16x16 sprite
    'SYS "OS_SpriteOp",r0%,r1%,r2%,r3%',              // back to the screen
    'SYS "OS_ReadModeVariable",-1,11 TO ,,xw%:PRINT "back=";xw%',
    'SYS "OS_SpriteOp",34+256,area%,"canvas",100,100,0'));
  assert.match(out, /xw=15/);
  assert.match(out, /back=639/);
  assert.notEqual(px(vdu, 100, 100), 0);
  assert.notEqual(px(vdu, 114, 130), 0);
  assert.equal(px(vdu, 118, 100), 0);
});

test('PutSpriteTransformed with a matrix (a sprite turned through 90 degrees)', async () => {
  const { vdu } = await gfx(lines(...AREA,
    'MODE 28:GCOL 9:RECTANGLE FILL 0,0,63,15',          // 32 x 8 pixels, wide
    'SYS "OS_SpriteOp",16+256,area%,"bar",0,0,0,63,15:CLG',
    'DIM t% 24:t%!0=0:t%!4=&10000:t%!8=-&10000:t%!12=0:t%!16=400*256:t%!20=400*256',
    'SYS "OS_SpriteOp",56+256,area%,"bar",0,0,0,t%,0'));
  // (u,v) -> (-v + 400, u + 400): the bar now stands upright to the left of x = 400
  assert.notEqual(px(vdu, 390, 450), 0);
  assert.equal(px(vdu, 410, 450), 0);
  assert.equal(px(vdu, 450, 402), 0);
});

test('screenToSpriteFile exports the screen in its mode with its palette', async () => {
  const { vdu } = await gfx(lines('MODE 12:GCOL 2:RECTANGLE FILL 0,0,200,200:VDU 19,2,16,1,2,3'));
  const f = readSpriteFile(screenToSpriteFile(vdu));
  const s = f.sprites[0];
  assert.equal(s.name, 'screen');
  assert.equal(s.mode, 12);
  assert.deepEqual([s.w, s.h, s.bpp], [640, 256, 4]);
  assert.equal(s.px[(255) * 640 + 10], 2);                      // bottom-left
  assert.equal((s.pal[4] >>> 8) & 255, 1);                      // colour 2: r = 1
  // a selector mode is saved with a new-format mode word; MODE 7 as a 16 colour picture
  const { vdu: v2 } = await gfx(lines('MODE "X1024 Y600 C256":GCOL 3:RECTANGLE FILL 0,0,100,100'));
  const s2 = readSpriteFile(screenToSpriteFile(v2, { name: 'big' })).sprites[0];
  assert.deepEqual([s2.name, s2.w, s2.h, s2.bpp, s2.xeig, s2.yeig], ['big', 1024, 600, 8, 1, 1]);
  const { vdu: v7 } = await gfx(lines('MODE 7:PRINT CHR$(129);"RED"'));
  const s7 = screenSprite(v7);
  assert.deepEqual([s7.mode, s7.w, s7.h, s7.bpp], [9, 320, 250, 4]);
  assert.ok(s7.px.some((p) => p === 1));                        // red text
});

test('mode strings and selectors: numbered modes where they exist, other sizes and depths', async () => {
  const { vdu, out } = await gfx(lines(
    'MODE "X800 Y600 C256":PRINT MODE',
    'MODE "X640 Y256 C16":PRINT MODE',
    'MODE "X320 Y256 C16":PRINT MODE',
    'MODE "X1024 Y768 C256"',
    'm%=MODE:PRINT (m%>255)',
    'SYS "OS_ReadModeVariable",m%,11 TO ,,xw%:SYS "OS_ReadModeVariable",-1,12 TO ,,yw%',
    'SYS "OS_ReadModeVariable",-1,4 TO ,,xe%:SYS "OS_ReadModeVariable",-1,3 TO ,,nc%',
    'PRINT xw%;",";yw%;",";xe%;",";nc%',
    'GCOL 9:RECTANGLE FILL 2000,1500,40,30',
    'DIM b% 40:b%!0=1:b%!4=400:b%!8=300:b%!12=1:b%!16=-1:b%!20=-1',
    'SYS "OS_ScreenMode",0,b%',
    'SYS "OS_ReadModeVariable",-1,4 TO ,,xe%:SYS "OS_ReadModeVariable",-1,5 TO ,,ye%:SYS "OS_ReadModeVariable",-1,3 TO ,,nc%',
    'PRINT xe%;",";ye%;",";nc%;",";(MODE>255)',
    'MODE "X1920 Y1080 C16M":PRINT (MODE>255)'));
  const nums = out.split(/\s+/).filter(Boolean);
  assert.deepEqual(nums.slice(0, 4), ['32', '12', '9', '-1']);
  assert.match(out, /1023,767,1,63/);
  assert.match(out, /2,2,3,-1/);          // 400 x 300 four colours: eig 2,2
  assert.deepEqual([vdu.W, vdu.H, vdu.log2bpp], [1920, 1080, 3]);   // 16M colours given as 256
  assert.equal(vdu.displayWidth, 1920);
});

test('*WimpMode with a mode string; bad mode strings are errors', async () => {
  const { vdu } = await gfx(lines('*WimpMode X512 Y384 C16 EX2 EY2'));
  assert.deepEqual([vdu.W, vdu.H, vdu.xEig, vdu.yEig, vdu.nColour], [512, 384, 2, 2, 15]);
  assert.deepEqual([vdu.displayWidth, vdu.displayHeight], [1024, 768]);
  const { out } = await gfx(lines('ON ERROR PRINT REPORT$:END', 'MODE "Q12"'));
  assert.match(out, /Bad MODE/);
});

test('MODE 7 flashing and double height render on a VDU with its own clock and canvas', async () => {
  let now = 0;
  const frames = [];
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (img) => frames.push(Uint32Array.from(new Uint32Array(img.data.buffer))),
  }) };
  const vdu = new VDU({ mode: 7, canvas, clock: () => now });
  const m = new BasicMachine({ vdu });
  await m.load(lines('PRINT CHR$(136);"FLASHING"', 'PRINT CHR$(141);"TALL"', 'PRINT CHR$(141);"TALL"', 'VDU 23,1,0;0;0;0;'));
  await m.run();
  assert.equal(canvas.width, 320); assert.equal(canvas.height, 250);
  assert.equal(canvas.style.width, '640px');
  now = 100; vdu.render();
  const a = frames.at(-1);
  now = 600; vdu.render();
  const b = frames.at(-1);
  const row0 = (f) => f.subarray(0, 320 * 10).some((p) => p !== f[0]);
  assert.notEqual(row0(a), row0(b));         // the flashing word is shown in one phase, not the other
  now = 1380; vdu.render();                  // one flash cycle (1.28 s) later: as at 100
  assert.equal(row0(frames.at(-1)), row0(a));
  // double height: the top half on row 1 and the bottom half on row 2 are both drawn, and differ
  const bank = vdu.ttxBank0, W = 320;
  const rowPix = (r) => Array.from(bank.subarray(r * 10 * W, (r + 1) * 10 * W));
  assert.ok(rowPix(1).some((p) => p) && rowPix(2).some((p) => p));
  assert.notDeepEqual(rowPix(1), rowPix(2));
});
