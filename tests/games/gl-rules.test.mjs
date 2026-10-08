import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DIR = new URL('../../tools/games/!GameLib/', import.meta.url);
const files = fs.readdirSync(DIR).filter((f) => !f.startsWith('!')
  && fs.statSync(new URL(f, DIR)).isFile());

test('GameLib has its modules', () => {
  for (const f of ['Maths', 'Loop', 'Surface', 'Raster', 'Shapes', 'Font']) {
    assert.ok(files.includes(f), f);
  }
});

// Is the (text of a) line inside a // or block comment? Rough but enough.
function commentLines(text) {
  const out = [];
  let block = false;
  for (const l of text.split('\n')) {
    const t = l.trim();
    if (block) { out.push(l); if (t.includes('*/')) block = false; continue; }
    if (t.startsWith('//')) out.push(l);
    else if (t.startsWith('/*')) {
      out.push(l);
      if (!t.includes('*/')) block = true;
    }
  }
  return out;
}

for (const f of files) {
  test(`${f} follows the source rules`, () => {
    const buf = fs.readFileSync(new URL(f, DIR));
    const text = buf.toString('latin1');
    assert.ok(!/[\t\r]/.test(text), 'no tab or CR');
    assert.ok(!/[^\n\x20-\x7e]/.test(text), 'ASCII (so Latin-1)');
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    assert.ok(lines.length <= 250, `${lines.length} lines`);
    lines.forEach((l, i) => assert.ok(l.length <= 72,
      `${f}:${i + 1} is ${l.length} columns`));
    assert.ok(lines[0].startsWith('//'), 'starts with a // header');
    assert.ok(!/from\s*'riscos'/.test(text), 'no riscos');
    for (const l of commentLines(text)) {
      assert.ok(!/import\b.*\bfrom\b/.test(l), `import in comment: ${l}`);
    }
    if (!['Display', 'Surface'].includes(f)) {
      assert.ok(!/\b(document|window)\b/.test(
        lines.filter((l) => !l.trim().startsWith('//')).join('\n')),
      'document/window only in Display and Surface');
    }
  });

  test(`${f} imports under Node`, async () => {
    assert.equal(typeof document, 'undefined');
    await import(new URL(f, DIR));
  });
}
