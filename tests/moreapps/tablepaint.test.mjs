// Tables drawn (Batch C2.5, D21): on a fake 2D context that records
// its calls, in D21's order: the table's shading, each cell's shading
// (the style's / conditional, the cell's own over it; themed shown by
// the literal colour), the cells' items (paragraphs with their own
// borders and shading, nested tables; an exact row's cells clipped to
// their box), then the resolved borders (./TblBorders) and diagonals;
// a floating table's dashed outline; only the rows meeting the paint
// rectangle (it.painted), so a screen of a 1000-row table draws ~30
// rows; DocPaint hands a 'tbl' item to it (no grey box).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {paintTable} from '../../tools/moreapps/!Word/TablePaint';
import {paint} from '../../tools/moreapps/!Word/DocPaint';
import {loadStyles, tm} from './word-docs.mjs';
import {tblDocx, tbl, tr, tc, TABLE_NORMAL, GRID_TABLE_4, bigTable,
  nestedTable} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';

before(loadStyles);

/** A fake 2D context: every call and property set, in order. */
function fakeG() {
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const g = {calls};
  for (const k of ['strokeRect', 'fillRect', 'fillText', 'setLineDash',
    'save', 'restore', 'beginPath', 'rect', 'clip', 'moveTo', 'lineTo',
    'stroke']) g[k] = rec(k);
  g.measureText = (t) => ({width: 6 * t.length});
  for (const k of ['strokeStyle', 'fillStyle', 'font', 'lineWidth',
    'textBaseline']) {
    let v;
    Object.defineProperty(g, k, {get: () => v,
      set: (x) => { v = x; calls.push(['set ' + k, x]); }});
  }
  return g;
}
const named = (g, n) => g.calls.filter((c) => c[0] === n);
/** Each fillRect with the fillStyle in force: [style, x, y, w, h]. */
function fills(g) {
  let st = null;
  const out = [];
  for (const c of g.calls) {
    if (c[0] === 'set fillStyle') st = c[1];
    else if (c[0] === 'fillRect') out.push({at: g.calls.indexOf(c),
      style: st, x: c[1], y: c[2], w: c[3], h: c[4]});
  }
  return out;
}
const ALL = {x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6};
const R = Math.round;
/** A box (x, y, w, h) as fills draw it: its edges on whole pixels. */
const snap = (x, y, w, h) => [R(x), R(y), R(x + w) - R(x), R(y + h) - R(y)];
const isBox = (f, b) => f.x === b[0] && f.y === b[1] && f.w === b[2] &&
  f.h === b[3];

async function laid(body, styles) {
  const doc = await readDocx(await tblDocx(body, styles === undefined ? {}
    : {styles}));
  const L = new DocLayout(doc, tm());
  L.layout(800);
  return {L, it: L.items.find((x) => x.kind === 'tbl')};
}
const cell = (text, tcPr = '') => tc(p(r(text)), {tcPr});
const GT4 = '<w:tblStyle w:val="GridTable4"/><w:tblLook w:val="04A0" ' +
  'w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" ' +
  'w:noHBand="0" w:noVBand="1"/>';

describe('D21\'s order', () => {
  it('table shading, then cell shading, then text, then borders',
    async () => {
      const shd = '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>';
      const {L, it} = await laid(tbl([
        tr([cell('Head'), cell('Two')]),
        tr([cell('body'), cell('cell')]),
        tr([cell('more'), cell('rows')])], {tblPr: GT4 + shd}),
      TABLE_NORMAL + GRID_TABLE_4);
      const g = fakeG();
      paintTable(L, g, it, ALL);
      const f = fills(g);
      const texts = named(g, 'fillText').map((c) => g.calls.indexOf(c));
      assert.deepEqual(named(g, 'fillText').map((c) => c[1]),
        ['Head', 'Two', 'body', 'cell', 'more', 'rows']);
      // the table's shading first, under the whole table
      assert.equal(f[0].style, '#eeeeee');
      assert.ok(Math.abs(f[0].x - (it.x + it.left)) <= 0.5);
      assert.ok(Math.abs(f[0].w - it.width) <= 1);
      assert.ok(Math.abs(f[0].h - (it.rows[2].y + it.rows[2].h -
        it.rows[0].y)) < 1);
      // the header cells black (text1, themed), the band row CCCCCC
      const head = f.filter((x) => x.style === '#000000' &&
        x.at < texts[0]);
      assert.equal(head.length, 2);
      const c00 = it.rows[0].cells[0];
      assert.deepEqual([head[0].x, head[0].y, head[0].w, head[0].h],
        snap(c00.x, it.rows[0].y, c00.w, it.rows[0].h));
      assert.equal(head[0].x + head[0].w, head[1].x, 'no seam');
      assert.equal(f.filter((x) => x.style === '#cccccc').length, 2,
        'band1Horz: row 1 only');
      for (const x of f.filter((x) => x.at < texts[0])) {
        assert.ok(['#eeeeee', '#000000', '#cccccc'].includes(x.style));
      }
      // then the text, then the borders (none drawn before the text)
      const after = f.filter((x) => x.at > texts.at(-1));
      assert.ok(after.length >= 8, 'borders after the text');
      for (const x of after) {
        assert.ok(['#000000', '#666666'].includes(x.style), x.style);
      }
      // the header text is white (background1, themed)
      const white = g.calls.findIndex((c) => c[0] === 'set fillStyle' &&
        String(c[1]).toLowerCase() === '#ffffff');
      assert.ok(white >= 0 && white < texts[0]);
    });
  it('a cell\'s own shading over the style\'s; themed by its literal ' +
    'colour', async () => {
    const own = '<w:shd w:val="clear" w:color="auto" w:fill="00B050" ' +
      'w:themeFill="accent6"/>';
    const {L, it} = await laid(tbl([
      tr([cell('Head', own), cell('Two')]),
      tr([cell('body'), cell('cell')])], {tblPr: GT4}),
    TABLE_NORMAL + GRID_TABLE_4);
    const g = fakeG();
    paintTable(L, g, it, ALL);
    const f = fills(g);
    const c00 = it.rows[0].cells[0], c01 = it.rows[0].cells[1];
    const row = it.rows[0];
    const b0 = snap(c00.x, row.y, c00.w, row.h);
    const b1 = snap(c01.x, row.y, c01.w, row.h);
    assert.ok(f.some((x) => x.style === '#00b050' && isBox(x, b0)));
    assert.ok(!f.some((x) => x.style === '#000000' && isBox(x, b0)));
    assert.ok(f.some((x) => x.style === '#000000' && isBox(x, b1)));
  });
  it('a cell paragraph\'s own shading is drawn in the cell', async () => {
    const para = '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" ' +
      'w:fill="FFFF00"/></w:pPr><w:r><w:t>lit</w:t></w:r></w:p>';
    const {L, it} = await laid(tbl([tr([tc(para), cell('b')])]));
    const g = fakeG();
    paintTable(L, g, it, ALL);
    const y = fills(g).filter((x) => x.style === '#ffff00');
    assert.equal(y.length, 1);
    const c = it.rows[0].cells[0];
    assert.ok(y[0].x >= c.x - 1 && y[0].x + y[0].w <= c.x + c.w + 1);
  });
});

describe('clipping, merges, nesting, diagonals, floating', () => {
  it('an exact row\'s cell text is clipped to the cell box', async () => {
    const {L, it} = await laid(tbl([tr([cell('one two three four five ' +
      'six seven eight nine ten eleven twelve thirteen fourteen')],
    {trPr: '<w:trHeight w:val="300" w:hRule="exact"/>'}),
    tr([cell('b')])]));
    const g = fakeG();
    paintTable(L, g, it, ALL);
    const c = it.rows[0].cells[0];
    assert.equal(c.clip, true);
    const rc = named(g, 'rect');
    assert.ok(rc.some((x) => x[1] === c.x && x[2] === it.rows[0].y &&
      x[3] === c.w && x[4] === it.rows[0].h), JSON.stringify(rc));
    const iClip = g.calls.findIndex((x) => x[0] === 'clip');
    const iText = g.calls.findIndex((x) => x[0] === 'fillText');
    assert.ok(iClip >= 0 && iClip < iText);
    const iRestore = g.calls.findIndex((x, i) => i > iText &&
      x[0] === 'restore');
    const second = g.calls.findIndex((x) => x[0] === 'fillText' &&
      x[1] === 'b');
    assert.ok(iRestore < second, 'the next row not clipped');
  });
  it('a merged cell starting above the rect still draws its text ' +
    'that reaches into it', async () => {
    const tall = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'].map((t) => p(r(t)));
    const {L, it} = await laid(tbl([
      tr([tc(tall, {tcPr: '<w:vMerge w:val="restart"/>'}), cell('x')]),
      tr([cell('', '<w:vMerge/>'), cell('y')]),
      tr([cell('', '<w:vMerge/>'), cell('z')])]));
    const g = fakeG();
    const y0 = it.rows[1].y + 1;
    paintTable(L, g, it, {x0: 0, y0, x1: 2000, y1: 1e6});
    assert.deepEqual(it.painted, [1, 2]);
    const items = it.rows[0].cells[0].col.items;
    const want = items.filter((x) => x.y + x.h > y0)
      .map((x) => x.block.text);
    assert.ok(want.length >= 2 && !want.includes('m0'), String(want));
    const t = named(g, 'fillText').map((c) => c[1]);
    assert.deepEqual(t, [...want, 'y', 'z']);
  });
  it('nested tables are drawn (their text, their item painted)',
    async () => {
      const {L, it} = await laid(nestedTable(3));
      const g = fakeG();
      paintTable(L, g, it, ALL);
      assert.deepEqual(named(g, 'fillText').map((c) => c[1]),
        ['L1', 'L2', 'L3']);
      const inner = it.rows[0].cells[0].col.items.find((x) =>
        x.kind === 'tbl');
      assert.deepEqual(inner.painted, [0, 0]);
    });
  it('a diagonal is one line of its width and colour', async () => {
    const {L, it} = await laid(tbl([tr([cell('a', '<w:tcBorders>' +
      '<w:tl2br w:val="single" w:sz="12" w:space="0" w:color="FF0000"/>' +
      '</w:tcBorders>')])]));
    const g = fakeG();
    paintTable(L, g, it, ALL);
    const c = it.rows[0].cells[0], row = it.rows[0];
    assert.deepEqual(named(g, 'moveTo')[0].slice(1), [c.x, row.y]);
    assert.deepEqual(named(g, 'lineTo')[0].slice(1),
      [c.x + c.w, row.y + row.h]);
    assert.equal(named(g, 'stroke').length, 1);
    const i = g.calls.findIndex((x) => x[0] === 'stroke');
    const st = g.calls.slice(0, i).filter((x) =>
      x[0] === 'set strokeStyle').at(-1);
    assert.equal(st[1], '#ff0000');
    const lw = g.calls.slice(0, i).filter((x) =>
      x[0] === 'set lineWidth').at(-1);
    assert.equal(lw[1], 2);
  });
  it('a floating table (tblpPr): a 1 px dashed #606060 outline',
    async () => {
      const tblpPr = '<w:tblpPr w:leftFromText="180" ' +
        'w:rightFromText="180" w:vertAnchor="text" w:tblpY="1"/>';
      const {L, it} = await laid(tbl([tr([cell('float')])],
        {tblPr: tblpPr}));
      const g = fakeG();
      paintTable(L, g, it, ALL);
      const d = named(g, 'setLineDash');
      assert.deepEqual(d[0][1], [4, 3]);
      const i = g.calls.findIndex((x) => x[0] === 'setLineDash');
      const sr = g.calls.findIndex((x, k) => k > i && x[0] === 'strokeRect');
      assert.ok(sr > i);
      assert.ok(g.calls.slice(i, sr).some((x) =>
        x[0] === 'set strokeStyle' && x[1] === '#606060'));
      const {L: M, it: jt} = await laid(tbl([tr([cell('flow')])]));
      const h = fakeG();
      paintTable(M, h, jt, ALL);
      assert.equal(named(h, 'setLineDash').length, 0);
    });
});

describe('only the rows in the rect (D20)', () => {
  it('a 1000-row table painted with a 600 px rect: ~30 rows drawn; ' +
    'it.painted the range; the borders cut to it too', async () => {
    const {L, it} = await laid(bigTable(1000, 5));
    const y0 = it.rows[500].y + 3;
    const rect = {x0: 0, y0, x1: 2000, y1: y0 + 600};
    const g = fakeG();
    paint(L, g, rect);
    const [r0, r1] = it.painted;
    assert.equal(r0, 500);
    assert.ok(it.rows[r1].y < rect.y1);
    assert.ok(it.rows[r1].y + it.rows[r1].h >= rect.y1);
    const n = r1 - r0 + 1;
    assert.ok(n >= 20 && n <= 40, `${n} rows`);
    const t = named(g, 'fillText');
    assert.equal(t.length, n * 5);
    assert.equal(t[0][1], 'r500c0');
    for (const f of fills(g)) {
      assert.ok(f.y + f.h >= rect.y0 - 2 && f.y <= rect.y1 + 2,
        JSON.stringify(f));
    }
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) paint(L, fakeG(), rect);
    const ms = (performance.now() - t0) / 20;
    assert.ok(ms < 20, `${ms} ms a screen`);
  });
  it('DocPaint hands a table to paintTable: no grey box, no label',
    async () => {
      const {L} = await laid(p(r('before')) + tbl([tr([cell('in')])]) +
        p(r('after')));
      const g = fakeG();
      paint(L, g, ALL);
      const t = named(g, 'fillText').map((c) => c[1]);
      assert.deepEqual(t, ['before', 'in', 'after']);
      assert.ok(!fills(g).some((x) => x.style === '#eeeeee'));
    });
});
