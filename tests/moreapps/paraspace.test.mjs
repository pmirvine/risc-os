// ParaSpace: line heights for the line spacing rules (auto, exact,
// at least), the clipping flag, contextual spacing between
// paragraphs of one style (and the DocStack decorator that applies
// it as a negative gap, with its neighbour key), and a raw
// w:spacing read back. Measured with the fake of word-docs.mjs
// (8 px per character; 11 pt text is 14.67 px).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import * as PS from '../../tools/moreapps/!Word/ParaSpace';
import {paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

let styles;
before(async () => { styles = await loadStyles(); });

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6,
  `${what}: ${a} != ${b}`);
const pf = (lineRule, lineTw, factor = 1) => ({lineRule, lineTw,
  factor});
const sp = (spacing, more = {}) => newPara('hello world', {pPr:
  {spacing, extra: []}, ...more});

describe('ParaSpace.lineBox', () => {
  it('auto: 1.25 px times the factor, baseline 0.27 px up', () => {
    for (const f of [1, 1.15, 2, 3]) {
      const b = PS.lineBox(pf('auto', 240 * f, f), 16);
      near(b.h, 20 * f, 'h ' + f);
      near(b.base, 20 * f - 16 * 0.27, 'base ' + f);
      assert.equal(b.clip, false);
    }
    // no rule: auto
    near(PS.lineBox({factor: 2}, 16).h, 40, 'no rule');
  });
  it('auto grows for raised and lowered text', () => {
    const b = PS.lineBox(pf('auto', 240), 16, 30, 0);
    near(b.base, 30, 'base at the raised text');
    near(b.h, 20 + (30 - (20 - 16 * 0.27)), 'h');
    const c = PS.lineBox(pf('auto', 240), 16, 0, 10);
    near(c.h - c.base, 10, 'room below');
  });
  it('exact: the line in twips, baseline at 0.8, clip flag', () => {
    const b = PS.lineBox(pf('exact', 480), 16);
    near(b.h, 32, 'h');
    near(b.base, 32 * 0.8, 'base');
    assert.equal(b.clip, false);
    // 10 pt exact under 16 px text: Word cuts the text
    const c = PS.lineBox(pf('exact', 200), 16);
    near(c.h, 200 / 15, 'h');
    assert.equal(c.clip, true);
    // raised text does not grow an exact line: it is clipped
    const d = PS.lineBox(pf('exact', 480), 16, 40, 0);
    near(d.h, 32, 'not grown');
    assert.equal(d.clip, true);
  });
  it('exact and at least clamped to 2..2112 px; missing: 240', () => {
    for (const rule of ['exact', 'atLeast']) {
      near(PS.lineBox(pf(rule, 1e9), 16).h, PS.MAX_LINE, rule + ' max');
      near(PS.lineBox(pf(rule, 1e9), 16).h, 2112, rule + ' 1584 pt');
      near(PS.lineBox(pf(rule, -50), 1).h, 2, rule + ' negative');
      near(PS.lineBox(pf(rule, null), 4).h, 16, rule + ' none');
      near(PS.lineBox(pf(rule, NaN), 4).h, 16, rule + ' NaN');
    }
    near(PS.lineBox(pf('exact', 0), 16).h, 2, 'exact 0');
    assert.equal(PS.lineBox(pf('exact', 0), 16).clip, true);
    assert.equal(PS.MIN_LINE, 2);
  });
  it('at least: never below the natural height; extra goes above', () => {
    const small = PS.lineBox(pf('atLeast', 60), 16);
    near(small.h, 20, 'natural kept');
    near(small.base, 20 - 16 * 0.27, 'natural base');
    const big = PS.lineBox(pf('atLeast', 720), 16);
    near(big.h, 48, 'value');
    near(big.h - big.base, 16 * 0.27, 'text at the bottom');
    assert.equal(big.clip, false);
    // the factor does not count for at least
    near(PS.lineBox(pf('atLeast', 60, 3), 16).h, 20, 'factor ignored');
  });
});

describe('ParaSpace.contextual', () => {
  const side = (style, contextual, before = 10, after = 20) =>
    ({style, contextual, before, after});
  it('same style, both flags: the space between them dropped', () => {
    assert.deepEqual(PS.contextual(side('A', true), side('A', true)),
      {cutAfter: 20, cutBefore: 10});
  });
  it('each paragraph\'s own flag drops its own space', () => {
    assert.deepEqual(PS.contextual(side('A', true), side('A', false)),
      {cutAfter: 20, cutBefore: 0});
    assert.deepEqual(PS.contextual(side('A', false), side('A', true)),
      {cutAfter: 0, cutBefore: 10});
    assert.deepEqual(PS.contextual(side('A', false), side('A', false)),
      {cutAfter: 0, cutBefore: 0});
  });
  it('only between paragraphs of the same style', () => {
    const none = {cutAfter: 0, cutBefore: 0};
    assert.deepEqual(PS.contextual(side('A', true), side('B', true)),
      none);
    assert.deepEqual(PS.contextual(side(null, true), side(null, true)),
      none);
    assert.deepEqual(PS.contextual(null, side('A', true)), none);
    assert.deepEqual(PS.contextual(side('A', true), undefined), none);
    // odd space values: none dropped
    assert.deepEqual(PS.contextual(side('A', true, NaN, -5),
      side('A', 'yes', 3, 3)), {cutAfter: 0, cutBefore: 0});
  });
  it('contextualOf: through the style chain, the direct one last', () => {
    const d = mk(['x']);
    const st = d.doc.styles;
    assert.equal(PS.contextualOf(st, newPara('a')), false);
    assert.equal(PS.contextualOf(st, newPara('a',
      {pStyle: 'ListParagraph'})), true);
    assert.equal(PS.contextualOf(st, newPara('a', {pStyle:
      'ListParagraph', pPr: {contextualSpacing: false, extra: []}})),
    false);
    assert.equal(PS.contextualOf(st, newPara('a',
      {pPr: {contextualSpacing: true, extra: []}})), true);
    assert.equal(PS.contextualOf(null, newPara('a',
      {pPr: {contextualSpacing: true, extra: []}})), true);
  });
});

describe('ParaSpace.rawSpacing', () => {
  const node = (attrs) => ({name: 'w:spacing', attrs, children: []});
  it('reads the held attributes of a raw w:spacing; autospacing ' +
    'is 14 pt', () => {
    const pPr = {extra: [node([['w:before', '100'],
      ['w:beforeAutospacing', '1'], ['w:after', '100'],
      ['w:afterAutospacing', '1'], ['w:line', '276'],
      ['w:lineRule', 'auto']])]};
    assert.deepEqual(PS.rawSpacing(pPr), {before: 280, after: 280,
      line: 276, lineRule: 'auto'});
    assert.deepEqual(PS.rawSpacing({extra: [node([['w:before', '100'],
      ['w:beforeAutospacing', '0'], ['w:beforeLines', '50']])]}),
    {before: 100});
  });
  it('only WordprocessingML\'s: x:spacing and x: attributes ignored',
    () => {
      assert.deepEqual(PS.rawSpacing({extra: [{name: 'x:spacing',
        attrs: [['xmlns:x', 'urn:x'], ['x:before', '100']],
        children: []}]}), {});
      assert.deepEqual(PS.rawSpacing({extra: [{name: 'spacing',
        attrs: [['before', '100']], children: []}]}), {});
      assert.deepEqual(PS.rawSpacing({extra: [node([['x:line', '480'],
        ['w:before', '60']])]}), {before: 60});
    });
  it('hostile values left out or clamped; none: {}', () => {
    assert.deepEqual(PS.rawSpacing({extra: [node([['w:before', 'x'],
      ['w:after', '99999999'], ['w:line', '-40'],
      ['w:lineRule', 'sometimes'], ['__proto__', '1'],
      ['w:__proto__', '5'], ['w:before', '1e3']])]}),
    {after: 31680, line: 0});
    assert.deepEqual(PS.rawSpacing({extra: []}), {});
    assert.deepEqual(PS.rawSpacing(null), {});
    assert.deepEqual(PS.rawSpacing({extra: [null, {name: 3},
      {name: 'w:jc', attrs: [['w:val', 'left']]}]}), {});
    assert.equal(Object.getPrototypeOf(PS.rawSpacing({extra:
      [node([['__proto__', '1']])]})), Object.prototype);
  });
});

describe('line spacing laid out (LineLayout, Fmt)', () => {
  const lay = (p, w = 400) => layoutPara(p, styles, w, tm(), new Map());
  it('paraFmt gives the rule, the twips and contextual', () => {
    const f = paraFmt(styles, sp({line: 360, lineRule: 'exact'}, {pPr:
      {spacing: {line: 360, lineRule: 'exact'},
        contextualSpacing: true, extra: []}}));
    assert.equal(f.lineRule, 'exact');
    assert.equal(f.lineTw, 360);
    assert.equal(f.factor, 1);
    assert.equal(f.contextual, true);
    const g = paraFmt(styles, sp({line: 480}));
    assert.deepEqual([g.lineRule, g.lineTw, g.factor, g.contextual],
      ['auto', 480, 2, false]);
    const h = paraFmt(styles, sp({lineRule: 'bogus'}));
    assert.deepEqual([h.lineRule, h.lineTw], ['auto', null]);
  });
  it('the pitch of wrapped lines at 1.0, 2.0, exact, at least', () => {
    const text = 'aaaa bbbb cccc dddd eeee ffff';
    const pitch = (spacing) => {
      const l = lay(newPara(text, {pPr: {spacing, extra: []}}), 100);
      assert.equal(l.lines.length, 3);
      return l.lines[1].y - l.lines[0].y;
    };
    const one = pitch({line: 240});
    near(pitch({line: 480}), one * 2, 'double');
    near(pitch({line: 360}), one * 1.5, '1.5');
    near(pitch({line: 300, lineRule: 'exact'}), 20, 'exact 15 pt');
    near(pitch({line: 900, lineRule: 'atLeast'}), 60, 'at least');
    near(pitch({line: 20, lineRule: 'atLeast'}), one, 'at least small');
  });
  it('an exact line lower than its text is marked clip', () => {
    const l = lay(sp({line: 100, lineRule: 'exact'}));
    assert.equal(l.lines[0].clip, true);
    near(l.lines[0].h, 100 / 15, 'h');
    assert.equal(lay(sp({line: 480, lineRule: 'exact'})).lines[0].clip,
      undefined);
    // an empty paragraph too
    const e = lay(newPara('', {pPr: {spacing: {line: 600,
      lineRule: 'exact'}, extra: []}}));
    near(e.h, 40, 'empty exact');
  });
});

describe('ParaSpace.spacingDeco (contextual spacing on screen)', () => {
  // List Paragraph has contextualSpacing (as Word's); spacing direct
  const LP = (t, spacing = {before: 120, after: 240}, more = {}) =>
    [t, {pStyle: 'ListParagraph', pPr: {spacing, extra: []}, ...more}];
  const laid = (d, prev) => {
    const L = new DocLayout(d.doc, prev ? prev.metrics : tm(), prev);
    L.layout(1000);
    return L;
  };
  it('two List Paragraphs: the after and before between dropped', () => {
    const d = mk([LP('one'), LP('two'), LP('three')]);
    const L = laid(d);
    const [a, b, c] = L.items;
    assert.equal(a.gapAbove, 0);
    near(b.gapAbove, -(16 + 8), 'b');
    near(c.gapAbove, -(16 + 8), 'c');
    // the second's first line sits right under the first's last
    near(b.y + b.lines[0].y, a.y + a.lines[0].y + a.lines[0].h,
      'no space between');
    // drawn order and itemAtY hold
    for (let i = 1; i < L.items.length; i++) {
      const p = L.items[i - 1], q = L.items[i];
      assert.ok(q.y + q.h > p.y + p.h);
      // a click on the lower one's text is the lower one's, on the
      // upper one's last line the upper one's
      assert.equal(L.itemAtY(q.y + q.lines[0].y), q);
      assert.equal(L.itemAtY(q.y + q.lines[0].y + 1), q);
      const last = p.lines.at(-1);
      assert.equal(L.itemAtY(p.y + last.y + last.h - 0.5), p);
      const h = L.hitTest(L.left + 3, q.y + q.lines[0].y + 2);
      assert.equal(h.pos.id, q.id);
    }
  });
  it('another style between: the space stays', () => {
    const d = mk([LP('one'), ['plain', {pPr: {spacing: {before: 120,
      after: 240}, extra: []}}], LP('two')]);
    const L = laid(d);
    assert.deepEqual(L.items.map((it) => it.gapAbove), [0, 0, 0]);
  });
  it('one flag: only that paragraph\'s own space goes', () => {
    const off = {contextualSpacing: false};
    const d = mk([LP('one', {before: 120, after: 240}),
      ['two', {pStyle: 'ListParagraph', pPr: {spacing: {before: 120,
        after: 240}, ...off, extra: []}}]]);
    near(laid(d).items[1].gapAbove, -16, 'only the first one\'s after');
    const e = mk([['one', {pStyle: 'ListParagraph', pPr: {spacing:
      {before: 120, after: 240}, ...off, extra: []}}], LP('two')]);
    near(laid(e).items[1].gapAbove, -8, 'only the second one\'s before');
  });
  it('a neighbour changed: asked again (keyOf); others reused', () => {
    const d = mk([LP('one'), LP('two'), LP('three')]);
    const a = laid(d);
    const deco1 = a.items[1].deco, deco2 = a.items[2].deco;
    // paragraph 0 gets another style: item 1's gap goes, item 2 keeps
    d.apply({op: 'setProps', block: [0, 0], pStyle: null});
    const b = laid(d, a);
    assert.equal(b.items[1].gapAbove, 0);
    assert.notEqual(b.items[1].deco, deco1);
    assert.equal(b.items[2].deco, deco2);
    assert.equal(b.items[2].lines, a.items[2].lines);
    assert.equal(PS.spacingDeco.keyOf(b.items[0], b), null);
    assert.equal(PS.spacingDeco.keyOf(b.items[1], b), b.items[0].block);
  });
  it('kept blocks and the first item: no gap', () => {
    const d = mk([LP('one'), {type: 'opaque', node: {name: 'w:tbl',
      attrs: [], children: []}}, LP('two')]);
    const L = laid(d);
    assert.deepEqual(L.items.map((it) => it.gapAbove), [0, 0, 0]);
  });
});

describe('DocStack: negative gaps clamped', () => {
  it('never above the start, never ending above the item before', () => {
    const d = mk(['one', 'two', 'three']);
    const huge = (it) => ({gapAbove: -1e6});
    const L = new DocLayout(d.doc, tm(), null, {decorators: [huge]});
    L.layout(1000);
    const [a, b, c] = L.items;
    const plain = new DocLayout(d.doc, tm(), null, {decorators: []});
    plain.layout(1000);
    assert.equal(a.y, plain.items[0].y);
    for (const [p, q] of [[a, b], [b, c]]) {
      assert.ok(q.y + q.h > p.y + p.h, 'ends in order');
      assert.ok(q.y + q.h <= p.y + p.h + 1 + 1e-9, 'pulled up');
    }
    assert.equal(L.itemAtY(c.y + c.h - 0.5), c);
  });
});
