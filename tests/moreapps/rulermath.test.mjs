// RulerMath (WimpLib, pure): twips <-> px with zoom, snapping,
// clamping, the ticks of a ruler, indent markers and the drag of each
// marker as Word does it; RulerInd (!Word): the indents the ruler
// shows (the selection's first paragraph); FormatPara.dragIndents
// through FormatApply's 'indentDrag': the dragged marker's value on
// every selected paragraph, one undo step.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as RM from '../../tools/moreapps/!WimpLib/RulerMath';
import * as RI from '../../tools/moreapps/!Word/RulerInd';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {mk, P, C, SEL, undoable, box} from './edit-docs.mjs';

const TW = 9026;                       // A4 less two 1-inch margins
const ind = (left, first = 0, right = 0) => ({left, first, right});

describe('RulerMath units', () => {
  it('twips <-> px at zoom 0.5 .. 5 (96 dpi at 1)', () => {
    assert.equal(RM.toPx(1440), 96);
    assert.equal(RM.toPx(1440, 0.5), 48);
    assert.equal(RM.toPx(1440, 2), 192);
    assert.equal(RM.toPx(1440, 5), 480);
    assert.equal(RM.toTwips(96), 1440);
    assert.equal(RM.toTwips(48, 0.5), 1440);
    assert.equal(RM.toTwips(480, 5), 1440);
    for (const z of [0.5, 0.75, 1, 1.5, 3, 5]) {
      assert.ok(Math.abs(RM.toTwips(RM.toPx(777, z), z) - 777) < 1e-9);
    }
  });
  it('zoomOf clamps to 0.1 .. 5; not a number is 1', () => {
    assert.equal(RM.zoomOf(0.01), 0.1);
    assert.equal(RM.zoomOf(9), 5);
    assert.equal(RM.zoomOf(NaN), 1);
    assert.equal(RM.zoomOf(undefined), 1);
    assert.equal(RM.toPx(1440, 0), RM.toPx(1440, 0.1));
  });
  it('snap to 1/16 inch (90 twips); free rounds to a twip', () => {
    assert.equal(RM.SNAP, 90);
    assert.equal(RM.snap(44), 0);
    assert.equal(RM.snap(46), 90);
    assert.equal(RM.snap(100), 90);
    assert.equal(RM.snap(1439), 1440);
    assert.equal(RM.snap(-100), -90);
    assert.equal(RM.snap(100.4, true), 100);
    assert.equal(RM.snap(NaN), 0);
  });
  it('clampTo: NaN and an empty range give lo', () => {
    assert.equal(RM.clampTo(5, 0, 10), 5);
    assert.equal(RM.clampTo(-5, 0, 10), 0);
    assert.equal(RM.clampTo(1e9, 0, 10), 10);
    assert.equal(RM.clampTo(NaN, 0, 10), 0);
    assert.equal(RM.clampTo(5, 3, 1), 3);
  });
});

describe('RulerMath.ticks', () => {
  it('an 8.27 inch page, text 1 inch in: every 1/8 inch', () => {
    const from = -1440, to = Math.round(8.27 * 1440) - 1440;
    const t = RM.ticks(from, to);
    assert.equal(t.length, 67);
    assert.equal(t[0].at, -1440);
    assert.equal(t.at(-1).at, 10440);
    assert.ok(t.every((k, i) => !i || k.at - t[i - 1].at === 180));
    const inch = t.filter((k) => k.size === 3);
    // unsigned, counting out from the margin (Word's way); none at 0
    assert.deepEqual(inch.map((k) => k.label),
      [1, undefined, 1, 2, 3, 4, 5, 6, 7]);
    assert.ok(!('label' in inch[1]) && inch[1].at === 0);
    assert.ok(inch.every((k) => k.at % 1440 === 0));
    const half = t.filter((k) => k.size === 2);
    assert.equal(half.length, 8);
    assert.ok(half.every((k) => k.at % 720 === 0 && !('label' in k)));
    assert.equal(t.filter((k) => k.size === 1).length, 67 - 17);
  });
  it('absurd ends are clamped (at most 100 inches each way)', () => {
    const t = RM.ticks(-1e9, 1e9);
    assert.ok(t.length <= 1601, String(t.length));
    assert.deepEqual(RM.ticks(NaN, 5), []);
    assert.deepEqual(RM.ticks(10, 5), []);
  });
});

describe('RulerMath.indentMarks', () => {
  it('first (top), hanging (bottom), left (box), right', () => {
    assert.deepEqual(RM.indentMarks(ind(720, -360, 0), TW), [
      {id: 'first', twips: 360, kind: 'down'},
      {id: 'hanging', twips: 720, kind: 'up'},
      {id: 'left', twips: 720, kind: 'box'},
      {id: 'right', twips: TW, kind: 'up'},
    ]);
    const m = RM.indentMarks(ind(0, 360, 1440), TW);
    assert.equal(m[0].twips, 360);
    assert.equal(m[3].twips, TW - 1440);
  });
});

describe('RulerMath.dragIndent (Word\'s markers)', () => {
  const room = TW - 360;
  it('the left box moves left and first line together', () => {
    assert.deepEqual(RM.dragIndent('left', 1450, ind(720, 360), TW),
      ind(1440, 360));
    assert.deepEqual(RM.dragIndent('left', 1450, ind(720, -360), TW),
      ind(1440, -360));
  });
  it('the hanging triangle moves left only (first line stays)', () => {
    assert.deepEqual(RM.dragIndent('hanging', 1440, ind(720, 0), TW),
      ind(1440, -720));
    assert.deepEqual(RM.dragIndent('hanging', 0, ind(720, -360), TW),
      ind(0, 360));
  });
  it('the first-line triangle changes first line only', () => {
    assert.deepEqual(RM.dragIndent('first', 360, ind(720, 0), TW),
      ind(720, -360));
    assert.deepEqual(RM.dragIndent('first', 1080, ind(720, 0), TW),
      ind(720, 360));
  });
  it('the right triangle: the right indent from the right margin',
    () => {
      assert.deepEqual(RM.dragIndent('right', TW - 1440, ind(0), TW),
        ind(0, 0, 1440));
      assert.deepEqual(RM.dragIndent('right', TW - 1426, ind(0), TW),
        ind(0, 0, 1440));
    });
  it('Shift (free): no snapping', () => {
    assert.deepEqual(RM.dragIndent('left', 1000, ind(0), TW, true),
      ind(1000));
    assert.deepEqual(RM.dragIndent('right', TW - 77, ind(0), TW, true),
      ind(0, 0, 77));
  });
  it('clamps: left 0..room-right, first -left..room-left, right ' +
    '0..room-left', () => {
    assert.deepEqual(RM.dragIndent('left', 1e9, ind(0), TW),
      ind(room));
    assert.deepEqual(RM.dragIndent('left', 1e9, ind(0, 0, 1440), TW),
      ind(room - 1440, 0, 1440));
    assert.deepEqual(RM.dragIndent('left', -1e9, ind(720, -360), TW),
      ind(0, 0));
    assert.deepEqual(RM.dragIndent('first', -1e9, ind(720), TW),
      ind(720, -720));
    assert.deepEqual(RM.dragIndent('first', 1e9, ind(720), TW),
      ind(720, room - 720));
    assert.deepEqual(RM.dragIndent('right', 1e9, ind(720), TW),
      ind(720, 0, 0));
    assert.deepEqual(RM.dragIndent('right', -1e9, ind(720), TW),
      ind(720, 0, room - 720));
    assert.deepEqual(RM.dragIndent('left', 1440, ind(0, 8000), TW),
      ind(1440, room - 1440));
  });
  it('NaN or an unknown marker changes nothing', () => {
    assert.deepEqual(RM.dragIndent('left', NaN, ind(720, 360), TW),
      ind(720, 360));
    assert.deepEqual(RM.dragIndent('tab', 100, ind(720, 360), TW),
      ind(720, 360));
  });
  it('results are whole twips', () => {
    const r = RM.dragIndent('first', 1000.7, ind(0), TW, true);
    assert.ok(Number.isInteger(r.first));
  });
});

describe('RulerInd', () => {
  it('the indents of the selection\'s first paragraph (resolved)',
    () => {
      const d = mk([['ab', {pPr: {ind: {left: 720, hanging: 360},
        extra: []}}], ['cd', {pPr: {ind: {firstLine: 200, right: 99},
        extra: []}}]]);
      assert.deepEqual(RI.firstIndents(d.doc, SEL(d, 0, 1, 1, 1)),
        ind(720, -360));
      assert.deepEqual(RI.firstIndents(d.doc, SEL(d, 1, 1, 0, 1)),
        ind(720, -360));
      assert.deepEqual(RI.firstIndents(d.doc, C(d, 1, 0)),
        ind(0, 200, 99));
    });
  it('a table first: the next paragraph; none: null', () => {
    const d = mk([box('tbl'), ['cd', {pPr: {ind: {left: 90},
      extra: []}}]]);
    assert.deepEqual(RI.firstIndents(d.doc, SEL(d, 0, 0, 1, 1)),
      ind(90));
    assert.equal(RI.firstIndents(d.doc, C(d, 0, 0)), null);
    assert.equal(RI.firstIndents(d.doc, null), null);
  });
  it('textTwips and the ruler\'s scale from a layout', () => {
    const L = {left: 120, textW: TW / 15, pageLeft: 24, pageW: 793.7};
    assert.equal(RI.textTwips(L), TW);
    assert.deepEqual(RI.scaleOf(L, 7), {origin: 120,
      page: [24, 24 + 793.7], text: [120, 120 + TW / 15], zoom: 1,
      scrollX: 7});
    assert.ok(RI.RULER_H >= 18 && RI.RULER_H <= 30);
  });
  it('the scale at a zoom: the column\'s px scaled, zoom given', () => {
    const L = {left: 120, textW: 600, pageLeft: 24, pageW: 793};
    assert.deepEqual(RI.scaleOf(L, 7, 2), {origin: 240,
      page: [48, 48 + 1586], text: [240, 240 + 1200], zoom: 2,
      scrollX: 7});
    assert.deepEqual(RI.scaleOf(L, 0, 0.5).text, [60, 360]);
    // the marker of an inch from the margin, on the screen
    const s = RI.scaleOf(L, 0, 1.5);
    assert.equal(s.origin + RM.toPx(1440, s.zoom), 1.5 * (120 + 96));
  });
});

describe('FormatApply indentDrag (FormatPara.dragIndents)', () => {
  const go = (d, sel, arg) => undoable(d, () =>
    FA.apply('indentDrag', d, new Typing(d), sel, arg));
  const three = () => mk([
    ['a', {pPr: {ind: {left: 720, firstLine: 360}, extra: []}}],
    ['b', {pPr: {ind: {left: 360, hanging: 360}, extra: []}}],
    'c']);
  const indOf = (d, k) => P(d, k).pPr.ind;
  it('left box: every paragraph to that left indent, first lines kept',
    () => {
      const d = three();
      go(d, SEL(d, 0, 0, 2, 1), {marker: 'left', at: 1450, textW: TW});
      assert.deepEqual(indOf(d, 0), {left: 1440, firstLine: 360});
      assert.deepEqual(indOf(d, 1), {left: 1440, hanging: 360});
      assert.deepEqual(indOf(d, 2), {left: 1440});
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.deepEqual(indOf(d, 0), {left: 720, firstLine: 360});
    });
  it('first line left of the left indent: hanging, firstLine deleted',
    () => {
      const d = three();
      go(d, C(d, 0, 0), {marker: 'first', at: 360, textW: TW});
      assert.deepEqual(indOf(d, 0), {left: 720, hanging: 360});
      assert.deepEqual(indOf(d, 1), {left: 360, hanging: 360});
    });
  it('hanging triangle: left moves, each first line stays put', () => {
    const d = three();
    go(d, SEL(d, 0, 0, 1, 1), {marker: 'hanging', at: 1440,
      textW: TW});
    assert.deepEqual(indOf(d, 0), {left: 1440, hanging: 360});
    assert.deepEqual(indOf(d, 1), {left: 1440, hanging: 1440});
  });
  it('right triangle; back to 0 removes the key (the style\'s)', () => {
    const d = three();
    go(d, C(d, 2, 0), {marker: 'right', at: TW - 720, textW: TW});
    assert.deepEqual(indOf(d, 2), {right: 720});
    go(d, C(d, 2, 0), {marker: 'right', at: TW + 5000, textW: TW});
    assert.equal(indOf(d, 2)?.right, undefined);
  });
  it('free (Shift) and no change: no undo step', () => {
    const d = three();
    go(d, C(d, 2, 0), {marker: 'left', at: 1001, textW: TW,
      free: true});
    assert.deepEqual(indOf(d, 2), {left: 1001});
    const n = d.undoDepth;
    go(d, C(d, 2, 0), {marker: 'left', at: 1001, textW: TW,
      free: true});
    assert.equal(d.undoDepth, n);
  });
  it('bad arguments: RangeError, nothing changed', () => {
    const d = three();
    for (const arg of [null, {}, {marker: 'tab', at: 1, textW: TW},
      {marker: 'left', at: 'x', textW: TW},
      {marker: 'left', at: 1, textW: 0},
      {marker: 'left', at: 1, textW: NaN}]) {
      assert.throws(() => FA.apply('indentDrag', d, new Typing(d),
        C(d, 0, 0), arg), RangeError, JSON.stringify(arg));
    }
    assert.equal(d.undoDepth, 0);
  });
});
