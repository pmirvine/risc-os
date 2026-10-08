import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guides and !Help files are read in !Edit: Latin-1, no tabs or CRs,
// lines of at most 72 characters.
const FILES = ['tools/docs/Pacman', 'tools/docs/GameLib',
  'tools/games/!Pacman/!Help', 'tools/games/!GameLib/!Help'];

for (const f of FILES) {
  test('text rules: ' + f, () => {
    const text = readFileSync(new URL('../../' + f, import.meta.url),
      'utf8');
    text.split('\n').forEach((line, i) => {
      const at = f + ':' + (i + 1);
      assert.ok(![...line].some((c) => c.charCodeAt(0) > 0xFF),
        at + ' is not Latin-1');
      assert.ok(!line.includes('\t'), at + ' has a tab');
      assert.ok(!line.includes('\r'), at + ' has a CR');
      assert.ok(line.length <= 72,
        at + ' is ' + line.length + ' columns');
    });
  });
}
