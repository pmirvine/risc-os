import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DIR = new URL('../../tools/games/!Pacman/', import.meta.url);
const ENGINE = ['Dirs', 'MazeData', 'Theme', 'Maze', 'Mover', 'Player',
  'Targets', 'Ghost', 'Modes', 'House', 'Fright', 'Fruit', 'Levels',
  'Game', 'Play', 'Autopilot'];
const all = fs.readdirSync(DIR).filter((f) => !f.startsWith('!')
  && fs.statSync(new URL(f, DIR)).isFile());
const present = ENGINE.filter((f) => all.includes(f));

test('the engine modules are there', () => {
  for (const f of ['Dirs', 'MazeData', 'Theme', 'Maze', 'Mover',
    'Player', 'Targets', 'Ghost', 'Game', 'Play']) {
    assert.ok(present.includes(f), f);
  }
});

const code = (text) => text.split('\n')
  .filter((l) => !l.trim().startsWith('//')
    && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

for (const f of present) {
  test(`${f} is a pure engine module`, () => {
    const text = fs.readFileSync(new URL(f, DIR), 'latin1');
    const imports = text.split('\n').filter((l) => /^import\b/.test(l)
      || /^\s+from\s/.test(l) || /\bfrom\s+'/.test(l));
    const ok = f === 'Autopilot'
      ? /from '(\.\/(Maze|Dirs)|gamelib\/Maths)'/
      : /from '(\.\/[A-Za-z]+|gamelib\/Maths)'/;
    for (const l of imports) assert.match(l, ok, l);
    const body = code(text);
    for (const w of ['Math.random', 'Date', 'performance', 'document',
      'window', 'riscos']) {
      assert.ok(!new RegExp('\\b' + w.replace('.', '\\.') + '\\b')
        .test(body), f + ' uses ' + w);
    }
  });
}

function commentLines(text) {
  return text.split('\n').filter((l) => l.trim().startsWith('//')
    || l.trim().startsWith('*') || l.trim().startsWith('/*'));
}

for (const f of all) {
  test(`${f} follows the source rules`, () => {
    const text = fs.readFileSync(new URL(f, DIR)).toString('latin1');
    assert.ok(!/[\t\r]/.test(text), 'no tab or CR');
    assert.ok(!/[^\n\x20-\x7e]/.test(text), 'ASCII (so Latin-1)');
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    assert.ok(lines.length <= 250, `${lines.length} lines`);
    lines.forEach((l, i) => assert.ok(l.length <= 72,
      `${f}:${i + 1} is ${l.length} columns`));
    assert.ok(lines[0].startsWith('//'), 'starts with a // header');
    assert.ok(!/\.[A-Za-z]+$/.test(f), 'no extension');
    for (const l of commentLines(text)) {
      assert.ok(!/import\b.*\bfrom\b/.test(l), `import in comment: ${l}`);
    }
    if (f !== '!RunImage') {
      assert.ok(!/from\s*'riscos'/.test(text), 'riscos only in !RunImage');
    }
  });
}
