// FormatCheck: the patches the formatting commands accept (the fields
// of task A1.3: flow flags, tabs, borders, shading).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {paraPatch, charPatch, MAX_TABS}
  from '../../tools/moreapps/!Word/FormatCheck';
import {pPrNode, rPrNode} from '../../tools/moreapps/!Word/WriteProps';
import * as FS from '../../tools/moreapps/!Word/FormatSet';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {mk, P, C} from './edit-docs.mjs';

const MAP = new Map([['w',
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main']]);
const refused = (f) => assert.throws(f, RangeError);

describe('FormatCheck.paraPatch: flow flags', () => {
  it('booleans or null', () => {
    for (const k of ['keepNext', 'keepLines', 'widowControl',
      'pageBreakBefore', 'contextualSpacing']) {
      assert.deepEqual(paraPatch({[k]: true}), {[k]: true});
      assert.deepEqual(paraPatch({[k]: false}), {[k]: false});
      assert.deepEqual(paraPatch({[k]: null}), {[k]: null});
      refused(() => paraPatch({[k]: 1}));
      refused(() => paraPatch({[k]: 'true'}));
    }
  });
  it('spacing with lineRule', () => {
    assert.deepEqual(paraPatch({spacing: {line: 360, lineRule: 'auto'}}),
      {spacing: {line: 360, lineRule: 'auto'}});
    assert.deepEqual(paraPatch({spacing: {line: 240,
      lineRule: 'exact'}}).spacing.lineRule, 'exact');
    refused(() => paraPatch({spacing: {lineRule: 'double'}}));
  });
  it('unknown keys refused, __proto__ too', () => {
    refused(() => paraPatch({keepnext: true}));
    refused(() => paraPatch(JSON.parse('{"__proto__": {"x": 1}}')));
  });
});

describe('FormatCheck.paraPatch: tabs', () => {
  it('a checked copy in the order given', () => {
    const tabs = [{val: 'right', pos: 9000.4},
      {val: 'decimal', pos: 4320, leader: 'dot'}, {val: 'clear', pos: 0}];
    const out = paraPatch({tabs}).tabs;
    assert.deepEqual(out, [{val: 'right', pos: 9000},
      {val: 'decimal', pos: 4320, leader: 'dot'}, {val: 'clear', pos: 0}]);
    assert.notEqual(out[0], tabs[0]);
    assert.deepEqual(paraPatch({tabs: null}), {tabs: null});
    // (a w:tabs needs at least one w:tab: none means no direct stops)
    assert.deepEqual(paraPatch({tabs: []}), {tabs: null});
  });
  it('positions clamped to +-31680', () => {
    assert.deepEqual(paraPatch({tabs: [{val: 'left', pos: 1e9},
      {val: 'left', pos: -1e9}]}).tabs.map((t) => t.pos), [31680, -31680]);
  });
  it('at most MAX_TABS (64) stops', () => {
    assert.equal(MAX_TABS, 64);
    const n = (k) => Array.from({length: k}, (_, i) =>
      ({val: 'left', pos: i * 10}));
    assert.equal(paraPatch({tabs: n(64)}).tabs.length, 64);
    refused(() => paraPatch({tabs: n(65)}));
  });
  it('refuses bad stops', () => {
    for (const t of [{}, 'x', [null], [{val: 'middle', pos: 1}],
      [{val: 'left'}], [{val: 'left', pos: NaN}],
      [{val: 'left', pos: '1'}], [{val: 'left', pos: 1, leader: 'x'}],
      [{val: 'left', pos: 1, colour: 1}],
      [{val: 'left', pos: 5}, {val: 'right', pos: 5}],
      JSON.parse('[{"val": "left", "pos": 1, "__proto__": {}}]')]) {
      refused(() => paraPatch({tabs: t}));
    }
  });
  it('the result is written', () => {
    const v = paraPatch({tabs: [{val: 'center', pos: 100,
      leader: 'middleDot'}]});
    assert.ok(pPrNode({extra: [], ...v}, undefined, null, MAP));
  });
});

describe('FormatCheck.paraPatch: pBdr', () => {
  it('sides checked, colours upper case, widths clamped', () => {
    const out = paraPatch({pBdr: {top: {val: 'single', sz: 200,
      space: 40, color: 'ff0000', shadow: true}, bottom: null}});
    assert.deepEqual(out.pBdr, {top: {val: 'single', sz: 96, space: 31,
      color: 'FF0000', shadow: true}, bottom: null});
    assert.deepEqual(paraPatch({pBdr: {left: {val: 'nil', sz: -5}}})
      .pBdr.left, {val: 'nil', sz: 0});
    assert.deepEqual(paraPatch({pBdr: null}), {pBdr: null});
    pPrNode({extra: [], pBdr: {top: out.pBdr.top}}, undefined, null, MAP);
  });
  it('refuses bad borders', () => {
    for (const b of ['x', [], {start: {val: 'single'}},
      {top: {sz: 4}}, {top: {val: 'a b'}}, {top: {val: 'single',
        color: 'red'}}, {top: {val: 'single', shadow: 1}},
      {top: {val: 'single', themeColor: 'x'}}, {top: 'single'},
      JSON.parse('{"__proto__": {"val": "single"}}')]) {
      refused(() => paraPatch({pBdr: b}));
    }
  });
});

describe('FormatCheck: shd', () => {
  it('paragraph and character shading', () => {
    const v = {shd: {val: 'clear', color: 'auto', fill: 'd9d9d9'}};
    const want = {shd: {val: 'clear', color: 'auto', fill: 'D9D9D9'}};
    assert.deepEqual(paraPatch(v), want);
    assert.deepEqual(charPatch(v), want);
    assert.deepEqual(charPatch({shd: null}), {shd: null});
    assert.ok(rPrNode({extra: [], ...want}, undefined, MAP));
  });
  it('refuses bad shading', () => {
    for (const s of ['clear', {fill: 'FFFFFF'}, {val: 'clear',
      fill: 'FFF'}, {val: 'clear', themeFill: 'accent1'},
    {val: 'x y'}]) {
      refused(() => paraPatch({shd: s}));
      refused(() => charPatch({shd: s}));
    }
  });
});

// every paraPatch key must really be written by FormatPara.explicit
// (setPara): tabs (A4.1), written to the file and read back
describe('FormatSet.setPara: tabs written', () => {
  const TABS = [{val: 'right', pos: 9000, leader: 'dot'},
    {val: 'decimal', pos: 4320}, {val: 'clear', pos: 720},
    {val: 'bar', pos: -360}];
  it('set, written in the file, read back; undo; [] removes', async () => {
    const d = mk(['a\tb', ['c', {pPr: {tabs: [{val: 'left', pos: 100}],
      extra: []}}]]);
    const t = new Typing(d);
    FS.setPara(d, t, C(d, 0, 0), {tabs: TABS});
    assert.deepEqual(P(d, 0).pPr.tabs, TABS);
    const back = await readDocx(await writeDocx(d.doc));
    const p0 = back.sections[0].blocks[0];
    assert.deepEqual(p0.pPr.tabs, TABS);
    assert.equal(p0.pPr.extra.length, 0, 'a field, not raw');
    d.undo();
    assert.equal(P(d, 0).pPr.tabs, undefined);
    FS.setPara(d, t, C(d, 1, 0), {tabs: []});
    assert.equal(P(d, 1).pPr.tabs, undefined);
    const back2 = await readDocx(await writeDocx(d.doc));
    assert.equal(back2.sections[0].blocks[1].pPr.tabs, undefined);
  });
});
