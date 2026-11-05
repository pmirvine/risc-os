// ThemeSwatches: the theme block of the colour picker.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {grid, COLS, ROWS}
  from '../../tools/moreapps/!Letters/ThemeSwatches';
import {parse, colorOf} from '../../tools/moreapps/!Letters/ThemeRead';
import {themeBytes} from '../../tools/moreapps/!Letters/ThemeDefault';
import {setColors} from '../../tools/moreapps/!Letters/ThemeWrite';
import {COLOR_SCHEMES} from '../../tools/moreapps/!Letters/ThemePresets';

const office = parse(themeBytes());
const g = grid(office);
const ORDER = ['background1', 'text1', 'background2', 'text2',
  'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

describe('ThemeSwatches', () => {
  it('is 6 x 10 in Word column order, base colours in row 0', () => {
    assert.equal(COLS, 10);
    assert.equal(ROWS, 6);
    assert.equal(g.length, 6);
    for (const row of g) assert.equal(row.length, 10);
    assert.deepEqual(g[0].map((c) => c.ref.themeColor), ORDER);
    for (const c of g[0]) {
      assert.equal(c.ref.themeTint, undefined);
      assert.equal(c.ref.themeShade, undefined);
    }
    assert.equal(g[0][4].rgb, '4472C4');
  });
  it('every rgb is colorOf of its ref, never tint and shade', () => {
    for (const row of g) for (const c of row) {
      assert.equal(c.rgb, colorOf(office, c.ref));
      assert.ok(!(c.ref.themeTint && c.ref.themeShade));
    }
    assert.equal(g[5][4].rgb, colorOf(office,
      {themeColor: 'accent1', themeShade: '7F'}));
  });
  it('pins the levels seen in Word-made documents', () => {
    const col = (n) => g.map((r) => r[ORDER.indexOf(n)].ref);
    // accents: lighter 80/60/40 (33/66/99), darker 25/50 (BF/7F)
    assert.deepEqual(col('accent1').slice(1), [
      {themeColor: 'accent1', themeTint: '33'},
      {themeColor: 'accent1', themeTint: '66'},
      {themeColor: 'accent1', themeTint: '99'},
      {themeColor: 'accent1', themeShade: 'BF'},
      {themeColor: 'accent1', themeShade: '7F'}]);
    assert.deepEqual(col('text1').slice(1, 5).map((r) => r.themeTint),
      ['7F', 'A6', 'BF', 'D9']);
    assert.deepEqual(col('background1').slice(2, 3)
      .concat(col('background1').slice(5)).map((r) => r.themeShade),
    ['D9', '7F']);
    assert.equal(col('text2')[4].themeShade, 'BF');
    assert.equal(col('text2')[3].themeTint, '99');
  });
  it('names follow Word tooltips', () => {
    assert.equal(g[0][0].name, 'White, Background 1');
    assert.equal(g[0][1].name, 'Black, Text 1');
    assert.equal(g[1][4].name, 'Accent 1, Lighter 80%');
    assert.equal(g[5][9].name, 'Accent 6, Darker 50%');
    assert.equal(g[2][0].name, 'White, Background 1, Darker 15%');
  });
  it('another theme changes the grid', () => {
    const p = COLOR_SCHEMES.find((x) => x.name === 'Paper');
    const other = grid(parse(setColors(themeBytes(), p)));
    assert.equal(other[0][4].rgb, 'A5B592');
    assert.notEqual(other[3][4].rgb, g[3][4].rgb);
    assert.equal(other[3][4].rgb, colorOf(parse(setColors(themeBytes(), p)),
      other[3][4].ref));
  });
  it('works with no theme (Office defaults)', () => {
    assert.equal(grid(null)[0][4].rgb, '4472C4');
  });
});
