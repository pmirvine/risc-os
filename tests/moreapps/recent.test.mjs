// Recent: !Word's list of recent files (pure): newest first, 8 at
// most, no duplicates (case ignored, by the key given: the canonical
// path), hostile entries dropped; the menu's names.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {MAX, clean, add, fromChoices, shown, labels}
  from '../../tools/moreapps/!Word/Recent';

const A = 'RAM::RamDisc0.$.A', B = 'RAM::RamDisc0.$.B';
const C = 'ADFS::HardDisc4.$.Docs.C';

describe('add', () => {
  it('puts the path first, moving it from where it was', () => {
    assert.deepEqual(add([], A), [A]);
    assert.deepEqual(add([A, B], B), [B, A]);
    assert.deepEqual(add([A, B, C], C), [C, A, B]);
  });
  it('keeps 8 at most, dropping the oldest', () => {
    const l = [];
    let r = l;
    for (let i = 0; i < 12; i++) r = add(r, `RAM::RamDisc0.$.F${i}`);
    assert.equal(MAX, 8);
    assert.equal(r.length, 8);
    assert.equal(r[0], 'RAM::RamDisc0.$.F11');
    assert.equal(r[7], 'RAM::RamDisc0.$.F4');
    assert.deepEqual(l, [], 'the list given is not changed');
  });
  it('dedupes case-insensitively, the newest spelling kept', () => {
    assert.deepEqual(add([A, B], 'ram::ramdisc0.$.a'),
      ['ram::ramdisc0.$.a', B]);
  });
  it('dedupes by the key given (the canonical path)', () => {
    const key = (p) => p.replace(/^RAM::0\./, 'RAM::RamDisc0.')
      .toLowerCase();
    assert.deepEqual(add([A, B], 'RAM::0.$.A', key),
      ['RAM::0.$.A', B]);
  });
  it('a key that throws drops that entry', () => {
    const key = (p) => {
      if (p.includes('Bad')) throw new Error('no');
      return p.toLowerCase();
    };
    assert.deepEqual(add([A, 'RAM::RamDisc0.$.Bad', B], C, key),
      [C, A, B]);
  });
  it('a hostile path to add is not added', () => {
    assert.deepEqual(add([A], '__proto__'), [A]);
    assert.deepEqual(add([A], null), [A]);
    assert.deepEqual(add([A], 42), [A]);
    assert.deepEqual(add('junk', A), [A]);
  });
});

describe('clean', () => {
  it('drops non-strings, empty, odd and control-character names', () => {
    const r = clean([A, 3, null, {}, [], '', '__proto__',
      'constructor', 'Plain', 'RAM::RamDisc0.$.X\x00Y', B,
      'x'.repeat(2000) + '$', true]);
    assert.deepEqual(r, [A, B]);
  });
  it('anything but an array is an empty list', () => {
    for (const v of [undefined, null, 'RAM::RamDisc0.$.A', 7, {},
      {length: 3, 0: A}, true]) {
      assert.deepEqual(clean(v), []);
    }
  });
  it('10,000 entries: the first 8 different ones, quickly', () => {
    const big = [];
    for (let i = 0; i < 10000; i++) big.push(`RAM::RamDisc0.$.F${i % 20}`);
    const t = performance.now();
    const r = clean(big);
    assert.ok(performance.now() - t < 2000);   // (loose: a loaded machine)
    assert.equal(r.length, 8);
    assert.equal(new Set(r).size, 8);
    assert.equal(r[0], 'RAM::RamDisc0.$.F0');
  });
  it('a list of 10,000 hostile entries is empty, quickly', () => {
    const big = new Array(10000).fill('__proto__');
    const t = performance.now();
    assert.deepEqual(clean(big), []);
    assert.ok(performance.now() - t < 2000);   // (loose: a loaded machine)
  });
});

describe('fromChoices', () => {
  it('the recent list of the choices read, cleaned', () => {
    assert.deepEqual(fromChoices({recent: [A, A.toLowerCase(), B]}),
      [A, B]);
  });
  it('missing, corrupt or hostile choices: an empty list', () => {
    for (const v of [undefined, null, 5, 'x', [], {}, {recent: 'x'},
      {recent: {0: A}}, JSON.parse('{"__proto__": {"recent": ["a"]}}'),
      {recent: null}]) {
      assert.deepEqual(fromChoices(v), []);
    }
    assert.equal(Object.prototype.recent, undefined);
  });
});

describe('shown', () => {
  it('only the files that exist (exists may throw)', () => {
    const exists = (p) => {
      if (p === C) throw new Error('bad');
      return p === A;
    };
    assert.deepEqual(shown([A, B, C], exists), [A]);
    assert.deepEqual(shown(null, exists), []);
  });
});

describe('labels', () => {
  it('the leaf names', () => {
    assert.deepEqual(labels([A, C]), ['A', 'C']);
  });
  it('two files with the same leaf: their paths, cut to 40', () => {
    const long = 'ADFS::HardDisc4.$.' + 'Deep.'.repeat(12) + 'A';
    const r = labels([A, long, B]);
    assert.equal(r[0], A);
    assert.equal(r[1].length, 40);
    assert.ok(r[1].startsWith('...') && r[1].endsWith('.Deep.A'));
    assert.equal(r[2], 'B');
  });
});
