// NumFormat and BulletGlyph: Word's number formats for list labels
// and the bullet characters of Symbol / Wingdings / private use.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {formatNumber, fmtOf, LABEL_CAP, capLabel}
  from '../../tools/moreapps/!Word/NumFormat';
import {glyphFor, bulletText}
  from '../../tools/moreapps/!Word/BulletGlyph';

const f = formatNumber;

describe('NumFormat: decimal and decimalZero', () => {
  it('decimal', () => {
    assert.equal(f(1, 'decimal'), '1');
    assert.equal(f(0, 'decimal'), '0');
    assert.equal(f(-3, 'decimal'), '-3');
    assert.equal(f(1234567, 'decimal'), '1234567');
  });
  it('decimalZero pads 0..9 to two digits', () => {
    assert.deepEqual([0, 1, 9, 10, 11, 100].map((n) =>
      f(n, 'decimalZero')), ['00', '01', '09', '10', '11', '100']);
    assert.equal(f(-1, 'decimalZero'), '-1');
  });
  it('absurd numbers: 2^31 exactly, no overflow or NaN', () => {
    assert.equal(f(2 ** 31, 'decimal'), '2147483648');
    assert.equal(f(-(2 ** 31), 'decimal'), '-2147483648');
    assert.equal(f(2 ** 31 + 5, 'ordinal'), '2147483653rd');
    assert.equal(f(2 ** 31, 'upperRoman'), '2147483648');
    assert.equal(f(NaN, 'decimal'), '0');
    assert.equal(f(Infinity, 'lowerLetter'), '0');
    assert.equal(f(1.5, 'decimal'), '0');
  });
});

describe('NumFormat: letters (Word repeats the letter)', () => {
  it('1..30', () => {
    const want = 'abcdefghijklmnopqrstuvwxyz'.split('')
      .concat(['aa', 'bb', 'cc', 'dd']);
    for (let n = 1; n <= 30; n++)
      assert.equal(f(n, 'lowerLetter'), want[n - 1], 'n=' + n);
    assert.equal(f(27, 'upperLetter'), 'AA');
    assert.equal(f(28, 'upperLetter'), 'BB');
  });
  it('52 = zz, 53 = aaa, 78 = zzz, 79 = aaaa', () => {
    assert.equal(f(52, 'lowerLetter'), 'zz');
    assert.equal(f(53, 'lowerLetter'), 'aaa');
    assert.equal(f(78, 'lowerLetter'), 'zzz');
    assert.equal(f(79, 'upperLetter'), 'AAAA');
  });
  it('0 and negatives fall back to decimal', () => {
    assert.equal(f(0, 'lowerLetter'), '0');
    assert.equal(f(-2, 'upperLetter'), '-2');
  });
  it('huge numbers stop at the label cap', () => {
    const s = f(2 ** 31, 'lowerLetter');
    assert.equal(s.length, LABEL_CAP);
    assert.match(s, /^([a-z])\1*$/);
  });
});

describe('NumFormat: roman', () => {
  const R = [[1, 'I'], [4, 'IV'], [9, 'IX'], [14, 'XIV'], [40, 'XL'],
    [90, 'XC'], [400, 'CD'], [1994, 'MCMXCIV'], [3999, 'MMMCMXCIX']];
  it('upper and lower to 3999', () => {
    for (const [n, s] of R) {
      assert.equal(f(n, 'upperRoman'), s);
      assert.equal(f(n, 'lowerRoman'), s.toLowerCase());
    }
  });
  it('4000 and up, 0 and negatives are decimal', () => {
    assert.equal(f(4000, 'upperRoman'), '4000');
    assert.equal(f(0, 'lowerRoman'), '0');
    assert.equal(f(-5, 'lowerRoman'), '-5');
  });
});

describe('NumFormat: ordinal, bullet, none, unknown', () => {
  it('ordinal suffixes', () => {
    const want = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th',
      12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd',
      101: '101st', 111: '111th', 112: '112th', 0: '0th'};
    for (const [n, s] of Object.entries(want))
      assert.equal(f(Number(n), 'ordinal'), s);
    assert.equal(f(-1, 'ordinal'), '-1');
  });
  it('bullet and none give no number', () => {
    assert.equal(f(3, 'bullet'), '');
    assert.equal(f(3, 'none'), '');
  });
  it('unknown or missing numFmt is decimal', () => {
    for (const x of ['chineseCounting', 'cardinalText', undefined,
      '', '__proto__', 'constructor'])
      assert.equal(f(12, x), '12');
    assert.equal(fmtOf('ordinalText'), 'decimal');
    assert.equal(fmtOf(undefined), 'decimal');
    assert.equal(fmtOf('upperRoman'), 'upperRoman');
    assert.equal(fmtOf('bullet'), 'bullet');
  });
  it('capLabel keeps at most 40 units, never half a pair', () => {
    assert.equal(capLabel('x'.repeat(100)).length, 40);
    assert.equal(capLabel('abc'), 'abc');
    const s = 'x'.repeat(39) + '\u{1F600}';
    assert.equal(capLabel(s), 'x'.repeat(39));
  });
});

describe('BulletGlyph', () => {
  const T = [
    ['\uF0B7', undefined, '\u2022'], ['\u00B7', 'Symbol', '\u2022'],
    ['\u00B7', undefined, '\u2022'], ['\u2022', 'Arial', '\u2022'],
    ['\uF0A7', 'Wingdings', '\u25AA'], ['o', 'Courier New', '\u25E6'],
    ['o', undefined, '\u25E6'], ['\uF0D8', 'Wingdings', '\u27A2'],
    ['\uF0FC', 'Wingdings', '\u2713'], ['\uF076', 'Wingdings', '\u25C6'],
    ['\uF0A8', 'Wingdings', '\u25FB'], ['\uF06E', 'Wingdings', '\u25A0'],
    ['\uF06C', 'Wingdings', '\u25CF'], ['\uF0E0', 'Wingdings', '\u2022'],
    ['\uF000', undefined, '\u2022'], ['\uE123', undefined, '\u2022'],
    ['-', 'Arial', '-'], ['\u2013', undefined, '\u2013'],
    ['>', undefined, '>'], ['*', 'Calibri', '*'],
  ];
  it('the mapping table', () => {
    for (const [c, font, want] of T)
      assert.equal(glyphFor(c, font), want,
        `${c.codePointAt(0).toString(16)} ${font}`);
  });
  it('Wingdings / Symbol code given as a plain character', () => {
    assert.equal(glyphFor('\u00A7', 'Wingdings'), '\u25AA');
    assert.equal(glyphFor('\u00D8', 'Wingdings'), '\u27A2');
    assert.equal(glyphFor('\u00FC', 'Wingdings'), '\u2713');
    assert.equal(glyphFor('v', 'Wingdings'), '\u25C6');
    assert.equal(glyphFor('l', 'wingdings'), '\u25CF');
    assert.equal(glyphFor('\u00B7', 'Symbol'), '\u2022');
    // the same characters in a text font are themselves
    assert.equal(glyphFor('v', 'Arial'), 'v');
    assert.equal(glyphFor('\u00A7', 'Arial'), '\u00A7');
  });
  it('documented choices: o is always a circle, F0B7 in any font',
    () => {
      // Word's 'o' bullet is Courier New; a plain 'o' in any font is
      // shown as a white bullet, U+25E6, too (a letter o bullet is
      // rare; owner: Word's level-1 bullet is drawn as U+25E6)
      for (const font of ['Courier New', 'Arial', undefined])
        assert.equal(glyphFor('o', font), '\u25E6');
      // U+F0B7 is Symbol's bullet; Word often gives no font or
      // Wingdings for it: always a bullet
      for (const font of ['Symbol', 'Wingdings', 'Arial', undefined])
        assert.equal(glyphFor('\uF0B7', font), '\u2022');
      // 0xB7 as a plain code in Wingdings is a bullet too
      assert.equal(glyphFor('\u00B7', 'Wingdings'), '\u2022');
    });
  it('bulletText maps every character, caps the length', () => {
    assert.equal(bulletText('\uF0B7', 'Symbol'), '\u2022');
    assert.equal(bulletText('', 'Symbol'), '');
    assert.equal(bulletText(undefined, 'Symbol'), '');
    assert.equal(bulletText('\uF0B7'.repeat(100)).length, LABEL_CAP);
    assert.equal(bulletText('->', 'Arial'), '->');
  });
});
