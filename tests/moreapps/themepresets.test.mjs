// ThemePresets: Word's colour schemes and font pairs, generated.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {COLOR_SCHEMES, FONT_PAIRS, OFFICE_COLORS, OFFICE_FONTS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';

const FONT = /^[^\x00-\x1f<>&"]{1,64}$/;
const SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2',
  'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

describe('ThemePresets', () => {
  it('has Word\'s 23 colour schemes and 25 font pairs', () => {
    assert.equal(COLOR_SCHEMES.length, 23);
    assert.equal(FONT_PAIRS.length, 25);
  });
  it('has unique names', () => {
    assert.equal(new Set(COLOR_SCHEMES.map((c) => c.name)).size, 23);
    assert.equal(new Set(FONT_PAIRS.map((f) => f.name)).size, 25);
  });
  it('has six-digit upper-case hex in every slot', () => {
    for (const c of COLOR_SCHEMES) {
      assert.deepEqual(Object.keys(c.slots), SLOTS, c.name);
      for (const s of SLOTS) assert.match(c.slots[s], /^[0-9A-F]{6}$/);
      for (const s of c.sys) assert.ok(['dk1', 'lt1'].includes(s));
    }
  });
  it('has valid font names', () => {
    for (const f of FONT_PAIRS) {
      assert.match(f.major, FONT, f.name);
      assert.match(f.minor, FONT, f.name);
    }
  });
  it('lists the Office entries first and equal to the defaults', () => {
    const d = parse(null);
    assert.equal(COLOR_SCHEMES[0], OFFICE_COLORS);
    for (const s of SLOTS) {
      assert.equal(OFFICE_COLORS.slots[s], d.colors.get(s), s);
    }
    assert.equal(FONT_PAIRS[0], OFFICE_FONTS);
    assert.equal(OFFICE_FONTS.major, 'Calibri Light');
    assert.equal(OFFICE_FONTS.minor, 'Calibri');
    assert.ok(FONT_PAIRS.some((f) =>
      f.major === 'Calibri Light' && f.minor === 'Calibri'));
  });
  it('matches known Word values', () => {
    const paper = COLOR_SCHEMES.find((c) => c.name === 'Paper');
    assert.equal(paper.slots.accent1, 'A5B592');
    assert.equal(paper.slots.dk2, '444D26');
    assert.equal(paper.slots.lt2, 'FEFAC9');
    const g = FONT_PAIRS.find((f) => f.name === 'Garamond');
    assert.equal(g.major, 'Garamond');
    assert.equal(g.minor, 'Garamond');
  });
});
