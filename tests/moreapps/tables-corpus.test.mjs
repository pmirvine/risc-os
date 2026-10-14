// Tables of the real-world corpus (tests/moreapps/corpus, optional and
// git-ignored), read with typed tables (the default since C1.7),
// Batch C1.3, D14:
// (a) every file holding a body table round-trips typed (the checks
//     of corpus-check.mjs: checkBlock, write -> read the same model,
//     second generation byte-stable, unparsed parts identical, lint);
//     a sample of one file in ten (by name), every file with
//     WORD_EDIT_CORPUS=1, as roundtrip-lib;
// (b) every typed table, over EVERY corpus file: the w:tbl written
//     equals the file's after the documented normalisations only
//     (./tbl-canon.mjs canonTbl); a difference fails naming the file,
//     the table's model path and the place in it;
// (c) the reasons of the tables kept Opaque (TblRead's tableNote, at
//     every depth; not counted for the files in corpus/handoff, which
//     our generators wrote: the pin is hermetic, P5.3) equal
//     corpus-expected.json's opaqueTables (R1),
//     which names every reason (R3's and depth), 0 for those the
//     corpus has none of (stray, ns, span... : the C1 fix wave);
// (d) every Opaque table (top level, or a cell block of a typed one)
//     is written byte-identical to the original's.
// Also printed: typed / Opaque counts, the w:sdt directly in a w:tbl
// (around rows) or a w:tr (around cells), the slowest files.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx, DocxError} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {mapNamespaces} from '../../tools/moreapps/!Letters/NsMap';
import {rootScope, strictScope, scope, wName, isEl}
  from '../../tools/moreapps/!Letters/Ns';
import {forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import {REASONS} from '../../tools/moreapps/!Letters/TblRead';
import {CORPUS, ALL, hash, nameOf, SKIP_CORPUS} from './roundtrip-lib.mjs';
import {checkFile, tablesOf, isTable, write} from './corpus-check.mjs';
import {canonTbl, firstDiff} from './tbl-canon.mjs';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const PINNED = JSON.parse(readFileSync(new URL('./corpus-expected.json',
  import.meta.url), 'utf8')).opaqueTables;

function find(dir, out = []) {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    const q = join(dir, e.name);
    if (e.isDirectory()) find(q, out);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) {
      out.push(q);
    }
  }
  return out.sort();
}
const files = existsSync(CORPUS) ? find(CORPUS) : [];

/** Every reason a table is kept Opaque for (R3, and depth). */
const ALL_REASONS = [...REASONS, 'depth'];

describe('the pinned histogram names every reason', () => {
  it('R3\'s reasons and depth, each a count', () => {
    assert.deepEqual(Object.keys(PINNED).sort(),
      [...ALL_REASONS].sort());
    for (const why of ALL_REASONS) {
      assert.ok(Number.isInteger(PINNED[why]) && PINNED[why] >= 0, why);
    }
  });
});

const inside = (node, m) => node.attrs.length ? scope(m, node) : m;
const dec = new TextDecoder();

/** The main part of bytes parsed as the reader sees it: {body, map}. */
async function mainOf(bytes, doc) {
  const z = await readZip(bytes);
  const text = dec.decode(z.get(doc.meta.mainPart)).replace(/^﻿/, '');
  const root = parseXml(text).root;
  const strict = doc.meta.conformance === 'strict';
  if (strict) mapNamespaces(root, 'toTransitional');
  const m0 = rootScope(root);
  const m = strict ? strictScope(m0) : m0;
  const body = root.children.find((c) => wName(c, m) === 'body');
  return {body, map: inside(body, m)};
}

const NOT_BODY = /(^|\/)(styles|stylesWithEffects|numbering|settings|theme\d*|fontTable|webSettings)\.xml$/i;

/** Whether any XML part of the package (not NOT_BODY) holds "tbl". */
async function mayHoldTable(bytes) {
  try {
    for (const [n, b] of await readZip(bytes)) {
      if (!/\.xml$/i.test(n) || NOT_BODY.test(n)) continue;
      if (Buffer.from(b.buffer, b.byteOffset, b.length).includes('tbl')) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return true; // (readDocx decides)
  }
}

/** The body's w:tbl elements in order. */
const bodyTables = ({body, map}) => body.children.filter((c) =>
  wName(c, map) === 'tbl');

/** The element children of `node` whose WML name is `l`. */
const named = (node, m, l) => node.children.filter((c) =>
  wName(c, m) === l);

/**
 * In the w:tbl `node` (scope m), the cell block at [r, c, j, r, c,
 * j...] (each j counting the w:tc's elements after its w:tcPr):
 * {node, map}.
 */
function nodeAt(node, m, steps) {
  let n = node, mm = m;
  for (let k = 0; k < steps.length; k += 3) {
    const tm = inside(n, mm);
    const tr = named(n, tm, 'tr')[steps[k]];
    const rm = inside(tr, tm);
    const tc = named(tr, rm, 'tc')[steps[k + 1]];
    const cm = inside(tc, rm);
    n = tc.children.filter((c) => isEl(c) && wName(c, cm) !== 'tcPr')[
      steps[k + 2]];
    mm = cm;
  }
  return {node: n, map: mm};
}

/** The row / cell level w:sdt below a w:tbl (every depth). */
function sdtCount(root, m0, out) {
  const stack = [[root, m0]];
  while (stack.length) {
    const [n, m0b] = stack.pop();
    const m = inside(n, m0b);
    const l = wName(n, m0b);
    for (const c of n.children) {
      if (!isEl(c)) continue;
      const cl = wName(c, m);
      if (cl === 'sdt' && l === 'tbl') out.row++;
      if (cl === 'sdt' && l === 'tr') out.cell++;
      stack.push([c, m]);
    }
  }
}

describe('corpus tables (typed): equivalence, histogram, Opaque bytes', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it('every table writes back equal or byte-identical; the histogram ' +
    'is the pinned one', async () => {
    const failures = [], times = [];
    const hist = Object.fromEntries(ALL_REASONS.map((r) => [r, 0]));
    const n = {files: 0, sampled: 0, typed: 0, nested: 0, opaque: 0,
      nestedOpaque: 0};
    const sdt = {row: 0, cell: 0};
    for (const f of files) {
      const name = nameOf(f);
      const bytes = readFileSync(f);
      const t0 = Date.now();
      // (a quick look first: no part but styles, numbering, settings
      // or a theme mentions tbl -> no table in the body)
      if (!await mayHoldTable(bytes)) continue;
      let doc;
      const notes = [];
      try {
        doc = await readDocx(bytes, {
          tableNote: (why) => notes.push(why)});
      } catch (e) {
        if (e instanceof DocxError) continue; // (corpus.test.mjs)
        throw e;
      }
      const tops = tablesOf(doc);
      if (!tops.length) continue;
      n.files++;
      if (!name.startsWith('handoff/')) {
        for (const why of notes) hist[why] = (hist[why] || 0) + 1;
      }
      try {
        if (ALL || hash(name) % 10 === 0) {
          await checkFile(bytes, name);
          n.sampled++;
        }
        const out = await write(doc);
        const orig = await mainOf(bytes, doc);
        const wrote = await mainOf(out, doc);
        sdtCount(orig.body, orig.map, sdt);
        const ot = bodyTables(orig), wt = bodyTables(wrote);
        assert.equal(ot.length, tops.length, name + ': tables read');
        assert.equal(wt.length, tops.length, name + ': tables written');
        const k = new Map(tops.map((b, i) => [b, i]));
        forEachBlock(doc, (b, at, depth) => {
          if (!isTable(b)) return;
          const i = k.get(doc.sections[at[0]].blocks[at[1]]);
          const steps = at.slice(2);
          const want = nodeAt(ot[i], orig.map, steps);
          const got = nodeAt(wt[i], wrote.map, steps);
          const where = `${name}: table [${at}]`;
          if (b.type === 'tbl') {
            n.typed++;
            if (depth) n.nested++;
            const d = firstDiff(canonTbl(got.node, got.map),
              canonTbl(want.node, want.map));
            if (d) failures.push(`${where}: ${d}`);
          } else {
            n.opaque++;
            if (depth) n.nestedOpaque++;
            if (serialize(got.node) !== serialize(want.node)) {
              failures.push(`${where}: Opaque table not byte-identical`);
            }
          }
        });
      } catch (e) {
        failures.push(`${name}: ${e.name} ` + String(e.message)
          .split('\n').slice(0, 3).join(' | ').slice(0, 400));
      }
      times.push([Date.now() - t0, name]);
    }
    times.sort((x, y) => y[0] - x[0]);
    console.log(`# corpus tables: ${n.files} files with a body table ` +
      `(${n.sampled} round-tripped typed${ALL ? '' : ', a sample; ' +
      'WORD_EDIT_CORPUS=1 for all'}); ${n.typed} typed (${n.nested} ` +
      `nested), ${n.opaque} Opaque (${n.nestedOpaque} nested)`);
    console.log('# Opaque reasons: ' + JSON.stringify(hist));
    console.log(`# w:sdt around rows: ${sdt.row}, around cells: ` +
      sdt.cell);
    console.log('# slowest: ' + times.slice(0, 5)
      .map(([ms, x]) => `${x} ${ms} ms`).join('; '));
    for (const x of failures.slice(0, 30)) console.log('# FAIL ' + x);
    assert.deepEqual(failures, []);
    assert.deepEqual(hist, PINNED, 'the Opaque reasons (R1, R3)');
    assert.ok(!times.length || times[0][0] < 20000,
      'slowest file under 20 s: ' + times[0]);
  });
});
