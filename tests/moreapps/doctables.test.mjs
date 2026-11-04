// .doc import, task 13: the special characters (DocBody), lists
// (DocLists, DocLvl) and tables (DocTable, DocTap). Inputs are
// spec-derived fixtures (doc-helpers.mjs formattedDoc, listTable,
// lfoTable, defTable, tc80: written from [MS-DOC]), not files from
// an office program. Every Doc read must pass the Model checks,
// write as .docx and read back equal; emit() hands each .docx to the
// real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDoc, openContext}
  from '../../tools/moreapps/!Letters/DocRead';
import {OPS as C} from '../../tools/moreapps/!Letters/DocSprm';
import {MAX_CELLS, AHEAD_WORK, LIMITS}
  from '../../tools/moreapps/!Letters/DocTable';
import {listsOf, listFor}
  from '../../tools/moreapps/!Letters/DocLists';
import {DECODED, prlsOf}
  from '../../tools/moreapps/!Letters/DocPrcData';
import {MAX_DEPTH} from '../../tools/moreapps/!Letters/TblCheck';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {labels} from '../../tools/moreapps/!Letters/ListNumbers';
import {levelOf} from '../../tools/moreapps/!Letters/ReadNumbering';
import {glyphFor} from '../../tools/moreapps/!Letters/BulletGlyph';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {CORPUS} from './odt-corpus.mjs';
import {formattedDoc, prl, i16le, u16le, u32le, listTable, lfoTable,
  defTable, tc80, lvlBytes, grpprl} from './doc-helpers.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const read = (o, opts = {}) => readDoc(formattedDoc(o).bytes,
  {date: DATE, ...opts});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const tables = (doc) => blocks(doc).filter((b) => b.type === 'tbl');
/** A table's shape: rows of cell texts (a nested table: its shape). */
const shape = (t) => t.rows.map((r) => r.cells.map((c) => {
  const out = c.blocks.map((b) => (b.type === 'tbl' ? shape(b)
    : b.text));
  return out.length === 1 ? out[0] : out;
}));

async function roundTrips(doc, what) {
  for (const b of blocks(doc)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('doc-tables-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

// paragraphs of tables
const inT = prl(C.PFInTable, 1);
const itap = (n) => prl(C.PItap, u32le(n));
const cell = (text, more = []) => ({text, mark: '\x07',
  prls: [inT, ...more]});
const ttp = (tap = []) => ({text: '', mark: '\x07',
  prls: [inT, prl(C.PFTtp, 1), ...tap]});
const inner = (text, d = 2) => ({text, prls: [inT, itap(d),
  prl(C.PFInnerTableCell, 1)]});
const innerPara = (text, d = 2) => ({text, prls: [inT, itap(d)]});
const innerTtp = (tap = [], d = 2) => ({text: '', prls: [inT, itap(d),
  prl(C.PFInnerTableCell, 1), prl(C.PFInnerTtp, 1), ...tap]});
const plain = (text) => ({text});
const row = (texts, tap) => [...texts.map((t) => cell(t)), ttp(tap)];
const EDGES3 = [0, 1000, 2000, 3000];

describe('.doc: special characters (DocBody)', () => {
  it('tab line break and non-breaking hyphen map correctly',
    async () => {
      const {doc, notes} = read({paras: [plain(
        'a\tb\x0Bc\x1Ed\x1Fe f')]});
      assert.equal(paras(doc)[0].text, 'a\tb\nc‑d­e f');
      assert.deepEqual(notes, []);
      await roundTrips(doc, 'specials');
    });

  it('page break splits paragraph without losing text', async () => {
    const {doc} = read({paras: [plain('before\x0Cafter'),
      plain('next')]});
    const ps = paras(doc);
    assert.equal(ps.length, 2);
    assert.equal(ps[0].text, 'before￼after');
    assert.equal(Object.values(ps[0].inlines)[0].brType, 'page');
    assert.equal(ps[1].text, 'next');
    await roundTrips(doc, 'page break');
  });

  it('cell marks outside a table are paragraph ends, one note',
    async () => {
      const {doc, notes} = read({paras: [{text: 'a\x07b', mark: '\x07'},
        plain('c')]});
      assert.deepEqual(paras(doc).map((p) => p.text), ['a', 'b', 'c']);
      assert.equal(notes.filter((n) => /cell mark outside/.test(n))
        .length, 1);
      assert.equal(tables(doc).length, 0);
    });
});

// ---------------------------------------------------------------------
// Lists
const SYMBOL_FONTS = ['Times New Roman', 'Symbol', 'Arial'];
const decimal = (k) => ({nfc: 0, xst: [k, 0x2E], start: 1,
  papx: [...prl(C.PDxaLeft, i16le(720 * (k + 1))),
    ...prl(C.PDxaLeft1, i16le(-360))]});
const multi = (lsid, lv = decimal) => ({lsid,
  levels: Array.from({length: 9}, (_, k) => lv(k))});
const inList = (text, ilfo, ilvl = 0, more = []) => ({text,
  prls: [prl(C.PIlfo, i16le(ilfo)), prl(C.PIlvl, ilvl), ...more]});

function listDoc(lists, lfos, ps, opts = {}) {
  const {PlfLst, lcb} = listTable(lists, opts);
  return read({paras: ps, fonts: SYMBOL_FONTS,
    styles: {ftc: 0, stds: [{sti: 0, name: 'Normal'}]},
    table: {PlfLst, PlfLfo: lfoTable(lfos, opts)},
    lcb: {PlfLst: opts.lcb ?? lcb}});
}

const labelsOf = (doc) => {
  const m = labels(doc);
  return paras(doc).map((p) => (m.get(p.id) || {}).text);
};

describe('.doc: lists (DocLists)', () => {
  it('a numbered list restarts per LFO override', async () => {
    const {doc, notes} = listDoc([multi(7)], [{lsid: 7},
      {lsid: 7, over: [{ilvl: 0, start: 1}]}],
    [inList('one', 1), inList('two', 1), inList('sub', 1, 1),
      inList('three', 1), inList('again', 2), inList('more', 2)]);
    assert.deepEqual(notes, []);
    assert.deepEqual(labelsOf(doc), ['1.', '2.', '1.', '3.', '1.',
      '2.']);
    const ps = paras(doc);
    assert.notEqual(ps[0].pPr.numPr.numId, ps[4].pPr.numPr.numId);
    assert.deepEqual(ps[2].pPr.numPr, {numId: ps[0].pPr.numPr.numId,
      ilvl: 1});
    const num = doc.numbering.nums.get(ps[4].pPr.numPr.numId);
    assert.equal(num.overrides.get(0).start, 1);
    const lv = levelOf(num, 1);
    assert.deepEqual([lv.numFmt, lv.lvlText, lv.start, lv.pPr.ind],
      ['decimal', '%2.', 1, {left: 1440, hanging: 360}]);
    // the level's indent is not repeated as direct formatting
    assert.equal(ps[2].pPr.ind, undefined);
    await roundTrips(doc, 'list restart');
  });

  it('a bullet in Symbol font reads as a bullet', async () => {
    const font = [...prl(C.CRgFtc0, i16le(1))];
    const bullet = (code) => () => ({nfc: 23, xst: [code], chpx: font,
      papx: [...prl(C.PDxaLeft, i16le(720)),
        ...prl(C.PDxaLeft1, i16le(-360))]});
    const {doc, notes} = listDoc([{lsid: 1, simple: true,
      levels: [bullet(0xF0B7)()]}, {lsid: 2, simple: true,
      levels: [bullet(0xB7)()]}], [{lsid: 1}, {lsid: 2}],
    [inList('word kept', 1), inList('plain code', 2)]);
    assert.deepEqual(notes, []);
    for (const p of paras(doc)) {
      const lv = levelOf(doc.numbering.nums.get(p.pPr.numPr.numId), 0);
      assert.equal(lv.numFmt, 'bullet');
      assert.equal(lv.lvlText, '');
      assert.equal(lv.rPr.rFonts.ascii, 'Symbol');
      assert.equal(glyphFor(lv.lvlText, 'Symbol'), '•');
    }
    await roundTrips(doc, 'symbol bullet');
  });

  it('direct indents in a list paragraph override the level\'s',
    async () => {
      const {doc} = listDoc([multi(3)], [{lsid: 3}],
        [inList('own', 1, 0, [prl(C.PDxaLeft, i16le(0))]),
          inList('level', 1, 0)]);
      const ps = paras(doc);
      assert.equal(ps[0].pPr.ind.left, 0);
      assert.equal(ps[1].pPr.ind, undefined);
      await roundTrips(doc, 'list indents');
    });

  it('hostile list tables: cut, duplicate ids, missing lists',
    async () => {
      // cLst 32767 in a table of 2 lists; a duplicate lsid
      const lists = [multi(5, (k) => ({nfc: 4, xst: [k, 0x29]})),
        multi(5)];
      const {doc, notes} = listDoc(lists, [{lsid: 5}, {lsid: 99}],
        [inList('dup', 1), inList('missing list', 2),
          inList('missing lfo', 0x7FFF), inList('none', 0),
          inList('negative', -5)], {cLst: 32767});
      const ps = paras(doc);
      assert.equal(levelOf(doc.numbering.nums.get(ps[0].pPr.numPr
        .numId), 0).numFmt, 'lowerLetter');
      for (const p of ps.slice(1)) assert.equal(p.pPr.numPr, undefined);
      for (const re of [/list table is damaged/, /same identity/,
        /names a list that is not/]) {
        assert.ok(notes.some((n) => re.test(n)), String(re));
      }
      await roundTrips(doc, 'hostile lists');
    });

  it('ilvl 9..15 is the last level; placeholders past the level',
    async () => {
      const lv = (k) => ({nfc: 0, xst: k === 0 ? [0, 0x2E, 1, 2, 8]
        : [k, 0x2E]});
      const {doc, notes} = listDoc([multi(1, lv), {lsid: 2,
        simple: true, levels: [lv(0)]}], [{lsid: 1}, {lsid: 2}],
      [inList('deep', 1, 12), inList('fifteen', 1, 15),
        inList('simple deep', 2, 3), inList('beyond', 1, 0)]);
      const ps = paras(doc);
      assert.deepEqual(ps.map((p) => p.pPr.numPr.ilvl), [8, 8, 0, 0]);
      const num = doc.numbering.nums.get(ps[3].pPr.numPr.numId);
      assert.equal(levelOf(num, 0).lvlText, '%1.');
      assert.ok(notes.some((n) => /past the list's last/.test(n)));
      assert.ok(notes.some((n) => /numbers a level after/.test(n)));
      await roundTrips(doc, 'list levels');
    });

  it('an xst longer than the file, lfoMac huge, a 32767-list table',
    () => {
      const cut = {lsid: 9, simple: true, raw: [Uint8Array.from([
        ...lvlBytes({nfc: 0, xst: [0, 0x2E], cch: 60000})])]};
      const {notes} = listDoc([cut], [{lsid: 9}], [inList('cut', 1)],
        {lfoMac: 1000000});
      assert.ok(notes.some((n) => /list table is damaged/.test(n)));
      const many = Array.from({length: 32767}, (_, i) => ({lsid: i + 1,
        simple: true, levels: [{nfc: 23, xst: [0x2022]}]}));
      const {PlfLst, lcb} = listTable(many);
      const t = performance.now();
      const ctx = openContext(formattedDoc({paras: [plain('x')],
        table: {PlfLst}, lcb: {PlfLst: lcb}}).bytes);
      assert.equal(listsOf(ctx).byId.size, 32767);
      assert.ok(performance.now() - t < 5000);
    });

  it('lists past the builder\'s 1,000: their levels are not built',
    () => {
      // (task 19: 4,000 lists of 9 long levels read at 583 MB, each
      // list's levels made though the builder refused it)
      const lists = Array.from({length: 1005}, (_, i) => ({lsid: i + 1,
        levels: Array.from({length: 9}, (_, k) => ({nfc: 0,
          xst: [k, 0x2E, 0x41]}))}));
      const {PlfLst, lcb} = listTable(lists);
      const ctx = openContext(formattedDoc({paras: [plain('x')],
        table: {PlfLst, PlfLfo: lfoTable(lists.map((l) =>
          ({lsid: l.lsid})))}, lcb: {PlfLst: lcb}}).bytes);
      const got = lists.map((l, i) => listFor(ctx, i + 1, 0));
      assert.ok(got.slice(0, 1000).every((g) => g && g.numPr));
      assert.ok(got.slice(1000).every((g) => g === null));
      const L = listsOf(ctx);
      assert.ok(L.full);
      assert.equal([...L.byId.values()].filter((l) => l.lv).length,
        1001);
      assert.equal(ctx.b.notes.filter((n) => /more than 1000 lists/
        .test(n)).length, 1);
      // (the text of a level reads whole)
      assert.equal(L.byId.get(1).levels[0].xst, '\x00.A');
    });

  it('Word 6 numbering with no list is left out with one note',
    async () => {
      const anld = prl(C.PAnld80, new Array(84).fill(0));
      const {doc, notes} = read({paras: [{text: 'old', prls: [anld]},
        {text: 'old too', prls: [anld]}]});
      assert.equal(paras(doc)[0].pPr.numPr, undefined);
      assert.equal(notes.filter((n) => /Word 6 numbering/.test(n))
        .length, 1);
      await roundTrips(doc, 'anld');
    });
});

// ---------------------------------------------------------------------
// Tables
const BRC1 = 0x00000108 | (0 << 16);     // single, 1 pt (8 eighths)

describe('.doc: tables (DocTable, DocTap)', () => {
  it('a 3x2 table with a horizontal merge', async () => {
    const tap1 = [defTable(EDGES3, [tc80({brc: [BRC1, BRC1, BRC1,
      BRC1]}), tc80(), tc80({va: 1})])];
    const tap2 = [defTable(EDGES3, [tc80({horz: 2}), tc80({horz: 1}),
      tc80()]), prl(C.TTableHeader, 0)];
    const {doc, notes} = read({paras: [plain('before'),
      ...row(['A', 'B', 'C'], tap1), ...row(['D', '', 'F'], tap2),
      plain('after')]});
    assert.deepEqual(notes, []);
    const [t] = tables(doc);
    assert.deepEqual(shape(t), [['A', 'B', 'C'], ['D', 'F']]);
    assert.deepEqual(t.grid, [1000, 1000, 1000]);
    assert.equal(t.rows[1].cells[0].tcPr.gridSpan, 2);
    assert.deepEqual(t.rows[1].cells[0].tcPr.tcW, {w: 2000,
      type: 'dxa'});
    assert.deepEqual(t.rows[0].cells[0].tcPr.tcBorders.top,
      {val: 'single', sz: 8, color: 'auto'});
    assert.equal(t.rows[0].cells[2].tcPr.vAlign, 'center');
    assert.deepEqual(paras(doc).map((p) => p.text), ['before',
      'after']);
    await roundTrips(doc, '3x2 merge');
  });

  it('a vertical merge, shading, borders, header and row height',
    async () => {
      const shd = [0, 0, 0, 0xFF, 0xCC, 0xFF, 0, 0, 0, 0];
      const tap1 = [defTable([0, 1500, 3000], [tc80({vert: 3}),
        tc80()]), prl(C.TTableHeader, 1),
      prl(C.TDyaRowHeight, i16le(-400)), prl(C.TDefTableShd, shd),
      prl(C.TTableBorders80, new Array(6).fill(0).flatMap(() =>
        u32le(BRC1))), prl(C.TJc, u16le(1))];
      const tap2 = [defTable([0, 1500, 3000], [tc80({vert: 1}),
        tc80()]), prl(C.TDyaRowHeight, i16le(300)),
      prl(C.TTableHeader, 1)];
      const tap3 = [defTable([0, 1500, 3000], [tc80(), tc80()]),
        prl(C.TTableHeader, 1)];
      const {doc, notes} = read({paras: [...row(['top', 'r'], tap1),
        ...row(['', 'r2'], tap2), ...row(['x', 'y'], tap3)]});
      assert.deepEqual(notes, []);
      const [t] = tables(doc);
      assert.deepEqual(t.rows.map((r) => r.cells[0].tcPr.vMerge),
        ['restart', 'continue', undefined]);
      assert.deepEqual(t.rows[0].cells[0].tcPr.shd, {val: 'clear',
        color: 'auto', fill: 'CCFF00'});
      assert.deepEqual(t.rows[0].trPr.trHeight, {val: 400,
        hRule: 'exact'});
      assert.deepEqual(t.rows[1].trPr.trHeight, {val: 300,
        hRule: 'atLeast'});
      assert.deepEqual(t.rows.map((r) => !!r.trPr.tblHeader),
        [true, true, true]);
      assert.equal(t.tblPr.jc, 'center');
      assert.deepEqual(Object.keys(t.tblPr.tblBorders), ['top', 'left',
        'bottom', 'right', 'insideH', 'insideV']);
      await roundTrips(doc, 'vmerge');
    });

  it('a nested table (itap 2)', async () => {
    const itap2 = [defTable([0, 800, 1600], [tc80(), tc80()])];
    const {doc, notes} = read({paras: [
      innerPara('in one'), inner('x'), inner('y'), innerTtp(itap2),
      cell('after inner'), cell('z'), ttp([defTable([0, 2000, 3000])]),
      plain('out')]});
    assert.deepEqual(notes, []);
    const [t] = tables(doc);
    assert.deepEqual(shape(t), [[[[[['in one', 'x'], 'y']],
      'after inner'], 'z']]);
    const nested = t.rows[0].cells[0].blocks[0];
    assert.deepEqual(nested.grid, [800, 800]);
    await roundTrips(doc, 'nested');
  });

  it('adjacent rows of another table style are another table',
    async () => {
      const e = [defTable([0, 900])];
      const {doc} = read({paras: [...row(['a'], e), ...row(['b'], e),
        ...row(['c'], [...e, prl(C.TIstd, u16le(12))]),
        ...row(['d'], [...e, prl(C.TIstd, u16le(12))]), plain('z')]});
      assert.deepEqual(tables(doc).map(shape), [[['a'], ['b']],
        [['c'], ['d']]]);
      await roundTrips(doc, 'two tables');
    });

  it('a row mark without cells is dropped with a note', async () => {
    const {doc, notes} = read({paras: [plain('a'), ttp(), plain('b'),
      ...row(['c'], [defTable([0, 500])]), ttp(), plain('d')]});
    assert.equal(notes.filter((n) => /row with no cells/.test(n))
      .length, 1);
    const ts = tables(doc);
    assert.equal(ts.length, 1);
    assert.deepEqual(shape(ts[0]), [['c']]);
    assert.deepEqual(paras(doc).map((p) => p.text), ['a', 'b', 'd']);
    await roundTrips(doc, 'empty row');
  });

  it('a table whose rows never end closes at the end with a note',
    async () => {
      const {doc, notes} = read({paras: [cell('a'), cell('b'),
        plain('out'), cell('c'), cell('d')]});
      assert.ok(notes.some((n) => /without its end mark/.test(n)));
      assert.deepEqual(tables(doc).map(shape), [[['a', 'b']],
        [['c', 'd']]]);
      await roundTrips(doc, 'no ttp');
    });

  it('itap 1000 is read at the deepest table depth with a note',
    async () => {
      const deep = {text: 'deep', prls: [inT, itap(1000)]};
      const {doc, notes} = read({paras: [deep, cell('a'), ttp(),
        plain('z')]});
      assert.ok(notes.some((n) => /nested more than/.test(n)));
      assert.deepEqual(shape(tables(doc)[0]), [[['deep', 'a']]]);
      // nested 9 deep: the 9th is read in the 8th's cells
      const ps = [];
      for (let d = MAX_DEPTH + 1; d >= 2; d--) ps.push(inner('c' + d, d));
      ps.push(cell('top'), ttp());
      const r = read({paras: ps});
      assert.ok(r.notes.some((n) => /nested more than/.test(n)));
      for (const b of blocks(r.doc)) checkBlock(b);
      await roundTrips(r.doc, 'deep');
    });

  it('TDefTable with 64 cells, 0 cells, bad edges, merges past the row',
    async () => {
      const edges64 = Array.from({length: 65}, (_, i) => i * 100);
      // (one PAPX for the 64 cells: an FKP page holds 29 paragraphs)
      const r64 = [{text: Array.from({length: 64}, (_, i) => 'c' + i +
        '\x07').join(''), mark: '', prls: [inT]},
      ttp([defTable(edges64, [])])];
      const r0 = row(['a', 'b'], [defTable([0])]);
      const rBad = row(['x', 'y', 'z'], [defTable([500, -200, 40000,
        32767], [tc80(), tc80({horz: 2}), tc80({horz: 2})])]);
      const rPast = row(['m', 'n'], [defTable([0, 100, 200],
        [tc80({horz: 2}), tc80({horz: 1}), tc80({horz: 1}),
          tc80({horz: 1})])]);
      for (const [name, ps] of [['64', r64], ['0', r0], ['bad', rBad],
        ['past', rPast]]) {
        const {doc} = read({paras: [...ps, plain('end')]});
        const [t] = tables(doc);
        assert.ok(t, name);
        for (const b of blocks(doc)) checkBlock(b);
        for (const w of t.grid) assert.ok(w >= 0 && w <= 31680, name);
        await roundTrips(doc, 'tdeftable ' + name);
      }
    });

  it('lists and direct formatting keep working in cells', async () => {
    const {PlfLst, lcb} = listTable([multi(4)]);
    const {doc} = read({paras: [cell('item', [prl(C.PIlfo, i16le(1)),
      prl(C.PIlvl, 0), prl(C.PJc, 1)]), ttp([defTable([0, 3000])])],
    table: {PlfLst, PlfLfo: lfoTable([{lsid: 4}])}, lcb: {PlfLst: lcb}});
    const p = tables(doc)[0].rows[0].cells[0].blocks[0];
    assert.equal(p.pPr.jc, 'center');
    assert.equal(p.pPr.numPr.ilvl, 0);
    assert.equal(labels(doc).get(p.id).text, '1.');
    await roundTrips(doc, 'list in cell');
  });

  it(`cells beyond MAX_CELLS (1e6 total) stop with a note`, () => {
    assert.equal(MAX_CELLS, 1000000);
    const n = MAX_CELLS + 5;
    const t = performance.now();
    const {doc, notes} = read({paras: [{text: 'x\x07'.repeat(n),
      mark: '', prls: [inT]}]}, {maxParagraphs: 3000000});
    assert.ok(notes.some((x) => /more than 1,000,000 table cells/
      .test(x)), JSON.stringify(notes));
    assert.equal(tables(doc).length, 1);
    assert.ok(performance.now() - t < 15000);
  });
});

// ---------------------------------------------------------------------
// Fix round 1: the Data stream's PrcData (sprmPHugePapx) and the work
// per paragraph are bounded
const hugeRef = (at) => prl(C.PHugePapx, u32le(at));
/** A Data stream of PrcData records: [grpprl bytes] at their
 *  offsets (returned). */
function dataOf(grpprls, pad = 0) {
  const parts = [], at = [];
  let n = pad;
  for (const g of grpprls) {
    at.push(n);
    parts.push(...u16le(g.length), ...g);
    n += 2 + g.length;
  }
  return {data: Uint8Array.from([...new Array(pad).fill(0), ...parts]),
    at};
}

describe('.doc: sprmPHugePapx and the work per paragraph (fix 1)',
  () => {
    it('a 64 KB PrcData shared by 10,000 paragraphs is read once',
      () => {
        const g = [];
        for (let i = 0; i + 3 <= 65532; i += 3) g.push(0x61, 0x24, 1);
        const {data} = dataOf([g]);
        const h0 = DECODED.huge, p0 = DECODED.props;
        const t = performance.now();
        const {doc} = read({paras: [{text: 'x\r'.repeat(10000),
          mark: '', prls: [hugeRef(0)]}], streams: {Data: data}});
        assert.ok(performance.now() - t < 1000);
        assert.equal(DECODED.huge - h0, g.length);
        assert.ok(DECODED.props - p0 < 10, String(DECODED.props - p0));
        assert.equal(paras(doc).length, 10000);
        assert.equal(paras(doc)[9999].pPr.jc, 'center');
      });

    it('a grpprl mixing sprmPHugePapx with other Prls is charged ' +
      'once, by its caller', () => {
      // (task 19: prlsOf charged the PrcData's Prls and the caller
      // the joined list again)
      const g = [];
      for (let i = 0; i < 100; i++) g.push(0x61, 0x24, 1);
      const {data} = dataOf([g]);
      const ctx = (work) => {
        const notes = [];
        return {fmtWork: work, note: (n) => notes.push(n), notes,
          cfb: {has: (n) => n === 'Data', get: () => data}};
      };
      const run = {grpprl: grpprl(prl(C.PFKeep, 1), hugeRef(0))};
      const rich = ctx(1000);
      const l = prlsOf(rich, run);
      assert.equal(l.length, 101);
      assert.equal(rich.fmtWork, 1000);
      assert.deepEqual(rich.notes, []);
      // (and a budget too small for it: one note, nothing joined)
      const poor = ctx(50);
      assert.equal(prlsOf(poor, run).length, 1);
      assert.equal(poor.fmtWork, -1);
      assert.equal(poor.notes.length, 1);
      assert.match(poor.notes[0], /more formatting than !Letters/);
      // (read whole, a paragraph of it keeps its PrcData's look)
      const {doc} = read({paras: [{text: 'x', prls: [prl(C.PFKeep, 1),
        hugeRef(0)]}], streams: {Data: data}});
      assert.equal(paras(doc)[0].pPr.jc, 'center');
      assert.equal(paras(doc)[0].pPr.keepLines, true);
    });

    it('PrcData read past 4 times the Data stream: one note', () => {
      // 25 paragraphs, each at another (overlapping) offset of 64 KB
      const g = [];
      for (let i = 0; i + 3 <= 65000; i += 3) g.push(0x61, 0x24, 1);
      const {data} = dataOf([g], 0);
      const big = new Uint8Array(data.length + 64);
      big.set(data, 0);
      // offsets 0, 3, 6...: each a PrcData of cb = the bytes there
      const ps = Array.from({length: 25}, (_, i) => ({text: 'p' + i,
        prls: [hugeRef(i === 0 ? 0 : 1 + 3 * i)]}));
      for (let i = 1; i < 25; i++) big.set(u16le(60000), 1 + 3 * i);
      const h0 = DECODED.huge;
      const {notes} = read({paras: ps, streams: {Data: big}});
      assert.ok(DECODED.huge - h0 <= 4 * big.length);
      assert.equal(notes.filter((n) => /more paragraph formatting in the/
        .test(n)).length, 1);
    });

    it('row marks with their own PrcData read as before', async () => {
      const taps = Array.from({length: 8}, (_, r) => [...inT,
        ...prl(C.PFTtp, 1), ...defTable([0, 500 + 10 * r, 2000],
          [tc80(), tc80({va: 2})])]);
      const {data, at} = dataOf(taps, 7);
      const ps = [];
      for (let r = 0; r < 8; r++) {
        ps.push({text: 'a' + r + '\x07b' + r + '\x07', mark: '',
          prls: [inT]}, {text: '', mark: '\x07', prls: [hugeRef(at[r])]});
      }
      const {doc, notes} = read({paras: ps, streams: {Data: data}});
      assert.deepEqual(notes, []);
      const [t] = tables(doc);
      assert.equal(t.rows.length, 8);
      t.rows.forEach((r, i) => {
        assert.deepEqual(r.cells.map((c) => c.blocks[0].text),
          ['a' + i, 'b' + i]);
        assert.equal(r.cells[0].tcPr.tcW.w, 500 + 10 * i);
        assert.equal(r.cells[1].tcPr.vAlign, 'bottom');
      });
      await roundTrips(doc, 'huge rows');
    });

    it('row marks sharing one PrcData are decoded once (fix 2)', () => {
      const dt = defTable(Array.from({length: 256}, (_, i) => i * 20),
        Array.from({length: 255}, () => tc80()));
      const {data} = dataOf([[...inT, ...prl(C.PFTtp, 1), ...dt]]);
      const w0 = AHEAD_WORK.taps;
      const t = performance.now();
      const {doc, notes} = read({paras: [{text: 'a\x07'.repeat(20000),
        mark: '', prls: [hugeRef(0)]}], streams: {Data: data}},
      {maxParagraphs: 3000000});
      assert.equal(AHEAD_WORK.taps - w0, 1);
      assert.ok(performance.now() - t < 3000);
      assert.equal(tables(doc)[0].rows.length, 20000);
      assert.ok(!notes.some((n) => /cell definitions/.test(n)));
    });

    /** n tables of one row each, every row mark its own PAPX with a
     *  TDefTable of 255 cells (no Prls shared). */
    const wide = (n) => {
      const dt = defTable(Array.from({length: 256}, (_, i) => i * 20),
        Array.from({length: 255}, () => tc80()));
      const {data, at} = dataOf(Array.from({length: n}, (_, i) => [
        ...inT, ...prl(C.PFTtp, 1), ...prl(C.PDyaBefore, u16le(i)),
        ...dt]));
      const ps = [];
      for (let i = 0; i < n; i++) {
        ps.push(cell('c' + i), {text: '', mark: '\x07',
          prls: [hugeRef(at[i])]}, plain('sep' + i));
      }
      return {paras: ps, streams: {Data: data}};
    };

    it('the look-ahead budget is the document\'s: one note (fix 2)',
      () => {
        const keep = LIMITS.defs;
        LIMITS.defs = 600;
        try {
          const w0 = AHEAD_WORK.taps;
          const {doc, notes} = read(wide(4));
          // 256 definitions a row (each table's under 600): the 4th
          // table's are past 600 in the document
          assert.equal(AHEAD_WORK.taps - w0, 3);
          assert.equal(notes.filter((n) => /more than 1,000,000 table cell/
            .test(n)).length, 1);
          const ts = tables(doc);
          assert.equal(ts.length, 4);
          assert.equal(ts[0].rows[0].cells[0].tcPr.tcW.w, 20);
          assert.equal(ts[3].rows[0].cells[0].tcPr.tcW, undefined);
        } finally {
          LIMITS.defs = keep;
        }
      });

    it('one table past the budget: its rows after it lose their ' +
      'properties', () => {
      const keep = LIMITS.defs;
      LIMITS.defs = 600;
      try {
        // one table: 5 rows, each its own PAPX of 255 cells
        const big = defTable(Array.from({length: 256}, (_, i) => i * 20));
        const {data, at} = dataOf(Array.from({length: 5}, (_, i) => [
          ...inT, ...prl(C.PFTtp, 1), ...big,
          ...prl(C.PDyaBefore, u16le(i))]));
        const ps = [];
        for (let i = 0; i < 5; i++) {
          ps.push(cell('r' + i), {text: '', mark: '\x07',
            prls: [hugeRef(at[i])]});
        }
        const {doc, notes} = read({paras: [...ps, plain('end')],
          streams: {Data: data}});
        assert.equal(notes.filter((n) => /more than 1,000,000 table cell/
          .test(n)).length, 1);
        const [t] = tables(doc);
        assert.equal(t.rows.length, 5);
        assert.equal(t.rows[4].cells[0].tcPr.tcW, undefined);
      } finally {
        LIMITS.defs = keep;
      }
    });

    it('sprmPIlfo 0x07FF (Word 6 numbering) names no list', () => {
      const anld = prl(C.PAnld80, new Array(84).fill(0));
      const {doc, notes} = read({paras: [{text: 'w6', prls: [anld,
        prl(C.PIlfo, i16le(0x07FF))]}]});
      assert.equal(paras(doc)[0].pPr.numPr, undefined);
      assert.ok(!notes.some((n) => /names a list/.test(n)));
      assert.ok(notes.some((n) => /Word 6 numbering/.test(n)));
    });
  });

// ---------------------------------------------------------------------
// The real files (the uncommitted corpus; skipped when absent)
const HERE = path.dirname(new URL(import.meta.url).pathname);
function find(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}
const FILES = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].flatMap((d) =>
  find(path.join(HERE, d), '.doc')).sort();
const KEYS = ['tables', 'rows', 'cells', 'nested', 'listParas',
  'bullets'];

/** Tables, rows, cells (those kept whole as w:tbl too), nested
 *  tables, list paragraphs and bullets of a Doc. */
function shapeStats(doc) {
  const L = labels(doc);
  const st = Object.fromEntries(KEYS.map((k) => [k, 0]));
  const local = (n) => String(n.name || '').split(':').pop();
  const raw = (n, d) => {
    if (!n || !n.children) return;
    const l = local(n);
    if (l === 'tbl') {
      st.tables++;
      if (d) st.nested++;
    }
    if (l === 'tr') st.rows++;
    if (l === 'tc') st.cells++;
    for (const c of n.children) raw(c, l === 'tc' ? d + 1 : d);
  };
  const walk = (bs, d) => {
    for (const b of bs) {
      if (b.type === 'tbl') {
        st.tables++;
        if (d) st.nested++;
        st.rows += b.rows.length;
        for (const r of b.rows) {
          for (const c of r.cells) {
            st.cells++;
            walk(c.blocks, d + 1);
          }
        }
      } else if (b.type === 'opaque') raw(b.node, d);
      else if (b.type === 'p' && L.get(b.id)) {
        st.listParas++;
        if (L.get(b.id).bullet) st.bullets++;
      }
    }
  };
  for (const sec of doc.sections) walk(sec.blocks, 0);
  return st;
}

describe('.doc corpus: tables and lists', {skip: FILES.length ? false
  : 'no .doc corpus (optional, git-ignored: tools/moreapps-corpus.mjs)'},
() => {
  it('every .doc reads or is refused with an ImportError in 5 s', () => {
    const counts = {};
    for (const f of FILES) {
      const t = performance.now();
      let got = 'ok';
      try {
        readDoc(new Uint8Array(fs.readFileSync(f)));
      } catch (e) {
        assert.equal(e.name, 'ImportError', f + ': ' + e.stack);
        got = e.code;
      }
      assert.ok(performance.now() - t < 5000, f);
      counts[got] = (counts[got] || 0) + 1;
    }
    console.log('# doc corpus (tables): ' + JSON.stringify(counts));
  });

  it('tables and lists against the .docx twins', async () => {
    const docx = find(CORPUS, '.docx');
    const conv = path.join(CORPUS, 'converted', 'doc');
    const pairs = [];
    for (const f of find(conv, '.doc')) {
      const x = path.join(CORPUS, path.relative(conv, f)
        .replace(/\.doc$/i, '.docx'));
      if (fs.existsSync(x)) pairs.push([f, x, 'LibreOffice']);
    }
    for (const f of FILES.filter((p) => p.includes('doc-from-word'))) {
      const own = f.replace(/\.doc$/i, '.docx');
      const base = path.basename(own);
      const x = fs.existsSync(own) ? own
        : docx.find((p) => path.basename(p) === base);
      if (x) pairs.push([f, x, 'Word']);
    }
    const by = {};
    for (const [f, x, who] of pairs) {
      let a, b;
      try {
        a = shapeStats(readDoc(new Uint8Array(fs.readFileSync(f))).doc);
      } catch (e) {
        if (e.name !== 'ImportError') throw e;
        continue;
      }
      try {
        b = shapeStats(await readDocx(new Uint8Array(
          fs.readFileSync(x))));
      } catch (e) {
        continue;     // (a twin the .docx reader refuses)
      }
      const t = by[who] ||= {n: 0, same: 0, ...Object.fromEntries(
        KEYS.map((k) => [k, [0, 0]]))};
      t.n++;
      if (KEYS.every((k) => a[k] === b[k])) t.same++;
      for (const k of KEYS) {
        t[k][0] += a[k];
        t[k][1] += b[k];
      }
    }
    for (const [who, t] of Object.entries(by)) {
      console.log(`# doc tables and lists (${who}): ${t.n} compared, ` +
        `${t.same} the same, ` + KEYS.map((k) => `${k} ` +
        `${t[k][0]}/${t[k][1]}`).join(', '));
      assert.ok(t.same / t.n > 0.95, who);
    }
    assert.ok(Object.keys(by).length > 0);
  });
});
