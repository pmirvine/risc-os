// The round-trip check of one real-world .docx file, shared by
// corpus.test.mjs and tables-corpus.test.mjs: readDocx(bytes, opts)
// (tables typed, the default) must give a model whose blocks pass
// checkBlock; write -> read must give the same model (expectedBack);
// the second generation must be byte-stable; unparsed parts must come
// out byte-identical; the package must gain no lint error; the main
// part must parse, and the property elements the writer BUILDS must
// list their children in the order Order.sortChildren gives.
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {sortChildren} from '../../tools/moreapps/!Word/Order';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {assertSameDoc, entries, xmlEntries, sameBytes, expectedBack}
  from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
export const write = (doc) => writeDocx(doc, {date: DATE});

const isEl = (c) => typeof c === 'object' && c.name !== undefined;
const kids = (n, name) => n.children.filter((c) => isEl(c) &&
  (name === undefined || c.name === name));
const local = (n) => n.slice(n.indexOf(':') + 1);

/** Whether block b is a table: typed, or an Opaque w:tbl. */
export const isTable = (b) => b.type === 'tbl' ||
  (b.type === 'opaque' && local(b.node.name) === 'tbl');

/** The top-level tables of doc (typed or Opaque) in body order. */
export const tablesOf = (doc) => doc.sections.flatMap((s) =>
  s.blocks.filter(isTable));

function checkOrder(prop, what, path) {
  const want = sortChildren(prop.name, prop.children);
  prop.children.forEach((c, i) => assert.ok(c === want[i],
    `${what}: children of ${path} ${prop.name} are out of order at ` +
    `${i} (${isEl(c) ? c.name : 'text'}, want ` +
    `${isEl(want[i]) ? want[i].name : 'text'})`));
  for (const n of ['w:rPr', 'w:sectPr']) {
    for (const k of kids(prop, n)) checkOrder(k, what, path + '/' + prop.name);
  }
}

/** A written w:p's pPr and runs' rPr; the number checked. */
function checkPara(c, what, path) {
  let n = 0;
  for (const pPr of kids(c, 'w:pPr')) { checkOrder(pPr, what, path); n++; }
  for (const r of kids(c, 'w:r')) {
    for (const rPr of kids(r, 'w:rPr')) {
      checkOrder(rPr, what, path + '/r');
      n++;
    }
  }
  return n;
}

/**
 * A written typed table `node` (of model table t): tblPr, trPr, tcPr
 * orders, the cell paragraphs the writer built, nested typed tables.
 * Opaque cell blocks are written verbatim and are not looked at.
 */
function checkTable(node, t, what, path) {
  let n = 0;
  const stack = [[node, t, path]];
  while (stack.length) {
    const [tn, tm, at] = stack.pop();
    for (const p of kids(tn, 'w:tblPr')) { checkOrder(p, what, at); n++; }
    kids(tn, 'w:tr').forEach((tr, r) => {
      for (const p of kids(tr, 'w:trPr')) {
        checkOrder(p, what, at + '/tr');
        n++;
      }
      kids(tr, 'w:tc').forEach((tc, c) => {
        for (const p of kids(tc, 'w:tcPr')) {
          checkOrder(p, what, at + '/tc');
          n++;
        }
        const blocks = kids(tc).filter((x) => x.name !== 'w:tcPr');
        const model = tm.rows[r].cells[c].blocks;
        assert.equal(blocks.length, model.length, `${what}: ${at} ` +
          `row ${r} cell ${c}: blocks written`);
        blocks.forEach((b, j) => {
          const where = `${at}/${r},${c},${j}`;
          if (model[j].type === 'p') n += checkPara(b, what, where);
          else if (model[j].type === 'tbl') stack.push([b, model[j], where]);
        });
      });
    });
  }
  return n;
}

/**
 * The property elements the writer BUILDS (the body's own
 * paragraphs, their runs, the sectPr; typed tables of `doc`, the
 * model written) must be in schema order. Opaque nodes are written
 * verbatim and are not looked at. Returns the number checked.
 */
export function checkWrittenOrder(root, what, doc) {
  const body = kids(root, 'w:body')[0];
  if (!body) return 0;
  const tables = doc ? tablesOf(doc) : [];
  let n = 0, k = 0;
  for (const c of kids(body)) {
    if (c.name === 'w:sectPr') { checkOrder(c, what, 'body'); n++; }
    if (local(c.name) === 'tbl') {
      const t = tables[k++];
      if (t && t.type === 'tbl') n += checkTable(c, t, what, 'tbl');
    }
    if (c.name === 'w:p') n += checkPara(c, what, 'p');
  }
  return n;
}

/**
 * Checks one file (see the header); returns {blocks, props, doc,
 * sourceErrors, generic}: blocks (top level), property elements
 * whose order was checked, the model read, the package errors the
 * original had and how many of them were generic content types.
 */
export async function checkFile(bytes, what, opts = {}) {
  const a = await readDocx(bytes, opts);
  let blocks = 0;
  for (const s of a.sections) {
    for (const b of s.blocks) {
      checkBlock(b);
      blocks++;
    }
  }
  const out1 = await write(a);
  const b = await readDocx(out1, opts);
  assertSameDoc(b, expectedBack(a), what);
  const out2 = await write(b);
  assert.ok(sameBytes(await write(await readDocx(out2, opts)), out2),
    what + ': second generation is stable');
  const z = await entries(out1);
  for (const [n, v] of a.parts) {
    assert.ok(sameBytes(z.get(n), v), what + ': part ' + n);
  }
  // the package: no error the original did not have (lint-package)
  const key = (p) => p.rule + ' ' + p.part + ' ' + p.detail;
  const errs = (zip) => lintPackage(zip).problems
    .filter((p) => p.level === 'error');
  const had = new Set(errs(await readZip(bytes)).map(key));
  const added = errs(z).map(key).filter((k) => !had.has(k));
  assert.deepEqual(added, [], what + ': package errors added');
  let generic = 0;
  for (const k of had) if (k.startsWith('ct-generic')) generic++;
  const x = await xmlEntries(out1);
  assert.ok(x.get(a.meta.mainPart), what + ': main part parses');
  const props = checkWrittenOrder(x.get(a.meta.mainPart).root, what, a);
  return {blocks, props, doc: a, sourceErrors: had.size, generic};
}
