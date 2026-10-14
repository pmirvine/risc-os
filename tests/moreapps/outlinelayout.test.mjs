// Outline layout (Batch D P13.2, D32): a paragraph's level from its
// resolved outlineLvl (the style chain, then direct; Heading 1..9 are
// 0..8, body text 9), 0.25 in (24 px) more indent per level, the
// + / - / o markers, collapsed headings whose children get no item
// (L.flow skips them), tables and kept blocks as body text, the
// lines kept by the reuse key (level and marker too), and a
// selection across a collapsed heading taking its hidden children.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {levelOf, outlineOf, STEP, BODY, MIN_W}
  from '../../tools/moreapps/!Letters/OutlineLayout';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {W} from '../../tools/moreapps/!Letters/Ns';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {tm, box} from './word-docs.mjs';
import {mk, S, P, SEL, snap, texts} from './edit-docs.mjs';
import {modelTable} from './tbl-fixtures.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {openingView, VIEWS} = await import(
  '../../tools/moreapps/!Letters/ViewMode');

const H = (n, text) => [text, {pStyle: 'Heading' + n}];
/** An outline layout of Document d, collapsed: block indexes. */
function outline(d, collapsed = [], prev = null) {
  const set = new Set(collapsed.map((k) => P(d, k).id));
  const L = new DocLayout(d.doc, prev ? prev.metrics : tm(), prev,
    {outline: set});
  L.layout(900);
  return L;
}
const textOf = (it) => (it.kind === 'p' ? it.block.text : '#');

describe('Outline: levels (D32)', () => {
  it('Heading 1..6 by their style are 0..5, Normal is body text', () => {
    const d = mk([H(1, 'a'), H(2, 'b'), H(3, 'c'), H(6, 'f'), 'body']);
    const st = d.doc.styles;
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => levelOf(st, P(d, k))),
      [0, 1, 2, 5, BODY]);
    assert.equal(BODY, 9);
  });

  it('direct outlineLvl beats the style\'s; 9 is body text', () => {
    const d = mk([['x', {pPr: {outlineLvl: 2}}],
      ['y', {pStyle: 'Heading1', pPr: {outlineLvl: 9}}],
      ['z', {pStyle: 'Heading1', pPr: {outlineLvl: 4}}]]);
    const st = d.doc.styles;
    assert.deepEqual([0, 1, 2].map((k) => levelOf(st, P(d, k))),
      [2, BODY, 4]);
  });

  it('the style chain: a style based on Heading 2 is level 1', () => {
    const d = mk([['x', {pStyle: 'Mine'}]]);
    const st = structuredClone(d.doc.styles);
    st.styles.set('Mine', {id: 'Mine', type: 'paragraph', name: 'Mine',
      basedOn: 'Heading2', pPr: {extra: []}, rPr: {extra: []},
      extra: [], raw: null});
    assert.equal(levelOf(st, P(d, 0)), 1);
  });

  it('a style named heading 7..9 without outlineLvl is 6..8', () => {
    const d = mk([['x', {pStyle: 'H9'}], ['y', {pStyle: 'H7'}]]);
    const st = structuredClone(d.doc.styles);
    for (const n of [7, 9]) {
      st.styles.set('H' + n, {id: 'H' + n, type: 'paragraph',
        name: 'heading ' + n, basedOn: 'Normal', pPr: {extra: []},
        rPr: {extra: []}, extra: [], raw: null});
    }
    assert.equal(levelOf(st, P(d, 0)), 8);
    assert.equal(levelOf(st, P(d, 1)), 6);
  });

  it('values out of range are not levels; hostile style ids', () => {
    for (const v of [-1, 10, 1e9, NaN, 1.5]) {
      const d = mk([['x', {pStyle: 'Heading2', pPr: {outlineLvl: v}}]]);
      assert.equal(levelOf(d.doc.styles, P(d, 0)), 1, String(v));
    }
    for (const id of ['__proto__', 'constructor', 'nope']) {
      const d = mk([['x', {pStyle: id}]]);
      assert.equal(levelOf(d.doc.styles, P(d, 0)), BODY, id);
    }
    const d = mk(['x'], {styles: false});
    assert.equal(levelOf(null, P(d, 0)), BODY);
  });

  it('tables, kept blocks and pictures are body text', () => {
    const d = mk([H(1, 'h'), modelTable([['a', 'b']]), box(),
      ['pic', {pStyle: 'Normal'}]]);
    const st = d.doc.styles;
    for (const k of [1, 2, 3]) assert.equal(levelOf(st, P(d, k)), BODY);
  });
});

describe('Outline: indents and markers', () => {
  it('0.25 in (24 px) per level, body text one step under its heading',
    () => {
      assert.equal(STEP, 24);
      const d = mk(['before', H(1, 'one'), 'b1', H(3, 'three'), 'b3',
        H(2, 'two')]);
      const L = outline(d);
      const dx = L.items.map((it) => it.x - L.left);
      assert.deepEqual(dx, [0, 0, 24, 48, 72, 24]);
      assert.deepEqual(L.items.map((it) => it.w),
        dx.map((x) => L.textW - x));
      assert.deepEqual(L.items.map((it) => it.level),
        [9, 0, 9, 2, 9, 1]);
      for (const it of L.items) {
        for (const ln of it.lines) {
          for (const x of ln.items) assert.ok(x.x + x.w <= it.w + 9);
        }
      }
    });

  it('+ collapsed children, - children shown, o none and body text',
    () => {
      const d = mk([H(1, 'a'), 'body', H(1, 'b'), H(2, 'b1'), H(1, 'c'),
        H(1, 'd'), 'tail']);
      const L = outline(d, [2, 4]);
      assert.deepEqual(L.items.map((it) => [textOf(it), it.marker]),
        [['a', '-'], ['body', 'o'], ['b', '+'], ['c', 'o'], ['d', '-'],
          ['tail', 'o']]);
    });

  it('a section that is narrow keeps MIN_W of text', () => {
    const d = mk([H(1, 'a'), H(6, 'b'), 'deep']);
    const sec = d.doc.sections[0];
    sec.props = {...sec.props, pgSz: {w: 2400, h: 15840},
      pgMar: {...sec.props.pgMar, left: 360, right: 360}};
    const L = outline(d);
    for (const it of L.items) {
      assert.ok(it.w >= MIN_W, `${it.w}`);
      assert.ok(it.x + it.w <= L.left + L.textW + 0.001);
    }
  });

  it('Draft and Print layout items have no level or marker', () => {
    const d = mk([H(1, 'a'), 'b']);
    const L = new DocLayout(d.doc, tm());
    L.layout(900);
    assert.equal(L.outline, null);
    for (const it of L.items) {
      assert.equal(it.level, undefined);
      assert.equal(it.marker, undefined);
      assert.equal(it.x, L.left);
    }
  });
});

describe('Outline: collapsed headings', () => {
  const doc = () => mk(['intro', H(1, 'A'), 'a1', H(2, 'A.1'), 'a11',
    modelTable([['cell']]), H(1, 'B'), 'b1', H(2, 'B.1'), 'b11',
    H(1, 'C')]);

  it('collapsing Heading 1 hides its children: no items, L.flow ' +
    'skips them', () => {
    const d = doc();
    const L = outline(d, [1]);
    assert.deepEqual(L.items.map(textOf),
      ['intro', 'A', 'B', 'b1', 'B.1', 'b11', 'C']);
    assert.deepEqual(L.flow.map(textOf), L.items.map(textOf));
    for (const k of [2, 3, 4, 5]) {
      assert.equal(L.byId.get(P(d, k).id), undefined, String(k));
      assert.equal(L.locate({id: P(d, k).id, off: 0}), null);
    }
    const cell = P(d, 5).rows[0].cells[0].blocks[0];
    assert.equal(L.byId.get(cell.id), undefined);
    const a = L.byId.get(P(d, 1).id);
    assert.equal(textOf(L.nextItem(a)), 'B');
    assert.equal(L.nextItem(a).index, a.index + 1);
    assert.equal(L.items.map((it) => it.ci).join(), '0,1,2,3,4,5,6');
  });

  it('a heading collapsed inside one shown hides only its own', () => {
    const d = doc();
    const L = outline(d, [8]);
    assert.deepEqual(L.items.map(textOf), ['intro', 'A', 'a1', 'A.1',
      'a11', '#', 'B', 'b1', 'B.1', 'C']);
    assert.ok(L.flow.length > L.items.length, 'the table\'s cell');
    const t = L.byId.get(P(d, 5).id);
    const c = L.byId.get(P(d, 5).rows[0].cells[0].blocks[0].id);
    assert.deepEqual([t.x - L.left, t.level, t.marker], [48, 9, 'o']);
    assert.ok(c.x >= t.x + t.left, `${c.x} ${t.x}`);
  });

  it('a collapsed heading inside a collapsed one: all hidden; a ' +
    'collapsed heading without children hides nothing', () => {
    const d = doc();
    const L = outline(d, [1, 3, 10]);
    assert.deepEqual(L.items.map(textOf),
      ['intro', 'A', 'B', 'b1', 'B.1', 'b11', 'C']);
    assert.equal(L.byId.get(P(d, 10).id).marker, 'o');
  });

  it('the caret never goes into hidden paragraphs', () => {
    const d = doc();
    const L = outline(d, [1]);
    let sel = S.caret({id: P(d, 1).id, off: 1});
    sel = S.move(sel, L, 'down', false, 400);
    assert.equal(sel.head.id, P(d, 6).id);
    sel = S.move(S.caret({id: P(d, 6).id, off: 0}), L, 'left', false,
      400);
    assert.equal(sel.head.id, P(d, 1).id);
    sel = S.move(S.caret({id: P(d, 1).id, off: 1}), L, 'right', false,
      400);
    assert.equal(sel.head.id, P(d, 6).id);
  });

  it('ids that are no heading, or not in the document, change nothing',
    () => {
      const d = doc();
      const set = new Set(['nope', -1, '__proto__', P(d, 2).id,
        P(d, 5).id]);
      const L = new DocLayout(d.doc, tm(), null, {outline: set});
      L.layout(900);
      assert.equal(L.items.length, 11);
      assert.equal(L.items.filter((it) => it.marker === '+').length, 0);
      const M = new DocLayout(d.doc, tm(), null, {outline: 'x'});
      M.layout(900);
      assert.equal(M.items.length, 11);
    });

  it('a selection across a collapsed heading takes its hidden ' +
    'children', () => {
    const d = doc();
    const L = outline(d, [1]);
    const sel = SEL(d, 0, 2, 7, 1);
    const o = S.ordered(sel, L);
    assert.equal(o.from.id, P(d, 0).id);
    assert.ok(L.selectionRects(sel).length > 0);
    const plain = slice(d.doc, sel).plain;
    for (const t of ['a1', 'A.1', 'a11', 'cell']) {
      assert.ok(plain.includes(t), t);
    }
    const before = snap(d);
    deleteSelection(d, sel);
    assert.deepEqual(texts(d), ['in1', 'B.1', 'b11', 'C']);
    d.undo();
    assert.deepEqual(snap(d), before);
  });
});

describe('Outline: the reuse key (level and collapse set)', () => {
  it('a new layout keeps the lines of the items not changed', () => {
    const d = mk([H(1, 'A'), 'a1', H(1, 'B'), 'b1', 'b2', H(1, 'C')]);
    const L = outline(d);
    const was = new Map(L.items.map((it) => [it.id, it.lines]));
    const M = outline(d, [2], L);
    for (const it of M.items) {
      const kept = it.lines === was.get(it.id);
      assert.equal(kept, it.id !== P(d, 2).id, textOf(it));
    }
    assert.equal(M.items.length, 4);
  });

  it('switching from Draft keys by level: a heading at no indent ' +
    'is broken again', () => {
    const d = mk([H(1, 'A'), 'a1']);
    const L = new DocLayout(d.doc, tm());
    L.layout(900);
    const h = L.items[0].lines;
    const M = outline(d, [], L);
    assert.equal(M.items[0].w, L.textW);
    assert.notEqual(M.items[0].lines, h);
    const N = new DocLayout(d.doc, M.metrics, M, {outline: null});
    N.layout(900);
    assert.equal(N.outline, null);
    assert.equal(N.items[1].x, N.left);
  });

  it('opts.outline undefined keeps prev\'s collapse set', () => {
    const d = mk([H(1, 'A'), 'a1']);
    const L = outline(d, [0]);
    const M = new DocLayout(d.doc, L.metrics, L);
    M.layout(900);
    assert.equal(M.outline, L.outline);
    assert.equal(M.items.length, 1);
  });
});

describe('Outline: the rows', () => {
  it('outlineOf gives one row per top-level block, every section', () => {
    const d = mk([H(1, 'A'), 'a', H(1, 'B')]);
    const sec = d.doc.sections[0];
    d.doc.sections = [sec, {...sec, blocks: [newPara('s2')]}];
    const o = outlineOf(d.doc, new Set([P(d, 0).id]));
    assert.equal(o.rows.length, 4);
    assert.equal(o.shown, 3);
    assert.deepEqual(o.rows.map((r) => r.hidden),
      [false, true, false, false]);
  });

  it('50,000 paragraphs: worked out in well under 50 ms', () => {
    const blocks = [];
    for (let i = 0; i < 50000; i++) {
      blocks.push(i % 10 ? 'body ' + i : H(1 + (i % 3), 'h' + i));
    }
    const d = mk(blocks);
    const set = new Set([P(d, 0).id]);
    const ms = [];
    for (let i = 0; i < 23; i++) {
      const t0 = performance.now();
      outlineOf(d.doc, set);
      if (i >= 3) ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    assert.ok(ms[10] < 50, `median ${ms[10]} ms`);
  });
});

describe('Outline is a view of a window', () => {
  it('is among the views; w:view outline and masterPages open in it',
    () => {
      assert.ok(VIEWS.includes('outline'));
      for (const v of ['outline', 'masterPages']) {
        const d = mk(['x']);
        d.doc.rawSettings = parseXml(`<w:settings xmlns:w="${W}">` +
          `<w:view w:val="${v}"/></w:settings>`).root;
        assert.equal(openingView({}, d.doc), 'outline', v);
      }
    });

  it('saving after an Outline layout is byte-identical', async () => {
    const d = mk([H(1, 'A'), 'a1', H(2, 'A.1'), 'x']);
    const before = await writeDocx(d.doc, {date: new Date(0)});
    outline(d, [0, 2]);
    const after = await writeDocx(d.doc, {date: new Date(0)});
    assert.deepEqual(Buffer.from(after), Buffer.from(before));
  });
});
