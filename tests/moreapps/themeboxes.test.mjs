// The custom theme boxes' pure halves (./ThemeBoxPatch): filled from
// the theme, values checked, one undo step, nothing applied when
// invalid or unchanged.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {COLOR_SCHEMES} from '../../tools/moreapps/!Letters/ThemePresets';
import {THEME_PART} from '../../tools/moreapps/!Letters/OpsTheme';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {SLOTS, fillFonts, fontsApply, fillColors, colorsApply}
  from '../../tools/moreapps/!Letters/ThemeBoxPatch';

const mk = () => new Document(newDoc());
const snap = (d) => JSON.stringify([d.doc.styles.theme.major,
  [...d.doc.styles.theme.colors]]);
const schemeName = (d) => /<a:clrScheme[^>]*name="([^"]*)"/.exec(
  new TextDecoder().decode(d.doc.parts.get(THEME_PART)))[1];
const vals = (c, o = {}) => ({...c.slots, name: c.name, ...o});

describe('ThemeBoxPatch fonts', () => {
  it('fills from the theme', () => {
    const d = mk();
    assert.deepEqual(fillFonts(d), {major: TD.fontsOf(d).major,
      minor: TD.fontsOf(d).minor});
  });
  it('applies a change as one undo step', () => {
    const d = mk(), was = fillFonts(d), before = snap(d);
    const r = fontsApply(d, {major: ' Garamond ', minor: was.minor},
      was);
    assert.deepEqual(r, {changed: true});
    assert.equal(TD.fontsOf(d).major, 'Garamond');
    d.undo();
    assert.equal(snap(d), before);
  });
  it('changing only the Heading font leaves the Body font', () => {
    const d = mk(), was = fillFonts(d);
    fontsApply(d, {major: 'Garamond', minor: was.minor}, was);
    assert.equal(TD.fontsOf(d).major, 'Garamond');
    assert.equal(TD.fontsOf(d).minor, was.minor);
  });
  it('unchanged applies nothing', () => {
    const d = mk(), was = fillFonts(d), before = snap(d);
    assert.deepEqual(fontsApply(d, {...was}, was), {changed: false});
    assert.equal(snap(d), before);
  });
  it('invalid names error and change nothing', () => {
    for (const bad of ['', '   ', 'a<b', 'x'.repeat(65), 'a\u0001b']) {
      const d = mk(), was = fillFonts(d), before = snap(d);
      const r = fontsApply(d, {major: bad, minor: was.minor}, was);
      assert.ok(r.error, JSON.stringify(bad));
      assert.deepEqual(r.bad, ['major']);
      assert.equal(snap(d), before);
    }
  });
});

describe('ThemeBoxPatch colours', () => {
  it('fills slots, name Custom', () => {
    const d = mk(), c = fillColors(d);
    assert.equal(c.name, 'Custom');
    assert.deepEqual(Object.keys(c.slots), SLOTS);
  });
  it('a changed slot is written as Custom, one undo step', () => {
    const d = mk(), was = fillColors(d), before = snap(d);
    const r = colorsApply(d, vals(was, {accent1: '#c0ffee'}), was);
    assert.deepEqual(r, {changed: true});
    const now = TD.colorsOf(d);
    assert.equal(now.slots.accent1, 'C0FFEE');
    assert.equal(now.name, 'Custom');
    assert.equal(schemeName(d), 'Custom');
    d.undo();
    assert.equal(snap(d), before);
  });
  it('unchanged applies nothing; the name in force is no change', () => {
    const d = mk(), was = fillColors(d), before = snap(d);
    assert.deepEqual(colorsApply(d, vals(was), was), {changed: false});
    assert.deepEqual(colorsApply(d, vals(was, {name: was.now}), was),
      {changed: false});
    assert.equal(snap(d), before);
  });
  it('a preset\'s colours keep its name only if the name is left',
    () => {
      const p = COLOR_SCHEMES.find((s) => s.name === 'Paper');
      const d = mk(), was = fillColors(d);
      colorsApply(d, vals(was, {...p.slots}), was);
      assert.equal(schemeName(d), 'Paper');
      const e = mk(), w2 = fillColors(e);
      colorsApply(e, vals(w2, {...p.slots, name: 'Mine'}), w2);
      assert.equal(TD.colorsOf(e).slots.accent1, p.slots.accent1);
      assert.equal(schemeName(e), 'Mine');
    });
  it('a new name alone is applied', () => {
    const d = mk(), was = fillColors(d);
    assert.deepEqual(colorsApply(d, vals(was, {name: 'Brand'}), was),
      {changed: true});
  });
  it('the name is trimmed and cut at 40', () => {
    const d = mk(), was = fillColors(d);
    colorsApply(d, vals(was, {name: '  ' + 'n'.repeat(60)}), was);
    assert.equal(schemeName(d), 'n'.repeat(40));
  });
  it('an invalid hex or name errors and changes nothing', () => {
    for (const [k, bad] of [['accent2', 'GGGGGG'], ['dk1', '12345'],
      ['lt1', ''], ['hlink', '1234567'], ['name', 'a<b']]) {
      const d = mk(), was = fillColors(d), before = snap(d);
      const r = colorsApply(d, vals(was, {[k]: bad}), was);
      assert.ok(r.error, k);
      assert.deepEqual(r.bad, [k]);
      assert.equal(snap(d), before);
    }
  });
  it('a custom scheme keeps dk1 / lt1 as sysClr when untouched', () => {
    const d = mk();
    const sysOf = (k) => new RegExp(`<a:${k}>\\s*<a:sysClr`).test(
      new TextDecoder().decode(d.doc.parts.get(THEME_PART)));
    TD.setColors(d, {name: 'Office 2013 - 2022', sys: ['dk1', 'lt1'],
      slots: COLOR_SCHEMES[0].slots});
    const w2 = fillColors(d);
    assert.ok(sysOf('dk1') && sysOf('lt1'));
    colorsApply(d, vals(w2, {accent1: '123456'}), w2);
    assert.ok(sysOf('dk1') && sysOf('lt1'));
    const w3 = fillColors(d);
    colorsApply(d, vals(w3, {dk1: '111111'}), w3);
    assert.ok(!sysOf('dk1') && sysOf('lt1'));
  });
});
