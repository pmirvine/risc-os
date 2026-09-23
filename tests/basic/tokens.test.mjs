// Tokeniser / detokeniser tests, including all tokenised BASIC files in vendor/ro371.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  tokenise, detokenise, tokeniseProgramLine, parseProgram, buildProgram, listLine, T, TC, TS,
  encodeLineNumber, decodeLineNumber, renumber, textToLines, programToText,
} from '../../src/basic/tokens.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const hex = (a) => Buffer.from(a).toString('hex');

function findFfb(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findFfb(p, out);
    else if (e.name.endsWith(',ffb')) out.push(p);
  }
  return out;
}

test('keywords tokenise to the right values', () => {
  const t = (s) => tokenise(s).bytes;
  assert.deepEqual(t('PRINT'), [T.PRINT]);
  assert.deepEqual(t('P."hi"'), [T.PRINT, 0x22, 0x68, 0x69, 0x22]); // abbreviation
  assert.deepEqual(t('CASE x OF'), [T.ESCSTMT, TS.CASE, 0x20, 0x78, 0x20, T.OF]);
  assert.deepEqual(t('LIST'), [T.ESCCOM, TC.LIST]);
  assert.deepEqual(t('x=SUM(a())'), [0x78, 0x3D, T.ESCFN, 0x8E, 0x28, 0x61, 0x28, 0x29, 0x29]);
  // TIME is polymorphic: left mode (statement) vs right mode (function)
  assert.deepEqual(t('TIME=0'), [T.TIME2, 0x3D, 0x30]);
  assert.deepEqual(t('x=TIME'), [0x78, 0x3D, T.TIME]);
  // job bit 0: TIMER is a variable, not TIME
  assert.deepEqual(t('TIMER=1'), Array.from('TIMER=1', (c) => c.charCodeAt(0)));
  // TO has no bit 0: TOTAL -> TO + TAL (the classic gotcha)
  assert.deepEqual(t('TOTAL'), [T.TO, 0x54, 0x41, 0x4C]);
  // lower case is never tokenised
  assert.deepEqual(t('print'), Array.from('print', (c) => c.charCodeAt(0)));
  // strings and REM are not tokenised
  assert.deepEqual(t('REM PRINT'), [T.REM, 0x20, 0x50, 0x52, 0x49, 0x4E, 0x54]);
  assert.deepEqual(t('"PRINT"'), Array.from('"PRINT"', (c) => c.charCodeAt(0)));
  // PROC names are copied verbatim
  assert.deepEqual(t('PROCPRINT'), [T.PROC, 0x50, 0x52, 0x49, 0x4E, 0x54]);
  // hex constants swallow letters A-F
  assert.deepEqual(t('&DEF'), [0x26, 0x44, 0x45, 0x46]);
});

test('line number constants after GOTO/THEN/ELSE/RESTORE', () => {
  for (const n of [0, 10, 255, 256, 1000, 32767, 65279]) {
    const e = encodeLineNumber(n);
    assert.equal(decodeLineNumber(...e), n);
  }
  const b = tokenise('GOTO 100').bytes;
  assert.equal(b[0], T.GOTO);
  assert.equal(b[2], T.CONST);
  assert.equal(decodeLineNumber(b[3], b[4], b[5]), 100);
  // GOTO x (expression) is not a constant
  assert.deepEqual(tokenise('GOTO x').bytes, [T.GOTO, 0x20, 0x78]);
  // after a ':' constants are not allowed any more (x=10 keeps 10 as digits)
  assert.deepEqual(tokenise('x=10').bytes, [0x78, 0x3D, 0x31, 0x30]);
});

test('program line entry: number, trailing spaces, ELSE at start', () => {
  const r = tokeniseProgramLine('20 PRINT "a"   ');
  assert.equal(r.lineNumber, 20);
  assert.deepEqual(r.body, [0x20, T.PRINT, 0x20, 0x22, 0x61, 0x22]);
  const e = tokeniseProgramLine('30 ELSE');
  assert.deepEqual(e.body, [0x20, T.ELSE2]);
  assert.equal(tokeniseProgramLine('PRINT').lineNumber, null);
});

test('LIST formatting and LISTO', () => {
  const body = tokeniseProgramLine('10 FOR I=1 TO 10:PRINT I:NEXT').body;
  assert.deepEqual(listLine(10, body, 0), ['   10 FOR I=1 TO 10:PRINT I:NEXT']);
  assert.deepEqual(listLine(10, body, 1), ['   10  FOR I=1 TO 10:PRINT I:NEXT']);
  assert.deepEqual(listLine(10, body, 4), ['   10 FOR I=1 TO 10:', '     PRINT I:', '     NEXT']);
  assert.deepEqual(listLine(10, body, 5), ['   10  FOR I=1 TO 10:', '      PRINT I:', '      NEXT']);
  assert.deepEqual(listLine(10, body, 8), [' FOR I=1 TO 10:PRINT I:NEXT']);
  assert.deepEqual(listLine(10, body, 16), ['   10 for I=1 to 10:print I:next']);
  const lines = textToLines('10 FOR I=1 TO 3\n20 PRINT I\n30 NEXT\n').lines;
  assert.equal(programToText(lines, 2), '   10 FOR I=1 TO 3\n   20   PRINT I\n   30 NEXT\n');
});

test('RENUMBER fixes GOTO references', () => {
  const lines = textToLines('5 GOTO 7\n7 PRINT "x":GOSUB 5\n').lines;
  const r = renumber(lines, 100, 5).lines;
  assert.equal(programToText(r), '  100 GOTO 105\n  105 PRINT "x":GOSUB 100\n');
});

test('text without line numbers is numbered 10,10', () => {
  const r = textToLines('PRINT 1\nPRINT 2\n');
  assert.equal(r.renumbered, true);
  assert.deepEqual(r.lines.map((l) => l.num), [10, 20]);
});

test('real ,ffb files: image round trip and re-tokenising listings', () => {
  const files = findFfb(path.join(root, 'vendor/ro371'));
  if (!files.length) { console.log('vendor/ro371 not present; skipping'); return; }
  let progs = 0, lines = 0, same = 0, perfectFiles = 0;
  const bad = [];
  for (const f of files) {
    const bytes = new Uint8Array(fs.readFileSync(f));
    const p = parseProgram(bytes);
    if (!p) continue;
    progs++;
    // exact image round trip (LOAD/SAVE)
    assert.equal(hex(buildProgram(p.lines)), hex(bytes.slice(0, p.end)), f);
    let ok = true;
    for (const l of p.lines) {
      lines++;
      const text = detokenise(l.body);
      const re = tokenise(text).bytes;
      let k = 0; while (re[k] === 32) k++;
      if (re[k] === T.ELSE) re[k] = T.ELSE2;
      if (re.length === l.body.length && re.every((x, i) => x === l.body[i])) same++;
      else { ok = false; if (bad.length < 5) bad.push(`${path.basename(path.dirname(f))} ${l.num} ${text}`); }
    }
    if (ok) perfectFiles++;
  }
  console.log(`# ${progs} programs, ${lines} lines, ${same} re-tokenised byte-identically (${(100 * same / lines).toFixed(2)}%), ${perfectFiles} whole files identical`);
  // The remaining differences are all in "crunched" programs where keywords were packed against
  // names (e.g. DEFPROCaPROCb, IFxTHEN, ERROREXTERR) which cannot be reproduced by typing.
  assert.ok(same / lines > 0.995, 'at least 99.5% of lines re-tokenise identically');
  assert.ok(perfectFiles >= 430);
});
