// Tables never touch after a deletion (D27; C7 fix A1): two w:tbl
// written next to each other are ONE table to Word. Backspace and
// Delete never remove the last paragraph between two tables (typed or
// Opaque, at top level and in a cell): the caret moves (or nothing
// happens) instead. A range deleted from one table's edge to the
// next one's leaves an empty paragraph between them, the caret in it
// (./RangeOps apart, in ./EditRange and ./RangeTbl). And a table a
// deletion takes whole keeps bookmark pairs whole (C7 fix A2): a mark
// in it whose partner stays goes to the caret (./BookmarkKeep
// tableMarks), as Delete over its cells does.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {marks} from '../../tools/moreapps/!Word/BookmarkFind';
import {newPara, newSection} from '../../tools/moreapps/!Word/Model';
import {endsCell} from '../../tools/moreapps/!Word/TblCheck';
import {cmpPath} from '../../tools/moreapps/!Word/Path';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {mk, undoable, box, S, O} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const tops = (d) => d.doc.sections[0].blocks;
const cellBlocks = (t, r = 0, c = 0) => t.rows[r].cells[c].blocks;
const pos = (b, off) => ({id: blockId(b), off});
const car = (b, off) => S.caret(pos(b, off));
const sel = (a, ao, b, bo) => S.select(pos(a, ao), pos(b, bo));
/** Texts of a block list: '#' an Opaque block, a typed table 'T'. */
const show = (list) => list.map((b) => (b.type === 'p' ? b.text
  : b.type === 'tbl' ? 'T' : '#'));
const KEYS = [['Backspace', X.deleteBack], ['Delete', X.deleteForward]];

/** Every two neighbouring tables in any container: [] when none. */
function touching(doc) {
  const out = [];
  const look = (list, where) => list.forEach((b, i) => {
    if (i && endsCell(list[i - 1]) && endsCell(b)) out.push(`${where}:${i}`);
    if (b.type === 'tbl') {
      b.rows.forEach((r, ri) => r.cells.forEach((c, ci) =>
        look(c.blocks, `${where}/${i}.${ri}.${ci}`)));
    }
  });
  doc.sections.forEach((s, k) => look(s.blocks, `s${k}`));
  return out;
}

const T = (n) => freeze(modelTable([[`${n}0`], [`${n}1`]]));
/** An Opaque w:tbl with an id (blockId) the selection can name. */
const K = () => box();

describe('Backspace and Delete keep the paragraph between two tables',
  () => {
    const bodies = [['two typed tables', () => [T('a'), '', T('b')]],
      ['a typed table and an Opaque one', () => [T('a'), '', K()]],
      ['an Opaque table and a typed one', () => [K(), '', T('b')]],
      ['two Opaque tables', () => [K(), '', K()]]];
    for (const [what, make] of bodies) {
      for (const [key, fn] of KEYS) {
        it(`${what}: ${key} in the empty paragraph`, () => {
          const d = mk(['p0', ...make(), 'p2']);
          const mid = tops(d)[2];
          const out = fn(d, car(mid, 0));
          assert.deepEqual(touching(d.doc), []);
          assert.equal(tops(d)[2], mid, 'the paragraph stays');
          assert.equal(d.undoDepth, 0, 'no undo step');
          assert.ok(out, 'a selection');
        });
      }
    }

    it('an empty paragraph holding only a bookmark: kept too', () => {
      const mark = (n) => ({kind: 'raw', level: 'p', text: '',
        node: {name: 'w:' + n, attrs: [['w:id', '1']], children: []}});
      const mid = newPara(O + O, {inlines: {0: mark('bookmarkStart'),
        1: mark('bookmarkEnd')}});
      for (const [, fn] of KEYS) {
        const d = mk(['p0', T('a'), mid, T('b'), 'p2']);
        fn(d, car(tops(d)[2], fn === X.deleteBack ? 0 : 2));
        assert.deepEqual(show(tops(d)), ['p0', 'T', O + O, 'T', 'p2']);
      }
    });

    it('Backspace: the caret to the end of the table before', () => {
      const d = mk(['p0', T('a'), '', T('b'), 'p2']);
      const out = X.deleteBack(d, car(tops(d)[2], 0));
      const a = cellBlocks(tops(d)[1], 1)[0];
      assert.deepEqual(out.head, pos(a, 2));
    });

    for (const [key, fn, side, off] of [['Delete', X.deleteForward, 1, 1],
      ['Backspace', X.deleteBack, 3, 0]]) {
      it(`${key} on a table's edge facing the paragraph: the caret ` +
        'goes into it', () => {
        for (const make of [T, K]) {
          const d = mk(['p0', make('a'), '', make('b'), 'p2']);
          const mid = tops(d)[2], t = tops(d)[side];
          const out = fn(d, car(t, off));
          assert.deepEqual(touching(d.doc), []);
          assert.equal(tops(d)[2], mid);
          assert.deepEqual(out.head, pos(mid, 0));
          assert.equal(d.undoDepth, 0);
        }
      });
    }

    for (const [key, fn] of KEYS) {
      it(`in a cell: ${key} keeps the paragraph between two nested ` +
        'tables (typed and Opaque)', () => {
        for (const B of [T('b'), K()]) {
          const d = mk([freeze(modelTable([[[T('a'), '', B, 'end']]])),
            'z']);
          const bs = () => cellBlocks(tops(d)[0]);
          const mid = bs()[1];
          fn(d, car(mid, 0));
          assert.equal(bs()[1], mid);
          assert.deepEqual(touching(d.doc), []);
          assert.equal(d.undoDepth, 0);
        }
      });
    }

    it('a table and a paragraph: the empty one still goes (TB10)', () => {
      const d = mk(['p0', T('a'), '', 'p2']);
      undoable(d, () => X.deleteBack(d, car(tops(d)[2], 0)));
      assert.deepEqual(show(tops(d)), ['p0', 'T', 'p2']);
    });
  });

describe('a range from one table\'s edge to the next table\'s', () => {
  const bodies = [['typed', () => [T('a'), 'm1', 'm2', T('b')]],
    ['Opaque', () => [K(), 'm1', K()]],
    ['typed then Opaque', () => [T('a'), 'm1', K()]],
    ['a table between', () => [T('a'), 'm1', T('c'), 'm2', T('b')]]];
  for (const [what, make] of bodies) {
    for (const [key, fn] of KEYS) {
      it(`top level, ${what}: ${key} leaves an empty paragraph, the ` +
        'caret in it', () => {
        const d = mk(['p0', ...make(), 'p2']);
        const bs = tops(d), a = bs[1], b = bs[bs.length - 2];
        const out = undoable(d, () => fn(d, sel(a, 1, b, 0)));
        assert.deepEqual(touching(d.doc), []);
        assert.equal(tops(d).length, 5);
        assert.equal(tops(d)[1], a);
        assert.equal(tops(d)[3], b);
        assert.equal(tops(d)[2].text, '');
        assert.deepEqual(out.head, pos(tops(d)[2], 0));
      });

      it(`in a cell, ${what}: ${key} the same`, () => {
        const d = mk([freeze(modelTable([[[...make(), 'end']]])), 'z']);
        const bs = () => cellBlocks(tops(d)[0]);
        const a = bs()[0], b = bs()[bs().length - 2];
        const out = undoable(d, () => fn(d, sel(a, 1, b, 0)));
        assert.deepEqual(touching(d.doc), []);
        assert.deepEqual(show(bs()), [show([a])[0], '', show([b])[0],
          'end']);
        assert.deepEqual(out.head, pos(bs()[1], 0));
      });
    }
  }

  it('a range taking the first table whole: the table before it ' +
    'and the one after do not touch', () => {
    // (T0 and T1 touch in the file already: the range's join is
    // between T0 and the table after)
    const d = mk(['p0', K(), T('a'), 'm', T('b'), 'p2']);
    const bs = tops(d);
    undoable(d, () => X.deleteForward(d, sel(bs[2], 0, bs[4], 0)));
    assert.deepEqual(show(tops(d)), ['p0', '#', '', 'T', 'p2']);
  });

  it('across a section break: each section keeps its own', () => {
    const d = mk(['p0', T('a'), 'm1']);
    const s1 = newSection();
    s1.blocks = [newPara('m2'), T('b'), newPara('p2')];
    d.doc.sections.push(s1);
    d.clearHistory();
    const a = tops(d)[1], b = d.doc.sections[1].blocks[1];
    undoable(d, () => X.deleteForward(d, sel(a, 1, b, 0)));
    assert.deepEqual(touching(d.doc), []);
  });
});

const mark = (n, id) => ({kind: 'raw', level: 'p', text: '',
  node: {name: 'w:' + n, attrs: [['w:id', String(id)]], children: []}});
const node = (n, id) => ({name: 'w:' + n, attrs: [['w:id', String(id)]],
  children: []});
/** [[id, start before end]] from the model's marks in flow order. */
function order(doc) {
  const ms = marks(doc);
  const ids = [...new Set(ms.map((m) => m.id))];
  return ids.map((id) => {
    const s = ms.filter((m) => m.id === id && m.kind === 'start');
    const e = ms.filter((m) => m.id === id && m.kind === 'end');
    const c = s.length === 1 && e.length === 1 ? cmpPath(s[0].at,
      e[0].at) || (s[0].off ?? 0) - (e[0].off ?? 0) : NaN;
    return [id, s.length === 1 && e.length === 1 && c <= 0];
  });
}
const kinds = (d) => marks(d.doc).map((m) => m.kind + m.id).sort();

/** A 2 x 2 table whose (1,0) holds an end of bookmark 1. */
const T2 = () => freeze(modelTable([['a', 'b'], [{blocks: [newPara(
  'c' + O, {inlines: {1: mark('bookmarkEnd', 1)}})]}, 'd']]));
const before = () => newPara('p' + O + 'q',
  {inlines: {1: mark('bookmarkStart', 1)}});

describe('a table deleted whole keeps bookmark pairs (C7 fix A2)', () => {
  for (const nested of [false, true]) {
    const place = nested ? ' (in a cell)' : '';
    const build = (t) => {
      const list = [before(), t, newPara('z')];
      const d = mk(nested ? [freeze(modelTable([[{blocks: list}]])),
        'w'] : list);
      const bs = () => (nested ? cellBlocks(tops(d)[0]) : tops(d));
      return {d, bs};
    };

    it(`Backspace over every cell${place}: the end goes to the caret`,
      () => {
        const {d, bs} = build(T2());
        const t = bs()[1];
        undoable(d, () => X.deleteBack(d, sel(cellBlocks(t, 0, 0)[0], 0,
          cellBlocks(t, 1, 1)[0], 1)));
        assert.equal(bs().length, 2, 'the table is gone');
        assert.deepEqual(kinds(d), ['end1', 'start1']);
        assert.deepEqual(order(d.doc), [['1', true]]);
      });

    for (const [key, fn] of KEYS) {
      it(`${key} over a range covering the table${place}: the pair ` +
        'kept', () => {
        const {d, bs} = build(T2());
        const out = undoable(d, () => fn(d, sel(bs()[0], 2, bs()[2], 0)));
        assert.deepEqual(kinds(d), ['end1', 'start1']);
        assert.deepEqual(order(d.doc), [['1', true]]);
        assert.ok(out);
      });

      it(`${key} over the table's two edges${place}: the same`, () => {
        const {d, bs} = build(T2());
        const t = bs()[1];
        undoable(d, () => fn(d, sel(t, 0, t, 1)));
        assert.deepEqual(kinds(d), ['end1', 'start1']);
        assert.deepEqual(order(d.doc), [['1', true]]);
      });
    }

    it(`a loose mark of the table (a row's lead)${place}: kept`, () => {
      const t0 = modelTable([['a'], ['b']]);
      const t = freeze({...t0, rows: [t0.rows[0], {...t0.rows[1],
        lead: [node('bookmarkEnd', 1)]}]});
      const {d, bs} = build(t);
      undoable(d, () => X.deleteForward(d, sel(bs()[1], 0, bs()[1], 1)));
      assert.deepEqual(kinds(d), ['end1', 'start1']);
      assert.deepEqual(order(d.doc), [['1', true]]);
    });

    it(`a pair wholly in the table goes with it${place}`, () => {
      const t = freeze(modelTable([[{blocks: [newPara(O + 'a',
        {inlines: {0: mark('bookmarkStart', 2)}})]}],
      [{blocks: [newPara('b' + O, {inlines: {1: mark('bookmarkEnd',
        2)}})]}]]));
      const {d, bs} = build(t);
      undoable(d, () => X.deleteForward(d, sel(bs()[1], 0, bs()[1], 1)));
      assert.deepEqual(kinds(d), ['start1']);
    });
  }
});
