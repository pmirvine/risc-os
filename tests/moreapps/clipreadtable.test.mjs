// Tables in from other programs (Batch C6.3, D28): ClipReadTable
// with ClipRead makes a <table> a table block: rows from <tr> (any
// thead / tbody / tfoot), cells from <td> / <th>, colspan -> gridSpan,
// rowspan -> vMerge restart / continue cells, ragged rows filled,
// widths from width / style (px pt in %) else equal shares of the
// text width, <th> bold, background-color -> shd fill, a border
// style -> single 4 borders on that cell, <caption> a paragraph
// before it. Past a limit (63 columns, 1000 rows, depth 8, the cells
// of all tables, the node and text budget) a table is flattened as
// before, never cut. The HTML is untrusted: hostile input reads
// quickly and safely.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readHtml, readTree, LIMITS}
  from '../../tools/moreapps/!Word/ClipRead';
import {LIMITS as TL} from '../../tools/moreapps/!Word/ClipReadTable';
import {spanOf, lengthTw, TEXT_TW}
  from '../../tools/moreapps/!Word/ClipTblLook';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {walkBlocks} from '../../tools/moreapps/!Word/Walk';
import {gridOf} from '../../tools/moreapps/!Word/TblGrid';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {widthAt} from '../../tools/moreapps/!Word/TblInsert';
import {columnTw} from '../../tools/moreapps/!Word/SectWidth';
import {parseHtml, mkEl, mkText} from './html-fake.mjs';
import {modelTable} from './tbl-fixtures.mjs';
import {mk, C, blocks, undoable} from './edit-docs.mjs';

const read = (h, tw = 9000) => readHtml(h, parseHtml, {textTw: tw});
const kinds = (r) => r.blocks.map((b) => b.type);
const tblOf = (r) => r.blocks.find((b) => b.type === 'tbl');
const cellText = (c) => c.blocks.map((b) => (b.type === 'p' ? b.text
  : '#tbl')).join('|');
const texts = (t) => t.rows.map((row) => row.cells.map(cellText));
const X = {extra: []};
const SIDE = {val: 'single', sz: 4, space: 0, color: 'auto'};
const BOX = {top: SIDE, left: SIDE, bottom: SIDE, right: SIDE};
const dxa = (w) => ({w, type: 'dxa'});
const row = (n, cell = 'x') => '<tr>' + `<td>${cell}</td>`.repeat(n) +
  '</tr>';
/** Depth of nested tables in block list bs (0: none). */
function depthOf(bs) {
  let n = 0;
  for (const {b, at} of walkBlocks(bs)) {
    if (b.type === 'tbl') n = Math.max(n, (at.length + 2) / 3);
  }
  return n;
}
/** A paste of r's blocks into a fresh document: valid, one undo
 *  step that restores it exactly. */
function pasteOk(r) {
  const d = mk(['x']);
  const s = undoable(d, () => pasteBlocks(d, C(d, 0, 1), r.blocks,
    {sameDoc: false, styleNames: r.styleNames}));
  assert.ok(s);
  assert.equal(d.undoDepth, 1);
  for (const b of blocks(d)) checkBlock(b);
  return d;
}

describe('ClipReadTable: a table block', () => {
  it('thead / tbody, colspan, rowspan, th bold, widths, shading, ' +
    'borders', () => {
    const r = read('<p>before</p><table><thead><tr><th>H1</th>' +
      '<th colspan="2">H2</th></tr></thead><tbody><tr>' +
      '<td rowspan="2" width="50%">a</td>' +
      '<td style="width: 72pt; background-color: #ff0000">b</td>' +
      '<td style="border: 1px solid">c</td></tr>' +
      '<tr><td>d</td><td>e</td></tr></tbody></table><p>after</p>');
    assert.deepEqual(kinds(r), ['p', 'tbl', 'p']);
    const t = tblOf(r);
    assert.deepEqual(t.grid, [4500, 1440, 3060]);
    assert.deepEqual(texts(t), [['H1', 'H2'], ['a', 'b', 'c'],
      ['', 'd', 'e']]);
    const pr = t.rows.map((row) => row.cells.map((c) => c.tcPr));
    assert.deepEqual(pr, [
      [{tcW: dxa(4500), extra: []},
        {tcW: dxa(4500), gridSpan: 2, extra: []}],
      [{tcW: dxa(4500), vMerge: 'restart', extra: []},
        {tcW: dxa(1440), shd: {val: 'clear', color: 'auto',
          fill: 'FF0000'}, extra: []},
        {tcW: dxa(3060), tcBorders: BOX, extra: []}],
      [{tcW: dxa(4500), vMerge: 'continue', extra: []},
        {tcW: dxa(1440), extra: []}, {tcW: dxa(3060), extra: []}]]);
    assert.deepEqual(t.rows[0].cells[0].blocks[0].runs[0].rPr,
      {b: true, extra: []});
    assert.equal(t.rows[1].cells[0].blocks[0].runs[0].rPr.b,
      undefined);
    assert.deepEqual(t.tblPr, {tblW: {w: 0, type: 'auto'}, extra: []});
    for (const row of t.rows) {
      assert.deepEqual(row.trPr, X);
      assert.deepEqual([row.attrs, row.lead, row.tail, row.tblPrEx],
        [[], [], [], null]);
    }
    assert.deepEqual([t.attrs, t.gridAttrs, t.tail], [[], [], []]);
    assert.ok(!('id' in t));
    const g = gridOf(t);
    assert.equal(g.rows[2].cells[0].cont, true);
    pasteOk(r);
  });
  it('no widths: equal shares of the text width; the default text ' +
    'width without one', () => {
    assert.deepEqual(tblOf(read('<table>' + row(3) + '</table>', 9000))
      .grid, [3000, 3000, 3000]);
    assert.deepEqual(tblOf(readHtml('<table>' + row(2) + '</table>',
      parseHtml)).grid, [TEXT_TW / 2, TEXT_TW / 2]);
    const t = tblOf(read('<table style="width:6in"><tr><td>a</td>' +
      '<td style="width:2in">b</td></tr></table>'));
    assert.deepEqual(t.grid, [5760, 2880]);
    const px = tblOf(read('<table><tr><td width="100">a</td>' +
      '<td style="width:100px">b</td><td width="200px">c</td></tr>' +
      '</table>'));
    assert.deepEqual(px.grid, [1500, 1500, 3000]);
  });
  it('lengths and spans: anything not understood reads as nothing / 1',
    () => {
      for (const v of ['0', '64', 'abc', '1e9', '65535', '-1', '1.5',
        '', null, '__proto__', ' 99 ', '2x'])
        assert.equal(spanOf(v), 1, String(v));
      assert.equal(spanOf(' 2 '), 2);
      assert.equal(spanOf('63'), 63);
      assert.equal(lengthTw('72pt', 9000), 1440);
      assert.equal(lengthTw('1in', 9000), 1440);
      assert.equal(lengthTw('10px', 9000), 150);
      assert.equal(lengthTw('50%', 9000), 4500);
      assert.equal(lengthTw('100', 9000, true), 1500);
      for (const v of ['100', '3cm', 'expression(1)', '-5pt', 'NaN',
        '1e9pt', '0pt', 'calc(1px)', ''])
        assert.equal(lengthTw(v, 9000), undefined, v);
      assert.equal(lengthTw('99999in', 9000), 31680);
    });
  it('ragged rows are filled with empty cells; overlapping spans ' +
    'shrink', () => {
    const t = tblOf(read('<table><tr><td>a</td></tr><tr><td>b</td>' +
      '<td>c</td><td>d</td></tr><tr></tr></table>'));
    assert.deepEqual(texts(t), [['a', '', ''], ['b', 'c', 'd'],
      ['', '', '']]);
    const o = tblOf(read('<table><tr><td>a</td><td rowspan="2">b' +
      '</td></tr><tr><td colspan="3">c</td></tr></table>'));
    const g = gridOf(o);
    assert.equal(g.cols, 2);
    assert.deepEqual(texts(o), [['a', 'b'], ['c', '']]);
    assert.equal(o.rows[1].cells[0].tcPr.gridSpan, undefined);
    assert.equal(o.rows[1].cells[1].tcPr.vMerge, 'continue');
    const rs = tblOf(read('<table><tr><td rowspan="9">a</td><td>b</td>' +
      '</tr><tr><td>c</td></tr></table>'));
    assert.deepEqual(texts(rs), [['a', 'b'], ['', 'c']]);
    pasteOk(read('<table><tr><td>a</td></tr><tr><td>b</td><td>c</td>' +
      '</tr></table>'));
  });
  it('a caption is a paragraph before the table; an empty cell and a ' +
    'cell ending with a table end with a paragraph', () => {
    const r = read('<table><caption>Cap</caption><tr><td></td><td>' +
      '<table><tr><td>in</td></tr></table></td></tr></table>');
    assert.deepEqual(kinds(r), ['p', 'tbl']);
    assert.equal(r.blocks[0].text, 'Cap');
    const t = tblOf(r);
    assert.deepEqual(texts(t), [['', '#tbl|']]);
    assert.deepEqual(t.rows[0].cells[0].blocks[0], {type: 'p', text: '',
      runs: [], inlines: {}, pPr: {extra: []}});
    pasteOk(r);
  });
  it('cell content: paragraphs, runs, line breaks, alignment', () => {
    const t = tblOf(read('<table><tr><td style="text-align:center">' +
      '<p>one <b>two</b></p><p>three<br>four</p></td></tr></table>'));
    const bs = t.rows[0].cells[0].blocks;
    assert.deepEqual(bs.map((b) => b.text), ['one two', 'three\nfour']);
    assert.equal(bs[0].pPr.jc, 'center');
    assert.deepEqual(bs[0].runs.map((x) => x.rPr.b ?? false),
      [false, true]);
  });
  it('table border attribute: every cell bordered unless the cell ' +
    'says none', () => {
    const t = tblOf(read('<table border="1"><tr><td>a</td>' +
      '<td style="border:none">b</td></tr></table>'));
    assert.deepEqual(t.rows[0].cells.map((c) => !!c.tcPr.tcBorders),
      [true, false]);
    const n = tblOf(read('<table border="0"><tr><td>a</td>' +
      '<td style="border: 0px solid">b</td></tr></table>'));
    assert.deepEqual(n.rows[0].cells.map((c) => !!c.tcPr.tcBorders),
      [false, false]);
  });
});

describe('ClipReadTable: the text width where it is pasted', () => {
  it('ClipPick passes textTw to the reader', () => {
    const r = pick({text: 'a b', html: '<table><tr><td>a</td><td>b</td>' +
      '</tr></table>'}, {parseHtml, textTw: 6000});
    assert.equal(r.route, 'html');
    assert.deepEqual(r.blocks[0].grid, [3000, 3000]);
  });
  it('TblInsert.widthAt: the section\'s column, a cell\'s width less ' +
    'its margins; undefined outside the document', () => {
    const d = mk(['x', modelTable([['a', 'b']], {grid: [3000, 4000]}),
      'y']);
    const bs = blocks(d);
    assert.equal(widthAt(d.doc, null, {id: bs[0].id, off: 0}),
      Math.floor(columnTw(d.doc.sections[0].props)));
    const cell = bs[1].rows[0].cells[1].blocks[0];
    assert.equal(widthAt(d.doc, null, {id: cell.id, off: 0}), 3784);
    assert.equal(widthAt(d.doc, null, {id: -5, off: 0}), undefined);
    assert.equal(widthAt(d.doc, null, null), undefined);
  });
});

describe('ClipReadTable: other programs\' HTML', () => {
  it('Word: mso styles and classes ignored, borders, shading, widths',
    () => {
      const h = '<html xmlns:o="urn:schemas-microsoft-com:office:office">' +
        '<head><style>td {mso-foo: bar}</style></head><body lang=EN-GB>' +
        '<!--StartFragment--><table class=MsoTableGrid border=1 ' +
        'cellspacing=0 cellpadding=0 style=\'border-collapse:collapse;' +
        'border:none;mso-border-alt:solid windowtext .5pt;mso-yfti-tbllook:' +
        '1184;mso-padding-alt:0cm 5.4pt 0cm 5.4pt\'><tr style=\'mso-yfti-' +
        'irow:0;mso-yfti-firstrow:yes\'><td width=301 valign=top ' +
        'style=\'width:225.4pt;border:solid windowtext 1.0pt;mso-border-' +
        'alt:solid windowtext .5pt;background:#FFC000;padding:0cm 5.4pt ' +
        '0cm 5.4pt\'><p class=MsoNormal><b>Name<o:p></o:p></b></p></td>' +
        '<td width=301 valign=top style=\'width:225.4pt;border:solid ' +
        'windowtext 1.0pt;border-left:none;mso-border-left-alt:solid ' +
        'windowtext .5pt;padding:0cm 5.4pt 0cm 5.4pt\'><p class=MsoNormal>' +
        'Qty<o:p></o:p></p></td></tr></table><p class=MsoNormal><o:p>' +
        '&nbsp;</o:p></p><!--EndFragment--></body></html>';
      const r = read(h);
      const t = tblOf(r);
      assert.deepEqual(t.grid, [4508, 4508]);
      assert.deepEqual(texts(t), [['Name', 'Qty']]);
      const c = t.rows[0].cells;
      assert.equal(c[0].tcPr.shd.fill, 'FFC000');
      assert.deepEqual(c.map((x) => x.tcPr.tcBorders), [BOX, BOX]);
      assert.equal(c[0].blocks[0].runs[0].rPr.b, true);
      pasteOk(r);
    });
  it('Google Docs: the guid wrapper, cell borders and colours', () => {
    const h = '<meta charset="utf-8"><b style="font-weight:normal;" ' +
      'id="docs-internal-guid-1234"><div dir="ltr" style="margin-left:' +
      '0pt;" align="left"><table style="border:none;border-collapse:' +
      'collapse;"><colgroup><col width="301" /><col width="301" />' +
      '</colgroup><tbody><tr style="height:0pt"><td style="border-left:' +
      'solid #000000 1pt;border-right:solid #000000 1pt;border-bottom:' +
      'solid #000000 1pt;border-top:solid #000000 1pt;vertical-align:' +
      'top;background-color:#cfe2f3;padding:5pt 5pt 5pt 5pt;overflow:' +
      'hidden;overflow-wrap:break-word;"><p dir="ltr" style="line-' +
      'height:1.2;margin-top:0pt;margin-bottom:0pt;"><span style="font-' +
      'size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:' +
      '400;">one</span></p></td><td style="border-left:solid #000000 ' +
      '1pt;"><p dir="ltr"><span style="font-weight:700;">two</span></p>' +
      '</td></tr></tbody></table></div></b>';
    const t = tblOf(read(h));
    assert.deepEqual(texts(t), [['one', 'two']]);
    assert.equal(t.rows[0].cells[0].tcPr.shd.fill, 'CFE2F3');
    assert.deepEqual(t.rows[0].cells[1].tcPr.tcBorders, BOX);
    assert.ok(!t.rows[0].cells[0].blocks[0].runs[0].rPr.b);
    assert.equal(t.rows[0].cells[1].blocks[0].runs[0].rPr.b, true);
  });
  it('LibreOffice Calc and Excel: text and a table', () => {
    const lo = '<table cellspacing="0" border="0"><colgroup width="85">' +
      '</colgroup><tr><td style="border-top: 1px solid #000000" ' +
      'height="17" align="left" bgcolor="#FFFF00">A1</td><td align=' +
      '"right" sdval="2" sdnum="2057;">2</td></tr><tr><td height="17" ' +
      'align="left">A2</td><td align="right" sdval="3">3</td></tr>' +
      '</table>';
    const t = tblOf(read(lo));
    assert.deepEqual(texts(t), [['A1', '2'], ['A2', '3']]);
    assert.equal(t.rows[0].cells[0].tcPr.shd.fill, 'FFFF00');
    assert.deepEqual(t.rows[0].cells[0].tcPr.tcBorders, BOX);
    const xl = '<html><head><style>.xl65 {color:red}</style></head>' +
      '<body><!--StartFragment--><table border=0 cellpadding=0 ' +
      'cellspacing=0 width=128 style=\'border-collapse:collapse;width:' +
      '96pt\'><col width=64 span=2 style=\'width:48pt\'><tr height=20 ' +
      'style=\'height:15.0pt\'><td height=20 class=xl65 width=64 ' +
      'style=\'height:15.0pt;width:48pt\'>1</td><td class=xl65 width=64 ' +
      'style=\'width:48pt\'>two</td></tr><!--EndFragment--></table>' +
      '</body></html>';
    const x = tblOf(read(xl));
    assert.deepEqual(texts(x), [['1', 'two']]);
    assert.deepEqual(x.grid, [960, 960]);
  });
});

describe('ClipReadTable: limits (flattened, never cut)', () => {
  it('63 columns type; 64 columns are flattened (a paragraph per row)',
    () => {
      assert.equal(tblOf(read('<table>' + row(63) + '</table>')).grid
        .length, 63);
      const r = read('<table>' + row(64) + row(2, 'y') + '</table>');
      assert.deepEqual(kinds(r), ['p', 'p']);
      assert.equal(r.blocks[0].text, Array(64).fill('x').join('\t'));
      const c = read('<table><tr><td colspan="40">a</td>' +
        '<td colspan="30">b</td></tr></table>');
      assert.deepEqual(kinds(c), ['p']);
      assert.equal(c.blocks[0].text, 'a\tb');
    });
  it('1000 rows type; 1001 rows are flattened', () => {
    const t = tblOf(read('<table>' + row(2).repeat(1000) + '</table>'));
    assert.equal(t.rows.length, 1000);
    const r = read('<table>' + row(2).repeat(TL.rows + 1) + '</table>');
    assert.equal(r.blocks.length, 1001);
    assert.deepEqual(new Set(kinds(r)), new Set(['p']));
  });
  it('depth 8 types; the table at depth 9 is flattened in its cell',
    () => {
      let h = '<table><tr><td>deep</td><td>z</td></tr></table>';
      for (let k = 0; k < 8; k++) h = `<table><tr><td>${h}</td></tr></table>`;
      const r = read(h);
      assert.equal(depthOf(r.blocks), TL.depth);
      let t = tblOf(r);
      for (let k = 1; k < 8; k++) t = t.rows[0].cells[0].blocks[0];
      assert.deepEqual(texts(t), [['deep\tz']]);
      pasteOk(r);
    });
  it('a 100,000-node table within the node limit: flattened whole',
    () => {
      const n = 49990;
      const cells = Array.from({length: n}, () => mkEl('td',
        [mkText('x')]));
      const t0 = Date.now();
      const r = readTree(mkEl('table', [mkEl('tr', cells)]),
        undefined, {textTw: 9000});
      assert.ok(Date.now() - t0 < 5000);
      assert.deepEqual(kinds(r), ['p']);
      assert.equal(r.blocks[0].text.split('\t').length, n);
    });
  it('a table past the nodes left: flattened (the walk then stops at ' +
    'the node cap as before), never a table cut short', () => {
      const kids = Array.from({length: 100000}, () => mkText('y'));
      const big = mkEl('td', [mkEl('span', kids), mkEl('span', kids)]);
      const r = readTree(mkEl('div', [mkEl('table', [mkEl('tr',
        [mkEl('td', [mkText('a')]), big])])]));
      assert.ok(!r.blocks.some((b) => b.type === 'tbl'));
      assert.ok(r.blocks[0].text.startsWith('a\tyyy'));
    });
  it('the cells of all tables: 63,000 type, the rest flattened', () => {
    const one = '<table>' + row(63, '').repeat(1000) + '</table>';
    const t0 = Date.now();
    const r = read(one + one);
    assert.ok(Date.now() - t0 < 10000, 'quick');
    assert.equal(r.blocks.filter((b) => b.type === 'tbl').length, 1);
    assert.equal(TL.cells, 63000);
  });
});

describe('ClipReadTable: hostile HTML', () => {
  it('huge spans: colspan / rowspan 65535 read as 1', () => {
    const t = tblOf(read('<table><tr><td colspan="65535" ' +
      'rowspan="65535">a</td><td>b</td></tr></table>'));
    assert.deepEqual(texts(t), [['a', 'b']]);
    assert.deepEqual(t.grid.length, 2);
  });
  it('100,000 cells: within the caps, quickly, no table cut', () => {
    const h = '<table>' + row(50, 'c').repeat(2000) + '</table>';
    const t0 = Date.now();
    const r = read(h);
    assert.ok(Date.now() - t0 < 10000);
    assert.ok(!r.blocks.some((b) => b.type === 'tbl'), '2000 rows');
  });
  it('10,000 nested tables: 8 type, quickly', () => {
    const h = '<table><tr><td>'.repeat(10000) + 'core' +
      '</td></tr></table>'.repeat(10000);
    const t0 = Date.now();
    const r = read(h);
    assert.ok(Date.now() - t0 < 10000);
    assert.ok(depthOf(r.blocks) <= TL.depth);
    assert.ok(r.blocks.length >= 1);
  });
  it('1,000,000 children of a row (not an array): the look at rows ' +
    'and cells stops at the node budget, quickly', () => {
    const kids = new Proxy({length: 1000000}, {get: (o, k) => (k ===
      'length' ? o.length : k === '0' ? mkEl('td', [mkText('a')])
        : mkText(' '))});
    const t0 = Date.now();
    const r = readTree(mkEl('table', [mkEl('tr', kids)]));
    assert.ok(Date.now() - t0 < 5000);
    assert.ok(!r.blocks.some((b) => b.type === 'tbl'));
    assert.equal(r.blocks[0].text, 'a');
  });
  it('unclosed and stray tags do not throw', () => {
    for (const h of ['<table><tr><td>a<td>b<tr><td>c',
      '<table><tr><td>a</td>stray<td>b</td></tr></table>',
      '<table><div>x</div><tr><td>a</td></tr></table>',
      '</td></tr><td>z', '<tr><td>no table</td></tr>',
      '<table></table>', '<table><tr></tr></table>',
      '<table><tbody></tbody></table>']) {
      const r = read(h);
      if (r) pasteOk(r);
    }
    const s = read('<table><tr><td>a</td>stray<td>b</td></tr></table>');
    assert.deepEqual(kinds(s), ['p']);
    assert.equal(read('<table></table>'), null);
  });
  it('scripts, event handlers, javascript: and data: URLs, CSS ' +
    'expressions: text only, nothing kept', () => {
    const r = read('<table onload="x()"><tr onclick="y()"><td ' +
      'onmouseover="z()" style="background:url(javascript:alert(1));' +
      'width:expression(alert(2));border:1px solid url(data:x)">' +
      '<script>evil()</script><a href="javascript:alert(3)">js</a> ' +
      '<img src="data:image/png;base64,AAAA" onerror="w()"></td>' +
      '<td style="background-color:expression(1)" bgcolor="javascript:x">' +
      '<style>td{x:y}</style>ok</td></tr></table>');
    const t = tblOf(r);
    assert.deepEqual(texts(t), [['js', 'ok']]);
    const json = JSON.stringify(r.blocks);
    assert.doesNotMatch(json, /evil|alert|javascript|data:|onload|url/);
    for (const c of t.rows[0].cells) {
      assert.equal(c.tcPr.shd, undefined);
      assert.equal(c.tcPr.tcBorders, undefined);
    }
    assert.deepEqual(t.grid, [4500, 4500]);
  });
  it('billion laughs style repetition: entities are text, quickly', () => {
    const h = '<!DOCTYPE x [<!ENTITY lol "lol"><!ENTITY lol2 ' +
      '"&lol;&lol;">]><table><tr><td>&lol2;</td></tr></table>' +
      '<table><tr><td>a</td></tr></table>'.repeat(20000);
    const t0 = Date.now();
    const r = read(h);
    assert.ok(Date.now() - t0 < 10000);
    assert.equal(texts(tblOf(r))[0][0], '&lol2;');
    assert.ok(r.blocks.length <= 20002);
  });
  it('5 MB of HTML is not read (the plain text instead)', () => {
    const h = '<table>' + row(5, 'abcdefgh').repeat(60000) + '</table>';
    assert.ok(h.length > 5000000);
    const t0 = Date.now();
    assert.equal(read(h), null);
    assert.ok(Date.now() - t0 < 1000);
    assert.ok(LIMITS.html < h.length);
  });
  it('__proto__ and constructor as attributes and names', () => {
    const r = read('<table __proto__="x"><tr><td colspan="__proto__" ' +
      'constructor="1" style="__proto__:1;width:__proto__">a</td></tr>' +
      '</table>');
    assert.deepEqual(texts(tblOf(r)), [['a']]);
    assert.equal({}.polluted, undefined);
  });
});
