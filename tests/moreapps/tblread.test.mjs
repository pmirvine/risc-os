// TblRead: w:tbl -> a typed Table or an Opaque reason (D11, R2, R3,
// R4, R9, R23), and ReadBody's switch and shared paragraph cap,
// Batch C1.2.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope, scope} from '../../tools/moreapps/!Word/Ns';
import {readTable, MARKS, countPara}
  from '../../tools/moreapps/!Word/TblRead';
import {readBody} from '../../tools/moreapps/!Word/ReadBody';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {DocxError} from '../../tools/moreapps/!Word/DocxError';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {p, r, W_NS} from './build-docx.mjs';
import {tbl, tr, tc, TBL_OPAQUE, tblDocx, bigTable, nestedTable}
  from './tbl-fixtures.mjs';

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const NSA = `xmlns:w="${W_NS}" xmlns:w14="${W14}" xmlns:mc="${MC}"`;
const isEl = (c) => typeof c === 'object' && c.name !== undefined;

/** Parse a w:tbl string inside a w:body; {node, map}. */
function parseTbl(xml) {
  const body = parseXml(`<w:body ${NSA}>${xml}</w:body>`).root;
  return {node: body.children.find(isEl),
    map: scope(rootScope(body), body)};
}
const read = (xml, ctx) => {
  const {node, map} = parseTbl(xml);
  return readTable(node, map, ctx);
};
/** The typed table of xml (fails when it is Opaque). */
function typed(xml) {
  const got = read(xml);
  assert.ok(got.table, 'Opaque: ' + got.opaque);
  checkBlock(got.table);
  return got.table;
}
const reason = (xml) => read(xml).opaque;
const text = (b) => b.type === 'p' ? b.text : '<' + b.type + '>';

const BS = '<w:bookmarkStart w:id="1" w:name="b"/>';
const BE = '<w:bookmarkEnd w:id="1"/>';
const g1 = '<w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>';
const one = (cell = tc()) => tbl([tr([cell])]);

const WORD_2X2 = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>' +
  '<w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" ' +
  'w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" ' +
  'w:noHBand="0" w:noVBand="1"/></w:tblPr>\n' +
  '<w:tblGrid w:x="1"><w:gridCol w:w="4675"/><w:gridCol w:w="4675"/>' +
  '</w:tblGrid>' + [0, 1].map((i) => `<w:tr w:rsidR="00A${i}" ` +
  `w14:paraId="1A2B3C4${i}" w14:textId="77777777" w:rsidTr="00B${i}">` +
  (i ? '<w:tblPrEx><w:tblBorders/></w:tblPrEx>' : '') +
  [0, 1].map((j) => `<w:tc><w:tcPr><w:tcW w:w="4675" w:type="dxa"/>` +
    `</w:tcPr><w:p w:rsidR="00C" w14:paraId="0000000${j}">` +
    `<w:r><w:t>${i}${j}</w:t></w:r></w:p></w:tc>`).join('') +
  '</w:tr>').join('') + '</w:tbl>';

describe('TblRead: typed tables', () => {
  it('a Word-shaped 2x2 types', () => {
    const t = typed(WORD_2X2);
    assert.equal(t.type, 'tbl');
    assert.ok(Number.isInteger(t.id));
    assert.deepEqual(t.grid, [4675, 4675]);
    assert.deepEqual(t.gridAttrs, [['w:x', '1']]);
    assert.deepEqual(t.attrs, []);
    assert.equal(t.tblPr.tblStyle, 'TableGrid');
    assert.deepEqual(t.tblPr.tblW, {w: 0, type: 'auto'});
    assert.equal(t.rows.length, 2);
    assert.deepEqual(t.rows[0].attrs, [['w:rsidR', '00A0'],
      ['w14:paraId', '1A2B3C40'], ['w14:textId', '77777777'],
      ['w:rsidTr', '00B0']]);
    assert.equal(t.rows[0].tblPrEx, null);
    assert.equal(t.rows[1].tblPrEx.name, 'w:tblPrEx');
    assert.equal(t.rows[1].tblPrEx.children[0].name, 'w:tblBorders');
    assert.deepEqual(t.rows.map((row) => row.cells.map((c) =>
      c.blocks.map(text).join())), [['00', '01'], ['10', '11']]);
    const c = t.rows[1].cells[1];
    assert.deepEqual(c.tcPr, {extra: [], tcW: {w: 4675, type: 'dxa'}});
    assert.deepEqual(c.attrs, []);
    assert.deepEqual(c.lead, []);
    assert.deepEqual(c.blocks[0].extraP, [['w:rsidR', '00C'],
      ['w14:paraId', '00000001']]);
    assert.deepEqual(t.rows[0].trPr, {extra: []});
    assert.deepEqual([t.rows[0].lead, t.rows[0].tail, t.tail],
      [[], [], []]);
  });

  it('attributes of w:tbl and w:tc kept in order', () => {
    const t = typed(tbl([tr(['<w:tc w:b="2" w:a="1">' + p() +
      '</w:tc>'])], {tblAttrs: ' w:z="1" w14:a="2"'}));
    assert.deepEqual(t.attrs, [['w:z', '1'], ['w14:a', '2']]);
    assert.deepEqual(t.rows[0].cells[0].attrs, [['w:b', '2'],
      ['w:a', '1']]);
  });

  it('a nested 1x1 in a cell types; ids are unique', () => {
    const t = typed(tbl([tr([tc(p(r('a')) + one(tc(p(r('in')))) +
      p())])]));
    const blocks = t.rows[0].cells[0].blocks;
    assert.deepEqual(blocks.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(blocks[1].rows[0].cells[0].blocks[0].text, 'in');
    const ids = [t.id, blocks[0].id, blocks[1].id, blocks[2].id,
      blocks[1].rows[0].cells[0].blocks[0].id];
    assert.equal(new Set(ids).size, 5);
  });

  it('marks: row lead / tail, cell lead, table tail', () => {
    const t = typed(tbl([tr([tc(), tc(p(), {lead: BS})], {tail: BE}),
      tr([tc()], {lead: BS}), tr([tc()])]) .replace('</w:tbl>',
      BE + '</w:tbl>'));
    assert.equal(t.rows[0].cells[1].lead[0].name, 'w:bookmarkStart');
    assert.equal(t.rows[0].tail[0].name, 'w:bookmarkEnd');
    assert.equal(t.rows[1].lead[0].name, 'w:bookmarkStart');
    assert.equal(t.tail[0].name, 'w:bookmarkEnd');
    assert.deepEqual([t.rows[0].lead, t.rows[2].lead, t.rows[2].tail],
      [[], [], []]);
  });

  it('every MARKS name may sit between rows', () => {
    assert.equal(MARKS.size, 11);
    for (const n of MARKS) {
      const m = `<w:${n} w:id="1"/>`;
      const t = typed(tbl([tr([tc(p(), {lead: m})], {tail: m}),
        tr([tc()], {lead: m})]));
      assert.equal(t.rows[1].lead[0].name, 'w:' + n);
    }
  });

  it('a mark directly in w:tc is an Opaque cell block', () => {
    const t = typed(one(tc(BS + p())));
    const b = t.rows[0].cells[0].blocks;
    assert.equal(b[0].type, 'opaque');
    assert.equal(b[0].node.name, 'w:bookmarkStart');
    assert.equal(b[1].type, 'p');
  });

  it('other cell blocks: an sdt, a raw paragraph, a nested table ' +
    '(a cell ENDING with one: reason tail, below)', () => {
    const t = typed(tbl([tr([tc('<w:sdt><w:sdtContent>' + p() +
      '</w:sdtContent></w:sdt>'), tc('<w:p><w:pPr w:x="1"/></w:p>'),
    tc(p() + one() + p())])]));
    const c = t.rows[0].cells;
    assert.equal(c[0].blocks[0].type, 'opaque');
    assert.equal(c[1].blocks[0].type, 'opaque');
    assert.deepEqual(c[2].blocks.map((b) => b.type), ['p', 'tbl', 'p']);
  });

  it('ragged rows and a vMerge continue in the first row type', () => {
    const t = typed(tbl([tr([tc(), tc(), tc()]), tr([tc()])]));
    assert.deepEqual(t.rows.map((x) => x.cells.length), [3, 1]);
    const v = typed(tbl([tr([tc(p(), {tcPr: '<w:vMerge/>'})]),
      tr([tc(p(), {tcPr: '<w:vMerge w:val="restart"/>'})])]));
    assert.equal(v.rows[0].cells[0].tcPr.vMerge, 'continue');
  });

  it('white space is dropped; xmlns on rows and cells is honoured', () => {
    const x = `<w:tbl>\n <w:tblPr/>\n ${g1}\n <x:tr xmlns:x="${W_NS}">` +
      `<x:tc>${p()}</x:tc></x:tr>\n</w:tbl>`;
    assert.equal(typed(x).rows.length, 1);
  });
});

describe('TblRead: Opaque reasons (R3)', () => {
  const cases = {
    tracked: [
      tbl([tr([tc()])], {tblPr: '<w:tblPrChange w:id="1"/>'}),
      tbl([tr([tc()], {trPr: '<w:trPrChange w:id="1"/>'})]),
      one(tc(p(), {tcPr: '<w:tcPrChange w:id="1"/>'})),
      tbl([tr([tc()])]).replace('</w:tblGrid>',
        '<w:tblGridChange w:id="1"/></w:tblGrid>'),
      one(tc(p(), {tcPr: '<w:cellIns w:id="1"/>'})),
      one(tc(p(), {tcPr: '<w:cellDel w:id="1"/>'})),
      one(tc(p(), {tcPr: '<w:cellMerge w:id="1"/>'})),
      tbl([tr([tc()], {trPr: '<w:ins w:id="1"/>'})]),
      tbl([tr([tc()], {trPr: '<w:del w:id="1"/>'})]),
      // tracked wins over everything else found
      tbl([tr([tc()], {trPr: '<w:del w:id="1"/>'})]).replace('</w:tbl>',
        'x</w:tbl>'),
    ],
    wrapped: [
      tbl(['<w:sdt><w:sdtContent>' + tr([tc()]) +
        '</w:sdtContent></w:sdt>']),
      tbl([tr(['<w:customXml w:element="c">' + tc() +
        '</w:customXml>'])]),
      tbl([tr([tc()]), '<mc:AlternateContent><mc:Choice Requires="w14">' +
        tr([tc()]) + '</mc:Choice></mc:AlternateContent>']),
      tbl(['<w:ins w:id="1">' + tr([tc()]) + '</w:ins>']),
      tbl([tr([tc(), '<w:del w:id="1">' + tc() + '</w:del>'])]),
      tbl([tr([tc()]), '<w:moveTo w:id="1">' + tr([tc()]) +
        '</w:moveTo>']),
    ],
    hMerge: [one(tc(p(), {tcPr: '<w:hMerge w:val="restart"/>'}))],
    grid: [
      TBL_OPAQUE,
      tbl([tr([tc()])]).replace('</w:tblGrid>', '</w:tblGrid>' + g1),
      tbl([tr([tc()])], {grid: [-1]}),
      tbl([tr([tc()])], {grid: [31681]}),
      tbl([tr([tc()])], {grid: ['12.5']}),
      tbl([tr([tc()])], {grid: ['1" w:type="dxa']}),
      tbl([tr([tc()])]).replace(/<w:gridCol[^>]*>/, '<w:gridCol/>'),
      tbl([tr([tc()])]).replace(/<w:gridCol[^>]*>/, ''),
      tbl([tr([tc()])]).replace('</w:tblGrid>', '<w:foo/></w:tblGrid>'),
      bigTable(1, 64),
    ],
    span: [
      ...['0', '64', '-1', '1000000000', 'x'].map((v) =>
        one(tc(p(), {tcPr: `<w:gridSpan w:val="${v}"/>`}))),
      one(tc(p(), {tcPr: '<w:vMerge w:val="both"/>'})),
      one(tc(p(), {tcPr: '<w:gridSpan w:val="1"/><w:gridSpan ' +
        'w:val="1"/>'})),
      tbl([tr([tc()], {trPr: '<w:gridBefore w:val="64"/>'})]),
      tbl([tr([tc()], {trPr: '<w:gridAfter w:val="-1"/>'})]),
    ],
    sectPr: [one(tc(p('', '<w:sectPr/>')))],
    propAttrs: [
      one(tc(p(), {tcPr: ''}).replace('<w:tc>',
        '<w:tc><w:tcPr w:rsid="1"/>')),
      tbl([tr([tc()])]).replace('<w:tblPr>', '<w:tblPr w:a="1">'),
      tbl([tr(['<w:trPr w:a="1"/>' + tc()])]),
    ],
    order: [
      tbl([tr([tc()])]).replace(/<w:tblPr>(.*)<\/w:tblPr>(<w:tblGrid>.*<\/w:tblGrid>)/,
        '$2<w:tblPr>$1</w:tblPr>'),
      tbl([tr([tc(), '<w:trPr/>'])]),
      one(tc(p(), {tcPr: '<w:noWrap/>'}).replace('</w:tc>',
        '<w:tcPr/></w:tc>')),
      one(tc(p(), {tcPr: '<w:noWrap/>'}).replace('<w:tc>',
        '<w:tc><w:tcPr/>')),
      tbl([tr([tc()])]).replace('</w:tblPr>', '</w:tblPr><w:tblPr/>'),
      tbl([tr(['<w:trPr/><w:tblPrEx/>' + tc()])]),
      tbl([tr(['<w:tblPrEx/><w:tblPrEx/>' + tc()])]),
      tbl([tr([BS + '<w:trPr/>' + tc()])]),
      tbl([tr([tc()])]).replace('<w:tblGrid>', BS + '<w:tblGrid>'),
      tbl([tr([tc()])]).replace('<w:tblPr></w:tblPr>', ''),
    ],
    stray: [
      tbl([tr(['x' + tc()])]),
      tbl([tr([tc()])]).replace('</w:tbl>', '<!-- c --></w:tbl>'),
      tbl([tr([tc()])]).replace('</w:tbl>', '<w:foo/></w:tbl>'),
      tbl([tr([tc() + '<w14:foo/>'])]),
      one(tc(p() + 'x')),
      one(tc(p() + '<!-- c -->')),
    ],
    empty: [
      tbl([], {grid: [2000]}),
      tbl([tr([tc()]), tr([], {tail: BS + BE})]),
      one('<w:tc><w:tcPr/></w:tc>'),
      one('<w:tc/>'),
    ],
  };
  for (const [why, list] of Object.entries(cases)) {
    it(why, () => {
      list.forEach((x, k) => assert.equal(reason(x), why, why + ' #' + k +
        ': ' + x));
    });
  }
});

/** n nested 1x1 tables as nodes (not XML: past the parser's depth). */
function nestNodes(n) {
  const el = (name, attrs = [], children = []) => ({name, attrs,
    children});
  const para = (s) => el('w:p', [], [el('w:r', [], [el('w:t', [], [s])])]);
  let inner = null;
  for (let d = n; d >= 1; d--) {
    const kids = [para('L' + d)];
    if (inner) kids.push(inner, el('w:p'));
    inner = el('w:tbl', [], [el('w:tblPr'), el('w:tblGrid', [],
      [el('w:gridCol', [['w:w', '2000']])]), el('w:tr', [],
      [el('w:tc', [], kids)])]);
  }
  return inner;
}

/** Down `n` levels of the first cell's table; the cell's blocks. */
function down(t, n) {
  for (let k = 1; k < n; k++) t = t.rows[0].cells[0].blocks[1];
  return t;
}

describe('TblRead: depth', () => {
  const notes = [];
  it('nestedTable(9): the depth-8 table types, the 9th is Opaque', () => {
    const t = typed(nestedTable(9));
    const t8 = down(t, 8);
    assert.equal(t8.type, 'tbl');
    assert.equal(t8.rows[0].cells[0].blocks[0].text, 'L8');
    const b = t8.rows[0].cells[0].blocks[1];
    assert.equal(b.type, 'opaque');
    assert.equal(b.node.name, 'w:tbl');
    // counted under `depth`
    read(nestedTable(9), {note: (why) => notes.push(why)});
    assert.deepEqual(notes, ['depth']);
  });

  it('200 deep: no stack overflow, the same shape', () => {
    const node = nestNodes(200);
    const got = readTable(node, new Map([['w', W_NS]]));
    assert.ok(got.table);
    checkBlock(got.table);
    const b = down(got.table, 8).rows[0].cells[0].blocks[1];
    assert.equal(b.type, 'opaque');
    let n = node;
    for (let k = 1; k < 9; k++) n = n.children[2].children[0].children[1];
    assert.equal(b.node, n);
  });

  it('a nested table kept Opaque leaves the outer one typed', () => {
    const t = typed(one(tc(p() + TBL_OPAQUE + p())));
    assert.equal(t.rows[0].cells[0].blocks[1].type, 'opaque');
  });
});

const body = (xml) => {
  const root = parseXml(`<w:document ${NSA}><w:body>${xml}</w:body>` +
    '</w:document>').root;
  const m = rootScope(root);
  return {b: root.children.find(isEl), m};
};
const PART = 'word/document.xml';
const capErr = (max) => (e) => e instanceof DocxError &&
  e.code === 'unsupported' && e.message === PART + ': more than ' +
  max + ' paragraphs';

describe('TblRead: hostile sizes and the shared paragraph cap', () => {
  it('10,000 rows type in < 2 s; 63 columns type; 64 do not',
    async () => {
      const z = await tblDocx(bigTable(10000, 1));
      const t0 = Date.now();
      const doc = await readDocx(z);
      const ms = Date.now() - t0;
      assert.ok(ms < 2000, 'took ' + ms + ' ms');
      assert.equal(doc.sections[0].blocks[0].rows.length, 10000);
      assert.equal(typed(bigTable(1, 63)).grid.length, 63);
      assert.equal(reason(bigTable(1, 64)), 'grid');
    });

  it('countPara throws the body\'s message past the cap', () => {
    const ctx = {count: {paras: 0}, max: 2, part: PART};
    countPara(ctx);
    countPara(ctx);
    assert.throws(() => countPara(ctx), capErr(2));
  });

  it('cells count against the body\'s cap (readBody)', () => {
    const opts = {maxParagraphs: 1000};
    const big = body(bigTable(1001, 1));
    assert.throws(() => readBody(big.b, big.m, opts, PART), capErr(1000));
    const mix = body(p().repeat(600) + bigTable(401, 1));
    assert.throws(() => readBody(mix.b, mix.m, opts, PART),
      capErr(1000));
    const ok = body(p().repeat(600) + bigTable(400, 1));
    const s = readBody(ok.b, ok.m, opts, PART).sections[0].blocks;
    assert.equal(s.length, 601);
    assert.equal(s[600].type, 'tbl');
  });

  it('readDocx: a 1001-cell table is refused with the body\'s message',
    async () => {
      const z = await tblDocx(bigTable(1001, 1));
      await assert.rejects(readDocx(z, {maxParagraphs: 1000}),
        capErr(1000));
      const y = await tblDocx(p().repeat(600) + bigTable(401, 1));
      await assert.rejects(readDocx(y, {maxParagraphs: 1000}),
        capErr(1000));
    });
});

describe('ReadBody: tables typed by default (R23, C1.7)', () => {
  const xml = p(r('a')) + WORD_2X2.replaceAll('w14:', 'w:') + TBL_OPAQUE + tbl([tr([tc()])]) +
    p(r('b'));
  it('the switch is gone: {tables: false} reads as the default',
    async () => {
      const z = await tblDocx(xml);
      const doc = await readDocx(z);
      const off = await readDocx(z, {tables: false});
      assert.deepEqual(off.sections[0].blocks.map((b) => b.type),
        ['p', 'tbl', 'opaque', 'tbl', 'p']);
      const strip = (d) => JSON.stringify(d.sections[0].blocks)
        .replace(/"id":\d+/g, '"id":0');
      assert.equal(strip(off), strip(doc));
    });

  it('the typable ones type; a refusal keeps the node',
    async () => {
      const z = await tblDocx(xml);
      const notes = [];
      const doc = await readDocx(z, {
        tableNote: (why) => notes.push(why)});
      const blocks = doc.sections[0].blocks;
      assert.deepEqual(blocks.map((b) => b.type), ['p', 'tbl', 'opaque',
        'tbl', 'p']);
      assert.equal(blocks[2].node.name, 'w:tbl');
      assert.deepEqual(notes, ['grid']);
      for (const b of blocks) checkBlock(b);
    });

  it('a Strict document\'s table reads its start / end names',
    async () => {
      const x = tbl([tr([tc()])], {tblPr: '<w:tblCellMar><w:start ' +
        'w:w="5" w:type="dxa"/></w:tblCellMar>'});
      const doc = await readDocx(await tblDocx(x, {strict: true}));
      assert.deepEqual(doc.sections[0].blocks[0].tblPr.tblCellMar,
        {left: {w: 5, type: 'dxa'}});
    });
});

describe('TblRead: a cell ending with a table (C3 fix wave, C3b I2)', () => {
  it('reason tail: the table stays Opaque (Word reads a w:tc that ' +
    'does not end with a w:p as unreadable; adding one would change ' +
    'the file)', () => {
    const inner = one(tc(p(r('n'))));
    assert.equal(reason(one(tc(p(r('a')) + inner))), 'tail');
    assert.equal(reason(one(tc(inner))), 'tail');
    assert.equal(reason(one(tc(p(r('a')) + TBL_OPAQUE))), 'tail');
    assert.equal(reason(one(tc(p(r('a')) + inner + p()))), undefined);
  });
  it('a nested table whose own cell ends with a table: that one is ' +
    'kept (an Opaque cell block), the outer table types', () => {
    const bad = one(tc(p(r('x')) + one(tc(p(r('y'))))));
    const t = typed(one(tc(p(r('a')) + bad + p(r('z')))));
    const bs = t.rows[0].cells[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['p', 'opaque', 'p']);
    const notes = [];
    read(one(tc(p(r('a')) + bad + p(r('z')))),
      {note: (why) => notes.push(why)});
    assert.deepEqual(notes, ['tail']);
  });
  it('a cell ending with a content control (w:sdt) still types (52 ' +
    'such cells in the corpus)', () => {
    const sdt = '<w:sdt><w:sdtContent>' + p(r('s')) +
      '</w:sdtContent></w:sdt>';
    const t = typed(one(tc(p(r('a')) + sdt)));
    assert.deepEqual(t.rows[0].cells[0].blocks.map((b) => b.type),
      ['p', 'opaque']);
  });
});
