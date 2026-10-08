// Find: search (forwards, backwards, wrap, case, whole words, emoji,
// combining marks, inline items), count, replaceOne, replaceAll (one
// undo step), against a naive reference scan.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {search, count, replaceOne, replaceAll as replaceAll0, fold,
  prepare, MAX} from '../../tools/moreapps/!Word/Find';
import {Document} from '../../tools/moreapps/!Word/Document';
import {newPara, newSection, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {mk, texts, ids, P, undoable, valid, box, raw, O, bold, plain,
  snap} from './edit-docs.mjs';
import {rng} from './word-docs.mjs';

const at = (s, i, off) => ({s, i, off});
/** replaceAll's count and skipped (its last: tested on its own). */
const replaceAll = (...a) => {
  const {count: c, skipped} = replaceAll0(...a);
  return {count: c, skipped};
};
const pick = (m) => (m ? [m.s, m.i, m.from, m.to] : null);
const link = (text) => raw('hyperlink', 'p', text);

describe('search: plain text', () => {
  const d = mk(['hello world', 'say hello', 'Hello']);
  it('finds the first match from a place', () => {
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'hello',
      {matchCase: true})), [0, 0, 0, 5]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 1), 'hello',
      {matchCase: true})), [0, 1, 4, 9]);
    assert.equal(search(d.doc, at(0, 1, 5), 'hello',
      {matchCase: true}), null);
  });
  it('a match may start at the place itself', () => {
    assert.deepEqual(pick(search(d.doc, at(0, 1, 4), 'hello')),
      [0, 1, 4, 9]);
  });
  it('case: ignored unless matchCase', () => {
    assert.deepEqual(pick(search(d.doc, at(0, 1, 5), 'HELLO')),
      [0, 2, 0, 5]);
    assert.equal(search(d.doc, at(0, 0, 0), 'HELLO',
      {matchCase: true}), null);
  });
  it('from the middle of a paragraph', () => {
    const e = mk(['aXa aXa']);
    assert.deepEqual(pick(search(e.doc, at(0, 0, 2), 'axa')),
      [0, 0, 4, 7]);
  });
  it('regular expression characters are literal', () => {
    const e = mk(['a.b a*b (x) [y] $^ \\d a.*b']);
    for (const n of ['.*', '(x)', '[y]', '$^', '\\d', 'a.*b']) {
      const m = search(e.doc, at(0, 0, 0), n);
      assert.equal(e.doc.sections[0].blocks[0].text.slice(m.from,
        m.to), n);
    }
    assert.equal(search(e.doc, at(0, 0, 0), 'a.c'), null);
  });
  it('an empty needle finds nothing', () => {
    assert.equal(search(d.doc, at(0, 0, 0), ''), null);
    assert.equal(search(d.doc, at(0, 0, 0), '', {wrap: true}), null);
    assert.equal(count(d.doc, ''), 0);
  });
  it('a needle never matches across paragraphs', () => {
    assert.equal(search(d.doc, at(0, 0, 0), 'worldsay'), null);
    assert.equal(search(d.doc, at(0, 0, 0), 'world\nsay'), null);
  });
});

describe('search: backwards and wrap', () => {
  const d = mk(['one two', 'two', 'three two']);
  it('backwards: the last match ending at or before the place', () => {
    assert.deepEqual(pick(search(d.doc, at(0, 2, 9), 'two',
      {backwards: true})), [0, 2, 6, 9]);
    assert.deepEqual(pick(search(d.doc, at(0, 2, 8), 'two',
      {backwards: true})), [0, 1, 0, 3]);
    assert.deepEqual(pick(search(d.doc, at(0, 1, 0), 'two',
      {backwards: true})), [0, 0, 4, 7]);
    assert.equal(search(d.doc, at(0, 0, 6), 'two',
      {backwards: true}), null);
  });
  it('backwards over overlapping matches', () => {
    const e = mk(['aaa']);
    assert.deepEqual(pick(search(e.doc, at(0, 0, 3), 'aa',
      {backwards: true})), [0, 0, 1, 3]);
    assert.deepEqual(pick(search(e.doc, at(0, 0, 2), 'aa',
      {backwards: true})), [0, 0, 0, 2]);
  });
  it('wrap: from the start (the end), saying so', () => {
    const f = search(d.doc, at(0, 2, 9), 'two', {wrap: true});
    assert.deepEqual(pick(f), [0, 0, 4, 7]);
    assert.equal(f.wrapped, true);
    const b = search(d.doc, at(0, 0, 0), 'two',
      {wrap: true, backwards: true});
    assert.deepEqual(pick(b), [0, 2, 6, 9]);
    assert.equal(b.wrapped, true);
    const n = search(d.doc, at(0, 0, 0), 'two', {wrap: true});
    assert.equal(n.wrapped, false);
  });
  it('wrap finds the only match before the place, or none', () => {
    const e = mk(['x needle y']);
    assert.deepEqual(pick(search(e.doc, at(0, 0, 5), 'needle',
      {wrap: true})), [0, 0, 2, 8]);
    assert.equal(search(e.doc, at(0, 0, 5), 'nothing', {wrap: true}),
      null);
  });
});

describe('search: sections, tables, inline items', () => {
  it('goes across sections and passes over kept blocks', () => {
    const doc = mk(['a', box(), 'b find']).doc;
    const s2 = newSection();
    s2.blocks.push(box(), newPara('find in two'));
    doc.sections.push(s2);
    const d = new Document(doc);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'find')),
      [0, 2, 2, 6]);
    assert.deepEqual(pick(search(d.doc, at(0, 2, 3), 'find')),
      [1, 1, 0, 4]);
    assert.deepEqual(pick(search(d.doc, at(1, 1, 0), 'find',
      {backwards: true})), [0, 2, 2, 6]);
    // starting on a kept block
    assert.deepEqual(pick(search(d.doc, at(0, 1, 0), 'find')),
      [0, 2, 2, 6]);
    assert.equal(count(d.doc, 'find'), 2);
  });
  it('an inline is searched as its text: inInline, whole item', () => {
    const d = mk([['see ' + O + ' now', {inlines: {4: link('the link')}}]]);
    const m = search(d.doc, at(0, 0, 0), 'link');
    assert.deepEqual(pick(m), [0, 0, 4, 5]);
    assert.equal(m.inInline, true);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'see the')),
      [0, 0, 0, 5]);
    const n = search(d.doc, at(0, 0, 0), 'now');
    assert.deepEqual(pick(n), [0, 0, 6, 9]);
    assert.equal(n.inInline, false);
    // from after the item: not found again
    assert.deepEqual(pick(search(d.doc, at(0, 0, 5), 'link',
      {wrap: true})), [0, 0, 4, 5]);
    assert.equal(search(d.doc, at(0, 0, 5), 'link'), null);
  });
  it('tab and line break inlines are \\t and \\n; others nothing', () => {
    const d = mk([['a' + O + 'b' + O + 'c' + O + 'd', {inlines: {
      1: {kind: 'tab', level: 'r'}, 3: {kind: 'br', level: 'r', brType: 'textWrapping'},
      5: raw('drawing', 'r')}}]]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'a\tb')),
      [0, 0, 0, 3]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'b\nc')),
      [0, 0, 2, 5]);
    const m = search(d.doc, at(0, 0, 0), 'cd');
    assert.deepEqual(pick(m), [0, 0, 4, 7]);
    assert.equal(m.inInline, true);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'd')),
      [0, 0, 6, 7]);
  });
});

describe('fix round: link text twice, whole words with punctuation', () => {
  it('a link holding the needle twice is one match, as Find walks it', () => {
    const d = mk([['a ' + O + ' cat', {inlines: {2: link('cat cat')}}]]);
    const walk = [];
    for (let m = search(d.doc, at(0, 0, 0), 'cat'); m && walk.length < 9;
      m = search(d.doc, at(0, 0, m.to), 'cat')) walk.push(pick(m));
    assert.deepEqual(walk, [[0, 0, 2, 3], [0, 0, 4, 7]]);
    assert.equal(count(d.doc, 'cat'), walk.length);
    const back = [];
    for (let m = search(d.doc, at(0, 0, 7), 'cat', {backwards: true});
      m && back.length < 9; m = search(d.doc, at(0, 0, m.from), 'cat',
        {backwards: true})) back.push(pick(m));
    assert.deepEqual(back, [[0, 0, 4, 7], [0, 0, 2, 3]]);
    assert.deepEqual(replaceAll(d, 'cat', 'dog'), {count: 1, skipped: 1});
  });
  it('whole words: an end that is punctuation or space needs no edge', () => {
    const W = {whole: true};
    const d = mk(['foo.bar foo, x foobar. food.']);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'foo.', W)),
      [0, 0, 0, 4]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'foo,', W)),
      [0, 0, 8, 12]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), '.bar', W)),
      [0, 0, 3, 7]);
    // a letter end still needs a word's edge: 'bar.' in 'foobar.' no
    assert.equal(search(d.doc, at(0, 0, 0), 'bar.', W), null);
    // ('foo.bar' is one word to the browser's segmenter, like 'e.g.')
    assert.equal(count(d.doc, 'foo', W), 1);
    assert.equal(count(d.doc, '.', W), 3);
  });
});

describe('search: emoji, combining marks, case folding', () => {
  it('emoji', () => {
    const d = mk(['a\u{1F600}b\u{1F600} \u{1F44D}\u{1F3FD} \u{1F44D}']);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), '\u{1F600}')),
      [0, 0, 1, 3]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 3), '\u{1F600}')),
      [0, 0, 4, 6]);
    // a thumbs-up alone is not the start of one with a skin tone
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), '\u{1F44D}')),
      [0, 0, 12, 14]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0),
      '\u{1F44D}\u{1F3FD}')), [0, 0, 7, 11]);
  });
  it('combining marks: not split, not normalised', () => {
    const d = mk(['cafe\u0301 cafe caf\u00e9']);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'cafe')),
      [0, 0, 6, 10]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'cafe\u0301')),
      [0, 0, 0, 5]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'CAF\u00c9')),
      [0, 0, 11, 15]);
    // the e of e + combining acute is not one; the next e is
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'e')),
      [0, 0, 9, 10]);
  });
  it('fold never changes the length', () => {
    for (let c = 0; c <= 0x10FFFF; c++) {
      if (c >= 0xD800 && c <= 0xDFFF) continue;
      const t = String.fromCodePoint(c);
      assert.equal(fold(t).length, t.length, c.toString(16));
    }
    assert.equal(fold('\uD800x').length, 2);
  });
  it('dotted capital I is i; sharp s; final sigma', () => {
    assert.equal(fold('\u0130'), 'i');
    assert.equal(fold('\u1e9e'), '\u00df');
    assert.equal(fold('ABC\u00c9'), 'abc\u00e9');
    const d = mk(['x\u0130stanbul y', 'Stra\u00dfe STRASSE',
      '\u039f\u0394\u039f\u03a3']);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'istanbul')),
      [0, 0, 1, 9]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'y')),
      [0, 0, 10, 11]);
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'STRA\u1e9eE')),
      [0, 1, 0, 6]);
    // no expansion: ss is not sharp s
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0), 'strasse')),
      [0, 1, 7, 14]);
    // per character: capital sigma is the middle form
    assert.deepEqual(pick(search(d.doc, at(0, 0, 0),
      '\u03bf\u03b4\u03bf\u03c3')), [0, 2, 0, 4]);
  });
});

describe('search: whole words', () => {
  const W = {whole: true};
  it('words, punctuation', () => {
    const d = mk(['concat cat, (cat) cats cat.']);
    const all = [];
    for (let m = search(d.doc, at(0, 0, 0), 'cat', W); m;
      m = search(d.doc, at(0, 0, m.to), 'cat', W)) all.push(m.from);
    assert.deepEqual(all, [7, 13, 23]);
    assert.equal(count(d.doc, 'cat', W), 3);
    assert.equal(count(d.doc, 'cat'), 5);
  });
  it('Chinese words as the browser splits them', () => {
    const t = '\u6211\u4eec\u559c\u6b22\u732b';
    const d = mk([t]);
    const seg = [...new Intl.Segmenter(undefined,
      {granularity: 'word'}).segment(t)].map((x) => x.segment);
    const w = seg.find((x) => x.length > 1) || seg[0];
    const m = search(d.doc, at(0, 0, 0), w, W);
    assert.ok(m, w);
    assert.equal(t.slice(m.from, m.to), w);
    if (w.length > 1) {
      // part of a word is not a whole word
      const m1 = search(d.doc, at(0, 0, 0), w.slice(0, 1), W);
      assert.ok(!m1 || m1.from !== t.indexOf(w));
    }
  });
  it('a long paragraph: whole words still found', () => {
    const t = 'word '.repeat(2000) + 'needle ' + 'x'.repeat(5000);
    const d = mk([t]);
    assert.equal(search(d.doc, at(0, 0, 0), 'needle', W).from, 10000);
    assert.equal(search(d.doc, at(0, 0, 0), 'eedle', W), null);
  });
});

describe('replaceOne', () => {
  it('replaces with the format of the first character', () => {
    const d = mk([['abcd', {runs: [{start: 0, end: 2, rPr: bold},
      {start: 2, end: 4, rPr: plain}]}]]);
    const id = ids(d)[0];
    const m = search(d.doc, at(0, 0, 0), 'bc');
    const r = undoable(d, () => replaceOne(d, m, 'XYZ'));
    assert.deepEqual(r, {s: 0, i: 0, from: 1, to: 4});
    assert.deepEqual(texts(d), ['aXYZd']);
    assert.equal(ids(d)[0], id);
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 4, rPr: bold},
      {start: 4, end: 5, rPr: plain}]);
  });
  it('an inline in the match: refused, nothing changes', () => {
    const d = mk([['see ' + O, {inlines: {4: link('it')}}]]);
    const before = snap(d);
    const m = search(d.doc, at(0, 0, 0), 'it');
    assert.equal(replaceOne(d, m, 'x'), null);
    assert.equal(replaceOne(d, null, 'x'), null);
    assert.equal(replaceOne(d, {s: 0, i: 5, from: 0, to: 1}, 'x'),
      null);
    assert.ok(deepEqual(d.doc.sections, before));
    assert.equal(d.undoDepth, 0);
  });
  it('a line break and a tab in the replacement; controls dropped',
    () => {
      const d = mk(['a b']);
      const m = search(d.doc, at(0, 0, 0), ' ');
      replaceOne(d, m, 'x\r\ny\tz\u0007' + O);
      assert.deepEqual(texts(d), ['ax\ny\tzb']);
      valid(d);
    });
  it('an empty replacement deletes', () => {
    const d = mk(['abc']);
    replaceOne(d, search(d.doc, at(0, 0, 0), 'b'), '');
    assert.deepEqual(texts(d), ['ac']);
  });
});

describe('replaceAll', () => {
  it('counts, skips inline matches, one undo step with the ids', () => {
    const d = mk([['the cat ' + O + ' cat', {inlines: {8: link('cat')}}],
      'no', box(), 'Cat cat']);
    const r = undoable(d, () => replaceAll(d, 'cat', 'dog'));
    assert.deepEqual(r, {count: 4, skipped: 1});
    assert.deepEqual(texts(d), ['the dog ' + O + ' dog', 'no', '#',
      'dog dog']);
    assert.equal(d.undoDepth, 1);
  });
  it('the replacement holding the needle: one pass', () => {
    const d = mk(['aaa', 'a']);
    assert.deepEqual(undoable(d, () => replaceAll(d, 'a', 'aa',
      {matchCase: true})), {count: 4, skipped: 0});
    assert.deepEqual(texts(d), ['aaaaaa', 'aa']);
  });
  it('options: matchCase and whole', () => {
    const d = mk(['Cat cat cats']);
    assert.deepEqual(replaceAll(d, 'cat', 'x', {matchCase: true,
      whole: true}), {count: 1, skipped: 0});
    assert.deepEqual(texts(d), ['Cat x cats']);
  });
  it('nothing found or an empty needle: no undo step', () => {
    const d = mk(['abc']);
    assert.deepEqual(replaceAll(d, 'zz', 'y'), {count: 0, skipped: 0});
    assert.deepEqual(replaceAll(d, '', 'y'), {count: 0, skipped: 0});
    assert.equal(d.undoDepth, 0);
  });
  it('last: where the last text put in is', () => {
    const d = mk(['a cat', 'no', 'cat and cat', 'no']);
    const r = replaceAll0(d, 'cat', 'dog!');
    assert.deepEqual(r.last, {s: 0, i: 2, from: 9, to: 13});
    assert.equal(P(d, 2).text.slice(9, 13), 'dog!');
    assert.equal(replaceAll0(d, 'zebra', 'x').last, null);
  });
  it('line breaks in the replacement', () => {
    const d = mk(['a,b,c']);
    replaceAll(d, ',', '\n');
    assert.deepEqual(texts(d), ['a\nb\nc']);
    valid(d);
  });
  it('keeps the format of each replaced text', () => {
    const d = mk([['xAyA', {runs: [{start: 0, end: 2, rPr: bold},
      {start: 2, end: 4, rPr: plain}]}]]);
    replaceAll(d, 'a', 'QQ');
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 3, rPr: bold},
      {start: 3, end: 6, rPr: plain}]);
  });
  it('50,000 paragraphs in under 5 s, one undo step, exact undo', () => {
    const d = mk(Array.from({length: 50000}, (_, k) =>
      `line ${k} has a word and another word`));
    const before = snap(d), id0 = ids(d);
    const t0 = performance.now();
    const r = replaceAll(d, 'word', 'term');
    const ms = performance.now() - t0;
    assert.deepEqual(r, {count: 100000, skipped: 0});
    assert.ok(ms < 5000, `${ms} ms`);
    assert.equal(d.undoDepth, 1);
    assert.equal(P(d, 49999).text, 'line 49999 has a term and another ' +
      'term');
    d.undo();
    assert.ok(deepEqual(d.doc.sections, before));
    assert.deepEqual(ids(d), id0);
  });
  it('10,000 matches in one paragraph', () => {
    const d = mk(['ab'.repeat(10000)]);
    const t0 = performance.now();
    assert.deepEqual(replaceAll(d, 'b', 'c'), {count: 10000,
      skipped: 0});
    assert.ok(performance.now() - t0 < 5000);
    assert.equal(P(d, 0).text, 'ac'.repeat(10000));
  });
});

describe('prepare', () => {
  it('caps the needle at MAX, well formed', () => {
    assert.equal(MAX, 1000);
    const r = prepare('x'.repeat(1e6));
    assert.equal(r.needle.length, 1000);
    assert.equal(r.cut, true);
    const e = prepare('x'.repeat(999) + '\u{1F600}');
    assert.equal(e.cut, true);
    assert.equal(e.needle, 'x'.repeat(999));
    assert.deepEqual(prepare('abc'), {needle: 'abc', cut: false});
    assert.deepEqual(prepare(null), {needle: '', cut: false});
  });
});

// ---------------------------------------------------- the reference
const segG = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
const segW = new Intl.Segmenter(undefined, {granularity: 'word'});

/** Every match of p, overlapping, shown order, the slow way. */
function naive(p, needle, o, s, i) {
  let shown = '';
  const map = [];
  for (let k = 0; k < p.text.length; k++) {
    let x = p.text[k];
    if (x === O) {
      const n = p.inlines[k];
      x = n.kind === 'tab' ? '\t' : n.kind === 'br' ? '\n'
        : n.text || '';
    }
    for (const c of x) for (let j = 0; j < c.length; j++) map.push(k);
    shown += x;
  }
  const g = new Set([0, p.text.length]);
  for (const x of segG.segment(p.text)) g.add(x.index);
  // non-word pieces next to each other are one run
  const runs = [];
  for (const x of segW.segment(shown)) {
    const last = runs.at(-1), word = !!x.isWordLike;
    if (last && !word && !last.word) last.to = x.index + x.segment.length;
    else runs.push({from: x.index, to: x.index + x.segment.length, word});
  }
  const starts = new Set(runs.map((r) => r.from));
  const ends = new Set(runs.map((r) => r.to));
  const eq = (a, b) => (o.matchCase ? a === b : fold(a) === fold(b));
  const out = [];
  for (let k = 0; k + needle.length <= shown.length; k++) {
    if (!eq(shown.slice(k, k + needle.length), needle)) continue;
    const e = k + needle.length;
    const from = map[k], to = map[e - 1] + 1;
    if (!g.has(from) || !g.has(to)) continue;
    const cs = [...shown.slice(k, e)];
    const wordy = (c) => /^[\p{L}\p{M}\p{N}]$/u.test(c);
    if (o.whole && ((wordy(cs[0]) && !starts.has(k)) ||
      (wordy(cs.at(-1)) && !ends.has(e)))) continue;
    let nx = map.findIndex((x) => x >= to);
    if (nx < 0) nx = shown.length;
    out.push({s, i, from, to, ds: k, de: e, next: Math.max(e, nx),
      inInline: p.text.slice(from, to).includes(O)});
  }
  return out;
}

describe('property: search and count against a naive scan', () => {
  const R = rng(20261008);
  const r = (n) => Math.floor(R() * n);
  const bits = ['a', 'A', 'b', ' ', '.', 'ab', '\u00e9', 'e\u0301',
    '\u{1F600}', '\u0130', 'i', '\u00df', '\u03a3', '\u03c3', O, O];
  const mkPara = () => {
    let t = '';
    const inl = {};
    for (let n = r(24); n > 0; n--) {
      const x = bits[r(bits.length)];
      if (x === O) {
        inl[t.length] = [link(['ab', 'A b', '', 'x'][r(4)]),
          {kind: 'tab', level: 'r'}, {kind: 'br', level: 'r', brType: 'textWrapping'}][r(3)];
      }
      t += x;
    }
    return [t, {inlines: inl}];
  };
  let found = 0, inl = 0;
  for (let round = 0; round < 300; round++) {
    it(`round ${round}`, () => {
      const blocks = Array.from({length: 1 + r(4)}, () =>
        (r(6) ? mkPara() : box()));
      const d = mk(blocks);
      const doc = d.doc;
      const ns = ['a', 'A', 'ab', 'b ', ' ', '\u00e9', 'e', 'a b',
        '\u{1F600}', 'i', '\u03c3', 'a.', 'x', 'b\tx', '\n', 'Ab'];
      const needle = ns[r(ns.length)];
      const o = {matchCase: !!r(2), whole: !r(3)};
      const all = [];
      doc.sections[0].blocks.forEach((p, i) => {
        if (p.type === 'p') all.push(...naive(p, needle, o, 0, i));
      });
      const bs = doc.sections[0].blocks;
      // forwards and backwards from every place
      for (let i = 0; i < bs.length; i++) {
        const len = bs[i].type === 'p' ? bs[i].text.length : 1;
        for (let off = 0; off <= len; off++) {
          const f = all.find((m) => m.i > i ||
            (m.i === i && m.from >= off));
          const got = search(doc, at(0, i, off), needle, o);
          assert.deepEqual(pick(got), pick(f), `fwd ${i}:${off}`);
          if (f) assert.equal(got.inInline, f.inInline);
          const b = all.findLast((m) => m.i < i ||
            (m.i === i && m.to <= off));
          assert.deepEqual(pick(search(doc, at(0, i, off), needle,
            {...o, backwards: true})), pick(b), `back ${i}:${off}`);
        }
      }
      // count: not overlapping, per paragraph
      let c = 0;
      for (let i = 0; i < bs.length; i++) {
        let end = -1;
        for (const m of all.filter((x) => x.i === i)) {
          if (m.ds >= end) { c++; end = m.next; }
        }
      }
      assert.equal(count(doc, needle, o), c);
      const n = all.filter((m) => m.inInline).length;
      found += all.length;
      inl += n;
      const want = texts(d);
      const r2 = undoable(d, () => replaceAll(d, needle, '#', o));
      assert.equal(r2.count + r2.skipped, c);
      assert.ok(r2.skipped <= n);
      valid(d);
      if (!r2.count) assert.deepEqual(texts(d), want);
    });
  }
  it('the rounds found matches, some in inline items', () => {
    assert.ok(found > 200 && inl > 25, `${found} ${inl}`);
  });
});
