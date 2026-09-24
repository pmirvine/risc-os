// Interpreter fixes found running the original 3.71 utilities (!SaveCMOS, !Calibrate, !HForm):
//   * block IF / CASE / WHILE skipping inside a LIBRARY file scanned the main program's lines
//     (!SaveCMOS.StartUp: "Missing ENDIF in "This" at line 350");
//   * a WHILE loop inside a FN called from another WHILE's condition took over the outer loop's
//     pending ENDWHILE (!HForm's allocation-unit search: `WHILE FNi(FALSE)=FALSE` → PROCk's WHILE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BasicMachine } from '../../src/basic/machine.js';
import { buildProgram, textToLines } from '../../src/basic/tokens.js';

async function run(src, files = {}) {
  let out = '';
  const fs = { readFile: (p) => (files[p] ? { data: files[p], type: 0xFFB } : null) };
  const m = new BasicMachine({ onOutput: (c) => { if (c !== 13) out += String.fromCharCode(c); }, fs });
  await m.load(src);
  const res = await m.run();
  return { out, res };
}
const image = (text) => buildProgram(textToLines(text).lines);

test('block IF, CASE and WHILE skipping inside a LIBRARY', async () => {
  const lib = image(`10REM This is a library
20DEF PROCnest(p%)
30IF p% THEN
40  IF p%>1 THEN
50    PRINT "two"
60  ELSE
70    PRINT "one"
80  ENDIF
90ENDIF
100CASE p% OF
110WHEN 0:PRINT "zero"
120OTHERWISE:PRINT "other"
130ENDCASE
140WHILE p%>5:p%-=1:ENDWHILE
150PRINT "end ";p%
160ENDPROC
`);
  const { out, res } = await run('10LIBRARY "lib"\n20PROCnest(0)\n30PROCnest(1)\n40PROCnest(2)\n', { lib });
  assert.equal(res.reason, 'end', JSON.stringify(res));
  assert.equal(out.replace(/\n/g, '|'), 'zero|end 0|one|other|end 1|two|other|end 2|');
});

test('WHILE inside a FN called from a WHILE condition', async () => {
  const { out, res } = await run(`10N%=0
20WHILE FNc<3:PRINT "outer ";N%:ENDWHILE
30PRINT "done ";N%
40END
100DEF FNc:LOCAL I%:I%=0:WHILE I%<2:I%+=1:ENDWHILE:N%+=1:=N%
`);
  assert.equal(res.reason, 'end');
  assert.equal(out.replace(/\n/g, '|'), 'outer 1|outer 2|done 3|');
});
