// ParaPatch: the Paragraph dialog's values from a query (fill) and
// the paraPatch they make (patch): only what changed, mixed fields
// left alone, hanging and first line exclusive, line spacing At in
// lines or points, fields refused. End to end through
// FormatApply 'paraBox' over real documents (one undo step).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fill, patch, NAMES, ALIGNS, SPECIALS, LINES, LIMITS}
  from '../../tools/moreapps/!Word/ParaPatch';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as F from '../../tools/moreapps/!Word/Format';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {parseLength, formatLength, parsePoints, formatPoints}
  from '../../tools/moreapps/!WimpLib/Units';
import {mk, P, C, SEL, undoable} from './edit-docs.mjs';

const Q = (o = {}) => ({align: 'left', indentLeft: 0, indentRight: 0,
  indentFirst: 0, spaceBefore: 0, spaceAfter: 160,
  lineSpacing: {line: 240, rule: 'auto'}, contextual: false,
  keepNext: false, keepLines: false, widowControl: true,
  pageBreakBefore: false, ...o});
/** The dialog as untouched, then with changes. */
const run = (q, over = {}) => patch({...fill(q), ...over}, q);

describe('ParaPatch.fill', () => {
  it('shows what the query says', () => {
    const v = fill(Q({align: 'both', indentLeft: 720, indentRight: 360,
      indentFirst: -360, spaceBefore: 240, contextual: true,
      keepNext: true, lineSpacing: {line: 480, rule: 'auto'}}));
    assert.deepEqual(v, {align: 'both', left: 720, right: 360,
      special: 'hanging', by: 360, before: 240, after: 160,
      spacing: 'double', at: undefined, noctx: true, widow: true,
      keepnext: true, keeplines: false, pagebreak: false});
    assert.deepEqual(Object.keys(v).sort(), [...NAMES].sort());
  });
  it('first line, none, multiple, at least, exactly', () => {
    let v = fill(Q({indentFirst: 720}));
    assert.deepEqual([v.special, v.by], ['first', 720]);
    v = fill(Q());
    assert.deepEqual([v.special, v.by], ['none', undefined]);
    v = fill(Q({lineSpacing: {line: 276, rule: 'auto'}}));
    assert.deepEqual([v.spacing, v.at], ['multiple', 1.15]);
    v = fill(Q({lineSpacing: {line: 360, rule: 'auto'}}));
    assert.deepEqual([v.spacing, v.at], ['1.5', undefined]);
    v = fill(Q({lineSpacing: {line: 240, rule: 'atLeast'}}));
    assert.deepEqual([v.spacing, v.at], ['atleast', 12]);
    v = fill(Q({lineSpacing: {line: 300, rule: 'exact'}}));
    assert.deepEqual([v.spacing, v.at], ['exactly', 15]);
  });
  it('Normal\'s 259 is Multiple 1.08', () => {
    const v = fill(Q({lineSpacing: {line: 259, rule: 'auto'}}));
    assert.deepEqual([v.spacing, v.at], ['multiple', 259 / 240]);
    assert.deepEqual(run(Q({lineSpacing: {line: 259, rule: 'auto'}})),
      {patch: {}, bad: []});
  });
  it('mixed (null) is undefined everywhere', () => {
    const q = {};
    for (const k of Object.keys(Q())) q[k] = null;
    const v = fill(q);
    for (const k of NAMES) assert.equal(v[k], undefined, k);
  });
});

describe('ParaPatch.patch', () => {
  it('values read back from the fields (rounded) are no change', () => {
    const q = Q({indentLeft: 721, indentRight: 1, indentFirst: 361,
      spaceBefore: 41, spaceAfter: 3,
      lineSpacing: {line: 277, rule: 'auto'}});
    const v = fill(q);
    const back = {...v, left: parseLength(formatLength(v.left)),
      right: parseLength(formatLength(v.right)),
      by: parseLength(formatLength(v.by)),
      before: parsePoints(formatPoints(v.before)),
      after: parsePoints(formatPoints(v.after)),
      at: Number(v.at.toFixed(2))};
    assert.notEqual(back.left, v.left);
    assert.deepEqual(patch(back, q), {patch: {}, bad: []});
  });
  it('an unchanged dialog makes an empty patch', () => {
    for (const q of [Q(), Q({indentFirst: 360, indentLeft: 721,
      spaceBefore: 41, lineSpacing: {line: 277, rule: 'auto'}}),
    Q({lineSpacing: {line: 301, rule: 'exact'}, indentFirst: -11}),
    Q({lineSpacing: {line: 241, rule: 'atLeast'}})]) {
      assert.deepEqual(run(q), {patch: {}, bad: []}, JSON.stringify(q));
    }
    const mixed = {};
    for (const k of Object.keys(Q())) mixed[k] = null;
    assert.deepEqual(patch(fill(mixed), mixed), {patch: {}, bad: []});
  });
  it('each field alone', () => {
    const one = (over) => run(Q(), over).patch;
    assert.deepEqual(one({align: 'center'}), {jc: 'center'});
    assert.deepEqual(one({left: 720}), {ind: {left: 720}});
    assert.deepEqual(one({right: 360}), {ind: {right: 360}});
    assert.deepEqual(one({before: 120}), {spacing: {before: 120}});
    assert.deepEqual(one({after: 0}), {spacing: {after: 0}});
    assert.deepEqual(one({noctx: true}), {contextualSpacing: true});
    assert.deepEqual(one({widow: false}), {widowControl: false});
    assert.deepEqual(one({keepnext: true}), {keepNext: true});
    assert.deepEqual(one({keeplines: true}), {keepLines: true});
    assert.deepEqual(one({pagebreak: true}), {pageBreakBefore: true});
  });
  it('first line and hanging are exclusive; None clears', () => {
    const q = Q();
    assert.deepEqual(run(q, {special: 'first', by: 720}).patch,
      {ind: {firstLine: 720}});
    assert.deepEqual(run(q, {special: 'hanging', by: 360}).patch,
      {ind: {hanging: 360}});
    assert.deepEqual(run(q, {special: 'first'}).patch,
      {ind: {firstLine: 720}}, 'By empty: half an inch');
    const h = Q({indentFirst: -360});
    assert.deepEqual(run(h, {special: 'first'}).patch,
      {ind: {firstLine: 360}}, 'By kept');
    assert.deepEqual(run(h, {special: 'none'}).patch,
      {ind: {firstLine: 0}});
    assert.deepEqual(run(h, {by: 720}).patch, {ind: {hanging: 720}});
    for (const o of [{special: 'first', by: 100},
      {special: 'hanging', by: 100}]) {
      const p = run(q, o).patch.ind;
      assert.ok(Object.keys(p).length === 1, JSON.stringify(p));
    }
  });
  it('By with Special None is ignored; By alone over a mixed Special', () => {
    assert.deepEqual(run(Q(), {by: 500}), {patch: {}, bad: []});
    const q = Q({indentFirst: null});
    assert.deepEqual(run(q, {by: 500}), {patch: {}, bad: []});
    assert.deepEqual(run(q, {special: 'hanging', by: 500}).patch,
      {ind: {hanging: 500}});
  });
  it('line spacing: choices, Multiple 1.15 -> 276, At least, Exactly',
    () => {
      const q = Q({lineSpacing: {line: 259, rule: 'auto'}});
      assert.deepEqual(run(q, {spacing: 'single'}).patch,
        {spacing: {line: 240, lineRule: 'auto'}});
      assert.deepEqual(run(q, {spacing: '1.5'}).patch,
        {spacing: {line: 360, lineRule: 'auto'}});
      assert.deepEqual(run(q, {spacing: 'double'}).patch,
        {spacing: {line: 480, lineRule: 'auto'}});
      assert.deepEqual(run(q, {spacing: 'multiple', at: 1.15}).patch,
        {spacing: {line: 276, lineRule: 'auto'}});
      assert.deepEqual(run(q, {spacing: 'atleast', at: 12}).patch,
        {spacing: {line: 240, lineRule: 'atLeast'}});
      assert.deepEqual(run(q, {spacing: 'exactly', at: 13.5}).patch,
        {spacing: {line: 270, lineRule: 'exact'}});
      // At alone, in the mode the paragraphs have
      const m = Q({lineSpacing: {line: 276, rule: 'auto'}});
      assert.deepEqual(run(m, {at: 2.5}).patch,
        {spacing: {line: 600, lineRule: 'auto'}});
      // empty At: Word's defaults (3 lines, 12 pt)
      assert.deepEqual(run(Q(), {spacing: 'multiple'}).patch,
        {spacing: {line: 720, lineRule: 'auto'}});
      assert.deepEqual(run(Q(), {spacing: 'exactly'}).patch,
        {spacing: {line: 240, lineRule: 'exact'}});
      // spacing and before together
      assert.deepEqual(run(q, {spacing: 'double', before: 240}).patch,
        {spacing: {before: 240, line: 480, lineRule: 'auto'}});
    });
  it('line spacing limits match the screen: 0.5..4 lines, 1.5..1584 pt',
    () => {
      assert.deepEqual(LIMITS, {lines: [0.5, 4], points: [1.5, 1584]});
      const q = Q();
      for (const at of [0.49, 4.01, 0, 100]) {
        assert.deepEqual(run(q, {spacing: 'multiple', at}),
          {patch: {}, bad: ['at']}, String(at));
      }
      for (const at of [0.5, 4]) {
        assert.deepEqual(run(q, {spacing: 'multiple', at}).bad, []);
      }
      for (const m of ['atleast', 'exactly']) {
        for (const at of [1.49, 1585, 0, 5000]) {
          assert.deepEqual(run(q, {spacing: m, at}).bad, ['at'], m + at);
        }
        for (const at of [1.5, 1584]) {
          assert.deepEqual(run(q, {spacing: m, at}).bad, [], m + at);
        }
      }
    });
  it('bad text (null) is refused by name; only fields that count', () => {
    const q = Q();
    assert.deepEqual(run(q, {left: null, before: 120}),
      {patch: {}, bad: ['left']});
    assert.deepEqual(run(q, {right: null, after: null}).bad,
      ['right', 'after']);
    assert.deepEqual(run(q, {spacing: 'double', at: null}).bad, [],
      'At is not used by Double');
    assert.deepEqual(run(q, {spacing: 'multiple', at: null}).bad,
      ['at']);
    assert.deepEqual(run(q, {by: null}).bad, [],
      'By is not used by None');
    assert.deepEqual(run(q, {special: 'first', by: null}).bad, ['by']);
  });
  it('the patch is accepted by paraPatch (all its keys)', async () => {
    const {paraPatch} = await import(
      '../../tools/moreapps/!Word/FormatCheck');
    const p = run(Q(), {align: 'right', left: 720, right: 360,
      special: 'hanging', by: 360, before: 120, after: 60,
      spacing: 'exactly', at: 14, noctx: true, widow: false,
      keepnext: true, keeplines: true, pagebreak: true}).patch;
    assert.doesNotThrow(() => paraPatch(p));
    assert.equal(Object.keys(p).length, 8);
  });
  it('the lists of choices', () => {
    assert.deepEqual(ALIGNS.map((c) => c.id),
      ['left', 'center', 'right', 'both']);
    assert.deepEqual(SPECIALS.map((c) => c.text),
      ['(none)', 'First line', 'Hanging']);
    assert.deepEqual(LINES.map((c) => c.text), ['Single', '1.5 lines',
      'Double', 'At least', 'Exactly', 'Multiple']);
  });
});

describe('ParaPatch through FormatApply paraBox', () => {
  const T = (d) => new Typing(d);
  const go = (d, sel, over) => {
    const q = F.query(d.doc, sel);
    const r = patch({...fill(q), ...over}, q);
    assert.deepEqual(r.bad, []);
    return undoable(d, () => FA.apply('paraBox', d, T(d), sel,
      r.patch));
  };
  it('really writes every key; one undo step; undo exact', () => {
    const d = mk(['one', 'two']);
    const sel = SEL(d, 0, 0, 1, 1);
    const n0 = d.undoDepth;
    go(d, sel, {align: 'both', left: 720, right: 360,
      special: 'hanging', by: 180, before: 120, after: 60,
      spacing: 'atleast', at: 14, noctx: true, widow: false,
      keepnext: true, keeplines: true, pagebreak: true});
    assert.equal(d.undoDepth, n0 + 1);
    for (const k of [0, 1]) {
      const pp = P(d, k).pPr;
      assert.equal(pp.jc, 'both');
      assert.deepEqual(pp.ind, {left: 720, right: 360, hanging: 180});
      assert.deepEqual(pp.spacing, {before: 120, after: 60,
        line: 280, lineRule: 'atLeast'});
      for (const f of ['contextualSpacing', 'keepNext', 'keepLines',
        'pageBreakBefore']) assert.equal(pp[f], true, f);
      assert.equal(pp.widowControl, false);
    }
    // the dialog on the result shows it back and patches nothing
    const q = F.query(d.doc, sel);
    assert.deepEqual(patch(fill(q), q), {patch: {}, bad: []});
    // first line instead of hanging
    go(d, sel, {special: 'first', by: 720});
    assert.deepEqual(P(d, 0).pPr.ind, {left: 720, right: 360,
      firstLine: 720});
  });
  it('a mixed selection: untouched fields stay as they are', () => {
    const d = mk([['one', {pPr: {jc: 'center', ind: {left: 720},
      extra: []}}], ['two', {pPr: {jc: 'right', ind: {left: 360},
      extra: []}}]]);
    const sel = SEL(d, 0, 0, 1, 1);
    const q = F.query(d.doc, sel);
    assert.equal(q.align, null);
    go(d, sel, {before: 200});
    assert.equal(P(d, 0).pPr.jc, 'center');
    assert.equal(P(d, 1).pPr.jc, 'right');
    assert.equal(P(d, 0).pPr.ind.left, 720);
    assert.equal(P(d, 1).pPr.ind.left, 360);
    assert.equal(P(d, 1).pPr.spacing.before, 200);
    go(d, sel, {align: 'left'});
    assert.equal(P(d, 0).pPr.jc, undefined);
  });
  it('an empty patch makes no undo step', () => {
    const d = mk(['one']);
    const n0 = d.undoDepth;
    undoable(d, () => FA.apply('paraBox', d, T(d), C(d, 0, 0), {}));
    assert.equal(d.undoDepth, n0);
  });
  it('a bad patch throws and changes nothing', () => {
    const d = mk(['one']);
    assert.throws(() => FA.apply('paraBox', d, T(d), C(d, 0, 0),
      {ind: {firstLine: 1, hanging: 1}}), RangeError);
  });
});
