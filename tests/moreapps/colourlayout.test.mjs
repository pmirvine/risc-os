// WimpLib/Ui/ColourLayout: where the colour popup's parts go.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {layout, cellAt, CELL, PAD}
  from '../../tools/moreapps/!WimpLib/Ui/ColourLayout';

describe('ColourLayout', () => {
  it('without a theme the old popup: 8 x 5 swatches, buttons under', () => {
    const l = layout(false);
    assert.equal(l.W, 8 * CELL + 2 * PAD);
    assert.equal(l.btnY, PAD + 5 * CELL + 8);
    assert.equal(l.H, l.btnY + 28 + PAD);
    assert.equal(l.theme, null);
    assert.deepEqual(cellAt(l, PAD + 3 * CELL + 2, PAD + 2 * CELL + 2),
      {kind: 'std', col: 3, row: 2});
    assert.equal(cellAt(l, PAD + 8 * CELL, PAD), null);
    assert.equal(cellAt(l, 2, 2), null);
  });

  it('with a theme: a taller, wider window and the right cells', () => {
    const a = layout(false), l = layout(true);
    assert.ok(l.H > a.H && l.W > a.W);
    assert.equal(l.W, 10 * CELL + 2 * PAD);
    assert.ok(l.theme.y < l.std.y && l.std.y + 5 * CELL < l.btnY);
    const at = (g, c, r) => [g.x + c * CELL + 3, g.y + r * CELL + 3];
    assert.deepEqual(cellAt(l, ...at(l.theme, 9, 5)),
      {kind: 'theme', col: 9, row: 5});
    assert.deepEqual(cellAt(l, ...at(l.theme, 0, 0)),
      {kind: 'theme', col: 0, row: 0});
    assert.deepEqual(cellAt(l, ...at(l.std, 7, 4)),
      {kind: 'std', col: 7, row: 4});
    assert.equal(cellAt(l, ...at(l.std, 8, 0)), null);
    assert.equal(cellAt(l, l.theme.x, l.theme.y - 4), null);
  });

  it('fits a 640 x 480 screen with the title bar', () => {
    assert.ok(layout(true).H + 20 + 2 <= 480);
  });
});
