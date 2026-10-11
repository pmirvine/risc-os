// The minimal clipboard of typed tables (Batch C, C1.7; D28's C1
// subset, R10): a typed table copied whole is a clipboard table block
// (./ClipSlice: no ids at any depth); pasted in the same document it
// comes back whole with fresh ids at every depth (./ClipCleanTbl
// sameTable + freshTable: row/cell w14:paraId dropped, marks with
// unique ids between rows dropped, a picture in a cell with a fresh
// docPr id), one undo step; pasted in another document it is a table
// too (C6.1: ./ClipCleanTbl crossTable replaced R10's text), its
// list items and pictures carried; an Opaque table across is still
// skipped. ClipStore counts cell blocks; written after a paste the
// package lints and validates as before.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {slice, plainOf} from '../../tools/moreapps/!Word/ClipSlice';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {clean} from '../../tools/moreapps/!Word/ClipClean';
import {sameTable, freshTable}
  from '../../tools/moreapps/!Word/ClipCleanTbl';
import {ClipStore, LIMITS} from '../../tools/moreapps/!Word/ClipStore';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ids as allIds, walkBlocks, mapBlocks, forEachIn}
  from '../../tools/moreapps/!Word/Walk';
import {bookmarkNames} from '../../tools/moreapps/!Word/BookmarkFind';
import {usedDocPrIds} from '../../tools/moreapps/!Word/PicIds';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, TBL_OPAQUE, modelTable, freeze}
  from './tbl-fixtures.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';
import {mk, undoable, el} from './edit-docs.mjs';
import {roundTrip, schema, write} from './roundtrip-lib.mjs';
import {item} from './list-fixtures.mjs';
import {sourceDocx, copyPaste as listsCopyPaste}
  from './clip-lists-docs.mjs';
import {lintPackage} from './lint-package.mjs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const rowAttrs = (i) => ` xmlns:w14="${W14}" w14:paraId="1A2B3C4${i}"` +
  ' w14:textId="77777777"';
const bs = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const be = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const cellPic = p('<w:r>' + drawingXml({id: 40, embed: 'rId11',
  decl: false}) + '</w:r>');
const NESTED = tbl([tr([tc(p(r('n1'))), tc(p(r('n2')))])]);
const TABLE = tbl([
  tr([tc(p(r('a1'))), tc(cellPic)], {attrs: rowAttrs(0)}),
  tr([tc([p(r('b1')), NESTED, p()]), tc(p(r('b2') +
    '<w:hyperlink w:anchor="x">' + r(' linked') + '</w:hyperlink>'))],
  {attrs: rowAttrs(1), lead: bs(1, 'between')}),
  be(1)]);
// [picture paragraph, before, TABLE, after]
const docBytes = () => picDocx({body: p(r('before')) + TABLE +
  p(r('after'))});

const tops = (d) => d.doc.sections.flatMap((s) => s.blocks);
const caretAt = (b, off) => S.caret({id: blockId(b), off});
const selOf = (a, o1, b, o2) => S.select({id: blockId(a), off: o1},
  {id: blockId(b), off: o2});
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);
const local = (n) => String(n).split(':').pop();

/** The copy of before .. after, pasted at the end of `after`. */
function copyPaste(d) {
  const [, before, , after] = tops(d);
  const s = slice(d.doc, selOf(before, 0, after, after.text.length));
  const sel = pasteBlocks(d, caretAt(after, after.text.length),
    s.blocks, {sameDoc: true, styleNames: s.styleNames, lists: s.lists,
      pics: s.pics, picScope: s.picScope});
  return {s, sel};
}

/** Every wp:docPr id in the document's model. */
const docPrIds = (doc) => [...JSON.stringify(doc.sections).matchAll(
  /"name":"wp:docPr","attrs":\[\["id","(\d+)"/g)].map((m) => m[1]);
/** JSON with object keys sorted. */
const sorted = (x) => JSON.stringify(x, (k, v) => (v && typeof v ===
  'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v)
    .sort().map((n) => [n, v[n]])) : v));

/** t without ids, extraP, w14 ids, loose marks and docPr ids. */
function plainShape(t) {
  const x = mapBlocks([t], (q) => ({...q, id: 0, extraP: []}),
    {table: (u) => ({...u, id: 0, tail: [], rows: u.rows.map((row) =>
      ({...row, lead: [], tail: [], attrs: row.attrs.filter((a) =>
        !/^(paraId|textId)$/.test(local(a[0]))), cells: row.cells.map(
        (c) => ({...c, lead: []}))}))})})[0];
  return sorted(x).replace(/\["id","\d+"\]/g, '["id","N"]');
}

describe('copy and paste of a typed table in the same document', () => {
  it('whole, fresh ids at every depth, marks with ids dropped, one ' +
    'undo step', async () => {
    const d = new Document(await readDocx(await docBytes()));
    const T = tops(d)[2];
    assert.equal(T.type, 'tbl', 'the table types by default');
    const before = allIds(d.doc);
    const {s} = undoable(d, () => copyPaste(d));
    assert.deepEqual(s.blocks.map((b) => b.type), ['p', 'tbl', 'p']);
    const inT = [];
    forEachIn([tops(d)[2]], [], (b) => inT.push(b.type === 'p' ? b.id
      : null));
    assert.deepEqual(s.ids, [tops(d)[1].id, ...inT, tops(d)[3].id],
      'a source id per walked block (C6.1)');
    const bl = tops(d);
    assert.deepEqual(bl.map((b) => b.type), ['p', 'p', 'tbl', 'p',
      'tbl', 'p']);
    const U = bl[4];
    assert.equal(bl[2], T, 'the source table is the same object');
    // ids: all fresh, none repeated anywhere
    const now = allIds(d.doc);
    assert.deepEqual(dupes(now), []);
    const pasted = allIds({sections: [{blocks: [U]}]});
    assert.equal(pasted.length, allIds({sections: [{blocks: [T]}]})
      .length);
    assert.ok(pasted.every((id) => !before.includes(id)), 'fresh ids');
    // equal but for ids, w14 ids, the bookmark pair and the docPr id
    assert.equal(plainShape(U), plainShape(T));
    assert.deepEqual(U.rows[0].attrs, [['xmlns:w14', W14]]);
    assert.equal(T.rows[0].attrs.length, 3);
    assert.deepEqual(U.rows[1].lead, []);
    assert.deepEqual(U.tail, []);
    assert.equal(T.rows[1].lead.length, 1);
    assert.equal(T.tail.length, 1);
    assert.deepEqual(bookmarkNames(d.doc), ['between']);
    // the picture in a cell: a fresh docPr id
    const docPrs = docPrIds(d.doc);
    assert.equal(docPrs.length, 3);
    assert.deepEqual(dupes(docPrs), []);
    assert.equal(usedDocPrIds(d.doc).ids.size, 3);
    for (const b of bl) checkBlock(b);
  });

  it('the copy holds no ids at any depth', async () => {
    const d = new Document(await readDocx(await docBytes()));
    const [, before, T, after] = tops(d);
    const s = slice(d.doc, selOf(before, 0, after, 5));
    for (const e of walkBlocks(s.blocks)) {
      assert.ok(!('id' in e.b), 'no id');
      assert.ok(!('extraP' in e.b), 'no extraP');
    }
    assert.equal(s.blocks[1].rows.length, T.rows.length);
    assert.equal(s.pics.size, 1, 'the cell picture\'s media comes');
    // C6.3: a table's plain text is its rows, cells by tabs
    const plain = 'before\na1\t\nb1 n1 n2 \tb2 linked\nafter';
    assert.equal(s.plain, plain);
    assert.equal(plainOf(s.blocks), plain);
    const html = toHtml(d.doc, s);
    assert.ok(html.includes('before'));
    assert.ok(html.includes('<p style="white-space:pre-wrap"><br></p>'));
    // a table only partly covered is not in the slice
    const s2 = slice(d.doc, S.select({id: T.id, off: 1},
      {id: after.id, off: 2}));
    assert.deepEqual(s2.blocks.map((b) => b.type), ['p']);
  });
});

describe('a typed table pasted in another document', () => {
  it('is a table (C6.1: R10\'s text replaced), its cell picture ' +
    'carried, one undo step', async () => {
    const src = new Document(await readDocx(await docBytes()));
    const [, before, T, after] = tops(src);
    const s = slice(src.doc, selOf(before, 0, after, 5));
    const d = mk(['x']);
    const sel = undoable(d, () => pasteBlocks(d,
      caretAt(tops(d)[0], 1), s.blocks, {sameDoc: false,
        styleNames: s.styleNames, lists: s.lists, pics: s.pics,
        picScope: s.picScope}));
    assert.ok(sel);
    assert.deepEqual(tops(d).map((b) => b.type), ['p', 'tbl', 'p']);
    const [x, U, y] = tops(d);
    assert.equal(x.text, 'xbefore');
    assert.equal(y.text, 'after');
    assert.equal(U.rows.length, T.rows.length);
    assert.deepEqual(U.rows[1].cells[1].blocks[0].text, 'b2 linked',
      'a link is its text across');
    assert.equal(U.rows[1].cells[0].blocks[1].type, 'tbl', 'nested');
    assert.deepEqual(U.rows[1].lead, [], 'no marks across');
    assert.deepEqual(U.rows[0].attrs, [], 'no attributes across');
    assert.equal(usedDocPrIds(d.doc).ids.size, 1, 'the picture came');
    assert.deepEqual(dupes(allIds(d.doc)), []);
    checkBlock(U);
  });

  it('list items in cells make their lists in the target (ClipNums, ' +
    'NumCopy); written, it lints and reads back', async () => {
    const src = new Document(await readDocx(await sourceDocx({paras: [
      p(r('x')), tbl([tr([tc(item('one', 2)), tc(item('two', 1))]),
        tr([tc(item('three', 2)), tc(p(r('plain')))])]), p(r('y'))]})));
    const [x, , y] = tops(src);
    const d = mk(['']);
    assert.equal(d.doc.numbering, null);
    undoable(d, () => listsCopyPaste(src, selOf(x, 0, y, 1), d,
      caretAt(tops(d)[0], 0)));
    const U = tops(d).find((b) => b.type === 'tbl');
    const np = (row, k) => U.rows[row].cells[k].blocks[0].pPr.numPr;
    const made = new Set([np(0, 0).numId, np(0, 1).numId]);
    assert.equal(made.size, 2, 'two lists made');
    assert.equal(np(1, 0).numId, np(0, 0).numId, 'one list, one count');
    assert.equal(np(1, 1), undefined);
    const nums = d.doc.numbering.raw.children.filter((c) =>
      typeof c === 'object' && c.name === 'w:num').map((c) =>
      Number(c.attrs.find((a) => a[0] === 'w:numId')[1]));
    for (const id of made) assert.ok(nums.includes(id));
    const bytes = await write(d.doc);
    const errs = lintPackage(await readZip(bytes)).problems
      .filter((q) => q.level === 'error');
    assert.deepEqual(errs, []);
    const back = new Document(await readDocx(bytes));
    const V = tops(back).find((b) => b.type === 'tbl');
    assert.equal(V.rows[0].cells[0].blocks[0].pPr.numPr.numId,
      np(0, 0).numId);
  });

  it('an Opaque table is skipped, as before', async () => {
    const src = new Document(await readDocx(await tblDocx(p(r('a')) +
      TBL_OPAQUE + p(r('b')))));
    const [a, k, b] = tops(src);
    assert.equal(k.type, 'opaque');
    const s = slice(src.doc, selOf(a, 0, b, 1));
    assert.deepEqual(clean(s.blocks, mk(['x']).doc, {})
      .map((q) => q.text), ['a', 'b']);
  });
});

describe('ClipCleanTbl', () => {
  const same = (q) => ({...q});
  const mark = (name) => ({name: 'w:' + name, attrs: [['w:id', '1']],
    children: []});
  /** A clipboard table block (no ids) with marks, w14 ids, cells. */
  function block() {
    const inner = modelTable([['in']]);
    const t = modelTable([['a', 'b'], [['c', inner, 'e'], 'd']]);
    const strip = (x) => mapBlocks([x], (q) => {
      const {id, extraP, ...rest} = q;
      return rest;
    }, {table: ({id, ...u}) => u})[0];
    const u = strip(t);
    const w14 = [['w14:paraId', '1'], ['w:rsidR', '00A'],
      ['w14:textId', '2']];
    return freeze({...u, tail: [mark('bookmarkEnd'), el('proofErr')],
      rows: u.rows.map((row) => ({...row, attrs: w14,
        lead: [mark('bookmarkStart')], tail: [mark('permEnd')],
        cells: row.cells.map((c) => ({...c, attrs: w14,
          lead: [mark('commentRangeStart')]}))}))});
  }

  it('sameTable: w14 ids and marks with ids go; paragraphs cleaned',
    () => {
      const b = block();
      const seen = [];
      const out = sameTable(b, (q) => (seen.push(q.text), same(q)));
      assert.deepEqual(seen, ['a', 'b', 'c', 'in', 'e', 'd']);
      assert.deepEqual(out.tail, [el('proofErr')]);
      for (const row of out.rows) {
        assert.deepEqual(row.attrs, [['w:rsidR', '00A']]);
        assert.deepEqual(row.lead, []);
        assert.deepEqual(row.tail, []);
        for (const c of row.cells) {
          assert.deepEqual(c.attrs, [['w:rsidR', '00A']]);
          assert.deepEqual(c.lead, []);
        }
      }
      // the nested table too
      const inner = out.rows[1].cells[0].blocks[1];
      assert.equal(inner.type, 'tbl');
      assert.deepEqual(inner.rows[0].cells[0].blocks[0].text, 'in');
    });

  it('sameTable: an Opaque cell block with ids is text, else kept ' +
    'without w14 ids', () => {
      const sdt = {name: 'w:sdt', attrs: [], children: [{name: 'w:sdtPr',
        attrs: [], children: [{name: 'w:id', attrs: [['w:val', '5']],
          children: []}]}, {name: 'w:sdtContent', attrs: [], children: [
        {name: 'w:p', attrs: [], children: [{name: 'w:r', attrs: [],
          children: [{name: 'w:t', attrs: [], children: ['in sdt']}]}]}]}]};
      const keep = {name: 'w:customXml', attrs: [['w14:paraId', '9']],
        children: []};
      const t = freeze({type: 'tbl', tblPr: {extra: []}, grid: [2000],
        gridAttrs: [], attrs: [], tail: [], rows: [{trPr: {extra: []},
          attrs: [], lead: [], tail: [], tblPrEx: null, cells: [{tcPr:
          {extra: []}, attrs: [], lead: [], blocks: [{type: 'opaque',
            node: sdt}, {type: 'opaque', node: keep}]}]}]});
      const out = sameTable(t, same);
      const bl = out.rows[0].cells[0].blocks;
      assert.deepEqual(bl.map((x) => x.type), ['p', 'opaque']);
      assert.equal(bl[0].text, 'in sdt');
      assert.deepEqual(bl[1].node.attrs, []);
    });

  it('freshTable: fresh ids at every depth, extraP [], valid', () => {
    const t = freshTable(sameTable(block(), same));
    checkBlock(t);
    const list = allIds({sections: [{blocks: [t]}]});
    assert.equal(list.length, 8);
    assert.deepEqual(dupes(list), []);
    for (const e of walkBlocks([t])) {
      assert.ok(Number.isInteger(e.b.id));
      if (e.b.type === 'p') assert.deepEqual(e.b.extraP, []);
    }
    const again = freshTable(sameTable(block(), same));
    const l2 = allIds({sections: [{blocks: [again]}]});
    assert.ok(l2.every((id) => !list.includes(id)));
  });

});

describe('ClipStore counts the blocks in tables', () => {
  it('a 1000 x 5 table is 5000 cell blocks toward LIMITS.blocks', () => {
    const rows = Array.from({length: 1000}, () => Array(5).fill('x'));
    const t = modelTable(rows);
    const q = {type: 'p', text: '', runs: [], inlines: {},
      pPr: {extra: []}};
    const store = new ClipStore();
    const fill = (n) => [t, ...Array(n).fill(q)];
    // 1 table + 5000 cell paragraphs + n
    assert.equal(store.put(fill(LIMITS.blocks - 5001), 1).length, 16);
    assert.equal(store.put(fill(LIMITS.blocks - 5000), 1), null);
  });
});

describe('written after a paste', () => {
  it('lint and xmllint clean; undo gives the bytes back', async () => {
    const {xsd, note} = schema();
    const st = await roundTrip(await docBytes(), 'clip-tables', 0,
      (d) => {
        copyPaste(d);
        return {pasted: 1};
      }, {xsd});
    assert.equal(st.pasted, 1);
    assert.ok(!st.refused);
    assert.equal(st.schema, xsd ? 'checked' : 'skipped', note);
  });
});
