// !Word TabsPatch: the Tabs dialog's state (the stops shown, Set,
// Clear, Clear all, the popup's list, what is to be cleared) and the
// change OK makes; FormatTabs {edits} and FormatApply 'tabsBox'
// (TabsCommand) applying it per paragraph in one undo step: a style's
// stop cleared, Clear all, bar stops, leaders kept, a mixed selection,
// raw w:tabs and more than 64 own stops refused, the default only.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as TP from '../../tools/moreapps/!Word/TabsPatch';
import * as FT from '../../tools/moreapps/!Word/FormatTabs';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import {addStyle} from '../../tools/moreapps/!Word/Styles';
import {resolveTabs, defaultStop} from '../../tools/moreapps/!Word/TabStops';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readPPr} from '../../tools/moreapps/!Word/ReadProps';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {mk, P, C, SEL, undoable} from './edit-docs.mjs';

const T = (val, pos, leader) => ({val, pos,
  ...(leader ? {leader} : {})});
const ids = (st) => TP.choices(st).map((c) => c.id);

describe('TabsPatch: the box\'s state', () => {
  it('start: the stops shown, sorted, in the popup', () => {
    const st = TP.start([{...T('right', 4320, 'dot'), style: true},
      {...T('left', 1440), style: false}], 720);
    assert.deepEqual(TP.choices(st), [{id: 'p1440', text: '1" Left'},
      {id: 'p4320', text: '3" Right, dots'}]);
    assert.deepEqual(TP.stopOf(st, 'p4320'), T('right', 4320, 'dot'));
    assert.equal(TP.stopOf(st, 'p99'), null);
    assert.equal(TP.stopOf(st, '__proto__'), null);
    assert.equal(TP.clearedText(st), '');
    assert.deepEqual(TP.patch(st, 720), {patch: {}, bad: []});
    assert.deepEqual(TP.choices(TP.start([], 720)),
      [{id: '', text: '(none)'}]);
  });
  it('Set adds or replaces; leader undefined keeps the old one', () => {
    let st = TP.start([T('right', 4320, 'heavy')], 720);
    st = TP.setStop(st, {pos: 2880, val: 'center', leader: 'none'}).st;
    st = TP.setStop(st, {pos: 4320, val: 'decimal'}).st;
    assert.deepEqual(ids(st), ['p2880', 'p4320']);
    assert.deepEqual(TP.stopOf(st, 'p4320'), T('decimal', 4320, 'heavy'));
    st = TP.setStop(st, {pos: 4320, val: 'bar', leader: 'none'}).st;
    assert.deepEqual(TP.stopOf(st, 'p4320'), T('bar', 4320));
    assert.deepEqual(TP.patch(st).patch, {tabs: {edits: [
      {add: T('center', 2880)}, {add: T('bar', 4320)}]}});
  });
  it('Set refuses: no position, past 22", a 65th stop, bad kinds', () => {
    const st = TP.start([], 720);
    for (const pos of [undefined, null, 31681, -31681, 1.5, NaN]) {
      assert.deepEqual(TP.setStop(st, {pos, val: 'left'}),
        {bad: 'pos'}, String(pos));
    }
    assert.ok(TP.setStop(st, {pos: -31680, val: 'left'}).st);
    assert.ok(TP.setStop(st, {pos: 31680, val: 'left'}).st);
    assert.deepEqual(TP.setStop(st, {pos: 1, val: 'clear'}),
      {bad: 'kind'});
    assert.deepEqual(TP.setStop(st, {pos: 1, val: 'left',
      leader: 'x'}), {bad: 'leader'});
    let full = st;
    for (let k = 0; k < 64; k++) {
      full = TP.setStop(full, {pos: k * 100, val: 'left'}).st;
    }
    assert.deepEqual(TP.setStop(full, {pos: 99999 % 31680, val:
      'left'}), {bad: 'full'});
    assert.ok(TP.setStop(full, {pos: 500, val: 'right'}).st,
      'replacing one is not a 65th');
  });
  it('Clear: a stop shown goes; one set in the box is just dropped',
    () => {
      let st = TP.start([T('left', 1440), T('right', 4320)], 720);
      assert.equal(TP.clearStop(st, 999), st);
      st = TP.clearStop(st, 1440);
      st = TP.setStop(st, {pos: 2000, val: 'left'}).st;
      st = TP.clearStop(st, 2000);
      assert.deepEqual(ids(st), ['p4320']);
      assert.equal(TP.clearedText(st), '1"');
      assert.deepEqual(TP.patch(st).patch, {tabs: {edits: [
        {remove: 1440}]}});
      // a stop shown, changed, then cleared: a remove
      let s2 = TP.start([T('left', 1440)], 720);
      s2 = TP.setStop(s2, {pos: 1440, val: 'right'}).st;
      s2 = TP.clearStop(s2, 1440);
      assert.deepEqual(TP.patch(s2).patch.tabs.edits, [{remove: 1440}]);
    });
  it('Clear all: a set [] first, then what was done after it', () => {
    let st = TP.start([T('left', 1440)], 720);
    st = TP.clearStop(st, 1440);
    st = TP.clearAll(st);
    assert.equal(TP.clearedText(st), 'All');
    assert.deepEqual(TP.patch(st).patch, {tabs: {edits: [{set: []}]}});
    st = TP.setStop(st, {pos: 720, val: 'left', leader: 'hyphen'}).st;
    assert.deepEqual(TP.patch(st).patch.tabs.edits, [{set: []},
      {add: T('left', 720, 'hyphen')}]);
  });
  it('the cleared text is cut short', () => {
    let st = TP.start(Array.from({length: 40}, (_, k) =>
      T('left', 100 * (k + 1))), 720);
    for (let k = 1; k <= 40; k++) st = TP.clearStop(st, 100 * k);
    const t = TP.clearedText(st);
    assert.ok(t.length <= 60 && t.endsWith('...'), t);
  });
  it('the default: compared as the field shows it; out of range bad',
    () => {
      const st = TP.start([], 720);
      assert.deepEqual(TP.patch(st, undefined), {patch: {}, bad: []});
      assert.deepEqual(TP.patch(st, 721), {patch: {}, bad: []},
        '0.5" either way');
      assert.deepEqual(TP.patch(st, 1440).patch, {defaultTab: 1440});
      for (const v of [null, 35, 0, -720, 31681, 1e9]) {
        assert.deepEqual(TP.patch(st, v), {patch: {}, bad: ['deftab']},
          String(v));
      }
      assert.deepEqual(TP.patch(st, 36).patch, {defaultTab: 36});
      assert.deepEqual(TP.patch(st, 31680).patch, {defaultTab: 31680});
    });
  it('placeOf: a field\'s hundredths of an inch mean a stop\'s own place',
    () => {
      const st = TP.start([T('left', 20), T('left', 1440)], 720);
      assert.equal(TP.placeOf(st, 14), 20, '0.01" is the stop at 20');
      assert.equal(TP.placeOf(st, 1440), 1440);
      assert.equal(TP.placeOf(st, 1500), 1500);
      assert.equal(TP.placeOf(st, undefined), undefined);
      assert.equal(TP.placeOf(st, null), null);
      const two = TP.start([T('left', 20), T('right', 21)], 720);
      assert.equal(TP.placeOf(two, 14), 14, 'two stops show 0.01"');
      assert.equal(TP.placeOf(two, 14, 21), 21, 'the one picked');
      assert.equal(TP.placeOf(two, 14, 999), 14);
      // Clear of a picked stop at 20 through its shown 0.01"
      assert.deepEqual(ids(TP.clearStop(st, TP.placeOf(st, 14))),
        ['p1440']);
    });
  it('never changes a state it is given', () => {
    const st = TP.start([T('left', 1440)], 720);
    const was = JSON.stringify([...st.stops], [...st.ops]);
    TP.setStop(st, {pos: 10, val: 'left'});
    TP.clearStop(st, 1440);
    TP.clearAll(st);
    assert.equal(JSON.stringify([...st.stops], [...st.ops]), was);
    assert.equal(st.stops.size, 1);
    assert.equal(st.ops.size, 0);
  });
});

/** A document whose 'Tabbed' style has a left stop at 1440. */
function doc(paras) {
  const d = mk(paras);
  addStyle(d.doc.styles, {id: 'Tabbed', type: 'paragraph',
    basedOn: 'Normal', pPr: {tabs: [T('left', 1440)], extra: []}});
  return d;
}
const styled = (tabs) => ['xy', {pStyle: 'Tabbed',
  pPr: tabs ? {tabs, extra: []} : {extra: []}}];
const box = (d, sel, arg) => undoable(d, () =>
  FA.apply('tabsBox', d, new Typing(d), sel, arg));
const own = (d, k) => P(d, k).pPr.tabs;
const edits = (st) => TP.patch(st).patch.tabs;

describe('FormatApply tabsBox: the stops', () => {
  it('the box\'s edits on a styled paragraph: style stop cleared, one '
    + 'undo step', () => {
    const d = doc([styled([T('right', 4320)])]);
    let st = TP.start(FT.rulerStops(d.doc, P(d, 0)), 720);
    st = TP.clearStop(st, 1440);
    st = TP.setStop(st, {pos: 2880, val: 'bar', leader: 'none'}).st;
    st = TP.setStop(st, {pos: 4320, val: 'right', leader: 'dot'}).st;
    box(d, C(d, 0, 0), {tabs: edits(st)});
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(own(d, 0), [T('clear', 1440), T('bar', 2880),
      T('right', 4320, 'dot')]);
    assert.deepEqual(resolveTabs(d.doc.styles, P(d, 0)).map((s) =>
      [s.val, s.pos]), [['bar', 2880], ['right', 4320]]);
  });
  it('Clear all clears the style\'s stops too; then a new stop', () => {
    const d = doc([styled([T('right', 4320)])]);
    let st = TP.clearAll(TP.start(FT.rulerStops(d.doc, P(d, 0)), 720));
    st = TP.setStop(st, {pos: 720, val: 'decimal'}).st;
    box(d, C(d, 0, 0), {tabs: edits(st)});
    assert.deepEqual(own(d, 0), [T('decimal', 720), T('clear', 1440)]);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 0)).map((s) => s.pos),
      [720]);
  });
  it('a mixed selection: the same changes on each one\'s own stops', () => {
    const d = doc(['a', ['b', {pPr: {tabs: [T('center', 2880)],
      extra: []}}], styled()]);
    let st = TP.start(FT.rulerStops(d.doc, P(d, 0)), 720);
    st = TP.setStop(st, {pos: 5760, val: 'right'}).st;
    st = TP.clearStop(TP.setStop(st, {pos: 1440, val: 'left'}).st, 1440);
    box(d, SEL(d, 0, 0, 2, 1), {tabs: {edits: [...edits(st).edits,
      {remove: 2880}, {remove: 1440}]}});
    assert.deepEqual(own(d, 0), [T('right', 5760)]);
    assert.deepEqual(own(d, 1), [T('right', 5760)]);
    assert.deepEqual(own(d, 2), [T('clear', 1440), T('right', 5760)]);
    assert.equal(d.undoDepth, 1);
  });
  it('nothing changed: no undo step', () => {
    const d = doc([styled()]);
    let st = TP.start(FT.rulerStops(d.doc, P(d, 0)), 720);
    st = TP.setStop(st, {pos: 1440, val: 'left', leader: 'none'}).st;
    box(d, C(d, 0, 0), {tabs: edits(st)});
    box(d, C(d, 0, 0), {tabs: {edits: []}});
    box(d, C(d, 0, 0), {});
    assert.equal(d.undoDepth, 0);
  });
  it('a raw w:tabs is never changed: refused, nothing written', () => {
    const raw = parseXml('<w:tabs xmlns:w="http://schemas.openxmlformats'
      + '.org/wordprocessingml/2006/main" xmlns:w14="urn:w14">'
      + '<w:tab w:val="right" w:pos="5000" w14:x="1"/></w:tabs>').root;
    const d = doc(['plain', ['x', {pPr: {extra: [raw]}}]]);
    assert.ok(FT.isRawTabs(P(d, 1)));
    const arg = {tabs: {edits: [{add: T('left', 720)}]}};
    assert.throws(() => box(d, SEL(d, 0, 0, 1, 1), arg), RangeError);
    assert.equal(d.undoDepth, 0);
    assert.equal(own(d, 0), undefined);
    assert.deepEqual(P(d, 1).pPr.extra, [raw]);
    // with a default: nothing at all (one command)
    assert.throws(() => box(d, SEL(d, 0, 0, 1, 1), {...arg,
      defaultTab: 1440}), RangeError);
    assert.equal(defaultStop(d.doc), 720);
    // the default alone is fine
    box(d, C(d, 1, 0), {defaultTab: 1440});
    assert.equal(defaultStop(d.doc), 1440);
  });
  it('stops beyond 22" or at one position twice: raw, refused', () => {
    // the final review's case: {left 40000, right 720, left 720} and a
    // centre stop added would have lost two stops silently
    for (const inner of [
      '<w:tab w:val="left" w:pos="40000"/><w:tab w:val="right" ' +
        'w:pos="720"/><w:tab w:val="left" w:pos="720"/>',
      '<w:tab w:val="right" w:pos="720"/><w:tab w:val="left" ' +
        'w:pos="720"/>',
      '<w:tab w:val="left" w:pos="-40000"/>']) {
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/' +
        '2006/main';
      const node = parseXml('<w:pPr xmlns:w="' + W + '"><w:tabs>' +
        inner + '</w:tabs></w:pPr>').root;
      const {pPr} = readPPr(node, rootScope(node), true);
      assert.equal(pPr.tabs, undefined, 'kept raw: ' + inner);
      const raw = pPr.extra[0];
      const d = doc([['x', {pPr}]]);
      assert.ok(FT.isRawTabs(P(d, 0)), inner);
      for (const arg of [{tabs: {edits: [{add: T('center', 1440)}]}}]) {
        assert.throws(() => box(d, C(d, 0, 0), arg), RangeError);
      }
      assert.throws(() => undoable(d, () => FA.apply('tabs', d,
        new Typing(d), C(d, 0, 0), {add: T('center', 1440)})),
      RangeError);
      assert.equal(d.undoDepth, 0);
      assert.deepEqual(P(d, 0).pPr.extra, [raw]);
    }
  });
  it('more than 64 own stops after the change: refused', () => {
    const many = Array.from({length: 64}, (_, k) => T('left', 100 + k));
    const d = doc([['x', {pPr: {tabs: many, extra: []}}]]);
    assert.throws(() => box(d, C(d, 0, 0), {tabs: {edits: [{add:
      T('left', 9000)}]}}), RangeError);
    assert.equal(d.undoDepth, 0);
    box(d, C(d, 0, 0), {tabs: {edits: [{remove: 100},
      {add: T('left', 9000)}]}});
    assert.equal(own(d, 0).length, 64);
  });
  it('edits refused: move inside, nested edits, too many, bad stops',
    () => {
      const d = doc(['a']);
      const bad = [{edits: [{move: {from: 1, to: 2}}]},
        {edits: [{edits: []}]}, {edits: 'x'},
        {edits: Array.from({length: FT.MAX_EDITS + 1}, () =>
          ({remove: 1}))},
        {edits: [{add: T('clear', 5)}]}, {edits: [{add: 1}]},
        {edits: [], add: T('left', 1)}];
      for (const tabs of bad) {
        assert.throws(() => box(d, C(d, 0, 0), {tabs}), RangeError,
          JSON.stringify(tabs).slice(0, 60));
      }
      assert.equal(d.undoDepth, 0);
    });
  it('written to the file and read back as the field', async () => {
    const d = doc(['a', 'b']);
    box(d, SEL(d, 0, 0, 1, 1), {defaultTab: 1080, tabs: {edits: [
      {add: T('bar', 2000)}, {add: T('right', 9000, 'underscore')}]}});
    const back = await readDocx(await writeDocx(d.doc,
      {date: new Date(Date.UTC(2026, 0, 1))}));
    for (const b of back.sections[0].blocks) {
      assert.deepEqual(b.pPr.tabs, [T('bar', 2000),
        T('right', 9000, 'underscore')]);
    }
    assert.equal(defaultStop(back), 1080);
  });
  it('20,000 paragraphs: select all, the box\'s OK and undo < 3 s', () => {
    const d = doc(Array.from({length: 20000}, (_, k) => 'p' + k));
    const t0 = performance.now();
    FA.apply('tabsBox', d, new Typing(d), SEL(d, 0, 0, 19999, 1),
      {defaultTab: 1440, tabs: {edits: [{set: []},
        {add: T('right', 4320, 'dot')}]}});
    const t1 = performance.now();
    d.undo();
    const t2 = performance.now();
    assert.ok(t1 - t0 < 3000, `${t1 - t0} ms`);
    assert.ok(t2 - t1 < 3000, `${t2 - t1} ms`);
    assert.equal(own(d, 19999), undefined);
  });
});
