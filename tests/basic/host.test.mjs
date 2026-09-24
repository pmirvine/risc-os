// Host API contract (used by src/core/basichost.js and the TaskWindow / Wimp bridge) and the
// OS_Byte / screen memory behaviour added for screen banks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BasicMachine } from '../../src/basic/machine.js';
import { VDU } from '../../src/basic/vdu.js';
import { BasicError } from '../../src/basic/errors.js';

const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');
function mk(opts = {}) {
  let out = '';
  const m = new BasicMachine({ onOutput: (c) => { if (c !== 13) out += String.fromCharCode(c); }, seed: 1, ...opts });
  return { m, out: () => out };
}
async function runWith(src, opts) {
  const t = mk(opts);
  await t.m.load(src);
  const res = await t.m.run();
  return { ...t, res };
}

test('run() resolves with how the program stopped', async () => {
  assert.deepEqual((await runWith('PRINT 1')).res, { reason: 'end' });
  assert.deepEqual((await runWith('PRINT 1/0')).res, { reason: 'error', error: { number: 18, message: 'Division by zero', erl: 10 } });
  let exitCode = null;
  const q = await runWith('QUIT', { onExit: (c) => { exitCode = c; } });
  assert.deepEqual(q.res, { reason: 'quit', code: 0 });
  assert.equal(exitCode, 0);
  const x = await runWith('ERROR EXT 7,"bad"', { onExit: () => {} });
  assert.equal(x.res.reason, 'ext');
  assert.equal(x.res.error.message, 'bad');
  // a handled error is not an error exit
  assert.deepEqual((await runWith(lines('ON ERROR PRINT REPORT$:END', 'PRINT 1/0'))).res, { reason: 'end' });
  // QUIT takes no parameter in BASIC 1.16
  assert.equal((await runWith('QUIT 3')).res.error.message, 'Syntax error');
});

test('registerSwi: names, numbers, X forms, new names, Promises', async () => {
  const { m, out } = mk();
  m.registerSwi(0x88000, (r) => { r[0] = r[1] * 2; }, 'Test_Double');
  m.registerSwi('Wimp_Poll', (r, mm) => new Promise((res) => setTimeout(() => { r[0] = 17; mm.mem.wr32(r[1], 99); res(); }, 5)));
  await m.load(lines(
    'SYS "Test_Double",,21 TO a%:PRINT a%',
    'SYS &88000,,5 TO a%:PRINT a%',
    'SYS "XTest_Double",,4 TO a%;f%:PRINT a%;" ";f%',
    'DIM b% 256:SYS "Wimp_Poll",0,b% TO r%:PRINT r%;" ";!b%',
  ));
  assert.deepEqual(await m.run(), { reason: 'end' });
  assert.equal(out(), '        42\n        10\n         8 0\n        17 99\n');
});

test('host errors: BasicError, and plain Errors with errnum become BASIC errors', async () => {
  const { m, out } = mk({
    swiHandlers: { 'Wimp_Initialise': () => { throw new BasicError(0x288, 'Wimp is currently active'); } },
    oscli: async (cmd) => { if (/^\*?Fail/i.test(cmd)) throw Object.assign(new Error('Host says no'), { errnum: 214 }); return false; },
  });
  await m.load(lines(
    'ON ERROR PRINT ERR;":";REPORT$:GOTO 40',
    'SYS "Wimp_Initialise"',
    'END',
    'ON ERROR PRINT ERR;":";REPORT$:END',
    'SYS "XWimp_Initialise" TO e%;f%:PRINT ;f% AND 1;" ";!e%',
    'OSCLI "Fail now"',
  ));
  await m.run();
  assert.equal(out(), '       648:Wimp is currently active\n1 648\n       214:Host says no\n');
});

test('OS_Byte 9/10 flash periods, 112/113/250/251 screen banks', async () => {
  const vdu = new VDU({ mode: 12 });
  const { m, out } = mk({ vdu });
  await m.load(lines(
    'SYS "OS_Byte",9,10 TO ,a%:SYS "OS_Byte",10,40 TO ,b%',
    'SYS "OS_Byte",9,0 TO ,c%:PRINT "<";a%;" ";b%;" ";c%',
    '*FX 112,2',
    'GCOL 3:RECTANGLE FILL 0,0,64,64',
    'SYS "OS_Byte",250 TO ,d%:SYS "OS_Byte",251 TO ,e%:PRINT "<";d%;" ";e%',
    '*FX 113,2',
    'SYS "OS_Byte",251 TO ,e%:PRINT "<";e%',
  ));
  await m.run();
  assert.deepEqual(out().split('<').slice(1).map((l) => l.split('\n')[0].trim()), ['25 25 10', '2 1', '2']);
  assert.equal(vdu.flashMark, 0); assert.equal(vdu.flashSpace, 40);
  const bl = (vdu.height - 2) * vdu.width + 2;
  assert.equal(vdu.banks[0][bl], 0, 'bank 1 untouched');
  assert.equal(vdu.banks[1][bl], 3, 'drawn into bank 2');
  assert.equal(vdu.getPixel(2, vdu.height - 2), 3, 'bank 2 displayed');
  // MODE resets to bank 1; more than two banks when screen memory allows
  m.vduBytes([22, 0]);
  assert.equal(vdu.driverBank, 0); assert.equal(vdu.displayBank, 0);
  assert.ok(vdu.maxBanks >= 3);
});

test('screen memory is mapped: pokes draw, peeks read pixels (packed per mode)', async () => {
  for (const [mode, poke, expect] of [
    [12, 0x5A, [10, 5]],          // 4bpp: low nibble is the left pixel
    [1, 0x1B, [3, 2, 1, 0]],       // 2bpp
    [2, 0x0C, [12]],               // double-pixel 4bpp in 8 bit characters
    [13, 0x2A, [0x2A]],            // 8bpp
  ]) {
    const vdu = new VDU({ mode });
    const { m, out } = mk({ vdu });
    await m.load(lines(
      'DIM b% 20:b%!0=148:b%!4=-1',
      'SYS "OS_ReadVduVariables",b%,b%+8',
      `s%=b%!8:?s%=${poke}`,
      'GCOL 1:PLOT 69,0,0',
      'VDU 31,0,20:PRINT ~s%;" ";~s%?' + (vdu.height - 1) * vdu.m.lineLength,
    ));
    await m.run();
    assert.deepEqual(Array.from(vdu.banks[0].slice(0, expect.length)), expect, `mode ${mode}`);
    const [start, bottom] = out().trim().split(/\s+/).slice(-2);
    assert.equal(parseInt(start, 16), 0x2000000 - vdu.totalScreenSize);
    assert.notEqual(parseInt(bottom, 16), 0, 'bottom-left pixel read back');
  }
  // ARM code can write to the screen too
  const vdu = new VDU({ mode: 13 });
  const { m } = mk({ vdu });
  await m.load(lines(
    'DIM c% 64:P%=c%',
    '[OPT 0:MOV R1,#&FF:STRB R1,[R0]:STR R1,[R0,#4]:MOV PC,R14:]',
    'DIM b% 20:b%!0=148:b%!4=-1:SYS "OS_ReadVduVariables",b%,b%+8',
    'A%=b%!8:CALL c%',
  ));
  await m.run();
  assert.deepEqual(Array.from(vdu.banks[0].slice(0, 8)), [255, 0, 0, 0, 255, 0, 0, 0]);
});

test('RECTANGLE ... TO copies, RECTANGLE FILL ... TO moves', async () => {
  for (const [kw, srcAfter] of [['RECTANGLE', 1], ['RECTANGLE FILL', 0]]) {
    const vdu = new VDU({ mode: 12 });
    const { m } = mk({ vdu });
    await m.load(lines('GCOL 1:RECTANGLE FILL 100,100,40,40', `${kw} 100,100,40,40 TO 400,400`));
    await m.run();
    const px = (x, y) => vdu.getPixel(x >> 1, vdu.height - 1 - (y >> 2));
    assert.equal(px(120, 120), srcAfter, kw + ' source');
    assert.equal(px(420, 420), 1, kw + ' destination');
  }
});

test('OS_Byte 20 / 25 reset redefined characters', async () => {
  const vdu = new VDU({ mode: 12 });
  const { m } = mk({ vdu });
  const orig = Array.from(vdu.osWordReadCharDef(65));
  await m.load(lines('VDU 23,65,255,255,255,255,255,255,255,255', 'VDU 23,97,1,2,3,4,5,6,7,8'));
  await m.run();
  assert.deepEqual(Array.from(vdu.osWordReadCharDef(65)), new Array(8).fill(255));
  await m.immediate('*FX 25,2');   // chars 64-95 only
  assert.deepEqual(Array.from(vdu.osWordReadCharDef(65)), orig);
  assert.deepEqual(Array.from(vdu.osWordReadCharDef(97)), [1, 2, 3, 4, 5, 6, 7, 8]);
  await m.immediate('*FX 20');
  assert.notDeepEqual(Array.from(vdu.osWordReadCharDef(97)), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('BEATS / TEMPO / BEAT and Sound_QBeat', async () => {
  const { m, out } = mk();
  await m.load(lines(
    'BEATS 1000:TEMPO &1000:PRINT BEATS;" ";TEMPO',
    'SYS "Sound_QBeat",-1 TO a%:PRINT a%',
    'SYS "Sound_QBeat",200 TO a%:PRINT a%;" ";BEATS',
    'T%=TIME:REPEAT UNTIL TIME>T%+5:PRINT BEAT>=4 AND BEAT<50',
  ));
  await m.run();
  assert.equal(out(), '      1000 4096\n      1000\n      1000 200\n        -1\n');
});

test('kill() stops a program even inside ON ERROR / GET, and run() says so', async () => {
  const { m } = mk();
  await m.load(lines('ON ERROR GOTO 20', 'REPEAT:K=GET:UNTIL FALSE'));
  setTimeout(() => m.escape(), 5);          // trapped by ON ERROR, keeps going
  setTimeout(() => m.kill(), 30);
  assert.deepEqual(await m.run(), { reason: 'killed' });
  // the machine is reusable afterwards
  await m.load('PRINT "again"');
  assert.deepEqual(await m.run(), { reason: 'end' });
  const t = mk();
  await t.m.load(lines('ON ERROR GOTO 20', 'I%+=1:GOTO 20'));
  setTimeout(() => t.m.kill(), 20);
  assert.deepEqual(await t.m.run(), { reason: 'killed' });
});
