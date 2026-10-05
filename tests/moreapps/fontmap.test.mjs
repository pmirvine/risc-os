// FontMap: Word font names to bundled metric-compatible fonts.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {substitute, fontFiles, fontFile}
  from '../../tools/moreapps/!Word/FontMap';

describe('FontMap.substitute', () => {
  const fam = (n) => substitute(n).family;
  it('maps Word fonts to metric-compatible families', () => {
    assert.equal(fam('Calibri'), 'Carlito');
    assert.equal(fam('Calibri Light'), 'Carlito');
    assert.equal(fam('Cambria'), 'Caladea');
    assert.equal(fam('Arial'), 'Liberation Sans');
    assert.equal(fam('Helvetica'), 'Liberation Sans');
    assert.equal(fam('Times New Roman'), 'Liberation Serif');
    assert.equal(fam('Times'), 'Liberation Serif');
    assert.equal(fam('Courier New'), 'Liberation Mono');
    assert.equal(fam('Courier'), 'Liberation Mono');
  });
  it('ignores case and surrounding space', () => {
    assert.equal(fam('  cALIBRI '), 'Carlito');
    assert.equal(fam('TIMES NEW ROMAN'), 'Liberation Serif');
  });
  it('keeps RISC OS names with fallbacks', () => {
    assert.deepEqual(substitute('Homerton'), {family: 'Homerton',
      css: '"Homerton", "Liberation Sans", sans-serif'});
    assert.deepEqual(substitute('Trinity'), {family: 'Trinity',
      css: '"Trinity", "Liberation Serif", serif'});
    assert.deepEqual(substitute('Corpus'), {family: 'Corpus',
      css: '"Corpus", "Liberation Mono", monospace'});
  });
  it('handles generic names', () => {
    assert.match(substitute('serif').css, /serif$/);
    assert.match(substitute('sans-serif').css, /sans-serif$/);
    assert.match(substitute('Monospace').css, /monospace$/);
  });
  it('quotes unknown names with a generic fallback', () => {
    assert.deepEqual(substitute('Comic Sans MS'), {family: 'Comic Sans MS',
      css: '"Comic Sans MS", "Liberation Sans", sans-serif'});
    assert.match(substitute('Calibri').css, /sans-serif$/);
    assert.match(substitute('Cambria').css, /serif$/);
    assert.match(substitute('Courier New').css, /monospace$/);
  });
  it('cannot be broken out of by hostile names', () => {
    for (const n of ['a"; x: y', 'a\\"; x: y', 'x\\', '"', 'a\n}']) {
      const {family, css} = substitute(n);
      assert.ok(!family.includes('"') && !family.includes('\\'));
      const m = css.match(/^"([^"\\]*)"(, "Liberation Sans")?, sans-serif$/);
      assert.ok(m, css);
    }
  });
});

describe('FontMap odd names', () => {
  const NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty',
    'valueOf', 'prototype', '__defineGetter__', 'isPrototypeOf'];
  const variants = (n) => [n, n.toUpperCase(), ` ${n} `, n + ' x',
    n[0].toUpperCase() + n.slice(1)];
  it('never throws on Object.prototype member names', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    for (const n of NAMES) for (const v of variants(n)) {
      const r = substitute(v);
      assert.equal(typeof r.family, 'string');
      assert.match(r.css, /(sans-serif|serif|monospace)$/);
    }
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(),
      before);
    assert.equal(({}).polluted, undefined);
    assert.equal(fontFile('constructor', false, false), null);
    assert.equal(fontFile('__proto__', true, true), null);
  });
  it('survives non-string input', () => {
    for (const v of [null, undefined, 5, {}, [], ['Calibri'], true,
      {toString() { throw new Error('x'); }}, Symbol('s')]) {
      const r = substitute(v);
      assert.match(r.css, /(sans-serif|serif|monospace)$/);
    }
  });
  it('maps empty and quote-only names to the default', () => {
    for (const n of ['', '"', '   ', '"\\"', '<>'])
      assert.deepEqual(substitute(n), {family: 'Liberation Sans',
        css: '"Liberation Sans", sans-serif'}, JSON.stringify(n));
  });
  it('strips angle brackets and control characters', () => {
    const r = substitute('a<b>c\u0007d\u0085');
    assert.equal(r.family, 'abcd');
    assert.ok(!/[<>]/.test(r.css));
  });
  it('fuzz: well-formed output for 500 random strings', () => {
    let seed = 12345;
    const rnd = (n) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    const alphabet = 'aB "\\<>;{}\n\t\u0000\u00e9\u2028()/*:\'';
    for (let i = 0; i < 500; i++) {
      let n = '';
      if (i % 5 === 0) n = NAMES[rnd(NAMES.length)];
      else for (let k = rnd(12); k > 0; k--) n += alphabet[rnd(alphabet.length)];
      const {family, css} = substitute(n);
      assert.match(css,
        /^"[^"\\<>\u0000-\u001f\u007f-\u009f]+"(, "[A-Za-z ]+")?, (sans-serif|serif|monospace)$|^(sans-serif|serif|monospace)$/,
        JSON.stringify(n) + ' -> ' + css);
      assert.equal(typeof family, 'string');
    }
  });
});

describe('FontMap.fontFiles', () => {
  it('lists 20 unique names', () => {
    const f = fontFiles();
    assert.equal(f.length, 20);
    assert.equal(new Set(f).size, 20);
    assert.ok(f.includes('Carlito-BoldItalic'));
    assert.ok(f.includes('LiberationMono-Regular'));
    assert.ok(f.includes('Caladea-Italic'));
  });
  it('fontFile picks the style or null', () => {
    assert.equal(fontFile('Carlito', false, false), 'Carlito-Regular');
    assert.equal(fontFile('Carlito', true, false), 'Carlito-Bold');
    assert.equal(fontFile('Liberation Sans', false, true),
      'LiberationSans-Italic');
    assert.equal(fontFile('Liberation Serif', true, true),
      'LiberationSerif-BoldItalic');
    assert.equal(fontFile('Homerton', false, false), null);
  });
});
