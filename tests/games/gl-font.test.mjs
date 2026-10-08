import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rgb } from '../../tools/games/!GameLib/Surface';
import { textWidth, drawText, drawLines, CHAR_W, CHAR_H }
  from '../../tools/games/!GameLib/Font';

const L = await import('../../tools/lander2/!Lander2/Font');

test('textWidth', () => {
  assert.equal(textWidth('READY!'), 48);
  assert.equal(textWidth('AB', 2), 32);
  assert.equal(CHAR_W, 8);
  assert.equal(CHAR_H, 8);
});

test('drawText matches Lander II', () => {
  const yellow = rgb(255, 255, 0), black = rgb(0, 0, 0);
  const cases = [
    ['SCORE 1UP', 4, 4, { colour: yellow }],
    ['READY!', 112, 20, { scale: 2, shadow: black, align: 'centre',
      colour: yellow }],
    ['Hi ~?', 200, 40, { scale: 2, align: 'right', outline: black,
      smooth: true }],
    ['GAME', 10, 60, { scale: 4, smooth: true,
      colour: (t) => rgb(255 * t, 0, 0) }],
  ];
  for (const [text, x, y, o] of cases) {
    const a = new Surface(224, 100), b = new Surface(224, 100);
    const wa = drawText(a, text, x, y, o);
    const wb = L.drawText(b, text, x, y, o);
    assert.equal(wa, wb);
    assert.deepEqual(a.pixels, b.pixels, text);
    assert.ok(a.pixels.some((p) => p));
  }
});

test('drawLines matches Lander II', () => {
  const a = new Surface(100, 60), b = new Surface(100, 60);
  const h = drawLines(a, ['ONE', 'TWO'], 2, 2, { scale: 2 });
  assert.equal(h, L.drawLines(b, ['ONE', 'TWO'], 2, 2, { scale: 2 }));
  assert.deepEqual(a.pixels, b.pixels);
});
