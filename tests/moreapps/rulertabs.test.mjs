// RulerTabs (WimpLib, pure): the tab stops of a ruler as markers, the
// tab-type selector's cycle, adding, moving (snapped as the indents,
// Shift free) and removing a stop; FormatTabs (!Word) through
// FormatApply's 'tabs': the stops the ruler shows (direct ones black,
// a style's grey), and add / remove / move / set applied to each
// selected paragraph's DIRECT stops (a removed style stop written as
// a clear stop), one undo step, written to the file and read back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as RT from '../../tools/moreapps/!WimpLib/RulerTabs';
import {pickMarker} from '../../tools/moreapps/!WimpLib/RulerPick';
import * as FT from '../../tools/moreapps/!Word/FormatTabs';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import {addStyle} from '../../tools/moreapps/!Word/Styles';
import {resolveTabs} from '../../tools/moreapps/!Word/TabStops';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {mk, P, C, SEL, undoable} from './edit-docs.mjs';

const T = (val, pos, leader) => ({val, pos,
  ...(leader ? {leader} : {})});
const MAX = 9026;
/** A w:tabs the model keeps raw (a w14 attribute): one right stop. */
const rawTabs = () => parseXml('<w:tabs xmlns:w="http://schemas.'
  + 'openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://'
  + 'schemas.microsoft.com/office/word/2010/wordml" w14:x="1">'
  + '<w:tab w:val="right" w:pos="5000"/></w:tabs>').root;

describe('RulerTabs markers', () => {
  it('one marker per stop, its kind by val, style stops grey', () => {
    const m = RT.tabMarks([T('left', 720), T('center', 1440),
      T('right', 2160), T('decimal', 2880), T('bar', 3600),
      {...T('left', 4320), style: true}]);
    assert.deepEqual(m.map((k) => [k.id, k.twips, k.kind, k.grey]), [
      ['tab:720', 720, 'tabL', false], ['tab:1440', 1440, 'tabC', false],
      ['tab:2160', 2160, 'tabR', false],
      ['tab:2880', 2880, 'tabD', false],
      ['tab:3600', 3600, 'tabBar', false],
      ['tab:4320', 4320, 'tabL', true]]);
  });
  it('Strict start / end and num as left / right / left', () => {
    assert.deepEqual(RT.tabMarks([T('start', 1), T('end', 2),
      T('num', 3)]).map((k) => k.kind), ['tabL', 'tabR', 'tabL']);
  });
  it('clear stops and malformed entries give no marker', () => {
    assert.deepEqual(RT.tabMarks([T('clear', 720), null, {pos: 'x'},
      T('weird', 5), {val: 'left', pos: NaN}]), []);
    assert.deepEqual(RT.tabMarks(null), []);
  });
  it('a stop with an id keeps it (a stop being dragged)', () => {
    assert.equal(RT.tabMarks([{...T('left', 900), id: 'tab:720'}])[0].id,
      'tab:720');
  });
  it('ids: tabId / posOf / isTab', () => {
    assert.equal(RT.tabId(-90), 'tab:-90');
    assert.equal(RT.posOf('tab:-90'), -90);
    assert.ok(Number.isNaN(RT.posOf('left')));
    assert.ok(RT.isTab('tab:5') && !RT.isTab('left') && !RT.isTab(5));
    assert.ok(RT.isTabKind('tabBar') && !RT.isTabKind('up'));
  });
});

describe('RulerTabs selector', () => {
  it('left -> center -> right -> decimal -> left', () => {
    assert.deepEqual(RT.SELECTOR, ['left', 'center', 'right', 'decimal']);
    let k = 'left';
    const seen = [];
    for (let i = 0; i < 5; i++) { k = RT.nextKind(k); seen.push(k); }
    assert.deepEqual(seen, ['center', 'right', 'decimal', 'left',
      'center']);
  });
  it('anything else (bar, junk) starts again at left', () => {
    for (const k of ['bar', 'clear', undefined, '__proto__', 7]) {
      assert.equal(RT.nextKind(k), 'left');
    }
  });
});

describe('RulerTabs add / drag / remove', () => {
  const S = [T('left', 720), T('right', 4320, 'dot')];
  it('addAt: snapped to 1/16 inch, sorted, the kind given', () => {
    const r = RT.addAt(S, 1450, 'center');
    assert.deepEqual(r.stop, T('center', 1440));
    assert.deepEqual(r.stops.map((s) => s.pos), [720, 1440, 4320]);
    assert.deepEqual(RT.addAt(S, 1450, 'decimal', true).stop,
      T('decimal', 1450));
  });
  it('addAt on a stop replaces it; outside the text gives null', () => {
    const r = RT.addAt(S, 730, 'right');
    assert.deepEqual(r.stops, [T('right', 720), T('right', 4320, 'dot')]);
    assert.equal(RT.addAt(S, -50, 'left'), null);
    assert.equal(RT.addAt(S, MAX + 50, 'left', false, MAX), null);
    assert.equal(RT.addAt(S, NaN, 'left'), null);
    assert.equal(RT.addAt(S, 100, 'bogus'), null);
    // at the right edge: snapped back inside
    assert.equal(RT.addAt([], MAX, 'left', false, MAX).stop.pos, 9000);
  });
  it('dragTab: snapped, Shift free, kind and leader kept, id kept', () => {
    const r = RT.dragTab(S, 'tab:4320', 2000, false, MAX);
    assert.equal(r.from, 4320);
    assert.equal(r.to, 1980);
    assert.deepEqual(r.stop, {...T('right', 1980, 'dot'), id: 'tab:4320'});
    assert.deepEqual(r.stops.map((s) => s.pos), [720, 1980]);
    assert.equal(RT.dragTab(S, 'tab:720', 1001, true, MAX).to, 1001);
  });
  it('dragTab: clamped to 0 .. max; onto another stop replaces it', () => {
    assert.equal(RT.dragTab(S, 'tab:720', -1e9, false, MAX).to, 0);
    assert.equal(RT.dragTab(S, 'tab:720', 1e9, false, MAX).to, 9000);
    assert.equal(RT.dragTab(S, 'tab:720', 1e9, true, MAX).to, MAX);
    const r = RT.dragTab(S, 'tab:720', 4330, false, MAX);
    assert.deepEqual(r.stops.map((s) => [s.val, s.pos]),
      [['left', 4320]]);
  });
  it('dragTab: an unknown id or a bad place gives null', () => {
    assert.equal(RT.dragTab(S, 'tab:1', 100), null);
    assert.equal(RT.dragTab(S, 'left', 100), null);
    assert.equal(RT.dragTab(S, 'tab:720', NaN), null);
    assert.equal(RT.dragTab(S, 'tab:720', '5'), null);
  });
  it('removeAt drops the stop at pos (and nothing else)', () => {
    assert.deepEqual(RT.removeAt(S, 720), [T('right', 4320, 'dot')]);
    assert.deepEqual(RT.removeAt(S, 1), S);
    assert.notEqual(RT.removeAt(S, 1), S);
  });
  it('the input is never changed', () => {
    const s = structuredClone(S);
    RT.addAt(S, 2000, 'left');
    RT.dragTab(S, 'tab:720', 3000);
    RT.removeAt(S, 720);
    assert.deepEqual(S, s);
  });
});

describe('RulerPick.pickMarker (a press on the ruler)', () => {
  const H = 24, X = (t) => t / 15;
  const pick = (ms, x, y) => {
    const m = pickMarker(ms, x, y, H, X, 6);
    return m ? m.id : null;
  };
  const RIGHT = [{id: 'right', twips: 9030, kind: 'up'},
    {id: 'tab:9030', twips: 9030, kind: 'tabR'}];
  it('a tab at the right indent: the lower part of the band picks the '
    + 'tab, the upper part the indent triangle', () => {
    assert.equal(pick(RIGHT, 602, 17), 'tab:9030');
    assert.equal(pick(RIGHT, 602, 18), 'tab:9030');
    assert.equal(pick(RIGHT, 601, 11), 'right');
    assert.equal(pick(RIGHT, 603, 13), 'right');
    // the tab listed first: the same answers
    const rev = [...RIGHT].reverse();
    assert.equal(pick(rev, 602, 17), 'tab:9030');
    assert.equal(pick(rev, 602, 11), 'right');
  });
  it('a tab at the left / hanging / first-line indent: each reachable',
    () => {
      const ms = [{id: 'first', twips: 1440, kind: 'down'},
        {id: 'hanging', twips: 1440, kind: 'up'},
        {id: 'left', twips: 1440, kind: 'box'},
        {id: 'tab:1440', twips: 1440, kind: 'tabL'}];
      assert.equal(pick(ms, 96, 3), 'first');
      assert.equal(pick(ms, 96, 11), 'hanging');
      assert.equal(pick(ms, 96, 17), 'tab:1440');
      assert.equal(pick(ms, 96, 22), 'left');
    });
  it('not a tie: the nearer marker wins (in its band first)', () => {
    const ms = [{id: 'hanging', twips: 1440, kind: 'up'},
      {id: 'tab:1500', twips: 1500, kind: 'tabL'}];
    assert.equal(pick(ms, 96, 17), 'hanging');
    assert.equal(pick(ms, 100, 17), 'tab:1500');
    assert.equal(pick(ms, 100, 11), 'tab:1500');
  });
  it('another band only when none in the press\'s band; far: null',
    () => {
      const ms = [{id: 'tab:1440', twips: 1440, kind: 'tabL'}];
      assert.equal(pick(ms, 96, 22), 'tab:1440');
      assert.equal(pick(ms, 96, 2), 'tab:1440');
      assert.equal(pick(ms, 103, 17), null);
      assert.equal(pick([], 96, 17), null);
    });
});

// ---------------------------------------------------------------- !Word

/** A document whose 'Tabbed' style has a left stop at 1440. */
function doc(paras) {
  const d = mk(paras);
  addStyle(d.doc.styles, {id: 'Tabbed', type: 'paragraph',
    basedOn: 'Normal', pPr: {tabs: [T('left', 1440)], extra: []}});
  return d;
}
const styled = (tabs) => ['xy', {pStyle: 'Tabbed',
  pPr: tabs ? {tabs, extra: []} : {extra: []}}];
const go = (d, sel, arg) => undoable(d, () =>
  FA.apply('tabs', d, new Typing(d), sel, arg));
const own = (d, k) => P(d, k).pPr.tabs;

describe('FormatTabs.rulerStops', () => {
  it('direct stops black, the style\'s grey, a cleared one gone', () => {
    const d = doc([styled([T('right', 4320)]), styled([T('clear', 1440)]),
      'plain']);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 0)), [
      {...T('left', 1440), style: true}, {...T('right', 4320),
        style: false}]);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 1)), []);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 2)), []);
  });
  it('a direct stop over a style one at the same place is black', () => {
    const d = doc([styled([T('center', 1440)])]);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 0)),
      [{...T('center', 1440), style: false}]);
  });
  it('a raw w:tabs (a w14 attribute) counts as direct', () => {
    const node = rawTabs();
    const d = doc([['x', {pPr: {extra: [node]}}]]);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 0)),
      [{...T('right', 5000), style: false}]);
  });
});

describe('FormatApply tabs (FormatTabs.setTabs)', () => {
  it('add: a direct stop on every selected paragraph, one undo step',
    () => {
      const d = doc(['a', ['b', {pPr: {tabs: [T('right', 4320)],
        extra: []}}], 'c']);
      go(d, SEL(d, 0, 0, 2, 1), {add: T('left', 2880)});
      assert.deepEqual(own(d, 0), [T('left', 2880)]);
      assert.deepEqual(own(d, 1), [T('left', 2880), T('right', 4320)]);
      assert.deepEqual(own(d, 2), [T('left', 2880)]);
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.equal(own(d, 0), undefined);
      assert.deepEqual(own(d, 1), [T('right', 4320)]);
    });
  it('add over the style\'s same stop writes nothing; over a clear '
    + 'drops the clear', () => {
    const d = doc([styled(), styled([T('clear', 1440)])]);
    go(d, C(d, 0, 0), {add: T('left', 1440)});
    assert.equal(d.undoDepth, 0, 'no change, no undo step');
    go(d, C(d, 1, 0), {add: T('left', 1440)});
    assert.equal(own(d, 1), undefined);
    assert.deepEqual(FT.rulerStops(d.doc, P(d, 1)),
      [{...T('left', 1440), style: true}]);
  });
  it('remove: a direct stop dropped; a style stop written as clear',
    () => {
      const d = doc([styled([T('right', 4320)])]);
      go(d, C(d, 0, 0), {remove: 4320});
      assert.equal(own(d, 0), undefined);
      go(d, C(d, 0, 0), {remove: 1440});
      assert.deepEqual(own(d, 0), [T('clear', 1440)]);
      assert.deepEqual(resolveTabs(d.doc.styles, P(d, 0)), []);
    });
  it('remove of a direct stop over a style one leaves a clear', () => {
    const d = doc([styled([T('right', 1440)])]);
    go(d, C(d, 0, 0), {remove: 1440});
    assert.deepEqual(own(d, 0), [T('clear', 1440)]);
  });
  it('remove where there is no stop changes nothing', () => {
    const d = doc([styled([T('right', 4320)])]);
    go(d, C(d, 0, 0), {remove: 999});
    assert.equal(d.undoDepth, 0);
  });
  it('move: each paragraph its own stop at from (its kind), else the '
    + 'given kind', () => {
    const d = doc([['a', {pPr: {tabs: [T('right', 720, 'dot')],
      extra: []}}], ['b', {pPr: {tabs: [T('decimal', 720)], extra: []}}],
    'c']);
    go(d, SEL(d, 0, 0, 2, 1), {move: {from: 720, to: 2160,
      val: 'right', leader: 'dot'}});
    assert.deepEqual(own(d, 0), [T('right', 2160, 'dot')]);
    assert.deepEqual(own(d, 1), [T('decimal', 2160)]);
    assert.deepEqual(own(d, 2), [T('right', 2160, 'dot')]);
    assert.equal(d.undoDepth, 1);
  });
  it('move of a grey (style) stop: a clear at from, the stop at to',
    () => {
      const d = doc([styled()]);
      go(d, C(d, 0, 0), {move: {from: 1440, to: 2880, val: 'left'}});
      assert.deepEqual(own(d, 0), [T('clear', 1440), T('left', 2880)]);
      assert.deepEqual(resolveTabs(d.doc.styles, P(d, 0)).map((s) =>
        s.pos), [2880]);
    });
  it('set: the stops in force made exactly these', () => {
    const d = doc([styled([T('right', 4320)])]);
    go(d, C(d, 0, 0), {set: [T('center', 720), T('right', 4320)]});
    assert.deepEqual(own(d, 0), [T('center', 720), T('clear', 1440),
      T('right', 4320)]);
    go(d, C(d, 0, 0), {set: []});
    assert.deepEqual(own(d, 0), [T('clear', 1440)]);
    go(d, C(d, 0, 0), {set: [T('left', 1440)]});
    assert.equal(own(d, 0), undefined);
  });
  it('a raw direct w:tabs (w14, or more than 256 stops) is never '
    + 'edited: every command refused, nothing changed', () => {
    const node = rawTabs();
    const d = doc([['x', {pPr: {extra: [node]}}], 'y']);
    for (const arg of [{add: T('left', 720)}, {remove: 5000},
      {move: {from: 5000, to: 720}}, {set: []}]) {
      assert.throws(() => FA.apply('tabs', d, new Typing(d),
        SEL(d, 0, 0, 1, 1), arg), RangeError, JSON.stringify(arg));
    }
    assert.equal(d.undoDepth, 0);
    assert.equal(own(d, 0), undefined);
    assert.deepEqual(P(d, 0).pPr.extra, [node]);
    assert.equal(own(d, 1), undefined, 'the other paragraph untouched');
    assert.ok(FT.isRawTabs(P(d, 0)) && !FT.isRawTabs(P(d, 1)));
  });
  it('more than 64 direct entries: refused (FormatCheck), nothing '
    + 'changed', () => {
    const many = Array.from({length: 70}, (_, k) => T('left', 100 + k));
    const d = doc([['x', {pPr: {tabs: many, extra: []}}]]);
    for (const arg of [{add: T('left', 7200)}, {remove: 100}]) {
      assert.throws(() => FA.apply('tabs', d, new Typing(d), C(d, 0, 0),
        arg), RangeError);
    }
    assert.equal(d.undoDepth, 0);
    assert.equal(own(d, 0).length, 70);
  });
  it('Strict: new stops written start / end', () => {
    const d = doc(['a']);
    d.doc.meta.conformance = 'strict';
    go(d, C(d, 0, 0), {add: T('left', 720)});
    go(d, C(d, 0, 0), {add: T('right', 1440)});
    assert.deepEqual(own(d, 0), [T('start', 720), T('end', 1440)]);
  });
  it('bad arguments refused (RangeError), nothing changed', () => {
    const d = doc(['a']);
    for (const arg of [null, {}, {add: T('clear', 720)},
      {add: T('left', 'x')}, {add: T('weird', 5)}, {remove: 'x'},
      {move: {from: 1, to: NaN}}, {set: 'x'}, {add: T('left', 1),
        remove: 1}, JSON.parse('{"__proto__": {"x": 1}}'),
      {set: Array.from({length: 65}, (_, k) => T('left', k * 10))}]) {
      assert.throws(() => FA.apply('tabs', d, new Typing(d), C(d, 0, 0),
        arg), RangeError, JSON.stringify(arg));
    }
    assert.equal(d.undoDepth, 0);
  });
  it('written to the file and read back as the field', async () => {
    const d = doc([styled([T('right', 4320, 'dot')])]);
    go(d, C(d, 0, 0), {remove: 1440});
    go(d, C(d, 0, 0), {add: T('decimal', 2880)});
    const back = await readDocx(await writeDocx(d.doc));
    const p0 = back.sections[0].blocks[0];
    assert.deepEqual(p0.pPr.tabs, [T('clear', 1440), T('decimal', 2880),
      T('right', 4320, 'dot')]);
  });
  it('select-all over 20,000 paragraphs: < 3 s, undo < 3 s', () => {
    const d = doc(Array.from({length: 20000}, (_, k) => (k % 2
      ? styled() : 'p')));
    let t0 = performance.now();
    FA.apply('tabs', d, new Typing(d), SEL(d, 0, 0, 19999, 1),
      {add: T('left', 2880)});
    const ms = performance.now() - t0;
    assert.ok(ms < 3000, String(ms));
    t0 = performance.now();
    d.undo();
    assert.ok(performance.now() - t0 < 3000);
  });
});

describe('RulerTabs.defaultTicks (the default stops on the ruler)', () => {
  it('every multiple past the last stop that is not a bar', () => {
    assert.deepEqual(RT.defaultTicks([], 720, 3000), [720, 1440, 2160,
      2880]);
    assert.deepEqual(RT.defaultTicks([T('left', 1440)], 720, 3000),
      [2160, 2880]);
    assert.deepEqual(RT.defaultTicks([T('right', 1000)], 1440, 4320),
      [1440, 2880, 4320]);
    assert.deepEqual(RT.defaultTicks([T('left', 500), T('bar', 2500)],
      720, 3000), [720, 1440, 2160, 2880]);
    assert.deepEqual(RT.defaultTicks([T('left', 9000)], 720, 3000), []);
  });
  it('none for a bad step; at most MAX_TICKS', () => {
    for (const e of [0, -720, NaN, undefined]) {
      assert.deepEqual(RT.defaultTicks([], e, 3000), [], String(e));
    }
    assert.deepEqual(RT.defaultTicks([], 720, 0), []);
    assert.equal(RT.defaultTicks([], 1, 1e9).length, RT.MAX_TICKS);
    assert.deepEqual(RT.defaultTicks([null, {pos: 'x'}], 720, 720),
      [720]);
  });
});
