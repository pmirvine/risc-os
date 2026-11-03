// RtfRead (Batch G2, task 5): tables and pictures.
// Fixtures: tests/moreapps/rtf-fixtures/ (07 and 08 are real textutil
// output; 17 and 18 are SPEC-DERIVED, see its README) and small
// strings. Every Doc read here must write as .docx and read back
// equal (docx-compare's assertSameDoc after expectedBack).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {pictureOf, docMap} from '../../tools/moreapps/!Letters/PicRead';
import {mediaOf} from '../../tools/moreapps/!Letters/PicMedia';
import {assertSameDoc, expectedBack, withNewParts, withNewStories}
  from './docx-compare.mjs';
import {pngBytes, jpegBytes} from './pic-fixtures.mjs';

const DIR = fileURLToPath(new URL('./rtf-fixtures/', import.meta.url));
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const R = (s, o = {}) => readRtf(enc(s), {date: DATE, ...o});
const fixture = (f, o = {}) => readRtf(
  new Uint8Array(fs.readFileSync(DIR + f)), {date: DATE, ...o});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const tables = (doc) => blocks(doc).filter((b) => b.type === 'tbl');
const hex = (b) => Buffer.from(b).toString('hex');
/** A cell's blocks as text: a paragraph its text, a table 'T'. */
const cellText = (c) => c.blocks.map((b) => (b.type === 'p' ? b.text
  : 'T'));
const rowsText = (t) => t.rows.map((r) => r.cells.map(cellText));
/** A property object without an empty extra. */
const pr = (o) => {
  const {extra, ...f} = o;
  assert.deepEqual(extra, []);
  return f;
};
/** The picture inlines of the body: [{x, info}]. */
function pictures(doc) {
  const out = [];
  for (const b of blocks(doc)) {
    if (b.type !== 'p') continue;
    for (const k of Object.keys(b.inlines)) {
      const x = b.inlines[k];
      const info = x.node ? pictureOf(x.node, docMap(doc)) : null;
      if (info) out.push({x, info, at: Number(k), p: b});
    }
  }
  return out;
}

function valid(doc) {
  for (const s of doc.sections) for (const b of s.blocks) checkBlock(b);
  for (const st of doc.stories.values()) {
    for (const b of st.blocks) checkBlock(b);
  }
}

async function roundTrips(doc, what) {
  valid(doc);
  const back = await readDocx(await writeDocx(doc, {date: DATE}));
  assertSameDoc(back, withNewStories(withNewParts(expectedBack(doc),
    back), back), what);
  return back;
}

const COLOURS = '{\\colortbl;\\red255\\green0\\blue0;' +
  '\\red0\\green0\\blue255;}';

const TWO_BY_THREE = '{\\rtf1' + COLOURS + '\\pard Before\\par' +
  '\\trowd\\trgaph108\\trleft-108\\trrh400\\trhdr' +
  '\\clbrdrt\\brdrs\\brdrw20\\brdrcf1 \\clbrdrb\\brdrs\\brdrw10 ' +
  '\\clcbpat2\\clvertalc\\clmgf\\cellx2000\\clmrg\\cellx4000' +
  '\\clvertalb\\cellx6000' +
  '\\pard\\intbl A\\cell\\pard\\intbl\\cell\\pard\\intbl C\\cell' +
  '\\row\\trowd\\trgaph108\\trleft-108\\cellx2000\\cellx4000' +
  '\\cellx6000\\pard\\intbl D\\cell E\\cell F\\cell\\row' +
  '\\pard After\\par}';

describe('RtfRead: tables', () => {
  it('a 2 x 3 table: merge, widths from \\cellx, borders, shading',
    () => {
      const {doc, notes} = R(TWO_BY_THREE);
      assert.deepEqual(notes, []);
      const bs = blocks(doc);
      assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
      assert.equal(bs[0].text, 'Before');
      assert.equal(bs[2].text, 'After');
      const t = bs[1];
      assert.deepEqual(t.grid, [2108, 2000, 2000]);
      assert.deepEqual(rowsText(t), [[['A'], ['C']],
        [['D'], ['E'], ['F']]]);
      assert.deepEqual(pr(t.tblPr), {tblW: {w: 0, type: 'auto'}});
      assert.deepEqual(pr(t.rows[0].trPr), {trHeight: {val: 400,
        hRule: 'atLeast'}, tblHeader: true});
      assert.deepEqual(pr(t.rows[1].trPr), {});
      const [a, c] = t.rows[0].cells;
      assert.deepEqual(pr(a.tcPr), {tcW: {w: 4108, type: 'dxa'},
        gridSpan: 2, vAlign: 'center',
        tcBorders: {top: {val: 'single', sz: 8, color: 'FF0000'},
          bottom: {val: 'single', sz: 4}},
        shd: {val: 'clear', color: 'auto', fill: '0000FF'}});
      assert.deepEqual(pr(c.tcPr), {tcW: {w: 2000, type: 'dxa'},
        vAlign: 'bottom'});
      assert.deepEqual(pr(t.rows[1].cells[0].tcPr), {tcW: {w: 2108,
        type: 'dxa'}});
      // the cells' paragraphs carry no table marks
      assert.deepEqual(pr(a.blocks[0].pPr), {});
    });

  it('textutil merges and a nested table (07)', () => {
    const {doc, notes} = fixture('07-table-merges-html.rtf');
    assert.deepEqual(notes, []);
    const bs = blocks(doc);
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(bs[0].text, 'Before the table.');
    assert.equal(bs[2].text, 'After the table.');
    const t = bs[1];
    assert.deepEqual(t.grid, [2988, 2880, 2880]);
    assert.deepEqual(rowsText(t), [
      [['Heading spans three']],
      [['A1 A2 merged'], ['B1'], ['C1']],
      [[''], ['B2 C2 merged, right']],
      [['A3'], ['Two', 'paragraphs'], ['T', '']]]);
    const span = (r, k) => t.rows[r].cells[k].tcPr.gridSpan;
    const vm = (r, k) => t.rows[r].cells[k].tcPr.vMerge;
    assert.equal(span(0, 0), 3);
    assert.equal(vm(1, 0), 'restart');
    assert.equal(vm(2, 0), 'continue');
    assert.equal(span(2, 1), 2);
    assert.equal(t.rows[0].cells[0].tcPr.shd.fill, 'B0CCEA');
    assert.equal(t.rows[1].cells[2].tcPr.shd.fill, 'FDB409');
    assert.equal(t.rows[1].cells[0].tcPr.vAlign, 'center');
    assert.deepEqual(t.rows[0].cells[0].tcPr.tcBorders.left,
      {val: 'single', sz: 8, color: '000000'});
    assert.deepEqual(pr(t.tblPr).tblBorders, {top: {val: 'single',
      sz: 8, color: '000000'}, left: {val: 'single', sz: 8,
      color: '000000'}, bottom: {val: 'single', sz: 8,
      color: '000000'}, right: {val: 'single', sz: 8,
      color: '000000'}});
    assert.equal(t.rows[2].cells[1].blocks[0].pPr.jc, 'right');
    const n = t.rows[3].cells[2].blocks[0];
    assert.equal(n.type, 'tbl');
    assert.deepEqual(n.grid, [4428, 4320]);
    assert.deepEqual(rowsText(n), [[['n1'], ['n2']]]);
  });

  it('textutil table from a .docx (08): text before the nested one',
    () => {
      const {doc} = fixture('08-table-docx.rtf');
      const t = tables(doc)[0];
      assert.deepEqual(rowsText(t), [
        [['Heading spans three']],
        [['A1'], ['B1'], ['C1']],
        [[''], ['B2 C2 merged']],
        [['A3 right'], ['Two ', 'paragraphs'], ['Nested:', 'T', '']]]);
      assert.equal(t.rows[2].cells[1].tcPr.gridSpan, 2);
      assert.deepEqual(t.tblPr.tblBorders.top, {val: 'nil'});
    });

  it("Word's dialect: definitions after the cells, nested table " +
    'properties, vertical merge, row words (18)', () => {
    const {doc, notes} = fixture('18-spec-word-tables.rtf');
    assert.deepEqual(notes, []);
    const bs = blocks(doc);
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
    const t = bs[1];
    assert.deepEqual(t.grid, [3000, 3000, 3000]);
    assert.deepEqual(rowsText(t), [
      [['Merged down'], ['Header B'], ['Header C']],
      [[''], ['Spans B and C:', 'T', '']]]);
    const side = {val: 'single', sz: 4};
    assert.deepEqual(pr(t.tblPr), {tblW: {w: 0, type: 'auto'},
      jc: 'center', tblBorders: {top: side, left: side, bottom: side,
        right: side, insideH: side, insideV: side}});
    assert.deepEqual(pr(t.rows[0].trPr), {trHeight: {val: 400,
      hRule: 'exact'}, tblHeader: true});
    const c = t.rows[0].cells.map((x) => pr(x.tcPr));
    assert.deepEqual(c[0], {tcW: {w: 3000, type: 'dxa'},
      vMerge: 'restart', vAlign: 'top', tcBorders: {top: side,
        left: side, bottom: side, right: side},
      shd: {val: 'clear', color: 'auto', fill: 'FFFF00'}});
    assert.deepEqual(c[1], {tcW: {w: 3000, type: 'dxa'},
      vAlign: 'center', shd: {val: 'pct25', color: '000000',
        fill: 'C0C0C0'}});
    assert.deepEqual(c[2], {tcW: {w: 3000, type: 'dxa'},
      vAlign: 'bottom'});
    const d = t.rows[1].cells.map((x) => pr(x.tcPr));
    assert.deepEqual(d[0], {tcW: {w: 3000, type: 'dxa'},
      vMerge: 'continue', vAlign: 'top'});
    assert.deepEqual(d[1], {tcW: {w: 6000, type: 'dxa'}, gridSpan: 2});
    const n = t.rows[1].cells[1].blocks[1];
    assert.deepEqual(n.grid, [1500, 1500]);
    assert.deepEqual(rowsText(n), [[['N1'], ['N2']]]);
    assert.deepEqual(pr(n.tblPr), {tblW: {w: 0, type: 'auto'},
      tblInd: {w: 108, type: 'dxa'}});
    assert.deepEqual(pr(n.rows[0].cells[0].tcPr), {tcW: {w: 1500,
      type: 'dxa'}, tcBorders: {bottom: {val: 'double', sz: 6,
      color: '000000'}}});
  });

  it('rows with different edges share one grid', () => {
    const {doc} = R('{\\rtf1\\trowd\\cellx1000\\cellx3000' +
      '\\pard\\intbl a\\cell b\\cell\\row' +
      '\\trowd\\trleft500\\cellx2000\\pard\\intbl c\\cell\\row}');
    const t = tables(doc)[0];
    assert.deepEqual(t.grid, [500, 500, 1000, 1000]);
    assert.deepEqual(t.rows[0].cells.map((c) => c.tcPr.gridSpan),
      [2, 2]);
    assert.deepEqual(pr(t.rows[1].trPr), {gridBefore: 1,
      gridAfter: 1});
    assert.equal(t.rows[1].cells[0].tcPr.gridSpan, 2);
    assert.deepEqual(pr(t.tblPr), {tblW: {w: 0, type: 'auto'}});
  });

  it('a table in a header; one at the end gets a paragraph after',
    async () => {
      const {doc} = R('{\\rtf1{\\header\\trowd\\cellx2000\\pard\\intbl' +
        ' h\\cell\\row}\\trowd\\cellx3000\\pard\\intbl x\\cell\\row}');
      const st = [...doc.stories.values()][0];
      assert.deepEqual(st.blocks.map((b) => b.type), ['tbl', 'p']);
      assert.deepEqual(blocks(doc).map((b) => b.type), ['tbl', 'p']);
      await roundTrips(doc, 'header table');
    });

  it('cells with no definitions, missing \\row, a \\sect inside',
    async () => {
      const {doc} = R('{\\rtf1\\pard\\intbl a\\cell b\\cell\\row' +
        '\\pard\\intbl c\\cell\\pard\\intbl d\\sect\\pard e\\par}');
      const ts = tables(doc);
      assert.equal(ts.length, 1);
      assert.deepEqual(rowsText(ts[0]), [[['a'], ['b']],
        [['c'], ['d']]]);
      assert.equal(ts[0].grid.length, 2);
      assert.equal(doc.sections.length, 2);
      assert.deepEqual(doc.sections[0].blocks.map((b) => b.type),
        ['tbl', 'p']);
      assert.equal(doc.sections[1].blocks[0].text, 'e');
      await roundTrips(doc, 'loose cells');
    });

  it('hostile shapes: deep nesting, too many cells and edges',
    async () => {
      let s = '{\\rtf1\\pard\\intbl\\itap40 deep\\nestcell' +
        '\\nestrow\\pard after\\par';
      s += '\\trowd';
      for (let k = 1; k <= 200; k++) s += '\\cellx' + k * 37;
      s += '\\pard\\intbl';
      for (let k = 0; k < 100; k++) s += 'c' + k + '\\cell ';
      s += '\\row';
      for (let r = 0; r < 70; r++) {
        s += '\\trowd\\trleft' + r + '\\cellx' + (5000 + r * 3) +
          '\\pard\\intbl r\\cell\\row';
      }
      const {doc, notes} = R(s + '}');
      valid(doc);
      assert.ok(notes.length >= 1, notes.join('|'));
      for (const t of tables(doc)) {
        assert.ok(t.grid.length <= 63);
        for (const r of t.rows) assert.ok(r.cells.length <= 63);
      }
      await roundTrips(doc, 'hostile tables');
    });

  it('the paragraph cap stops a long table, which is still a table',
    async () => {
      let s = '{\\rtf1\\pard a\\par';
      for (let r = 0; r < 50; r++) {
        s += '\\trowd\\cellx1000\\cellx2000\\pard\\intbl x\\cell ' +
          'y\\cell\\row';
      }
      const {doc, notes} = R(s + '}', {maxParagraphs: 9});
      assert.deepEqual(notes, ['more than 9 paragraphs: the rest is ' +
        'not read']);
      const t = tables(doc)[0];
      assert.equal(t.rows.length, 4);
      await roundTrips(doc, 'capped table');
    });

  for (const f of ['07-table-merges-html.rtf', '08-table-docx.rtf',
    '13-letter-docx.rtf', '18-spec-word-tables.rtf']) {
    it('writes as .docx and reads back equal: ' + f, async () => {
      const {doc} = fixture(f);
      assert.ok(tables(doc).length > 0);
      await roundTrips(doc, f);
    });
  }

  it('the 2 x 3 table writes as .docx and reads back equal',
    async () => {
      await roundTrips(R(TWO_BY_THREE).doc, '2x3');
    });
});

const pict = (body) => '{\\rtf1 a{\\pict' + body + '}b\\par}';

describe('RtfRead: pictures', () => {
  it('PNG (hex), JPEG (\\bin) and EMF from the fixture (17)', () => {
    const {doc, notes} = fixture('17-spec-word-pictures.rtf');
    assert.deepEqual(notes, []);
    const ps = pictures(doc);
    assert.equal(ps.length, 3);
    const [png, jpeg, emf] = ps;
    assert.equal(png.p.text, 'A PNG: ' + OBJ + ' after.');
    assert.deepEqual([png.info.cx, png.info.cy], [609600, 304800]);
    assert.deepEqual([jpeg.info.cx, jpeg.info.cy], [457200, 457200]);
    assert.deepEqual([emf.info.cx, emf.info.cy], [457200, 457200]);
    const m = (x) => mediaOf(doc, x.info.embed);
    assert.equal(m(png).name, 'word/media/image1.png');
    assert.equal(hex(m(png).bytes), hex(pngBytes(4, 2)));
    assert.equal(m(png).mime, 'image/png');
    assert.equal(m(jpeg).name, 'word/media/image2.jpeg');
    assert.equal(hex(m(jpeg).bytes), hex(jpegBytes(1, 1)));
    assert.equal(m(emf).name, 'word/media/image3.emf');
    assert.equal(m(emf).bytes.length, 108);
    assert.equal(m(emf).mime, null);
    // the \nonshppict WMF is not stored: the PNG was usable
    assert.equal([...doc.parts.keys()].filter((k) =>
      k.startsWith('word/media/')).length, 3);
    const ids = ps.map((x) => x.info.docPrId);
    assert.equal(new Set(ids).size, 3);
    assert.equal(png.info.floating, false);
  });

  it('the \\nonshppict picture when the \\shppict one is unusable',
    () => {
      const wmf = '010009000003' + '0c000000' + '0000' + '03000000' +
        '0000' + '030000000000';
      const {doc, notes} = R('{\\rtf1 a{\\*\\shppict{\\pict\\pngblip ' +
        '0011}}{\\nonshppict{\\pict\\picwgoal1440\\pichgoal720' +
        '\\wmetafile8 ' + wmf + '}}b\\par}');
      assert.equal(notes.length, 1, notes.join('|'));
      const ps = pictures(doc);
      assert.equal(ps.length, 1);
      const m = mediaOf(doc, ps[0].info.embed);
      assert.equal(m.name, 'word/media/image1.wmf');
      // a placeable header made for it, then the metafile as given
      assert.equal(hex(m.bytes.slice(0, 4)), 'd7cdc69a');
      assert.equal(m.bytes.length, 22 + wmf.length / 2);
      assert.equal(hex(m.bytes.slice(22)), wmf);
      assert.deepEqual([ps[0].info.cx, ps[0].info.cy],
        [914400, 457200]);
    });

  it('a lone \\nonshppict later on is read; the pair gives one',
    () => {
      const png = hex(pngBytes(2, 2)), jpg = hex(jpegBytes(1, 1));
      const shp = '{\\*\\shppict{\\pict\\pngblip ' + png + '}}';
      const non = '{\\nonshppict{\\pict\\jpegblip ' + jpg + '}}';
      const count = (s) => pictures(R('{\\rtf1 ' + s + '}').doc)
        .map((x) => mediaOf(R('{\\rtf1 ' + s + '}').doc, x.info.embed)
          .mime);
      assert.deepEqual(count(shp + non + 'a\\par'), ['image/png']);
      assert.deepEqual(count(shp + ' ' + non + 'a\\par'),
        ['image/png']);
      for (const gap of ['a\\par ', 'text', '\\b ', '{x}']) {
        assert.deepEqual(count(shp + gap + non + '\\par'),
          ['image/png', 'image/jpeg'], gap);
      }
    });

  it('rows share a definition until it changes', () => {
    const {doc} = R('{\\rtf1\\trowd\\cellx1000\\pard\\intbl a\\cell\\row' +
      '\\pard\\intbl b\\cell\\row\\cellx3000\\pard\\intbl c\\cell ' +
      'd\\cell\\row}');
    const t = tables(doc)[0];
    assert.deepEqual(rowsText(t), [[['a']], [['b']], [['c'], ['d']]]);
    assert.deepEqual(t.grid, [1000, 2000]);
    assert.deepEqual(t.rows.map((r) => r.cells.map((c) =>
      c.tcPr.tcW.w)), [[1000], [1000], [1000, 2000]]);
  });

  it('size: goals and scale; else \\picw \\pich pixels at 96 dpi; ' +
    'else the picture\'s own', () => {
    const png = hex(pngBytes(40, 20));
    const size = (b) => {
      const ps = pictures(R(pict(b + '\\pngblip ' + png)).doc);
      return [ps[0].info.cx, ps[0].info.cy];
    };
    assert.deepEqual(size('\\picwgoal1000\\pichgoal500' +
      '\\picscalex200\\picscaley10'), [1270000, 31750]);
    assert.deepEqual(size('\\picw30\\pich10'), [285750, 95250]);
    assert.deepEqual(size('\\picw30\\pich10\\picscalex50'),
      [142875, 95250]);
    assert.deepEqual(size(''), [381000, 190500]);
    assert.deepEqual(size('\\picwgoal0\\pichgoal-5'), [381000,
      190500]);
  });

  it('data of another type than the word says: kept as the data is, ' +
    'with a note', () => {
    const {doc, notes} = R(pict('\\jpegblip ' + hex(pngBytes(2, 2))));
    assert.equal(notes.length, 1);
    const ps = pictures(doc);
    assert.equal(mediaOf(doc, ps[0].info.embed).name,
      'word/media/image1.png');
  });

  for (const [what, body] of [
    ['odd hex', '\\pngblip ' + hex(pngBytes(2, 2)) + '0'],
    ['not hex', '\\pngblip ' + hex(pngBytes(2, 2)).slice(0, 20) + 'zz'],
    ['not a PNG', '\\pngblip 00112233445566778899'],
    ['a broken PNG header', '\\pngblip 89504e470d0a1a0a0000'],
    ['an EMF without its signature', '\\emfblip ' + '01000000' +
      '00'.repeat(60)],
    ['no data', '\\pngblip'],
    ['a format not kept', '\\dibitmap0 00112233'],
    ['no format', ' 00112233'],
  ]) {
    it('a corrupt picture is skipped with a note: ' + what,
      async () => {
        const {doc, notes} = R(pict(body));
        assert.equal(notes.length, 1, notes.join('|'));
        assert.equal(pictures(doc).length, 0);
        assert.equal(blocks(doc)[0].text, 'ab');
        assert.equal([...doc.parts.keys()].filter((k) =>
          k.startsWith('word/media/')).length, 0);
        await roundTrips(doc, what);
      });
  }

  it('a picture over the size cap is skipped with a note', () => {
    const big = new Uint8Array(17 * 1024 * 1024);
    big.set(pngBytes(2, 2));
    const head = enc('{\\rtf1 a{\\pict\\pngblip\\bin' + big.length +
      ' ');
    const tail = enc('}b\\par}');
    const all = new Uint8Array(head.length + big.length + tail.length);
    all.set(head);
    all.set(big, head.length);
    all.set(tail, head.length + big.length);
    const {doc, notes} = readRtf(all, {date: DATE});
    assert.equal(notes.length, 1, notes.join('|'));
    assert.equal(pictures(doc).length, 0);
    assert.equal(blocks(doc)[0].text, 'ab');
  });

  it('a picture in a table cell and in a header', async () => {
    const png = hex(pngBytes(4, 4));
    const {doc} = R('{\\rtf1{\\header h{\\pict\\pngblip ' + png +
      '}\\par}\\trowd\\cellx3000\\pard\\intbl c{\\pict\\pngblip ' +
      png + '}\\cell\\row\\pard e\\par}');
    const t = tables(doc)[0];
    const p = t.rows[0].cells[0].blocks[0];
    assert.equal(p.text, 'c' + OBJ);
    const st = [...doc.stories.values()][0];
    assert.equal(st.blocks[0].text, 'h' + OBJ);
    assert.equal(st.rels.length, 1);
    await roundTrips(doc, 'cell and header pictures');
  });

  it('the pictures write as .docx and read back equal (17)',
    async () => {
      await roundTrips(fixture('17-spec-word-pictures.rtf').doc, '17');
    });

  it('never throws on mutated table and picture fixtures', () => {
    for (const f of ['07-table-merges-html.rtf',
      '17-spec-word-pictures.rtf', '18-spec-word-tables.rtf']) {
      const src = fs.readFileSync(DIR + f);
      let seed = 4242;
      const rnd = (n) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
      };
      for (let k = 0; k < 200; k++) {
        const b = new Uint8Array(src.slice(0, 1 + rnd(src.length)));
        for (let m = 0; m < 1 + rnd(20); m++) {
          b[rnd(b.length)] = '{}\\\'u0-9 ab'.charCodeAt(rnd(13));
        }
        const {doc, notes} = readRtf(b, {date: DATE});
        assert.ok(!notes.some((n) => n.startsWith('part of the file')),
          notes.join('|'));
        valid(doc);
      }
    }
  });
});
