// Tables out to other programs (Batch C6.3, D28): ClipHtmlTable
// writes a table block as <table> with <tr><td> (colspan from
// gridSpan, rowspan from vMerge), widths in pt, cell shading and a
// 1px solid border where the cell has one; nested tables nested;
// the plain text a row per line, cells joined by tabs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {tableHtml, tablePlain}
  from '../../tools/moreapps/!Word/ClipHtmlTable';
import {readTree} from '../../tools/moreapps/!Word/ClipRead';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, modelTable, freeze, TABLE_NORMAL,
  TABLE_GRID} from './tbl-fixtures.mjs';
import {parseHtml} from './html-fake.mjs';

const TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol',
  'li', 'b', 'i', 'u', 's', 'sup', 'sub', 'span', 'br', 'a', 'table',
  'tr', 'td']);
const tops = (d) => d.doc.sections.flatMap((s) => s.blocks);
const all = (d) => {
  const bs = tops(d), last = bs[bs.length - 1];
  return S.select({id: blockId(bs[0]), off: 0}, {id: blockId(last),
    off: last.type === 'p' ? last.text.length : 1});
};
const open = async (body, o) => new Document(await readDocx(
  await tblDocx(body, o)));
const SHD = '<w:shd w:val="clear" w:color="auto" w:fill="FF0000"/>';
const BOX = '<w:tcBorders><w:top w:val="single" w:sz="4" ' +
  'w:space="0" w:color="auto"/></w:tcBorders>';
const MERGED = tbl([
  tr([tc(p(r('a')), {tcPr: '<w:gridSpan w:val="2"/>'})]),
  tr([tc(p(r('b')), {tcPr: '<w:vMerge w:val="restart"/>' + SHD}),
    tc(p(r('x &lt; y &amp; z')), {tcPr: BOX})]),
  tr([tc(p(), {tcPr: '<w:vMerge/>'}), tc([p(r('d1')), p(r('d2'))])]),
], {grid: [2000, 3000]});

/** Every tag in s is whitelisted; returns the tag names. */
function tagsOf(s) {
  const out = [];
  for (const m of s.matchAll(/<\/?([a-zA-Z0-9]+)/g)) {
    assert.ok(TAGS.has(m[1]), 'tag ' + m[1]);
    out.push(m[1]);
  }
  return out;
}
const tds = (h) => [...h.matchAll(/<td([^>]*)>/g)].map((m) => m[1]);

describe('ClipHtmlTable: HTML of a table block', () => {
  it('a gridSpan is colspan, a vMerge rowspan; a continue cell is ' +
    'not written; widths in pt; shading; escaped text', async () => {
    const d = await open(p(r('before')) + MERGED + p(r('after')));
    const s = slice(d.doc, all(d));
    const h = toHtml(d.doc, s);
    const tags = tagsOf(h);
    assert.equal(tags.filter((t) => t === 'table').length, 2);
    assert.match(h, /^<p[^>]*>before<\/p><table style="border-collapse:collapse;width:250pt">/);
    assert.match(h, /<\/table><p[^>]*>after<\/p>$/);
    const cells = tds(h);
    assert.equal(cells.length, 4);
    assert.match(cells[0], /^ colspan="2" style="width:250pt;/);
    assert.match(cells[1], /^ rowspan="2" style="width:100pt;/);
    assert.match(cells[1], /background-color:#FF0000/);
    assert.match(cells[2], /^ style="width:150pt;/);
    assert.match(cells[3], /^ style="width:150pt;/);
    assert.ok(h.includes('x &lt; y &amp; z'));
    assert.equal(h.split('<tr>').length - 1, 3);
    assert.ok(h.includes('>d1</p><p'), 'a cell\'s paragraphs');
  });
  it('a 1px solid border only where the cell has one: its own, ' +
    'the table\'s or its style\'s', async () => {
    const d = await open(MERGED);
    const h = toHtml(d.doc, slice(d.doc, all(d)));
    const b = tds(h).map((x) => /border:1px solid #000000/.test(x));
    assert.deepEqual(b, [false, false, true, false]);
    const bt = '<w:tblBorders><w:insideH w:val="single" w:sz="4"/>' +
      '</w:tblBorders>';
    const d2 = await open(tbl([tr([tc(p(r('a'))), tc(p(r('b')))]),
      tr([tc(p(r('c'))), tc(p(r('d')))])], {tblPr: bt}));
    const b2 = tds(toHtml(d2.doc, slice(d2.doc, all(d2))))
      .map((x) => /border:1px/.test(x));
    assert.deepEqual(b2, [true, true, true, true]);
    const d3 = await open(tbl([tr([tc(p(r('a')))])], {tblPr:
      '<w:tblStyle w:val="TableGrid"/>'}), {styles: TABLE_NORMAL +
      TABLE_GRID});
    assert.match(toHtml(d3.doc, slice(d3.doc, all(d3))),
      /<td style="[^"]*border:1px solid/);
    const nil = '<w:tcBorders><w:top w:val="nil"/></w:tcBorders>';
    const d4 = await open(tbl([tr([tc(p(r('a')), {tcPr: nil})])]));
    assert.doesNotMatch(toHtml(d4.doc, slice(d4.doc, all(d4))),
      /border:1px/);
  });
  it('a nested table is nested in its cell', async () => {
    const inner = tbl([tr([tc(p(r('in1'))), tc(p(r('in2')))])]);
    const d = await open(tbl([tr([tc([p(r('out')), inner, p()]),
      tc(p(r('z')))])]));
    const h = toHtml(d.doc, slice(d.doc, all(d)));
    tagsOf(h);
    assert.match(h, /<td[^>]*><p[^>]*>out<\/p><table[^>]*><tr><td[^>]*>/);
    assert.equal(tds(h).length, 4);
  });
  it('a link in a cell: text only unless urlOf gives a safe URL',
    async () => {
      const t = modelTable([['cell']]);
      const d = await open(p(r('x')));
      const link = {kind: 'raw', level: 'p', text: 'js',
        node: {name: 'w:hyperlink', attrs: [], children: []}};
      const cell = {...t.rows[0].cells[0], blocks: [{type: 'p',
        text: '￼', runs: [{start: 0, end: 1, rPr: {extra: []}}],
        inlines: {0: link}, pPr: {extra: []}}]};
      const b = {...t, rows: [{...t.rows[0], cells: [cell]}]};
      const s = {blocks: [b], ids: []};
      for (const u of ['javascript:alert(1)', 'data:text/html,x',
        'vbscript:x']) {
        const h = toHtml(d.doc, s, {urlOf: () => u});
        assert.ok(!h.includes('href'), u);
        assert.ok(h.includes('>js<'));
      }
      assert.ok(toHtml(d.doc, s, {urlOf: () => 'https://e.x/'})
        .includes('<a href="https://e.x/">js</a>'));
    });
  it('tableHtml: over the room left, null; the source unchanged',
    () => {
      const t = freeze(modelTable([['a', 'b'], ['c', 'd']]));
      const ctx = {cell: () => '<p>x</p>', skip: () => {}, styles: null,
        room: () => 1e9};
      const h = tableHtml(t, ctx);
      assert.equal(tds(h).length, 4);
      assert.equal(tableHtml(t, {...ctx, room: () => 40}), null);
      assert.equal(tableHtml(t, {...ctx, cell: () => null}), null);
    });
  it('a 1000 x 63 table: written under 5 s; over 2,000,000 units: ' +
    'null (plain text only)', async () => {
    const rows = Array.from({length: 1000}, (_, i) =>
      Array.from({length: 63}, (_, j) => `r${i}c${j}`));
    const t = modelTable(rows);
    const d = await open(p(r('x')));
    const t0 = Date.now();
    assert.equal(toHtml(d.doc, {blocks: [t], ids: []}), null);
    const h = toHtml(d.doc, {blocks: [t], ids: []}, {max: 1e8});
    assert.ok(Date.now() - t0 < 5000);
    assert.equal(tds(h).length, 63000);
  });
});

describe('ClipHtmlTable: plain text', () => {
  it('a row per line, cells by tabs, a cell\'s paragraphs by spaces',
    async () => {
      const d = await open(p(r('before')) + MERGED + p(r('after')));
      const s = slice(d.doc, all(d));
      assert.equal(s.plain, 'before\na\nb\tx < y & z\n\td1 d2\nafter');
      assert.equal(tablePlain(tops(d)[1]), 'a\nb\tx < y & z\n\td1 d2');
    });
  it('tabs and breaks in a cell are spaces; nested tables flattened',
    () => {
      const inner = modelTable([['i1', 'i2']]);
      const t = modelTable([[{blocks: ['a\tb', inner, '']}, 'c\nd']]);
      assert.equal(tablePlain(t), 'a b i1 i2 \tc d');
    });
});

describe('ClipHtmlTable: write -> parse -> read', () => {
  it('the table comes back: grid, spans, merges, text', async () => {
    const d = await open(MERGED);
    const h = toHtml(d.doc, slice(d.doc, all(d)));
    const back = readTree(parseHtml(h), undefined, {textTw: 9000});
    const t = back.blocks.find((b) => b.type === 'tbl');
    assert.ok(t);
    assert.deepEqual(t.grid, [2000, 3000]);
    const sp = t.rows.map((row) => row.cells.map((c) =>
      [c.tcPr.gridSpan ?? 1, c.tcPr.vMerge ?? '-',
        c.blocks.map((x) => x.text).join('|')]));
    assert.deepEqual(sp, [[[2, '-', 'a']],
      [[1, 'restart', 'b'], [1, '-', 'x < y & z']],
      [[1, 'continue', ''], [1, '-', 'd1|d2']]]);
    assert.equal(t.rows[1].cells[0].tcPr.shd.fill, 'FF0000');
    assert.ok(t.rows[1].cells[1].tcPr.tcBorders);
  });
});
