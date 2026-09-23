// File handling: OPENOUT/OPENIN/OPENUP, PRINT#/INPUT#, BPUT#/BGET#, PTR#/EXT#/EOF#, GET$#,
// SAVE/LOAD/TEXTSAVE/TEXTLOAD/CHAIN/LIBRARY/INSTALL/APPEND and * commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBasic, immediate } from './helpers.mjs';
import { MemFS } from '../../src/basic/memfs.js';
import { parseProgram } from '../../src/basic/tokens.js';

const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');

test('PRINT# / INPUT# round trip and the binary format', async () => {
  const fs = new MemFS();
  const out = await runBasic(lines(
    'F%=OPENOUT "data"',
    'PRINT#F%,42,"hello",1.5,-7',
    'CLOSE#F%',
    'F%=OPENIN "data"',
    'INPUT#F%,A%,B$,C,D',
    'PRINT A%;" ";B$;" ";C;" ";D;" ";EOF#F%;" ";EXT#F%',
    'CLOSE#F%'), { fs });
  assert.equal(out, '        42 hello 1.5 -7 -1 23\n');
  const f = await fs.readFile('data');
  // &40 int (big endian), &00 len reversed string, &80 5-byte real
  assert.deepEqual(Array.from(f.data.slice(0, 13)), [0x40, 0, 0, 0, 42, 0, 5, 111, 108, 108, 101, 104, 0x80]);
});

test('BPUT# / BGET# / PTR# / EXT# / GET$# / OPENUP', async () => {
  const fs = new MemFS();
  const out = await runBasic(lines(
    'F%=OPENOUT "t"',
    'BPUT#F%,65:BPUT#F%,"BC":BPUT#F%,"DE";',
    'PRINT PTR#F%;" ";EXT#F%',
    'CLOSE#F%',
    'F%=OPENUP "t":PTR#F%=1:BPUT#F%,ASC"x":PTR#F%=0',
    'A$=GET$#F%:PRINT A$;"|";BGET#F%;"|";GET$#F%;"|";EOF#F%',
    'CLOSE#F%',
    'PRINT OPENIN "nonexistent"'), { fs });
  assert.equal(out, '         6 6\nAxC|68|E|-1\n         0\n');
});

test('SAVE, LOAD, TEXTSAVE, TEXTLOAD, CHAIN, APPEND, LIBRARY, INSTALL', async () => {
  const fs = new MemFS();
  let out = await immediate(['10 PRINT "prog one"', '20 PRINT FNlib(3)', 'SAVE "p1"', 'TEXTSAVE "p1txt"'], { fs });
  const img = (await fs.readFile('p1')).data;
  assert.ok(parseProgram(img));
  assert.equal(String.fromCharCode(...(await fs.readFile('p1txt')).data), '   10 PRINT "prog one"\n   20 PRINT FNlib(3)\n');
  await fs.writeFile('lib', Uint8Array.from('REM > mylib\nDEF FNlib(n)=n*11\nDEF PROCboom:ERROR 99,"Bang"\n', (c) => c.charCodeAt(0)), 0xFFF);
  out = await immediate(['LOAD "p1"', 'LIST', 'TEXTLOAD "p1txt"', 'LIST', '30 END', 'APPEND "p1txt"', 'LIST', 'LIBRARY "lib":PRINT FNlib(4)'], { fs });
  assert.equal(out, '   10 PRINT "prog one"\n   20 PRINT FNlib(3)\n   10 PRINT "prog one"\n   20 PRINT FNlib(3)\n' +
    '   10 PRINT "prog one"\n   20 PRINT FNlib(3)\n   30 END\n   40 PRINT "prog one"\n   50 PRINT FNlib(3)\n        44\n');
  // errors inside a library are tagged with the library name
  out = await immediate(['INSTALL "lib"', '10 PROCboom', 'RUN'], { fs });
  assert.equal(out, 'Bang in "mylib" at line 30\n');
  // CHAIN runs another program
  await fs.writeFile('second', Uint8Array.from('10 PRINT "second program"\n', (c) => c.charCodeAt(0)), 0xFFF);
  out = await runBasic(lines('PRINT "first"', 'CHAIN "second"'), { fs });
  assert.equal(out, 'first\nsecond program\n');
});

test('* commands: SET/ECHO/SHOW, OSCLI, system variables, file errors', async () => {
  const fs = new MemFS();
  const out = await runBasic(lines(
    '*Set Test$Var hello',
    'OSCLI "Echo <Test$Var> world"',
    'SYS "OS_ReadVarVal","Test$Var",buf%,64,0,0 TO ,,n%:buf%?n%=13:PRINT $buf%',
    '*FX 4,1',
    'ON ERROR PRINT REPORT$;" ";~ERR:END',
    'F%=OPENIN "nope":PRINT F%',
    '*Unknowncommand').replace('10 *Set', '5 DIM buf% 64\n10 *Set'), { fs });
  assert.equal(out, 'hello world\nhello\n         0\nFile \'Unknowncommand\' not found D6\n');
});
