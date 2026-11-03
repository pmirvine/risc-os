import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {decoderFor, known, fcharsetToCpg, encodeAscii}
  from '../../tools/moreapps/!WimpLib/RtfCodepage';

describe('RtfCodepage decoders', () => {
  it('ASCII is the same in all of them', () => {
    for (const cp of [1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257,
      1258, 437, 850, 10000]) {
      const d = decoderFor(cp);
      for (let b = 0; b < 0x80; b++) {
        assert.equal(d(b), String.fromCharCode(b), cp + ' ' + b);
      }
    }
  });
  it('cp1252: 0x80 is the euro, 0x9F Y diaeresis, 0xE9 e acute', () => {
    const d = decoderFor(1252);
    assert.equal(d(0x80), '\u20ac');
    assert.equal(d(0x9f), '\u0178');
    assert.equal(d(0xe9), '\u00e9');
    assert.equal(d(0x93), '\u201c');
  });
  it('Greek, Cyrillic, Central European', () => {
    assert.equal(decoderFor(1253)(0xe1), '\u03b1');
    assert.equal(decoderFor(1251)(0xcf), '\u041f');
    assert.equal(decoderFor(1251)(0xff), '\u044f');
    assert.equal(decoderFor(1250)(0xe8), '\u010d');
  });
  it('the other pages', () => {
    assert.equal(decoderFor(1255)(0xe0), '\u05d0');
    assert.equal(decoderFor(1256)(0xc7), '\u0627');
    assert.equal(decoderFor(1254)(0xf0), '\u011f');
    assert.equal(decoderFor(437)(0x80), '\u00c7');
    assert.equal(decoderFor(437)(0xe1), '\u00df');
    assert.equal(decoderFor(850)(0xd5), '\u0131');
    assert.equal(decoderFor(10000)(0x8e), '\u00e9');
    assert.equal(decoderFor(10000)(0xa5), '\u2022');
  });
  it('every byte of every page gives one UTF-16 unit', () => {
    for (const cp of [1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257,
      1258, 437, 850, 10000]) {
      const d = decoderFor(cp);
      for (let b = 0; b < 256; b++) {
        assert.equal(d(b).length, 1, cp + ' ' + b);
      }
    }
  });
  it('known pages and the 1252 fallback', () => {
    assert.ok(known(1251) && known(437) && known(10000));
    assert.ok(!known(932) && !known(0) && !known(undefined));
    assert.equal(decoderFor(932)(0x80), '\u20ac');
    assert.equal(decoderFor(undefined)(0xe9), '\u00e9');
  });
});

describe('fcharsetToCpg', () => {
  it('maps the common charsets', () => {
    assert.equal(fcharsetToCpg(0), 1252);
    assert.equal(fcharsetToCpg(238), 1250);
    assert.equal(fcharsetToCpg(204), 1251);
    assert.equal(fcharsetToCpg(161), 1253);
    assert.equal(fcharsetToCpg(162), 1254);
    assert.equal(fcharsetToCpg(177), 1255);
    assert.equal(fcharsetToCpg(178), 1256);
    assert.equal(fcharsetToCpg(186), 1257);
    assert.equal(fcharsetToCpg(163), 1258);
    assert.equal(fcharsetToCpg(77), 10000);
    assert.equal(fcharsetToCpg(255), 850);
    assert.equal(fcharsetToCpg(254), 437);
  });
  it('gives null for the rest', () => {
    assert.equal(fcharsetToCpg(128), null);
    assert.equal(fcharsetToCpg(2), null);
    assert.equal(fcharsetToCpg('x'), null);
  });
});

describe('encodeAscii', () => {
  it('the exact output for a{b}\\e acute and an emoji', () => {
    assert.deepEqual(encodeAscii('a{b}\\\u00e9\ud83d\ude00'),
      {rtf: 'a\\{b\\}\\\\\\u233?\\u-10179?\\u-8704?', count: 3});
  });
  it('plain text passes; tab and newline stay; controls go', () => {
    assert.deepEqual(encodeAscii('hi there'),
      {rtf: 'hi there', count: 0});
    assert.deepEqual(encodeAscii('a\tb\nc\u0001\u0007d'),
      {rtf: 'a\tb\ncd', count: 0});
  });
  it('a bullet and a lone surrogate', () => {
    assert.equal(encodeAscii('\u2022').rtf, '\\u8226?');
    assert.equal(encodeAscii('\ud83d').count, 1);
  });
});
