// Scanners on Walk (Batch C, C1.6, D7): every scanner walks the MODEL
// and reads XML only inside an Opaque node or an inline. Each fixture
// table is read twice, typed (the reader) and Opaque (readOpaque):
// word count, numIds used, docPr ids, bookmarks give the same answers;
// lists number through cells in flow order (Word); Info counts typed
// tables as tables (R12); a bookmark in a cell is found at its real
// place (C3.5: R11's edge gone; a loose mark at the start of its
// row's or cell's first paragraph, or at the end of the row's or the
// table's last one); DocItems shows a typed table as one box whose
// id is the table's.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {count} from '../../tools/moreapps/!Word/WordCount';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {usedNumIds} from '../../tools/moreapps/!Word/ListUsed';
import {usedDocPrIds} from '../../tools/moreapps/!Word/PicIds';
import {marks, pairs, bookmarkNames, findBookmark, list}
  from '../../tools/moreapps/!Word/BookmarkFind';
import {goTo} from '../../tools/moreapps/!Word/Bookmarks';
import {keptMarks} from '../../tools/moreapps/!Word/BookmarkKeep';
import {orderedPos} from '../../tools/moreapps/!Word/EditPos';
import {facts, summary, infoWindow}
  from '../../tools/moreapps/!Word/Info';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {blocks as walk, ids}
  from '../../tools/moreapps/!Word/Walk';
import {select} from '../../tools/moreapps/!Word/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, nestedTable, readOpaque}
  from './tbl-fixtures.mjs';
import {listDocx, item} from './list-fixtures.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';
import {loadStyles, tm} from './word-docs.mjs';

before(loadStyles);

const bs = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const be = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const words = (k, w) => Array.from({length: k}, (_, i) => w + i)
  .join(' ');
const pic = (id) => p('<w:r>' + drawingXml({id, decl: false}) +
  '</w:r>');
const LINK = '<w:hyperlink w:anchor="inCell">' + r('linked words') +
  '</w:hyperlink>';

const BOOKMARKS = p(bs(9, 'before') + r('x')) + tbl([
  tr([tc(p(bs(1, 'inCell') + r('a'))),
    tc(p(r('b')), {lead: bs(3, 'cellLead')})], {tail: be(3)}),
  tr([tc(p(r('c') + be(1))), tc(p(r('d')))],
    {lead: bs(2, 'rowLead')}),
  be(2)]) + p(r('y') + be(9));
const WORDS = tbl([
  tr([tc(p(r(words(8, 'a')))), tc([p(r(words(4, 'b'))),
    p(r('tab') + '<w:r><w:tab/></w:r>' + r('here') +
    '<w:r><w:br/></w:r>' + r('x'))])]),
  tr([tc(p(LINK + r(' ' + words(9, 'c')))), tc(p(r(words(5, 'd'))))]),
]);
const NESTED = p(r('top')) + tbl([tr([tc(p(r('outer one')) +
  nestedTable(3) + p(bs(5, 'deep') + r('after nest') + be(5))),
  tc(p(r('two')))])]) + p(r('end'));
const LIST_IN = [item('one', 2), tbl([tr([tc(item('two', 2)),
  tc(item('three', 2))])]), item('four', 2)];
const LIST_OUT = [item('one', 2), tbl([tr([tc(p(r('plain'))),
  tc(p(r('cell')))])]), item('two', 2)];

const FIXTURES = [
  ['a bookmark pair across rows, loose marks', () =>
    tblDocx(BOOKMARKS)],
  ['30 words in cells', () => tblDocx(p(r('lead in')) + WORDS)],
  ['a nested table', () => tblDocx(NESTED)],
  ['a list into a cell and after it', () => listDocx(LIST_IN)],
  ['a list round a table', () => listDocx(LIST_OUT)],
  ['a picture in a cell', () => picDocx({body: tbl([tr([tc(pic(40)),
    tc(p(r('caption')))])])})],
  // (the deepest a table types; one more: an Opaque block in a cell)
  ['tables nested 8 and 9 deep', () => tblDocx(nestedTable(8) +
    p(bs(7, 'mid') + r('mid')) + nestedTable(9) + p(be(7)))],
];

async function both(make) {
  const bytes = await make();
  const typed = await readDocx(bytes);
  const opaque = await readOpaque(bytes);
  const kinds = (d) => d.sections.flatMap((s) => s.blocks)
    .filter((b) => b.type !== 'p').map((b) => b.type);
  assert.ok(kinds(typed).length > 0);
  assert.ok(kinds(typed).every((t) => t === 'tbl'), 'typed');
  assert.ok(kinds(opaque).every((t) => t === 'opaque'), 'Opaque');
  return {typed, opaque};
}

const nums = (c) => ({words: c.words, chars: c.chars,
  charsNoSpaces: c.charsNoSpaces, paras: c.paras});
const tops = (d) => d.sections.flatMap((s) => s.blocks);
const tableOf = (d) => tops(d).find((b) => b.type === 'tbl');
/** The labels of the top-level paragraphs, in order. */
const topLabels = (d) => {
  const ls = labels(d);
  return tops(d).filter((b) => b.type === 'p')
    .map((b) => (ls.get(b.id) || {text: null}).text);
};

describe('scanners: a typed table as its Opaque self', () => {
  for (const [name, make] of FIXTURES) {
    it(name, async () => {
      const {typed, opaque} = await both(make);
      assert.deepEqual(nums(count(typed)), nums(count(opaque)), 'count');
      assert.deepEqual(usedNumIds(typed).sort(),
        usedNumIds(opaque).sort(), 'numIds');
      assert.deepEqual([...usedDocPrIds(typed).ids].sort(),
        [...usedDocPrIds(opaque).ids].sort(), 'docPr');
      assert.equal(usedDocPrIds(typed).max, usedDocPrIds(opaque).max);
      assert.deepEqual(bookmarkNames(typed, {hidden: true}),
        bookmarkNames(opaque, {hidden: true}), 'names');
      const ends = (ps) => ps.map((x) => [x.name, x.id, !!x.end]);
      assert.deepEqual(ends(pairs(typed)), ends(pairs(opaque)), 'pairs');
      // (C3.5: the places differ, a typed table's real, an Opaque
      // one's its edge; the marks and their order do not)
      const what = (m) => m && [m.kind, m.name, m.id];
      assert.deepEqual(marks(typed).map(what), marks(opaque).map(what),
        'marks');
      const names = (d) => list(d).map((b) => [b.name, b.id]);
      assert.deepEqual(names(typed), names(opaque), 'list');
      if (name !== 'a list into a cell and after it') {
        assert.deepEqual(topLabels(typed), topLabels(opaque), 'labels');
      }
    });
  }
});

describe('scanners: the details', () => {
  it('words: 30 in the cells, each paragraph counted', async () => {
    const {typed} = await both(FIXTURES[1][1]);
    const c = count(typed);
    assert.equal(c.words, 2 + 8 + 4 + 3 + 2 + 9 + 5);
    assert.equal(c.paras, 6);
  });
  it('a selection over a typed table counts it as the Opaque one',
    async () => {
      for (const make of [FIXTURES[0][1], FIXTURES[2][1]]) {
        const {typed, opaque} = await both(make);
        const sel = (d) => {
          const ps = tops(d);
          return select({id: ps[0].id, off: 0},
            {id: ps[ps.length - 1].id, off: 1});
        };
        const a = count(typed, sel(typed));
        assert.equal(a.scope, 'selection');
        assert.deepEqual(nums(a), nums(count(opaque, sel(opaque))));
        // starting on the table's far edge leaves it out
        const t = tableOf(typed), ps = tops(typed);
        const out = count(typed, select({id: t.id, off: 1},
          {id: ps[ps.length - 1].id, off: 1}));
        assert.equal(out.paras, 1);
      }
    });
  it('lists number through cells in flow order (Word)', async () => {
    const {typed, opaque} = await both(FIXTURES[3][1]);
    const ls = labels(typed);
    const all = [...walk(typed)].filter((e) => e.b.type === 'p')
      .map((e) => (ls.get(e.b.id) || {}).text);
    assert.deepEqual(all, ['1.', '2.', '3.', '4.']);
    // (an Opaque table is skipped: its items neither count nor show)
    assert.deepEqual(topLabels(opaque), ['1.', '2.']);
    // every paragraph id at every depth is a key
    const cellIds = [...walk(typed)].filter((e) => e.depth > 0)
      .map((e) => e.b.id);
    assert.ok(cellIds.every((id) => ls.has(id)));
  });
  it('a bookmark in a cell: at its real place (C3.5)', async () => {
    const {typed} = await both(FIXTURES[0][1]);
    const t = tableOf(typed);
    const cellP = (r, c) => t.rows[r].cells[c].blocks[0];
    const where = (name) => {
      const m = marks(typed).find((x) => x.name === name);
      return [m.at, m.off, m.table, m.direct];
    };
    // an inline mark: its own place, movable
    assert.deepEqual(where('inCell'), [[0, 1, 0, 0, 0], 0, false, true]);
    // a cell's lead: the start of that cell's first paragraph; a row's
    // lead: the start of the row's first one (loose: not movable)
    assert.deepEqual(where('cellLead'), [[0, 1, 0, 1, 0], 0, false,
      false]);
    assert.deepEqual(where('rowLead'), [[0, 1, 1, 0, 0], 0, false,
      false]);
    const end = (id) => marks(typed).find((x) => x.kind === 'end' &&
      x.id === id);
    // a row's tail: the end of its last cell's last paragraph; the
    // table's tail: the end of the last cell's
    assert.deepEqual([end('3').at, end('3').off], [[0, 1, 0, 1, 0], 1]);
    assert.deepEqual([end('2').at, end('2').off], [[0, 1, 1, 1, 0], 1]);
    assert.deepEqual(findBookmark(typed, 'inCell'), {id: cellP(0, 0).id,
      off: 0});
    assert.deepEqual(findBookmark(typed, 'rowLead'),
      {id: cellP(1, 0).id, off: 0});
    const g = goTo(typed, 'rowLead').sel;
    assert.deepEqual([g.anchor, g.head], [{id: cellP(1, 0).id, off: 0},
      {id: cellP(1, 1).id, off: 1}]);
    const g1 = goTo(typed, 'inCell').sel;
    assert.deepEqual([g1.anchor, g1.head], [{id: cellP(0, 0).id,
      off: 1}, {id: cellP(1, 0).id, off: 1}]);
    // four tables down: the paragraph after the nest, in the outer cell
    const deep = await both(FIXTURES[2][1]);
    const at = [...walk(deep.typed)].find((e) => e.b.type === 'p' &&
      e.b.text.startsWith('\ufffcafter nest'));
    assert.ok(at, 'the paragraph after the nest');
    assert.deepEqual(findBookmark(deep.typed, 'deep'), {id: at.b.id,
      off: 0});
    assert.ok(goTo(deep.typed, 'deep').sel);
    // an Opaque table: its edge, as before
    assert.match(goTo(deep.opaque, 'deep').error, /in a table/);
  });
  it('marks keep document order: lead, cell, tail', async () => {
    const {typed} = await both(FIXTURES[0][1]);
    assert.deepEqual(marks(typed).map((m) => m.kind + ' ' + m.id),
      ['start 9', 'start 1', 'start 3', 'end 3', 'start 2', 'end 1',
        'end 2', 'end 9']);
  });
  it('a deletion over a typed table keeps the outside pair whole',
    async () => {
      for (const d of Object.values(await both(FIXTURES[0][1]))) {
        const ps = tops(d);
        const o = orderedPos(d, select({id: ps[0].id, off: 0},
          {id: ps[2].id, off: 0}));
        // bookmark 9 starts in the range and ends outside it
        assert.deepEqual(keptMarks(d, o).map((x) => x.node.name),
          ['w:bookmarkStart']);
      }
    });
  it('Info: typed tables are tables, Opaque ones preserved (R12)',
    async () => {
      const make = () => tblDocx(p(r('a')) + WORDS + p(r('b')) +
        tbl([tr([tc(p(r('c')))])]));
      const {typed, opaque} = await both(make);
      const f = facts(typed);
      assert.equal(f.tables, 2);
      assert.equal(f.paragraphs, 2 + 5 + 1);
      assert.equal(f.preserved, 1);   // the link
      assert.match(summary(typed),
        /^8 paragraphs, 2 tables, 1 preserved item \(1 link\), fonts/);
      assert.match(summary(opaque),
        /^2 paragraphs, 2 preserved items \(2 tables\), fonts/);
      assert.equal(facts(opaque).tables, 0);
      const win = infoWindow({createWindow: (s) => s}, 'Doc', typed);
      const field = win.icons.find((i) => i.name === 'paragraphs');
      assert.equal(field.text, '8 (2 tables)');
      const win2 = infoWindow({createWindow: (s) => s}, 'Doc', opaque);
      assert.equal(win2.icons.find((i) => i.name === 'paragraphs')
        .text, '2');
    });
  it('Info: nested tables count; none gives no tables part',
    async () => {
      const {typed} = await both(FIXTURES[2][1]);
      assert.equal(facts(typed).tables, 4);
      const plain = await readDocx(await tblDocx(p(r('a'))));
      assert.match(summary(plain), /^1 paragraph, no preserved/);
    });
  it('DocItems: a typed table is one \'tbl\' item with the table\'s ' +
    'id (C2.4: its cells\' items in L.byId too)', async () => {
      const {typed} = await both(FIXTURES[2][1]);
      const L = new DocLayout(typed, tm());
      L.layout(1000);
      const t = tableOf(typed);
      const tbls = L.items.filter((x) => x.kind === 'tbl');
      assert.equal(tbls.length, 1);
      assert.equal(tbls[0].id, t.id);
      assert.equal(tbls[0].block, t);
      assert.equal(tbls[0].label, '[table - preserved, not shown]');
      assert.equal(L.items.length, 3);
      assert.equal(L.byId.get(t.id), tbls[0]);
      for (const id of ids(typed)) assert.ok(L.byId.has(id), id);
    });
});
