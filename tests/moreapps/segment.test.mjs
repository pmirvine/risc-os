import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {graphemes, nextBoundary, prevBoundary, wordBounds, nextWord,
  prevWord} from '../../tools/moreapps/!WimpLib/Segment';

describe('Segment', () => {
  it('graphemes keeps an emoji (surrogate pair) whole', () => {
    assert.deepEqual(graphemes('a\u{1F600}b'), [0, 1, 3, 4]);
  });
  it('keeps e + combining acute whole', () => {
    assert.deepEqual(graphemes('aéb'), [0, 1, 3, 4]);
  });
  it('keeps a ZWJ family emoji whole', () => {
    const fam = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    assert.deepEqual(graphemes('x' + fam), [0, 1, 1 + fam.length]);
  });
  it('a newline is its own boundary', () => {
    assert.deepEqual(graphemes('a\nb'), [0, 1, 2, 3]);
  });
  it('empty text has the one boundary 0', () => {
    assert.deepEqual(graphemes(''), [0]);
  });
  it('nextBoundary/prevBoundary clamp at 0 and length', () => {
    const t = 'a\u{1F600}b';
    assert.equal(nextBoundary(t, 0), 1);
    assert.equal(nextBoundary(t, 1), 3);
    assert.equal(nextBoundary(t, 2), 3);
    assert.equal(nextBoundary(t, 4), 4);
    assert.equal(prevBoundary(t, 3), 1);
    assert.equal(prevBoundary(t, 0), 0);
    assert.equal(prevBoundary(t, 2), 1);
    assert.equal(prevBoundary(t, 99), 4);
  });
  it('wordBounds on "hello world" at 2, 5, 6, 11', () => {
    const t = 'hello world';
    assert.deepEqual(wordBounds(t, 2), {from: 0, to: 5});
    assert.deepEqual(wordBounds(t, 5), {from: 5, to: 6});
    assert.deepEqual(wordBounds(t, 6), {from: 6, to: 11});
    assert.deepEqual(wordBounds(t, 11), {from: 6, to: 11});
    assert.deepEqual(wordBounds('', 0), {from: 0, to: 0});
  });
  it('wordBounds takes a run of spaces and punctuation whole', () => {
    assert.deepEqual(wordBounds('hi, you', 3), {from: 2, to: 4});
  });
  it('nextWord skips spaces and punctuation like Word', () => {
    const t = 'hello, world';
    assert.equal(nextWord(t, 0), 7);
    assert.equal(nextWord(t, 3), 7);
    assert.equal(nextWord(t, 7), 12);
    assert.equal(nextWord(t, 12), 12);
  });
  it('prevWord', () => {
    const t = 'hello, world';
    assert.equal(prevWord(t, 12), 7);
    assert.equal(prevWord(t, 9), 7);
    assert.equal(prevWord(t, 7), 0);
    assert.equal(prevWord(t, 0), 0);
  });
  it('100k-character text segments in under 200 ms', () => {
    const t = 'word '.repeat(20000);
    const t0 = performance.now();
    graphemes(t);
    wordBounds(t, 50000);
    nextWord(t, 10);
    assert.ok(performance.now() - t0 < 200);
  });
  it('repeated calls on one paragraph reuse the segmentation', () => {
    let n = 0;
    const seg = {segment: (s) => (n++, new Intl.Segmenter().segment(s))};
    const t = 'abc def';
    nextBoundary(t, 0, seg); nextBoundary(t, 1, seg);
    assert.equal(n, 1);
  });
  it('an injected segmenter is used', () => {
    const seg = {segment: () => [{index: 0, segment: 'abc'},
      {index: 3, segment: 'd'}]};
    assert.deepEqual(graphemes('abcd', seg), [0, 3, 4]);
  });
  it('graphemes returns a frozen array', () => {
    assert.ok(Object.isFrozen(graphemes('abc')));
  });
  it('texts over 4096 chars are not cached', () => {
    let n = 0;
    const seg = {segment: (s) => (n++, new Intl.Segmenter().segment(s))};
    const t = 'a'.repeat(5000);
    nextBoundary(t, 0, seg); nextBoundary(t, 1, seg);
    assert.equal(n, 2);
  });
});
