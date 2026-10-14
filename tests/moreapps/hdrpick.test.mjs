// HdrPick (Batch D P7.1, D13): which header or footer story a page
// shows - first page (titlePg), even pages (settings
// evenAndOddHeaders, by the DISPLAYED number: PG12), else default;
// a type a section has no reference of is linked to the nearest
// earlier section's; first and even with no reference anywhere are
// an EMPTY header; a reference that reaches no story is none (and is
// kept).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {pick, typeOf, refOf}
  from '../../tools/moreapps/!Letters/HdrPick';
import {refsOf} from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {p, r} from './build-docx.mjs';
import {withHeaders, freeze} from './story-fixtures.mjs';

const H1 = 'word/header1.xml', H2 = 'word/header2.xml';
const F1 = 'word/footer1.xml';
const node = (name, attrs) => ({name, attrs, children: []});
const ref = (kind, type, id) => node('w:' + kind + 'Reference',
  [...(type === null ? [] : [['w:type', type]]), ['r:id', id]]);
const sect = (extra, more = {}) => ({props: {extra, ...more},
  blocks: [], raw: null});

let three;   // default header and footer, first header; titlePg
let evens;   // default and even headers; evenAndOddHeaders
let plain;   // default and even headers; no evenAndOddHeaders

before(async () => {
  three = freeze(await readDocx(await withHeaders(p(r('body')),
    {default: {hdr: p(r('Head')), ftr: p(r('Foot'))},
      first: p(r('First'))}, {titlePg: true})));
  const de = {default: p(r('Odd')), even: p(r('Even'))};
  evens = freeze(await readDocx(await withHeaders(p(r('b')), de,
    {evenAndOdd: true})));
  plain = freeze(await readDocx(await withHeaders(p(r('b')), de)));
});

/** doc with its sections replaced (doc itself stays frozen). */
const withSections = (doc, sections) => freeze({...doc, sections});

describe('HdrPick pick', () => {
  it('titlePg: the first page of the section shows first', () => {
    assert.deepEqual(pick(three, 0, true, 1, 'hdr'),
      {part: H2, type: 'first', s: 0});
    assert.deepEqual(pick(three, 0, false, 2, 'hdr'),
      {part: H1, type: 'default', s: 0});
    assert.deepEqual(pick(three, 0, false, 3, 'ftr'),
      {part: F1, type: 'default', s: 0});
  });

  it('titlePg with no first reference anywhere: EMPTY', () => {
    // the footer has no first-page reference in any section
    assert.deepEqual(pick(three, 0, true, 1, 'ftr'),
      {part: null, type: 'first', s: 0});
  });

  it('without titlePg the first page shows default', () => {
    const s0 = three.sections[0];
    const d = withSections(three, [{...s0, props: {...s0.props,
      titlePg: false}}]);
    assert.deepEqual(pick(d, 0, true, 1, 'hdr'),
      {part: H1, type: 'default', s: 0});
  });

  it('evenAndOddHeaders: even by the displayed number (PG12)', () => {
    // a section starting at page number 2: physical page 1 is even
    assert.deepEqual(pick(evens, 0, true, 2, 'hdr'),
      {part: H2, type: 'even', s: 0});
    assert.deepEqual(pick(evens, 0, false, 3, 'hdr'),
      {part: H1, type: 'default', s: 0});
    assert.deepEqual(pick(evens, 0, false, '4', 'hdr'),
      {part: H2, type: 'even', s: 0});
    assert.deepEqual(pick(evens, 0, false, -2, 'hdr').type, 'even');
    // even with no even footer anywhere: an empty one
    assert.deepEqual(pick(evens, 0, false, 2, 'ftr'),
      {part: null, type: 'even', s: 0});
    // the setting off: even numbers show default
    assert.deepEqual(pick(plain, 0, false, 2, 'hdr'),
      {part: H1, type: 'default', s: 0});
  });

  it('section 3 inherits from section 1 (linked to previous)', () => {
    const s0 = three.sections[0];
    const d = withSections(three, [s0, sect([]), sect([])]);
    assert.deepEqual(pick(d, 2, false, 7, 'hdr'),
      {part: H1, type: 'default', s: 0});
    assert.deepEqual(pick(d, 2, false, 7, 'ftr'),
      {part: F1, type: 'default', s: 0});
    // titlePg in section 3, its first header from section 1
    const d2 = withSections(three, [s0, sect([]),
      sect([], {titlePg: true})]);
    assert.deepEqual(pick(d2, 2, true, 7, 'hdr'),
      {part: H2, type: 'first', s: 0});
    // section 2 has its own default: section 3 links to it
    const d3 = withSections(three, [s0,
      sect([ref('header', 'default', 'rIdH2')]), sect([])]);
    assert.deepEqual(pick(d3, 2, false, 7, 'hdr'),
      {part: H2, type: 'default', s: 1});
    assert.deepEqual(pick(d3, 0, false, 2, 'hdr'),
      {part: H1, type: 'default', s: 0});
  });

  it('a reference without w:type is a default one (SectRefs)', () => {
    const d = withSections(three, [sect([ref('header', null,
      'rIdH2')])]);
    assert.deepEqual(pick(d, 0, false, 1, 'hdr'),
      {part: H2, type: 'default', s: 0});
  });

  it('no default reference anywhere: no header', () => {
    const d = withSections(three, [sect([]), sect([])]);
    assert.equal(pick(d, 1, false, 2, 'hdr'), null);
    assert.equal(pick(d, 1, false, 2, 'ftr'), null);
  });

  it('a missing relationship or part: null, the reference kept',
    () => {
      const before = structuredClone(three.sections);
      // a relationship that is not there
      const d = withSections(three, [sect([ref('header', 'default',
        'rIdNope')]), sect([])]);
      assert.equal(pick(d, 1, false, 1, 'hdr'), null);
      assert.equal(refsOf(d.sections[0], docScope(d).map).hdr.default,
        'rIdNope');
      // the relationship is there but its part is not a story
      const gone = freeze({...three, stories: new Map([...three
        .stories].filter(([k]) => k !== H1))});
      assert.equal(pick(gone, 0, false, 2, 'hdr'), null);
      assert.equal(pick(gone, 0, true, 1, 'hdr').part, H2);
      // the nearer reference counts even when it reaches nothing
      const d2 = withSections(three, [three.sections[0],
        sect([ref('header', 'default', 'rIdNope')])]);
      assert.equal(pick(d2, 1, false, 2, 'hdr'), null);
      assert.ok(deepEqual(three.sections, before));
      // a stories Map missing altogether
      const none = freeze({...three, stories: undefined});
      assert.equal(pick(none, 0, false, 2, 'hdr'), null);
    });

  it('a document without a root or settings', () => {
    const s0 = three.sections[0];
    const d = freeze({...three, meta: {mainPart: three.meta.mainPart},
      rawSettings: null,
      sections: [s0]});
    assert.deepEqual(pick(d, 0, true, 1, 'hdr'),
      {part: H2, type: 'first', s: 0});
  });

  it('hostile arguments', () => {
    for (const s of [-1, 1, 1e9, NaN, 0.5, '0', null, '__proto__'])
      assert.throws(() => pick(three, s, false, 1, 'hdr'), RangeError);
    for (const k of ['header', '', null, '__proto__', 'odd'])
      assert.throws(() => pick(three, 0, false, 1, k), RangeError);
    // a number that is not one: odd (default)
    for (const n of [NaN, Infinity, 'ii', '', null, undefined, {},
      '__proto__', 1.5, '2x'])
      assert.equal(pick(evens, 0, false, n, 'hdr').type, 'default');
    assert.equal(pick(evens, 0, false, 1e9, 'hdr').type, 'even');
    // firstOfSection must be true itself
    assert.equal(pick(three, 0, 1, 1, 'hdr').type, 'default');
  });

  it('5,000 sections linked to the first', () => {
    const many = [three.sections[0]];
    for (let i = 0; i < 4999; i++) many.push(sect([]));
    const d = withSections(three, many);
    const t = Date.now();
    for (let i = 0; i < 1500; i++)
      assert.equal(pick(d, 4999, false, i, 'hdr').part, H1);
    assert.ok(Date.now() - t < 2000);
  });
});

describe('HdrPick typeOf', () => {
  it('maps Paginate\'s page facts to the type shown', () => {
    assert.equal(typeOf(three, 0, true, 1), 'first');
    assert.equal(typeOf(three, 0, false, 2), 'default');
    assert.equal(typeOf(evens, 0, true, 2), 'even');
    assert.equal(typeOf(plain, 0, false, 2), 'default');
  });
});

describe('HdrPick refOf (P7.2)', () => {
  it('by type; a part that is no story is kept, pick says none',
    () => {
      assert.deepEqual(refOf(three, 0, 'first', 'hdr'),
        {part: H2, type: 'first', s: 0});
      assert.deepEqual(refOf(three, 0, 'default', 'ftr'),
        {part: F1, type: 'default', s: 0});
      assert.deepEqual(refOf(three, 0, 'even', 'hdr'),
        {part: null, type: 'even', s: 0});
      // header1.xml in the package but not a story: kept
      const gone = freeze({...three, stories: new Map([...three
        .stories].filter(([k]) => k !== H1))});
      assert.deepEqual(refOf(gone, 0, 'default', 'hdr'),
        {part: null, type: 'default', s: 0, kept: H1});
      assert.equal(pick(gone, 0, false, 2, 'hdr'), null);
      // not in the package either: none
      const lost = freeze({...gone, parts: new Map([...three.parts]
        .filter(([k]) => k !== H1))});
      assert.equal(refOf(lost, 0, 'default', 'hdr'), null);
      // linked to previous, kept from section 0
      const d = withSections(gone, [gone.sections[0], sect([])]);
      assert.deepEqual(refOf(d, 1, 'default', 'hdr'),
        {part: null, type: 'default', s: 0, kept: H1});
    });

  it('hostile arguments', () => {
    for (const t of ['odd', '', null, '__proto__', 'First'])
      assert.throws(() => refOf(three, 0, t, 'hdr'), RangeError);
    for (const k of ['header', null, '__proto__'])
      assert.throws(() => refOf(three, 0, 'default', k), RangeError);
    for (const s of [-1, 1, NaN, '0', null])
      assert.throws(() => refOf(three, s, 'default', 'hdr'),
        RangeError);
  });
});
