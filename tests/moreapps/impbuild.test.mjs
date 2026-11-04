// ImpBuild (ODT and .doc import, task 2): the neutral builder the
// importers drive. Every Doc it makes must pass the Model checks,
// write as .docx and read back equal (docx-compare's assertSameDoc
// after expectedBack), as the RTF reader's do. Inputs are small
// spec-derived calls, not files.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ImpBuild, MAX_NOTES, MORE_NOTES}
  from '../../tools/moreapps/!Letters/ImpBuild';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {MAX_DEPTH} from '../../tools/moreapps/!Letters/TblCheck';
import {assertSameDoc, expectedBack, withNewParts, withNewStories}
  from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const make = (o = {}) => new ImpBuild({date: DATE, ...o});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const P = {pPr: {extra: []}};
const plain = {rPr: {extra: []}};
const bold = {rPr: {b: true, extra: []}};
const big = {rPr: {i: true, sz: 28, extra: []}};
const cellText = (c) => c.blocks.map((b) => (b.type === 'p' ? b.text
  : 'T'));
const rowsText = (t) => t.rows.map((r) => r.cells.map(cellText));

function valid(doc) {
  for (const s of doc.sections) for (const b of s.blocks) checkBlock(b);
}

async function roundTrips(doc, what) {
  valid(doc);
  const back = await readDocx(await writeDocx(doc, {date: DATE}));
  assertSameDoc(back, withNewStories(withNewParts(expectedBack(doc),
    back), back), what);
  return back;
}

/** A cell holding one paragraph of text s. */
function cell(b, s, tcPr = {extra: []}) {
  b.cellStart(tcPr);
  b.text(s, plain);
  b.endPara(P);
  b.cellEnd();
}

describe('ImpBuild: paragraphs and runs', () => {
  it('a paragraph with two formatted runs reads back after ' +
    'DocxWrite/readDocx equal', async () => {
    const b = make();
    b.text('Hello ', bold);
    b.text('big', big);
    b.text(' world', big);
    const p = b.endPara({pPr: {jc: 'center', extra: []}});
    assert.equal(p.text, 'Hello big world');
    const {doc, notes} = b.finish();
    assert.deepEqual(notes, []);
    const [q] = blocks(doc);
    assert.equal(q.text, 'Hello big world');
    assert.deepEqual(q.runs.map((r) => [r.start, r.end, r.rPr]),
      [[0, 6, {b: true, extra: []}],
        [6, 15, {i: true, sz: 28, extra: []}]]);
    assert.equal(q.pPr.jc, 'center');
    const back = await roundTrips(doc, 'two runs');
    assert.equal(blocks(back)[0].runs.length, 2);
  });

  it('text with unpaired surrogates becomes U+FFFD', async () => {
    const b = make();
    // a lone high, a lone low, then a pair split over two runs
    b.text('a\ud800b\udc00c', plain);
    b.text('\ud83d', bold);
    b.text('\ude00d', plain);
    const {doc} = b.finish();
    const [p] = blocks(doc);
    assert.equal(p.text, 'a\ufffdb\ufffdc\ud83d\ude00d');
    // (the run edge inside the pair moves after it)
    assert.deepEqual(p.runs.map((r) => [r.start, r.end]),
      [[0, 5], [5, 7], [7, 8]]);
    await roundTrips(doc, 'surrogates');
  });

  it('control characters, stray object marks and line breaks',
    async () => {
      const b = make();
      b.text('a\u0001b\tc\u2028d\ufffce\uffff', plain);
      b.obj({kind: 'br', level: 'r', brType: 'page'});
      const p = b.endPara(P);
      assert.equal(p.text, 'ab\tc\nd\ufffde\ufffd' + OBJ);
      assert.equal(p.inlines['9'].kind, 'br');
      await roundTrips(b.finish().doc, 'controls');
    });

  it('an inline at level p is in a plain run', () => {
    const b = make();
    b.text('x', bold);
    b.obj({kind: 'raw', level: 'p', node: {name: 'w:bookmarkStart',
      attrs: [['w:id', '0'], ['w:name', 'a']], children: []}}, bold);
    const p = b.endPara(P);
    assert.deepEqual(p.runs.map((r) => r.rPr),
      [{b: true, extra: []}, {extra: []}]);
  });

  it('fmt without extra is accepted; pStyle the default is left out',
    () => {
      const b = make();
      b.text('x', {rPr: {b: true}, rStyle: 'Strong'});
      const p = b.endPara({pPr: {}, pStyle: 'Normal'});
      assert.deepEqual(p.runs[0].rPr, {b: true, extra: []});
      assert.equal(p.runs[0].rStyle, 'Strong');
      assert.equal(p.pStyle, undefined);
      const q = b.endPara({pPr: {}, pStyle: 'Heading1'});
      assert.equal(q.pStyle, 'Heading1');
    });

  it('the paragraph cap stops building and notes once', () => {
    const b = make({max: 3});
    for (let i = 0; i < 6; i++) {
      b.text('p' + i, plain);
      b.endPara(P);
    }
    assert.equal(b.stopped, true);
    const {doc, notes} = b.finish();
    assert.deepEqual(blocks(doc).map((x) => x.text), ['p0', 'p1', 'p2']);
    assert.deepEqual(notes, ['more than 3 paragraphs: the rest is ' +
      'not read']);
  });

  it('notes are once each, at most MAX_NOTES with the last MORE',
    () => {
      const b = make();
      b.note('same');
      b.note('same');
      for (let i = 0; i < 80; i++) b.note('n' + i);
      const {notes} = b.finish();
      assert.equal(notes.length, MAX_NOTES);
      assert.equal(notes[0], 'same');
      assert.equal(notes[MAX_NOTES - 1], MORE_NOTES);
      assert.equal(MORE_NOTES, '(more not listed)');
    });

  it('finish with nothing built gives one empty paragraph',
    async () => {
      const {doc, notes} = make().finish();
      assert.deepEqual(notes, []);
      assert.equal(doc.sections.length, 1);
      assert.equal(doc.sections[0].blocks.length, 1);
      assert.equal(doc.sections[0].blocks[0].text, '');
      assert.deepEqual(doc.sections[0].props.pgSz, {w: 11906, h: 16838});
      await roundTrips(doc, 'empty');
    });

  it('text not ended by endPara is the last paragraph', () => {
    const b = make();
    b.text('tail', plain);
    const {doc} = b.finish();
    assert.deepEqual(blocks(doc).map((x) => x.text), ['tail']);
  });

  it('paper letter gives the letter page', () => {
    const {doc} = make({paper: 'letter'}).finish();
    assert.deepEqual(doc.sections[0].props.pgSz, {w: 12240, h: 15840});
  });
});

describe('ImpBuild: tables', () => {
  it('a 2x2 table with a merged cell passes ModelCheck', async () => {
    const b = make();
    b.tableStart({tblPr: {extra: []}, grid: [2000, 3000]});
    b.rowStart({extra: []});
    cell(b, 'wide', {gridSpan: 2, extra: []});
    b.rowEnd();
    b.rowStart({extra: []});
    cell(b, 'A', {vMerge: 'restart', extra: []});
    cell(b, 'B');
    b.rowEnd();
    b.rowStart({extra: []});
    cell(b, '', {vMerge: 'continue', extra: []});
    cell(b, 'C');
    b.rowEnd();
    b.tableEnd();
    const {doc, notes} = b.finish();
    assert.deepEqual(notes, []);
    const bs = blocks(doc);
    assert.deepEqual(bs.map((x) => x.type), ['tbl', 'p']);
    const t = bs[0];
    checkBlock(t);
    assert.deepEqual(t.grid, [2000, 3000]);
    assert.deepEqual(rowsText(t), [[['wide']], [['A'], ['B']],
      [[''], ['C']]]);
    assert.equal(t.rows[0].cells[0].tcPr.gridSpan, 2);
    assert.equal(t.rows[2].cells[0].tcPr.vMerge, 'continue');
    await roundTrips(doc, '2x2');
  });

  it('a table inside a cell nests', async () => {
    const b = make();
    b.text('Before', plain);
    b.endPara(P);
    b.tableStart({tblPr: {extra: []}, grid: [4000]});
    b.rowStart({extra: []});
    b.cellStart({extra: []});
    b.text('outer', plain);
    b.endPara(P);
    b.tableStart({tblPr: {extra: []}, grid: [1500, 1500]});
    b.rowStart({extra: []});
    cell(b, 'x');
    cell(b, 'y');
    b.rowEnd();
    b.tableEnd();
    b.cellEnd();
    b.rowEnd();
    b.tableEnd();
    b.text('After', plain);
    b.endPara(P);
    const {doc} = b.finish();
    const bs = blocks(doc);
    assert.deepEqual(bs.map((x) => x.type), ['p', 'tbl', 'p']);
    const c = bs[1].rows[0].cells[0];
    // (an empty paragraph ends the cell after the nested table)
    assert.deepEqual(cellText(c), ['outer', 'T', '']);
    assert.deepEqual(rowsText(c.blocks[1]), [[['x'], ['y']]]);
    await roundTrips(doc, 'nested');
  });

  it('shapes are repaired: empty cells, rows, tables; no grid',
    async () => {
      const b = make();
      b.tableStart({tblPr: {extra: []}});
      b.rowStart({extra: []});
      b.cellStart({extra: []});
      b.cellEnd();
      cell(b, 'q', {gridSpan: 2, extra: []});
      b.rowEnd();
      b.rowStart({extra: []});
      b.rowEnd();
      b.tableEnd();
      b.tableStart({tblPr: {extra: []}, grid: [100]});
      b.tableEnd();
      const {doc} = b.finish();
      const bs = blocks(doc);
      assert.deepEqual(bs.map((x) => x.type), ['tbl', 'p']);
      const t = bs[0];
      assert.equal(t.rows.length, 1);
      assert.deepEqual(rowsText(t), [[[''], ['q']]]);
      // (grid sums: as many columns as the widest row)
      assert.equal(t.grid.length, 3);
      await roundTrips(doc, 'repaired');
    });

  it('a grid narrower than a row is widened to it', () => {
    const b = make();
    b.tableStart({tblPr: {extra: []}, grid: [1000]});
    b.rowStart({gridBefore: 1, extra: []});
    cell(b, 'a', {tcW: {w: 700, type: 'dxa'}, extra: []});
    cell(b, 'b');
    b.rowEnd();
    b.tableEnd();
    const t = blocks(b.finish().doc)[0];
    assert.deepEqual(t.grid, [1000, 700, 700]);
    checkBlock(t);
  });

  it('text in a table outside a cell goes into one; unclosed ' +
    'tables close at the end', () => {
    const b = make();
    b.tableStart({tblPr: {extra: []}, grid: [1000]});
    b.text('loose', plain);
    b.endPara(P);
    b.rowStart({extra: []});
    b.cellStart({extra: []});
    b.text('open', plain);
    const {doc, notes} = b.finish();
    const t = blocks(doc)[0];
    assert.deepEqual(rowsText(t), [[['loose']], [['open']]]);
    assert.ok(notes.some((n) => /outside a cell/.test(n)));
    checkBlock(t);
  });

  it('tables nested past MAX_DEPTH are read at that depth', () => {
    const b = make();
    for (let i = 0; i < MAX_DEPTH + 3; i++) {
      b.tableStart({tblPr: {extra: []}, grid: [1000]});
      b.rowStart({extra: []});
      b.cellStart({extra: []});
    }
    b.text('deep', plain);
    b.endPara(P);
    for (let i = 0; i < MAX_DEPTH + 3; i++) {
      b.cellEnd();
      b.rowEnd();
      b.tableEnd();
    }
    const {doc, notes} = b.finish();
    valid(doc);
    let t = blocks(doc)[0], d = 1;
    while (t.rows[0].cells[0].blocks[0].type === 'tbl') {
      t = t.rows[0].cells[0].blocks[0];
      d++;
    }
    assert.equal(d, MAX_DEPTH);
    assert.equal(t.rows[0].cells[0].blocks[0].text, 'deep');
    assert.ok(notes.some((n) => /nested more than/.test(n)));
  });

  it('more than MAX_COLS cells join the last', () => {
    const b = make();
    b.tableStart({tblPr: {extra: []}, grid: [100]});
    b.rowStart({extra: []});
    for (let i = 0; i < 70; i++) cell(b, 'c' + i);
    b.rowEnd();
    b.tableEnd();
    const {doc, notes} = b.finish();
    const t = blocks(doc)[0];
    checkBlock(t);
    assert.equal(t.rows[0].cells.length, 63);
    assert.ok(notes.some((n) => /more than 63 cells/.test(n)));
  });
});

describe('ImpBuild: hostile callers', () => {
  it('empty cells and sections count against the cap', () => {
    const b = make({max: 10});
    b.tableStart({tblPr: {extra: []}, grid: [100]});
    for (let i = 0; i < 1000; i++) {
      b.rowStart({extra: []});
      b.cellStart({extra: []});
      b.cellEnd();
      b.rowEnd();
    }
    b.tableEnd();
    for (let i = 0; i < 1000; i++) b.sectionEnd({extra: []});
    assert.equal(b.stopped, true);
    const {doc, notes} = b.finish();
    valid(doc);
    assert.ok(blocks(doc)[0].rows.length <= 11);
    assert.equal(doc.sections.length, 1);
    assert.equal(notes.length, 1);
  });

  it('a huge given grid is cut to MAX_COLS columns', () => {
    const b = make();
    b.tableStart({tblPr: {extra: []}, grid: new Array(1e5).fill(10)});
    b.rowStart({extra: []});
    cell(b, 'a');
    b.tableEnd();
    const t = blocks(b.finish().doc)[0];
    checkBlock(t);
    assert.equal(t.grid.length, 63);
  });
});

describe('ImpBuild: sections', () => {
  it('sectionEnd twice gives two sections with their own pgSz',
    async () => {
      const b = make();
      b.text('one', plain);
      b.endPara(P);
      b.sectionEnd({pgSz: {w: 11906, h: 16838}, extra: []});
      b.text('two', plain);
      b.endPara(P);
      b.sectionEnd({pgSz: {w: 16838, h: 11906, orient: 'landscape'},
        extra: []});
      const {doc} = b.finish();
      assert.equal(doc.sections.length, 2);
      assert.deepEqual(doc.sections.map((s) => s.props.pgSz),
        [{w: 11906, h: 16838},
          {w: 16838, h: 11906, orient: 'landscape'}]);
      assert.deepEqual(doc.sections.map((s) => s.blocks.map((x) =>
        x.text)), [['one'], ['two']]);
      // (what the section did not give is the default page's)
      assert.equal(doc.sections[1].props.pgMar.top, 1440);
      await roundTrips(doc, 'sections');
    });

  it('a section ending with a table gets a paragraph after it',
    async () => {
      const b = make();
      b.tableStart({tblPr: {extra: []}, grid: [1000]});
      b.rowStart({extra: []});
      cell(b, 'a');
      b.rowEnd();
      b.sectionEnd({extra: []});
      b.text('next', plain);
      b.endPara(P);
      const {doc} = b.finish();
      assert.deepEqual(doc.sections.map((s) => s.blocks.map((x) =>
        x.type)), [['tbl', 'p'], ['p']]);
      await roundTrips(doc, 'section table');
    });
});

describe('ImpBuild: stories (the extension point)', () => {
  it('a story gathers its own blocks and shares the cap', () => {
    const b = make({max: 2});
    b.text('body', plain);
    b.endPara(P);
    const s = b.story();
    s.text('in story', plain);
    s.endPara(P);
    s.text('over', plain);
    s.endPara(P);
    const bs = s.end();
    assert.deepEqual(bs.map((x) => x.text), ['in story']);
    assert.equal(b.stopped, true);
    const {doc} = b.finish();
    assert.deepEqual(blocks(doc).map((x) => x.text), ['body']);
  });

  it('an empty story gives one empty paragraph', () => {
    const s = make().story();
    assert.deepEqual(s.end().map((x) => x.text), ['']);
  });
});
