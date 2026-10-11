// EditPos locations carry paths (Batch C1.5, D6, rulings R5, R15):
// findBlock at every depth ({at, k, rank, endRank?, b, s, i?, depth,
// cell?}), neighbour inside a container, flow order (nextInFlow,
// prevInFlow, atRank), orderedPos by rank; the migrated commands act
// on the location's path; and the migration fails closed: (a) a
// forged location WITHOUT `at` (as a consumer still building
// [loc.s, loc.i] would see it) is refused by every migrated command
// family with a RangeError ('bad position'), the Doc unchanged; (b) a
// nested location at a top-level-only site is refused (deleteRange:
// RangeError; a section break in a cell: null, the beep path).
//
// The forged locations come from a module hook (node:module
// registerHooks) that wraps EditPos's location functions for the
// commands, so no seam is needed in the program; every module is
// imported after the hook is in place.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const forge = {on: false};
globalThis.__editPosForge = forge;

/** A forged location: s and b kept, no path, no index. */
globalThis.__editPosFake = (l) => (l && forge.on
  ? {s: l.s, i: undefined, b: l.b, k: l.k, rank: l.rank} : l);

registerHooks({
  load(url, ctx, next) {
    if (!/\/(!|%21)Word\/EditPos$/.test(url)) return next(url, ctx);
    const real = JSON.stringify(url + '?real');
    return {format: 'module', shortCircuit: true, source: [
      `import * as R from ${real};`,
      `export * from ${real};`,
      'const F = (l) => globalThis.__editPosFake(l);',
      'export const findBlock = (d, id) => F(R.findBlock(d, id));',
      'export const checkPos = (d, p) => F(R.checkPos(d, p));',
      'export const neighbour = (d, l, k) => F(R.neighbour(d, l, k));',
      'export function orderedPos(d, sel) {',
      '  const o = R.orderedPos(d, sel);',
      '  return o && {...o, f: F(o.f), t: F(o.t)};',
      '}'].join('\n')};
  },
});

const W = '../../tools/moreapps/!Word/';
const EP = await import(W + 'EditPos');
const {deepEqual, newPara} = await import(W + 'Model');
const {at: walkAt, forEachBlock} = await import(W + 'Walk');
const {Typing} = await import(W + 'Typing');
const {Document} = await import(W + 'Document');
const {readDocx} = await import(W + 'DocxRead');
const {select} = await import(W + 'Selection');
const E = await import(W + 'Edit');
const X = await import(W + 'EditDel');
const IA = await import(W + 'InsertApply');
const {setPicture} = await import(W + 'PicOps');
const {insertLink} = await import(W + 'LinkOps');
const {addBookmark} = await import(W + 'Bookmarks');
const {pasteBlocks} = await import(W + 'ClipPaste');
const {deleteRange} = await import(W + 'EditRange');
const {insertSection} = await import(W + 'SectBreak');
const {runView} = await import(W + 'EditRun');
const {mk, C, SEL, snap} = await import('./edit-docs.mjs');
const {modelTable, freeze} = await import('./tbl-fixtures.mjs');
const {p} = await import('./build-docx.mjs');
const {drawingXml, picDocx} = await import('./pic-fixtures.mjs');

/** p0, T (2x2: (0,0) a; (0,1) b1, N (1x2: n1 n2), b2; (1,0) c;
 *  (1,1) d), p2. Ranks: p0 0, T 1, a 2, b1 3, N 4, n1 5, n2 6,
 *  N end 7, b2 8, c 9, d 10, T end 11, p2 12. */
function fixture() {
  const N = modelTable([['n1', 'n2']]);
  const T = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']]);
  const d = mk(['p0', freeze(T), 'p2']);
  return {d, T, N};
}

/** The block whose text is t (any depth). */
function byText(doc, t) {
  let out = null;
  forEachBlock(doc, (b) => {
    if (b.type === 'p' && b.text === t) { out = b; return false; }
    return true;
  });
  return out;
}

const loc = (doc, t) => EP.findBlock(doc, byText(doc, t).id);

describe('findBlock: locations at every depth (R5)', () => {
  it('a paragraph in cell (1, 0): path, no i, cell, depth, k, rank',
    () => {
      const {d} = fixture();
      const l = loc(d.doc, 'c');
      assert.deepEqual(l.at, [0, 1, 1, 0, 0]);
      assert.equal(l.i, undefined);
      assert.ok(!('i' in l));
      assert.deepEqual(l.cell, {table: [0, 1], r: 1, c: 0});
      assert.equal(l.depth, 1);
      assert.equal(l.k, 1, 'the outer table\'s k');
      assert.equal(l.rank, 9);
      assert.equal(l.s, 0);
      assert.equal(l.endRank, undefined);
    });
  it('a paragraph of the nested table: depth 2, cell of N', () => {
    const {d} = fixture();
    const l = loc(d.doc, 'n2');
    assert.deepEqual(l.at, [0, 1, 0, 1, 1, 0, 1, 0]);
    assert.equal(l.depth, 2);
    assert.deepEqual(l.cell, {table: [0, 1, 0, 1, 1], r: 0, c: 1});
    assert.equal(l.k, 1);
    assert.equal(l.rank, 6);
  });
  it('tables: rank and endRank; the nested one in its cell', () => {
    const {d, T, N} = fixture();
    const t = EP.findBlock(d.doc, T.id);
    assert.deepEqual([t.at, t.i, t.k, t.rank, t.endRank, t.depth],
      [[0, 1], 1, 1, 1, 11, 0]);
    assert.equal(t.cell, undefined);
    const n = EP.findBlock(d.doc, N.id);
    assert.deepEqual([n.at, n.rank, n.endRank, n.depth],
      [[0, 1, 0, 1, 1], 4, 7, 1]);
  });
  it('a top-level paragraph after the table: today\'s k, rank after ' +
    'the table\'s endRank', () => {
    const {d, T} = fixture();
    const l = loc(d.doc, 'p2');
    assert.deepEqual([l.at, l.s, l.i, l.k, l.depth], [[0, 2], 0, 2, 2,
      0]);
    assert.equal(l.rank, 12);
    assert.equal(l.rank, EP.findBlock(d.doc, T.id).endRank + 1);
    assert.equal(loc(d.doc, 'p0').rank, 0);
  });
  it('k stays contiguous over sections; atIndex is top-level', () => {
    const {d} = fixture();
    const doc = d.doc;
    doc.sections.push({...doc.sections[0], blocks: [newPara('s1')]});
    const l = loc(doc, 's1');
    assert.deepEqual([l.at, l.k, l.rank], [[1, 0], 3, 13]);
    const a = EP.atIndex(doc, 2);
    assert.deepEqual([a.b.text, a.at, a.rank], ['p2', [0, 2], 12]);
    assert.equal(EP.atIndex(doc, 1).endRank, 11);
    assert.equal(EP.atIndex(doc, 4), null);
    assert.equal(EP.atIndex(doc, -1), null);
  });
  it('an unknown id or a non-number: null', () => {
    const {d} = fixture();
    assert.equal(EP.findBlock(d.doc, 1e9), null);
    assert.equal(EP.findBlock(d.doc, '1'), null);
  });
});

describe('neighbour, nextInFlow, prevInFlow, atRank', () => {
  it('neighbour: siblings in a cell; null at the cell\'s edges', () => {
    const {d, N} = fixture();
    const doc = d.doc;
    assert.equal(EP.neighbour(doc, loc(doc, 'b1'), -1), null);
    assert.equal(EP.neighbour(doc, loc(doc, 'b2'), 1), null);
    assert.equal(EP.neighbour(doc, loc(doc, 'a'), 1), null);
    assert.equal(EP.neighbour(doc, loc(doc, 'c'), -1), null);
    const n = EP.neighbour(doc, loc(doc, 'b1'), 1);
    assert.deepEqual([n.b, n.at, n.rank, n.endRank], [N,
      [0, 1, 0, 1, 1], 4, 7]);
    const b2 = EP.neighbour(doc, n, 1);
    assert.deepEqual([b2.b.text, b2.rank], ['b2', 8]);
    assert.equal(EP.neighbour(doc, b2, -1).rank, 4);
  });
  it('neighbour at top level: over the table, ranks right', () => {
    const {d, T} = fixture();
    const doc = d.doc;
    const t = EP.neighbour(doc, loc(doc, 'p0'), 1);
    assert.deepEqual([t.b, t.rank, t.endRank, t.k], [T, 1, 11, 1]);
    const q = EP.neighbour(doc, t, 1);
    assert.deepEqual([q.b.text, q.rank, q.k], ['p2', 12, 2]);
    assert.equal(EP.neighbour(doc, q, -1).rank, 1);
  });
  it('nextInFlow / prevInFlow cross cells and leave the table', () => {
    const {d, T} = fixture();
    const doc = d.doc;
    const text = (l) => (l ? (l.b.type === 'p' ? l.b.text : l.b.id)
      : null);
    assert.equal(text(EP.nextInFlow(doc, loc(doc, 'a'))), 'b1');
    assert.equal(text(EP.nextInFlow(doc, loc(doc, 'd'))), 'p2');
    assert.equal(text(EP.nextInFlow(doc, loc(doc, 'n2'))), 'b2');
    assert.equal(text(EP.nextInFlow(doc, loc(doc, 'p0'))), T.id);
    assert.equal(text(EP.nextInFlow(doc, EP.findBlock(doc, T.id))),
      'a');
    assert.equal(EP.nextInFlow(doc, loc(doc, 'p2')), null);
    assert.equal(text(EP.prevInFlow(doc, loc(doc, 'b2'))), 'n2');
    assert.equal(text(EP.prevInFlow(doc, loc(doc, 'c'))), 'b2');
    assert.equal(text(EP.prevInFlow(doc, loc(doc, 'p2'))), 'd');
    assert.equal(EP.prevInFlow(doc, loc(doc, 'p0')), null);
    // every block, both ways
    const all = [];
    forEachBlock(doc, (b) => { all.push(b); });
    for (let j = 0; j + 1 < all.length; j++) {
      const at = EP.findBlock(doc, EP.posOf({b: all[j]}, 0).id);
      assert.equal(EP.nextInFlow(doc, at).b, all[j + 1]);
      const back = EP.findBlock(doc, EP.posOf({b: all[j + 1]}, 0).id);
      assert.equal(EP.prevInFlow(doc, back).b, all[j]);
    }
  });
  it('atRank is the inverse of rank (and endRank)', () => {
    const {d} = fixture();
    const doc = d.doc;
    let n = 0;
    forEachBlock(doc, (b) => {
      const l = EP.findBlock(doc, EP.posOf({b}, 0).id);
      const r = EP.atRank(doc, l.rank);
      assert.equal(r.b, b);
      assert.deepEqual(r.at, l.at);
      if (b.type === 'tbl') assert.equal(EP.atRank(doc, l.endRank).b, b);
      n++;
    });
    assert.equal(n, 11);
    assert.equal(EP.atRank(doc, 13), null);
    assert.equal(EP.atRank(doc, -1), null);
    assert.equal(EP.atRank(doc, 1.5), null);
  });
  it('a location without a path: RangeError', () => {
    const {d} = fixture();
    const l = loc(d.doc, 'p0');
    assert.throws(() => EP.neighbour(d.doc, {...l, at: undefined}, 1),
      /bad position/);
    assert.throws(() => EP.sibOf({b: l.b}, 1), RangeError);
    assert.throws(() => EP.pathOf(null), RangeError);
  });
});

describe('checkPos, orderedPos, rankOf, topOnly', () => {
  it('orderedPos orders a nested and a top-level position by rank',
    () => {
      const {d} = fixture();
      const doc = d.doc;
      const c = byText(doc, 'c'), p2 = byText(doc, 'p2');
      const o = EP.orderedPos(doc, select({id: p2.id, off: 0},
        {id: c.id, off: 1}));
      assert.deepEqual([o.from.id, o.to.id], [c.id, p2.id]);
      assert.equal(EP.topOnly(o), null);
      const n1 = byText(doc, 'n1'), b2 = byText(doc, 'b2');
      const o2 = EP.orderedPos(doc, select({id: b2.id, off: 0},
        {id: n1.id, off: 0}));
      assert.deepEqual([o2.f.b, o2.t.b], [n1, b2]);
    });
  it('a table\'s off 1 is its endRank', () => {
    const {d, T} = fixture();
    const doc = d.doc, c = byText(doc, 'c'), p2 = byText(doc, 'p2');
    const t = EP.findBlock(doc, T.id);
    assert.equal(EP.rankOf(t, 0), 1);
    assert.equal(EP.rankOf(t, 1), 11);
    const o = EP.orderedPos(doc, select({id: T.id, off: 1},
      {id: c.id, off: 0}));
    assert.equal(o.from.id, c.id);
    const o2 = EP.orderedPos(doc, select({id: p2.id, off: 0},
      {id: T.id, off: 1}));
    assert.equal(o2.from.id, T.id);
  });
  it('checkPos accepts a table edge {tableId, 0 | 1}, not 2', () => {
    const {d, T} = fixture();
    assert.ok(EP.checkPos(d.doc, {id: T.id, off: 1}));
    assert.ok(EP.checkPos(d.doc, {id: T.id, off: 0}));
    assert.equal(EP.checkPos(d.doc, {id: T.id, off: 2}), null);
    const c = byText(d.doc, 'c');
    assert.equal(EP.checkPos(d.doc, {id: c.id, off: 1}).rank, 9);
    assert.equal(EP.checkPos(d.doc, {id: c.id, off: 2}), null);
  });
  it('top-level positions order as before (no tables)', () => {
    const d = mk(['ab', 'cd', 'ef']);
    const o = EP.orderedPos(d.doc, SEL(d, 2, 1, 0, 1));
    assert.deepEqual([o.f.k, o.t.k, o.f.rank, o.t.rank], [0, 2, 0, 2]);
    assert.ok(EP.topOnly(o) === o);
  });
});

describe('migrated commands act on the location\'s path', () => {
  const cell = (d, t, off) => {
    const id = byText(d.doc, t).id;
    return select({id, off}, {id, off});
  };
  it('typing and Enter in a cell paragraph change only that cell',
    () => {
      const {d, T} = fixture();
      const sel = E.typeText(d, cell(d, 'c', 1), 'X');
      assert.equal(byText(d.doc, 'cX'), walkAt(d.doc, [0, 1, 1, 0, 0]));
      assert.equal(T.rows[0], d.doc.sections[0].blocks[1].rows[0]);
      E.splitPara(d, sel);
      const cl = d.doc.sections[0].blocks[1].rows[1].cells[0];
      assert.deepEqual(cl.blocks.map((b) => b.text), ['cX', '']);
      while (d.undo());
      assert.ok(deepEqual(d.doc.sections[0].blocks[1], T));
    });
  it('Backspace at a cell\'s start does nothing; inside it deletes',
    () => {
      const {d} = fixture();
      const before = snap(d);
      const s0 = cell(d, 'b1', 0);
      assert.equal(X.deleteBack(d, s0), s0);
      assert.ok(deepEqual(d.doc.sections, before));
      X.deleteBack(d, cell(d, 'b1', 2));
      assert.ok(byText(d.doc, 'b'));
    });
});

/** cmd(d) is refused with RangeError /bad position/ (or an {error}
 *  naming it); the Doc deep-equal, no undo step. */
function refused(d, cmd) {
  const before = snap(d), n = d.undoDepth;
  forge.on = true;
  let out;
  try {
    assert.throws(() => {
      out = cmd(d);
      if (out && out.error) throw new RangeError(out.error);
    }, (e) => e instanceof RangeError && /bad position/.test(e.message));
  } finally {
    forge.on = false;
  }
  assert.ok(deepEqual(d.doc.sections, before), 'nothing changed');
  assert.equal(d.undoDepth, n, 'no undo step');
}

describe('fail closed (a): a forged location without `at`', () => {
  const T = (d) => new Typing(d);
  it('Edit: typing, line break', () => {
    refused(mk(['hello', 'world']), (d) => E.typeText(d, C(d, 0, 2),
      'x'));
    refused(mk(['hello']), (d) => E.lineBreak(d, C(d, 0, 2)));
  });
  it('EditDel: Backspace, Delete, Delete at a paragraph\'s end', () => {
    refused(mk(['hello']), (d) => X.deleteBack(d, C(d, 0, 2)));
    refused(mk(['hello']), (d) => X.deleteForward(d, C(d, 0, 2)));
    refused(mk(['hello', 'world']), (d) => X.deleteForward(d,
      C(d, 0, 5)));
  });
  it('EditPara: Enter', () => {
    refused(mk(['hello']), (d) => E.splitPara(d, C(d, 0, 2)));
  });
  it('InsertApply: page break, a character put in', () => {
    refused(mk(['hello']), (d) => IA.pageBreak(d, C(d, 0, 2)));
    refused(mk(['hello']), (d) => IA.putIn(d, C(d, 0, 2), '\xA0'));
  });
  it('PicOps: a picture resized', async () => {
    const bytes = await picDocx({pics: [{id: 1}], body: p('<w:r>' +
      drawingXml({id: 4, embed: 'rId11', decl: false}) + '</w:r>')});
    const d = new Document(await readDocx(bytes));
    const id = d.doc.sections[0].blocks[0].id;
    refused(d, (x) => setPicture(x, select({id, off: 0}, {id, off: 1}),
      {cx: 1905000, cy: 952500}));
  });
  it('LinkOps: a link inserted', () => {
    refused(mk(['hello']), (d) => insertLink(d, T(d), SEL(d, 0, 0, 0, 5),
      {address: 'https://example.com/'}));
  });
  it('Bookmarks: a bookmark added', () => {
    refused(mk(['hello']), (d) => addBookmark(d, T(d), C(d, 0, 2), 'B'));
  });
  it('ClipPaste: blocks pasted at a caret', () => {
    const blk = {type: 'p', text: 'xy', runs: [{start: 0, end: 2,
      rPr: {extra: []}}], inlines: {}, pPr: {extra: []}};
    refused(mk(['hello']), (d) => pasteBlocks(d, C(d, 0, 2), [blk],
      {sameDoc: true}));
    refused(mk(['hello']), (d) => pasteBlocks(d, C(d, 0, 2),
      [blk, blk, blk], {sameDoc: true}));
  });
});

describe('fail closed (b): nested ends at top-level-only sites', () => {
  it('deleteRange with an end in a cell (C3.4: by its shape; ' +
    'celledit.test.mjs): an end its shape does not take refused',
    () => {
      const {d} = fixture();
      const before = snap(d);
      const c = byText(d.doc, 'c'), p0 = byText(d.doc, 'p0');
      // a location in a cell with positions of a top-level range
      const o = {...EP.orderedPos(d.doc, select({id: p0.id, off: 1},
        {id: p0.id, off: 2})), f: EP.findBlock(d.doc, c.id)};
      assert.throws(() => d.atomic(() => deleteRange(d, o)),
        (e) => e instanceof RangeError && /in a table/.test(e.message));
      assert.ok(deepEqual(d.doc.sections, before));
      assert.equal(d.undoDepth, 0);
      // a real one is deleted in one step
      const inCell = select({id: c.id, off: 0}, {id: c.id, off: 1});
      X.deleteSelection(d, inCell);
      assert.equal(byText(d.doc, ''), d.doc.sections[0].blocks[1]
        .rows[1].cells[0].blocks[0]);
      E.typeText(d, select({id: p0.id, off: 1}, {id: c.id, off: 0}),
        'x');
      assert.equal(d.undoDepth, 2);
    });
  it('a section break in a cell: null (the beep path), nothing done',
    () => {
      const {d} = fixture();
      const before = snap(d);
      const c = byText(d.doc, 'c');
      const sel = select({id: c.id, off: 1}, {id: c.id, off: 1});
      let commands = 0;
      const typing = {command: (fn) => { commands++; return fn(); }};
      assert.equal(insertSection(d, typing, sel, 'nextPage'), null);
      assert.equal(commands, 0, 'no undo step begun');
      let beeps = 0;
      const v = {d, sel, typing, pending: null, refused: () => beeps++,
        edited: () => assert.fail('edited'), ensure() {}};
      assert.equal(runView(v, 'sectionNext'), true);
      assert.equal(beeps, 1);
      assert.equal(v.sel, sel);
      assert.ok(deepEqual(d.doc.sections, before));
      assert.equal(d.undoDepth, 0);
    });
  it('at top level the section break still works', () => {
    const d = mk(['ab', 'cd']);
    const typing = new Typing(d);
    const out = insertSection(d, typing, C(d, 0, 1), 'nextPage');
    assert.ok(out && out.head);
    assert.equal(d.doc.sections.length, 2);
  });
});
