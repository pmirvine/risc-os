// Insert > Table (Batch C4.4, D27, D31; ./TblInsert): a cols x rows
// "Table Grid" table at the caret in ONE undo step. 3 rows x 4 columns
// in a new document: Table Grid and Normal Table added once (a second
// table adds none; the old styles object is not changed and undo gives
// it back), the written XML exactly Word's (tblStyle TableGrid, tblW 0
// auto, tblLook 04A0; the grid the text width / 4 in twips, the
// remainder in the last column; tcW dxa; empty paragraphs), lint and
// xmllint clean, read back equal. The four placements (an empty
// paragraph: before; start: before; middle: split and between; end:
// after, with a paragraph after it), a selection deleted first, a
// nested table in a cell, refused at depth 8 (no step), a Strict
// document (the tblLook booleans only, start / end sides in the style),
// an existing Table Grid of another definition used as it is, no style
// table (direct borders), a fixed column width, hostile numbers, the
// Table > Delete table command and the brief's StylesBuiltin
// definitions against Word's exact XML. C4 fix wave: Auto width in a
// 2-column section and in a landscape later section is the section's
// column (layoutTw gives the layout's width only in a cell: the box
// passes nothing else); a Strict insert through roundTrip (lint,
// xmllint, read back); the 32767-row command and 32768 refused;
// Normal Table added only when the document has no default table
// style, and a TableNormal that is no table style never Table Grid's
// base; a table inserted in a list item (the cells copy its numPr).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {insertTable, tableGridStyles, layoutTw}
  from '../../tools/moreapps/!Letters/TblInsert';
import {columnTw} from '../../tools/moreapps/!Letters/SectWidth';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {tm} from './word-docs.mjs';
import {deleteTableCmd, TABLE}
  from '../../tools/moreapps/!Letters/TblCmdCols';
import {builtinStyle} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {ids as allIds, forEachBlock, at as walkAt}
  from '../../tools/moreapps/!Letters/Walk';
import {MAX_COLS, MAX_ROWS, MAX_TW}
  from '../../tools/moreapps/!Letters/TblCheck';
import {mk, undoable, S} from './edit-docs.mjs';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, nestedTable, tableXml, TABLE_NORMAL,
  TABLE_GRID, freeze} from './tbl-fixtures.mjs';
import {roundTrip, schema, hash} from './roundtrip-lib.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const {xsd} = schema();
const byText = (doc, t) => {
  let out = null;
  forEachBlock(doc, (b) => {
    if (b.type === 'p' && b.text === t) out = b;
    return out === null;
  });
  return out;
};
const car = (d, t, off = 0) => S.caret({id: byText(d.doc, t).id, off});
const top = (d) => d.doc.sections[0].blocks;
const show = (list) => list.map((b) => (b.type === 'p' ? b.text
  : b.type === 'tbl' ? `[${b.rows.length}x${b.grid.length}]` : '#'));
const xml = async (d) => (await tableXml(d.doc)).map((t) => serialize(t));

const LOOK = '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" ' +
  'w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';

/** The expected XML of a rows x cols table of the given widths. */
const expectXml = (rows, ws, look = LOOK, pr = '') => {
  const cell = (w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
    '</w:tcPr><w:p/></w:tc>';
  const row = `<w:tr>${ws.map(cell).join('')}</w:tr>`;
  return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>' + pr +
    '<w:tblW w:w="0" w:type="auto"/>' + look + '</w:tblPr><w:tblGrid>' +
    ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>' +
    row.repeat(rows) + '</w:tbl>';
};

describe('insertTable: a 3 x 4 table in a new document', () => {
  it('one undo step; the styles added once; the XML is Word\'s', async () => {
    const d = mk(['']);
    const was = d.doc.styles;
    assert.ok(!was.styles.has('TableGrid'));
    const sel = undoable(d, () => insertTable(d, car(d, ''),
      {cols: 4, rows: 3}));
    assert.ok(sel);
    assert.deepEqual(show(top(d)), ['[3x4]', '']);
    assert.ok(d.doc.styles.styles.has('TableGrid'));
    assert.equal(d.doc.styles.styles.get('TableGrid').basedOn,
      'TableNormal');
    assert.equal(d.doc.styles.defaults.table, 'TableNormal');
    assert.ok(!was.defaults.table, 'old defaults intact');
    assert.ok(!was.styles.has('TableGrid'), 'old styles untouched');
    const [x] = await xml(d);
    assert.equal(x, expectXml(3, [2256, 2256, 2256, 2258]));
    assert.deepEqual(sel.head, {id: top(d)[0].rows[0].cells[0].blocks[0]
      .id, off: 0});
    // undo gives the very same styles object back
    d.undo();
    assert.equal(d.doc.styles, was);
    d.redo();
    // a second table adds no style
    const st = d.doc.styles;
    insertTable(d, car(d, ''), {cols: 2, rows: 2});
    assert.equal(d.doc.styles, st, 'no setDocPart the second time');
    assert.equal([...st.styles.keys()].filter((k) => /^Table/.test(k))
      .length, 2);
  });

  it('the written styles are Word\'s definitions', async () => {
    const d = mk(['']);
    insertTable(d, car(d, ''), {cols: 2, rows: 2});
    const out = await writeDocx(d.doc, {date: DATE});
    const {xmlEntries} = await import('./docx-compare.mjs');
    const root = (await xmlEntries(out)).get('word/styles.xml').root;
    const got = root.children.filter((c) => c && c.name === 'w:style' &&
      c.attrs.some(([k, v]) => k === 'w:type' && v === 'table'))
      .map((c) => serialize(c));
    assert.deepEqual(got, [TABLE_NORMAL, TABLE_GRID]);
  });

  it('lint and xmllint clean; read back equal', async () => {
    const bytes = await tblDocx(p(r('start')) + p(r('end')));
    const change = async (d) => {
      const s = insertTable(d, car(d, 'start', 5), {cols: 4, rows: 3});
      assert.ok(s);
      d.typing = null;
      return {};
    };
    const res = await roundTrip(bytes, 'insert 3x4', hash('ins'),
      change, {xsd, read: {}});
    assert.ok(!res.refused);
  });
});

describe('insertTable: placement', () => {
  it('an empty paragraph: before it; start: before; end: after + a ' +
    'paragraph', () => {
    let d = mk(['a', '', 'b']);
    undoable(d, () => insertTable(d, car(d, ''), {cols: 2, rows: 2}));
    assert.deepEqual(show(top(d)), ['a', '[2x2]', '', 'b']);
    d = mk(['abc', 'tail']);
    undoable(d, () => insertTable(d, car(d, 'abc', 0), {cols: 2,
      rows: 1}));
    assert.deepEqual(show(top(d)), ['[1x2]', 'abc', 'tail']);
    d = mk(['abc', 'tail']);
    undoable(d, () => insertTable(d, car(d, 'abc', 3), {cols: 2,
      rows: 1}));
    assert.deepEqual(show(top(d)), ['abc', '[1x2]', 'tail']);
    d = mk(['abc']);
    undoable(d, () => insertTable(d, car(d, 'abc', 3), {cols: 2,
      rows: 1}));
    assert.deepEqual(show(top(d)), ['abc', '[1x2]', ''],
      'a paragraph after the table');
  });

  it('mid-paragraph: split, the table between', () => {
    const d = mk(['abcdef']);
    undoable(d, () => insertTable(d, car(d, 'abcdef', 2), {cols: 3,
      rows: 2}));
    assert.deepEqual(show(top(d)), ['ab', '[2x3]', 'cdef']);
  });

  it('a selection is deleted first (one step)', () => {
    const d = mk(['abcdef', 'g']);
    const sel = S.select({id: top(d)[0].id, off: 2}, {id: top(d)[0].id,
      off: 4});
    undoable(d, () => insertTable(d, sel, {cols: 2, rows: 1}));
    assert.deepEqual(show(top(d)), ['ab', '[1x2]', 'ef', 'g']);
  });

  it('the cells take the caret paragraph\'s pPr and pStyle', () => {
    const d = mk([['head', {pStyle: 'Heading1'}]]);
    insertTable(d, car(d, 'head', 4), {cols: 2, rows: 2});
    const t = top(d)[1];
    for (const row of t.rows) for (const c of row.cells) {
      assert.equal(c.blocks[0].pStyle, 'Heading1');
      assert.equal(c.blocks[0].text, '');
    }
  });

  it('a table touching a table gets a paragraph between', () => {
    const d = mk(['a']);
    insertTable(d, car(d, 'a', 1), {cols: 1, rows: 1});
    // caret in the paragraph after the first table, at its start
    const para = top(d)[2];
    insertTable(d, S.caret({id: para.id, off: 0}), {cols: 1, rows: 1});
    assert.deepEqual(show(top(d)), ['a', '[1x1]', '', '[1x1]', '']);
  });

  it('ids stay unique', () => {
    const d = mk(['abc', 'def']);
    insertTable(d, car(d, 'abc', 1), {cols: 5, rows: 6});
    insertTable(d, car(d, 'def', 1), {cols: 3, rows: 3});
    const all = allIds(d.doc);
    assert.equal(new Set(all).size, all.length);
  });
});

describe('insertTable: in cells', () => {
  const open = async (body, opts) => new Document(await readDocx(
    await tblDocx(body, opts), {}));
  it('a nested table; the width is the cell\'s less its margins',
    async () => {
      const d = await open(tbl([tr([tc(p(r('cell')), {tcPr: '<w:tcW ' +
        'w:w="4000" w:type="dxa"/>'})])], {grid: [4000]}));
      const s = undoable(d, () => insertTable(d, car(d, 'cell', 4),
        {cols: 2, rows: 2}));
      assert.ok(s);
      const t = top(d)[0], inner = t.rows[0].cells[0].blocks;
      assert.deepEqual(show(inner), ['cell', '[2x2]', '']);
      assert.deepEqual(inner[1].grid, [1892, 1892]);
    });
  it('textTw (the layout\'s) wins', async () => {
    const d = mk(['a']);
    insertTable(d, car(d, 'a', 1), {cols: 3, rows: 1, textTw: 3000});
    assert.deepEqual(top(d)[1].grid, [1000, 1000, 1000]);
  });
  it('depth 8 is refused, no step; depth 7 takes one', async () => {
    const d = await open(nestedTable(8) + p());
    const n = d.undoDepth;
    assert.equal(insertTable(d, car(d, 'L8', 2), {cols: 2, rows: 2}),
      null);
    assert.equal(d.undoDepth, n);
    const e = await open(nestedTable(7) + p());
    assert.ok(insertTable(e, car(e, 'L7', 2), {cols: 2, rows: 2}));
  });
});

describe('insertTable: styles and widths', () => {
  it('a Strict document: booleans only, start / end in the style',
    async () => {
      const bytes = await tblDocx(p(r('x')), {strict: true});
      const doc = await readDocx(bytes, {});
      const d = new Document(doc);
      insertTable(d, car(d, 'x', 1), {cols: 2, rows: 1});
      const [x] = await xml(d);
      assert.match(x, /<w:tblLook w:firstRow="1" w:lastRow="0" /);
      assert.ok(!/w:val="04A0"/.test(x));
      const g = d.doc.styles.styles.get('TableGrid');
      const s = serialize(g.extra[0]);
      assert.match(s, /<w:start /);
      assert.match(s, /<w:end /);
      assert.ok(!/<w:left |<w:right /.test(s));
      const back = await readDocx(await writeDocx(d.doc, {date: DATE}),
        {});
      assertSameDoc(back, expectedBack(d.doc));
    });
  it('an existing Table Grid of another definition is used as it is',
    () => {
      const d = mk(['a']);
      const mine = {id: 'TableGrid', name: 'Table Grid', type: 'table',
        pPr: {extra: []}, rPr: {extra: []}, extra: [], raw: null,
        marker: 7};
      d.doc.styles.styles.set('TableGrid', mine);
      const was = d.doc.styles;
      insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1});
      assert.equal(d.doc.styles, was, 'no new style table');
      assert.equal(was.styles.get('TableGrid'), mine);
      assert.equal(top(d)[1].tblPr.tblStyle, 'TableGrid');
    });
  it('the document\'s Table Grid by name under another id', () => {
    const d = mk(['a']);
    d.doc.styles.styles.set('Grid1', {id: 'Grid1', name: 'table grid',
      type: 'table', pPr: {extra: []}, rPr: {extra: []}, extra: [],
      raw: null});
    insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1});
    assert.equal(top(d)[1].tblPr.tblStyle, 'Grid1');
  });
  it('TableGrid that is no table style, or no style table: direct ' +
    'borders', async () => {
    const d = mk(['a'], {styles: false});
    insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1});
    const t = top(d)[1];
    assert.equal(t.tblPr.tblStyle, undefined);
    assert.deepEqual(Object.keys(t.tblPr.tblBorders), ['top', 'left',
      'bottom', 'right', 'insideH', 'insideV']);
    assert.equal(d.doc.styles, null);
    const e = mk(['a']);
    e.doc.styles.styles.set('TableGrid', {id: 'TableGrid', name: 'x',
      type: 'paragraph', pPr: {extra: []}, rPr: {extra: []}, extra: [],
      raw: null});
    assert.equal(tableGridStyles(e.doc.styles), null);
    const [x] = await xml(d);
    assert.match(x, /<w:tblBorders><w:top w:val="single" w:sz="4" /);
    assert.match(x, /<w:insideV w:val="single" w:sz="4" w:space="0" /);
    assert.ok(!/tblStyle/.test(x));
  });
  it('the styles table is never changed in place', () => {
    const d = mk(['a']);
    freeze(d.doc.styles);
    insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1});
    assert.ok(d.doc.styles.styles.has('TableGrid'));
  });
  it('a fixed column width: each column, tblLayout fixed', async () => {
    const d = mk(['a']);
    insertTable(d, car(d, 'a', 1), {cols: 3, rows: 1, widthTw: 1440});
    assert.deepEqual(top(d)[1].grid, [1440, 1440, 1440]);
    const [x] = await xml(d);
    assert.equal(x, expectXml(1, [1440, 1440, 1440]).replace(
      '<w:tblW w:w="0" w:type="auto"/>', '<w:tblW w:w="0" ' +
      'w:type="auto"/><w:tblLayout w:type="fixed"/>'));
  });
  it('the widest table: 63 columns across a narrow page', () => {
    const d = mk(['a']);
    d.doc.sections[0].props = {...d.doc.sections[0].props,
      pgMar: {left: 5000, right: 5000, top: 1440, bottom: 1440},
      pgSz: {w: 11906, h: 16838}};
    assert.ok(insertTable(d, car(d, 'a', 1), {cols: 63, rows: 2}));
    const g = top(d)[1].grid;
    assert.equal(g.length, 63);
    assert.ok(g.every((w) => w >= 1));
  });
});

describe('insertTable: hostile numbers', () => {
  const bad = [0, -1, 64, 1.5, NaN, Infinity, '3', null, undefined,
    1e9, MAX_COLS + 1];
  it('cols and rows outside 1..63 / 1..32767 are refused, no step',
    () => {
      const d = mk(['a']);
      const n = d.undoDepth, before = structuredClone(d.doc.sections);
      for (const c of bad) {
        assert.equal(insertTable(d, car(d, 'a', 1), {cols: c, rows: 2}),
          null, String(c));
      }
      for (const w of [...bad.filter((x) => x !== 64 && x !== 1e9),
        MAX_ROWS + 1, 1e9]) {
        if (w === 64) continue;
        assert.equal(insertTable(d, car(d, 'a', 1), {cols: 2, rows: w}),
          null, 'rows ' + w);
      }
      for (const w of [0, -5, 1.5, NaN, MAX_TW + 1, '5', 1e9]) {
        assert.equal(insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1,
          widthTw: w}), null, 'width ' + w);
      }
      assert.equal(insertTable(d, car(d, 'a', 1), {cols: 63, rows: 1,
        widthTw: 1000}), null, 'wider than MAX_TW in all');
      assert.equal(insertTable(d, null, {cols: 2, rows: 1}), null);
      assert.equal(insertTable(d, S.caret({id: 99999999, off: 0}),
        {cols: 2, rows: 1}), null);
      assert.equal(insertTable(d, car(d, 'a', 1)), null);
      assert.equal(d.undoDepth, n);
      assert.deepEqual(d.doc.sections, before);
    });
  it('the limits themselves are taken: 63 columns, 32767 rows is the ' +
    'command\'s cap, 1 x 1', () => {
    const d = mk(['a']);
    assert.ok(insertTable(d, car(d, 'a', 1), {cols: 63, rows: 1}));
    assert.ok(insertTable(d, car(d, 'a', 1), {cols: 1, rows: 1}));
    assert.ok(insertTable(d, car(d, 'a', 1), {cols: 1, rows: 1000}));
  });
});

describe('Table > Delete table', () => {
  it('removes the table the caret is in: one step, the caret after',
    () => {
      const d = mk(['a']);
      insertTable(d, car(d, 'a', 1), {cols: 2, rows: 2});
      const t = top(d)[1];
      const c = S.caret({id: t.rows[1].cells[1].blocks[0].id, off: 0});
      const out = undoable(d, () => deleteTableCmd(d, c));
      assert.ok(out);
      assert.deepEqual(show(top(d)), ['a', '']);
      assert.equal(typeof TABLE.deleteTable, 'function');
    });
  it('refused outside a table', () => {
    const d = mk(['a']);
    const n = d.undoDepth;
    assert.equal(deleteTableCmd(d, car(d, 'a', 1)), null);
    assert.equal(d.undoDepth, n);
  });
  it('a nested table: only the inner one', async () => {
    const d = new Document(await readDocx(await tblDocx(nestedTable(2) +
      p()), {}));
    const c = car(d, 'L2', 0);
    deleteTableCmd(d, c);
    const outer = top(d)[0];
    assert.equal(outer.type, 'tbl');
    assert.ok(!show(outer.rows[0].cells[0].blocks).some(
      (x) => x.startsWith('[')));
    assert.ok(walkAt(d.doc, [0, 0]));
    assert.ok(findBlock(d.doc, outer.id));
  });
});

describe('StylesBuiltin table styles', () => {
  it('builtinStyle gives fresh copies with the tblPr in extra', () => {
    const a = builtinStyle('TableGrid'), b = builtinStyle('TableGrid');
    assert.notEqual(a, b);
    assert.equal(a.type, 'table');
    assert.equal(a.basedOn, 'TableNormal');
    assert.equal(a.extra.length, 1);
    assert.equal(builtinStyle('TableNormal').isDefault, true);
    assert.equal(builtinStyle('nope'), null);
    assert.equal(builtinStyle('Normal').id, 'Normal');
  });
  it('ensureBuiltins does not add them', async () => {
    const {ensureBuiltins} = await import(
      '../../tools/moreapps/!Letters/StylesBuiltin');
    const s = ensureBuiltins({styles: new Map(), defaults: {}});
    assert.ok(!s.styles.has('TableGrid'));
  });
});

describe('C4 fix wave: widths, Strict, caps, styles, lists', () => {
  const COLS2 = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
    'w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
    '<w:cols w:num="2" w:space="720"/></w:sectPr>';
  const LAND = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" ' +
    'w:orient="landscape"/><w:pgMar w:top="1440" w:right="1440" ' +
    'w:bottom="1440" w:left="1440" w:header="708" w:footer="708" ' +
    'w:gutter="0"/></w:sectPr>';
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const tableIn = (d) => {
    let t = null;
    forEachBlock(d.doc, (b) => { if (b.type === 'tbl') t = b; });
    return t;
  };
  it('columnTw: the one section column rule', () => {
    assert.equal(columnTw({}), 9026);
    assert.equal(columnTw(null), 9026);
    assert.equal(columnTw({cols: {num: 2, space: 720}}), 4153);
    assert.equal(columnTw({pgSz: {w: 16838}, pgMar: {left: 1440,
      right: 1440}}), 13958);
    assert.equal(columnTw({cols: {num: 3}}), (9026 - 1440) / 3);
    assert.ok(columnTw({pgSz: {w: 100}}) < 0);
  });
  it('a 2-column section: the table is the column\'s width, from the ' +
    'box too (layoutTw: nothing outside a cell)', async () => {
    const d = new Document(await readDocx(await tblDocx(p(r('a')) +
      COLS2.replace('<w:sectPr>', '<w:sectPr>')), {}));
    const L = new DocLayout(d.doc, tm());
    const sel = car(d, 'a', 1);
    assert.equal(layoutTw(d.doc, L, sel.head), undefined);
    assert.ok(insertTable(d, sel, {cols: 2, rows: 1,
      textTw: layoutTw(d.doc, L, sel.head)}));
    assert.deepEqual(tableIn(d).grid, [2076, 2077]);
    assert.equal(sum(tableIn(d).grid), 4153);
  });
  it('a landscape second section: the table is that section\'s ' +
    'width', async () => {
    const d = new Document(await readDocx(await tblDocx(p(r('one')) +
      `<w:p><w:pPr>${COLS2.replace(/<w:cols[^>]*>/, '')}</w:pPr></w:p>` +
      p(r('two')) + LAND), {}));
    assert.equal(d.doc.sections.length, 2);
    assert.ok(insertTable(d, car(d, 'two', 3), {cols: 3, rows: 1}));
    assert.equal(sum(tableIn(d).grid), 13958);
  });
  it('a gutter at the top (settings gutterAtTop): not taken off the ' +
    'width, as the galley shows it (P1 fix M1)', async () => {
    const GUT = COLS2.replace(/<w:cols[^>]*>/, '')
      .replace('w:gutter="0"', 'w:gutter="720"');
    for (const [settings, want] of [['<w:gutterAtTop/>', 9026],
      ['<w:gutterAtTop w:val="0"/>', 9026 - 720], [undefined,
        9026 - 720]]) {
      const d = new Document(await readDocx(await tblDocx(p(r('a')) +
        GUT, {settings})), {});
      const L = new DocLayout(d.doc, tm());
      L.layout(1000);
      assert.ok(insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1}));
      assert.equal(sum(tableIn(d).grid), want, String(settings));
      assert.equal(Math.round(L.items[0].w * 15), want);
    }
  });
  it('in a cell layoutTw is the layout\'s cell text width', async () => {
    const d = new Document(await readDocx(await tblDocx(p(r('x')) +
      tbl([tr([tc(p(r('in cell'))), tc(p(r('b')))])]) + p()), {}));
    const L = new DocLayout(d.doc, tm());
    const tw = layoutTw(d.doc, L, car(d, 'in cell', 0).head);
    assert.ok(tw > 0 && tw < 2000, String(tw));
  });
  it('a Strict document: lint, xmllint and read back clean', async () => {
    const bytes = await tblDocx(p(r('start')) + p(r('end')),
      {strict: true});
    const change = async (d) => {
      assert.ok(insertTable(d, car(d, 'start', 5), {cols: 3, rows: 2}));
      return {};
    };
    const res = await roundTrip(bytes, 'strict insert', hash('sins'),
      change, {xsd, read: {}});
    assert.ok(!res.refused);
  });
  it('32767 rows is the command\'s cap: taken; 32768 refused', () => {
    const d = mk(['a']);
    const n = d.undoDepth;
    assert.equal(insertTable(d, car(d, 'a', 1), {cols: 1,
      rows: MAX_ROWS + 1}), null);
    assert.equal(d.undoDepth, n);
    assert.ok(insertTable(d, car(d, 'a', 1), {cols: 1, rows: MAX_ROWS}));
    assert.equal(top(d)[1].rows.length, 32767);
    assert.equal(d.undoDepth, n + 1);
  });
  it('another default table style: no Normal Table added, Table Grid ' +
    'based on it, one default', () => {
    const d = mk(['a']);
    const mine = {id: 'Plain', name: 'Plain Table', type: 'table',
      isDefault: true, pPr: {extra: []}, rPr: {extra: []}, extra: [],
      raw: null};
    d.doc.styles.styles.set('Plain', mine);
    d.doc.styles.defaults = {...d.doc.styles.defaults, table: 'Plain'};
    insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1});
    const st = d.doc.styles;
    assert.ok(!st.styles.has('TableNormal'));
    assert.equal(st.styles.get('TableGrid').basedOn, 'Plain');
    assert.equal(st.defaults.table, 'Plain');
    assert.equal([...st.styles.values()].filter((x) => x.type ===
      'table' && x.isDefault).length, 1);
  });
  it('a TableNormal that is no table style is never Table Grid\'s ' +
    'base', () => {
    const d = mk(['a']);
    d.doc.styles.styles.set('TableNormal', {id: 'TableNormal',
      name: 'Normal Table', type: 'paragraph', pPr: {extra: []},
      rPr: {extra: []}, extra: [], raw: null});
    insertTable(d, car(d, 'a', 1), {cols: 2, rows: 1});
    const g = d.doc.styles.styles.get('TableGrid');
    assert.equal(g.type, 'table');
    assert.equal(g.basedOn, undefined);
    assert.equal(d.doc.styles.styles.get('TableNormal').type,
      'paragraph', 'kept as it was');
  });
  it('in a list item: the cells copy its pPr, numPr too (TB9)',
    async () => {
      const d = mk(['item']);
      const q = top(d)[0];
      d.doc.sections[0].blocks[0] = {...q, pPr: {...q.pPr,
        numPr: {ilvl: 0, numId: 1}}};
      assert.ok(insertTable(d, car(d, 'item', 4), {cols: 2, rows: 1}));
      const t = top(d)[1];
      for (const c of t.rows[0].cells) {
        assert.deepEqual(c.blocks[0].pPr.numPr, {ilvl: 0, numId: 1});
      }
    });
});
