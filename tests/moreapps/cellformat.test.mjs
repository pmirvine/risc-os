// Formatting, lists, links, pictures, bookmarks and Find in cells
// (Batch C3.5, D10's paraRanges, D7): every formatting command acts
// on the paragraphs SelShape.paraRanges gives (a 'cells' rectangle:
// exactly its cells' paragraphs, the other cells' paragraph objects
// untouched); lists number and continue through cells in flow order
// (Word); Find and Replace go through cells in flow order and wrap;
// a bookmark in a cell is found at its real place and Go to goes
// there; a link inserted in a cell is followed under the pointer; a
// picture in a cell is found under the pointer, selected with its
// handles at the cell's x and resized; Word count of a 'cells'
// selection counts its cells; Insert > Page break is shaded in a
// cell. Each command one undo step that undoes deep-equal (tables
// deep-frozen: copy-on-write).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {apply} from '../../tools/moreapps/!Word/FormatApply';
import {pick, paint} from '../../tools/moreapps/!Word/FormatPaint';
import {query} from '../../tools/moreapps/!Word/Format';
import {toggleList, restart, continueList}
  from '../../tools/moreapps/!Word/ListMake';
import {afterSpace} from '../../tools/moreapps/!Word/AutoList';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {search, count as findCount, replaceAll, replaceOne}
  from '../../tools/moreapps/!Word/Find';
import {addBookmark, goTo, findBookmark, list}
  from '../../tools/moreapps/!Word/Bookmarks';
import {insertLink} from '../../tools/moreapps/!Word/LinkOps';
import {linkAt, linkUnder} from '../../tools/moreapps/!Word/LinkFind';
import {picAt, selectedPic, handleRects}
  from '../../tools/moreapps/!Word/PicFind';
import {setPicture} from '../../tools/moreapps/!Word/PicOps';
import {pictureOf, docMap} from '../../tools/moreapps/!Word/PicRead';
import {count as words} from '../../tools/moreapps/!Word/WordCount';
import {breakable} from '../../tools/moreapps/!Word/InsertApply';
import {firstIndents} from '../../tools/moreapps/!Word/RulerInd';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {Document} from '../../tools/moreapps/!Word/Document';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {at as walkAt, forEachBlock}
  from '../../tools/moreapps/!Word/Walk';
import {mk, undoable, snap, S} from './edit-docs.mjs';
import {tm, loadStyles} from './word-docs.mjs';
import {modelTable, freeze, tbl, tr, tc} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';

before(loadStyles);

/** The paragraph whose text is t (any depth): {b, at}. */
function find(doc, t) {
  let out = null;
  forEachBlock(doc, (b, at) => {
    if (b.type === 'p' && b.text === t) {
      out = {b, at};
      return false;
    }
    return true;
  });
  assert.ok(out, 'no paragraph ' + t);
  return out;
}
const pos = (d, t, off = 0) => ({id: find(d.doc, t).b.id, off});
const car = (d, t, off) => S.caret(pos(d, t, off));
const sel = (d, a, ao, h, ho) => S.select(pos(d, a, ao), pos(d, h, ho));
const T = (d) => new Typing(d);
/** The paragraph at path. */
const at = (d, path) => walkAt(d.doc, path);
const T3 = (cell = (i, j) => `r${i}c${j}`) => modelTable([0, 1, 2]
  .map((i) => [0, 1, 2].map((j) => cell(i, j))));
/** p0, a deep-frozen 3x3 table, p2. */
const doc3 = (cell) => mk(['p0', freeze(T3(cell)), 'p2']);
/** Cell (r, c)'s first paragraph's path in doc3. */
const cp = (r, c) => [0, 1, r, c, 0];
/** Every cell paragraph of doc3 by [r, c]. */
const cells = (d) => [0, 1, 2].map((i) => [0, 1, 2].map((j) =>
  at(d, cp(i, j))));
/** A 'cells' rectangle (0,0)..(1,1) of doc3. */
const rect = (d) => sel(d, 'r0c0', 1, 'r1c1', 2);
const IN = new Set(['00', '01', '10', '11']);

/** cmd changes exactly the rectangle's four paragraphs (the others
 *  the very same objects), one undo step; check(p) on the four. */
function onRect(d, cmd, check) {
  const old = cells(d);
  undoable(d, cmd);
  const now = cells(d);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (IN.has(`${i}${j}`)) {
        assert.notEqual(now[i][j], old[i][j], `${i}${j} changed`);
        check(now[i][j], `${i}${j}`);
      } else assert.equal(now[i][j], old[i][j], `${i}${j} untouched`);
    }
  }
  assert.equal(find(d.doc, 'p0').b, d.doc.sections[0].blocks[0]);
}

describe('formatting a cells rectangle (D10 paraRanges)', () => {
  it('Ctrl-B bolds exactly the four cells\' runs', () => {
    const d = doc3();
    onRect(d, () => apply('bold', d, T(d), rect(d)), (q) =>
      assert.ok(q.runs.every((x) => x.rPr.b === true)));
    assert.equal(query(d.doc, rect(d)).bold, true);
    assert.equal(query(d.doc, sel(d, 'r0c0', 0, 'r0c2', 1)).bold, null);
  });
  it('size, font, alignment, line spacing, paragraph borders', () => {
    const d = doc3();
    onRect(d, () => apply('size', d, T(d), rect(d), 14), (q) =>
      assert.ok(q.runs.every((x) => x.rPr.sz === 28)));
    onRect(d, () => apply('alignCenter', d, T(d), rect(d)), (q) =>
      assert.equal(q.pPr.jc, 'center'));
    onRect(d, () => apply('lineDouble', d, T(d), rect(d)), (q) =>
      assert.equal(q.pPr.spacing.line, 480));
    const edge = {val: 'single', sz: 4};
    onRect(d, () => apply('borders', d, T(d), rect(d),
      {pBdr: {top: edge}}), (q) => assert.equal(q.pPr.pBdr.top.val,
      'single'));
    assert.equal(query(d.doc, rect(d)).align, 'center');
  });
  it('change case and the format painter on a rectangle', () => {
    const d = doc3();
    onRect(d, () => apply('changeCase', d, T(d), rect(d), 'upper'),
      (q, k) => assert.equal(q.text, `R${k[0]}C${k[1]}`));
    const e = mk([['bold', {rPr: {b: true, extra: []}}],
      freeze(T3())]);
    const picked = pick(e.doc, sel(e, 'bold', 0, 'bold', 4));
    assert.equal(picked.rPr.b, true);
    const old = cells(e);
    undoable(e, () => paint(e, T(e), rect(e), picked));
    const now = cells(e);
    assert.ok(now[1][1].runs.every((x) => x.rPr.b === true));
    assert.equal(now[2][2], old[2][2]);
    assert.equal(now[0][2], old[0][2]);
  });
  it('the painter picks in a cell (no top-level guard)', () => {
    const d = mk([freeze(modelTable([[['x']], [['y']]])), 'z']);
    assert.ok(pick(d.doc, car(d, 'x', 1)));
    assert.ok(pick(d.doc, sel(d, 'x', 0, 'y', 1)).pPr);
  });
  it('a text selection inside one cell formats only that text', () => {
    const d = doc3();
    const old = cells(d);
    undoable(d, () => apply('italic', d, T(d), sel(d, 'r1c1', 1, 'r1c1',
      3)));
    const q = at(d, cp(1, 1));
    assert.deepEqual(q.runs.map((x) => [x.start, x.end, !!x.rPr.i]),
      [[0, 1, false], [1, 3, true], [3, 4, false]]);
    assert.equal(at(d, cp(1, 0)), old[1][0]);
  });
  it('a mixed range: the paragraph before and the touched rows whole',
    () => {
      const d = doc3();
      const old = cells(d);
      undoable(d, () => apply('bold', d, T(d), sel(d, 'p0', 1, 'r0c1',
        1)));
      const now = cells(d);
      for (let j = 0; j < 3; j++) {
        assert.ok(now[0][j].runs.every((x) => x.rPr.b === true));
        assert.equal(now[1][j], old[1][j]);
      }
      assert.ok(find(d.doc, 'p0').b.runs.some((x) => x.rPr.b));
    });
  it('the ruler: the indents of a caret\'s cell paragraph', () => {
    const d = doc3();
    apply('indentMore', d, T(d), car(d, 'r1c1', 0));
    assert.equal(firstIndents(d.doc, car(d, 'r1c1', 2)).left, 720);
    assert.equal(firstIndents(d.doc, rect(d)).left, 0);
  });
});

/** Each paragraph's label text in flow order (null: none). */
function flowLabels(d) {
  const m = labels(d.doc), out = [];
  forEachBlock(d.doc, (b) => {
    if (b.type === 'p') out.push(m.has(b.id) ? m.get(b.id).text : null);
    return true;
  });
  return out;
}
const numIdOf = (q) => (q.pPr.numPr || {}).numId ?? null;

describe('lists in cells (flow order, as Word)', () => {
  it('Bullets on a rectangle: one list through its cells', () => {
    const d = doc3();
    onRect(d, () => apply('bullets', d, T(d), rect(d)), (q) =>
      assert.ok(q.pPr.numPr));
    const ids = new Set([...IN].map((k) => numIdOf(at(d,
      cp(+k[0], +k[1])))));
    assert.equal(ids.size, 1);
  });
  it('Numbering continues from before the table into cells and on ' +
    'after it', () => {
    const d = doc3();
    const num = (s) => undoable(d, () => toggleList(d, T(d), s,
      {kind: 'number'}, null));
    num(car(d, 'p0', 0));
    num(sel(d, 'r0c0', 0, 'r0c1', 1));
    num(car(d, 'p2', 0));
    assert.deepEqual(flowLabels(d), ['1.', '2.', '3.', null, null, null,
      null, null, null, null, '4.']);
    const n = numIdOf(find(d.doc, 'p0').b);
    assert.equal(numIdOf(at(d, cp(0, 1))), n);
    assert.equal(numIdOf(find(d.doc, 'p2').b), n);
    // Restart at the second cell item: it and later ones move
    undoable(d, () => restart(d, T(d), car(d, 'r0c1', 0), 1, null));
    assert.deepEqual(flowLabels(d).filter(Boolean), ['1.', '2.', '1.',
      '2.']);
    undoable(d, () => continueList(d, T(d), car(d, 'r0c1', 0), null));
    assert.deepEqual(flowLabels(d).filter(Boolean), ['1.', '2.', '3.',
      '4.']);
  });
  it('AutoList: "3. " after a table whose cells hold items 1 and 2 ' +
    'continues their list', () => {
    const d = doc3();
    toggleList(d, T(d), sel(d, 'r0c0', 0, 'r0c1', 1), {kind: 'number'},
      null);
    const n = numIdOf(at(d, cp(0, 0)));
    const t = T(d);
    let s = car(d, 'p2', 0);
    for (const ch of '3. ') s = t.type(s, ch);
    s = afterSpace(d, t, s);
    assert.ok(s, 'made an item');
    const q = d.doc.sections[0].blocks[2];
    assert.equal(numIdOf(q), n);
    assert.equal(labels(d.doc).get(q.id).text, '3.');
  });
  it('AutoList in a cell: "1. " makes the cell paragraph an item', () => {
    const d = mk(['a', freeze(modelTable([['', 'x']]))]);
    const id = at(d, [0, 1, 0, 0, 0]).id;
    const t = T(d);
    let s = S.caret({id, off: 0});
    for (const ch of '1. ') s = t.type(s, ch);
    s = afterSpace(d, t, s);
    assert.ok(s, 'made an item');
    const q = at(d, [0, 1, 0, 0, 0]);
    assert.equal(q.text, '');
    assert.equal(labels(d.doc).get(q.id).text, '1.');
  });
});

describe('Find and Replace through cells (flow order, wrap)', () => {
  const mkF = () => doc3((i, j) => (i === 1 && j === 0 ? 'x abc'
    : i === 1 && j === 1 ? 'abc y' : `r${i}c${j}`));
  it('Find from before the table: cell (1,0), then (1,1), then wraps',
    () => {
      const d = mkF();
      const m1 = search(d.doc, {at: [0, 0], off: 0}, 'abc');
      assert.deepEqual([m1.at, m1.from, m1.to, m1.wrapped],
        [cp(1, 0), 2, 5, false]);
      assert.equal(m1.s, undefined);
      const m2 = search(d.doc, {at: m1.at, off: m1.to}, 'abc',
        {wrap: true});
      assert.deepEqual([m2.at, m2.from, m2.wrapped], [cp(1, 1), 0,
        false]);
      const m3 = search(d.doc, {at: m2.at, off: m2.to}, 'abc',
        {wrap: true});
      assert.deepEqual([m3.at, m3.from, m3.wrapped], [cp(1, 0), 2, true]);
      const b = search(d.doc, {at: [0, 2], off: 0}, 'abc',
        {backwards: true});
      assert.deepEqual([b.at, b.from], [cp(1, 1), 0]);
      const b2 = search(d.doc, {at: b.at, off: b.from}, 'abc',
        {backwards: true});
      assert.deepEqual(b2.at, cp(1, 0));
      // a table's far edge: its cells are behind
      assert.equal(search(d.doc, {at: [0, 1], off: 1}, 'abc'), null);
      assert.deepEqual(search(d.doc, {at: [0, 1], off: 0}, 'abc').at,
        cp(1, 0));
      assert.equal(findCount(d.doc, 'abc'), 2);
    });
  it('Replace and Replace all in cells: counted, one undo step', () => {
    const d = mkF();
    const m = search(d.doc, {at: [0, 0], off: 0}, 'abc');
    const r1 = undoable(d, () => replaceOne(d, m, 'Q'));
    assert.deepEqual(r1, {at: cp(1, 0), from: 2, to: 3});
    assert.equal(at(d, cp(1, 0)).text, 'x Q');
    const e = mkF();
    const before = cells(e);
    const r2 = undoable(e, () => replaceAll(e, 'abc', 'ZZ'));
    assert.equal(r2.count, 2);
    assert.deepEqual(r2.last, {at: cp(1, 1), from: 0, to: 2});
    assert.equal(at(e, cp(1, 1)).text, 'ZZ y');
    assert.equal(at(e, cp(2, 2)), before[2][2]);
  });
});

describe('bookmarks, links and pictures in cells', () => {
  it('a bookmark in a cell: added, found at its paragraph, Go to', () => {
    const d = doc3();
    const s = undoable(d, () => addBookmark(d, T(d), sel(d, 'r1c1', 0,
      'r1c1', 2), 'InCell'));
    assert.ok(s.sel, s.error);
    const q = at(d, cp(1, 1));
    assert.deepEqual(findBookmark(d.doc, 'InCell'), {id: q.id, off: 0});
    const g = goTo(d.doc, 'InCell');
    assert.deepEqual([g.sel.anchor, g.sel.head], [{id: q.id, off: 1},
      {id: q.id, off: 3}]);
    assert.deepEqual(list(d.doc)[0].at, {at: cp(1, 1), off: 0});
  });
  it('a hyperlink inserted in a cell; under the pointer', () => {
    const d = doc3();
    const out = undoable(d, () => insertLink(d, T(d), sel(d, 'r1c1', 0,
      'r1c1', 4), {address: 'https://example.com/'}));
    assert.ok(out.sel, out.error);
    const q = at(d, cp(1, 1));
    assert.equal(linkAt(d.doc, S.caret({id: q.id, off: 1})).off, 0);
    const L = new DocLayout(d.doc, tm());
    L.layout(1000);
    const it = L.byId.get(q.id), line = it.lines[0];
    const t = line.items.find((x) => x.kind === 'link');
    const u = linkUnder(L, it.x + t.x + 1, it.y + line.y + 2);
    assert.deepEqual(u && [u.id, u.off], [q.id, 0]);
    // a point in another cell of the same row: not this link
    const other = L.byId.get(at(d, cp(1, 2)).id);
    assert.equal(linkUnder(L, other.x + 1, it.y + line.y + 2), null);
  });
  it('a picture in a cell: under the pointer, selected with its ' +
    'handles at the cell\'s x, resized in one step', async () => {
    const pic = p('<w:r>' + drawingXml({id: 40, decl: false}) +
      '</w:r>');
    const bytes = await picDocx({body: p(r('before')) +
      tbl([tr([tc(p(r('caption'))), tc(pic)])])});
    const d = new Document(await readDocx(bytes));
    d.clearHistory();
    const ti = d.doc.sections[0].blocks.findIndex((b) => b.type ===
      'tbl');
    const path = [0, ti, 0, 1, 0], q = at(d, path);
    const L = new DocLayout(d.doc, tm());
    L.layout(1000);
    const it = L.byId.get(q.id);
    assert.ok(it.x > L.left + 50, 'the second cell');
    const s = selectedPic(L, S.select({id: q.id, off: 0},
      {id: q.id, off: 1}));
    assert.ok(s, 'selected');
    assert.ok(s.rect.x >= it.x && s.rect.x < it.x + it.w);
    assert.ok(handleRects(s.rect, 1)[0].x > it.x - 5);
    const h = picAt(L, s.rect.x + 2, s.rect.y + 2);
    assert.deepEqual(h && h.pos, {id: q.id, off: 0});
    const old = pictureOf(q.inlines[0].node, docMap(d.doc));
    undoable(d, () => setPicture(d, S.select({id: q.id, off: 0},
      {id: q.id, off: 1}), {cx: Math.round(old.cx / 2)}));
    assert.equal(pictureOf(at(d, path).inlines[0].node,
      docMap(d.doc)).cx, Math.round(old.cx / 2));
    // alt text in a cell (C3 fix wave: the guide's claim checked)
    undoable(d, () => setPicture(d, S.select({id: q.id, off: 0},
      {id: q.id, off: 1}), {descr: 'A cat in a cell'}));
    assert.equal(pictureOf(at(d, path).inlines[0].node,
      docMap(d.doc)).alt, 'A cat in a cell');
  });
});

describe('Word count and Insert in cells', () => {
  it('a cells selection counts its cells', () => {
    const d = doc3((i, j) => `w${i}${j} x`);
    const c = words(d.doc, sel(d, 'w00 x', 1, 'w11 x', 2));
    assert.equal(c.scope, 'selection');
    assert.deepEqual([c.words, c.paras], [8, 4]);
    const t = words(d.doc, sel(d, 'w11 x', 0, 'w11 x', 3));
    assert.deepEqual([t.scope, t.words], ['selection', 1]);
    const all = words(d.doc);
    assert.equal(all.paras, 11);
  });
  it('Page break / Section break: not with the caret in a cell', () => {
    const d = doc3();
    assert.equal(breakable(d.doc, car(d, 'p0', 1)), true);
    assert.equal(breakable(d.doc, car(d, 'r1c1', 1)), false);
    assert.equal(breakable(d.doc, sel(d, 'p0', 0, 'r1c1', 1)), false);
    assert.equal(breakable(d.doc, null), false);
  });
});
