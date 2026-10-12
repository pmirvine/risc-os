// Tables round trip (Batch C1.4, the C1 form): documents read with
// typed tables (the default since C1.7) changed by ops at random nested
// paths (text edits, split / merge in a cell, insert / remove blocks
// in a cell, a restoreBlock of a table with a row duplicated with
// fresh ids), each its own undo step, then (roundtrip-lib.mjs):
// written and read back equal, no package or schema error added
// (xmllint for one seed), undo all -> the opened model and bytes.
// Documents: generated tables (nested, merged, marks, a 50x5 table
// with 1000 cell edits) and the corpus files holding a w:tbl (one in
// ten, or all with WORD_EDIT_CORPUS=1; skipped when absent).
// C7.1: the same documents again with random table COMMANDS (every
// TABLE id, Split cells, Table properties and Borders and shading
// patches (hostile ones too: RangeError is a refusal), Insert table,
// text <-> table), each its own undo step, through Typing.command as
// the desktop runs them; and the second generation of every corpus
// file with a table is byte-stable.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newPara, nextId, checkBlock}
  from '../../tools/moreapps/!Letters/Model';
import {forEachBlock, at as walkAt}
  from '../../tools/moreapps/!Letters/Walk';
import {tableOf, sib} from '../../tools/moreapps/!Letters/Path';
import {TABLE, bordersCmd} from '../../tools/moreapps/!Letters/TblCmdCols';
import {splitCellsCmd, propsCmd} from '../../tools/moreapps/!Letters/TblCmd';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {textToTableCmd, tableToTextCmd}
  from '../../tools/moreapps/!Letters/TblConvertCmd';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {rng} from './word-docs.mjs';
import {tbl, tr, tc, tblDocx, bigTable, nestedTable}
  from './tbl-fixtures.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, ALL, write,
  SKIP_CORPUS} from './roundtrip-lib.mjs';

const READ = {};
const OPS = 30;
const PIECES = ['a', ' ', 'word', 'é', '\u{1F600}', '<&>'];
const BMP = ['a', ' ', 'word', '\u00e9', '<&>'];

const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const int = (rd, n) => Math.floor(rd() * n);

/** The paths of every block in a cell, at every depth. */
function cellPaths(doc) {
  const out = [];
  forEachBlock(doc, (b, at) => void (at.length > 2 && out.push(at)));
  return out;
}

/** A fresh copy of a row: new ids, no marks, no raw ids (R17). */
function freshRow(row) {
  const fresh = (q) => {
    const x = {type: 'p', id: nextId(), text: '', runs: [], inlines: {},
      pPr: q ? q.pPr : {extra: []}, extraP: []};
    if (q && q.pStyle !== undefined) x.pStyle = q.pStyle;
    return x;
  };
  const copy = (q) => (Object.keys(q.inlines).length ? fresh(q)
    : {...q, id: nextId(), extraP: []});
  const blocks = (c) => (c.blocks.some((b) => b.type !== 'p')
    ? [fresh(null)] : c.blocks.map(copy));
  return {...row, attrs: [], lead: [], tail: [],
    cells: row.cells.map((c) => ({...c, attrs: [], lead: [],
      blocks: blocks(c)}))};
}

/** One random op at a random nested path, or null (no table). */
function randomOp(rd, doc) {
  const all = cellPaths(doc);
  if (!all.length) return null;
  const at = pick(rd, all);
  const b = walkAt(doc, at);
  const len = b.type === 'p' ? b.text.length : 0;
  const x = rd();
  if (x < 0.35) {
    const off = int(rd, len + 1);
    return {op: 'replaceText', block: at, at: off,
      del: rd() < 0.3 ? int(rd, len - off + 1) : 0,
      ins: rd() < 0.8 ? pick(rd, PIECES) : ''};
  }
  if (x < 0.5) return {op: 'splitBlock', block: at, at: int(rd, len + 1)};
  if (x < 0.6) return {op: 'mergeBlock', block: at};
  if (x < 0.72) {
    return {op: 'insertBlock', at: rd() < 0.5 ? at : sib(at, 1),
      block: newPara(pick(rd, PIECES))};
  }
  if (x < 0.82) return {op: 'removeBlock', at};
  if (x < 0.86) {
    return {op: 'setProps', block: at, pPr: {jc: pick(rd, ['center',
      'right', null])}};
  }
  const tp = tableOf(at);
  const t = walkAt(doc, tp);
  const k = int(rd, t.rows.length);
  const rows = t.rows.slice();
  rows.splice(k + 1, 0, freshRow(rows[k]));
  return {op: 'restoreBlock', block: tp, snapshot: {...t, rows}};
}

/** OPS random ops (each one undo step); refusals are counted. */
function tableEdits(d, seed) {
  const rd = rng(seed);
  const counts = {refused: 0};
  for (let k = 0; k < OPS; k++) {
    const op = randomOp(rd, d.doc);
    if (!op) break;
    try {
      d.apply(op);
      counts[op.op] = (counts[op.op] || 0) + 1;
    } catch (e) {
      if (!(e instanceof RangeError)) {
        e.message = `seed ${seed} op ${k} ${JSON.stringify(op)
          .slice(0, 200)}: ${e.message}`;
        throw e;
      }
      counts.refused++;
    }
  }
  for (const s of d.doc.sections) for (const b of s.blocks) checkBlock(b);
  return {counts};
}

/** 1000 cell edits (typing, deleting; no surrogate pairs, so that
 *  every offset is valid) in the first table. */
function cellEdits(d, seed) {
  const rd = rng(seed);
  d.maxSteps = Infinity;
  let t = -1;
  d.doc.sections[0].blocks.forEach((b, i) => {
    if (t < 0 && b.type === 'tbl') t = i;
  });
  assert.ok(t >= 0, 'a typed table');
  const tb = d.doc.sections[0].blocks[t];
  for (let k = 0; k < 1000; k++) {
    const rr = int(rd, tb.rows.length);
    const at = [0, t, rr, int(rd, tb.rows[rr].cells.length), 0];
    const q = walkAt(d.doc, at);
    const off = int(rd, q.text.length + 1);
    d.apply(rd() < 0.7
      ? {op: 'replaceText', block: at, at: off, del: 0,
        ins: pick(rd, BMP)}
      : {op: 'replaceText', block: at, at: off,
        del: Math.min(1, q.text.length - off), ins: ''});
  }
  assert.equal(d.undoDepth, 1000);
  return {counts: {edits: 1000}};
}

// ------------------------------------------------ table commands (C7.1)
const IDS = Object.keys(TABLE);
const ONE = {val: 'single', sz: 4, space: 0, color: 'auto'};

/** Hostile and plausible patches for propsCmd. */
function propsPatch(rd) {
  const x = int(rd, 8);
  const w = pick(rd, [0, 1, 1440, 31680, 31681, -1, 1e9, NaN, 1.5]);
  if (x === 0) return {tblPr: {tblW: {w, type: pick(rd, ['dxa', 'auto',
    'pct', 'nil'])}}};
  if (x === 1) return {tblPr: {jc: pick(rd, ['left', 'center', 'right',
    'both', 7, null])}};
  if (x === 2) return {rows: {trHeight: {val: w, hRule: pick(rd,
    ['atLeast', 'exact', 'auto', 'x'])}}};
  if (x === 3) return {cols: {widthTw: w}};
  if (x === 4) return {cells: {vAlign: pick(rd, ['top', 'center',
    'bottom', 'both', 3])}};
  if (x === 5) return {cells: {tcW: {w, type: 'dxa'}}};
  if (x === 6) return {bogus: 1};
  return {};
}

/** A patch for bordersCmd (the table's own sides; hostile ones too). */
function bordersPatch(rd) {
  const side = () => (rd() < 0.2 ? {val: 'nil'} : {...ONE, sz: pick(rd,
    [0, 4, 24, 96, 97, -1, NaN]), color: pick(rd, ['auto', 'FF0000',
    'zz'])});
  const o = {};
  for (const k of ['top', 'left', 'bottom', 'right', 'insideH',
    'insideV']) if (rd() < 0.5) o[k] = side();
  return {tblPr: {tblBorders: o, ...(rd() < 0.3 ? {shd: {val: 'clear',
    color: 'auto', fill: 'FFFF00'}} : {})}};
}

/** A selection in or around a table, or any paragraph. */
function anySel(doc, rd) {
  const ps = [], tbs = [];
  forEachBlock(doc, (b, at) => {
    if (b.type === 'p') ps.push({b, top: at.length === 2});
    else if (b.type === 'tbl') tbs.push(b);
  });
  if (!ps.length) return null;
  const inT = ps.filter((q) => !q.top), from = () => pick(rd,
    inT.length && rd() < 0.8 ? inT : ps).b;
  const a = from(), x = rd();
  if (x < 0.4) return S.caret({id: a.id, off: int(rd, a.text.length + 1)});
  const b = from();
  if (x < 0.9) return S.select({id: a.id, off: 0}, {id: b.id,
    off: b.text.length});
  const t = tbs.length ? pick(rd, tbs) : null;
  return t ? S.select({id: t.id, off: 0}, {id: t.id, off: 1}) : null;
}

/** A fake layout: the table's column width and row heights. */
function fakeL(doc, rd) {
  const byId = new Map();
  forEachBlock(doc, (b) => {
    if (b.type === 'tbl') {
      byId.set(b.id, {block: b, col: {w: 200 + int(rd, 600)},
        rows: b.rows.map(() => ({h: int(rd, 60)}))});
    }
  });
  return {byId};
}

/** OPS random table commands (each one undo step or none). */
function commandEdits(d, seed) {
  const rd = rng(seed);
  const t = new Typing(d);
  const counts = {refused: 0};
  for (let k = 0; k < OPS; k++) {
    const sel = anySel(d.doc, rd);
    if (!sel) break;
    const x = rd(), L = fakeL(d.doc, rd);
    let id, run;
    if (x < 0.55) {
      id = pick(rd, IDS);
      run = () => TABLE[id](d, sel, {L});
    } else if (x < 0.65) {
      id = 'split';
      const o = {cols: pick(rd, [1, 2, 3, 63, 64, 0, -1, 1.5]),
        rows: pick(rd, [1, 2, 3, 1001, 0])};
      run = () => splitCellsCmd(d, sel, o);
    } else if (x < 0.75) {
      id = 'props';
      const patch = propsPatch(rd);
      run = () => propsCmd(d, sel, patch);
    } else if (x < 0.82) {
      id = 'borders';
      const patch = bordersPatch(rd);
      run = () => bordersCmd(d, sel, patch);
    } else if (x < 0.9) {
      id = 'insert';
      const o = {cols: pick(rd, [1, 3, 63, 64, 0]),
        rows: pick(rd, [1, 2, 5, 1001]),
        widthTw: pick(rd, [undefined, 1440, 0, 40000])};
      run = () => insertTable(d, sel, o);
    } else if (x < 0.95) {
      id = 'toTable';
      const o = {sep: pick(rd, [undefined, 'tab', 'comma', ',', ';',
        'paragraph', '\u0001', 'xx'])};
      run = () => textToTableCmd(d, sel, o);
    } else {
      id = 'toText';
      const o = {sep: pick(rd, [undefined, 'tab', 'comma', 'paragraph',
        'bad'])};
      run = () => tableToTextCmd(d, sel, o);
    }
    const n0 = d.undoDepth;
    try {
      const out = t.command(run);
      const steps = d.undoDepth - n0;
      if (steps > 1) throw new Error(`${id}: ${steps} undo steps`);
      if (out || steps) counts[id] = (counts[id] || 0) + 1;
      else counts.refused++;
    } catch (e) {
      if (!(e instanceof RangeError)) {
        e.message = `seed ${seed} #${k} ${id}: ${e.message}`;
        throw e;
      }
      if (d.undoDepth !== n0) {
        throw new Error(`seed ${seed} #${k} ${id}: RangeError after a ` +
          'step');
      }
      counts.refused++;
    }
  }
  for (const s of d.doc.sections) for (const b of s.blocks) checkBlock(b);
  forEachBlock(d.doc, (b) => { if (b.type === 'tbl') gridOf(b); });
  return {counts};
}

const MARK = (n, id) => `<w:${n} w:id="${id}"` +
  (n === 'bookmarkStart' ? ` w:name="m${id}"` : '') + '/>';
const FIX = [
  ['3x3 holding a nested 2x2', () => tblDocx(p(r('before')) + tbl([
    tr([tc(p(r('a'))), tc(p(r('b'))), tc(p(r('c')))]),
    tr([tc(p(r('d'))), tc(p(r('e1')) + p(r('e2')) + tbl([
      tr([tc(p(r('n1'))), tc(p(r('n2')))]),
      tr([tc(p(r('n3'))), tc(p(r('n4')))])]) + p(r('e3'))),
    tc(p(r('f')))]),
    tr([tc(p(r('g'))), tc(p(r('h'))), tc(p(r('i')))])]) +
    p(r('after')))],
  ['merges and marks', () => tblDocx(tbl([
    tr([tc(p(r('wide')), {tcPr: '<w:gridSpan w:val="2"/>'}),
      tc(p(r('down')), {tcPr: '<w:vMerge w:val="restart"/>'})],
    {lead: MARK('bookmarkStart', 1)}),
    tr([tc(p(r('x'))), tc(p(r('y'))), tc(p(), {tcPr: '<w:vMerge/>'})],
      {tail: MARK('bookmarkEnd', 1),
        trPr: '<w:cantSplit/>'})], {tblPr: '<w:tblW w:w="0" ' +
      'w:type="auto"/>'}) + p(r('end')))],
  ['8x4 table', () => tblDocx(bigTable(8, 4) + p())],
  ['nested 4 deep', () => tblDocx(nestedTable(4) + p())],
  ['two tables, one section each side', () => tblDocx(bigTable(2, 2) +
    p(r('mid'), '<w:sectPr/>') + bigTable(3, 1) + p())],
];

const {xsd, note: xsdNote} = schema();

describe('tables round trip: generated documents', () => {
  for (const [name, make] of FIX) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          tableEdits, {xsd: k === 0 ? xsd : null, read: READ});
        assert.ok(!res.refused, 'read');
        const done = Object.entries(res.counts)
          .filter(([op]) => op !== 'refused')
          .reduce((n, [, v]) => n + v, 0);
        assert.ok(done >= 10, name + ': ops applied ' +
          JSON.stringify(res.counts));
      }
    });
  }
  for (const [name, make] of FIX) {
    it(name + ': random table commands', async () => {
      const bytes = await make();
      let done = 0;
      for (let k = 0; k < 6; k++) {
        const res = await roundTrip(bytes, name, hash(name) + 90 + k,
          commandEdits, {xsd: k === 0 ? xsd : null, read: READ});
        assert.ok(!res.refused, 'read');
        done += Object.entries(res.counts)
          .filter(([op]) => op !== 'refused')
          .reduce((n, [, v]) => n + v, 0);
      }
      assert.ok(done >= 10, name + ': commands applied ' + done);
    });
  }
  it('1000 cell edits on a 50x5 table: undo all', async () => {
    const bytes = await tblDocx(p(r('top')) + bigTable(50, 5) + p());
    const res = await roundTrip(bytes, '50x5', 7, cellEdits,
      {xsd: null, read: READ});
    assert.equal(res.counts.edits, 1000);
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

/** Whether the main part of a .docx holds a w:tbl (cheap filter). */
async function holdsTable(f) {
  try {
    const z = await readZip(readFileSync(f));
    for (const [n, b] of z) {
      if (/^word\/document\d*\.xml$/.test(n) &&
        Buffer.from(b.buffer, b.byteOffset, b.length).includes('<w:tbl'))
        return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

const files = [];
for (const f of corpusFiles()) if (await holdsTable(f)) files.push(f);

describe('tables round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${OPS} ops at nested paths in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file with a table round-trip; undo restores', () =>
    corpusRun(files, tableEdits, xsd, xsdNote, 'tables corpus',
      {read: READ}));
});

describe('tables round trip: the corpus, table commands', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it(`${OPS} table commands in ${ALL ? 'every' : 'one in ten'} corpus ` +
    'file with a table round-trip; undo restores', () =>
    corpusRun(files, commandEdits, xsd, xsdNote, 'tables corpus commands',
      {read: READ}));
  it('untouched: the second generation of every one is byte-stable',
    async () => {
      const bad = [];
      for (const f of files) {
        let a;
        try {
          a = await readDocx(readFileSync(f), READ);
        } catch (e) {
          continue;
        }
        const w1 = await write(a);
        const w2 = await write(await readDocx(w1, READ));
        if (Buffer.compare(Buffer.from(w1), Buffer.from(w2))) bad.push(f);
      }
      assert.deepEqual(bad, []);
    });
});
