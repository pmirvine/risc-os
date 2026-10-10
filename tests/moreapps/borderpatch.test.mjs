// The Borders and shading box (Batch A, A5.2): BorderPatch's values
// from a query (fill) and the command they make (patch): Box, None,
// Custom sides, style / width / colour, fill colour or none, Apply to
// Paragraph or Text, mixed fields left alone, bad values. The commands
// FormatApply 'borders', 'paraShade' and 'charShade' (BorderCommand,
// BorderExplicit): every pBdr / shd key really written by
// FormatPara.explicit (whole sides and shading, never merged attribute
// by attribute with the old one or the style's), a style's side
// cancelled with nil, its shading with clear/auto, a value the style
// gives not written, raw (themed) own w:pBdr / w:shd refused, written
// to the file and read back, one undo step, Word's schema names only
// (FormatCheck, against wml.xsd when cached), 50,000 paragraphs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import * as BP from '../../tools/moreapps/!Word/BorderPatch';
import {BORDER_VALS, SHD_VALS} from '../../tools/moreapps/!Word/BorderNames';
import {isRawOwn, NO_SHADE} from '../../tools/moreapps/!Word/BorderExplicit';
import {paraPatch, charPatch} from '../../tools/moreapps/!Word/FormatCheck';
import * as FA from '../../tools/moreapps/!Word/FormatApply';
import * as F from '../../tools/moreapps/!Word/Format';
import {addStyle} from '../../tools/moreapps/!Word/Styles';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {DEFAULT_XSD} from '../../tools/moreapps-xsdorder.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {mk, P, C, SEL, undoable} from './edit-docs.mjs';

const S = (val, more = {}) => ({val, sz: 4, space: 1, color: 'auto',
  ...more});
const BOX4 = {top: S('single'), bottom: S('single'),
  left: S('single', {space: 4}), right: S('single', {space: 4})};
const Q = (o = {}) => ({borders: {}, paraShade: 'none',
  charShade: 'none', ...o});
const run = (q, over = {}) => BP.patch({...BP.fill(q), ...over}, q);
const T = (d) => new Typing(d);
const go = (d, sel, id, arg) => undoable(d, () =>
  FA.apply(id, d, T(d), sel, arg));
/** The box: filled from the query at sel, fields changed, OK. */
const box = (d, sel, over) => {
  const q = F.query(d.doc, sel);
  const x = BP.patch({...BP.fill(q, over.apply), ...over}, q);
  assert.deepEqual(x.bad, []);
  if (x.arg !== undefined) go(d, sel, x.id, x.arg);
  return x;
};
const W = 'xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main"';
const rawEl = (xml) => parseXml(xml.replace('<w:', `<w:`)
  .replace(/^<(w:\w+)/, `<$1 ${W}`)).root;

describe('BorderNames: Word\'s schema names', () => {
  const have = existsSync(DEFAULT_XSD);
  it('ST_Border and ST_Shd as wml.xsd says',
    {skip: have ? false : 'wml.xsd not cached'}, () => {
      const s = readFileSync(DEFAULT_XSD, 'utf8');
      const vals = (t) => [...new RegExp(`<xsd:simpleType name="${t}">`
        + '([\\s\\S]*?)</xsd:simpleType>').exec(s)[1]
        .matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual([...BORDER_VALS], vals('ST_Border'));
      assert.deepEqual([...SHD_VALS], vals('ST_Shd'));
    });
  it('commands take only those names; the reader keeps any', async () => {
    for (const v of ['single', 'wave', 'apples', 'nil', 'none'])
      assert.equal(paraPatch({pBdr: {top: {val: v}}}).pBdr.top.val, v);
    for (const v of ['madeUp', 'Single', 'pct12', '__proto__', 'x'])
      assert.throws(() => paraPatch({pBdr: {top: {val: v}}}), RangeError);
    for (const v of ['clear', 'pct12', 'pct87', 'thinDiagCross']) {
      assert.equal(paraPatch({shd: {val: v}}).shd.val, v);
      assert.equal(charPatch({shd: {val: v}}).shd.val, v);
    }
    for (const v of ['pct13', 'single', 'Clear', 'constructor']) {
      assert.throws(() => paraPatch({shd: {val: v}}), RangeError, v);
      assert.throws(() => charPatch({shd: {val: v}}), RangeError, v);
    }
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('x'), '<w:pBdr><w:top w:val="madeUp"/></w:pBdr>'
        + '<w:shd w:val="pct13"/>'))}));
    const pp = doc.sections[0].blocks[0].pPr;
    assert.deepEqual([pp.pBdr.top.val, pp.shd.val], ['madeUp', 'pct13']);
  });
});

describe('BorderPatch.fill', () => {
  it('no borders: None, Word\'s defaults; Box; Custom', () => {
    assert.deepEqual(BP.fill(Q()), {top: false, bottom: false,
      left: false, right: false, between: false, style: 'single',
      width: 4, colour: 'auto', setting: 'none', fillkind: 'none',
      fill: undefined, apply: 'para'});
    assert.deepEqual(Object.keys(BP.fill(Q())).sort(),
      [...BP.NAMES].sort());
    const b = BP.fill(Q({borders: {...BOX4}}));
    assert.equal(b.setting, 'box');
    assert.deepEqual([b.style, b.width, b.colour], ['single', 4, 'auto']);
    const c = BP.fill(Q({borders: {top: S('double', {sz: 12,
      color: 'ff0000'})}}));
    assert.deepEqual([c.setting, c.top, c.bottom, c.style, c.width,
      c.colour], ['custom', true, false, 'double', 12, 'FF0000']);
    assert.equal(BP.fill(Q({borders: {...BOX4, between: S('single')}}))
      .setting, 'custom');
  });
  it('sides that differ, or a style or width the box lacks: undefined',
    () => {
      const v = BP.fill(Q({borders: {top: S('double'),
        bottom: S('single', {sz: 8})}}));
      assert.deepEqual([v.style, v.width, v.colour],
        [undefined, undefined, 'auto']);
      const w = BP.fill(Q({borders: {top: S('wave', {sz: 5})}}));
      assert.deepEqual([w.style, w.width], [undefined, undefined]);
    });
  it('mixed (null) is undefined everywhere', () => {
    const v = BP.fill({borders: null, paraShade: null, charShade: null});
    for (const k of BP.NAMES) {
      if (k !== 'apply') assert.equal(v[k], undefined, k);
    }
  });
  it('the fill: clear with a fill, solid, none, nil, a pattern', () => {
    const f = (sh, apply) => {
      const v = BP.fill(Q(apply === 'text' ? {charShade: sh}
        : {paraShade: sh}), apply);
      return [v.fillkind, v.fill];
    };
    assert.deepEqual(f({val: 'clear', color: 'auto', fill: 'ffff00'}),
      ['colour', 'FFFF00']);
    assert.deepEqual(f({val: 'solid', color: '00FF00'}),
      ['colour', '00FF00']);
    assert.deepEqual(f({val: 'clear', fill: 'auto'}), ['none', undefined]);
    assert.deepEqual(f({val: 'nil'}), ['none', undefined]);
    assert.deepEqual(f({val: 'pct20', color: '000000', fill: 'FFFFFF'}),
      [undefined, undefined]);
    assert.deepEqual(f({val: 'clear', fill: '00FFFF'}, 'text'),
      ['colour', '00FFFF']);
    assert.equal(BP.fill(Q({paraShade: {val: 'clear', fill: '00FFFF'}}),
      'text').fillkind, 'none');
  });
  it('settingOf / sidesOf', () => {
    assert.deepEqual(BP.sidesOf('box'), {top: true, bottom: true,
      left: true, right: true, between: false});
    assert.equal(BP.settingOf(BP.sidesOf('none')), 'none');
    assert.equal(BP.settingOf(BP.sidesOf('box')), 'box');
    assert.equal(BP.sidesOf('custom'), null);
    assert.equal(BP.settingOf({top: undefined}), 'custom');
  });
});

describe('BorderPatch.patch', () => {
  it('untouched: nothing to do (also mixed, also a pattern)', () => {
    for (const q of [Q(), Q({borders: BOX4}), {borders: null,
      paraShade: null, charShade: null}, Q({paraShade: {val: 'pct20'}}),
    Q({borders: {top: S('wave', {sz: 5})}})]) {
      assert.deepEqual(run(q), {id: 'borders', arg: undefined, bad: []});
      assert.deepEqual(run(q, {apply: 'text'}).arg, undefined);
    }
  });
  it('Box from none: four whole sides, Word\'s spaces', () => {
    const x = run(Q(), BP.sidesOf('box'));
    assert.deepEqual(x.arg, {pBdr: BOX4});
    const y = run(Q(), {...BP.sidesOf('box'), style: 'double',
      width: 18, colour: '0000FF'});
    assert.deepEqual(y.arg.pBdr.left, {val: 'double', sz: 18,
      color: '0000FF', space: 4});
  });
  it('None from a box: every side null; one side off: that one', () => {
    assert.deepEqual(run(Q({borders: BOX4}), BP.sidesOf('none')).arg,
      {pBdr: {top: null, bottom: null, left: null, right: null}});
    assert.deepEqual(run(Q({borders: BOX4}), {left: false}).arg,
      {pBdr: {left: null}});
    assert.deepEqual(run(Q({borders: BOX4}), {between: true}).arg,
      {pBdr: {between: S('single')}});
  });
  it('a new style rewrites the sides on, keeping space and shadow',
    () => {
      const q = Q({borders: {top: S('single', {space: 9, shadow: true}),
        bottom: S('single')}});
      assert.deepEqual(run(q, {style: 'dotted'}).arg, {pBdr: {
        top: {val: 'dotted', sz: 4, space: 9, color: 'auto',
          shadow: true},
        bottom: S('dotted')}});
    });
  it('differing sides keep their own style when it is not changed',
    () => {
      const q = Q({borders: {top: S('double'), bottom: S('wave')}});
      const x = run(q, {width: 12});
      assert.deepEqual(x.arg.pBdr, {top: S('double', {sz: 12}),
        bottom: S('wave', {sz: 12})});
    });
  it('mixed paragraphs: Box writes all; options untouched nothing', () => {
    const q = {borders: null, paraShade: null, charShade: null};
    assert.deepEqual(run(q, BP.sidesOf('box')).arg.pBdr, {...BOX4,
      between: null});
    assert.deepEqual(run(q, {style: 'thick'}).arg, undefined);
  });
  it('fill colour and none, for paragraphs and for text', () => {
    assert.deepEqual(run(Q(), {fillkind: 'colour', fill: 'FFFF00'}),
      {id: 'borders', arg: {shd: {val: 'clear', color: 'auto',
        fill: 'FFFF00'}}, bad: []});
    const sh = {val: 'clear', color: 'auto', fill: 'FFFF00'};
    assert.deepEqual(run(Q({paraShade: sh}), {fillkind: 'none'}).arg,
      {shd: null});
    assert.deepEqual(run(Q({charShade: sh}), {apply: 'text',
      ...BP.fill(Q({charShade: sh}), 'text'), fill: '00FF00'}),
    {id: 'charShade', arg: {val: 'clear', color: 'auto', fill: '00FF00'},
      bad: []});
    // Text: the borders are not looked at
    assert.deepEqual(run(Q(), {apply: 'text', ...BP.sidesOf('box'),
      fillkind: 'colour', fill: '123456'}).arg, {val: 'clear',
      color: 'auto', fill: '123456'});
  });
  it('values the box does not offer: bad, nothing done', () => {
    for (const [k, v] of [['style', 'wave'], ['width', 5],
      ['colour', 'red'], ['fillkind', 'x'], ['fill', 'FFF'],
      ['top', 1], ['apply', 'both']]) {
      const x = run(Q(), {[k]: v, top: k === 'top' ? v : true});
      assert.deepEqual([x.arg, x.bad], [undefined, [k]], k);
    }
    assert.deepEqual(run(Q(), {fillkind: 'colour'}).bad, ['fill']);
  });
  it('restyling a side without w:space keeps it without (review fix 1)',
    () => {
      const q = Q({borders: {left: {val: 'single', sz: 4}}});
      assert.deepEqual(run(q, {width: 12}).arg, {pBdr: {left:
        {val: 'single', sz: 12, color: 'auto'}}});
      // a new side still gets Word's space
      assert.equal(run(q, {top: true}).arg.pBdr.top.space, 1);
    });
  it('Fill None shown and chosen: unchanged, whatever the colour field '
    + 'holds (review fix 2)', () => {
    for (const q of [Q(), Q({paraShade: {val: 'clear', fill: 'auto'}})]) {
      assert.deepEqual(run(q, {fillkind: 'none', fill: 'D9D9D9'}),
        {id: 'borders', arg: undefined, bad: []});
      assert.deepEqual(run(q, {apply: 'text', fillkind: 'none',
        fill: '00FF00'}).arg, undefined);
    }
  });
  it('a mixed selection: Style / Width / Colour with no side chosen is '
    + 'refused (bad sides, a beep) (review fix 3)', () => {
    const q = {borders: null, paraShade: null, charShade: null};
    for (const o of [{style: 'thick'}, {width: 8}, {colour: 'FF0000'}]) {
      assert.deepEqual(run(q, o), {id: 'borders', arg: undefined,
        bad: ['sides']});
    }
    assert.deepEqual(run(q, {style: 'thick', top: true}).bad, []);
    assert.deepEqual(run(q, {style: 'thick', apply: 'text'}).bad, []);
  });
  it('the box\'s lists', () => {
    assert.deepEqual(BP.STYLES.map((s) => s.text), ['Single', 'Double',
      'Dotted', 'Dashed', 'Thick']);
    assert.deepEqual(BP.WIDTHS.map((s) => [s.id, s.text]), [[2, '1/4 pt'],
      [4, '1/2 pt'], [6, '3/4 pt'], [8, '1 pt'], [12, '1 1/2 pt'],
      [18, '2 1/4 pt'], [24, '3 pt']]);
  });
});

/** A document with a 'Boxed' style (a red box, yellow shading) and a
 *  'Shady' character style (cyan shading). */
function doc(paras) {
  const d = mk(paras);
  addStyle(d.doc.styles, {id: 'Boxed', type: 'paragraph',
    basedOn: 'Normal', pPr: {pBdr: {top: S('single', {color: 'FF0000'}),
      bottom: S('single', {color: 'FF0000'})}, shd: {val: 'pct20',
      color: 'FF0000', fill: 'FFFF00'}, extra: []}});
  addStyle(d.doc.styles, {id: 'Shady', type: 'character',
    rPr: {shd: {val: 'clear', fill: '00FFFF'}, extra: []}});
  return d;
}
const boxed = (t = 'xy') => [t, {pStyle: 'Boxed', pPr: {extra: []}}];
const own = (d, k) => P(d, k).pPr;

describe('FormatApply borders / paraShade: written whole', () => {
  it('every key really written; old side and shading replaced whole, '
    + 'one undo step', () => {
    const d = mk([['a', {pPr: {pBdr: {top: {val: 'double', sz: 12,
      space: 7, color: 'FF0000', shadow: true, frame: true}},
    shd: {val: 'pct20', color: 'FF0000', fill: '00FF00'}, extra: []}}],
    'b']);
    go(d, SEL(d, 0, 0, 1, 1), 'borders', {pBdr: {top: {val: 'single',
      sz: 4}, left: S('dashed')}, shd: {val: 'clear', fill: '0000FF'}});
    assert.equal(d.undoDepth, 1);
    for (const k of [0, 1]) {
      assert.deepEqual(own(d, k).pBdr, {top: {val: 'single', sz: 4},
        left: S('dashed')});
      assert.deepEqual(own(d, k).shd, {val: 'clear', fill: '0000FF'});
    }
    const q = F.query(d.doc, C(d, 0, 0));
    assert.deepEqual(q.paraShade, {val: 'clear', fill: '0000FF'});
  });
  it('the same again, and an empty change: no undo step', () => {
    const d = mk([['a', {pPr: {pBdr: {...BOX4}, extra: []}}]]);
    go(d, C(d, 0, 0), 'borders', {pBdr: {top: S('single')}});
    go(d, C(d, 0, 0), 'borders', {});
    assert.equal(d.undoDepth, 0);
    const q = F.query(d.doc, C(d, 0, 0));
    assert.deepEqual(run(q, BP.sidesOf('box')).arg, undefined);
  });
  it('null removes the own side; the style\'s side is cancelled with nil',
    () => {
      const d = doc([boxed(), ['c', {pPr: {pBdr: {top: S('single')},
        extra: []}}]]);
      go(d, SEL(d, 0, 0, 1, 1), 'borders', {pBdr: {top: null}});
      assert.deepEqual(own(d, 0).pBdr, {top: {val: 'nil'}});
      assert.equal(own(d, 1).pBdr, undefined);
      assert.deepEqual(Object.keys(F.query(d.doc, C(d, 0, 0)).borders),
        ['bottom']);
    });
  it('a side or shading the style gives is not written', () => {
    const d = doc([boxed()]);
    go(d, C(d, 0, 0), 'borders', {pBdr: {top: S('single',
      {color: 'FF0000'})}, shd: {val: 'pct20', color: 'FF0000',
      fill: 'FFFF00'}});
    assert.equal(d.undoDepth, 0);
    assert.deepEqual(own(d, 0), {extra: []});
    // through the box: Box over the style's top and bottom adds left
    // and right only
    box(d, C(d, 0, 0), {left: true, right: true});
    assert.deepEqual(Object.keys(own(d, 0).pBdr), ['left', 'right']);
  });
  it('shading: none over the style\'s is clear/auto; a fill is whole, '
    + 'not merged with the style\'s pattern and colour', () => {
    const d = doc([boxed(), boxed()]);
    go(d, C(d, 0, 0), 'paraShade', null);
    assert.deepEqual(own(d, 0).shd, NO_SHADE);
    assert.equal(F.query(d.doc, C(d, 0, 0)).paraShade.fill, 'auto');
    go(d, C(d, 1, 0), 'paraShade', {val: 'clear', fill: '0000FF'});
    assert.deepEqual(own(d, 1).shd, {val: 'clear', fill: '0000FF'});
    assert.deepEqual(F.query(d.doc, C(d, 1, 0)).paraShade,
      {val: 'clear', fill: '0000FF'});
    go(d, C(d, 1, 0), 'paraShade', {val: 'pct20', color: 'FF0000',
      fill: 'FFFF00'});
    assert.equal(own(d, 1).shd, undefined);
  });
  it('refused: bad args (nothing changed)', () => {
    const d = mk(['a']);
    for (const a of [null, 'x', [], {jc: 'left'}, {pBdr: {top:
      {val: 'madeUp'}}}, {shd: {val: 'pct13'}}, {pBdr: {start:
      S('single')}}]) {
      assert.throws(() => go(d, C(d, 0, 0), 'borders', a), RangeError);
    }
    assert.throws(() => go(d, C(d, 0, 0), 'paraShade', 'red'),
      RangeError);
    assert.equal(d.undoDepth, 0);
  });
});

describe('raw own w:pBdr / w:shd: refused, kept', () => {
  const rawB = () => rawEl('<w:pBdr><w:top w:val="single" '
    + 'w:themeColor="accent1"/><w:left w:val="double"/></w:pBdr>');
  const rawS = () => rawEl('<w:shd w:val="clear" w:themeFill="accent2"/>');
  it('isRawOwn', () => {
    assert.ok(isRawOwn({extra: [rawB()]}, 'pBdr'));
    assert.ok(!isRawOwn({extra: [rawB()]}, 'shd'));
    assert.ok(!isRawOwn({pBdr: {}, extra: [rawB()]}, 'pBdr'));
    assert.ok(!isRawOwn(undefined, 'pBdr'));
  });
  it('a raw w:pBdr: borders refused; shading alone goes in', () => {
    const b = rawB();
    const d = mk(['plain', ['x', {pPr: {extra: [b]}}]]);
    assert.throws(() => go(d, SEL(d, 0, 0, 1, 1), 'borders',
      {pBdr: {bottom: S('single')}}), RangeError);
    assert.throws(() => go(d, C(d, 1, 0), 'borders', {pBdr: null}),
      RangeError);
    assert.equal(d.undoDepth, 0);
    assert.equal(own(d, 0).pBdr, undefined);
    go(d, C(d, 1, 0), 'paraShade', {val: 'clear', fill: 'FFFF00'});
    assert.deepEqual(own(d, 1).extra, [b]);
    assert.equal(own(d, 1).shd.fill, 'FFFF00');
  });
  it('a raw w:shd: shading refused; borders alone go in', () => {
    const s = rawS();
    const d = mk([['x', {pPr: {extra: [s]}}]]);
    assert.throws(() => go(d, C(d, 0, 0), 'paraShade', null), RangeError);
    assert.throws(() => go(d, C(d, 0, 0), 'borders', {pBdr: BOX4,
      shd: {val: 'clear', fill: 'FFFF00'}}), RangeError);
    assert.equal(d.undoDepth, 0);
    go(d, C(d, 0, 0), 'borders', {pBdr: BOX4});
    assert.deepEqual(own(d, 0).extra, [s]);
  });
  it('a run\'s raw w:shd: text shading refused', () => {
    const s = rawS();
    const d = mk([['abc', {runs: [{start: 0, end: 3,
      rPr: {extra: [s]}}]}]]);
    assert.throws(() => go(d, SEL(d, 0, 1, 0, 2), 'charShade', null),
      RangeError);
    assert.deepEqual(P(d, 0).runs[0].rPr.extra, [s]);
    assert.equal(d.undoDepth, 0);
  });
});

describe('FormatApply charShade: the text', () => {
  it('the selected characters only, whole, one step; null removes', () => {
    const d = mk([['abcdef', {runs: [{start: 0, end: 6, rPr: {shd:
      {val: 'pct20', color: 'FF0000', fill: '00FF00'}, extra: []}}]}]]);
    go(d, SEL(d, 0, 2, 0, 4), 'charShade', {val: 'clear',
      fill: 'FFFF00'});
    assert.equal(d.undoDepth, 1);
    const rs = P(d, 0).runs.map((x) => [x.start, x.end, x.rPr.shd]);
    assert.deepEqual(rs[1], [2, 4, {val: 'clear', fill: 'FFFF00'}]);
    assert.equal(rs[0][2].val, 'pct20');
    go(d, SEL(d, 0, 0, 0, 6), 'charShade', null);
    assert.ok(P(d, 0).runs.every((x) => x.rPr.shd === undefined));
  });
  it('over a character style\'s shading: clear/auto; equal: not written',
    () => {
      const d = doc([['abc', {runs: [{start: 0, end: 3, rStyle: 'Shady',
        rPr: {extra: []}}]}]]);
      go(d, SEL(d, 0, 0, 0, 3), 'charShade', {val: 'clear',
        fill: '00FFFF'});
      assert.equal(d.undoDepth, 0);
      go(d, SEL(d, 0, 0, 0, 3), 'charShade', null);
      assert.deepEqual(P(d, 0).runs[0].rPr.shd, NO_SHADE);
    });
  it('at a caret: the pending format, no undo step', () => {
    const d = mk(['abc']);
    const out = FA.apply('charShade', d, T(d), C(d, 0, 1),
      {val: 'clear', fill: 'FFFF00'});
    assert.equal(d.undoDepth, 0);
    assert.deepEqual(out.pending.shd, {val: 'clear', color: null,
      fill: 'FFFF00'});
  });
  it('through the box with Apply to Text', () => {
    const d = mk(['abc def']);
    const x = box(d, SEL(d, 0, 0, 0, 3), {apply: 'text',
      fillkind: 'colour', fill: '00FF00'});
    assert.equal(x.id, 'charShade');
    assert.equal(P(d, 0).runs[0].rPr.shd.fill, '00FF00');
    assert.equal(P(d, 0).pPr.shd, undefined);
    assert.equal(P(d, 0).runs[1].rPr.shd, undefined);
  });
});

describe('Fill Colour then None again: nothing done (review fix 2)', () => {
  it('a styled paragraph and one whose w:shd is raw', () => {
    const raw = rawEl('<w:shd w:val="clear" w:color="auto" w:fill="auto" '
      + 'w:themeFill="accent2"/>');
    const d = mk(['a', ['b', {pPr: {extra: [raw]}}]]);
    addStyle(d.doc.styles, {id: 'Plainish', type: 'paragraph',
      basedOn: 'Normal', pPr: {shd: {val: 'clear', fill: 'auto'},
        extra: []}});
    d.doc.sections[0].blocks[0] = {...P(d, 0), pStyle: 'Plainish'};
    for (const k of [0, 1]) {
      const x = box(d, C(d, k, 0), {fillkind: 'none', fill: 'D9D9D9'});
      assert.deepEqual([x.arg, x.bad], [undefined, []], String(k));
    }
    assert.equal(d.undoDepth, 0);
    assert.deepEqual(P(d, 1).pPr.extra, [raw]);
  });
});

describe('borders and shading written to the file', () => {
  it('read back as the fields; the XML Word expects', async () => {
    const d = doc(['a', boxed('b'), ['cd', {runs: [{start: 0, end: 2,
      rPr: {extra: []}}]}]]);
    box(d, SEL(d, 0, 0, 1, 1), {...BP.sidesOf('box'), style: 'double',
      width: 6, colour: '0000FF', fillkind: 'colour', fill: 'D9D9D9'});
    go(d, C(d, 1, 0), 'borders', {pBdr: {bottom: null}});
    go(d, SEL(d, 2, 0, 2, 2), 'charShade', {val: 'clear', color: 'auto',
      fill: 'FFFF00'});
    const bytes = await writeDocx(d.doc,
      {date: new Date(Date.UTC(2026, 0, 1))});
    const back = await readDocx(bytes);
    const bs = back.sections[0].blocks;
    for (const k of [0, 1, 2]) {
      assert.deepEqual(bs[k].pPr, own(d, k), String(k));
      assert.deepEqual(bs[k].runs.map((x) => x.rPr),
        P(d, k).runs.map((x) => x.rPr));
    }
    const xml = new TextDecoder().decode(
      (await readZip(bytes)).get('word/document.xml'));
    assert.ok(xml.includes('<w:pBdr><w:top w:val="double" w:sz="6" '
      + 'w:space="1" w:color="0000FF"/>'), xml.slice(0, 2000));
    assert.ok(xml.includes('<w:bottom w:val="nil"/>'));
    assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" '
      + 'w:fill="D9D9D9"/>'));
    assert.ok(xml.includes('<w:rPr><w:shd w:val="clear" w:color="auto" '
      + 'w:fill="FFFF00"/></w:rPr>'));
  });
});

describe('50,000 paragraphs', () => {
  it('select all, Box and shading, and undo: each < 5 s', () => {
    const d = mk(Array.from({length: 50000}, (_, k) => 'p' + k));
    const t0 = performance.now();
    FA.apply('borders', d, T(d), SEL(d, 0, 0, 49999, 1),
      {pBdr: BOX4, shd: {val: 'clear', fill: 'FFFF00'}});
    const t1 = performance.now();
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(own(d, 49999).pBdr, BOX4);
    d.undo();
    const t2 = performance.now();
    assert.ok(t1 - t0 < 5000, `${t1 - t0} ms`);
    assert.ok(t2 - t1 < 5000, `${t2 - t1} ms`);
    assert.equal(own(d, 49999).pBdr, undefined);
  });
});
