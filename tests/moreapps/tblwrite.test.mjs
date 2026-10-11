// TblWriteProps and TblWrite: typed tables written back (D12, D13,
// D14b, R22), WriteBody's 'tbl' block, Batch C1.3.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {rootScope, strictScope} from '../../tools/moreapps/!Word/Ns';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {tblPrNode, trPrNode, tcPrNode}
  from '../../tools/moreapps/!Word/TblWriteProps';
import {tblNode} from '../../tools/moreapps/!Word/TblWrite';
import {pBdrNode, sidesNode}
  from '../../tools/moreapps/!Word/WritePropsMore';
import {SIDES} from '../../tools/moreapps/!Word/ReadPropsMore';
import {readTblPr, readTrPr, readTcPr}
  from '../../tools/moreapps/!Word/TblProps';
import {buildDocx, documentXml, p, r, W_NS} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, nestedTable, freeze, tableXml}
  from './tbl-fixtures.mjs';
import {assertSameDoc, expectedBack, xmlEntries}
  from './docx-compare.mjs';
import {canonTbl, firstDiff} from './tbl-canon.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const ROOT = ` xmlns:w14="${W14}"`;
const isEl = (c) => typeof c === 'object' && c.name !== undefined;

const docx = (body, strict) => strict ? tblDocx(body, {strict: true})
  : buildDocx({'word/document.xml': documentXml(body,
    {rootAttrs: ROOT})});
const open = async (body, strict) => readDocx(await docx(body, strict));

/** The body's w:tbl elements of bytes, and the scope they are in. */
async function bodyTables(bytes) {
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  const body = root.children.find((c) => isEl(c) && c.name === 'w:body');
  return {tables: body.children.filter((c) => isEl(c) &&
    c.name === 'w:tbl'), map: rootScope(root)};
}

/**
 * write -> read gives the same document (canon: ids by flow order),
 * and every written w:tbl equals the file's after canonTbl.
 */
async function roundTrip(body, strict) {
  const bytes = await docx(body, strict);
  const doc = await readDocx(bytes);
  const out = await write(doc);
  const back = await readDocx(out);
  assertSameDoc(back, expectedBack(doc), 'write -> read');
  if (!strict) {
    const a = await bodyTables(bytes), b = await bodyTables(out);
    assert.equal(b.tables.length, a.tables.length);
    a.tables.forEach((t, i) => {
      const d = firstDiff(canonTbl(b.tables[i], b.map),
        canonTbl(t, a.map));
      assert.equal(d, null, 'table ' + i);
    });
  }
  return {doc, back, out};
}

const typedOf = (doc) => doc.sections[0].blocks.filter((b) =>
  b.type === 'tbl');

const BS = '<w:bookmarkStart w:id="1" w:name="b"/>';
const BE = '<w:bookmarkEnd w:id="1"/>';
const one = (cell = tc()) => tbl([tr([cell])]);
const side = (n, more = '') =>
  `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="auto"${more}/>`;
const SIX = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];

// A 2x2 as Word writes it (no white space, Word's attribute order)
const WORD_2X2 = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>' +
  '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" ' +
  'w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" ' +
  'w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>' +
  '<w:gridCol w:w="4675"/><w:gridCol w:w="4675"/></w:tblGrid>' +
  [0, 1].map((i) => `<w:tr w:rsidR="00A${i}" ` +
  `w14:paraId="1A2B3C4${i}" w14:textId="77777777" w:rsidTr="00B${i}">` +
  (i ? '<w:tblPrEx><w:tblBorders><w:top w:val="nil"/></w:tblBorders>' +
    '</w:tblPrEx><w:trPr><w:trHeight w:val="400" w:hRule="exact"/>' +
    '</w:trPr>' : '') +
  [0, 1].map((j) => '<w:tc><w:tcPr><w:tcW w:w="4675" w:type="dxa"/>' +
    `</w:tcPr><w:p w:rsidR="00C" w14:paraId="0000000${j}">` +
    `<w:r><w:t>${i}${j}</w:t></w:r></w:p></w:tc>`).join('') +
  '</w:tr>').join('') + '</w:tbl>';

// every field TblProps reads
const ALL_TBLPR = '<w:tblStyle w:val="TableGrid"/>' +
  '<w:bidiVisual/><w:tblStyleRowBandSize w:val="1"/>' +
  '<w:tblStyleColBandSize w:val="2"/><w:tblW w:w="50%" w:type="pct"/>' +
  '<w:jc w:val="center"/><w:tblCellSpacing w:w="10" w:type="dxa"/>' +
  '<w:tblInd w:w="-108" w:type="dxa"/><w:tblBorders>' +
  SIX.map((n) => side(n)).join('') + '</w:tblBorders>' +
  '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>' +
  '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" ' +
  'w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" ' +
  'w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>' +
  '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" ' +
  'w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const ALL_TRPR = '<w:gridBefore w:val="1"/><w:gridAfter w:val="1"/>' +
  '<w:wBefore w:w="100" w:type="dxa"/><w:wAfter w:w="0" ' +
  'w:type="auto"/><w:cantSplit/><w:trHeight w:val="397" ' +
  'w:hRule="atLeast"/><w:tblHeader w:val="0"/><w:tblCellSpacing ' +
  'w:w="10" w:type="dxa"/><w:jc w:val="center"/><w:hidden/>';
const ALL_TCPR = '<w:tcW w:w="2500" w:type="pct"/>' +
  '<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/><w:tcBorders>' +
  [...SIX, 'tl2br', 'tr2bl'].map((n) => side(n, n === 'tl2br'
    ? ' w:shadow="1" w:frame="0"' : '')).join('') + '</w:tcBorders>' +
  '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:noWrap/>' +
  '<w:tcMar><w:left w:w="0" w:type="dxa"/></w:tcMar>' +
  '<w:textDirection w:val="btLr"/><w:tcFitText/>' +
  '<w:vAlign w:val="center"/><w:hideMark/>';

describe('TblWrite: write -> read gives the same tables', () => {
  it('a Word-shaped 2x2, with tblPrEx and a row trPr', async () => {
    const {doc} = await roundTrip(WORD_2X2);
    assert.equal(typedOf(doc).length, 1);
  });

  it('every field of tblPr, trPr and tcPr', async () => {
    const x = tbl([tr([tc(p(r('a')), {tcPr: ALL_TCPR}), tc()],
      {trPr: ALL_TRPR}), tr([tc(p(), {tcPr: '<w:vMerge/>' +
      '<w:tcW w:w="0" w:type="nil"/>'}), tc()])], {tblPr: ALL_TBLPR,
      grid: [2000, 2000, 2000, 2000]});
    const {doc} = await roundTrip(x);
    const [t] = typedOf(doc);
    assert.equal(t.tblPr.extra.length, 0);
    assert.equal(t.rows[0].trPr.extra.length, 0);
    assert.equal(t.rows[0].cells[0].tcPr.extra.length, 0);
    assert.equal(Object.keys(t.tblPr).length, 14);
    assert.equal(Object.keys(t.rows[0].trPr).length, 11);
    assert.equal(Object.keys(t.rows[0].cells[0].tcPr).length, 12);
    assert.equal(t.rows[1].cells[0].tcPr.vMerge, 'continue');
  });

  it('marks in all four places', async () => {
    const x = tbl([tr([tc(), tc(p(), {lead: BS})], {tail: BE}),
      tr([tc()], {lead: BS}), tr([tc()])]).replace('</w:tbl>',
      BE + '</w:tbl>');
    const {doc} = await roundTrip(x);
    const [t] = typedOf(doc);
    assert.equal(t.tail.length, 1);
    assert.equal(t.rows[1].lead.length, 1);
  });

  it('an Opaque cell block, a nested table; a cell ending with a ' +
    'table: the whole table kept Opaque, written as it was', async () => {
    const x = tbl([tr([tc('<w:sdt><w:sdtContent>' + p(r('s')) +
      '</w:sdtContent></w:sdt>'), tc(p(r('a')) + one(tc(p(r('in')))) +
      p())])]);
    const {doc} = await roundTrip(x);
    const c = typedOf(doc)[0].rows[0].cells;
    assert.equal(c[0].blocks[0].type, 'opaque');
    assert.deepEqual(c[1].blocks.map((b) => b.type), ['p', 'tbl', 'p']);
    // (C3 fix wave: reason tail; no paragraph added after the table)
    const y = tbl([tr([tc(p()), tc(p() + one())])]);
    const {doc: d2, out} = await roundTrip(y);
    assert.deepEqual(d2.sections[0].blocks.map((b) => b.type),
      ['opaque']);
    const w = (await bodyTables(out)).tables[0];
    const tc2 = w.children.filter(isEl)[2].children.filter(isEl)[1];
    assert.deepEqual(tc2.children.filter(isEl).map((n) => n.name),
      ['w:p', 'w:tbl']);
  });

  it('nested 8 deep, the 9th kept Opaque in its cell', async () => {
    await roundTrip(nestedTable(9));
  });

  it('attributes of w:tbl, w:tblGrid, w:tr, w:tc kept in order',
    async () => {
      const x = tbl([tr(['<w:tc w:b="2" w:a="1">' + p() + '</w:tc>'],
        {attrs: ' w:rsidR="1" w14:paraId="2"'})],
      {tblAttrs: ' w:z="1" w14:a="2"'}).replace('<w:tblGrid>',
        '<w:tblGrid w:y="1" w:x="2">');
      const {out} = await roundTrip(x);
      const t = (await bodyTables(out)).tables[0];
      assert.deepEqual(t.attrs, [['w:z', '1'], ['w14:a', '2']]);
      const [, grid, row] = t.children.filter(isEl);
      assert.deepEqual(grid.attrs, [['w:y', '1'], ['w:x', '2']]);
      assert.deepEqual(row.attrs, [['w:rsidR', '1'], ['w14:paraId', '2']]);
      assert.deepEqual(row.children.filter(isEl)[0].attrs,
        [['w:b', '2'], ['w:a', '1']]);
    });
});

describe('TblWrite: the written XML', () => {
  it('a Word-shaped 2x2 is written exactly as Word wrote it',
    async () => {
      const doc = await open(WORD_2X2);
      const [t] = await tableXml(doc);
      assert.equal(serialize(t), WORD_2X2);
    });

  it('tblNode: tblPr, tblGrid, tr; trPr after tblPrEx; tcPr first',
    async () => {
      const doc = await open(WORD_2X2);
      const t = freeze(typedOf(doc)[0]);
      const map = rootScope(parseXml(`<w:document xmlns:w="${W_NS}"/>`)
        .root);
      const n = tblNode(t, map);
      assert.deepEqual(n.children.map((c) => c.name), ['w:tblPr',
        'w:tblGrid', 'w:tr', 'w:tr']);
      assert.deepEqual(n.children[3].children.map((c) => c.name),
        ['w:tblPrEx', 'w:trPr', 'w:tc', 'w:tc']);
      assert.deepEqual(n.children[2].children[0].children.map((c) =>
        c.name), ['w:tcPr', 'w:p']);
      // the very tblPrEx node, written as it was read
      assert.equal(n.children[3].children[0], t.rows[1].tblPrEx);
    });

  it('empty trPr / tcPr are not written; tblPr always is', async () => {
    const doc = await open(tbl([tr([tc(p(), {tcPr: ' '})],
      {trPr: ' '})]));
    const [t] = await tableXml(doc);
    assert.equal(serialize(t), '<w:tbl><w:tblPr/><w:tblGrid>' +
      '<w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc>' +
      '</w:tr></w:tbl>');
    const map = new Map();
    assert.equal(serialize(tblPrNode({extra: []}, map)), '<w:tblPr/>');
    assert.equal(trPrNode({extra: []}, map), null);
    assert.equal(tcPrNode({extra: []}, map), null);
  });

  it('extra children out of schema order: written in order and read ' +
    'back in that order', async () => {
    const x = tbl([tr([tc(p(), {tcPr: '<w:headers/><w:vAlign ' +
      'w:val="top"/><w:cnfStyle w:val="100000000000"/>'})],
    {trPr: '<w:jc w:val="left"/><w:cnfStyle w:val="1"/>'})],
    {tblPr: '<w:tblCaption w:val="c"/><w:tblpPr w:leftFromText="1"/>' +
      '<w:tblStyle w:val="T"/>'});
    const {back} = await roundTrip(x);
    const [t] = typedOf(back);
    assert.deepEqual(t.tblPr.extra.map((n) => n.name), ['w:tblpPr',
      'w:tblCaption']);
    assert.deepEqual(t.rows[0].trPr.extra.map((n) => n.name),
      ['w:cnfStyle']);
    assert.deepEqual(t.rows[0].cells[0].tcPr.extra.map((n) => n.name),
      ['w:cnfStyle', 'w:headers']);
    const [w] = await tableXml(back);
    const tblPr = w.children[0];
    assert.deepEqual(tblPr.children.map((c) => c.name), ['w:tblStyle',
      'w:tblpPr', 'w:tblCaption']);
  });

  it('a section ending with a table gets the carrier paragraph',
    async () => {
      // read: section 0 is 'a' (its break), section 1 a table and 'b';
      // the model then moves the table to the end of section 0
      const body = p(r('a'), '<w:sectPr/>');
      const doc = await open(body + one(tc(p(r('t')))) + p(r('b')));
      const s0 = doc.sections[0];
      const t = doc.sections[1].blocks[0];
      assert.equal(t.type, 'tbl');
      const moved = {...doc, sections: [{...s0, blocks: [...s0.blocks,
        t]}, {...doc.sections[1], blocks: doc.sections[1].blocks
        .slice(1)}]};
      const out = await write(moved);
      const back = await readDocx(out);
      assertSameDoc(back, expectedBack(moved), 'carrier');
      const b0 = back.sections[0].blocks;
      assert.deepEqual(b0.map((b) => b.type), ['p', 'tbl', 'p']);
      assert.equal(b0[2].text, '');
    });

  it('no sectPr in a cell paragraph ever', async () => {
    const doc = await open(one(tc(p(r('x')))));
    const t = typedOf(doc)[0];
    const xml = serialize(tblNode(t, new Map()));
    assert.ok(!xml.includes('sectPr'));
  });
});

describe('TblWriteProps: Strict names (R22)', () => {
  it('a Strict document\'s table writes w:start / w:end and reads ' +
    'back equal', async () => {
    const bdr = `<w:tblBorders>${side('start')}${side('end')}` +
      '</w:tblBorders>';
    const mar = '<w:tblCellMar><w:start w:w="5" w:type="dxa"/>' +
      '<w:end w:w="6" w:type="dxa"/></w:tblCellMar>';
    const tcp = '<w:tcBorders>' + side('end') + side('tl2br') +
      '</w:tcBorders><w:tcMar><w:start w:w="1" w:type="dxa"/></w:tcMar>';
    const x = tbl([tr([tc(p(r('s')), {tcPr: tcp})])],
      {tblPr: bdr + mar + '<w:jc w:val="start"/>'});
    const {doc, out} = await roundTrip(x, true);
    const [t] = typedOf(doc);
    assert.deepEqual(Object.keys(t.tblPr.tblBorders), ['left', 'right']);
    assert.equal(t.tblPr.jc, 'start');
    assert.equal(t.tblPr.extra.length, 0);
    const xml = new TextDecoder().decode((await readZip(out))
      .get('word/document.xml'));
    assert.ok(xml.includes('<w:tblBorders><w:start '), xml);
    assert.ok(xml.includes('<w:end w:w="6" w:type="dxa"/>'));
    assert.ok(xml.includes('<w:tcMar><w:start w:w="1"'));
    assert.ok(!/<w:(left|right) /.test(xml));
  });

  it('the Strict scope picks the names', () => {
    const v = {extra: [], tblCellMar: {left: {w: 1, type: 'dxa'}},
      tblBorders: {right: {val: 'single'}}};
    const wm = new Map([['w', W_NS]]);
    const s = serialize(tblPrNode(v, strictScope(wm)));
    assert.equal(s, '<w:tblPr><w:tblBorders><w:end w:val="single"/>' +
      '</w:tblBorders><w:tblCellMar><w:start w:w="1" w:type="dxa"/>' +
      '</w:tblCellMar></w:tblPr>');
    assert.equal(serialize(tblPrNode(v, wm)), s
      .replace('w:end', 'w:right').replace('w:start', 'w:left'));
  });
});

describe('TblWriteProps: fields written read back equal', () => {
  const parse = (name, inner) => {
    const root = parseXml(`<w:${name} xmlns:w="${W_NS}">${inner}` +
      `</w:${name}>`).root;
    return {node: root, map: rootScope(root)};
  };
  const cases = [['tblPr', ALL_TBLPR, readTblPr, tblPrNode],
    ['trPr', ALL_TRPR, readTrPr, trPrNode],
    ['tcPr', ALL_TCPR, readTcPr, tcPrNode]];
  for (const [name, xml, read, make] of cases) {
    it(name, () => {
      const {node, map} = parse(name, xml);
      const v = read(node, map);
      const n = make(v, map);
      const again = read(parseXml(serialize({...n, attrs:
        [['xmlns:w', W_NS]]})).root, map);
      assert.deepEqual(again, v);
      // Word's own order and spelling: the very XML
      assert.equal(serialize(n), `<w:${name}>${xml}</w:${name}>`);
    });
  }
});

describe('TblProps: a field only when written back as it was', () => {
  const parse = (name, inner) => {
    const root = parseXml(`<w:${name} xmlns:w="${W_NS}">${inner}` +
      `</w:${name}>`).root;
    return {node: root, map: rootScope(root)};
  };
  const READ = {tblPr: readTblPr, trPr: readTrPr, tcPr: readTcPr};
  const raw = [['tcPr', '<w:shd w:fill="auto" w:val="clear"/>'],
    ['tblPr', '<w:bidiVisual w:val="1"/>'],
    ['trPr', '<w:cantSplit w:val="true"/>'],
    ['tcPr', '<w:noWrap w:val="on"/>'],
    ['tcPr', '<w:tcW w:type="dxa" w:w="5"/>'],
    ['tblPr', '<w:tblLook w:firstRow="true"/>'],
    ['tblPr', '<w:tblLook w:firstRow="1" w:val="04A0"/>'],
    ['tblPr', '<w:tblBorders>' + side('left') + side('top') +
      '</w:tblBorders>'],
    ['tblPr', '<w:tblBorders><w:top w:sz="4" w:val="single"/>' +
      '</w:tblBorders>'],
    ['tcPr', '<w:tcBorders><w:top w:val="single" w:shadow="true"/>' +
      '</w:tcBorders>'],
    ['tcPr', '<w:tcMar><w:left w:w="0" w:type="dxa"/><w:top w:w="0" ' +
      'w:type="dxa"/></w:tcMar>'],
    ['trPr', '<w:trHeight w:hRule="exact" w:val="5"/>']];
  for (const [kind, xml] of raw) {
    it(`${kind} ${xml} stays raw and is written as it was`, async () => {
      const {node, map} = parse(kind, xml);
      const v = READ[kind](node, map);
      assert.deepEqual(Object.keys(v), ['extra'], xml);
      const x = kind === 'tblPr' ? tbl([tr([tc()])], {tblPr: xml})
        : kind === 'trPr' ? tbl([tr([tc()], {trPr: xml})])
          : tbl([tr([tc(p(), {tcPr: xml})])]);
      const doc = await open(x);
      assert.equal(typedOf(doc).length, 1);
      const [t] = await tableXml(doc);
      assert.ok(serialize(t).includes(xml), serialize(t));
    });
  }

  it('white space between sides is no difference', () => {
    const {node, map} = parse('tblPr', '<w:tblBorders>\n  ' +
      side('top') + '\n  ' + side('left') + '\n</w:tblBorders>');
    assert.deepEqual(Object.keys(readTblPr(node, map)),
      ['extra', 'tblBorders']);
  });

  it('vMerge w:val="continue" is read (R2), and written <w:vMerge/>',
    async () => {
      const x = tbl([tr([tc(p(), {tcPr: '<w:vMerge w:val="restart"/>'})]),
        tr([tc(p(), {tcPr: '<w:vMerge w:val="continue"/>'})])]);
      const doc = await open(x);
      const [t] = typedOf(doc);
      assert.equal(t.rows[1].cells[0].tcPr.vMerge, 'continue');
      const [w] = await tableXml(doc);
      assert.ok(serialize(w).includes('<w:tcPr><w:vMerge/></w:tcPr>'));
    });
});

describe('TblWriteProps: a bad model is refused', () => {
  const map = new Map();
  const bad = (f) => assert.throws(f, (e) => e instanceof DocxError &&
    e.code === 'bad-model');
  it('wrong types and unknown keys', () => {
    bad(() => tcPrNode({extra: [], gridSpan: '2'}, map));
    bad(() => tcPrNode({extra: [], vMerge: 'both'}, map));
    bad(() => tcPrNode({extra: [], tcW: {w: 1, type: 'bogus'}}, map));
    bad(() => tcPrNode({extra: [], tcW: {w: '50', type: 'dxa'}}, map));
    bad(() => tblPrNode({extra: [], tblLook: {val: 'xyz'}}, map));
    bad(() => tblPrNode({extra: [], tblBorders: {tl2br: {val: 'x'}}},
      map));
    bad(() => tblPrNode({extra: [], tblLayout: 'wide'}, map));
    bad(() => tblPrNode({extra: [], nonsense: 1}, map));
    bad(() => tblPrNode({extra: [], tblW: 5}, map));
    bad(() => tblPrNode(JSON.parse('{"extra": [], "__proto__": 1}'),
      map));
    bad(() => trPrNode({extra: [], trHeight: {val: -1}}, map));
    bad(() => trPrNode({extra: [], cantSplit: 'yes'}, map));
    bad(() => tblPrNode({extra: [], tblStyle: ''}, map));
    bad(() => tblPrNode({extra: [], tblW: {w: 1e400, type: 'dxa'}}, map));
    bad(() => tblPrNode({extra: [], tblW: {w: NaN, type: 'dxa'}}, map));
    bad(() => tcPrNode(null, map));
    bad(() => tcPrNode({extra: 'x'}, map));
    bad(() => trPrNode({extra: [], trHeight: {val: 31681}}, map));
  });

  it('a model with gridSpan \'2\' is refused by writeDocx', async () => {
    const doc = await open(one(tc(p(), {tcPr: '<w:gridSpan w:val="1"/>'})));
    const t = typedOf(doc)[0];
    const cell = t.rows[0].cells[0];
    const bad2 = {...t, rows: [{...t.rows[0], cells: [{...cell,
      tcPr: {...cell.tcPr, gridSpan: '2'}}]}]};
    const d2 = {...doc, sections: [{...doc.sections[0],
      blocks: [bad2]}]};
    await assert.rejects(write(d2), (e) => e instanceof DocxError &&
      e.code === 'bad-model');
  });
});

describe('WritePropsMore.sidesNode', () => {
  it('pBdrNode is sidesNode over SIDES (Strict-aware)', () => {
    const v = {top: {val: 'single', sz: 4}, left: {val: 'nil'},
      bar: {val: 'x'}};
    for (const strict of [false, true]) {
      assert.deepEqual(pBdrNode(v, strict),
        sidesNode('pBdr', SIDES, v, strict));
    }
    assert.equal(serialize(sidesNode('pBdr', SIDES, v, true)),
      '<w:pBdr><w:top w:val="single" w:sz="4"/><w:start w:val="nil"/>' +
      '<w:bar w:val="x"/></w:pBdr>');
    assert.equal(sidesNode('tblBorders', SIDES, {tl2br: {val: 'x'}}),
      null);
  });
});
