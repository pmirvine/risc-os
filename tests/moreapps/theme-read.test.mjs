// ThemeRead: the theme's fonts and colours, and their use on screen.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parse, fontOf, colorOf}
  from '../../tools/moreapps/!Letters/ThemeRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {substitute} from '../../tools/moreapps/!Letters/FontMap';
import {resolver, charOf} from '../../tools/moreapps/!Letters/FormatEff';
import {runFmt} from '../../tools/moreapps/!Letters/Fmt';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const THEME = '<?xml version="1.0" encoding="UTF-8"?>' +
  `<a:theme xmlns:a="${A}" name="T"><a:themeElements>` +
  '<a:clrScheme name="C"><a:dk1><a:sysClr val="windowText" ' +
  'lastClr="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="112233"/></a:dk2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme>' +
  '<a:fontScheme name="F"><a:majorFont><a:latin typeface="Cambria"/>' +
  '</a:majorFont><a:minorFont><a:latin typeface="Verdana"/>' +
  '</a:minorFont></a:fontScheme></a:themeElements></a:theme>';

describe('ThemeRead', () => {
  it('parses major and minor latin fonts', () => {
    const t = parse(THEME);
    assert.equal(t.major, 'Cambria');
    assert.equal(t.minor, 'Verdana');
    assert.equal(t.colors.get('dk1'), '000000');
    assert.equal(t.colors.get('dk2'), '112233');
    assert.equal(parse(new TextEncoder().encode(THEME)).minor,
      'Verdana');
  });

  it('defaults on empty, non-XML and missing minorFont', () => {
    for (const x of [null, '', '   ', 'not xml <<', '<a:theme/>',
      '<a', new Uint8Array([0xff, 0xfe, 0]), 42]) {
      const t = parse(x);
      assert.equal(t.major, 'Calibri Light');
      assert.equal(t.minor, 'Calibri');
      assert.equal(t.colors.get('accent1'), '4472C4');
      assert.equal(t.colors.get('folHlink'), '954F72');
    }
    const half = THEME.replace(/<a:minorFont>.*<\/a:minorFont>/, '');
    const t = parse(half);
    assert.equal(t.major, 'Cambria');
    assert.equal(t.minor, 'Calibri');
  });

  it('fontOf prefers the theme attribute over ascii', () => {
    const t = parse(THEME);
    assert.equal(fontOf(t, {ascii: 'Arial', asciiTheme: 'majorHAnsi'}),
      'Cambria');
    assert.equal(fontOf(t, {hAnsi: 'Arial', hAnsiTheme: 'minorAscii'}),
      'Verdana');
    assert.equal(fontOf(t, {ascii: 'Arial'}), 'Arial');
    assert.equal(fontOf(t, {asciiTheme: 'bogus', hAnsi: 'Arial'}),
      'Arial');
    assert.equal(fontOf(t, {}), null);
    assert.equal(fontOf(t, null), null);
    assert.equal(fontOf(null, {asciiTheme: 'majorAscii'}),
      'Calibri Light');
  });

  it('colorOf applies tint and shade like Word', () => {
    const t = parse(null);
    // accent1 4472C4 = (68, 114, 196); tint 0x99, t = 153/255 = 0.6:
    // c' = c*t + 255*(1-t): 68*.6+102 = 142.8 -> 8F, 114*.6+102 =
    // 170.4 -> AA, 196*.6+102 = 219.6 -> DC
    assert.equal(colorOf(t, {themeColor: 'accent1', themeTint: '99'}),
      '8FAADC');
    // shade 0xBF, s = 191/255: 68*s = 50.9 -> 33, 114*s = 85.4 ->
    // 55, 196*s = 146.8 -> 93
    assert.equal(colorOf(t, {themeColor: 'accent1', themeShade: 'BF'}),
      '335593');
    assert.equal(colorOf(t, {color: '123456', themeColor: 'accent1'}),
      '4472C4');
    assert.equal(colorOf(t, {themeColor: 'background1'}), 'FFFFFF');
    assert.equal(colorOf(t, {themeColor: 'text2'}), '44546A');
    assert.equal(colorOf(t, {themeColor: 'accent2', themeTint: 153}),
      colorOf(t, {themeColor: 'accent2', themeTint: '99'}));
  });

  it('colorOf ignores an unknown themeColor name', () => {
    const t = parse(THEME);
    assert.equal(colorOf(t, {color: '00ff00', themeColor: 'nope'}),
      '00FF00');
    assert.equal(colorOf(t, {themeColor: 'nope'}), '000000');
    assert.equal(colorOf(t, {themeColor: '__proto__'}), '000000');
    assert.equal(colorOf(t, null), '000000');
  });
});

const doc = (extra = {}) => buildDocx({
  'word/document.xml': documentXml(
    p(r('Head'), '<w:pStyle w:val="Heading1"/>') +
    p(r('Blue', '<w:color w:val="FF0000" w:themeColor="accent1"/>'))),
  'word/styles.xml': stylesXml(
    '<w:style w:type="paragraph" w:styleId="Heading1">' +
    '<w:name w:val="heading 1"/><w:rPr><w:rFonts ' +
    'w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/></w:rPr>' +
    '</w:style>'),
  ...extra,
});
const themed = () => doc({'word/theme/theme1.xml': THEME});

describe('theme in layout and on save', () => {
  it('a heading style is measured in the theme major font', async () => {
    const d = await readDocx(await themed());
    const b = d.sections[0].blocks;
    const f = runFmt(d.styles, b[0], b[0].runs[0]);
    assert.equal(f.family, substitute('Cambria').family);
    assert.equal(f.css.includes(substitute('Cambria').css), true);
    const none = await readDocx(await doc());
    const g = runFmt(none.styles, none.sections[0].blocks[0],
      none.sections[0].blocks[0].runs[0]);
    assert.equal(g.family, substitute('Calibri Light').family);
  });

  it('a themed run colour is painted from the theme', async () => {
    const d = await readDocx(await themed());
    const b = d.sections[0].blocks;
    assert.equal(runFmt(d.styles, b[1], b[1].runs[0]).colour,
      '#4472C4');
  });

  it('theme part kept byte-for-byte on save', async () => {
    const d = await readDocx(await themed());
    const before = d.parts.get('word/theme/theme1.xml');
    assert.ok(before);
    const back = await readDocx(await writeDocx(d, {}));
    assert.deepEqual(back.parts.get('word/theme/theme1.xml'), before);
    assert.equal(new TextDecoder().decode(before), THEME);
  });

  it('charOf (toolbar, clipboard) agrees with the layout', async () => {
    const d = await readDocx(await themed());
    const b = d.sections[0].blocks;
    const res = resolver(d);
    const h = charOf(res.run(b[0], b[0].runs[0].rPr,
      b[0].runs[0].rStyle), b[0], res);
    assert.equal(h.family, 'Cambria');
    assert.equal(substitute(h.family).family,
      runFmt(d.styles, b[0], b[0].runs[0]).family);
    const c = charOf(res.run(b[1], b[1].runs[0].rPr,
      b[1].runs[0].rStyle), b[1], res);
    assert.equal(c.color, '4472C4');
    const n = await readDocx(await doc());
    const r2 = resolver(n);
    const b2 = n.sections[0].blocks;
    assert.equal(charOf(r2.run(b2[0], b2[0].runs[0].rPr), b2[0],
      r2).family, 'Calibri Light');
  });
});
