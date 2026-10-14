// StoryLayout (Batch D P7.1, D13): a header or footer story laid out
// by the galley code at a width, memoised by story object, width,
// styles and the field-values key, so pages that share a story
// share one layout (a 1,500-page document lays out a handful).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {layoutStory, stats, MAX_KEYS}
  from '../../tools/moreapps/!Letters/StoryLayout';
import {MIN_TEXT, MAX_TEXT} from '../../tools/moreapps/!Letters/SectGeom';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {p, r} from './build-docx.mjs';
import {withHeaders, freeze} from './story-fixtures.mjs';
import {tm} from './word-docs.mjs';

const H1 = 'word/header1.xml', H2 = 'word/header2.xml';
let doc, metrics, ctx;

before(async () => {
  doc = freeze(await readDocx(await withHeaders(p(r('body')),
    {default: p(r('One line here')) + p(r('Two')),
      first: p(r('Only'))})));
  metrics = tm();
  ctx = {doc, metrics};
});

const story = (part) => doc.stories.get(part);

describe('StoryLayout', () => {
  it('a 2-paragraph header\'s height: its two lines', () => {
    const one = layoutStory(story(H2), 400, ctx, '');
    const two = layoutStory(story(H1), 400, ctx, '');
    assert.ok(one.h > 0);
    assert.equal(two.L.items.length, 2);
    assert.equal(one.L.items.length, 1);
    // no spacing in these styles: two lines, twice one
    assert.equal(two.h, 2 * one.h);
    const [a, b] = two.L.items;
    assert.equal(two.h, b.y + b.h + b.gapBelow - (a.y - a.gapAbove));
    assert.equal(two.y, a.y - a.gapAbove);
    assert.equal(two.x, a.x);
    // laid out at the width: 'One line here' is 104 px, so the
    // narrowest column (80 px) breaks it in two
    const narrow = layoutStory(story(H1), MIN_TEXT, ctx, '');
    assert.equal(narrow.L.items[0].w, MIN_TEXT);
    assert.equal(narrow.L.items[0].lines.length, 2);
    assert.ok(Math.abs(narrow.h - 3 * one.h) < 1e-9);
    assert.equal(layoutStory(story(H1), 50, ctx, ''), narrow);
  });

  it('1,500 pages with one story at one width: laid out once', () => {
    const s = story(H1);
    const n0 = stats.laid;
    const first = layoutStory(s, 377, ctx, '');
    for (let i = 0; i < 1500; i++)
      assert.equal(layoutStory(s, 377, ctx, ''), first);
    assert.equal(stats.laid - n0, 1);
    // an equal ctx object (the same doc and metrics) shares it too
    assert.equal(layoutStory(s, 377, {doc, metrics}, ''), first);
    assert.equal(stats.laid - n0, 1);
  });

  it('keyed by story, width, styles, values and metrics', () => {
    const s = story(H1);
    const base = layoutStory(s, 300, ctx, '');
    // values key: '' when not given
    assert.equal(layoutStory(s, 300, ctx), base);
    const n0 = stats.laid;
    assert.notEqual(layoutStory(s, 301, ctx, ''), base);
    assert.notEqual(layoutStory(s, 300, ctx, 'page=2'), base);
    assert.notEqual(layoutStory({...s}, 300, ctx, ''), base);
    assert.notEqual(layoutStory(s, 300, {doc, metrics: tm()}, ''),
      base);
    const styled = {...doc, styles: {...doc.styles}};
    assert.notEqual(layoutStory(s, 300, {doc: styled, metrics}, ''),
      base);
    assert.equal(stats.laid - n0, 5);
    // one layout per key: another doc's styles took base's place
    assert.equal(layoutStory(s, 300, ctx, 'page=2').L.items.length, 2);
  });

  it('an empty story is 0 high', () => {
    const e = layoutStory({...story(H1), blocks: []}, 300, ctx, '');
    assert.equal(e.h, 0);
    assert.equal(e.L.items.length, 0);
  });

  it('hostile widths, keys and stories', () => {
    const s = story(H1);
    for (const w of [0, -1, NaN, -Infinity, '__proto__'])
      assert.equal(layoutStory(s, w, ctx, '').L.items[0].w, MIN_TEXT);
    for (const w of [1e9, Infinity])
      assert.equal(layoutStory(s, w, ctx, '').L.items[0].w, MAX_TEXT);
    for (const k of [1, null, {}, NaN])
      assert.throws(() => layoutStory(s, 300, ctx, k), RangeError);
    assert.equal(layoutStory(s, 300, ctx, '__proto__').L.items.length,
      2);
    for (const bad of [null, {}, {blocks: 'x'}, 7, '__proto__'])
      assert.throws(() => layoutStory(bad, 300, ctx, ''), RangeError);
    for (const c of [null, {}, {doc}, {metrics}])
      assert.throws(() => layoutStory(s, 300, c, ''), RangeError);
  });

  it('at most MAX_KEYS layouts kept per story', () => {
    const s = {...story(H1)};
    const first = layoutStory(s, 300, ctx, 'v0');
    for (let i = 1; i <= MAX_KEYS; i++) layoutStory(s, 300, ctx, 'v' + i);
    // the oldest was dropped: laid out again
    const n0 = stats.laid;
    assert.notEqual(layoutStory(s, 300, ctx, 'v0'), first);
    assert.equal(stats.laid - n0, 1);
    // the newest is still kept
    layoutStory(s, 300, ctx, 'v' + MAX_KEYS);
    assert.equal(stats.laid - n0, 1);
  });
});
