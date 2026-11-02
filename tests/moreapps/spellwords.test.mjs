// SpellWords: the paragraph word splitter.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {words} from '../../tools/moreapps/!Letters/SpellWords';

const w = (t) => words(t).map((x) => x.word);
const best = (f) => {
  f();
  let m = Infinity;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    f();
    m = Math.min(m, performance.now() - t);
  }
  return m;
};

describe('SpellWords', () => {
  it('keeps apostrophes inside a word', () => {
    assert.deepEqual(w("don't"), ["don't"]);
    assert.deepEqual(w('don’t'), ['don’t']);
    assert.deepEqual(w("O'Neil"), ["O'Neil"]);
  });
  it('rule: a hyphenated compound yields its parts', () => {
    assert.deepEqual(w('well-known'), ['well', 'known']);
    assert.deepEqual(w('a co-op'), ['a', 'co', 'op']);
  });
  it('skips what is not a word to look up', () => {
    for (const t of ['e.g.', '3rd', '2024', 'a1b2', 'ABC',
      'http://x.y/z', 'a@b.co', 'www.example.com'])
      assert.deepEqual(w(t), [], t);
  });
  it('rule: all-caps of 2 to 6 letters are acronyms', () => {
    assert.deepEqual(w('AB ABCDEF ABCDEFG'), ['ABCDEFG']);
    assert.deepEqual(w('I A'), ['I', 'A']);
  });
  it('leaves quotes outside', () => {
    assert.deepEqual(words("'quoted'"),
      [{from: 1, to: 7, word: 'quoted'}]);
  });
  it('splits at the inline item placeholder', () => {
    const r = words('ab￼cd ￼');
    assert.deepEqual(r, [{from: 0, to: 2, word: 'ab'},
      {from: 3, to: 5, word: 'cd'}]);
  });
  it('never returns CJK or emoji', () => {
    assert.deepEqual(w('中文 \u{1F600} café'), ['café']);
  });
  it('has exact offsets with surrogates and combining marks', () => {
    const t = '\u{1F600} école \u{1F600}hello';
    for (const x of words(t)) assert.equal(t.slice(x.from, x.to), x.word);
    assert.deepEqual(w(t), ['école', 'hello']);
  });
  it('keeps words next to an address', () => {
    assert.deepEqual(w('foo,http://bar baz'), ['foo', 'baz']);
    assert.deepEqual(w('see:www.example.com now'), ['see', 'now']);
    assert.deepEqual(w('(user@example.com)'), []);
    assert.deepEqual(w('(http://x/y?a=b,c)'), []);
    assert.deepEqual(w('foo(www.x.com)bar'), ['foo', 'bar']);
    assert.deepEqual(w('mail me@x.com now'), ['mail', 'now']);
    for (const t of ['foo,http://bar baz', 'foo(www.x.com)bar'])
      for (const x of words(t)) assert.equal(t.slice(x.from, x.to), x.word);
  });
  it('ignores format characters inside a word', () => {
    for (const t of ['co\u00ADop', 'foo\u200Dbar', 'a\u2060b',
      'a\uFEFFb']) {
      const r = words(t);
      assert.deepEqual(r, [{from: 0, to: t.length, word: t}], t);
    }
  });
  it('keeps a Latin word beside other scripts', () => {
    assert.deepEqual(w('Hello\u4e16\u754c and mixed\u4e2dEnglish words'),
      ['Hello', 'and', 'mixed', 'English', 'words']);
    assert.deepEqual(w('Z\u4e2d'), ['Z']);
    assert.deepEqual(w('\u00e9ABCABC\u4e2d'), ['\u00e9ABCABC']);
    assert.deepEqual(w('a\u4e2d'), ['a']);
    assert.deepEqual(w('ok\u{1F600} \u03b1\u03b2 hi \u0436'),
      ['ok', 'hi']);
  });
  it('ignores U+200B and U+200C inside a word', () => {
    for (const t of ['ab\u200Bcd', 'ab\u200Ccd'])
      assert.deepEqual(words(t), [{from: 0, to: 5, word: t}], t);
  });
  it('drops a possessive after an address', () => {
    assert.deepEqual(w("Ask me@x.com's team"), ['Ask', 'team']);
    assert.deepEqual(w("foo'bar@x.com ok"), ['ok']);
    assert.deepEqual(w("'me@x.com' ok"), ['ok']);
  });
  it('keeps a word glued after an address by a comma in it', () => {
    assert.deepEqual(w('http://x.com,thanks www.x.com;and'), []);
  });
  it('holds its invariants on random text', () => {
    const bits = ['a', 'B', "'", '\u2019', '-', '.', ',', '@', ':', '/',
      '://', 'www.', ' ', '\uFFFC', '\u00AD', '\u200B', '\u200D',
      '\uFEFF', '\u4e2d', '\u03b1', '\u0436', '\u{1F600}', '\u0301',
      '1', '(', ')', 'http', 'e\u0301', '\ud83d'];
    let seed = 12345;
    const rnd = (n) => (seed = (seed * 1103515245 + 12345) >>> 0) % n;
    for (let k = 0; k < 4000; k++) {
      let t = '';
      for (let i = rnd(30); i > 0; i--) t += bits[rnd(bits.length)];
      let prev = 0;
      for (const r of words(t)) {
        assert.equal(t.slice(r.from, r.to), r.word, t);
        assert.ok(r.from >= prev && r.to > r.from, t);
        assert.ok(!r.word.includes('\uFFFC'), t);
        prev = r.to;
      }
    }
  });
  it('is empty for empty text', () => {
    assert.deepEqual(words(''), []);
  });
  it('is fast on long runs', () => {
    for (const t of ['a'.repeat(100000), 'ab '.repeat(33000),
      "a'".repeat(50000), '￼'.repeat(100000)])
      assert.ok(best(() => words(t)) < 100);
  });
});

describe('plainWord and wordKey', () => {
  it('format characters out, U+2019 straight, lower case', async () => {
    const {plainWord, wordKey} =
      await import('../../tools/moreapps/!Letters/SpellWords');
    assert.equal(plainWord('O’Ha­ra​﻿'), "O'Hara");
    assert.equal(wordKey('O’HA‌‍⁠RA'), "o'hara");
    assert.equal(wordKey("o'hara"), "o'hara");
    assert.equal(plainWord(''), '');
  });
});
