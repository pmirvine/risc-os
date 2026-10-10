// OpsSect: splitSection, mergeSection and setSection, their inverses, refusals,
// the written sectPrs and the caret after undo / redo.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, emptyDoc, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {apply, applyOwn} from '../../tools/moreapps/!Word/Ops';
import {Document} from '../../tools/moreapps/!Word/Document';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {xmlEntries, canon, sameTree} from './docx-compare.mjs';
import {tm} from './word-docs.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const box = () => ({type: 'opaque', node: {name: 'w:tbl', attrs: [],
  children: []}});
const node = (name, attrs = [], children = []) =>
  ({name, attrs, children});
const sectRaw = (w) => node('w:sectPr', [['w:rsidR', '00AA']],
  [node('w:pgSz', [['w:w', String(w)], ['w:h', '16838']])]);
const P1 = () => ({pgSz: {w: 11906, h: 16838}, extra: []});
const P2 = () => ({pgSz: {w: 12240, h: 15840}, extra: []});
const T = (d) => d.sections.map((s) => s.blocks.map((b) =>
  b.text ?? '#').join(','));

/** One section [a, b, #, c] with props P1 and a raw sectPr. */
function oneSection() {
  const d = emptyDoc();
  d.sections[0] = {props: P1(), blocks: [newPara('a'), newPara('b'),
    box(), newPara('c')], raw: sectRaw(11906)};
  return d;
}

describe('splitSection', () => {
  it('splits; the first half takes the new props; inverse exact', () => {
    const d = oneSection();
    const before = structuredClone(d);
    const old = d.sections[0];
    const blocks = old.blocks.slice();
    const inv = apply(d, {op: 'splitSection', at: [0, 1], props: P2(),
      raw: null});
    assert.deepEqual(T(d), ['a,b', '#,c']);
    assert.deepEqual(d.sections[0].props, P2());
    assert.equal(d.sections[0].raw, null);
    assert.equal(d.sections[1].props, old.props, 'old props kept');
    assert.equal(d.sections[1].raw, old.raw, 'old raw kept');
    assert.notEqual(d.sections[0], old);
    d.sections.flatMap((s) => s.blocks).forEach((b, k) =>
      assert.equal(b, blocks[k], 'block ' + k + ' identity'));
    assert.deepEqual(inv, {op: 'mergeSection', at: 0,
      keep: {props: old.props, raw: old.raw}});
    const back = applyOwn(d, inv);
    assert.ok(deepEqual(d, before), 'merge restores the doc');
    assert.deepEqual(back.at, [0, 1]);
    assert.deepEqual(back.props, P2());
    d.sections[0].blocks.forEach((b, k) => assert.equal(b, blocks[k]));
    assert.equal(d.sections[0].props, old.props);
  });

  it('keeps untouched sections as the same objects', () => {
    const d = oneSection();
    d.sections.unshift({props: P2(), blocks: [newPara('x')], raw: null});
    d.sections.push({props: P2(), blocks: [newPara('y')], raw: null});
    const [s0, , s2] = d.sections;
    const inv = apply(d, {op: 'splitSection', at: [1, 0],
      props: {extra: []}, raw: sectRaw(5000)});
    assert.equal(d.sections.length, 4);
    assert.equal(d.sections[0], s0);
    assert.equal(d.sections[3], s2);
    assert.equal(d.sections[1].raw.attrs[0][1], '00AA');
    applyOwn(d, inv);
    assert.equal(d.sections[0], s0);
    assert.equal(d.sections[2], s2);
  });

  it('a section made without a raw key gets none back', () => {
    const d = emptyDoc();
    d.sections[0] = {props: {extra: []}, blocks: [newPara('a'),
      newPara('b')]};
    const before = structuredClone(d);
    const doc = new Document(d);
    doc.apply({op: 'splitSection', at: [0, 0], props: {extra: []}});
    assert.ok(!Object.hasOwn(doc.doc.sections[0], 'raw'));
    doc.undo();
    assert.ok(deepEqual(doc.doc, before));
  });

  it('refusals leave the doc unchanged', () => {
    const d = oneSection();
    d.sections.push({props: {extra: []}, blocks: [], raw: null});
    const before = structuredClone(d);
    const bad = [
      {at: [0, 2]},                       // a kept block
      {at: [0, 3]},                       // the last block
      {at: [0, -1]}, {at: [0, 4]}, {at: [0, 1.5]}, {at: [0, '1']},
      {at: [5, 0]}, {at: [-1, 0]}, {at: [1, 0]}, {at: 0}, {at: [0]},
      {at: [0, 1], props: {extra: 'x'}},
      {at: [0, 1], props: {foo: 1, extra: []}},
      {at: [0, 1], props: null},
      {at: [0, 1], props: {pgSz: {extra: 3}, extra: []}},
      {at: [0, 1], raw: node('w:pPr')},
      {at: [0, 1], raw: 'sectPr'},
      {at: [0, 1], raw: {name: 'w:sectPr', attrs: []}},
    ];
    for (const b of bad) {
      const op = {op: 'splitSection', props: P2(), raw: null, ...b};
      assert.throws(() => apply(d, op), RangeError, JSON.stringify(b));
      assert.ok(deepEqual(d, before), JSON.stringify(b));
    }
  });
});

describe('mergeSection', () => {
  /** Sections [a, b] (P2) and [#, c] (P1, raw). */
  function two() {
    const d = oneSection();
    apply(d, {op: 'splitSection', at: [0, 1], props: P2(),
      raw: sectRaw(12240)});
    return d;
  }

  it('joins, keeping the second section\'s props; inverse exact', () => {
    const d = two();
    const before = structuredClone(d);
    const [a, b] = d.sections;
    const inv = apply(d, {op: 'mergeSection', at: 0});
    assert.deepEqual(T(d), ['a,b,#,c']);
    assert.equal(d.sections[0].props, b.props);
    assert.equal(d.sections[0].raw, b.raw);
    assert.equal(inv.op, 'splitSection');
    assert.deepEqual(inv.at, [0, 1]);
    assert.equal(inv.props, a.props);
    assert.equal(inv.raw, a.raw);
    applyOwn(d, inv);
    assert.ok(deepEqual(d, before));
  });

  it('refusals leave the doc unchanged', () => {
    const d = two();
    // a third section, empty; and section 1 ends with a paragraph
    d.sections.push({props: {extra: []}, blocks: [], raw: null});
    const before = structuredClone(d);
    const bad = [
      {at: 2},                             // the last section
      {at: 1},                             // the next one is empty
      {at: 3}, {at: -1}, {at: '0'}, {at: 0.5},
      {at: 0, keep: {props: P2(), raw: null}},  // not s+1's
      {at: 0, keep: 'x'},
    ];
    for (const b of bad) {
      assert.throws(() => apply(d, {op: 'mergeSection', ...b}),
        RangeError, JSON.stringify(b));
      assert.ok(deepEqual(d, before), JSON.stringify(b));
    }
    // a first section ending with a kept block
    const e = two();
    e.sections[0].blocks.push(box());
    const eb = structuredClone(e);
    assert.throws(() => apply(e, {op: 'mergeSection', at: 0}),
      RangeError);
    assert.ok(deepEqual(e, eb));
  });

  it('keep equal to the next section is accepted', () => {
    const d = two();
    const b = d.sections[1];
    apply(d, {op: 'mergeSection', at: 0,
      keep: {props: structuredClone(b.props), raw: structuredClone(b.raw)}});
    assert.equal(d.sections.length, 1);
  });
});

describe('sections in Document: undo and redo', () => {
  it('split and merge, undone and redone, deep-equal with ids', () => {
    const d = new Document(oneSection());
    const s0 = structuredClone(d.doc);
    d.apply({op: 'splitSection', at: [0, 0], props: P2(), raw: null});
    const s1 = structuredClone(d.doc);
    let seen = null;
    d.on('change', (ev) => { seen = ev; });
    d.apply({op: 'mergeSection', at: 0});
    assert.equal(seen.kind, 'apply');
    assert.equal(seen.ops[0].op, 'mergeSection');
    d.undo();
    assert.ok(deepEqual(d.doc, s1));
    d.undo();
    assert.ok(deepEqual(d.doc, s0));
    d.redo();
    assert.ok(deepEqual(d.doc, s1));
  });
});

// ---- written files -------------------------------------------------------

const isEl = (c) => typeof c === 'object' && c.name !== undefined;
const kids = (n, name) => n.children.filter((c) => isEl(c) &&
  (name === undefined || c.name === name));
const sectOf = (pEl) => {
  const pPr = kids(pEl, 'w:pPr')[0];
  return pPr ? kids(pPr, 'w:sectPr')[0] || null : null;
};
const SECT = '<w:sectPr w:rsidR="00C0"><w:pgSz w:w="11906" ' +
  'w:h="16838"/><w:pgMar w:top="1440" w:right="1440" ' +
  'w:bottom="1440" w:left="1440" w:header="708" w:footer="708" ' +
  'w:gutter="0"/><w:foo/></w:sectPr>';
const read = async (body) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body)}));
const write = (doc) => writeDocx(doc, {date: DATE});
async function bodyOf(bytes) {
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  return kids(root, 'w:body')[0];
}
/** The canonical sections, their raw nodes left out, agree. */
function sameButRaw(got, want) {
  const [g, w] = [canon(got), canon(want)].map((d) =>
    d.sections.map(({raw, ...s}) => s));
  sameTree(g, w);
}

describe('sections written', () => {
  it('after a split: two sectPrs, the new one in paragraph i', async () => {
    const doc = await read(p(r('one')) + p(r('two')) + p(r('three')) +
      SECT);
    const oldRaw = doc.sections[0].raw;
    apply(doc, {op: 'splitSection', at: [0, 1], props: P2(), raw: null});
    const bytes = await write(doc);
    const body = await bodyOf(bytes);
    const ps = kids(body, 'w:p');
    assert.equal(sectOf(ps[0]), null);
    const sp = sectOf(ps[1]);
    assert.ok(sp, 'paragraph 1 carries the new sectPr');
    assert.deepEqual(kids(sp, 'w:pgSz')[0].attrs,
      [['w:w', '12240'], ['w:h', '15840']]);
    assert.equal(sectOf(ps[2]), null);
    const last = kids(body).at(-1);
    assert.equal(last.name, 'w:sectPr', 'the old one where it was');
    assert.ok(deepEqual(last, oldRaw));
    const back = await readDocx(bytes);
    assert.equal(back.sections.length, 2);
    assert.ok(deepEqual(back.sections[1].raw, oldRaw));
    sameButRaw(back, doc);
  });

  it('a split of a last section whose sectPr was in its last paragraph',
    async () => {
      const doc = await read(p(r('one')) + p(r('two')) +
        p(r('three'), SECT));
      assert.equal(doc.meta.bodySectPr, false);
      apply(doc, {op: 'splitSection', at: [0, 0], props: P2(),
        raw: null});
      const ps = kids(await bodyOf(await write(doc)), 'w:p');
      assert.ok(sectOf(ps[0]));
      assert.equal(sectOf(ps[1]), null);
      assert.ok(deepEqual(sectOf(ps[2]), doc.sections[1].raw));
      sameButRaw(await readDocx(await write(doc)), doc);
    });

  it('a split with a raw sectPr of unknown children: written whole in '
    + 'paragraph i', async () => {
    const doc = await read(p(r('one')) + p(r('two')) + SECT);
    const kids0 = [
      node('w:headerReference', [['w:type', 'default'], ['r:id', 'rId9']]),
      node('w:pgSz', [['w:w', '12240'], ['w:h', '15840']]),
      node('w:type', [['w:val', 'continuous']]),
      node('w:bar', [['w:x', '1']])];
    const raw = node('w:sectPr', [['w:rsidR', '00D1']], kids0);
    const props = {pgSz: {w: 12240, h: 15840}, type: 'continuous',
      extra: [kids0[0], kids0[3]]};
    apply(doc, {op: 'splitSection', at: [0, 0], props, raw});
    const bytes = await write(doc);
    const ps = kids(await bodyOf(bytes), 'w:p');
    const sp = sectOf(ps[0]);
    assert.deepEqual(sp.attrs, [['w:rsidR', '00D1']]);
    const names = kids(sp).map((c) => c.name);
    for (const n of ['w:headerReference', 'w:type', 'w:bar', 'w:pgSz']) {
      assert.ok(names.includes(n), n + ' in ' + names);
    }
    assert.deepEqual(kids(sp, 'w:headerReference')[0].attrs,
      kids0[0].attrs);
    assert.equal(sectOf(ps[1]), null);
    const back = await readDocx(bytes);
    assert.equal(back.sections.length, 2);
    sameButRaw(back, doc);
  });

  it('after a merge the paragraph loses its sectPr', async () => {
    const mid = SECT.replace('11906', '12240');
    const doc = await read(p(r('one')) + p(r('two'), mid) +
      p(r('three')) + SECT);
    assert.equal(doc.sections.length, 2);
    const d = new Document(doc);
    const first = await write(d.doc);
    d.apply({op: 'mergeSection', at: 0});
    const bytes = await write(d.doc);
    const ps = kids(await bodyOf(bytes), 'w:p');
    assert.ok(ps.every((x) => sectOf(x) === null));
    const back = await readDocx(bytes);
    assert.equal(back.sections.length, 1);
    sameButRaw(back, d.doc);
    d.undo();
    assert.deepEqual(await write(d.doc), first, 'undo: same bytes');
  });
});

// ---- the caret after undo and redo ---------------------------------------

describe('EditApply.stepEnd for section ops', () => {
  function setup() {
    const doc = oneSection();
    doc.styles = newDoc().styles;
    doc.sections.unshift({props: P2(), blocks: [newPara('x'), box()],
      raw: null});
    const d = new Document(doc);
    const m = tm();
    let L = new DocLayout(d.doc, m);
    L.layout(800);
    let ops = null;
    d.on('change', (ev) => { ops = ev.ops; });
    const step = (kind) => {
      L = new DocLayout(d.doc, m, L);
      L.layout(800);
      const old = L;
      d[kind]();
      const at = stepEnd(d.doc, ops, old);
      L = new DocLayout(d.doc, m, old);
      L.layout(800);
      return at;
    };
    return {d, step};
  }

  it('undo of a split, redo: the start of the paragraph at the split',
    () => {
      const {d, step} = setup();
      const b = d.doc.sections[1].blocks[1];
      d.apply({op: 'splitSection', at: [1, 1], props: P1(), raw: null});
      assert.deepEqual(step('undo'), {id: b.id, off: 0});
      assert.deepEqual(step('redo'), {id: b.id, off: 0});
    });

  it('undo of a merge, redo: the same paragraph', () => {
    const {d, step} = setup();
    const b = d.doc.sections[1].blocks[1];
    d.apply({op: 'splitSection', at: [1, 1], props: P1(), raw: null});
    d.apply({op: 'mergeSection', at: 1});
    assert.deepEqual(step('undo'), {id: b.id, off: 0});
    assert.deepEqual(step('redo'), {id: b.id, off: 0});
  });

  it('without a layout a merge gives the section\'s start', () => {
    const {d} = setup();
    d.apply({op: 'splitSection', at: [1, 1], props: P1(), raw: null});
    const a = d.doc.sections[1].blocks[0];
    assert.deepEqual(stepEnd(d.doc, [{op: 'mergeSection', at: 1}], null),
      {id: a.id, off: 0});
    d.apply({op: 'mergeSection', at: 1});
    assert.deepEqual(stepEnd(d.doc, [{op: 'mergeSection', at: 1}], null),
      {id: a.id, off: 0});
  });
});

describe('setSection', () => {
  it('replaces props and raw; the inverse gives the old objects back',
    () => {
      const d = oneSection();
      d.sections.push({props: P2(), blocks: [newPara('z')], raw: null});
      const before = structuredClone(d);
      const old = d.sections[0];
      const blocks = old.blocks;
      const raw = sectRaw(12240);
      const inv = apply(d, {op: 'setSection', at: 0, props: {...P2(),
        type: 'continuous'}, raw});
      assert.deepEqual(d.sections[0].props, {...P2(),
        type: 'continuous'});
      assert.ok(deepEqual(d.sections[0].raw, raw));
      assert.notEqual(d.sections[0], old, 'a new section object');
      assert.equal(d.sections[0].blocks, blocks, 'blocks kept');
      assert.equal(inv.props, old.props);
      assert.equal(inv.raw, old.raw);
      applyOwn(d, inv);
      assert.ok(deepEqual(d, before));
      assert.equal(d.sections[0].props, old.props);
    });
  it('raw undefined: no raw key, and back', () => {
    const d = oneSection();
    const before = structuredClone(d);
    const inv = apply(d, {op: 'setSection', at: 0, props: P2()});
    assert.ok(!('raw' in d.sections[0]));
    applyOwn(d, inv);
    assert.ok(deepEqual(d, before));
    const e = oneSection();
    delete e.sections[0].raw;
    const inv2 = apply(e, {op: 'setSection', at: 0, props: P2(),
      raw: null});
    assert.equal(e.sections[0].raw, null);
    applyOwn(e, inv2);
    assert.ok(!('raw' in e.sections[0]));
  });
  it('refusals leave the doc as it was', () => {
    const d = oneSection();
    const before = structuredClone(d);
    for (const op of [
      {at: 1, props: P2()}, {at: -1, props: P2()}, {at: '0', props: P2()},
      {at: 0, props: {extra: []}, raw: node('w:pPr')},
      {at: 0, props: {foo: 1, extra: []}}, {at: 0, props: {}},
      {at: 0, props: null}, {at: 0, props: P2(), raw: 7}]) {
      assert.throws(() => apply(d, {op: 'setSection', ...op}),
        RangeError, JSON.stringify(op));
      assert.ok(deepEqual(d, before));
    }
  });
  it('in a Document: undo and redo exact', () => {
    const d = new Document(oneSection());
    const a = structuredClone(d.doc);
    d.apply({op: 'setSection', at: 0, props: {...P1(), type: 'oddPage'},
      raw: null});
    const b = structuredClone(d.doc);
    d.undo();
    assert.ok(deepEqual(d.doc, a));
    d.redo();
    assert.ok(deepEqual(d.doc, b));
  });
});
