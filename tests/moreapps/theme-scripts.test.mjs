// ThemeRead: the East Asian (a:ea) and complex-script (a:cs) typefaces
// of the theme's majorFont and minorFont, fontOf's eastAsia and cs
// slots, and ThemeWrite keeping them when it rewrites the fonts or
// colours. The Latin slots are unchanged.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parse, fontOf}
  from '../../tools/moreapps/!Letters/ThemeRead';
import {setFonts, setColors}
  from '../../tools/moreapps/!Letters/ThemeWrite';
import {themeBytes} from '../../tools/moreapps/!Letters/ThemeDefault';
import {COLOR_SCHEMES} from '../../tools/moreapps/!Letters/ThemePresets';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const fonts = (maj, min) => '<?xml version="1.0" encoding="UTF-8"?>' +
  `<a:theme xmlns:a="${A}" name="T"><a:themeElements>` +
  '<a:clrScheme name="Office">' + ['dk1', 'lt1', 'dk2', 'lt2',
  'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
  'hlink', 'folHlink'].map((k) =>
    `<a:${k}><a:srgbClr val="112233"/></a:${k}>`).join('') +
  '</a:clrScheme><a:fontScheme name="F">' +
  `<a:majorFont>${maj}</a:majorFont><a:minorFont>${min}</a:minorFont>` +
  '</a:fontScheme></a:themeElements></a:theme>';
const face = (tag, t) => `<a:${tag} typeface="${t}"/>`;
const JP = fonts(
  face('latin', 'Calibri Light') + face('ea', 'Yu Gothic') +
    face('cs', 'Arial') +
    '<a:font script="Jpan" typeface="Yu Gothic Light"/>',
  face('latin', 'Calibri') + face('ea', 'MS Mincho') +
    face('cs', 'Times New Roman'));

describe('ThemeRead: East Asian and complex-script fonts', () => {
  it('reads ea and cs of majorFont and minorFont', () => {
    const t = parse(JP);
    assert.equal(t.major, 'Calibri Light');
    assert.equal(t.minor, 'Calibri');
    assert.equal(t.majorEa, 'Yu Gothic');
    assert.equal(t.minorEa, 'MS Mincho');
    assert.equal(t.majorCs, 'Arial');
    assert.equal(t.minorCs, 'Times New Roman');
  });

  it('empty, missing or hostile typefaces are no name', () => {
    for (const x of [themeBytes(), null, '', 'not xml <<', 42,
      fonts(face('latin', 'A'), face('latin', 'B')),
      fonts(face('latin', 'A') + face('ea', '') + face('cs', ''),
        face('latin', 'B') + '<a:ea/><a:cs typeface="x\u0001y"/>'),
      fonts(face('latin', 'A') + face('ea', 'x'.repeat(65)),
        face('latin', 'B') + face('ea', '&lt;b&gt;'))]) {
      const t = parse(x);
      for (const k of ['majorEa', 'minorEa', 'majorCs', 'minorCs']) {
        assert.equal(t[k], '', String(x).slice(0, 40) + ' ' + k);
      }
    }
  });

  it('fontOf: the eastAsia slot by eastAsiaTheme', () => {
    const t = parse(JP);
    const ea = (rf) => fontOf(t, rf, 'eastAsia');
    assert.equal(ea({eastAsiaTheme: 'majorEastAsia'}), 'Yu Gothic');
    assert.equal(ea({eastAsiaTheme: 'minorEastAsia'}), 'MS Mincho');
    // (the theme attribute wins over the typed name)
    assert.equal(ea({eastAsiaTheme: 'minorEastAsia',
      eastAsia: 'SimSun'}), 'MS Mincho');
    assert.equal(ea({eastAsia: 'SimSun'}), 'SimSun');
    // (the reference names the script: majorBidi is the cs face)
    assert.equal(ea({eastAsiaTheme: 'majorBidi'}), 'Arial');
    assert.equal(ea({eastAsiaTheme: 'minorHAnsi'}), 'Calibri');
    assert.equal(ea({ascii: 'Arial', asciiTheme: 'majorHAnsi'}), null);
    assert.equal(ea({}), null);
  });

  it('fontOf: the cs slot by cstheme', () => {
    const t = parse(JP);
    const cs = (rf) => fontOf(t, rf, 'cs');
    assert.equal(cs({cstheme: 'majorBidi'}), 'Arial');
    assert.equal(cs({cstheme: 'minorBidi'}), 'Times New Roman');
    assert.equal(cs({cstheme: 'minorBidi', cs: 'Tahoma'}),
      'Times New Roman');
    assert.equal(cs({cs: 'Tahoma'}), 'Tahoma');
    assert.equal(cs({cstheme: 'minorEastAsia'}), 'MS Mincho');
  });

  it('an empty theme typeface gives null for that slot', () => {
    const t = parse(themeBytes());
    assert.equal(fontOf(t, {eastAsiaTheme: 'minorEastAsia'},
      'eastAsia'), null);
    assert.equal(fontOf(t, {cstheme: 'majorBidi', cs: 'Tahoma'}, 'cs'),
      null);
    assert.equal(fontOf(null, {cstheme: 'minorBidi'}, 'cs'), null);
  });

  it('the Latin slots resolve as before', () => {
    const t = parse(JP);
    assert.equal(fontOf(t, {asciiTheme: 'minorHAnsi'}), 'Calibri');
    assert.equal(fontOf(t, {asciiTheme: 'majorEastAsia'}),
      'Calibri Light');
    assert.equal(fontOf(t, {hAnsiTheme: 'minorBidi'}), 'Calibri');
    assert.equal(fontOf(t, {eastAsiaTheme: 'majorEastAsia'}), null);
    assert.equal(fontOf(t, {ascii: 'Arial', eastAsia: 'SimSun'}),
      'Arial');
    assert.equal(fontOf(t, {asciiTheme: 'minorHAnsi'}, 'ascii'),
      'Calibri');
  });

  it('hostile rFonts and slots never throw', () => {
    const t = parse(JP);
    for (const rf of [null, 42, 'x', [], {eastAsiaTheme: 7},
      {cstheme: {}}, {eastAsiaTheme: 'majorFoo'}, {cs: ''},
      {eastAsia: 3}, {cstheme: 'toString'}]) {
      for (const slot of ['eastAsia', 'cs', 'bogus', undefined, 3]) {
        const v = fontOf(t, rf, slot);
        assert.ok(v === null || typeof v === 'string');
      }
    }
    assert.equal(fontOf({}, {cstheme: 'minorBidi'}, 'cs'), null);
    assert.equal(fontOf(t, {cs: ''}, 'cs'), null);
    assert.equal(fontOf(t, {eastAsiaTheme: 'majorFoo',
      eastAsia: 'SimSun'}, 'eastAsia'), 'SimSun');
  });
});

describe('ThemeWrite keeps the ea and cs typefaces', () => {
  const bytes = new TextEncoder().encode(JP);
  const keep = (out) => {
    assert.ok(out instanceof Uint8Array);
    const t = parse(out);
    assert.equal(t.majorEa, 'Yu Gothic');
    assert.equal(t.minorEa, 'MS Mincho');
    assert.equal(t.majorCs, 'Arial');
    assert.equal(t.minorCs, 'Times New Roman');
    assert.match(new TextDecoder().decode(out),
      /<a:font script="Jpan" typeface="Yu Gothic Light"\/>/);
    return t;
  };
  it('through setFonts', () => {
    const t = keep(setFonts(bytes, {major: 'Georgia', minor: 'Arial'}));
    assert.equal(t.major, 'Georgia');
    assert.equal(t.minor, 'Arial');
  });
  it('through setColors', () => {
    keep(setColors(bytes, COLOR_SCHEMES[1]));
  });
  it('through both, twice', () => {
    let b = setFonts(bytes, {major: 'A', minor: 'B'});
    b = setColors(b, COLOR_SCHEMES[2]);
    b = setFonts(b, {major: 'Calibri Light', minor: 'Calibri'});
    keep(b);
  });
});
