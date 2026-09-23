// Host behaviour: cooperative scheduling, Escape, keyboard, TRACE, LIST IF, banner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BasicMachine, BANNER } from '../../src/basic/machine.js';
import { immediate, runBasic } from './helpers.mjs';

const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');

function mk(opts = {}) {
  let out = '';
  const m = new BasicMachine({ onOutput: (c) => { if (c !== 13) out += String.fromCharCode(c); }, seed: 1, ...opts });
  return { m, out: () => out };
}

test('the interpreter yields to the host during long loops', async () => {
  const { m } = mk();
  await m.load(lines('REPEAT:UNTIL FALSE'));
  let ticks = 0;
  const timer = setInterval(() => { ticks++; if (ticks === 5) m.escape(); }, 5);
  await m.run();
  clearInterval(timer);
  assert.ok(ticks >= 5, 'timers ran while BASIC was busy');
  assert.equal(m.interp.errnum, 17);
});

test('Escape stops a program with "Escape at line n"', async () => {
  const { m, out } = mk();
  await m.load(lines('I%=0', 'I%+=1:GOTO 20'));
  setTimeout(() => m.escape(), 20);
  await m.run();
  assert.equal(out(), 'Escape at line 20\n');
});

test('ON ERROR can trap Escape; GET waits for a key', async () => {
  const { m, out } = mk();
  await m.load(lines('ON ERROR PRINT "trapped ";ERR:END', 'K=GET:PRINT K'));
  setTimeout(() => m.escape(), 10);
  await m.run();
  assert.equal(out(), 'trapped 17\n');
  const t = mk();
  await t.m.load(lines('PRINT "press":K$=GET$:PRINT "got ";K$', 'T=INKEY(5):PRINT T'));
  setTimeout(() => t.m.keyPress(65), 20);
  await t.m.run();
  assert.equal(t.out(), 'press\ngot A\n        -1\n');
});

test('INKEY negative key scan and mouse', async () => {
  const { m, out } = mk();
  m.keyDown(98); // space
  m.setMouse(100, 200, 4);
  await m.load(lines('PRINT INKEY(-99);INKEY(-67);INKEY(-10)', 'MOUSE x,y,b:PRINT x;" ";y;" ";b'));
  await m.run();
  assert.equal(out(), '        -10-1\n       100 200 4\n');
});

test('TRACE ON prints line numbers', async () => {
  assert.equal(await runBasic(lines('TRACE ON', 'A=1', 'TRACE OFF', 'PRINT "x"')), '[20] [30] x\n');
});

test('LIST IF and LISTO 2 indentation', async () => {
  const out = await immediate(['10 A=1', '20 PRINT A', '30 B=A', '40 REPEAT', '50 PRINT', '60 UNTIL TRUE', 'LIST IF A', 'LISTO 2', 'LIST 40,60']);
  // the match string includes the space after IF (as in BASIC), so 'B=A' is not listed
  assert.equal(out, '   10 A=1\n   20 PRINT A\n   40 REPEAT\n   50   PRINT\n   60 UNTIL TRUE\n');
});

test('banner text and bytes free', async () => {
  const { m, out } = mk();
  m.printBanner();
  assert.equal(BANNER, 'ARM BBC BASIC V version 1.16 (C) Acorn 1989');
  assert.equal(out(), 'ARM BBC BASIC V version 1.16 (C) Acorn 1989\n\nStarting with 651516 bytes free\n\n');
});

test('prompt loop, AUTO and QUIT', async () => {
  let exited = null;
  const { m, out } = mk({ onExit: (c) => { exited = c; } });
  const typed = 'AUTO\rPRINT "auto"\r\x1bRUN\rQUIT\r';
  const p = m.start({ banner: false });
  for (const ch of typed) { await new Promise((r) => setTimeout(r, 1)); if (ch === '\x1b') m.escape(); else m.keyPress(ch.charCodeAt(0)); }
  await p;
  assert.equal(exited, 0);
  assert.equal(out(), '>AUTO\n   10PRINT "auto"\n   20\nEscape\n>RUN\nauto\n>QUIT\n');
});

test('SOUND and ENVELOPE are accepted without audio', async () => {
  assert.equal(await runBasic(lines('ENVELOPE 1,1,0,0,0,0,0,0,126,-1,0,-1,126,100', 'SOUND 1,-15,53,10:SOUND 1,1,89,5:SOUND &11,-10,100,2', 'BEATS 100:PRINT BEATS', 'PRINT "ok"')), '       100\nok\n');
});

test('*KEY, *EXEC, *SPOOL and CRUNCH', async () => {
  const { MemFS } = await import('../../src/basic/memfs.js');
  const fs = new MemFS();
  const { m, out } = mk({ fs });
  await m.immediate('*KEY 1 PRINT "F1 pressed"|M');
  m.keyPress(0x81);
  const line = await m.readLine();
  assert.equal(line, 'PRINT "F1 pressed"');
  await m.immediate('*SPOOL log');
  await m.immediate('PRINT "logged"');
  await m.immediate('*SPOOL');
  assert.match(String.fromCharCode(...(await fs.readFile('log')).data), /logged/);
  await fs.writeFile('keys', Uint8Array.from('A=6*7\nPRINT A\n', (c) => c.charCodeAt(0)), 0xFFF);
  await m.immediate('*EXEC keys');
  await m.enterLine(await m.readLine());
  await m.enterLine(await m.readLine());
  assert.match(out(), /        42\n$/);
  const c = await immediate(['10   A = 1 :: B$ = "x  y" : REM gone', '20 REM', '30 X = A AND B', 'CRUNCH 31', 'LIST']);
  assert.equal(c, '   10A=1:B$="x  y":REM gone\n   30X=AAND B\n'); // REMs on the first line are kept
});
