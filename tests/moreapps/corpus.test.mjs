// Round trip of a corpus of real-world .docx files (see
// tools/moreapps-corpus.mjs; the files are optional and git-ignored:
// tests/moreapps/corpus/<source>/...). For each file readDocx either
// resolves (then the document must pass checkBlock, write -> read must
// give the same model, the second generation must be byte-stable,
// unparsed parts must come out byte-identical and every XML part must
// parse) or rejects with a DocxError. The latter is acceptable only for
// the files listed in corpus-expected.json (name -> DocxError code).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Word/ModelCheck';
import {sortChildren} from '../../tools/moreapps/!Word/Order';
import {NS} from '../../tools/moreapps/!Word/Wml';
import {repairs} from '../../tools/moreapps/!Word/PartTypes';
import {findPart} from '../../tools/moreapps/!Word/Rels';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {assertSameDoc, entries, xmlEntries, sameBytes}
  from './docx-compare.mjs';

const DIR = fileURLToPath(new URL('./corpus/', import.meta.url));
const EXPECTED = JSON.parse(readFileSync(
  new URL('./corpus-expected.json', import.meta.url), 'utf8'));
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});

function find(dir, out = []) {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) find(p, out);
    else if (/\.docx$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

/** The documented normalisation of a model read back (see roundtrip). */
function expected(doc) {
  const d = structuredClone(doc);
  const at = d.meta.documentRoot.attrs;
  if (!at.some(([n]) => n === 'xmlns:w')) at.push(['xmlns:w', NS.w]);
  // a known part typed application/xml gets its own type (PartTypes)
  const {defaults, overrides} = d.meta.contentTypes;
  const m = d.meta;
  const names = new Map([...d.parts.keys(), m.mainPart, m.stylesPart,
    m.numberingPart, m.settingsPart].filter(Boolean).map((n) => [n, 1]));
  const fix = repairs(m.contentTypes, [['', m.packageRels],
    [m.mainPart, d.rels]], (n) => findPart(names, n));
  for (const [n, t] of fix) {
    const o = overrides.find(([q]) => q.toLowerCase() === '/' +
      n.toLowerCase());
    if (o) o[1] = t; else overrides.push(['/' + n, t]);
  }
  // the writer types a part nothing covers (no extension, no Override)
  for (const n of d.parts.keys()) {
    const e = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1)
      .toLowerCase() : null;
    if (!overrides.some(([p]) => p.toLowerCase() === '/' +
      n.toLowerCase()) && !(e && defaults.some(([x]) =>
      x.toLowerCase() === e))) {
      overrides.push(['/' + n, 'application/octet-stream']);
    }
  }
  return d;
}

const isEl = (c) => typeof c === 'object' && c.name !== undefined;
const kids = (n, name) => n.children.filter((c) => isEl(c) &&
  (name === undefined || c.name === name));

/**
 * The property elements the writer BUILDS (those of the body's own
 * paragraphs, their runs, and the sectPr) must list their children in
 * the order Order.sortChildren gives. Tables and other opaque nodes are
 * written verbatim and are not looked at.
 */
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

function checkWrittenOrder(root, what) {
  const body = kids(root, 'w:body')[0];
  if (!body) return 0;
  let n = 0;
  for (const c of kids(body)) {
    if (c.name === 'w:sectPr') { checkOrder(c, what, 'body'); n++; }
    if (c.name !== 'w:p') continue;
    for (const pPr of kids(c, 'w:pPr')) { checkOrder(pPr, what, 'p'); n++; }
    for (const r of kids(c, 'w:r')) {
      for (const rPr of kids(r, 'w:rPr')) { checkOrder(rPr, what, 'r'); n++; }
    }
  }
  return n;
}

/** Checks one file; returns the number of blocks. */
async function check(bytes, what) {
  const a = await readDocx(bytes);
  let blocks = 0;
  for (const s of a.sections) {
    for (const b of s.blocks) {
      checkBlock(b);
      blocks++;
    }
  }
  const out1 = await write(a);
  const b = await readDocx(out1);
  assertSameDoc(b, expected(a), what);
  const out2 = await write(b);
  assert.ok(sameBytes(await write(await readDocx(out2)), out2),
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
  for (const k of had) if (k.startsWith('ct-generic')) linted.generic++;
  linted.sourceErrors += had.size;
  const x = await xmlEntries(out1);
  assert.ok(x.get(a.meta.mainPart), what + ': main part parses');
  props += checkWrittenOrder(x.get(a.meta.mainPart).root, what);
  return blocks;
}

let props = 0; // property elements whose written order was checked
const linted = {generic: 0, sourceErrors: 0};

const files = existsSync(DIR) ? find(DIR) : [];

describe('corpus of real-world .docx files', {
  skip: files.length ? false : 'tests/moreapps/corpus is missing or ' +
    'empty (optional, git-ignored: run node tools/moreapps-corpus.mjs)',
}, () => {
  it('round-trips every file, refuses only the expected ones', async () => {
    const times = [];
    const failures = [];
    let ok = 0, refused = 0, blocks = 0;
    const seen = new Set();
    for (const f of files) {
      const name = relative(DIR, f).split('\\').join('/');
      seen.add(name);
      const want = EXPECTED[name];
      const t0 = Date.now();
      try {
        const bytes = readFileSync(f);
        blocks += await check(bytes, name);
        if (want) failures.push(`${name}: expected ${want}, but it read`);
        else ok++;
      } catch (e) {
        if (e instanceof DocxError && want === e.code) refused++;
        else if (e instanceof DocxError && want) {
          failures.push(`${name}: expected ${want}, got ${e.code}`);
        } else {
          failures.push(`${name}: ${e.name} ${e.code || ''} ` +
            String(e.message).split('\n')[0].slice(0, 300));
        }
      }
      times.push([Date.now() - t0, name]);
    }
    for (const n of Object.keys(EXPECTED)) {
      if (!seen.has(n)) console.log('# note: expected-failure entry ' +
        'for a file not in the corpus: ' + n);
    }
    times.sort((p, q) => q[0] - p[0]);
    console.log(`# corpus: ${files.length} files, ${ok} ok, ${refused} ` +
      `expected-fail, ${failures.length} failures, ${blocks} blocks, ` +
      `${props} property elements in written order; package errors ` +
      `in the originals: ${linted.sourceErrors} (none added; ` +
      `${linted.generic} generic content types repaired)`);
    console.log('# slowest: ' + times.slice(0, 5)
      .map(([ms, n]) => `${n} ${ms} ms`).join('; '));
    assert.deepEqual(failures, []);
    // (a guard against hangs: the slowest file, a 15 MB styles-heavy
    // POI document, takes about 5 s with all the checks above)
    assert.ok(times[0][0] < 20000, 'slowest file under 20 s: ' + times[0]);
  });
});
