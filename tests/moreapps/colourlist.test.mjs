// WimpLib/ColourList: the swatches of the colour popup (Word's
// standard colours, greys, lights and darks: 8 x 5) and the hex field
// it reads ('RRGGBB').
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SWATCHES, COLS, ROWS, parseHex, swatchAt, cssOf}
  from '../../tools/moreapps/!WimpLib/ColourList';

describe('ColourList', () => {
  it('40 swatches, 8 x 5, upper-case RRGGBB, no repeats', () => {
    assert.equal(COLS, 8);
    assert.equal(ROWS, 5);
    assert.equal(SWATCHES.length, 40);
    assert.ok(SWATCHES.every((c) => /^[0-9A-F]{6}$/.test(c)));
    assert.equal(new Set(SWATCHES).size, 40);
    assert.ok(Object.isFrozen(SWATCHES));
  });

  it('Word\'s ten standard colours, white and black are there', () => {
    for (const c of ['C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050',
      '00B050', '00B0F0', '0070C0', '002060', '7030A0', 'FFFFFF',
      '000000']) assert.ok(SWATCHES.includes(c), c);
  });

  it('parseHex: RRGGBB in any case, with or without #', () => {
    assert.equal(parseHex('ff0000'), 'FF0000');
    assert.equal(parseHex(' #00b0F0 '), '00B0F0');
    assert.equal(parseHex('f00'), 'FF0000');
    for (const t of ['', 'xyz', '12345', '1234567', 'GG0000', null, 7,
      '#', 'ff 000']) assert.equal(parseHex(t), null, String(t));
  });

  it('swatchAt: column, row -> colour, or null outside', () => {
    assert.equal(swatchAt(0, 0), SWATCHES[0]);
    assert.equal(swatchAt(7, 4), SWATCHES[39]);
    assert.equal(swatchAt(8, 0), null);
    assert.equal(swatchAt(0, 5), null);
    assert.equal(swatchAt(-1, 0), null);
    assert.equal(swatchAt(1.5, 0), null);
  });

  it('cssOf', () => {
    assert.equal(cssOf('FF0000'), '#ff0000');
    assert.equal(cssOf('auto'), '#000000');
    assert.equal(cssOf(null), null);
    assert.equal(cssOf('junk'), null);
  });
});
