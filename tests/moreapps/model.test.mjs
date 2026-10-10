// Model, operations with inverses, and Document (undo/redo, groups).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, newSection, emptyDoc, OBJ}
  from '../../tools/moreapps/!Word/Model';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {Document} from '../../tools/moreapps/!Word/Document';
import {addRel, withStyle} from '../../tools/moreapps/!Word/DocParts';
import {newStyleTable} from '../../tools/moreapps/!Word/Styles';

const R = (o = {}) => ({...o, extra: []});
const X = (name) => ({name, attrs: [['w:val', '1']], children: []});
const clone = (d) => structuredClone(d);
const docOf = (...blocks) => {
  const d = emptyDoc();
  d.sections[0].blocks = blocks;
  return d;
};
const para = (d, i = 0, s = 0) => d.sections[s].blocks[i];
const spans = (p) => p.runs.map((r) => [r.start, r.end]);
const throwsRange = (fn) => assert.throws(fn, RangeError);

/** 'Hello world': [0,6) bold, [6,11) italic. */
const hello = () => newPara('Hello world', {runs: [
  {start: 0, end: 6, rPr: R({b: true})},
  {start: 6, end: 11, rPr: R({i: true})},
]});

// ---- invariants, written independently of the module ----------------

const canon = (v) => JSON.stringify(v, (k, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((n) => [n, x[n]]))
    : x);

function checkPara(p, where) {
  const m = (s) => where + ': ' + s;
  assert.equal(p.type, 'p', m('type'));
  assert.ok(Number.isInteger(p.id), m('id'));
  assert.equal(typeof p.text, 'string', m('text'));
  assert.ok(Array.isArray(p.extraP), m('extraP'));
  assert.ok(p.pPr && Array.isArray(p.pPr.extra), m('pPr.extra'));
  if (p.text.length === 0) assert.deepEqual(p.runs, [], m('runs'));
  let at = 0;
  for (let k = 0; k < p.runs.length; k++) {
    const r = p.runs[k];
    assert.equal(r.start, at, m('runs contiguous'));
    assert.ok(r.end > r.start, m('empty run'));
    assert.ok(Array.isArray(r.rPr.extra), m('rPr.extra'));
    if (k > 0) {
      const q = p.runs[k - 1];
      assert.notEqual(canon([q.rPr, q.rStyle]), canon([r.rPr, r.rStyle]),
        m('adjacent equal runs not merged'));
    }
    at = r.end;
  }
  assert.equal(at, p.text.length, m('runs cover text'));
  const want = [];
  for (let i = 0; i < p.text.length; i++)
    if (p.text.charCodeAt(i) === 0xfffc) want.push(String(i));
  assert.deepEqual(Object.keys(p.inlines).sort(), want.sort(),
    m('inlines match U+FFFC'));
}

function checkDoc(d) {
  const ids = new Set();
  d.sections.forEach((s, si) => s.blocks.forEach((b, bi) => {
    if (b.type !== 'p') return;
    checkPara(b, si + '/' + bi);
    assert.ok(!ids.has(b.id), 'duplicate id ' + b.id);
    ids.add(b.id);
  }));
}

// ---- factories ---------------------------------------------------------

describe('Model factories', () => {
  it('emptyDoc has one section with one empty paragraph', () => {
    const d = emptyDoc();
    assert.equal(d.sections.length, 1);
    assert.equal(d.sections[0].blocks.length, 1);
    const p = para(d);
    assert.equal(p.type, 'p');
    assert.equal(p.text, '');
    assert.deepEqual(p.runs, []);
    assert.deepEqual(p.inlines, {});
    assert.deepEqual(p.extraP, []);
    assert.deepEqual(p.pPr, {extra: []});
    assert.equal(d.styles, null);
    assert.equal(d.numbering, null);
    assert.ok(d.parts instanceof Map);
    assert.deepEqual(d.rels, []);
    assert.deepEqual(d.meta, {});
    assert.equal(d.rawSettings, null);
    assert.deepEqual(d.sections[0].props, {extra: []});
    checkDoc(d);
  });
  it('newSection is empty', () => {
    assert.deepEqual(newSection(),
      {props: {extra: []}, blocks: [], raw: null});
  });
  it('newPara gives one run and unique ids', () => {
    const a = newPara('abc');
    const b = newPara('abc', {rPr: R({b: true}), pStyle: 'Heading1'});
    assert.deepEqual(a.runs, [{start: 0, end: 3, rPr: {extra: []}}]);
    assert.deepEqual(b.runs[0].rPr, R({b: true}));
    assert.equal(b.pStyle, 'Heading1');
    assert.notEqual(a.id, b.id);
    checkPara(a, 'a'); checkPara(b, 'b');
  });
  it('newPara checks inlines and runs', () => {
    throwsRange(() => newPara('a' + OBJ));
    const p = newPara('a' + OBJ, {inlines: {1: {kind: 'tab'}}});
    assert.deepEqual(p.inlines, {1: {kind: 'tab'}});
    throwsRange(() => newPara('ab', {inlines: {0: {kind: 'tab'}}}));
    throwsRange(() => newPara('abc', {runs: [
      {start: 0, end: 2, rPr: R()}]}));
  });
  it('newPara normalises runs it is given', () => {
    const p = newPara('abcd', {runs: [
      {start: 0, end: 2, rPr: {b: true, i: true, extra: []}},
      {start: 2, end: 4, rPr: {i: true, b: true, extra: []}},
    ]});
    assert.deepEqual(spans(p), [[0, 4]]);
  });
});

// ---- replaceText -------------------------------------------------------

describe('replaceText', () => {
  const run = (p, op) => {
    const d = docOf(p);
    const before = clone(d);
    const inv = apply(d, {op: 'replaceText', block: [0, 0], ...op});
    checkDoc(d);
    const after = clone(d);
    apply(d, inv);
    assert.deepEqual(d, before, 'inverse restores');
    return after.sections[0].blocks[0];
  };
  it('inside a run takes that run\'s format', () => {
    const p = run(hello(), {at: 3, del: 0, ins: 'XX'});
    assert.equal(p.text, 'HelXXlo world');
    assert.deepEqual(spans(p), [[0, 8], [8, 13]]);
  });
  it('at a run boundary takes the preceding run\'s format', () => {
    const p = run(hello(), {at: 6, del: 0, ins: 'XX'});
    assert.deepEqual(spans(p), [[0, 8], [8, 13]]);
    assert.deepEqual(p.runs[0].rPr, R({b: true}));
  });
  it('at offset 0 takes the first run\'s format', () => {
    const p = run(hello(), {at: 0, del: 0, ins: '>>'});
    assert.deepEqual(spans(p), [[0, 8], [8, 13]]);
  });
  it('at the end takes the last run\'s format', () => {
    const p = run(hello(), {at: 11, del: 0, ins: '!'});
    assert.deepEqual(spans(p), [[0, 6], [6, 12]]);
  });
  it('in an empty paragraph: plain, or the op rPr', () => {
    let p = run(newPara(''), {at: 0, del: 0, ins: 'hi'});
    assert.deepEqual(p.runs, [{start: 0, end: 2, rPr: {extra: []}}]);
    p = run(newPara(''), {at: 0, del: 0, ins: 'hi', rPr: {b: true}});
    assert.deepEqual(p.runs, [{start: 0, end: 2, rPr: R({b: true})}]);
  });
  it('an op rPr overrides the run format', () => {
    const p = run(hello(), {at: 3, del: 0, ins: 'XX', rPr: R({u: 'single'})});
    assert.deepEqual(spans(p), [[0, 3], [3, 5], [5, 8], [8, 13]]);
    assert.deepEqual(p.runs[1].rPr, R({u: 'single'}));
    const q = run(hello(), {at: 6, del: 0, ins: 'X', rPr: R({i: true})});
    assert.deepEqual(spans(q), [[0, 6], [6, 12]], 'merges with italic');
  });
  it('deleting across run boundaries keeps surrounding formats', () => {
    const p = run(hello(), {at: 4, del: 4, ins: ''});
    assert.equal(p.text, 'Hellrld');
    assert.deepEqual(spans(p), [[0, 4], [4, 7]]);
    assert.deepEqual(p.runs[0].rPr, R({b: true}));
    assert.deepEqual(p.runs[1].rPr, R({i: true}));
  });
  it('replacing across a boundary takes the first selected format', () => {
    const p = run(hello(), {at: 4, del: 4, ins: 'X'});
    assert.equal(p.text, 'HellXrld');
    assert.deepEqual(spans(p), [[0, 5], [5, 8]]);
  });
  it('deleting a whole run removes it; deleting all empties runs', () => {
    let p = run(hello(), {at: 0, del: 6, ins: ''});
    assert.deepEqual(p.runs, [{start: 0, end: 5, rPr: R({i: true})}]);
    p = run(hello(), {at: 0, del: 11, ins: ''});
    assert.deepEqual(p.runs, []);
    assert.equal(p.text, '');
  });
  it('rejects bad positions and leaves the paragraph alone', () => {
    const d = docOf(hello());
    const before = clone(d);
    for (const op of [{at: -1, del: 0}, {at: 12, del: 0}, {at: 10, del: 2},
      {at: 1.5, del: 0}, {at: 0, del: -1}]) {
      throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
        ins: 'x', ...op}));
    }
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 5],
      at: 0, del: 0, ins: 'x'}));
    throwsRange(() => apply(d, {op: 'replaceText', block: [1, 0],
      at: 0, del: 0, ins: 'x'}));
    assert.deepEqual(d, before);
  });
  it('refuses to edit an opaque block', () => {
    const d = docOf({type: 'opaque', node: X('w:tbl')});
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: 'x'}));
  });
});

// ---- surrogate pairs ---------------------------------------------------

describe('surrogate pairs', () => {
  const face = '\u{1F600}';
  const mk = () => docOf(newPara('a' + face + 'b'));
  it('positions inside a pair throw and change nothing', () => {
    const d = mk();
    const before = clone(d);
    const ops = [
      {op: 'replaceText', block: [0, 0], at: 2, del: 0, ins: 'x'},
      {op: 'replaceText', block: [0, 0], at: 0, del: 2, ins: ''},
      {op: 'replaceText', block: [0, 0], at: 2, del: 2, ins: ''},
      {op: 'setProps', block: [0, 0], range: {start: 2, end: 4},
        rPr: {b: true}},
      {op: 'setProps', block: [0, 0], range: {start: 0, end: 2},
        rPr: {b: true}},
      {op: 'splitBlock', block: [0, 0], at: 2},
    ];
    for (const op of ops) throwsRange(() => apply(d, op));
    assert.deepEqual(d, before);
  });
  it('whole pairs are fine', () => {
    const d = mk();
    apply(d, {op: 'replaceText', block: [0, 0], at: 1, del: 2, ins: 'X'});
    assert.equal(para(d).text, 'aXb');
  });
  it('inserting a lone surrogate throws', () => {
    const d = mk();
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: '\ud83d'}));
  });
});

// ---- inlines -----------------------------------------------------------

describe('inlines and U+FFFC', () => {
  const TAB = {kind: 'tab'};
  const BR = {kind: 'br', level: 'r', brType: 'page'};
  const mk = () => docOf(newPara('ab' + OBJ + 'cd', {inlines: {2: TAB}}));
  const rt = (d, at, del, ins, inlines) => apply(d,
    {op: 'replaceText', block: [0, 0], at, del, ins,
      ...(inlines ? {inlines} : {})});
  it('inserting before an inline shifts its key', () => {
    const d = mk();
    rt(d, 0, 0, 'XY');
    assert.deepEqual(para(d).inlines, {4: TAB});
    rt(d, 6, 0, 'Z');
    assert.deepEqual(para(d).inlines, {4: TAB}, 'after: unchanged');
    checkDoc(d);
  });
  it('deleting across an inline removes its entry', () => {
    const d = mk();
    const before = clone(d);
    const inv = rt(d, 1, 3, '');
    assert.equal(para(d).text, 'ad');
    assert.deepEqual(para(d).inlines, {});
    apply(d, inv);
    assert.deepEqual(d, before);
  });
  it('deleting before an inline shifts it down', () => {
    const d = mk();
    rt(d, 0, 2, '');
    assert.deepEqual(para(d).inlines, {0: TAB});
  });
  it('inserting U+FFFC needs an inlines payload', () => {
    const d = mk();
    const before = clone(d);
    throwsRange(() => rt(d, 0, 0, OBJ));
    throwsRange(() => rt(d, 0, 0, 'x' + OBJ, {0: BR}));
    throwsRange(() => rt(d, 0, 0, 'xy', {1: BR}));
    assert.deepEqual(d, before);
    rt(d, 1, 0, 'x' + OBJ + 'y', {1: BR});
    assert.equal(para(d).text, 'ax' + OBJ + 'yb' + OBJ + 'cd');
    assert.deepEqual(para(d).inlines, {2: BR, 5: TAB});
    checkDoc(d);
  });
  it('the payload is copied, not shared', () => {
    const d = mk();
    const pay = {kind: 'br', level: 'r', brType: 'page'};
    rt(d, 0, 0, OBJ, {0: pay});
    pay.kind = 'changed';
    assert.equal(para(d).inlines[0].kind, 'br');
  });
  it('split and merge move inline entries', () => {
    const d = docOf(newPara('a' + OBJ + 'b' + OBJ,
      {inlines: {1: TAB, 3: BR}}));
    const before = clone(d);
    apply(d, {op: 'splitBlock', block: [0, 0], at: 2});
    assert.deepEqual(para(d, 0).inlines, {1: TAB});
    assert.deepEqual(para(d, 1).inlines, {1: BR});
    checkDoc(d);
    apply(d, {op: 'mergeBlock', block: [0, 0]});
    assert.deepEqual(d, before);
  });
});

// ---- setProps ----------------------------------------------------------

describe('setProps', () => {
  const sp = (d, o) => apply(d, {op: 'setProps', block: [0, 0], ...o});
  it('merges pPr partially; null deletes keys; inverse restores', () => {
    const d = docOf(newPara('x', {pPr: {jc: 'left', keepNext: true,
      spacing: {before: 120, after: 240}, extra: [X('w:foo')]}}));
    const before = clone(d);
    const inv = sp(d, {pPr: {jc: 'center', keepNext: null,
      spacing: {after: null, line: 360}}});
    assert.deepEqual(para(d).pPr, {jc: 'center',
      spacing: {before: 120, line: 360}, extra: [X('w:foo')]});
    apply(d, inv);
    assert.deepEqual(d, before);
  });
  it('an object left empty by nulls is removed', () => {
    const d = docOf(newPara('x', {pPr: {ind: {left: 720}, extra: []}}));
    sp(d, {pPr: {ind: {left: null}}});
    assert.deepEqual(para(d).pPr, {extra: []});
  });
  it('refuses to delete extra', () => {
    const d = docOf(newPara('x'));
    throwsRange(() => sp(d, {pPr: {extra: null}}));
    throwsRange(() => sp(d, {rPr: {extra: null}}));
  });
  it('sets and clears pStyle', () => {
    const d = docOf(newPara('x'));
    sp(d, {pStyle: 'Heading1'});
    assert.equal(para(d).pStyle, 'Heading1');
    sp(d, {pStyle: null});
    assert.ok(!('pStyle' in para(d)));
  });
  it('rPr without a range applies to every run', () => {
    const d = docOf(hello());
    sp(d, {rPr: {i: null, b: true}});
    assert.deepEqual(para(d).runs, [{start: 0, end: 11, rPr: R({b: true})}]);
  });
  it('a range splits runs, and merging comes back', () => {
    const d = docOf(newPara('Hello world'));
    const before = clone(d);
    const inv = sp(d, {range: {start: 2, end: 5}, rPr: {b: true}});
    assert.deepEqual(spans(para(d)), [[0, 2], [2, 5], [5, 11]]);
    assert.deepEqual(para(d).runs[1].rPr, R({b: true}));
    sp(d, {range: {start: 0, end: 2}, rPr: {b: true}});
    assert.deepEqual(spans(para(d)), [[0, 5], [5, 11]]);
    sp(d, {rPr: {b: null}});
    assert.deepEqual(spans(para(d)), [[0, 11]]);
    assert.deepEqual(para(d).runs[0].rPr, {extra: []});
    apply(d, inv); // inverse of the first, applied out of order: snapshot
    assert.deepEqual(d, before);
  });
  it('merges nested rFonts', () => {
    const d = docOf(newPara('ab', {rPr: R({rFonts: {ascii: 'Arial',
      eastAsia: 'SimSun'}})}));
    sp(d, {rPr: {rFonts: {ascii: 'Calibri'}}});
    assert.deepEqual(para(d).runs[0].rPr.rFonts,
      {ascii: 'Calibri', eastAsia: 'SimSun'});
  });
  it('sets rStyle on a range', () => {
    const d = docOf(newPara('abcdef'));
    sp(d, {range: {start: 1, end: 3}, rStyle: 'Strong'});
    assert.deepEqual(para(d).runs.map((r) => r.rStyle),
      [undefined, 'Strong', undefined]);
    assert.ok(!('rStyle' in para(d).runs[0]));
    sp(d, {range: {start: 0, end: 6}, rStyle: null});
    assert.deepEqual(spans(para(d)), [[0, 6]]);
    assert.ok(!('rStyle' in para(d).runs[0]));
  });
  it('rejects bad ranges', () => {
    const d = docOf(newPara('abc'));
    throwsRange(() => sp(d, {range: {start: 2, end: 1}, rPr: {b: true}}));
    throwsRange(() => sp(d, {range: {start: 0, end: 4}, rPr: {b: true}}));
  });
});

// ---- normalisation -----------------------------------------------------

describe('normalisation', () => {
  it('merges runs that become equal; key order does not matter', () => {
    const d = docOf(newPara('abcd', {runs: [
      {start: 0, end: 2, rPr: {b: true, extra: []}},
      {start: 2, end: 4, rPr: {i: true, extra: []}},
    ]}));
    apply(d, {op: 'setProps', block: [0, 0], range: {start: 2, end: 4},
      rPr: {i: null, b: true}});
    assert.deepEqual(spans(para(d)), [[0, 4]]);
    apply(d, {op: 'setProps', block: [0, 0], rPr: {i: true}});
    apply(d, {op: 'setProps', block: [0, 0], range: {start: 0, end: 2},
      rPr: {b: null}});
    apply(d, {op: 'setProps', block: [0, 0], range: {start: 0, end: 2},
      rPr: {b: true}});
    assert.deepEqual(spans(para(d)), [[0, 4]]);
  });
  it('keeps runs apart that differ only in extra nodes', () => {
    const p = newPara('abcd', {runs: [
      {start: 0, end: 2, rPr: {b: true, extra: [X('w14:glow')]}},
      {start: 2, end: 4, rPr: {b: true, extra: []}},
    ]});
    assert.deepEqual(spans(p), [[0, 2], [2, 4]]);
    const q = newPara('abcd', {runs: [
      {start: 0, end: 2, rPr: {b: true, extra: [X('w14:glow')]}},
      {start: 2, end: 4, rPr: {extra: [X('w14:glow')], b: true}},
    ]});
    assert.deepEqual(spans(q), [[0, 4]]);
  });
  it('deleting the text between two equal runs merges them', () => {
    const d = docOf(newPara('aaXbb', {runs: [
      {start: 0, end: 2, rPr: R()}, {start: 2, end: 3, rPr: R({b: true})},
      {start: 3, end: 5, rPr: R()}]}));
    apply(d, {op: 'replaceText', block: [0, 0], at: 2, del: 1, ins: ''});
    assert.deepEqual(spans(para(d)), [[0, 4]]);
  });
});

// ---- split, merge, insert, remove ---------------------------------------

describe('block operations', () => {
  it('splitBlock copies pPr and pStyle; extraP stays with the first', () => {
    const p = newPara('Hello world', {pStyle: 'Body',
      pPr: {jc: 'center', spacing: {after: 120}, extra: [X('w:foo')]},
      extraP: [X('w14:paraId')],
      runs: [{start: 0, end: 6, rPr: R({b: true})},
        {start: 6, end: 11, rPr: R({i: true})}]});
    const d = docOf(p);
    const before = clone(d);
    const inv = apply(d, {op: 'splitBlock', block: [0, 0], at: 3});
    checkDoc(d);
    const [a, b] = d.sections[0].blocks;
    assert.equal(a.id, p.id);
    assert.notEqual(b.id, a.id);
    assert.equal(a.text, 'Hel');
    assert.equal(b.text, 'lo world');
    assert.deepEqual(spans(a), [[0, 3]]);
    assert.deepEqual(spans(b), [[0, 3], [3, 8]]);
    assert.deepEqual(b.pPr, a.pPr);
    const aPPr = clone(a.pPr);
    apply(d, {op: 'setProps', block: [0, 1], pPr: {spacing: {after: 1}}});
    assert.deepEqual(para(d, 0).pPr, aPPr, 'first pPr not affected');
    apply(d, {op: 'setProps', block: [0, 1], pPr: {spacing: {after: 120}}});
    assert.equal(b.pStyle, 'Body');
    assert.deepEqual(a.extraP, [X('w14:paraId')]);
    assert.deepEqual(b.extraP, []);
    apply(d, inv);
    assert.deepEqual(d, before);
  });
  it('splitBlock at the ends makes an empty paragraph', () => {
    for (const at of [0, 11]) {
      const d = docOf(hello());
      apply(d, {op: 'splitBlock', block: [0, 0], at});
      checkDoc(d);
      const e = para(d, at ? 1 : 0);
      assert.equal(e.text, '');
      assert.deepEqual(e.runs, []);
    }
  });
  it('split then merge gives back the paragraph', () => {
    const d = docOf(hello(), newPara('next'));
    const before = clone(d);
    apply(d, {op: 'splitBlock', block: [0, 0], at: 7});
    apply(d, {op: 'mergeBlock', block: [0, 0]});
    assert.deepEqual(d, before);
  });
  it('mergeBlock keeps the first id and props; inverse restores', () => {
    const a = newPara('ab', {pStyle: 'A', pPr: {jc: 'right', extra: []},
      rPr: R({b: true})});
    const b = newPara('cd', {pStyle: 'B', rPr: R({b: true}),
      extraP: [X('w:x')]});
    const d = docOf(a, b, newPara('z'));
    const before = clone(d);
    const inv = apply(d, {op: 'mergeBlock', block: [0, 0]});
    checkDoc(d);
    assert.equal(d.sections[0].blocks.length, 2);
    const m = para(d);
    assert.equal(m.id, a.id);
    assert.equal(m.pStyle, 'A');
    assert.equal(m.text, 'abcd');
    assert.deepEqual(spans(m), [[0, 4]]);
    assert.deepEqual(m.extraP, []);
    apply(d, inv);
    assert.deepEqual(d, before);
  });
  it('mergeBlock refuses an opaque or missing next block', () => {
    const d = docOf(newPara('a'), {type: 'opaque', node: X('w:tbl')});
    const before = clone(d);
    throwsRange(() => apply(d, {op: 'mergeBlock', block: [0, 0]}));
    throwsRange(() => apply(d, {op: 'mergeBlock', block: [0, 1]}));
    const e = docOf(newPara('a'));
    throwsRange(() => apply(e, {op: 'mergeBlock', block: [0, 0]}));
    assert.deepEqual(d, before);
  });
  it('mergeBlock does not cross sections', () => {
    const d = docOf(newPara('a'));
    d.sections.push({props: {extra: []}, blocks: [newPara('b')]});
    throwsRange(() => apply(d, {op: 'mergeBlock', block: [0, 0]}));
  });
  it('insertBlock and removeBlock invert each other', () => {
    const d = docOf(newPara('a'), newPara('b'));
    const before = clone(d);
    const n = newPara('new');
    let inv = apply(d, {op: 'insertBlock', at: [0, 2], block: n});
    assert.equal(para(d, 2).text, 'new');
    assert.notEqual(para(d, 2), n, 'inserted block is a copy');
    apply(d, inv);
    assert.deepEqual(d, before);
    inv = apply(d, {op: 'removeBlock', at: [0, 0]});
    assert.equal(para(d).text, 'b');
    apply(d, inv);
    assert.deepEqual(d, before);
    const o = {type: 'opaque', node: X('w:tbl')};
    inv = apply(d, {op: 'insertBlock', at: [0, 1], block: o});
    assert.deepEqual(para(d, 1), o);
    apply(d, inv);
    assert.deepEqual(d, before);
  });
  it('insertBlock rejects duplicate ids, bad blocks and positions', () => {
    const d = docOf(newPara('a'));
    const before = clone(d);
    throwsRange(() => apply(d, {op: 'insertBlock', at: [0, 1],
      block: clone(para(d))}));
    throwsRange(() => apply(d, {op: 'insertBlock', at: [0, 2],
      block: newPara('x')}));
    throwsRange(() => apply(d, {op: 'insertBlock', at: [0, 0],
      block: {type: 'x'}}));
    const bad = newPara('ab');
    bad.runs = [{start: 0, end: 1, rPr: R()}];
    throwsRange(() => apply(d, {op: 'insertBlock', at: [0, 0],
      block: bad}));
    throwsRange(() => apply(d, {op: 'removeBlock', at: [0, 1]}));
    throwsRange(() => apply(d, {op: 'frobnicate'}));
    assert.deepEqual(d, before);
  });
  it('restoreBlock and compound invert exactly', () => {
    const d = docOf(hello(), newPara('b'));
    const before = clone(d);
    const inv = apply(d, {op: 'compound', ops: [
      {op: 'replaceText', block: [0, 0], at: 0, del: 1, ins: 'J'},
      {op: 'splitBlock', block: [0, 0], at: 3},
      {op: 'removeBlock', at: [0, 2]},
      {op: 'restoreBlock', block: [0, 1], snapshot: newPara('zz')},
    ]});
    checkDoc(d);
    const after = clone(d);
    const inv2 = apply(d, inv);
    assert.deepEqual(d, before);
    apply(d, inv2);
    assert.deepEqual(d, after);
  });
  it('a failing op inside a compound rolls back the earlier ones', () => {
    const d = docOf(hello());
    const before = clone(d);
    throwsRange(() => apply(d, {op: 'compound', ops: [
      {op: 'replaceText', block: [0, 0], at: 0, del: 1, ins: 'J'},
      {op: 'mergeBlock', block: [0, 0]},
    ]}));
    assert.deepEqual(d, before);
  });
});

// ---- Document ----------------------------------------------------------

describe('Document', () => {
  const rt = (at, ins) => ({op: 'replaceText', block: [0, 0], at,
    del: 0, ins});
  const mk = () => new Document(docOf(newPara('abc')));
  it('apply, undo and redo', () => {
    const doc = mk();
    const start = clone(doc.doc);
    assert.equal(doc.canUndo, false);
    assert.equal(doc.undo(), false);
    assert.equal(doc.redo(), false);
    doc.apply(rt(0, 'x'));
    doc.apply(rt(0, 'y'));
    const end = clone(doc.doc);
    assert.equal(para(doc.doc).text, 'yxabc');
    assert.equal(doc.undo(), true);
    assert.equal(para(doc.doc).text, 'xabc');
    assert.equal(doc.canRedo, true);
    assert.equal(doc.undo(), true);
    assert.deepEqual(doc.doc, start);
    assert.equal(doc.canUndo, false);
    doc.redo(); doc.redo();
    assert.deepEqual(doc.doc, end);
    doc.undo();
    doc.apply(rt(0, 'z'));
    assert.equal(doc.canRedo, false, 'apply clears redo');
  });
  it('emits one change per apply, undo, redo; unsubscribe works', () => {
    const doc = mk();
    const seen = [];
    const off = doc.on('change', (e) => seen.push(e));
    const op = rt(0, 'x');
    doc.apply(op);
    doc.undo();
    doc.redo();
    assert.deepEqual(seen.map((e) => e.kind), ['apply', 'undo', 'redo']);
    assert.deepEqual(seen[0].ops, [op]);
    assert.ok(seen.every((e) => Array.isArray(e.ops)));
    off();
    doc.apply(rt(0, 'y'));
    assert.equal(seen.length, 3);
  });
  it('groups make one undo step and one event; groups nest', () => {
    const doc = mk();
    const start = clone(doc.doc);
    const seen = [];
    doc.on('change', (e) => seen.push(e));
    doc.groupStart();
    doc.apply(rt(0, 'a'));
    doc.groupStart();
    doc.apply(rt(0, 'b'));
    doc.apply({op: 'splitBlock', block: [0, 0], at: 1});
    doc.groupEnd();
    assert.equal(seen.length, 0, 'inner group end: no event');
    doc.apply(rt(0, 'c'));
    doc.groupEnd();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].kind, 'apply');
    assert.equal(seen[0].ops.length, 4);
    const end = clone(doc.doc);
    assert.equal(doc.undo(), true);
    assert.deepEqual(doc.doc, start);
    assert.equal(doc.canUndo, false);
    assert.equal(seen.length, 2);
    assert.equal(doc.redo(), true);
    assert.deepEqual(doc.doc, end);
    assert.equal(seen.length, 3);
  });
  it('an empty group records nothing', () => {
    const doc = mk();
    let n = 0;
    doc.on('change', () => n++);
    doc.groupStart(); doc.groupEnd();
    assert.equal(n, 0);
    assert.equal(doc.canUndo, false);
  });
  it('a failing op leaves the document and stacks unchanged', () => {
    const doc = mk();
    doc.apply(rt(0, 'x'));
    const st = clone(doc.doc);
    throwsRange(() => doc.apply(rt(99, 'y')));
    assert.deepEqual(doc.doc, st);
    doc.undo();
    assert.equal(para(doc.doc).text, 'abc');
    assert.equal(doc.canUndo, false);
  });
  it('a failing op inside a group changes nothing; the group goes on',
    () => {
      const doc = mk();
      const start = clone(doc.doc);
      let n = 0;
      doc.on('change', () => n++);
      doc.groupStart();
      doc.apply(rt(0, 'x'));
      const mid = clone(doc.doc);
      throwsRange(() => doc.apply({op: 'mergeBlock', block: [0, 0]}));
      assert.deepEqual(doc.doc, mid);
      doc.apply(rt(0, 'y'));
      doc.groupEnd();
      assert.equal(n, 1);
      doc.undo();
      assert.deepEqual(doc.doc, start);
      assert.equal(doc.canUndo, false);
    });
  it('undo and redo inside an open group throw', () => {
    const doc = mk();
    doc.apply(rt(0, 'x'));
    doc.groupStart();
    assert.throws(() => doc.undo());
    assert.throws(() => doc.redo());
    doc.groupEnd();
    assert.throws(() => doc.groupEnd(), 'unbalanced groupEnd');
  });
  it('ids stay unique and survive undo/redo', () => {
    const doc = mk();
    const id0 = para(doc.doc).id;
    doc.apply({op: 'splitBlock', block: [0, 0], at: 1});
    const id1 = para(doc.doc, 1).id;
    assert.notEqual(id1, id0);
    doc.undo();
    doc.redo();
    assert.equal(para(doc.doc, 0).id, id0);
    assert.equal(para(doc.doc, 1).id, id1);
    doc.undo();
    doc.apply({op: 'splitBlock', block: [0, 0], at: 2});
    checkDoc(doc.doc);
    assert.notEqual(para(doc.doc, 1).id, id0);
  });
  it('new ids never collide with ids already in a document', () => {
    const p = newPara('abc');
    p.id = 1e6;
    const doc = new Document(docOf(p));
    doc.apply({op: 'splitBlock', block: [0, 0], at: 1});
    const q = newPara('x');
    assert.ok(q.id > 1e6);
    checkDoc(doc.doc);
  });
});

// ---- fix round 1 -------------------------------------------------------

describe('typing over a selection', () => {
  const rt = (p, at, del, ins, more = {}) => {
    const d = docOf(p);
    const before = clone(d);
    const inv = apply(d, {op: 'replaceText', block: [0, 0], at, del, ins,
      ...more});
    checkDoc(d);
    const q = clone(para(d));
    apply(d, inv);
    assert.deepEqual(d, before, 'inverse restores');
    return q;
  };
  const fmt = (p) => p.runs.map((r) => [p.text.slice(r.start, r.end),
    Object.keys(r.rPr).filter((k) => k !== 'extra').join(),
    r.rStyle]);
  const abc = () => newPara('aaabbbccc', {runs: [
    {start: 0, end: 3, rPr: R({b: true})},
    {start: 3, end: 6, rPr: R({i: true})},
    {start: 6, end: 9, rPr: R({u: 'single'})}]});
  it('takes the first selected character\'s format', () => {
    const p = rt(hello(), 6, 5, 'X');
    assert.equal(p.text, 'Hello X');
    assert.deepEqual(fmt(p), [['Hello ', 'b', undefined],
      ['X', 'i', undefined]]);
  });
  it('a selection starting inside a run takes that run', () => {
    const p = rt(abc(), 4, 4, 'X');
    assert.deepEqual(fmt(p), [['aaa', 'b', undefined],
      ['bX', 'i', undefined], ['c', 'u', undefined]]);
  });
  it('at 0 and over the whole text: the first character', () => {
    let p = rt(abc(), 0, 4, 'X');
    assert.deepEqual(fmt(p), [['X', 'b', undefined],
      ['bb', 'i', undefined], ['ccc', 'u', undefined]]);
    p = rt(abc(), 0, 9, 'XY');
    assert.deepEqual(fmt(p), [['XY', 'b', undefined]]);
  });
  it('a pure delete is unaffected', () => {
    const p = rt(hello(), 6, 5, '');
    assert.deepEqual(fmt(p), [['Hello ', 'b', undefined]]);
  });
  it('op rPr still overrides', () => {
    const p = rt(hello(), 6, 5, 'X', {rPr: {sz: 20}});
    assert.deepEqual(fmt(p), [['Hello ', 'b', undefined],
      ['X', 'sz', undefined]]);
  });
  it('op rStyle applies without op rPr', () => {
    let p = rt(hello(), 3, 0, 'X', {rStyle: 'Em'});
    assert.deepEqual(fmt(p), [['Hel', 'b', undefined],
      ['X', 'b', 'Em'], ['lo ', 'b', undefined],
      ['world', 'i', undefined]]);
    p = rt(hello(), 6, 5, 'X', {rStyle: 'Em'});
    assert.deepEqual(fmt(p).at(-1), ['X', 'i', 'Em']);
  });
});

describe('validation of payloads', () => {
  it('rejects extra that is not an array at any level', () => {
    const d = docOf(hello());
    const before = clone(d);
    const bad = {rFonts: {extra: 5}};
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: 'x', rPr: bad}));
    throwsRange(() => apply(d, {op: 'setProps', block: [0, 0],
      rPr: bad}));
    throwsRange(() => apply(d, {op: 'setProps', block: [0, 0],
      pPr: {spacing: {extra: 'x'}}}));
    assert.deepEqual(d, before);
    throwsRange(() => newPara('a', {pPr: {spacing: {extra: 1},
      extra: []}}));
    throwsRange(() => newPara('a', {rPr: {rFonts: {extra: {}}}}));
  });
  it('rejects inlines of an unknown kind', () => {
    const d = docOf(hello());
    const before = clone(d);
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: OBJ, inlines: {0: {kind: 'bogus'}}}));
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: OBJ, inlines: {0: {}}}));
    assert.deepEqual(d, before);
    throwsRange(() => newPara(OBJ, {inlines: {0: {kind: 'img'}}}));
    newPara(OBJ, {inlines: {0: {kind: 'raw', level: 'r', node: X('w:x')}}});
    newPara(OBJ, {inlines: {0: {kind: 'br', level: 'r', brType: 'page'}}});
    newPara(OBJ, {inlines: {0: {kind: 'tab', level: 'r'}}});
  });
  it('inlines need a level: p or r; br and tab only r', () => {
    newPara(OBJ, {inlines: {0: {kind: 'raw', level: 'p', node: X('w:x'),
      text: 'shown'}}});
    newPara(OBJ, {inlines: {0: {kind: 'tab'}}});
    // display text on a run-level inline is fine
    newPara(OBJ, {inlines: {0: {kind: 'raw', level: 'r',
      node: X('w:instrText'), text: ' PAGE '}}});
    for (const bad of [{kind: 'raw'}, {kind: 'br'},
      {kind: 'raw', level: 'x'}, {kind: 'raw', level: ''},
      {kind: 'br', level: 'p'}, {kind: 'tab', level: 'p'},
      {kind: 'tab', level: 'q'}]) {
      throwsRange(() => newPara(OBJ, {inlines: {0: bad}}),
        JSON.stringify(bad));
    }
    const d = docOf(hello());
    const before = clone(d);
    throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: OBJ, inlines: {0: {kind: 'br'}}}));
    assert.deepEqual(d, before);
  });
  it('a raw inline needs its node; a br its node or its type', () => {
    // these could not be saved ("inline at 0 has no node")
    for (const bad of [{kind: 'raw', level: 'p', text: 'x'},
      {kind: 'raw', level: 'r'}, {kind: 'raw', level: 'r', node: null},
      {kind: 'br', level: 'r'}, {kind: 'br', level: 'r', brType: 7}]) {
      throwsRange(() => newPara(OBJ, {inlines: {0: bad}}),
        JSON.stringify(bad));
      const d = docOf(hello());
      const before = clone(d);
      throwsRange(() => apply(d, {op: 'replaceText', block: [0, 0],
        at: 0, del: 0, ins: OBJ, inlines: {0: bad}}));
      assert.deepEqual(d, before);
    }
    // the writer makes these itself: <w:br w:type="page"/>, <w:tab/>
    newPara(OBJ, {inlines: {0: {kind: 'br', level: 'r',
      brType: 'page'}}});
    newPara(OBJ, {inlines: {0: {kind: 'tab'}}});
    // text directly in a w:p is kept as a string node
    newPara(OBJ, {inlines: {0: {kind: 'raw', level: 'p', node: 'x',
      text: 'x'}}});
  });
});

describe('listeners and group(fn)', () => {
  const rt = (at, ins) => ({op: 'replaceText', block: [0, 0], at,
    del: 0, ins});
  it('a throwing listener does not stop others or the change', () => {
    const doc = new Document(docOf(newPara('abc')));
    const errs = [];
    doc.onListenerError = (e) => errs.push(e);
    const seen = [];
    doc.on('change', () => { throw new Error('boom'); });
    doc.on('change', (e) => seen.push(e.kind));
    doc.apply(rt(0, 'x'));
    assert.equal(para(doc.doc).text, 'xabc');
    assert.equal(doc.undo(), true);
    assert.equal(para(doc.doc).text, 'abc');
    assert.equal(doc.redo(), true);
    assert.deepEqual(seen, ['apply', 'undo', 'redo']);
    assert.equal(errs.length, 3);
    assert.equal(errs[0].message, 'boom');
    assert.equal(doc.canUndo, true);
  });
  it('group(fn) is one step and returns fn\'s value', () => {
    const doc = new Document(docOf(newPara('abc')));
    let n = 0;
    doc.on('change', () => n++);
    const v = doc.group(() => {
      doc.apply(rt(0, 'x')); doc.apply(rt(0, 'y')); return 42;
    });
    assert.equal(v, 42);
    assert.equal(n, 1);
    doc.undo();
    assert.equal(para(doc.doc).text, 'abc');
  });
  it('a throwing fn ends the group and leaves the doc usable', () => {
    const doc = new Document(docOf(newPara('abc')));
    assert.throws(() => doc.group(() => {
      doc.apply(rt(0, 'x'));
      throw new Error('oops');
    }), /oops/);
    assert.equal(para(doc.doc).text, 'xabc');
    assert.equal(doc.undo(), true, 'no group left open');
    assert.equal(para(doc.doc).text, 'abc');
    assert.throws(() => doc.groupEnd());
  });
});

describe('structure sharing', () => {
  it('typing keeps unchanged runs and rPr objects', () => {
    const p = hello();
    const doc = new Document(docOf(p));
    doc.apply({op: 'replaceText', block: [0, 0], at: 8, del: 0,
      ins: 'x'});
    const q = para(doc.doc);
    assert.equal(q.runs[0], p.runs[0], 'run before the edit is shared');
    assert.equal(q.runs[1].rPr, p.runs[1].rPr, 'rPr is shared');
    assert.equal(q.pPr, p.pPr, 'pPr is shared');
  });
});

// ---- property test -------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(rnd) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  const rPrs = [R(), R({b: true}), R({i: true}), R({b: true, i: true}),
    R({sz: 24}), R({rFonts: {ascii: 'Arial'}}),
    {b: true, extra: [X('w14:glow')]}];
  const pPrs = [{extra: []}, {jc: 'center', extra: []},
    {spacing: {before: 120}, ind: {left: 720}, extra: []},
    {keepNext: true, extra: [X('w:foo')]}];
  const atoms = ['a', 'b', 'c', ' ', 'xy', '\u{1F600}', '\u00e9', OBJ];
  const inl = () => pick([{kind: 'tab', level: 'r'},
    {kind: 'br', level: 'r', brType: 'column'},
    {kind: 'raw', level: 'p', node: X('w:fldChar'), text: 'F'}]);
  const str = (n) => {
    let s = '';
    const inlines = {};
    for (let k = 0; k < n; k++) {
      const a = pick(atoms);
      if (a === OBJ) inlines[s.length] = inl();
      s += a;
    }
    return {s, inlines};
  };
  const mkPara = () => {
    const {s, inlines} = str(int(8));
    // random run cuts on code-point boundaries
    const cuts = [0];
    for (let i = 1; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (!(c >= 0xdc00 && c <= 0xdfff) && rnd() < 0.3) cuts.push(i);
    }
    cuts.push(s.length);
    const runs = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      if (cuts[k] === cuts[k + 1]) continue;
      const r = {start: cuts[k], end: cuts[k + 1], rPr: clone(pick(rPrs))};
      if (rnd() < 0.15) r.rStyle = 'Emph';
      runs.push(r);
    }
    const o = {inlines, runs, pPr: clone(pick(pPrs))};
    if (rnd() < 0.3) o.pStyle = pick(['Heading1', 'Body']);
    if (rnd() < 0.2) o.extraP = [X('w14:paraId')];
    return newPara(s, o);
  };
  const doc = () => {
    const d = emptyDoc();
    const n = 1 + int(6);
    d.sections[0].blocks = [];
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.1) d.sections[0].blocks.push(
        {type: 'opaque', node: X('w:tbl')});
      else d.sections[0].blocks.push(mkPara());
    }
    // more sections (0..3), of 1..3 blocks, most ending with a
    // paragraph, so that section splits and merges get their chance
    for (let k = int(4); k > 0; k--) {
      const bs = [];
      for (let j = 1 + int(3); j > 0; j--) bs.push(mkPara());
      if (rnd() < 0.1) bs.unshift({type: 'opaque', node: X('w:tbl')});
      const sec = {props: {extra: []}, blocks: bs};
      if (rnd() < 0.7) sec.raw = rnd() < 0.5 ? null : sectRaw();
      d.sections.push(sec);
    }
    if (rnd() < 0.3) d.sections[0].raw = sectRaw();
    if (rnd() < 0.3) d.rels = addRel([], {kind: 'styles',
      target: 'styles.xml'}).rels;
    if (rnd() < 0.2) d.numbering = numbering();
    if (rnd() < 0.2) d.meta = {numberingPart: 'word/numbering.xml'};
    return d;
  };
  const sectRaw = () => ({name: 'w:sectPr', attrs: [['w:rsidR', '01']],
    children: [X('w:titlePg')]});
  const numbering = () => ({raw: X('w:numbering'), nums: new Map([[1,
    {abstractNumId: 0, levels: [], overrides: new Map()}]])});
  const sectProps = () => pick([{extra: []},
    {pgSz: {w: 12240, h: 15840}, extra: []},
    {titlePg: true, extra: [X('w:type')]},
    {foo: 1, extra: []}]);       // refused
  // document-level parts: a new value (never the old one changed)
  const part = (d) => {
    const key = pick(['numbering', 'rels', 'styles', 'settings',
      'numberingPart', 'numberingPart', 'rels', '__proto__', 'meta',
      'parts', 'parts']);
    let value;
    if (key === 'numbering') value = pick([null, numbering()]);
    else if (key === 'rels') {
      value = rnd() < 0.8 ? addRel(d.rels, {kind: pick(['hyperlink',
        'numbering']), target: 'x', external: rnd() < 0.5,
      strict: rnd() < 0.3}).rels : [];
    } else if (key === 'styles') {
      value = pick([null, newStyleTable(), withStyle(d.styles ||
        newStyleTable(), {id: 'S' + int(1e6), type: 'paragraph'})]);
    } else if (key === 'settings') value = pick([null, X('w:settings')]);
    else if (key === 'numberingPart') {
      value = pick(['word/numbering.xml', undefined, null, '../bad']);
    } else if (key === 'parts') {
      // add a media part, take one away, or a refused change
      const m = new Map(d.parts);
      const r = rnd(), k = [...m.keys()];
      if (r < 0.5) {
        m.set('word/media/image' + int(5) + '.png',
          new Uint8Array([int(256)]));
      } else if (r < 0.75 && k.length) m.delete(pick(k));
      else if (k.length) m.set(pick(k), new Uint8Array(1));
      else m.set('../bad.png', new Uint8Array(1));
      value = m;
    } else value = {};
    return {op: 'setDocPart', key, value};
  };
  const op = (d) => {
    const s = int(d.sections.length);
    const blocks = d.sections[s].blocks;
    // mostly valid positions; some out of range on purpose
    const i = blocks.length && rnd() < 0.9 ? int(blocks.length)
      : int(blocks.length + 1);
    const b = blocks[i];
    const len = b && b.type === 'p' ? b.text.length : 0;
    const pos = () => (rnd() < 0.9 ? int(len + 1)
      : int(len + 2) - (rnd() < 0.3 ? 1 : 0));
    const kind = pick(['rt', 'rt', 'rt', 'sp', 'sp', 'split', 'merge',
      'ins', 'rm', 'ssplit', 'ssplit', 'smerge', 'smerge', 'part',
      'sset']);
    if (kind === 'sset') {
      const o = {op: 'setSection', at: int(d.sections.length + 1) -
        (rnd() < 0.05 ? 1 : 0), props: sectProps()};
      if (rnd() < 0.8) o.raw = pick([null, sectRaw()]);
      return o;
    }
    if (kind === 'ssplit') {
      const o = {op: 'splitSection', at: [s, i], props: sectProps()};
      if (rnd() < 0.8) o.raw = pick([null, sectRaw()]);
      return o;
    }
    if (kind === 'smerge') {
      const o = {op: 'mergeSection', at: int(d.sections.length + 1) -
        (rnd() < 0.05 ? 1 : 0)};
      const b = d.sections[o.at + 1];
      if (b && rnd() < 0.3) o.keep = {props: b.props, raw: b.raw ?? null};
      return o;
    }
    if (kind === 'part') return part(d);
    if (kind === 'rt') {
      const at = pos();
      const {s: ins, inlines} = str(int(4));
      const o = {op: 'replaceText', block: [s, i], at,
        del: int(Math.max(1, len - at + 1)), ins};
      if (Object.keys(inlines).length || rnd() < 0.1) o.inlines = inlines;
      if (rnd() < 0.2) o.rPr = clone(pick(rPrs));
      return o;
    }
    if (kind === 'sp') {
      const o = {op: 'setProps', block: [s, i]};
      if (rnd() < 0.4) o.pPr = pick([{jc: 'right'}, {jc: null},
        {spacing: {after: 60}}, {spacing: {before: null}},
        {ind: {left: null}}]);
      if (rnd() < 0.2) o.pStyle = pick(['Body', null]);
      if (rnd() < 0.7) o.rPr = pick([{b: true}, {b: null}, {i: true},
        {sz: 28}, {rFonts: {cs: 'Arial'}}, {rFonts: null}]);
      if (rnd() < 0.2) o.rStyle = pick(['Emph', null]);
      if (rnd() < 0.6) {
        const a = pos();
        o.range = {start: a, end: a + int(len - a + 1) +
          (rnd() < 0.05 ? 1 : 0)};
      }
      return o;
    }
    if (kind === 'split') return {op: 'splitBlock', block: [s, i], at: pos()};
    if (kind === 'merge') return {op: 'mergeBlock', block: [s, i]};
    if (kind === 'ins') {
      return {op: 'insertBlock', at: [s, i], block: rnd() < 0.8
        ? mkPara() : {type: 'opaque', node: X('w:sdt')}};
    }
    return {op: 'removeBlock', at: [s, i]};
  };
  return {doc, op, int, rnd};
}

const applied = new Map();   // op kind -> times applied (not refused)

function runSequence(seed, grouped) {
  const g = gen(mulberry32(seed));
  const doc = new Document(g.doc());
  checkDoc(doc.doc);
  const initial = clone(doc.doc);
  const n = 1 + g.int(30);
  let depth = 0;
  let ok = 0;
  const log = [];
  try {
    for (let k = 0; k < n; k++) {
      if (grouped && g.rnd() < 0.2) { doc.groupStart(); depth++; }
      const op = g.op(doc.doc);
      log.push(op);
      const before = clone(doc.doc);
      try {
        doc.apply(op);
        ok++;
        applied.set(op.op, (applied.get(op.op) || 0) + 1);
        if (op.key === 'parts')
          applied.set('parts', (applied.get('parts') || 0) + 1);
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        assert.deepEqual(doc.doc, before, 'failed op changed the doc');
      }
      checkDoc(doc.doc);
      if (depth && g.rnd() < 0.3) { doc.groupEnd(); depth--; }
    }
    while (depth) { doc.groupEnd(); depth--; }
    const final = clone(doc.doc);
    while (doc.undo()) checkDoc(doc.doc);
    assert.deepEqual(doc.doc, initial, 'undo all');
    while (doc.redo()) checkDoc(doc.doc);
    assert.deepEqual(doc.doc, final, 'redo all');
    while (doc.undo());
    assert.deepEqual(doc.doc, initial, 'undo all again');
  } catch (e) {
    e.message = 'seed ' + seed + (grouped ? ' (grouped)' : '') + ': ' +
      e.message + '\nops: ' + JSON.stringify(log);
    throw e;
  }
  return ok;
}

describe('property: random ops then undo/redo', () => {
  const BASE = 20261005;
  const NEW = ['splitSection', 'mergeSection', 'setDocPart',
    'setSection'];
  const counted = () => {
    for (const k of NEW) {
      assert.ok(applied.get(k) >= 150, k + ': ' + applied.get(k));
    }
    assert.ok(applied.get('parts') >= 30, 'parts: ' +
      applied.get('parts'));
  };
  it('500 sequences', () => {
    applied.clear();
    let ok = 0;
    for (let k = 0; k < 500; k++) ok += runSequence(BASE + k, false);
    assert.ok(ok > 2000, 'enough ops succeeded: ' + ok);
    counted();
  });
  it('500 sequences with random groups', () => {
    applied.clear();
    for (let k = 0; k < 500; k++) runSequence(BASE + 100000 + k, true);
    counted();
  });
});
